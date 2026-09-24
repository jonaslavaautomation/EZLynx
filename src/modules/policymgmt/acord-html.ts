import { accountName, age, fmtDate, fmtMoney, fmtPhone } from '@/lib/format';
import type { Account, AgencySettings, Carrier, Driver, LineOfBusiness, Policy, Property, Vehicle } from '@/lib/types';
import { COMMERCIAL_LINES, PERSONAL_LINES } from '@/lib/types';
import { esc } from './shared';

export type AcordSection = 'auto' | 'property' | 'liability' | 'wc' | 'business';

export type AcordForm = {
  code: string;
  title: string;
  purpose: string;
  lines: LineOfBusiness[];
  category: 'Application' | 'Proof of Insurance';
  sections: AcordSection[];
  /** Certificates/evidence need an existing policy and a certificate holder. */
  certificate?: boolean;
};

const PROPERTY_LINES: LineOfBusiness[] = ['Homeowners', 'Condo', 'Dwelling Fire', 'Renters', 'Flood', 'Commercial Property', 'BOP'];

export const ACORD_FORMS: AcordForm[] = [
  { code: '25', title: 'Certificate of Liability Insurance', purpose: 'Evidence of liability coverage for a certificate holder (landlord, client, lender).', lines: ['General Liability', 'BOP', 'Commercial Auto', 'Workers Comp', 'Umbrella'], category: 'Proof of Insurance', sections: ['liability', 'business'], certificate: true },
  { code: '27', title: 'Evidence of Property Insurance', purpose: 'Evidence of property coverage for a mortgagee or loss payee.', lines: PROPERTY_LINES, category: 'Proof of Insurance', sections: ['property'], certificate: true },
  { code: '80', title: 'Homeowner Application', purpose: 'Personal residence application: dwelling, occupancy and loss history.', lines: ['Homeowners', 'Condo', 'Renters', 'Dwelling Fire'], category: 'Application', sections: ['property'] },
  { code: '90', title: 'Personal Auto Application', purpose: 'Drivers, vehicles, coverage selections and prior insurance.', lines: ['Personal Auto', 'Motorcycle'], category: 'Application', sections: ['auto'] },
  { code: '125', title: 'Commercial Insurance Application', purpose: 'Applicant information and lines requested; accompanies the line sections.', lines: COMMERCIAL_LINES, category: 'Application', sections: ['business'] },
  { code: '126', title: 'General Liability Section', purpose: 'Commercial general liability limits, hazards and classifications.', lines: ['General Liability', 'BOP'], category: 'Application', sections: ['business', 'liability'] },
  { code: '127', title: 'Business Auto Section', purpose: 'Commercial drivers and vehicles schedule.', lines: ['Commercial Auto'], category: 'Application', sections: ['business', 'auto'] },
  { code: '130', title: 'Workers Compensation Application', purpose: 'Employer information, states and payroll classifications.', lines: ['Workers Comp'], category: 'Application', sections: ['business', 'wc'] },
  { code: '140', title: 'Property Section', purpose: 'Commercial property locations, construction and values.', lines: ['Commercial Property', 'BOP'], category: 'Application', sections: ['business', 'property'] },
];

export const isPersonalForm = (f: AcordForm) => f.lines.every((l) => PERSONAL_LINES.includes(l));

const STYLE = `
*{box-sizing:border-box}body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#231f1f;margin:0;background:#f7f3f3;font-size:12.5px}
.page{max-width:860px;margin:24px auto;background:#fff;padding:36px;border:1px solid #e8e0e0}
.bar{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;border-bottom:3px solid #dc2626;padding-bottom:12px;margin-bottom:14px}
.agency{font-size:17px;font-weight:700;color:#b91c1c}.muted{color:#7d6f6f;font-size:11.5px}
h1{font-size:18px;margin:0 0 4px}h2{font-size:11.5px;text-transform:uppercase;letter-spacing:.06em;color:#7d6f6f;margin:20px 0 6px;border-bottom:1px solid #efe9e9;padding-bottom:4px}
.note{background:#fef2f2;border:1px solid #fecaca;color:#7f1d1d;padding:8px 10px;border-radius:4px;font-size:11.5px}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:5px 7px;border-bottom:1px solid #efe9e9;vertical-align:top}
th{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:#7d6f6f;background:#faf8f8}
.kv{display:grid;grid-template-columns:repeat(3,1fr);gap:8px 22px}.lbl{font-size:10.5px;text-transform:uppercase;color:#7d6f6f;letter-spacing:.05em}.val{font-weight:600;word-break:break-word}
.blank{color:#b8aaaa;font-weight:400;font-style:italic}
.print{position:fixed;top:14px;right:14px;background:#dc2626;color:#fff;border:0;border-radius:4px;padding:8px 14px;font-weight:600;cursor:pointer}
@media(max-width:640px){.page{padding:18px;margin:0}.kv{grid-template-columns:1fr 1fr}}
@media print{body{background:#fff}.page{border:0;margin:0;max-width:none;padding:0}.print{display:none}}
`;

const val = (v: unknown) => (v === null || v === undefined || v === '' ? '<span class="blank">not on file</span>' : esc(v));
const kv = (items: [string, unknown][]) => `<div class="kv">${items.map(([l, v]) => `<div><div class="lbl">${esc(l)}</div><div class="val">${val(v)}</div></div>`).join('')}</div>`;
const table = (head: string[], rows: unknown[][], empty: string) =>
  rows.length ? `<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${val(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : `<p class="muted">${esc(empty)}</p>`;

const cityLine = (x: { city: string | null; state: string | null; zip: string | null }) => [x.city, [x.state, x.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');

export type AcordContext = {
  form: AcordForm;
  account: Account;
  policy: Policy | null;
  drivers: Driver[];
  vehicles: Vehicle[];
  properties: Property[];
  settings: AgencySettings | null;
  carrier?: Carrier;
  holder: string;
  preparedBy: string | null;
};

export const acordDocTitle = (f: AcordForm) => `ACORD ${f.code} — data for ${f.title}`;

export function buildAcordHtml(ctx: AcordContext) {
  const { form, account: a, policy: p, drivers, vehicles, properties, settings: s, carrier } = ctx;
  const title = acordDocTitle(form);
  const has = (x: AcordSection) => form.sections.includes(x);
  const commercial = a.account_type === 'Commercial';
  const parts: string[] = [];

  parts.push(`<div class="note"><b>Data summary for transfer to the official ACORD ${esc(form.code)} form.</b> This sheet collects the information on file needed to complete the form; it is not the ACORD form itself and must not be issued in its place. Verify each item with the insured and carrier before transferring.</div>`);

  parts.push(`<h2>Agency / Producer</h2>${kv([
    ['Agency', s?.name], ['Phone', s?.phone ? fmtPhone(s.phone) : null], ['Email', s?.email],
    ['Address', s?.address], ['City / State / ZIP', s ? cityLine(s) : null], ['Agency license #', s?.license_number],
    ['Producer', p?.producer || a.producer], ['Customer service rep', a.csr], ['Prepared by', ctx.preparedBy],
  ])}`);

  parts.push(`<h2>${form.certificate ? 'Named insured' : 'Applicant'}</h2>${kv([
    ['Name', accountName(a)], ['Entity type', commercial ? 'Business' : 'Individual'], ['Contact', commercial ? `${a.first_name} ${a.last_name}` : null],
    ['Mailing address', a.address], ['City / State / ZIP', cityLine(a)], ['Phone', fmtPhone(a.phone || a.mobile_phone)],
    ['Email', a.email], ...(commercial ? [] : [['Date of birth', a.dob ? fmtDate(a.dob) : null], ['Marital status', a.marital_status], ['Occupation', a.occupation]] as [string, unknown][]),
  ])}`);

  if (p) {
    parts.push(`<h2>Policy</h2>${kv([
      ['Insurer', p.carrier], ['NAIC #', carrier?.naic], ['Policy number', p.policy_number],
      ['Line of business', p.line_of_business], ['Effective', fmtDate(p.effective_date)], ['Expiration', fmtDate(p.expiration_date)],
      ['Term', `${p.term_months} months`], ['Premium', fmtMoney(p.premium, true)], ['Billing / plan', `${p.billing_type}${p.payment_plan ? ` · ${p.payment_plan}` : ''}`],
      ['Status', p.status],
    ])}`);
    parts.push(`<h2>Coverages &amp; limits</h2>${table(['Coverage', 'Limit', 'Deductible', 'Premium'], (p.coverages ?? []).map((c) => [c.name, c.limit, c.deductible || '—', c.premium ? fmtMoney(c.premium, true) : '—']), 'No coverage schedule on file — obtain limits from the carrier declarations.')}`);
  } else {
    parts.push(`<h2>Policy</h2><p class="muted">No policy selected — this is new-business application data. Proposed effective date, carrier and limits are entered on the form.</p>`);
  }

  if (form.certificate) {
    parts.push(`<h2>${form.code === '27' ? 'Additional interest / mortgagee' : 'Certificate holder'}</h2><p class="val" style="white-space:pre-wrap">${ctx.holder.trim() ? esc(ctx.holder.trim()) : '<span class="blank">not provided</span>'}</p>`);
  }

  if (has('business')) {
    parts.push(`<h2>Business information</h2>${kv([
      ['Business name', a.business_name || (commercial ? accountName(a) : null)], ['Nature of business', a.occupation], ['Primary line', a.policy_type],
      ['Lead source', a.lead_source], ['Customer since', fmtDate(a.created_at)], ['Account status', a.status],
    ])}`);
  }

  if (has('auto')) {
    parts.push(`<h2>Drivers</h2>${table(['Name', 'DOB / age', 'Gender', 'Marital', 'Relationship', 'License # / state', 'Violations', 'Accidents'], drivers.map((d) => [
      `${d.first_name} ${d.last_name}`, d.dob ? `${fmtDate(d.dob)} (${age(d.dob) ?? '—'})` : null, d.gender, d.marital_status, d.relationship,
      d.license_number ? `${d.license_number} ${d.license_state ?? ''}`.trim() : null, d.violations, d.accidents,
    ]), 'No drivers on file.')}`);
    parts.push(`<h2>Vehicles</h2>${table(['Year', 'Make / model', 'VIN', 'Use', 'Annual miles', 'Ownership', 'Garaging ZIP'], vehicles.map((v) => [
      v.year, `${v.make} ${v.model}`, v.vin, v.usage, v.annual_miles, v.ownership, v.garaging_zip,
    ]), 'No vehicles on file.')}`);
  }

  if (has('property')) {
    parts.push(`<h2>Locations / dwellings</h2>${table(['Address', 'Year built', 'Sq ft', 'Construction', 'Roof (year)', 'Protection class', 'Value'], properties.map((x) => [
      `${x.address}${cityLine(x) ? `, ${cityLine(x)}` : ''}`, x.year_built, x.square_feet, x.construction, x.roof_type ? `${x.roof_type}${x.roof_year ? ` (${x.roof_year})` : ''}` : null,
      x.protection_class, x.dwelling_value ? fmtMoney(x.dwelling_value) : null,
    ]), 'No properties on file.')}`);
  }

  if (has('liability') && p) {
    const find = (re: RegExp) => (p.coverages ?? []).find((c) => re.test(c.name))?.limit ?? null;
    parts.push(`<h2>Liability limits summary</h2>${kv([
      ['Each occurrence', find(/occurrence|each accident|combined single/i)], ['General aggregate', find(/general aggregate|aggregate/i)],
      ['Products / completed ops', find(/products/i)], ['Personal & adv. injury', find(/advertising/i)], ['Damage to rented premises', find(/rented/i)], ['Medical expense', find(/medical/i)],
    ])}`);
  }

  if (has('wc')) {
    parts.push(`<h2>Workers compensation</h2>${kv([
      ['States', a.state], ['Employers liability', p ? (p.coverages ?? []).filter((c) => /employers/i.test(c.name)).map((c) => c.limit).join(' / ') || null : null],
      ['Payroll by class', null], ['Number of employees', null], ['Officers included / excluded', null], ['Experience mod', null],
    ])}<p class="muted">Payroll, class codes and officer elections are collected from the insured for the form.</p>`);
  }

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${STYLE}</style></head><body>
<button class="print" onclick="window.print()">Print</button>
<div class="page">
  <div class="bar">
    <div><div class="agency">${esc(s?.name || 'Insurance Agency')}</div><div class="muted">${esc(s ? cityLine(s) : '')}${s?.phone ? ` · ${esc(fmtPhone(s.phone))}` : ''}</div></div>
    <div style="text-align:right"><h1>${esc(title)}</h1><div class="muted">${esc(form.purpose)}<br>Prepared ${esc(fmtDate(new Date().toISOString()))}</div></div>
  </div>
  ${parts.join('\n')}
</div></body></html>`;
}
