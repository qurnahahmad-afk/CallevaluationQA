/*
# Expand the system-wide label catalog

1. Purpose
- Adds shared label entries for Call Duration, Email Date, Data Clearance, and common evaluation sections.
- These entries let the Branding page control wording wherever the application uses the shared label helper.

2. Modified Data
- Existing rows are not changed or deleted.
- New rows are inserted only when their key does not already exist.
- The existing `field.caller_number` label remains Case ID.

3. Security
- No new tables or permissions are introduced.
- Existing system_labels row-level security remains unchanged; only administrators can edit labels.

4. Notes
- The application listens for label changes so open pages refresh their visible wording after an administrator saves a label.
*/

INSERT INTO system_labels (key, label, category, description)
VALUES
  ('field.email_date', 'Email Date', 'fields', 'Date associated with the email; time is not shown'),
  ('column.call_duration', 'Call Duration', 'columns', 'Call duration shown as HH:MM:SS'),
  ('column.email_date', 'Email Date', 'columns', 'Email date shown without time'),
  ('nav.data_clearance', 'Data Clearance', 'navigation', 'Data clearance navigation item'),
  ('page.data_clearance', 'Data Clearance', 'pages', 'Data clearance page title'),
  ('section.agent_call_info', 'Agent & Call Info', 'forms', 'Agent and call information section'),
  ('section.coaching', 'Coaching', 'forms', 'Coaching information section'),
  ('section.qa_scorecard', 'QA Scorecard', 'forms', 'Quality scorecard section'),
  ('section.narratives', 'Narratives', 'forms', 'Narrative feedback section'),
  ('section.diagnostics', 'Diagnostics', 'forms', 'Diagnostic details section')
ON CONFLICT (key) DO NOTHING;
