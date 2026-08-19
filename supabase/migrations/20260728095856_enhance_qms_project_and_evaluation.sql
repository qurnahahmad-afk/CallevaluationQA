-- Add LOB config and transaction types to projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS lob_config text[] DEFAULT '{}';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS transaction_types text[] DEFAULT '{}';

-- Add transaction_link to evaluations (replaces ticket_link conceptually, but keep ticket_link for data safety)
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS transaction_link text;

-- Copy existing ticket_link data to transaction_link
UPDATE evaluations SET transaction_link = ticket_link WHERE transaction_link IS NULL AND ticket_link IS NOT NULL;

-- Remove monitoring_type column (no longer needed)
ALTER TABLE evaluations DROP COLUMN IF EXISTS monitoring_type;
