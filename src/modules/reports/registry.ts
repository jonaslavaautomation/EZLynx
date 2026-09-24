import type { ComponentType } from 'react';
import type { ReportData } from './data';
import {
  ActivityProductivity, BookOfBusiness, Cancellations, CarrierMix, ClaimsSummary, CommissionSummary, LeadSources, LineMix, Production, QuoteCloseRatio, RenewalsDue, Retention,
} from './library';
import { AgencySummary, ApplicantList, PolicyCoverageReport, PolicyTransactions } from './more';
import { DataExport } from './export';

export type ReportCategoryKey =
  | 'activity' | 'applicant' | 'book-of-business' | 'claim' | 'commission' | 'policy-coverage' | 'policy-transaction'
  | 'quote' | 'agency-management' | 'policy-management' | 'retention' | 'sales';

export type ReportCategory = { key: ReportCategoryKey; title: string; description: string };

/** Report library categories (labels) — mirrors the Reports menu. */
export const REPORT_CATEGORIES: ReportCategory[] = [
  { key: 'activity', title: 'Activity', description: 'Tasks, calls and workload by staff' },
  { key: 'applicant', title: 'Applicant', description: 'Accounts, prospects and lead sources' },
  { key: 'book-of-business', title: 'Book of Business', description: 'Policies in force by line and carrier' },
  { key: 'claim', title: 'Claim', description: 'Claims by status and loss type' },
  { key: 'commission', title: 'Commission', description: 'Commission earned by carrier, producer or line' },
  { key: 'policy-coverage', title: 'Policy Coverage', description: 'Coverage lines, limits and deductibles' },
  { key: 'policy-transaction', title: 'Policy Transaction', description: 'New business, endorsements, renewals and cancellations' },
  { key: 'quote', title: 'Quote', description: 'Quoting activity and close ratios' },
  { key: 'agency-management', title: 'Agency Management', description: 'Agency-wide KPIs, mix and data export' },
  { key: 'policy-management', title: 'Policy Management', description: 'Renewals, cancellations and policy changes' },
  { key: 'retention', title: 'Retention Center', description: 'Renewals due, retention and lost business' },
  { key: 'sales', title: 'Sales Center', description: 'Production, quotes and lead conversion' },
];

export type ReportDef = {
  key: string;
  title: string;
  description: string;
  /** Library categories this report is listed under (first one is its primary category). */
  categories: ReportCategoryKey[];
  Component: ComponentType<{ data: ReportData }>;
};

export const REPORTS: ReportDef[] = [
  { key: 'book-of-business', title: 'Book of Business', description: 'Active policies by line & carrier', categories: ['book-of-business', 'agency-management', 'policy-management'], Component: BookOfBusiness },
  { key: 'carrier-mix', title: 'Carrier Mix', description: 'Premium share by carrier', categories: ['book-of-business', 'agency-management'], Component: CarrierMix },
  { key: 'line-mix', title: 'Lines of Business Mix', description: 'Premium share by line', categories: ['book-of-business', 'agency-management'], Component: LineMix },
  { key: 'retention', title: 'Retention Rate', description: 'Renewed vs. lost, 12 months', categories: ['retention', 'book-of-business'], Component: Retention },
  { key: 'production', title: 'Production', description: 'New business by month', categories: ['sales', 'agency-management'], Component: Production },
  { key: 'quote-close-ratio', title: 'Quote Close Ratio', description: 'Bound vs. quoted', categories: ['quote', 'sales'], Component: QuoteCloseRatio },
  { key: 'lead-sources', title: 'Accounts by Lead Source', description: 'Prospect → client conversion', categories: ['sales', 'applicant'], Component: LeadSources },
  { key: 'renewals-due', title: 'Renewals Due', description: 'Expiring in 30/60/90 days', categories: ['retention', 'policy-management'], Component: RenewalsDue },
  { key: 'cancellations', title: 'Cancellations & Non-renewals', description: 'Lost policies by period', categories: ['retention', 'policy-management'], Component: Cancellations },
  { key: 'activity-productivity', title: 'Activity Productivity', description: 'Completed & overdue by staff', categories: ['activity', 'agency-management'], Component: ActivityProductivity },
  { key: 'claims-summary', title: 'Claims Summary', description: 'By status & loss type', categories: ['claim'], Component: ClaimsSummary },
  { key: 'commission-summary', title: 'Commission Summary', description: 'By carrier, producer or line', categories: ['commission', 'agency-management'], Component: CommissionSummary },
  { key: 'applicant-list', title: 'Applicant List', description: 'All accounts with type, status, producer & contact', categories: ['applicant'], Component: ApplicantList },
  { key: 'policy-coverage', title: 'Policy Coverage', description: 'Coverage lines, limits & deductibles on active policies', categories: ['policy-coverage', 'policy-management'], Component: PolicyCoverageReport },
  { key: 'policy-transactions', title: 'Policy Transactions', description: 'Transaction register by type & month', categories: ['policy-transaction', 'policy-management'], Component: PolicyTransactions },
  { key: 'agency-summary', title: 'Agency Summary', description: 'Agency-wide KPIs & breakdown by producer', categories: ['agency-management'], Component: AgencySummary },
  { key: 'data-export', title: 'Data Export', description: 'Download any table as CSV', categories: ['agency-management'], Component: DataExport },
];

/** Old/short links that should still open a report. */
const ALIASES: Record<string, string> = { book: 'book-of-business', renewals: 'renewals-due', commissions: 'commission-summary', claims: 'claims-summary' };

export const findReport = (key: string | null | undefined) => (key ? REPORTS.find((r) => r.key === (ALIASES[key] ?? key)) ?? null : null);
export const findCategory = (key: string | null | undefined) => REPORT_CATEGORIES.find((c) => c.key === key) ?? null;
export const reportsIn = (category: string) => REPORTS.filter((r) => (r.categories as string[]).includes(category));
