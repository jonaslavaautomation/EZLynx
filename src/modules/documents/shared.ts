import { db } from '@/lib/db';
import { accountName, fmtDate, fmtMoney, fmtPhone } from '@/lib/format';
import type { Account, AgencySettings, Carrier, DocumentRow, ESignStatus, Policy, Vehicle } from '@/lib/types';

export const DOC_CATEGORIES = ['Application', 'Declarations', 'ID Card', 'Proof of Insurance', 'Correspondence', 'Claim', 'Signed Forms', 'Other'];
export const ESIGN_STATUSES: ESignStatus[] = ['Completed', 'Pending', 'Declined', 'Expired', 'Canceled', 'Failed'];
export const ESIGN_EXPIRY_DAYS = 30;
export const AUTO_LINES = ['Personal Auto', 'Commercial Auto', 'Motorcycle'];

/** Pending envelopes older than 30 days are treated as expired. */
export function isStalePending(d: Pick<DocumentRow, 'esign_status' | 'esign_sent_at'>) {
  if (d.esign_status !== 'Pending' || !d.esign_sent_at) return false;
  return Date.now() - new Date(d.esign_sent_at).getTime() > ESIGN_EXPIRY_DAYS * 86400000;
}

export function effectiveStatus(d: Pick<DocumentRow, 'esign_status' | 'esign_sent_at'>): ESignStatus | null {
  return isStalePending(d) ? 'Expired' : d.esign_status;
}

export const hasFile = (d: Pick<DocumentRow, 'data_url' | 'storage_path'>) => Boolean(d.data_url || d.storage_path);

/** Types a same-origin blob URL may render directly: none of these can run script. */
const INLINE_SAFE = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'text/plain']);

/**
 * HTML (generated documents and uploads alike) is shown inside a sandboxed iframe without
 * `allow-same-origin`, so it gets an opaque origin: the Print button still works, but script in an
 * uploaded file can't reach the app's storage, cookies or DOM.
 */
function sandboxedViewer(title: string, html: string) {
  const attr = html.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%;display:block}</style></head><body><iframe sandbox="allow-scripts allow-modals" srcdoc="${attr}"></iframe></body></html>`;
}

/**
 * Opens (or downloads) a document's file. Data URLs and signed URLs are re-wrapped in a same-origin
 * blob URL so PDFs/images render in the browser instead of being blocked. Only INLINE_SAFE types are
 * rendered as-is; HTML goes through `sandboxedViewer`, and anything else (SVG, XML, unknown) is
 * downloaded rather than rendered on the app origin.
 * `win` is a window opened synchronously by the caller (to avoid popup blockers).
 */
export async function openDocumentFile(doc: DocumentRow, download: boolean, win: Window | null) {
  const url = await db.fileUrl(doc);
  if (!url) { win?.close(); return false; }
  let target = url;
  let res: Response | null = null;
  try {
    res = await fetch(url);
  } catch {
    /* network/CORS failure: fall back to the raw URL */
  }
  if (res && !res.ok) {
    // The row points at a storage object that is gone (or unreadable) — don't open an error page.
    throw new Error(res.status === 400 || res.status === 404 ? 'The file for this document is missing from storage.' : `Could not open the file (HTTP ${res.status}).`);
  }
  if (res) {
    const raw = await res.blob();
    // Storage may serve HTML as text/plain, so go by the saved MIME type (falling back to the served one).
    const type = (doc.mime_type || raw.type || '').split(';')[0].trim().toLowerCase();
    let blob: Blob;
    if (download) blob = new Blob([raw], { type: 'application/octet-stream' });
    else if (INLINE_SAFE.has(type)) blob = new Blob([raw], { type });
    else if (type === 'text/html') blob = new Blob([sandboxedViewer(doc.name, await raw.text())], { type: 'text/html' });
    else { blob = new Blob([raw], { type: 'application/octet-stream' }); download = true; win?.close(); win = null; }
    const blobUrl = URL.createObjectURL(blob);
    target = blobUrl;
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5 * 60 * 1000);
  }
  if (download) {
    const a = document.createElement('a');
    a.href = target;
    a.download = doc.name;
    // `download` is ignored for cross-origin URLs; never navigate the app itself away.
    if (!target.startsWith('blob:') && !target.startsWith('data:')) { a.target = '_blank'; a.rel = 'noopener'; }
    document.body.appendChild(a);
    a.click();
    a.remove();
  } else if (win) {
    win.location.href = target;
  } else {
    window.open(target, '_blank');
  }
  return true;
}

// ── Generated documents ──

export type GenTemplate = 'id-card' | 'proof' | 'summary';
export const GEN_TEMPLATES: { value: GenTemplate; label: string; category: string; autoOnly?: boolean }[] = [
  { value: 'id-card', label: 'Auto ID Card', category: 'ID Card', autoOnly: true },
  { value: 'proof', label: 'Proof of Insurance', category: 'Proof of Insurance' },
  { value: 'summary', label: 'Policy Summary', category: 'Declarations' },
];

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function addressLines(a: Pick<Account, 'address' | 'city' | 'state' | 'zip'>) {
  const cityLine = [a.city, [a.state, a.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return [a.address, cityLine].filter(Boolean).map(esc).join('<br>');
}

const STYLE = `
  *{box-sizing:border-box}body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1d2b3a;margin:0;background:#f7f3f3;font-size:13px}
  .page{max-width:820px;margin:24px auto;background:#fff;padding:40px;border:1px solid #e8e0e0}
  .bar{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #dc2626;padding-bottom:14px;margin-bottom:20px}
  .agency{font-size:18px;font-weight:700;color:#006b6b}.muted{color:#7d6f6f;font-size:12px}
  h1{font-size:20px;margin:0 0 4px}h2{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#7d6f6f;margin:22px 0 8px}
  table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:7px 8px;border-bottom:1px solid #efe9e9;vertical-align:top}
  th{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#7d6f6f;background:#faf8f8}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 28px}.lbl{font-size:11px;text-transform:uppercase;color:#7d6f6f;letter-spacing:.05em}.val{font-weight:600}
  .card{border:2px solid #dc2626;border-radius:10px;padding:18px;margin:0 0 18px;page-break-inside:avoid}
  .card .head{display:flex;justify-content:space-between;border-bottom:1px solid #f5cfcf;padding-bottom:8px;margin-bottom:10px}
  .foot{margin-top:28px;font-size:11px;color:#7d6f6f;border-top:1px solid #efe9e9;padding-top:10px}
  .print{position:fixed;top:14px;right:14px;background:#dc2626;color:#fff;border:0;border-radius:4px;padding:8px 14px;font-weight:600;cursor:pointer}
  @media print{body{background:#fff}.page{border:0;margin:0;max-width:none;padding:0}.print{display:none}}
`;

function shell(title: string, settings: AgencySettings | null, content: string) {
  const agencyAddr = settings ? addressLines(settings) : '';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${STYLE}</style></head><body>
<button class="print" onclick="window.print()">Print</button>
<div class="page">
  <div class="bar">
    <div><div class="agency">${esc(settings?.name || 'Insurance Agency')}</div><div class="muted">${agencyAddr}${settings?.phone ? `<br>${esc(fmtPhone(settings.phone))}` : ''}${settings?.email ? ` · ${esc(settings.email)}` : ''}${settings?.license_number ? `<br>License #${esc(settings.license_number)}` : ''}</div></div>
    <div style="text-align:right"><h1>${esc(title)}</h1><div class="muted">Issued ${esc(fmtDate(new Date().toISOString()))}</div></div>
  </div>
  ${content}
  <div class="foot">This document was generated by ${esc(settings?.name || 'the agency')} from policy records on file. It is provided for informational purposes and does not amend, extend or alter the coverage afforded by the policy.</div>
</div></body></html>`;
}

function policyGrid(p: Policy, a: Account, carrier: Carrier | undefined) {
  const cells: [string, string][] = [
    ['Named insured', `${esc(accountName(a))}<br><span class="muted">${addressLines(a)}</span>`],
    ['Policy number', esc(p.policy_number)],
    ['Insurance company', `${esc(p.carrier)}${carrier?.naic ? ` <span class="muted">(NAIC ${esc(carrier.naic)})</span>` : ''}`],
    ['Line of business', esc(p.line_of_business)],
    ['Effective date', esc(fmtDate(p.effective_date))],
    ['Expiration date', esc(fmtDate(p.expiration_date))],
  ];
  return `<div class="grid">${cells.map(([l, v]) => `<div><div class="lbl">${l}</div><div class="val">${v}</div></div>`).join('')}</div>`;
}

function coverageTable(p: Policy, withPremium: boolean) {
  if (!p.coverages?.length) return '<p class="muted">Coverage details are on file with the insurance company.</p>';
  return `<table><thead><tr><th>Coverage</th><th>Limit</th><th>Deductible</th>${withPremium ? '<th style="text-align:right">Premium</th>' : ''}</tr></thead><tbody>
${p.coverages.map((c) => `<tr><td>${esc(c.name)}</td><td>${esc(c.limit)}</td><td>${esc(c.deductible || '—')}</td>${withPremium ? `<td style="text-align:right">${c.premium ? esc(fmtMoney(c.premium)) : '—'}</td>` : ''}</tr>`).join('')}
</tbody></table>`;
}

export function buildDocumentHtml(t: GenTemplate, ctx: { policy: Policy; account: Account; vehicles: Vehicle[]; settings: AgencySettings | null; carrier?: Carrier }) {
  const { policy: p, account: a, vehicles, settings, carrier } = ctx;
  if (t === 'id-card') {
    const list = vehicles.length ? vehicles : [null];
    const cards = list.map((v) => `
<div class="card">
  <div class="head"><div><div class="lbl">Insurance identification card</div><div class="val" style="font-size:15px">${esc(p.carrier)}</div></div><div style="text-align:right"><div class="lbl">State</div><div class="val">${esc(a.state || '—')}</div></div></div>
  <div class="grid">
    <div><div class="lbl">Policy number</div><div class="val">${esc(p.policy_number)}</div></div>
    <div><div class="lbl">NAIC</div><div class="val">${esc(carrier?.naic || '—')}</div></div>
    <div><div class="lbl">Effective</div><div class="val">${esc(fmtDate(p.effective_date))}</div></div>
    <div><div class="lbl">Expires</div><div class="val">${esc(fmtDate(p.expiration_date))}</div></div>
    <div><div class="lbl">Insured</div><div class="val">${esc(accountName(a))}</div></div>
    <div><div class="lbl">Vehicle</div><div class="val">${v ? `${esc(v.year)} ${esc(v.make)} ${esc(v.model)}` : 'All scheduled vehicles'}</div>${v?.vin ? `<div class="muted">VIN ${esc(v.vin)}</div>` : ''}</div>
  </div>
  <div class="muted" style="margin-top:10px">Agency: ${esc(settings?.name || '')}${settings?.phone ? ` · ${esc(fmtPhone(settings.phone))}` : ''}. Keep this card in the vehicle. Present it upon demand in the event of an accident or traffic stop.</div>
</div>`).join('');
    return shell('Auto ID Card', settings, `<h2>Identification cards</h2>${cards}`);
  }
  if (t === 'proof') {
    return shell('Proof of Insurance', settings, `
<p>This is to certify that the policy listed below has been issued to the named insured for the policy period indicated and is in force as of the date of issue.</p>
<h2>Policy</h2>${policyGrid(p, a, carrier)}
<h2>Coverage</h2>${coverageTable(p, false)}
${vehicles.length && AUTO_LINES.includes(p.line_of_business) ? `<h2>Covered vehicles</h2><table><thead><tr><th>Year</th><th>Make / model</th><th>VIN</th></tr></thead><tbody>${vehicles.map((v) => `<tr><td>${esc(v.year)}</td><td>${esc(v.make)} ${esc(v.model)}</td><td>${esc(v.vin || '—')}</td></tr>`).join('')}</tbody></table>` : ''}`);
  }
  return shell('Policy Summary', settings, `
<h2>Policy</h2>${policyGrid(p, a, carrier)}
<h2>Premium & billing</h2>
<div class="grid">
  <div><div class="lbl">Total premium</div><div class="val">${esc(fmtMoney(p.premium, true))}</div></div>
  <div><div class="lbl">Term</div><div class="val">${esc(p.term_months)} months</div></div>
  <div><div class="lbl">Billing</div><div class="val">${esc(p.billing_type)}</div></div>
  <div><div class="lbl">Payment plan</div><div class="val">${esc(p.payment_plan || '—')}</div></div>
  <div><div class="lbl">Status</div><div class="val">${esc(p.status)}</div></div>
  <div><div class="lbl">Producer</div><div class="val">${esc(p.producer || a.producer || '—')}</div></div>
</div>
<h2>Coverage schedule</h2>${coverageTable(p, true)}
${vehicles.length && AUTO_LINES.includes(p.line_of_business) ? `<h2>Vehicles</h2><table><thead><tr><th>Year</th><th>Make / model</th><th>VIN</th><th>Usage</th></tr></thead><tbody>${vehicles.map((v) => `<tr><td>${esc(v.year)}</td><td>${esc(v.make)} ${esc(v.model)}</td><td>${esc(v.vin || '—')}</td><td>${esc(v.usage || '—')}</td></tr>`).join('')}</tbody></table>` : ''}
${p.notes ? `<h2>Notes</h2><p>${esc(p.notes)}</p>` : ''}`);
}
