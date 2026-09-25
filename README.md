# Northstar AMS

An insurance agency management system (AMS) with a built-in comparative rater, modeled on the feature set of EZLynx-style platforms. It's built with React, TypeScript, Tailwind and Supabase.

## Modules

| Area | What it does |
| --- | --- |
| **Workspace** | Live dashboard: KPIs, upcoming renewals, policy activity (7 days), alerts, texting and eSignature counters, my tasks |
| **Accounts** | Personal and commercial clients and prospects; drivers, vehicles and properties; a tabbed record with policies, quotes, activities, claims, documents, messages and billing |
| **Quotes & Rating** | Multi-step comparative rater. Rating data is pre-filled from the account, you pick carriers, results are compared side by side, then you bind to a policy. Rates are **simulated** by a deterministic rating engine. |
| **Policies** | Book of business, renewals queue, coverages, term history, plus the transactions: endorse, renew, cancel (pro-rata return premium), reinstate, non-renew, audit, remarket |
| **Activities** | Agency work queue in list, board and calendar views, with overdue and due-today tracking and bulk complete, reassign and delete; each account and policy has a timeline |
| **Claims** | First notice of loss (FNOL) intake, status workflow, reserves and payments, adjuster details |
| **Messages** | Texting and email console with templates. Delivery is **simulated**. |
| **Documents** | Upload, download, categorize and generate (ID card, proof of insurance, policy summary). Includes an eSignature envelope dashboard; signing is **simulated**. |
| **Accounting** | Agency-bill receivables with aging, payments, commission tracking |
| **Reports** | 12 reports with filters, charts, CSV export and print |
| **Settings** | Agency profile, users, carrier appointments, data import/export, sample data |

## Running it

```bash
npm install
npm run dev
```

`.env` needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

### Storage modes

When it starts, the app checks whether the AMS schema exists in the connected Supabase project:

- **Supabase mode:** the schema exists. All data is stored in Postgres and documents in the `documents` storage bucket. The first run asks whether to load a sample agency or start empty.
- **Browser-storage (demo) mode:** the schema is missing or Supabase can't be reached. Data lives in `localStorage` and a sample agency is loaded automatically. The footer shows which mode is active.

To switch to Supabase, run these migrations in order in the Supabase SQL editor (or with `supabase db push`), then reload:

1. `supabase/migrations/20260924160000_create_ams_schema.sql`
2. `supabase/migrations/20260925120000_policy_mgmt_comm_center_reports.sql`
3. `supabase/migrations/20260926120000_settings_support_marketplace.sql`
4. `supabase/migrations/20260927120000_applicant_details.sql`
5. `supabase/migrations/20260928120000_personal_applicant_info.sql`

The app stays in browser-storage mode until all of them have been applied.

### Security note

To match the original `accounts` table, the migration gives the `anon` role full read and write access to every table and to the documents bucket. That's fine for a single-tenant demo, but **not for real client data**. Before production, add Supabase Auth and replace the policies with ones scoped to the user or agency.

## What is not real (needs third-party integrations)

- Carrier rating and bind APIs, and carrier policy downloads (IVANS / TEAM-UP)
- SMS and email delivery (e.g. Twilio, SendGrid)
- eSignature (e.g. DocuSign)
- Payment processing
- User sign-in (the "current user" is picked in Settings → Agency profile)

## Code layout

```
src/lib/          types, data layer (db.ts: Supabase or localStorage), hooks, router, formatting, domain ops, seed data
src/components/   UI kit (ui.tsx), pickers, app shell (Layout.tsx)
src/modules/      one folder per module; each index.tsx exports its pages and embeddable panels
supabase/         SQL migrations
```
