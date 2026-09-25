/*
# Commercial Applicant info

Adds the business fields captured on the Commercial Applicant page (business contact details, legal entity,
tax ID, GL code, date business started) and the Lead Info section (priority, probability of sale, status).

Security: same single-tenant demo policy as the earlier migrations (anon + authenticated full CRUD).
*/

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS phone_ext text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS fax text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS legal_entity_type text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS tax_id text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS gl_code text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS date_business_started date;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS lead_priority text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS probability_of_sale int;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS lead_status text;
