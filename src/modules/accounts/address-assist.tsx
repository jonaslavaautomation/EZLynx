import { AlertTriangle, CheckCircle2, Loader2, MapPin } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { addressKey, lookupZip, verifyAddress } from '@/lib/address';

export type AssistAddress = { street: string; city: string; state: string; zip: string; county: string };
type Status =
  | { kind: 'idle' } | { kind: 'checking' } | { kind: 'zip'; zip: string } | { kind: 'zip-unknown'; zip: string }
  | { kind: 'verified' } | { kind: 'updated'; before: AssistAddress } | { kind: 'unverified' } | { kind: 'kept' };

const fullKey = (a: AssistAddress) => [addressKey(a.street), a.city.trim().toLowerCase(), a.state, a.zip].join('|');
const complete = (a: AssistAddress) => !!(a.street.trim() && a.city.trim() && a.state && /^\d{5}$/.test(a.zip));

/**
 * Map + address help for one address block (the inputs live in the parent, inside an element with
 * data-addr-block={blockId}). A 5-digit ZIP fills city, state and county; when focus leaves the block with a full
 * address, the address is checked and, if it matches a real one, rewritten in standard postal form (with Undo).
 */
export function AddressAssistMap({ blockId, addr, onPatch, height = 260 }: { blockId: string; addr: AssistAddress; onPatch: (p: Partial<AssistAddress>) => void; height?: number }) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [pin, setPin] = useState<{ lat: number; lon: number; key: string } | null>(null);
  const [mapQ, setMapQ] = useState(() => mapText(addr));
  const cur = useRef(addr); cur.current = addr;
  const patch = useRef(onPatch); patch.current = onPatch;
  const lastZip = useRef(addr.zip); // an address loaded for editing isn't re-filled from its ZIP
  const settled = useRef<string | null>(complete(addr) ? fullKey(addr) : null); // addresses already checked (or kept by Undo)

  // ZIP → city / state / county
  useEffect(() => {
    const zip = addr.zip;
    if (!/^\d{5}$/.test(zip) || zip === lastZip.current) return;
    lastZip.current = zip;
    let live = true;
    void lookupZip(zip).then((info) => {
      if (!live || cur.current.zip !== zip) return;
      if (!info) { setStatus({ kind: 'zip-unknown', zip }); return; }
      const a = cur.current;
      const city = info.cities.some((c) => c.toLowerCase() === a.city.trim().toLowerCase()) ? a.city : info.city;
      patch.current({ city, state: info.state, ...(info.county ? { county: info.county } : {}) });
      setStatus({ kind: 'zip', zip });
    });
    return () => { live = false; };
  }, [addr.zip]);

  // Map follows the address once typing pauses (no reload on every keystroke).
  useEffect(() => {
    const t = setTimeout(() => setMapQ(mapText(cur.current)), 800);
    return () => clearTimeout(t);
  }, [addr.street, addr.city, addr.state, addr.zip]);

  // Verify when focus leaves the address block.
  useEffect(() => {
    const onOut = (e: FocusEvent) => {
      const block = (e.target as Element | null)?.closest?.(`[data-addr-block="${blockId}"]`);
      if (!block) return;
      const to = e.relatedTarget as Node | null;
      if (to && block.contains(to)) return;
      // Let a ZIP fill land first.
      setTimeout(() => void check(), 350);
    };
    const check = async () => {
      const a = cur.current;
      if (!complete(a)) return;
      const key = fullKey(a);
      if (settled.current === key) return;
      settled.current = key;
      setStatus({ kind: 'checking' });
      const v = await verifyAddress(a);
      if (fullKey(cur.current) !== key) return; // edited while checking
      setMapQ(mapText(cur.current)); // show the checked address right away
      if (!v) { setStatus({ kind: 'unverified' }); setPin(null); return; }
      const next: AssistAddress = { street: v.street, city: v.city, state: v.state, zip: v.zip, county: v.county || a.county };
      setPin({ lat: v.lat, lon: v.lon, key: fullKey(next) });
      const changed = fullKey(next) !== key || (!!next.county && next.county !== a.county) || next.street !== a.street.trim();
      settled.current = fullKey(next);
      lastZip.current = next.zip;
      if (changed) { patch.current(next); setStatus({ kind: 'updated', before: a }); } else setStatus({ kind: 'verified' });
    };
    document.addEventListener('focusout', onOut);
    return () => document.removeEventListener('focusout', onOut);
  }, [blockId]);

  const undo = () => {
    if (status.kind !== 'updated') return;
    const b = status.before;
    settled.current = fullKey(b);
    lastZip.current = b.zip;
    setPin(null);
    patch.current(b);
    setStatus({ kind: 'kept' });
  };

  const usePin = pin && pin.key === fullKey(addr);
  const q = usePin ? `${pin.lat},${pin.lon}` : mapQ || 'United States';
  const zoom = usePin ? 17 : mapQ ? 15 : 4;
  return (
    <div className="h-full flex flex-col" data-testid={`address-assist-${blockId}`}>
      <div className="flex-1 rounded overflow-hidden border border-ink-100 bg-ink-50" style={{ minHeight: height }}>
        <iframe title={mapQ ? `Map of ${mapQ}` : 'Map of the United States'} className="w-full h-full border-0" style={{ minHeight: height }} loading="lazy" referrerPolicy="no-referrer-when-downgrade"
          src={`https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=${zoom}&output=embed`} data-map-query={q} />
      </div>
      <div className="min-h-[22px] mt-1.5 text-[12px]" aria-live="polite" data-testid="address-status">
        {status.kind === 'checking' && <span className="inline-flex items-center gap-1.5 text-ink-500"><Loader2 size={13} className="animate-spin" /> Checking address…</span>}
        {status.kind === 'zip' && <span className="inline-flex items-center gap-1.5 text-ink-600"><MapPin size={13} className="text-brand-600" /> City, state and county filled from ZIP {status.zip}.</span>}
        {status.kind === 'zip-unknown' && <span className="inline-flex items-center gap-1.5 text-amber-700"><AlertTriangle size={13} /> ZIP {status.zip} wasn&rsquo;t found. Check the postal code.</span>}
        {status.kind === 'verified' && <span className="inline-flex items-center gap-1.5 text-emerald-700"><CheckCircle2 size={13} /> Address verified.</span>}
        {status.kind === 'updated' && <span className="inline-flex flex-wrap items-center gap-1.5 text-emerald-700"><CheckCircle2 size={13} /> Address verified and updated to the standard format. <button type="button" onClick={undo} className="font-semibold text-brand-700 hover:underline">Undo</button></span>}
        {status.kind === 'unverified' && <span className="inline-flex items-center gap-1.5 text-amber-700"><AlertTriangle size={13} /> Couldn&rsquo;t verify this address. Check the street, city and ZIP; you can still save it.</span>}
        {status.kind === 'kept' && <span className="text-ink-500">Kept the address as you typed it.</span>}
      </div>
    </div>
  );
}

function mapText(a: AssistAddress) {
  if (a.street.trim() && a.city.trim() && a.state) return `${a.street}, ${a.city}, ${a.state} ${a.zip}`.trim();
  if (a.city.trim() && a.state) return `${a.city}, ${a.state}`;
  if (/^\d{5}$/.test(a.zip)) return a.zip;
  return '';
}
