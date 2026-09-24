/*
# Policy management, commissions, Communication Center and Reports 5.0

Adds the tables behind three navigation menus:

- Policy Mgmt / Commissions: claim_transactions, commission_statements, commission_statement_lines,
  commission_rules (the "Service Team Rules" that split agency commission between producers/CSRs),
  service-team columns on staff, and a rewritten_from_policy_id link on policies.
- Communication Center: email_campaigns, recipient_lists, suppressions (email + SMS opt-outs),
  message_templates (text/email templates), mail_items (postal mailbox log), esign_templates,
  plus email sender settings on agency_settings.
- Reports 5.0: saved_reports (saved / favorite / shared / scheduled reports).

Security: same single-tenant demo policy as the earlier migrations (anon + authenticated full CRUD).
*/

ALTER TABLE staff ADD COLUMN IF NOT EXISTS service_team boolean NOT NULL DEFAULT true;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS external boolean NOT NULL DEFAULT false;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS producer_code text;

ALTER TABLE policies ADD COLUMN IF NOT EXISTS rewritten_from_policy_id uuid REFERENCES policies(id) ON DELETE SET NULL;

ALTER TABLE agency_settings ADD COLUMN IF NOT EXISTS email_from_name text;
ALTER TABLE agency_settings ADD COLUMN IF NOT EXISTS email_reply_to text;
ALTER TABLE agency_settings ADD COLUMN IF NOT EXISTS email_footer text;

CREATE TABLE IF NOT EXISTS claim_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  type text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  transaction_date date NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS commission_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier text NOT NULL,
  statement_date date NOT NULL,
  period_start date,
  period_end date,
  total_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Open',
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS commission_statement_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id uuid NOT NULL REFERENCES commission_statements(id) ON DELETE CASCADE,
  policy_id uuid REFERENCES policies(id) ON DELETE SET NULL,
  policy_number text NOT NULL,
  insured_name text,
  transaction_type text NOT NULL DEFAULT 'New Business',
  premium numeric NOT NULL DEFAULT 0,
  commission_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS commission_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  staff_name text NOT NULL,
  business_type text NOT NULL DEFAULT 'All',
  line_of_business text,
  carrier text,
  split_percent numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recipient_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  recipient_list_id uuid REFERENCES recipient_lists(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'Draft',
  scheduled_at timestamptz,
  sent_at timestamptz,
  sent_count int NOT NULL DEFAULT 0,
  suppressed_count int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL DEFAULT 'Email',
  address text NOT NULL,
  reason text NOT NULL DEFAULT 'Manual',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL DEFAULT 'SMS',
  name text NOT NULL,
  subject text,
  body text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mail_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES accounts(id) ON DELETE CASCADE,
  direction text NOT NULL DEFAULT 'Inbound',
  mail_type text NOT NULL DEFAULT 'Letter',
  correspondent text,
  description text,
  mail_date date NOT NULL,
  status text NOT NULL DEFAULT 'Received',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS esign_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'Application',
  message text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS saved_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  report_key text NOT NULL,
  owner text,
  favorite boolean NOT NULL DEFAULT false,
  shared boolean NOT NULL DEFAULT false,
  schedule text,
  schedule_email text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS claim_transactions_claim_idx ON claim_transactions(claim_id);
CREATE INDEX IF NOT EXISTS commission_statement_lines_statement_idx ON commission_statement_lines(statement_id);
CREATE INDEX IF NOT EXISTS mail_items_account_idx ON mail_items(account_id);
CREATE UNIQUE INDEX IF NOT EXISTS suppressions_channel_address_idx ON suppressions(channel, lower(address));

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['claim_transactions','commission_statements','commission_statement_lines','commission_rules','recipient_lists',
                           'email_campaigns','suppressions','message_templates','mail_items','esign_templates','saved_reports']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "anon_all_%s" ON %I', t, t);
    EXECUTE format('CREATE POLICY "anon_all_%s" ON %I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;
