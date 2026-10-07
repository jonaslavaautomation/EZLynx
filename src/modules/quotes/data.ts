import { db } from '@/lib/db';
import type { Carrier, LineOfBusiness, Property, TableMap } from '@/lib/types';
import { getAssociation } from '@/modules/accounts/association';
import { sectionOf, type AccountRisk, type QuoteInput } from './inputs';

/** Loads an account plus the drivers/vehicles/properties used to prefill rating inputs. */
export async function loadAccountRisk(accountId: string | null): Promise<AccountRisk> {
  if (!accountId) return { account: null, drivers: [], vehicles: [], properties: [] };
  const [account, drivers, vehicles, properties, association] = await Promise.all([
    db.get('accounts', accountId),
    db.list('drivers', { eq: { account_id: accountId }, order: { column: 'created_at' } }),
    db.list('vehicles', { eq: { account_id: accountId }, order: { column: 'created_at' } }),
    db.list('properties', { eq: { account_id: accountId }, order: { column: 'created_at' } }),
    getAssociation(accountId).catch(() => null),
  ]);
  return { account, drivers, vehicles, properties, association };
}

/** Quotes built in a quoting workflow reopen there (auto or home); null for quick-rater quotes. */
export function workflowPath(q: { id: string; account_id: string; line_of_business: string; input: unknown }) {
  if (!(q.input as { workflow?: unknown } | null)?.workflow) return null;
  return `/accounts/${q.account_id}/${q.line_of_business === 'Homeowners' ? 'home-quote' : 'auto-quote'}/${q.id}`;
}

/** Appointed carriers that write `line`. */
export const carriersForLine = (line: LineOfBusiness, appointed: Carrier[]) => appointed.filter((c) => c.lines.includes(line));

/**
 * Writes the wizard's auto drivers/vehicles (or home property) back to the account.
 * Existing rows are updated, new rows inserted; rows removed in the wizard are left untouched.
 * Returns the input with the new row ids filled in, plus a count of rows written.
 */
/** Integer columns (Postgres `int`) reject fractions and NaN; send a whole number or null. */
const int = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : null);
const num = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? n : null);

/**
 * Updates the account row the wizard was prefilled from, or inserts a new one. If that row has since
 * been deleted (or belongs to another account), a new row is inserted instead of failing the save.
 */
async function upsert<K extends 'drivers' | 'vehicles' | 'properties'>(table: K, id: string | null, accountId: string, values: Partial<TableMap[K]>) {
  if (id && (await db.get(table, id))?.account_id === accountId) return db.update(table, id, values);
  return db.insert(table, { account_id: accountId, ...values } as Partial<TableMap[K]>);
}

export async function saveRiskToAccount(accountId: string, line: LineOfBusiness, input: QuoteInput): Promise<{ input: QuoteInput; written: number }> {
  const key = sectionOf(line);
  let written = 0;
  if (key === 'auto' && input.auto) {
    const drivers = [];
    for (const d of input.auto.drivers) {
      const values = {
        first_name: d.first_name.trim(), last_name: d.last_name.trim(), dob: d.dob || null, gender: d.gender || null, marital_status: d.marital_status || null,
        relationship: d.relationship || null, license_number: d.license_number || null, license_state: d.license_state || null,
        violations: int(d.violations) ?? 0, accidents: int(d.accidents) ?? 0,
      };
      const row = await upsert('drivers', d.id, accountId, values);
      drivers.push({ ...d, id: row.id });
      written++;
    }
    const vehicles = [];
    for (const v of input.auto.vehicles) {
      const values = {
        year: int(v.year) ?? new Date().getFullYear(), make: v.make.trim(), model: v.model.trim(), vin: (v.vin ?? '').trim().toUpperCase() || null, usage: v.usage || null,
        annual_miles: int(v.annual_miles), ownership: v.ownership || null, garaging_zip: v.garaging_zip || null,
      };
      const row = await upsert('vehicles', v.id, accountId, values);
      vehicles.push({ ...v, id: row.id });
      written++;
    }
    return { input: { ...input, auto: { ...input.auto, drivers, vehicles } }, written };
  }
  if (key === 'home' && input.home) {
    const h = input.home;
    const values = {
      address: h.address.trim(), city: h.city || null, state: h.state || null, zip: h.zip || null, year_built: int(h.year_built), square_feet: int(h.square_feet),
      construction: h.construction || null, roof_type: h.roof_type || null, roof_year: int(h.roof_year), protection_class: int(h.protection_class), dwelling_value: num(h.dwelling),
    };
    const row = await upsert('properties', h.property_id, accountId, values);
    return { input: { ...input, home: { ...h, property_id: row.id } }, written: 1 };
  }
  return { input, written };
}

const norm = (x: string | null | undefined) => (x ?? '').trim().toLowerCase();

/**
 * Autosave for the auto quoting workflow: writes every named driver and every vehicle with year, make and model to
 * the insured's Drivers / Vehicles, so they are kept on the record even if the quote is never submitted.
 * Rows without an id are matched to the insured's existing rows (driver name; vehicle VIN, or year + make + model)
 * before inserting, so reopening a quote never duplicates them. Returns workflow key → row id.
 */
export async function syncAutoRisk(accountId: string, auto: NonNullable<QuoteInput['auto']>, isComplete: { vehicle: (key: string) => boolean }) {
  const drivers = auto.drivers.filter((d) => d.first_name.trim() && d.last_name.trim());
  const vehicles = auto.vehicles.filter((v) => isComplete.vehicle(v.key) && v.make.trim() && v.model.trim());
  if (!drivers.length && !vehicles.length) return new Map<string, string>();
  const [rowsD, rowsV] = await Promise.all([
    drivers.some((d) => !d.id) ? db.list('drivers', { eq: { account_id: accountId } }) : Promise.resolve([]),
    vehicles.some((v) => !v.id) ? db.list('vehicles', { eq: { account_id: accountId } }) : Promise.resolve([]),
  ]);
  const withIds = {
    ...auto,
    drivers: drivers.map((d) => ({ ...d, id: d.id ?? rowsD.find((r) => norm(r.first_name) === norm(d.first_name) && norm(r.last_name) === norm(d.last_name))?.id ?? null })),
    vehicles: vehicles.map((v) => ({
      ...v,
      id: v.id ?? rowsV.find((r) => (v.vin && norm(r.vin) === norm(v.vin)) || (Number(r.year) === v.year && norm(r.make) === norm(v.make) && norm(r.model) === norm(v.model)))?.id ?? null,
    })),
  };
  const saved = await saveRiskToAccount(accountId, 'Personal Auto', { v: 1, carriers: [], auto: withIds });
  return new Map([...(saved.input.auto?.drivers ?? []), ...(saved.input.auto?.vehicles ?? [])].filter((r) => r.id).map((r) => [r.key, r.id as string]));
}

/**
 * Autosave for the home quoting workflow: writes the dwelling to the insured's Properties once it has an address.
 * Updates `propertyId` when given, otherwise the insured's property at the same address, otherwise inserts one.
 */
export async function syncHomeRisk(accountId: string, propertyId: string | null, values: Partial<Property> & { address: string }) {
  let id = propertyId;
  if (!id) {
    const rows = await db.list('properties', { eq: { account_id: accountId } });
    id = rows.find((r) => norm(r.address) === norm(values.address))?.id ?? null;
  }
  const row = await upsert('properties', id, accountId, values);
  return row.id;
}
