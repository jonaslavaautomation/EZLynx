/*
# Applicant details: customer since, business classification, multiple addresses and contacts

- accounts: customer_since, NAICS / SIC business classification and description of primary operations.
- account_addresses: any number of addresses per applicant (Mailing, Residence, Billing, Garaging…), one primary.
- account_contacts: people on the account with their roles — primary (named insured), co-applicant (personal)
  or secondary (commercial), and Client Center (customer portal) access.

Security: same single-tenant demo policy as the earlier migrations (anon + authenticated full CRUD).
*/

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS customer_since date;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS naics_code text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS sic_code text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS nature_of_business text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS naics_description text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS operations_description text;

CREATE TABLE IF NOT EXISTS account_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  address_type text NOT NULL DEFAULT 'Mailing',
  street text NOT NULL,
  street2 text,
  city text,
  state text,
  zip text,
  country text,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS account_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  title text,
  relationship text,
  email text,
  phone text,
  mobile_phone text,
  dob date,
  is_primary boolean NOT NULL DEFAULT false,
  is_secondary boolean NOT NULL DEFAULT false,
  client_center_access boolean NOT NULL DEFAULT false,
  address text,
  city text,
  state text,
  zip text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS account_addresses_account_idx ON account_addresses(account_id);
CREATE INDEX IF NOT EXISTS account_contacts_account_idx ON account_contacts(account_id);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['account_addresses','account_contacts']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "anon_all_%s" ON %I', t, t);
    EXECUTE format('CREATE POLICY "anon_all_%s" ON %I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;
