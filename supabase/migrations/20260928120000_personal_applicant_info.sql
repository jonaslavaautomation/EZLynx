/*
# Personal Lines Applicant info

Adds the applicant fields captured on the Personal Lines Applicant page: name details, driver's license,
education / industry / occupation, VIP flag, preferred language, contact preferences, multiple phones and
emails, and residence details on addresses (county, ZIP+4, time at address).

SSN: only the last four digits are stored (ssn_last4). This demo database allows anonymous access, so full
Social Security numbers must never be written to it.

Security: same single-tenant demo policy as the earlier migrations (anon + authenticated full CRUD).
*/

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS prefix text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS middle_initial text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS suffix text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS maiden_name text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS nickname text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS gender text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS ssn_last4 text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS dl_number text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS dl_status text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS dl_state text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS education text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS industry text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS occupation_years int;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS prior_employer_years int;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS account_name text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS preferred_language text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS vip boolean NOT NULL DEFAULT false;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS phones jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS emails jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS bridge_email boolean NOT NULL DEFAULT false;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS contact_method text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS contact_time text;

ALTER TABLE account_addresses ADD COLUMN IF NOT EXISTS county text;
ALTER TABLE account_addresses ADD COLUMN IF NOT EXISTS zip_suffix text;
ALTER TABLE account_addresses ADD COLUMN IF NOT EXISTS unit text;
ALTER TABLE account_addresses ADD COLUMN IF NOT EXISTS years_at_address int;
ALTER TABLE account_addresses ADD COLUMN IF NOT EXISTS months_at_address int;
