/*
# Settings administration, Support and Marketplace

- Settings: app_config (keyed JSON settings: activity, certificate, plugins, email subscriptions, lines of
  business), labels (+ accounts.labels), lead_sources, automation_workflows + automation_runs (Automation
  Center workflows whose steps run at timed intervals), billing_companies, departments,
  carrier_rating_setup (Carrier Quoting Setup logins), form_templates, proposal_templates (Proposal / SOI).
- Support: support_tickets (chat / ticket transcripts), training_progress, training_registrations.
- Marketplace: integrations (activated integrations and their settings).

Security: same single-tenant demo policy as the earlier migrations (anon + authenticated full CRUD).
Carrier passwords are never stored; only the login username and whether a login has been set.
*/

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS labels jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS app_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text NOT NULL DEFAULT '#dc2626',
  description text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lead_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS automation_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  trigger text NOT NULL,
  trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES automation_workflows(id) ON DELETE CASCADE,
  account_id uuid REFERENCES accounts(id) ON DELETE CASCADE,
  policy_id uuid REFERENCES policies(id) ON DELETE CASCADE,
  step_index int NOT NULL DEFAULT 0,
  due_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'Pending',
  result text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS billing_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  company_type text NOT NULL DEFAULT 'Premium Finance',
  phone text,
  email text,
  address text,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  members jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS carrier_rating_setup (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier text NOT NULL UNIQUE,
  username text,
  agency_code text,
  login_set boolean NOT NULL DEFAULT false,
  enabled_lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS form_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  form_type text NOT NULL,
  fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS proposal_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  template_type text NOT NULL DEFAULT 'Proposal',
  intro text,
  closing text,
  disclaimer text,
  include_coverages boolean NOT NULL DEFAULT true,
  include_premium boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject text NOT NULL,
  category text NOT NULL DEFAULT 'General',
  priority text NOT NULL DEFAULT 'Normal',
  status text NOT NULL DEFAULT 'Open',
  requester text,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS training_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_name text NOT NULL,
  lesson_key text NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS training_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_key text NOT NULL,
  staff_name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'Setup Required',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  activated_by text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS automation_runs_due_idx ON automation_runs(status, due_at);
CREATE UNIQUE INDEX IF NOT EXISTS training_progress_unique_idx ON training_progress(staff_name, lesson_key);
CREATE UNIQUE INDEX IF NOT EXISTS training_registrations_unique_idx ON training_registrations(session_key, staff_name);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['app_config','labels','lead_sources','automation_workflows','automation_runs','billing_companies','departments',
                           'carrier_rating_setup','form_templates','proposal_templates','support_tickets','training_progress',
                           'training_registrations','integrations']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "anon_all_%s" ON %I', t, t);
    EXECUTE format('CREATE POLICY "anon_all_%s" ON %I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;
