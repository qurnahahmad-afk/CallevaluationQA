ALTER TABLE agents ADD COLUMN IF NOT EXISTS coach_name text;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS manager_name text;

-- Add unique constraint on email and mena_me_code for upsert
CREATE UNIQUE INDEX IF NOT EXISTS agents_email_unique ON agents(email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS agents_mena_me_code_unique ON agents(mena_me_code) WHERE mena_me_code IS NOT NULL;
