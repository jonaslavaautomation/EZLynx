/*
# User settings and login activity

- user_settings: one row per staff member — contact info used in email signatures, role, preferences,
  ACORD form settings (preferred address, typed/uploaded signature), email signature, and the optional
  sign-in password (salted PBKDF2 hash only) and authenticator-app (TOTP) two-factor settings.
- login_events: sign-in / sign-out and security events shown on the Login Activity tab.

Security: same single-tenant demo policy as the earlier migrations (anon + authenticated full CRUD). The
sign-in screen is a training-grade lock, not real authentication: anyone with the anon key can read these
rows. Move to Supabase Auth before storing real client data.
*/

CREATE TABLE IF NOT EXISTS user_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_name text NOT NULL UNIQUE,
  first_name text,
  middle_initial text,
  last_name text,
  email text,
  phone text,
  mobile_phone text,
  role_detail text,
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  acord jsonb NOT NULL DEFAULT '{}'::jsonb,
  email_signature text,
  reply_to text,
  signature_insert text NOT NULL DEFAULT 'smart_tag',
  signature_global_default boolean NOT NULL DEFAULT false,
  display_global boolean NOT NULL DEFAULT false,
  password_hash text,
  password_salt text,
  password_updated_at timestamptz,
  totp_secret text,
  totp_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS login_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_name text NOT NULL,
  event text NOT NULL,
  ip text,
  user_agent text,
  trusted boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS login_events_staff_idx ON login_events(staff_name, created_at DESC);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['user_settings','login_events']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "anon_all_%s" ON %I', t, t);
    EXECUTE format('CREATE POLICY "anon_all_%s" ON %I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;
