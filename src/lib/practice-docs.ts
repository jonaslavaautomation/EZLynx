import type { PDFDocument, PDFFont, PDFPage } from 'pdf-lib';
import { db } from '@/lib/db';
import { FEATURED } from '@/lib/featured';
import { putFile } from '@/lib/filestore';
import { accountName, fmtMoney } from '@/lib/format';
import type { Account, AgencySettings, Claim, Driver, Policy, Property, Vehicle } from '@/lib/types';
import { getAssociation, minimumFidelity, num, type AssociationProfile } from '@/modules/accounts/association';
import { saveAppConfig, type DocFolder, type DocLibraryEntry } from '@/modules/admin/config';

/*
 * Sample PDF documents for the practice insureds, filed in their Document Library folders and linked to their
 * policies: declarations, billing statement, certificate / evidence of insurance, application, loss runs or
 * renewal offer, claim summaries, and for community associations a set of association documents.
 *
 * Documents (and their files) are kept in each browser by agency choice, so every browser builds its own copy once.
 * Each document gets a fixed id derived from the insured and the document, so the shared folder placement
 * (app_config doc_library) points at the same documents in every browser. Every page is marked as a training sample.
 */

const DONE_KEY = 'lava-ams:practice-docs:v1'; // outside the table prefix (northstar-ams:v1:) on purpose
const FOLDERS = ['Payments', 'Policy Documents', 'Certificates', 'Applications', 'Claims', 'Carrier eDocs'];
const F = { payments: 'default-0', policy: 'default-1', certificates: 'default-2', applications: 'default-3', claims: 'default-4', edocs: 'default-5', association: 'practice-association' } as const;
type FolderKey = keyof typeof F;

/** Deterministic uuid-shaped id for a string (same input → same id in every browser). */
export function stableId(s: string) {
  const half = (seed: number) => {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
  };
  const x = half(1) + half(2);
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-4${x.slice(13, 16)}-a${x.slice(17, 20)}-${x.slice(20, 32)}`;
}

const readDone = (): string[] => { try { return JSON.parse(localStorage.getItem(DONE_KEY) ?? '[]'); } catch { return []; } };
const markDone = (id: string) => { try { localStorage.setItem(DONE_KEY, JSON.stringify([...new Set([...readDone(), id])])); } catch { /* storage unavailable */ } };

// ── PDF writer ──

type Lib = typeof import('pdf-lib');
const W = 612, H = 792, M = 54;

/** Standard PDF fonts only cover Windows-1252; replace anything else so drawing never throws. */
const safe = (t: unknown) => String(t ?? '').replace(/[^\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026]/g, '-');
const money = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? '--' : fmtMoney(n));
const mdy = (iso: string | null | undefined) => {
  if (!iso) return '--';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return Number.isNaN(d.getTime()) ? '--' : `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
};

class Sheet {
  page!: PDFPage;
  y = 0;
  private pages = 0;
  constructor(private lib: Lib, private doc: PDFDocument, private font: PDFFont, private bold: PDFFont, private agency: string, private title: string) { this.newPage(); }

  private newPage() {
    const { rgb } = this.lib;
    this.page = this.doc.addPage([W, H]);
    this.pages++;
    this.page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: rgb(0, 0.475, 0.42) });
    this.page.drawText(safe(this.agency), { x: M, y: H - 36, size: 10, font: this.bold, color: rgb(0.15, 0.2, 0.22) });
    this.page.drawText('SAMPLE - training document, not an actual insurance policy', { x: W - M - this.font.widthOfTextAtSize('SAMPLE - training document, not an actual insurance policy', 8), y: H - 36, size: 8, font: this.font, color: rgb(0.75, 0.2, 0.2) });
    this.page.drawLine({ start: { x: M, y: H - 44 }, end: { x: W - M, y: H - 44 }, thickness: 0.6, color: rgb(0.8, 0.82, 0.85) });
    this.page.drawText(`${safe(this.title)}  |  Page ${this.pages}`, { x: M, y: 30, size: 8, font: this.font, color: rgb(0.45, 0.48, 0.5) });
    this.y = H - 70;
  }
  private need(h: number) { if (this.y - h < 50) this.newPage(); }
  private wrap(text: string, size: number, width: number, f = this.font) {
    const out: string[] = [];
    for (const para of safe(text).split('\n')) {
      let line = '';
      // A single word wider than the column (e.g. a long email address) is broken by character.
      const words = para.split(/\s+/).flatMap((w) => {
        const parts: string[] = [];
        let rest = w;
        while (f.widthOfTextAtSize(rest, size) > width && rest.length > 1) {
          let n = rest.length - 1;
          while (n > 1 && f.widthOfTextAtSize(rest.slice(0, n), size) > width) n--;
          parts.push(rest.slice(0, n));
          rest = rest.slice(n);
        }
        return [...parts, rest];
      });
      for (const word of words) {
        const next = line ? `${line} ${word}` : word;
        if (f.widthOfTextAtSize(next, size) > width && line) { out.push(line); line = word; } else line = next;
      }
      out.push(line);
    }
    return out;
  }
  heading(title: string, sub?: string) {
    const { rgb } = this.lib;
    this.need(50);
    this.page.drawText(safe(title), { x: M, y: this.y, size: 17, font: this.bold, color: rgb(0.1, 0.12, 0.14) });
    this.y -= 18;
    if (sub) { for (const l of this.wrap(sub, 10, W - 2 * M)) { this.page.drawText(l, { x: M, y: this.y, size: 10, font: this.font, color: rgb(0.35, 0.38, 0.4) }); this.y -= 13; } }
    this.y -= 8;
  }
  section(label: string) {
    const { rgb } = this.lib;
    this.need(34);
    this.y -= 6;
    this.page.drawRectangle({ x: M, y: this.y - 4, width: W - 2 * M, height: 17, color: rgb(0.93, 0.95, 0.96) });
    this.page.drawText(safe(label).toUpperCase(), { x: M + 6, y: this.y, size: 9, font: this.bold, color: rgb(0.2, 0.25, 0.28) });
    this.y -= 22;
  }
  /** Label / value pairs in two columns. */
  kv(pairs: [string, unknown][]) {
    const { rgb } = this.lib;
    const colW = (W - 2 * M) / 2;
    for (let i = 0; i < pairs.length; i += 2) {
      const row = pairs.slice(i, i + 2);
      const lines = row.map(([, v]) => this.wrap(String(v ?? '--') || '--', 10, colW - 130));
      const h = Math.max(...lines.map((l) => l.length)) * 12 + 4;
      this.need(h);
      row.forEach(([k], j) => {
        const x = M + j * colW;
        this.page.drawText(safe(k), { x, y: this.y, size: 9, font: this.bold, color: rgb(0.35, 0.38, 0.4) });
        lines[j].forEach((l, n) => this.page.drawText(l, { x: x + 125, y: this.y - n * 12, size: 10, font: this.font, color: rgb(0.1, 0.12, 0.14) }));
      });
      this.y -= h;
    }
  }
  table(head: string[], rows: unknown[][], widths: number[]) {
    const { rgb } = this.lib;
    const total = widths.reduce((a, b) => a + b, 0);
    const cols = widths.map((w) => (w / total) * (W - 2 * M));
    const drawRow = (cells: unknown[], f: PDFFont, shade: boolean) => {
      const lines = cells.map((c, i) => this.wrap(String(c ?? ''), 9, cols[i] - 8, f));
      const h = Math.max(1, ...lines.map((l) => l.length)) * 11 + 6;
      this.need(h);
      if (shade) this.page.drawRectangle({ x: M, y: this.y - h + 9, width: W - 2 * M, height: h, color: rgb(0.96, 0.97, 0.98) });
      let x = M;
      lines.forEach((ls, i) => { ls.forEach((l, n) => this.page.drawText(l, { x: x + 4, y: this.y - n * 11, size: 9, font: f, color: rgb(0.1, 0.12, 0.14) })); x += cols[i]; });
      this.y -= h;
    };
    drawRow(head, this.bold, true);
    rows.forEach((r) => drawRow(r, this.font, false));
    this.page.drawLine({ start: { x: M, y: this.y + 6 }, end: { x: W - M, y: this.y + 6 }, thickness: 0.5, color: rgb(0.85, 0.87, 0.9) });
    this.y -= 6;
  }
  para(text: string, size = 10) {
    const { rgb } = this.lib;
    for (const l of this.wrap(text, size, W - 2 * M)) { this.need(size + 4); this.page.drawText(l, { x: M, y: this.y, size, font: this.font, color: rgb(0.15, 0.17, 0.2) }); this.y -= size + 3; }
    this.y -= 6;
  }
  signature(label: string) {
    const { rgb } = this.lib;
    this.need(40);
    this.y -= 18;
    this.page.drawLine({ start: { x: M, y: this.y }, end: { x: M + 220, y: this.y }, thickness: 0.6, color: rgb(0.4, 0.4, 0.4) });
    this.page.drawText(safe(label), { x: M, y: this.y - 12, size: 8, font: this.font, color: rgb(0.4, 0.42, 0.45) });
    this.y -= 26;
  }
}

// ── Document content ──

type Ctx = {
  a: Account; agency: AgencySettings | null; policies: Policy[]; drivers: Driver[]; vehicles: Vehicle[]; properties: Property[]; claims: Claim[];
  assoc: AssociationProfile | null; year: number;
};
type Spec = { key: string; name: string; category: string; folder: FolderKey; policy_id: string | null; draw: (s: Sheet) => void };

const insuredBlock = (c: Ctx): [string, unknown][] => [
  ['Named insured', accountName(c.a)], ['Mailing address', [c.a.address, [c.a.city, c.a.state].filter(Boolean).join(', '), c.a.zip].filter(Boolean).join(' ')],
  ['Phone', c.a.phone], ['Email', c.a.email],
];
const agentBlock = (c: Ctx): [string, unknown][] => [
  ['Agency', c.agency?.name ?? 'Insurance agency'], ['Agency phone', c.agency?.phone], ['Producer', c.a.producer], ['CSR', c.a.csr],
];
const termOf = (p: Policy) => `${mdy(p.effective_date)} to ${mdy(p.expiration_date)}`;
const singleFamily = (c: Ctx) => c.assoc?.association_type === 'Single-Family HOA';

const FORMS: Partial<Record<string, string[]>> = {
  'General Liability': ['CG 00 01 Commercial General Liability Coverage Form', 'CG 21 06 Exclusion - Access or Disclosure of Personal Information', 'IL 00 17 Common Policy Conditions'],
  'Commercial Package': ['CP 00 17 Condominium Association Coverage Form', 'CP 10 30 Causes of Loss - Special Form', 'CG 00 01 Commercial General Liability Coverage Form', 'CG 24 04 Waiver of Transfer of Rights of Recovery', 'IL 00 17 Common Policy Conditions'],
  'Directors & Officers': ['Community Association Directors & Officers Liability Coverage Form (claims made)', 'Property Manager Additional Insured Endorsement'],
  Crime: ['CR 00 21 Commercial Crime Coverage Form (loss sustained)', 'Include Designated Persons or Classes of Persons as Employees (board members, property manager)'],
  'Commercial Umbrella': ['CU 00 01 Commercial Liability Umbrella Coverage Form', 'Schedule of Underlying Insurance'],
  'Commercial Auto': ['CA 00 01 Business Auto Coverage Form', 'CA 99 10 Drive Other Car Coverage'],
  'Workers Comp': ['WC 00 00 00 Workers Compensation and Employers Liability Policy', 'WC 00 03 13 Waiver of Our Right to Recover from Others'],
  BOP: ['BP 00 03 Businessowners Coverage Form', 'BP 04 17 Employment-Related Practices Exclusion'],
  'Personal Auto': ['PP 00 01 Personal Auto Policy', 'PP 03 06 Towing and Labor Costs Coverage'],
  Homeowners: ['HO 00 03 Homeowners 3 - Special Form', 'HO 04 90 Personal Property Replacement Cost'],
};

function declarations(c: Ctx, p: Policy): Spec {
  return {
    key: `dec:${p.policy_number}`, name: `${p.line_of_business} Declarations - ${p.policy_number}.pdf`, category: 'Declarations', folder: 'policy', policy_id: p.id,
    draw: (s) => {
      s.heading(`${p.line_of_business} Declarations`, `Policy ${p.policy_number} issued by ${p.carrier}`);
      s.section('Named insured');
      s.kv(insuredBlock(c));
      s.section('Policy information');
      s.kv([['Policy number', p.policy_number], ['Writing company', p.carrier], ['Policy period', termOf(p)], ['Term', `${p.term_months} months`],
        ['Total premium', money(p.premium)], ['Payment plan', p.payment_plan ?? 'Paid in Full'], ['Billing', p.billing_type], ['Status', p.status]]);
      s.section('Coverages');
      s.table(['Coverage', 'Limit', 'Deductible'], p.coverages.map((cv) => [cv.name, cv.limit, cv.deductible ?? '--']), [3, 2, 1.4]);
      if (p.line_of_business === 'Commercial Package' && c.assoc) {
        s.section('Schedule of locations and buildings');
        s.table(['Location', 'Buildings', 'Construction', 'Year built', 'Building value'],
          [[[c.a.address, c.a.city, c.a.state].filter(Boolean).join(', '), `${num(c.assoc.residential_buildings) ?? 0} residential, ${num(c.assoc.other_buildings) ?? 0} other`, c.assoc.construction || '--', c.assoc.year_built || '--', c.assoc.building_value ? `$${c.assoc.building_value}` : '--']],
          [3, 2, 2, 1, 1.6]);
        s.para(singleFamily(c)
          ? 'The association insures its common areas and facilities only. Each owner insures their own home (HO-3) and should add loss assessment coverage.'
          : `Unit coverage: ${c.assoc.unit_coverage || 'per the association declarations'}. Unit owners should carry their own HO-6 policy for interior improvements, personal property, liability and loss assessment.`, 9);
      }
      if (p.line_of_business === 'Personal Auto') {
        s.section('Drivers');
        s.table(['Driver', 'Date of birth', 'Relationship', 'License'], c.drivers.map((d) => [`${d.first_name} ${d.last_name}`, mdy(d.dob), d.relationship ?? '--', d.license_state ? `${d.license_state} ****${(d.license_number ?? '').slice(-3)}` : '--']), [2.4, 1.4, 1.4, 1.4]);
        s.section('Vehicles');
        s.table(['Year / make / model', 'VIN', 'Use', 'Garaging ZIP'], c.vehicles.map((v) => [`${v.year} ${v.make} ${v.model}`, v.vin ?? '--', v.usage ?? '--', v.garaging_zip ?? '--']), [2.6, 2.4, 1.2, 1.2]);
      }
      if (p.line_of_business === 'Homeowners' && c.properties[0]) {
        const pr = c.properties[0];
        s.section('Residence premises');
        s.kv([['Location', [pr.address, pr.city, pr.state, pr.zip].filter(Boolean).join(', ')], ['Year built', pr.year_built], ['Construction', pr.construction], ['Square feet', pr.square_feet], ['Roof', [pr.roof_type, pr.roof_year].filter(Boolean).join(', ')], ['Protection class', pr.protection_class]]);
      }
      s.section('Forms and endorsements');
      // A single-family HOA owns no residential buildings: its master policy uses the standard building form.
      const forms = (FORMS[p.line_of_business] ?? ['Policy jacket and common conditions'])
        .map((f) => (singleFamily(c) && f.startsWith('CP 00 17') ? 'CP 00 10 Building and Personal Property Coverage Form' : f));
      s.table(['Form'], forms.map((f) => [f]), [1]);
      s.section('Agent');
      s.kv(agentBlock(c));
    },
  };
}

function billing(c: Ctx): Spec {
  const total = c.policies.reduce((n, p) => n + p.premium, 0);
  return {
    key: 'billing', name: `Account Billing Statement ${c.year}.pdf`, category: 'Correspondence', folder: 'payments', policy_id: null,
    draw: (s) => {
      s.heading('Account Billing Statement', `Statement date ${mdy(new Date().toISOString())}`);
      s.section('Billed to');
      s.kv(insuredBlock(c));
      s.section('Policies');
      s.table(['Policy', 'Line', 'Carrier', 'Term', 'Plan', 'Premium'], c.policies.map((p) => [p.policy_number, p.line_of_business, p.carrier, termOf(p), p.payment_plan ?? '--', money(p.premium)]), [1.3, 1.5, 1.8, 1.9, 1, 1]);
      s.kv([['Total annual premium', money(total)], ['Billing', c.policies.some((p) => p.billing_type === 'Agency Bill') ? 'Agency bill' : 'Direct bill by each carrier']]);
      s.para('Direct-bill policies are paid to the carrier shown. Contact the agency for payment plans, premium financing or to update your autopay details.', 9);
    },
  };
}

function certificate(c: Ctx): Spec | null {
  const liab = c.policies.filter((p) => ['General Liability', 'BOP', 'Commercial Package', 'Commercial Auto', 'Workers Comp', 'Commercial Umbrella'].includes(p.line_of_business));
  if (!liab.length) return null;
  const holder = c.assoc?.management_company ? `${c.assoc.management_company} (property manager)` : 'Certificate holder on file';
  return {
    key: 'coi', name: 'Certificate of Liability Insurance.pdf', category: 'Proof of Insurance', folder: 'certificates', policy_id: liab[0].id,
    draw: (s) => {
      s.heading('Certificate of Liability Insurance', 'This certificate is issued as a matter of information only and confers no rights upon the certificate holder. It does not amend, extend or alter the coverage afforded by the policies below.');
      s.section('Insured');
      s.kv(insuredBlock(c));
      s.section('Coverages');
      s.table(['Type of insurance', 'Insurer', 'Policy number', 'Policy period', 'Limits'],
        liab.map((p) => [p.line_of_business, p.carrier, p.policy_number, termOf(p), p.coverages.filter((cv) => /occurrence|aggregate|single|statutory|each|liability/i.test(cv.name)).slice(0, 3).map((cv) => `${cv.name}: ${cv.limit}`).join('; ') || p.coverages[0]?.limit || '--']),
        [1.5, 1.6, 1.2, 1.7, 2.6]);
      s.section('Certificate holder');
      s.para(holder);
      s.section('Description of operations');
      s.para(c.a.operations_description ?? 'General operations of the named insured.');
      s.signature(`Authorized representative, ${c.agency?.name ?? 'agency'}`);
    },
  };
}

function evidenceOfProperty(c: Ctx): Spec | null {
  const home = c.policies.find((p) => p.line_of_business === 'Homeowners');
  if (!home) return null;
  return {
    key: 'eop', name: `Evidence of Property Insurance - ${home.policy_number}.pdf`, category: 'Proof of Insurance', folder: 'certificates', policy_id: home.id,
    draw: (s) => {
      s.heading('Evidence of Property Insurance', 'Issued to the mortgagee shown below. Coverage is subject to the terms of the policy.');
      s.section('Insured and property');
      s.kv([...insuredBlock(c), ['Property', [c.properties[0]?.address, c.properties[0]?.city, c.properties[0]?.state].filter(Boolean).join(', ') || c.a.address]]);
      s.section('Policy');
      s.kv([['Company', home.carrier], ['Policy number', home.policy_number], ['Policy period', termOf(home)], ['Annual premium', money(home.premium)]]);
      s.table(['Coverage', 'Limit', 'Deductible'], home.coverages.map((cv) => [cv.name, cv.limit, cv.deductible ?? '--']), [3, 2, 1.4]);
      s.section('Mortgagee / loss payee');
      s.para('Lone Star Home Lending, ISAOA/ATIMA\nPO Box 5500, Austin, TX 78763 (sample lender)\nLoan number ****4471');
      s.signature(`Authorized representative, ${c.agency?.name ?? 'agency'}`);
    },
  };
}

function idCards(c: Ctx): Spec | null {
  const auto = c.policies.find((p) => p.line_of_business === 'Personal Auto');
  if (!auto) return null;
  return {
    key: 'idcards', name: `Auto ID Cards - ${auto.policy_number}.pdf`, category: 'ID Card', folder: 'policy', policy_id: auto.id,
    draw: (s) => {
      s.heading('Insurance Identification Cards', 'Keep a card in each vehicle. Electronic proof is accepted in Texas.');
      for (const v of c.vehicles) {
        s.section(`${v.year} ${v.make} ${v.model}`);
        s.kv([['Company', auto.carrier], ['Policy number', auto.policy_number], ['Effective', mdy(auto.effective_date)], ['Expires', mdy(auto.expiration_date)], ['Insured', accountName(c.a)], ['VIN', v.vin ?? '--']]);
      }
    },
  };
}

function application(c: Ctx): Spec {
  const commercial = c.a.account_type === 'Commercial';
  return {
    key: 'app', name: commercial ? `Commercial Insurance Application ${c.year}.pdf` : 'Personal Lines Application.pdf', category: 'Application', folder: 'applications', policy_id: null,
    draw: (s) => {
      s.heading(commercial ? 'Commercial Insurance Application' : 'Personal Lines Application', 'Completed by the agency from information supplied by the applicant.');
      s.section('Applicant');
      s.kv([...insuredBlock(c), ...(commercial ? [['Legal entity', c.a.legal_entity_type], ['FEIN', c.a.tax_id ? `**-***${c.a.tax_id.slice(-4)}` : '--'], ['NAICS / SIC', [c.a.naics_code, c.a.sic_code].filter(Boolean).join(' / ')], ['Nature of business', c.a.nature_of_business], ['Business started', mdy(c.a.date_business_started)], ['Website', c.a.website]] as [string, unknown][] : [['Date of birth', mdy(c.a.dob)], ['Marital status', c.a.marital_status], ['Occupation', c.a.occupation]] as [string, unknown][])]);
      if (commercial) { s.section('Description of operations'); s.para(c.a.operations_description ?? '--'); }
      s.section('Lines of business requested');
      s.table(['Line', 'Current carrier', 'Expiring premium', 'Effective'], c.policies.map((p) => [p.line_of_business, p.carrier, money(p.premium), mdy(p.effective_date)]), [2, 2, 1.3, 1.2]);
      s.section('Prior losses');
      s.para(c.assoc?.losses_3yr === 'Yes' && c.assoc.loss_details ? c.assoc.loss_details : c.claims.length ? c.claims.map((cl) => `${mdy(cl.date_of_loss)} ${cl.loss_type}: ${cl.description ?? ''}`).join('\n') : 'No losses in the past 5 years.');
      s.signature(`Applicant signature  (${accountName(c.a)})`);
      s.signature('Producer signature');
    },
  };
}

function lossRuns(c: Ctx): Spec[] {
  if (c.a.account_type !== 'Commercial') return [];
  const carriers = [...new Set(c.policies.map((p) => p.carrier))];
  return carriers.map((carrier) => {
    const pols = c.policies.filter((p) => p.carrier === carrier);
    const water = c.assoc?.losses_3yr === 'Yes' && pols.some((p) => p.line_of_business === 'Commercial Package');
    return {
      key: `lossrun:${carrier}`, name: `Loss Run - ${carrier}.pdf`, category: 'Other', folder: 'edocs', policy_id: pols[0].id,
      draw: (s) => {
        s.heading('Currently Valued Loss Run', `${carrier} - valued as of ${mdy(new Date().toISOString())}, 5 policy years`);
        s.section('Insured');
        s.kv(insuredBlock(c));
        s.section('Policies');
        s.table(['Policy', 'Line', 'Period'], pols.map((p) => [p.policy_number, p.line_of_business, termOf(p)]), [1.4, 2, 2]);
        s.section('Claims');
        if (water) s.table(['Date of loss', 'Line', 'Description', 'Status', 'Paid', 'Reserve'], [[`06/14/${c.year - 2}`, 'Commercial Package (property)', c.assoc?.loss_details ?? 'Water damage', 'Closed', '$38,400', '$0']], [1.1, 1.6, 3, 0.8, 0.9, 0.8]);
        else s.para('No claims reported for the periods shown.');
        s.para('Loss runs are currently valued and subject to change. Contact the carrier for claim detail.', 9);
      },
    };
  });
}

function renewalOffer(c: Ctx): Spec | null {
  const home = c.policies.find((p) => p.line_of_business === 'Homeowners');
  if (!home) return null;
  return {
    key: 'renewal', name: `Homeowners Renewal Offer - ${home.policy_number}.pdf`, category: 'Correspondence', folder: 'edocs', policy_id: home.id,
    draw: (s) => {
      s.heading('Renewal Offer', `${home.carrier} - policy ${home.policy_number}`);
      s.kv([...insuredBlock(c), ['Renewal effective', mdy(home.expiration_date)], ['Renewal premium', money(Math.round(home.premium * 1.06))], ['Current premium', money(home.premium)], ['Change', '+6% (replacement cost update)']]);
      s.para('Your dwelling limit was increased to keep pace with local building costs. No action is needed to renew. Contact your agent to review coverage or deductible options.');
    },
  };
}

function claimDocs(c: Ctx): Spec[] {
  const out: Spec[] = c.claims.map((cl) => ({
    key: `claim:${cl.id}`, name: `Claim Summary - ${cl.claim_number ?? cl.loss_type}.pdf`, category: 'Claim', folder: 'claims' as FolderKey, policy_id: cl.policy_id,
    draw: (s: Sheet) => {
      s.heading('Claim Summary', `${cl.loss_type} - date of loss ${mdy(cl.date_of_loss)}`);
      s.kv([['Claim number', cl.claim_number], ['Status', cl.status], ['Reported', mdy(cl.reported_date)], ['Adjuster', cl.adjuster_name], ['Reserved', money(cl.amount_reserved)], ['Paid', money(cl.amount_paid)]]);
      s.section('Description');
      s.para(cl.description ?? '--');
    },
  }));
  if (c.assoc?.losses_3yr === 'Yes' && c.assoc.loss_details) {
    const pkg = c.policies.find((p) => p.line_of_business === 'Commercial Package');
    out.push({
      key: 'claim:association-water', name: `Claim Summary - Water Damage ${c.year - 2}.pdf`, category: 'Claim', folder: 'claims', policy_id: pkg?.id ?? null,
      draw: (s) => {
        s.heading('Claim Summary', `Water damage - date of loss 06/14/${c.year - 2}`);
        s.kv([['Claim number', `${(pkg?.carrier ?? 'CA').slice(0, 2).toUpperCase()}-${c.year - 2}-40917`], ['Status', 'Closed'], ['Line', 'Commercial Package (property)'], ['Adjuster', 'Dana Holloway (sample)'], ['Paid', '$38,400'], ['Deductible', '$25,000 per occurrence']]);
        s.section('Description and corrective action');
        s.para(c.assoc?.loss_details ?? '');
      },
    });
  }
  return out;
}

function associationDocs(c: Ctx): Spec[] {
  const p = c.assoc;
  if (!p) return [];
  const fidelity = minimumFidelity(p);
  const crime = c.policies.find((x) => x.line_of_business === 'Crime');
  const crimeLimit = num(crime?.coverages[0]?.limit) ?? null;
  const tiv = [p.building_value, p.outdoor_value, p.bpp_value].map(num).reduce<number>((n, v) => n + (v ?? 0), 0);
  const board = ['President', 'Vice President', 'Treasurer', 'Secretary', 'Director at Large'];
  const names = [`${c.a.first_name} ${c.a.last_name}`, 'Marcus Bell', 'Priscilla Tran', 'Owen Gallagher', 'Nadia Farouk', 'Henry Osei', 'Lucia Romero'];
  return [
    {
      key: 'assoc:budget', name: `Annual Budget and Reserves ${c.year}.pdf`, category: 'Other', folder: 'association', policy_id: null,
      draw: (s) => {
        s.heading(`${c.year} Annual Budget and Reserve Summary`, accountName(c.a));
        s.kv([['Total units', p.total_units], ['Monthly dues per unit', p.monthly_dues ? `$${p.monthly_dues}` : '--'], ['Annual assessments', p.annual_assessments ? `$${p.annual_assessments}` : '--'], ['Reserve fund balance', p.reserve_balance ? `$${p.reserve_balance}` : '--'], ['Owners delinquent', p.delinquency || '--'], ['Positive fund balance', p.positive_fund_balance || '--']]);
        const annual = num(p.annual_assessments) ?? 0;
        s.section('Operating budget');
        s.table(['Category', 'Annual amount', 'Share'], [['Insurance (package, D&O, crime, umbrella)', money(Math.round(annual * 0.18)), '18%'], ['Landscaping and grounds', money(Math.round(annual * 0.22)), '22%'], ['Utilities', money(Math.round(annual * 0.14)), '14%'], ['Management fees', money(Math.round(annual * 0.11)), '11%'], ['Repairs and maintenance', money(Math.round(annual * 0.15)), '15%'], ['Reserve contribution', money(Math.round(annual * 0.2)), '20%']], [3, 1.4, 0.8]);
      },
    },
    {
      key: 'assoc:sov', name: 'Statement of Values.pdf', category: 'Other', folder: 'association', policy_id: c.policies.find((x) => x.line_of_business === 'Commercial Package')?.id ?? null,
      draw: (s) => {
        s.heading('Statement of Values', `${accountName(c.a)} - for the master (package) policy`);
        s.kv([['Association type', p.association_type], ['Year built', p.year_built], ['Construction', p.construction], ['Max stories', p.max_stories], ['Roof', [p.roof_type, p.roof_year && `replaced ${p.roof_year}`].filter(Boolean).join(', ')], ['Sprinklers', p.sprinklers], ['ISO protection class', p.protection_class], ['Unit coverage', p.unit_coverage]]);
        s.section('Values');
        s.table(['Item', 'Value'], [['Buildings - common elements', p.building_value ? `$${p.building_value}` : '$0'], ['Outdoor property (fences, signs, lighting)', p.outdoor_value ? `$${p.outdoor_value}` : '$0'], ['Business personal property', p.bpp_value ? `$${p.bpp_value}` : '$0'], ['Total insured value', money(tiv)]], [3, 1.4]);
        s.para(`Amenities: ${p.amenities.length ? p.amenities.join(', ') : 'none'}.`, 9);
      },
    },
    {
      key: 'assoc:board', name: 'Board of Directors and Management.pdf', category: 'Other', folder: 'association', policy_id: c.policies.find((x) => x.line_of_business === 'Directors & Officers')?.id ?? null,
      draw: (s) => {
        s.heading('Board of Directors and Management', accountName(c.a));
        const n = Math.min(board.length, num(p.board_members) ?? 5);
        s.table(['Office', 'Name', 'Term ends'], board.slice(0, n).map((o, i) => [o, names[i], `12/31/${c.year + (i % 2)}`]), [1.5, 2, 1]);
        s.section('Management');
        s.kv([['Management', p.management], ['Company', p.management_company], ['Property manager', p.property_manager], ['Designation', p.manager_designation], ['Manager carries crime', p.manager_has_crime], ['Association employees', p.employees]]);
      },
    },
    {
      key: 'assoc:ccr', name: 'CC&Rs - Insurance Requirements Excerpt.pdf', category: 'Other', folder: 'association', policy_id: null,
      draw: (s) => {
        s.heading('Declaration of Covenants, Conditions and Restrictions', 'Article IX - Insurance (excerpt)');
        s.para(`9.1 Property. The Association shall insure the common elements${p.association_type === 'Single-Family HOA' ? ' and association-owned facilities' : ' and the buildings, including unit components on a ' + (p.unit_coverage || 'bare walls') + ' basis'}, for full replacement cost.`);
        s.para('9.2 Liability. The Association shall carry commercial general liability insurance of at least $1,000,000 per occurrence and $2,000,000 aggregate, naming the managing agent as an additional insured.');
        s.para('9.3 Directors and Officers. The Association shall carry directors and officers liability insurance covering current and former board members and committee volunteers.');
        s.para('9.4 Fidelity. The Association shall carry fidelity (employee theft) coverage for anyone who handles association funds, in an amount not less than three months of assessments on all units plus reserve funds.');
        s.para('9.5 Owners. Each owner shall insure the owner\'s unit or lot, improvements, personal property and personal liability, and is encouraged to carry loss assessment coverage (for condominium units, an HO-6 policy).');
      },
    },
    {
      key: 'assoc:fidelity', name: 'Fidelity Coverage Compliance Memo.pdf', category: 'Correspondence', folder: 'association', policy_id: crime?.id ?? null,
      draw: (s) => {
        s.heading('Fidelity Coverage Compliance', `To the Board of ${accountName(c.a)}`);
        s.kv([['Annual assessments', p.annual_assessments ? `$${p.annual_assessments}` : '--'], ['Reserve funds', p.reserve_balance ? `$${p.reserve_balance}` : '--'], ['Minimum fidelity limit', money(fidelity)], ['Current employee theft limit', crimeLimit ? money(crimeLimit) : 'No crime policy on file'], ['Meets requirement', fidelity !== null && crimeLimit !== null ? (crimeLimit >= fidelity ? 'Yes' : 'No - increase recommended') : '--'], ['Crime carrier', crime?.carrier ?? '--']]);
        s.para('Fannie Mae and FHA guidelines for condominium and PUD projects with more than 20 units require fidelity coverage of at least three months of assessments on all units plus reserve funds. Mortgage lenders check this before approving loans on units in the community.');
      },
    },
  ];
}

function specsFor(c: Ctx): Spec[] {
  return [
    ...c.policies.map((p) => declarations(c, p)),
    idCards(c), billing(c), certificate(c), evidenceOfProperty(c), application(c), ...lossRuns(c), renewalOffer(c), ...claimDocs(c), ...associationDocs(c),
  ].filter((x): x is Spec => !!x);
}

async function render(lib: Lib, agency: string, spec: Spec): Promise<Blob> {
  const doc = await lib.PDFDocument.create();
  doc.setTitle(spec.name.replace(/\.pdf$/, ''));
  doc.setAuthor(agency);
  doc.setSubject('Sample training document');
  const [font, bold] = await Promise.all([doc.embedFont(lib.StandardFonts.Helvetica), doc.embedFont(lib.StandardFonts.HelveticaBold)]);
  spec.draw(new Sheet(lib, doc, font, bold, agency, spec.name.replace(/\.pdf$/, '')));
  const bytes = await doc.save();
  return new Blob([bytes], { type: 'application/pdf' });
}

/** Files the documents in the account's library folders (shared), creating the default folders if needed. */
async function place(account: Account, ids: { id: string; folder: FolderKey; created_by: string | null }[], hasAssociation: boolean) {
  const [row] = await db.list('app_config', { eq: { key: 'doc_library' } });
  const all = { ...((row?.value as { byAccount?: Record<string, DocLibraryEntry> } | undefined)?.byAccount ?? {}) };
  const entry: DocLibraryEntry = structuredClone(all[account.id] ?? {
    folders: FOLDERS.map((name, i) => ({ id: `default-${i}`, name, created_at: account.created_at, created_by: account.producer, modified_at: null })),
    placement: {}, labels: {}, meta: {},
  });
  if (hasAssociation && !entry.folders.some((f) => f.id === F.association)) {
    const folder: DocFolder = { id: F.association, name: 'Association Documents', created_at: new Date().toISOString(), created_by: account.producer, modified_at: null };
    entry.folders.push(folder);
  }
  for (const { id, folder, created_by } of ids) {
    if (!entry.placement[id] && entry.folders.some((f) => f.id === F[folder])) entry.placement[id] = F[folder];
    entry.meta[id] ??= { created_by, modified_at: null };
  }
  all[account.id] = entry;
  await saveAppConfig('doc_library', { byAccount: all });
}

let running: Promise<number> | null = null;

/**
 * Builds the sample documents for every practice insured that hasn't had them in this browser yet.
 * Returns how many documents were created. Safe to call repeatedly; one run at a time.
 */
export function ensurePracticeDocuments(): Promise<number> {
  running ??= (async () => {
    const emails = FEATURED.map((f) => f.account.email);
    const done = new Set(readDone());
    const accounts = (await db.list('accounts', { in: { column: 'email', values: emails } })).filter((a) => !done.has(a.id));
    if (!accounts.length) return 0;
    const lib = await import('pdf-lib');
    const [agencyRow] = await db.list('agency_settings');
    const year = new Date().getFullYear();
    let created = 0;
    for (const a of accounts) {
      const [policies, drivers, vehicles, properties, claims, assoc] = await Promise.all([
        db.list('policies', { eq: { account_id: a.id }, order: { column: 'effective_date' } }),
        db.list('drivers', { eq: { account_id: a.id } }),
        db.list('vehicles', { eq: { account_id: a.id } }),
        db.list('properties', { eq: { account_id: a.id } }),
        db.list('claims', { eq: { account_id: a.id } }),
        getAssociation(a.id).catch(() => null),
      ]);
      const c: Ctx = { a, agency: agencyRow ?? null, policies: policies.filter((p) => p.status !== 'Cancelled'), drivers, vehicles, properties, claims, assoc, year };
      const specs = specsFor(c);
      const ids = specs.map((sp) => stableId(`${a.id}|${sp.key}`));
      const have = new Set((await db.list('documents', { eq: { account_id: a.id } })).map((d) => d.id));
      const rows = [];
      for (let i = 0; i < specs.length; i++) {
        if (have.has(ids[i])) continue;
        const blob = await render(lib, agencyRow?.name ?? 'Insurance Agency', specs[i]);
        rows.push({
          id: ids[i], account_id: a.id, policy_id: specs[i].policy_id, name: specs[i].name, category: specs[i].category, mime_type: 'application/pdf', size_bytes: blob.size,
          storage_path: null, data_url: await putFile(blob), esign_status: null, esign_signer_email: null, esign_sent_at: null, esign_completed_at: null,
        });
      }
      if (rows.length) await db.insertMany('documents', rows);
      created += rows.length;
      await place(a, specs.map((sp, i) => ({ id: ids[i], folder: sp.folder, created_by: a.csr ?? a.producer })), !!assoc);
      markDone(a.id);
    }
    return created;
  })().finally(() => { running = null; });
  return running;
}
