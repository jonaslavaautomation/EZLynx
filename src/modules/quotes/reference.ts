/*
 * Reference lists used by the quoting workflows: prior insurers (for "Prior Carrier"), dog breeds (with the
 * breeds home carriers commonly restrict) and NHTSA model lookups for the vehicle Model field.
 */

/** Common US personal-lines insurers, as agents pick them for "Prior Carrier". */
export const PRIOR_INSURERS = [
  'Allstate', 'American Family', 'American Modern', 'Amica', 'Auto-Owners', 'Bristol West', 'Chubb', 'Cincinnati Insurance', 'Citizens Property Insurance (FL)',
  'Clearcover', 'COUNTRY Financial', 'Dairyland', 'Direct Auto', 'Elephant', 'Erie Insurance', 'Farm Bureau', 'Farmers', 'Foremost', 'GEICO', 'Grange',
  'Hippo', 'Homesite', 'Infinity', 'Kemper', 'Lemonade', 'Liberty Mutual', 'Mercury', 'National General', 'Nationwide', 'Openly', 'Plymouth Rock',
  'Progressive', 'Root', 'Safeco', 'Shelter', 'State Farm', 'Stillwater', 'Texas FAIR Plan', 'The General', 'The Hanover', 'The Hartford', 'Travelers',
  'Universal Property', 'USAA', 'Westfield',
];

/** Breeds many home carriers restrict or decline (bite-liability exposure). */
export const RESTRICTED_BREEDS = ['Akita', 'Chow Chow', 'Doberman Pinscher', 'German Shepherd', 'Pit Bull / Staffordshire Terrier', 'Presa Canario', 'Rottweiler', 'Wolf hybrid'];

export const DOG_BREEDS = [
  'Beagle', 'Border Collie', 'Boxer', 'Bulldog', 'Chihuahua', 'Dachshund', 'Golden Retriever', 'Great Dane', 'Labrador Retriever', 'Poodle', 'Shih Tzu',
  'Siberian Husky', 'Yorkshire Terrier', 'Mixed breed', 'Other', ...RESTRICTED_BREEDS,
].sort((a, b) => a.localeCompare(b));

// ── NHTSA vPIC model lookup (cached per make + year) ──

const modelCache = new Map<string, Promise<string[]>>();

/** Model names NHTSA lists for a make and model year; empty when offline or unknown. */
export function vehicleModels(make: string, year: string): Promise<string[]> {
  if (!make || !/^\d{4}$/.test(year)) return Promise.resolve([]);
  const key = `${make.toLowerCase()}|${year}`;
  let p = modelCache.get(key);
  if (!p) {
    p = fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/${encodeURIComponent(make)}/modelyear/${year}?format=json`)
      .then((r) => (r.ok ? r.json() : { Results: [] }))
      .then((j: { Results?: { Model_Name?: string }[] }) => [...new Set((j.Results ?? []).map((x) => (x.Model_Name ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)))
      .catch(() => { modelCache.delete(key); return []; });
    modelCache.set(key, p);
  }
  return p;
}
