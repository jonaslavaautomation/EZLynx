import type { ComponentType } from 'react';
import type { ReportData } from './data';
import {
  ActivityProductivity, BookOfBusiness, Cancellations, CarrierMix, ClaimsSummary, CommissionSummary, LeadSources, LineMix, Production, QuoteCloseRatio, RenewalsDue, Retention,
} from './library';

export type ReportGroup = 'Book of Business' | 'Sales' | 'Service' | 'Financial';
export type ReportDef = { key: string; group: ReportGroup; title: string; description: string; Component: ComponentType<{ data: ReportData }> };

export const REPORT_GROUPS: ReportGroup[] = ['Book of Business', 'Sales', 'Service', 'Financial'];

export const REPORTS: ReportDef[] = [
  { key: 'book-of-business', group: 'Book of Business', title: 'Book of Business', description: 'Active policies by line & carrier', Component: BookOfBusiness },
  { key: 'carrier-mix', group: 'Book of Business', title: 'Carrier Mix', description: 'Premium share by carrier', Component: CarrierMix },
  { key: 'line-mix', group: 'Book of Business', title: 'Lines of Business Mix', description: 'Premium share by line', Component: LineMix },
  { key: 'retention', group: 'Book of Business', title: 'Retention Rate', description: 'Renewed vs. lost, 12 months', Component: Retention },
  { key: 'production', group: 'Sales', title: 'Production', description: 'New business by month', Component: Production },
  { key: 'quote-close-ratio', group: 'Sales', title: 'Quote Close Ratio', description: 'Bound vs. quoted', Component: QuoteCloseRatio },
  { key: 'lead-sources', group: 'Sales', title: 'Accounts by Lead Source', description: 'Prospect → client conversion', Component: LeadSources },
  { key: 'renewals-due', group: 'Service', title: 'Renewals Due', description: 'Expiring in 30/60/90 days', Component: RenewalsDue },
  { key: 'cancellations', group: 'Service', title: 'Cancellations & Non-renewals', description: 'Lost policies by period', Component: Cancellations },
  { key: 'activity-productivity', group: 'Service', title: 'Activity Productivity', description: 'Completed & overdue by staff', Component: ActivityProductivity },
  { key: 'claims-summary', group: 'Service', title: 'Claims Summary', description: 'By status & loss type', Component: ClaimsSummary },
  { key: 'commission-summary', group: 'Financial', title: 'Commission Summary', description: 'By carrier, producer or line', Component: CommissionSummary },
];

