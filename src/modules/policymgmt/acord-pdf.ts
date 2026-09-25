import { accountName, parseDate } from '@/lib/format';
import type { Account, AgencySettings, Carrier, Coverage, Policy } from '@/lib/types';

/*
 * Fills an agency-supplied (licensed) fillable ACORD PDF. The app never ships the form itself: the agency uploads
 * its own copy in the ACORD Library, and this module maps account / policy data onto the form's standard ACORD
 * field names (e.g. NamedInsured_FullName_A). pdf-lib is loaded only when a form is inspected or filled.
 */

const pdfLib = () => import('pdf-lib');

/** Field names every ACORD 25 fillable carries; used to recognise the form on upload. */
const ACORD25_MARKERS = ['NamedInsured_FullName_A', 'Insurer_FullName_A', 'Policy_GeneralLiability_PolicyNumberIdentifier_A', 'CertificateHolder_FullName_A'];

export type PdfInspection = { fields: string[]; edition: string; recognized: boolean };

export class AcordPdfError extends Error {}

/** Opens a PDF and checks it's a usable fillable ACORD form. Throws AcordPdfError with a user-facing reason. */
export async function inspectAcordPdf(bytes: ArrayBuffer, code: string): Promise<PdfInspection> {
  const { PDFDocument } = await pdfLib();
  let doc;
  try {
    doc = await PDFDocument.load(bytes);
  } catch (e) {
    if ((e as Error).name === 'EncryptedPDFError' || /encrypted/i.test((e as Error).message)) {
      throw new AcordPdfError('This PDF is password-protected by its publisher, so it can’t be filled. Upload an unlocked fillable copy from your licensed ACORD forms source.');
    }
    throw new AcordPdfError('This file could not be read as a PDF. It may be damaged; download a fresh copy of the fillable form and try again.');
  }
  let fields: string[] = [];
  try { fields = doc.getForm().getFields().map((f) => f.getName()); } catch { fields = []; }
  if (!fields.length) throw new AcordPdfError('This PDF has no fillable fields (it may be a flattened or printed copy). Upload the fillable version of the form.');
  const recognized = code === '25' ? ACORD25_MARKERS.every((m) => fields.includes(m)) : true;
  let edition = '';
  try { edition = doc.getForm().getTextField('Form_EditionIdentifier_A').getText() ?? ''; } catch { /* optional */ }
  return { fields, edition, recognized };
}

export type FillValue = string | boolean;

/** Writes values into the form's fields (unknown names are ignored) and optionally flattens it. */
export async function fillAcordPdf(bytes: ArrayBuffer, values: Record<string, FillValue>, { flatten }: { flatten: boolean }): Promise<{ bytes: Uint8Array; filled: number }> {
  const { PDFDocument, PDFTextField, PDFCheckBox, StandardFonts } = await pdfLib();
  const doc = await PDFDocument.load(bytes);
  const form = doc.getForm();
  let filled = 0;
  for (const [name, value] of Object.entries(values)) {
    if (value === '' || value === false) continue;
    let field;
    try { field = form.getField(name); } catch { continue; }
    try {
      if (field instanceof PDFTextField) {
        const text = String(value);
        const max = field.getMaxLength();
        field.setText(max ? text.slice(0, max) : text);
        filled++;
      } else if (field instanceof PDFCheckBox && value === true) {
        field.check();
        filled++;
      }
    } catch { /* a field that rejects the value is left blank */ }
  }
  const font = await doc.embedFont(StandardFonts.Helvetica);
  form.updateFieldAppearances(font);
  if (flatten) form.flatten();
  return { bytes: await doc.save(), filled };
}

// ── ACORD 25 data mapping ──

export type CertFlags = { additionalInsured: boolean; waiverOfSubrogation: boolean };
export type Cert25Input = {
  account: Account;
  policies: Policy[];
  carriers: Carrier[];
  agency: AgencySettings | null;
  producerContact: { name: string; phone: string | null; email: string | null };
  holder: string;
  remarks: string;
  authorizedRep: string;
  certificateNumber: string;
  revision: string;
  flags: Record<string, CertFlags>; // by policy id
  issueDate: string; // YYYY-MM-DD
};

const mdy = (iso: string | null | undefined) => {
  const d = parseDate(iso);
  return d ? `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}` : '';
};

/** "1,000,000" / "$1M" / "500K" → "1,000,000"; non-numeric limits (e.g. "Statutory") pass through. */
export function limitText(v: string | null | undefined) {
  if (!v) return '';
  const s = v.replace(/\$/g, '').trim();
  const m = /^([\d.,]+)\s*([kKmM])?$/.exec(s);
  if (!m) return s;
  const n = Number(m[1].replace(/,/g, '')) * (m[2] ? (/m/i.test(m[2]) ? 1_000_000 : 1_000) : 1);
  return Number.isFinite(n) ? n.toLocaleString('en-US') : s;
}

/** Split limits: "100/300" → per-person 100,000 / per-accident 300,000 (values under 10,000 are in thousands). */
function splitLimits(v: string | null | undefined): string[] {
  if (!v || !v.includes('/')) return [];
  return v.split('/').map((p) => {
    const m = /^\s*\$?([\d.,]+)\s*([kKmM])?\s*$/.exec(p);
    if (!m) return '';
    const n = Number(m[1].replace(/,/g, ''));
    if (!Number.isFinite(n) || n <= 0) return '';
    const amount = m[2] ? n * (/m/i.test(m[2]) ? 1_000_000 : 1_000) : n < 10000 ? n * 1000 : n;
    return amount.toLocaleString('en-US');
  });
}

const find = (covs: Coverage[] | null | undefined, re: RegExp) => (covs ?? []).find((c) => re.test(c.name));

export const GL_LINES = ['General Liability', 'BOP'];
export const AUTO_LINES = ['Commercial Auto', 'Personal Auto'];
export const UMBRELLA_LINES = ['Umbrella', 'Commercial Umbrella', 'Excess Liability'];
export const WC_LINES = ['Workers Comp'];

/** Which ACORD 25 row a policy fills. */
export function certSection(p: Pick<Policy, 'line_of_business'>): 'gl' | 'auto' | 'umbrella' | 'wc' | 'other' {
  const l = p.line_of_business as string;
  if (GL_LINES.includes(l)) return 'gl';
  if (AUTO_LINES.includes(l)) return 'auto';
  if (UMBRELLA_LINES.includes(l)) return 'umbrella';
  if (WC_LINES.includes(l)) return 'wc';
  return 'other';
}

function parseHolder(text: string) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const name = lines.shift() ?? '';
  let city = '', state = '', zip = '';
  const last = lines[lines.length - 1];
  const m = last ? /^(.*?),?\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/.exec(last) : null;
  if (m) { lines.pop(); city = m[1].replace(/,$/, ''); state = m[2]; zip = m[3]; }
  return { name, one: lines[0] ?? '', two: lines.slice(1).join(', '), city, state, zip };
}

/** Builds the ACORD 25 field values. Returns the values plus notes about anything that couldn't be placed. */
export function acord25Values(c: Cert25Input): { values: Record<string, FillValue>; notes: string[] } {
  const v: Record<string, FillValue> = {};
  const notes: string[] = [];
  const a = c.account;
  const ag = c.agency;
  v.Form_CompletionDate_A = mdy(c.issueDate);

  // Producer (agency) and contact
  v.Producer_FullName_A = ag?.name ?? '';
  v.Producer_MailingAddress_LineOne_A = ag?.address ?? '';
  v.Producer_MailingAddress_CityName_A = ag?.city ?? '';
  v.Producer_MailingAddress_StateOrProvinceCode_A = ag?.state ?? '';
  v.Producer_MailingAddress_PostalCode_A = ag?.zip ?? '';
  v.Producer_ContactPerson_FullName_A = c.producerContact.name;
  v.Producer_ContactPerson_PhoneNumber_A = c.producerContact.phone ?? ag?.phone ?? '';
  v.Producer_ContactPerson_EmailAddress_A = c.producerContact.email ?? ag?.email ?? '';

  // Named insured
  v.NamedInsured_FullName_A = accountName(a);
  v.NamedInsured_MailingAddress_LineOne_A = a.address ?? '';
  v.NamedInsured_MailingAddress_CityName_A = a.city ?? '';
  v.NamedInsured_MailingAddress_StateOrProvinceCode_A = a.state ?? '';
  v.NamedInsured_MailingAddress_PostalCode_A = a.zip ?? '';

  // Insurers A–F: one letter per distinct carrier, in the order of the rows below
  const order: ('gl' | 'auto' | 'umbrella' | 'wc' | 'other')[] = ['gl', 'auto', 'umbrella', 'wc', 'other'];
  const bySection = new Map<string, Policy>();
  for (const s of order) {
    const list = c.policies.filter((p) => certSection(p) === s);
    if (list.length > 1) notes.push(`${list.length} ${s === 'gl' ? 'general liability' : s === 'wc' ? 'workers comp' : s} policies selected; the certificate shows ${list[0].policy_number} (list others in the description).`);
    if (list[0]) bySection.set(s, list[0]);
  }
  const letters = 'ABCDEF';
  const letterOf = new Map<string, string>();
  for (const s of order) {
    const p = bySection.get(s);
    if (!p || letterOf.has(p.carrier)) continue;
    if (letterOf.size >= 6) { notes.push(`More than six insurers; ${p.carrier} has no insurer letter.`); continue; }
    const L = letters[letterOf.size];
    letterOf.set(p.carrier, L);
    v[`Insurer_FullName_${L}`] = p.carrier;
    v[`Insurer_NAICCode_${L}`] = c.carriers.find((x) => x.name === p.carrier)?.naic ?? '';
  }
  v.CertificateOfInsurance_CertificateNumberIdentifier_A = c.certificateNumber;
  v.CertificateOfInsurance_RevisionNumberIdentifier_A = c.revision;
  const yn = (b: boolean) => (b ? 'Y' : '');
  const fl = (p: Policy) => c.flags[p.id] ?? { additionalInsured: false, waiverOfSubrogation: false };

  // General liability
  const gl = bySection.get('gl');
  if (gl) {
    const cov = gl.coverages;
    v.GeneralLiability_InsurerLetterCode_A = letterOf.get(gl.carrier) ?? '';
    v.GeneralLiability_CoverageIndicator_A = true;
    v.GeneralLiability_OccurrenceIndicator_A = true;
    v.GeneralLiability_GeneralAggregate_LimitAppliesPerPolicyIndicator_A = true;
    v.CertificateOfInsurance_GeneralLiability_AdditionalInsuredCode_A = yn(fl(gl).additionalInsured);
    v.Policy_GeneralLiability_SubrogationWaivedCode_A = yn(fl(gl).waiverOfSubrogation);
    v.Policy_GeneralLiability_PolicyNumberIdentifier_A = gl.policy_number;
    v.Policy_GeneralLiability_EffectiveDate_A = mdy(gl.effective_date);
    v.Policy_GeneralLiability_ExpirationDate_A = mdy(gl.expiration_date);
    // BOPs often carry one combined liability line ("1,000,000/2,000,000" or "1M/2M"): occurrence / aggregate.
    const combined = splitLimits(find(cov, /^liability$|business liability/i)?.limit);
    const occ = limitText(find(cov, /each occurrence/i)?.limit) || combined[0] || '';
    const agg = limitText(find(cov, /general aggregate/i)?.limit) || combined[1] || '';
    v.GeneralLiability_EachOccurrence_LimitAmount_A = occ;
    v.GeneralLiability_FireDamageRentedPremises_EachOccurrenceLimitAmount_A = limitText(find(cov, /rented|fire damage/i)?.limit);
    v.GeneralLiability_MedicalExpense_EachPersonLimitAmount_A = limitText(find(cov, /medical exp/i)?.limit);
    v.GeneralLiability_PersonalAndAdvertisingInjury_LimitAmount_A = limitText(find(cov, /personal.*adv/i)?.limit) || (combined.length ? occ : '');
    v.GeneralLiability_GeneralAggregate_LimitAmount_A = agg;
    v.GeneralLiability_ProductsAndCompletedOperations_AggregateLimitAmount_A = limitText(find(cov, /products/i)?.limit) || (combined.length ? agg : '');
    if (!occ) notes.push(`${gl.policy_number} has no each-occurrence limit on file; fill it on the certificate or add the coverage to the policy.`);
  }

  // Automobile liability
  const au = bySection.get('auto');
  if (au) {
    const cov = au.coverages;
    v.Vehicle_InsurerLetterCode_A = letterOf.get(au.carrier) ?? '';
    const hnoa = !!find(cov, /hired|non-owned/i);
    if (au.line_of_business === 'Commercial Auto') {
      v.Vehicle_ScheduledAutosIndicator_A = true;
      if (hnoa) { v.Vehicle_HiredAutosIndicator_A = true; v.Vehicle_NonOwnedAutosIndicator_A = true; }
    } else {
      v.Vehicle_ScheduledAutosIndicator_A = true;
    }
    v.CertificateOfInsurance_AutomobileLiability_AdditionalInsuredCode_A = yn(fl(au).additionalInsured);
    v.Policy_AutomobileLiability_SubrogationWaivedCode_A = yn(fl(au).waiverOfSubrogation);
    v.Policy_AutomobileLiability_PolicyNumberIdentifier_A = au.policy_number;
    v.Policy_AutomobileLiability_EffectiveDate_A = mdy(au.effective_date);
    v.Policy_AutomobileLiability_ExpirationDate_A = mdy(au.expiration_date);
    const csl = find(cov, /combined single/i);
    if (csl) v.Vehicle_CombinedSingleLimit_EachAccidentAmount_A = limitText(csl.limit);
    const bi = splitLimits(find(cov, /bodily injury/i)?.limit);
    if (bi[0]) v.Vehicle_BodilyInjury_PerPersonLimitAmount_A = bi[0];
    if (bi[1]) v.Vehicle_BodilyInjury_PerAccidentLimitAmount_A = bi[1];
    const pd = find(cov, /property damage/i);
    if (pd) v.Vehicle_PropertyDamage_PerAccidentLimitAmount_A = limitText(pd.limit);
  }

  // Umbrella / excess
  const um = bySection.get('umbrella');
  if (um) {
    const limit = limitText(find(um.coverages, /umbrella|excess|each occurrence/i)?.limit);
    v.ExcessUmbrella_InsurerLetterCode_A = letterOf.get(um.carrier) ?? '';
    v[/excess/i.test(um.line_of_business) ? 'Policy_PolicyType_ExcessIndicator_A' : 'Policy_PolicyType_UmbrellaIndicator_A'] = true;
    v.ExcessUmbrella_OccurrenceIndicator_A = true;
    v.CertificateOfInsurance_ExcessLiability_AdditionalInsuredCode_A = yn(fl(um).additionalInsured);
    v.Policy_ExcessLiability_SubrogationWaivedCode_A = yn(fl(um).waiverOfSubrogation);
    v.Policy_ExcessLiability_PolicyNumberIdentifier_A = um.policy_number;
    v.Policy_ExcessLiability_EffectiveDate_A = mdy(um.effective_date);
    v.Policy_ExcessLiability_ExpirationDate_A = mdy(um.expiration_date);
    v.ExcessUmbrella_Umbrella_EachOccurrenceAmount_A = limit;
    v.ExcessUmbrella_Umbrella_AggregateAmount_A = limitText(find(um.coverages, /aggregate/i)?.limit) || limit;
  }

  // Workers compensation
  const wc = bySection.get('wc');
  if (wc) {
    v.WorkersCompensationEmployersLiability_InsurerLetterCode_A = letterOf.get(wc.carrier) ?? '';
    v.WorkersCompensationEmployersLiability_AnyPersonsExcludedIndicator_A = 'N';
    v.Policy_WorkersCompensation_SubrogationWaivedCode_A = yn(fl(wc).waiverOfSubrogation);
    v.Policy_WorkersCompensationAndEmployersLiability_PolicyNumberIdentifier_A = wc.policy_number;
    v.Policy_WorkersCompensationAndEmployersLiability_EffectiveDate_A = mdy(wc.effective_date);
    v.Policy_WorkersCompensationAndEmployersLiability_ExpirationDate_A = mdy(wc.expiration_date);
    v.WorkersCompensationEmployersLiability_WorkersCompensationStatutoryLimitIndicator_A = true;
    const el = splitLimits(find(wc.coverages, /employers/i)?.limit);
    v.WorkersCompensationEmployersLiability_EmployersLiability_EachAccidentLimitAmount_A = el[0] ?? '';
    v.WorkersCompensationEmployersLiability_EmployersLiability_DiseaseEachEmployeeLimitAmount_A = el[1] ?? '';
    v.WorkersCompensationEmployersLiability_EmployersLiability_DiseasePolicyLimitAmount_A = el[2] ?? '';
  }

  // One other policy (property, professional…)
  const ot = bySection.get('other');
  if (ot) {
    v.OtherPolicy_InsurerLetterCode_A = letterOf.get(ot.carrier) ?? '';
    v.OtherPolicy_OtherPolicyDescription_A = ot.line_of_business;
    v.CertificateOfInsurance_OtherPolicy_AdditionalInsuredCode_A = yn(fl(ot).additionalInsured);
    v.OtherPolicy_SubrogationWaivedCode_A = yn(fl(ot).waiverOfSubrogation);
    v.OtherPolicy_PolicyNumberIdentifier_A = ot.policy_number;
    v.OtherPolicy_PolicyEffectiveDate_A = mdy(ot.effective_date);
    v.OtherPolicy_PolicyExpirationDate_A = mdy(ot.expiration_date);
    (ot.coverages ?? []).filter((x) => x.name !== 'Policy Fee').slice(0, 3).forEach((x, i) => {
      const L = 'ABC'[i];
      v[`OtherPolicy_CoverageCode_${L}`] = x.name;
      v[`OtherPolicy_CoverageLimitAmount_${L}`] = limitText(x.limit);
    });
  }

  v.CertificateOfLiabilityInsurance_ACORDForm_RemarkText_A = c.remarks.trim();
  const h = parseHolder(c.holder);
  v.CertificateHolder_FullName_A = h.name;
  v.CertificateHolder_MailingAddress_LineOne_A = h.one;
  v.CertificateHolder_MailingAddress_LineTwo_A = h.two;
  v.CertificateHolder_MailingAddress_CityName_A = h.city;
  v.CertificateHolder_MailingAddress_StateOrProvinceCode_A = h.state;
  v.CertificateHolder_MailingAddress_PostalCode_A = h.zip;
  if (!h.city) notes.push('Put the holder’s city, state and ZIP on the last line (e.g. "Austin, TX 78701") so they land in the right boxes.');
  v.Producer_AuthorizedRepresentative_Signature_A = c.authorizedRep;
  return { values: v, notes };
}
