/*
# Create accounts table (single-tenant, no auth)

1. New Tables
- `accounts`
  - `id` (uuid, primary key)
  - `first_name` (text, not null)
  - `last_name` (text, not null)
  - `email` (text, not null)
  - `phone` (text)
  - `address` (text)
  - `city` (text)
  - `state` (text)
  - `zip` (text)
  - `policy_type` (text) — e.g. Auto, Home, Commercial
  - `status` (text) — Active, Pending, Inactive
  - `created_at` (timestamptz, defaults to now())

2. Security
- Enable RLS on `accounts`.
- Allow anon + authenticated CRUD because this is a single-tenant demo app with no sign-in.

3. Seed Data
- Two dummy accounts inserted for search testing.
*/

CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text NOT NULL,
  phone text,
  address text,
  city text,
  state text,
  zip text,
  policy_type text,
  status text DEFAULT 'Active',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_accounts" ON accounts;
CREATE POLICY "anon_select_accounts" ON accounts FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_accounts" ON accounts;
CREATE POLICY "anon_insert_accounts" ON accounts FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_accounts" ON accounts;
CREATE POLICY "anon_update_accounts" ON accounts FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_accounts" ON accounts;
CREATE POLICY "anon_delete_accounts" ON accounts FOR DELETE
  TO anon, authenticated USING (true);

-- Seed two dummy accounts (idempotent: only insert if table is empty)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM accounts LIMIT 1) THEN
    INSERT INTO accounts (first_name, last_name, email, phone, address, city, state, zip, policy_type, status) VALUES
      ('Sarah', 'Mitchell', 'sarah.mitchell@email.com', '(555) 218-4471', '1428 Oakwood Drive', 'Austin', 'TX', '78704', 'Auto', 'Active'),
      ('James', 'Carter', 'james.carter@email.com', '(555) 639-0024', '275 Riverside Lane', 'Denver', 'CO', '80205', 'Home', 'Pending');
  END IF;
END $$;
