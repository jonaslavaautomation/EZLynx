/*
 * Address help for applicant forms, using free public services that allow browser calls:
 *   - ZIP → city / state / coordinates: Zippopotam.us
 *   - coordinates → county: FCC Census Area API
 *   - full street address → standardized address + coordinates: OpenStreetMap Nominatim (max ~1 request/second;
 *     we only call it when the user leaves the address fields, and cache every answer)
 * Every lookup fails soft: on any error the form simply keeps what the user typed.
 */

export type ZipInfo = { cities: string[]; city: string; state: string; county: string; lat: number; lon: number };
export type VerifiedAddress = { street: string; city: string; state: string; zip: string; county: string; lat: number; lon: number };

const zipCache = new Map<string, Promise<ZipInfo | null>>();
const verifyCache = new Map<string, Promise<VerifiedAddress | null>>();

async function getJson<T>(url: string, ms = 8000): Promise<T | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } });
    return res.ok ? ((await res.json()) as T) : null;
  } catch { return null; } finally { clearTimeout(t); }
}

const stripCounty = (s: string) => s.replace(/\s+(County|Parish|Borough|Census Area|Municipality)$/i, '').trim();

/** County name for a point (e.g. "Williamson"). */
export async function countyAt(lat: number, lon: number) {
  const r = await getJson<{ results?: { county_name?: string }[] }>(`https://geo.fcc.gov/api/census/area?lat=${lat}&lon=${lon}&format=json`);
  return stripCounty(r?.results?.[0]?.county_name ?? '');
}

/** City, state and county for a 5-digit US ZIP, or null when unknown. */
export function lookupZip(zip: string): Promise<ZipInfo | null> {
  if (!/^\d{5}$/.test(zip)) return Promise.resolve(null);
  if (!zipCache.has(zip)) {
    zipCache.set(zip, (async () => {
      const r = await getJson<{ places?: { 'place name': string; 'state abbreviation': string; latitude: string; longitude: string }[] }>(`https://api.zippopotam.us/us/${zip}`);
      const places = r?.places ?? [];
      if (!places.length) return null;
      const lat = Number(places[0].latitude), lon = Number(places[0].longitude);
      return { cities: places.map((p) => p['place name']), city: places[0]['place name'], state: places[0]['state abbreviation'], county: await countyAt(lat, lon), lat, lon };
    })());
  }
  return zipCache.get(zip)!;
}

// USPS Publication 28 street suffix and direction abbreviations (the common ones).
const SUFFIX: Record<string, string> = {
  avenue: 'Ave', street: 'St', drive: 'Dr', road: 'Rd', lane: 'Ln', boulevard: 'Blvd', court: 'Ct', circle: 'Cir', place: 'Pl', parkway: 'Pkwy',
  highway: 'Hwy', terrace: 'Ter', trail: 'Trl', way: 'Way', square: 'Sq', loop: 'Loop', crossing: 'Xing', point: 'Pt', ridge: 'Rdg', expressway: 'Expy',
  freeway: 'Fwy', cove: 'Cv', creek: 'Crk', heights: 'Hts', hollow: 'Holw', pike: 'Pike', run: 'Run', path: 'Path', alley: 'Aly', bend: 'Bnd',
};
const DIRECTION: Record<string, string> = { north: 'N', south: 'S', east: 'E', west: 'W', northeast: 'NE', northwest: 'NW', southeast: 'SE', southwest: 'SW' };

/** "1600" + "Pennsylvania Avenue Northwest" → "1600 Pennsylvania Ave NW". */
export function standardizeStreet(house: string, road: string) {
  const words = road.split(/\s+/);
  const out = words.map((w, i) => {
    const k = w.toLowerCase();
    if (DIRECTION[k] && (i === 0 || i === words.length - 1)) return DIRECTION[k];
    if (SUFFIX[k] && i >= words.length - 2) return SUFFIX[k];
    return w;
  });
  return `${house} ${out.join(' ')}`.trim();
}

/** Canonical comparison form, so "4827 Bluebonnet Ridge Drive" equals "4827 bluebonnet ridge dr". */
export const addressKey = (street: string) => {
  const parts = street.toLowerCase().replace(/[.,#]/g, ' ').split(/\s+/).filter(Boolean);
  return parts.map((w) => (SUFFIX[w] ?? DIRECTION[w] ?? w).toLowerCase()).join(' ');
};

/** A matching real address in standard form, or null when it can't be confirmed. */
export function verifyAddress(a: { street: string; city: string; state: string; zip: string }): Promise<VerifiedAddress | null> {
  const key = [a.street, a.city, a.state, a.zip].map((s) => s.trim().toLowerCase()).join('|');
  if (!verifyCache.has(key)) {
    verifyCache.set(key, (async () => {
      const qs = new URLSearchParams({ street: a.street, city: a.city, state: a.state, postalcode: a.zip, countrycodes: 'us', format: 'jsonv2', addressdetails: '1', limit: '1' });
      const r = await getJson<{ lat: string; lon: string; address?: Record<string, string> }[]>(`https://nominatim.openstreetmap.org/search?${qs}`);
      const hit = r?.[0];
      const ad = hit?.address;
      // Only a match on the house number and street counts as verified.
      if (!hit || !ad?.house_number || !ad.road) return null;
      const lat = Number(hit.lat), lon = Number(hit.lon);
      const city = ad.city || ad.town || ad.village || ad.hamlet || ad.suburb || a.city;
      const state = (ad['ISO3166-2-lvl4'] ?? '').replace(/^US-/, '') || a.state;
      const zip = (ad.postcode ?? '').slice(0, 5) || a.zip;
      const county = stripCounty(ad.county ?? '') || await countyAt(lat, lon);
      return { street: standardizeStreet(ad.house_number, ad.road), city, state, zip, county, lat, lon };
    })());
  }
  return verifyCache.get(key)!;
}
