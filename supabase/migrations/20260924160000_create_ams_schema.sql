/*
# Full AMS schema

Extends `accounts` and adds every table the portal uses: drivers, vehicles, properties, policies,
policy_transactions, quotes, activities, claims, documents, messages, invoices, carriers, staff,
agency_settings, plus a `documents` storage bucket.

Security: this remains a single-tenant demo with no sign-in, so (matching the existing `accounts`
policies) anon + authenticated roles get full CRUD. Replace these policies with auth-scoped ones
before storing real client data.

Seed data is loaded from the app (Settings → Data → Load sample data), not here.
*/

-- ── accounts: new columns ──
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS account_type text DEFAULT 'Personal';
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS business_name text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS dob date;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS marital_status text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS occupation text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS mobile_phone text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS producer text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS csr text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS lead_source text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS notes text;

CREATE TABLE IF NOT EXISTS drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  dob date,
  gender text,
  marital_status text,
  relationship text,
  license_number text,
  license_state text,
  violations int NOT NULL DEFAULT 0,
  accidents int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  year int NOT NULL,
  make text NOT NULL,
  model text NOT NULL,
  vin text,
  usage text,
  annual_miles int,
  ownership text,
  garaging_zip text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  address text NOT NULL,
  city text,
  state text,
  zip text,
  year_built int,
  square_feet int,
  construction text,
  roof_type text,
  roof_year int,
  protection_class int,
  dwelling_value numeric,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  policy_number text NOT NULL,
  carrier text NOT NULL,
  line_of_business text NOT NULL,
  status text NOT NULL DEFAULT 'Active',
  effective_date date NOT NULL,
  expiration_date date NOT NULL,
  term_months int NOT NULL DEFAULT 12,
  premium numeric NOT NULL DEFAULT 0,
  commission_rate numeric NOT NULL DEFAULT 10,
  billing_type text NOT NULL DEFAULT 'Direct Bill',
  payment_plan text,
  source text NOT NULL DEFAULT 'Manual',
  producer text,
  coverages jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS policy_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  type text NOT NULL,
  effective_date date NOT NULL,
  premium_change numeric NOT NULL DEFAULT 0,
  description text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  line_of_business text NOT NULL,
  status text NOT NULL DEFAULT 'Draft',
  effective_date date NOT NULL,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  results jsonb NOT NULL DEFAULT '[]'::jsonb,
  selected_carrier text,
  selected_premium numeric,
  policy_id uuid REFERENCES policies(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES accounts(id) ON DELETE CASCADE,
  policy_id uuid REFERENCES policies(id) ON DELETE SET NULL,
  type text NOT NULL DEFAULT 'Task',
  subject text NOT NULL,
  description text,
  due_date date,
  priority text NOT NULL DEFAULT 'Normal',
  status text NOT NULL DEFAULT 'Open',
  assigned_to text,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  policy_id uuid REFERENCES policies(id) ON DELETE SET NULL,
  claim_number text,
  date_of_loss date NOT NULL,
  reported_date date,
  loss_type text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'Open',
  amount_reserved numeric,
  amount_paid numeric,
  adjuster_name text,
  adjuster_phone text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES accounts(id) ON DELETE CASCADE,
  policy_id uuid REFERENCES policies(id) ON DELETE SET NULL,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'Other',
  mime_type text,
  size_bytes bigint,
  storage_path text,
  data_url text,
  esign_status text,
  esign_signer_email text,
  esign_sent_at timestamptz,
  esign_completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'SMS',
  direction text NOT NULL DEFAULT 'Outbound',
  to_address text,
  subject text,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'Sent',
  read boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  policy_id uuid REFERENCES policies(id) ON DELETE SET NULL,
  invoice_number text NOT NULL,
  description text,
  amount numeric NOT NULL DEFAULT 0,
  amount_paid numeric NOT NULL DEFAULT 0,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'Unpaid',
  paid_date date,
  payment_method text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS carriers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  naic text,
  lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  commission_rate numeric NOT NULL DEFAULT 10,
  phone text,
  website text,
  appointed boolean NOT NULL DEFAULT true,
  downloads_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'CSR',
  active boolean NOT NULL DEFAULT true,
  color text NOT NULL DEFAULT '#684ec2',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agency_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text,
  city text,
  state text,
  zip text,
  phone text,
  email text,
  license_number text,
  renewal_reminder_days int NOT NULL DEFAULT 60,
  current_user_name text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS drivers_account_idx ON drivers(account_id);
CREATE INDEX IF NOT EXISTS vehicles_account_idx ON vehicles(account_id);
CREATE INDEX IF NOT EXISTS properties_account_idx ON properties(account_id);
CREATE INDEX IF NOT EXISTS policies_account_idx ON policies(account_id);
CREATE INDEX IF NOT EXISTS policies_expiration_idx ON policies(expiration_date);
CREATE INDEX IF NOT EXISTS policy_transactions_policy_idx ON policy_transactions(policy_id);
CREATE INDEX IF NOT EXISTS quotes_account_idx ON quotes(account_id);
CREATE INDEX IF NOT EXISTS activities_account_idx ON activities(account_id);
CREATE INDEX IF NOT EXISTS activities_due_idx ON activities(due_date);
CREATE INDEX IF NOT EXISTS claims_account_idx ON claims(account_id);
CREATE INDEX IF NOT EXISTS documents_account_idx ON documents(account_id);
CREATE INDEX IF NOT EXISTS messages_account_idx ON messages(account_id);
CREATE INDEX IF NOT EXISTS invoices_account_idx ON invoices(account_id);

-- ── RLS: same open policy as `accounts` (single-tenant demo) ──
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['drivers','vehicles','properties','policies','policy_transactions','quotes','activities',
                           'claims','documents','messages','invoices','carriers','staff','agency_settings']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "anon_all_%s" ON %I', t, t);
    EXECUTE format('CREATE POLICY "anon_all_%s" ON %I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;

-- ── Storage bucket for uploaded documents ──
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "anon_documents_all" ON storage.objects;
CREATE POLICY "anon_documents_all" ON storage.objects FOR ALL TO anon, authenticated
  USING (bucket_id = 'documents') WITH CHECK (bucket_id = 'documents');
