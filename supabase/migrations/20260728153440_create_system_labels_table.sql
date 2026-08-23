/*
# Create System Branding & Label Management

1. Purpose
   Allows the Administrator to customize all display text in the system
   (system name, page names, menu names, form titles, section titles,
   column headers, field labels, button names, dashboard titles,
   report names, notification titles, role names) without code changes.
   Changes are stored in the database and reflected across the entire app.

2. New Tables
   - `system_labels`
     - `id` (uuid, primary key)
     - `key` (text, unique, not null) — machine key e.g. "system_name", "nav.dashboard"
     - `label` (text, not null) — the display text shown in the UI
     - `category` (text, not null) — grouping: "system", "navigation", "pages", "forms", "buttons", "columns", "fields", "dashboards", "reports", "notifications", "roles"
     - `description` (text) — what this label controls, for the admin editor
     - `updated_at` (timestamptz, default now())
     - `updated_by` (uuid) — the admin who last changed it

3. Security (RLS)
   - Enable RLS on `system_labels`.
   - SELECT: all authenticated users can read labels (they need the current values to render the UI).
   - INSERT/UPDATE/DELETE: only admin role can modify labels. Admin is identified by
     matching the profile row for auth.uid() with role = 'admin'.

4. Seed Data
   - Inserts all default labels used throughout the system so the admin
     sees every editable label on day one.
*/

CREATE TABLE IF NOT EXISTS system_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  label text NOT NULL,
  category text NOT NULL,
  description text,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid
);

ALTER TABLE system_labels ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read labels
DROP POLICY IF EXISTS "read_system_labels" ON system_labels;
CREATE POLICY "read_system_labels"
ON system_labels FOR SELECT
TO authenticated
USING (true);

-- Only admins can insert/update/delete labels
DROP POLICY IF EXISTS "admin_insert_system_labels" ON system_labels;
CREATE POLICY "admin_insert_system_labels"
ON system_labels FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);

DROP POLICY IF EXISTS "admin_update_system_labels" ON system_labels;
CREATE POLICY "admin_update_system_labels"
ON system_labels FOR UPDATE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
)
WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);

DROP POLICY IF EXISTS "admin_delete_system_labels" ON system_labels;
CREATE POLICY "admin_delete_system_labels"
ON system_labels FOR DELETE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);

-- Seed default labels
INSERT INTO system_labels (key, label, category, description) VALUES
  -- System
  ('system_name', 'Malomatia QA', 'system', 'The system name shown in the sidebar and browser tab'),
  ('system_subtitle', 'Call Evaluation System', 'system', 'The subtitle shown under the system name in the sidebar'),

  -- Navigation / Menu names
  ('nav.dashboard', 'Dashboard', 'navigation', 'Sidebar menu item for the Dashboard page'),
  ('nav.new_evaluation', 'New Evaluation', 'navigation', 'Sidebar menu item for creating a new evaluation'),
  ('nav.evaluations', 'Evaluations', 'navigation', 'Sidebar menu item for the Evaluations list'),
  ('nav.coaching', 'Coaching', 'navigation', 'Sidebar menu item for Coaching'),
  ('nav.coaching_dashboard', 'Coaching Dashboard', 'navigation', 'Sidebar menu item for the Coaching Dashboard'),
  ('nav.calibration', 'Calibration', 'navigation', 'Sidebar menu item for Calibration'),
  ('nav.analysis', 'Analysis', 'navigation', 'Sidebar menu item for Analysis'),
  ('nav.reports', 'Reports', 'navigation', 'Sidebar menu item for Reports'),
  ('nav.agent_performance', 'Agent Performance', 'navigation', 'Sidebar menu item for Agent Performance'),
  ('nav.agents', 'Agents', 'navigation', 'Sidebar menu item for Agents'),
  ('nav.projects', 'Projects', 'navigation', 'Sidebar menu item for Projects'),
  ('nav.users', 'User Management', 'navigation', 'Sidebar menu item for User Management'),
  ('nav.audit', 'Audit History', 'navigation', 'Sidebar menu item for Audit History'),
  ('nav.glossary', 'Glossary', 'navigation', 'Sidebar menu item for Glossary'),
  ('nav.branding', 'System Branding', 'navigation', 'Sidebar menu item for System Branding'),
  ('nav.agent_portal', 'My Portal', 'navigation', 'Sidebar menu item for the Agent Portal'),

  -- Page titles
  ('page.dashboard', 'Dashboard', 'pages', 'Title of the Dashboard page'),
  ('page.new_evaluation', 'New Evaluation', 'pages', 'Title of the New Evaluation page'),
  ('page.evaluations', 'Evaluations', 'pages', 'Title of the Evaluations list page'),
  ('page.evaluation_detail', 'Evaluation Detail', 'pages', 'Title of the Evaluation Detail page'),
  ('page.coaching', 'Coaching', 'pages', 'Title of the Coaching page'),
  ('page.coaching_dashboard', 'Coaching Dashboard', 'pages', 'Title of the Coaching Dashboard page'),
  ('page.calibration', 'Calibration', 'pages', 'Title of the Calibration page'),
  ('page.analysis', 'Analysis', 'pages', 'Title of the Analysis page'),
  ('page.reports', 'Reports', 'pages', 'Title of the Reports page'),
  ('page.agent_performance', 'Agent Performance', 'pages', 'Title of the Agent Performance page'),
  ('page.agents', 'Agents', 'pages', 'Title of the Agents page'),
  ('page.projects', 'Projects', 'pages', 'Title of the Projects page'),
  ('page.users', 'User Management', 'pages', 'Title of the User Management page'),
  ('page.audit', 'Audit History', 'pages', 'Title of the Audit History page'),
  ('page.glossary', 'Glossary', 'pages', 'Title of the Glossary page'),
  ('page.branding', 'System Branding & Label Management', 'pages', 'Title of the Branding page'),
  ('page.agent_portal', 'My Portal', 'pages', 'Title of the Agent Portal page'),

  -- Buttons
  ('button.save', 'Save', 'buttons', 'Save button text'),
  ('button.cancel', 'Cancel', 'buttons', 'Cancel button text'),
  ('button.create', 'Create', 'buttons', 'Create button text'),
  ('button.edit', 'Edit', 'buttons', 'Edit button text'),
  ('button.delete', 'Delete', 'buttons', 'Delete button text'),
  ('button.export_csv', 'CSV', 'buttons', 'CSV export button text'),
  ('button.export_excel', 'Excel', 'buttons', 'Excel export button text'),
  ('button.export_pdf', 'PDF', 'buttons', 'PDF export button text'),
  ('button.new_evaluation', 'New Evaluation', 'buttons', 'New Evaluation button text'),
  ('button.create_coaching', 'Create Coaching', 'buttons', 'Create Coaching button text'),
  ('button.new_session', 'New Session', 'buttons', 'New Calibration Session button text'),
  ('button.clear_filters', 'Clear Filters', 'buttons', 'Clear Filters button text'),

  -- Column headers
  ('column.agent', 'Agent', 'columns', 'Column header for Agent name'),
  ('column.project', 'Project', 'columns', 'Column header for Project'),
  ('column.lob', 'LOB', 'columns', 'Column header for LOB'),
  ('column.score', 'Score', 'columns', 'Column header for Score'),
  ('column.pass_fail', 'Pass/Fail', 'columns', 'Column header for Pass/Fail'),
  ('column.date', 'Date', 'columns', 'Column header for Date'),
  ('column.status', 'Status', 'columns', 'Column header for Status'),
  ('column.transaction_id', 'Transaction ID', 'columns', 'Column header for Transaction ID'),
  ('column.transaction_type', 'Transaction Type', 'columns', 'Column header for Transaction Type'),
  ('column.coach', 'Coach', 'columns', 'Column header for Coach'),
  ('column.team_leader', 'Team Leader', 'columns', 'Column header for Team Leader'),
  ('column.duration', 'Duration', 'columns', 'Column header for Duration'),

  -- Field labels
  ('field.agent_name', 'Agent Name', 'fields', 'Field label for Agent Name'),
  ('field.transaction_link', 'Transaction Link', 'fields', 'Field label for Transaction Link'),
  ('field.caller_number', 'Caller Number', 'fields', 'Field label for Caller Number'),
  ('field.call_duration', 'Call Duration', 'fields', 'Field label for Call Duration'),
  ('field.evaluation_date', 'Evaluation Date', 'fields', 'Field label for Evaluation Date'),
  ('field.project', 'Project', 'fields', 'Field label for Project selector'),
  ('field.lob', 'LOB', 'fields', 'Field label for LOB selector'),
  ('field.task_type', 'Task Type', 'fields', 'Field label for Task Type'),
  ('field.transaction_type', 'Transaction Type', 'fields', 'Field label for Transaction Type'),
  ('field.notes', 'Notes', 'fields', 'Field label for Notes'),
  ('field.feedback_to_agent', 'Feedback to Agent', 'fields', 'Field label for Feedback to Agent'),
  ('field.strength_points', 'Strength Points', 'fields', 'Field label for Strength Points'),
  ('field.improvement_points', 'Improvement Points', 'fields', 'Field label for Improvement Points'),
  ('field.action_points', 'Action Points', 'fields', 'Field label for Action Points'),
  ('field.coaching_duration', 'Coaching Duration', 'fields', 'Field label for Coaching Duration'),

  -- Section titles
  ('section.call_details', 'Call Details', 'forms', 'Section title for Call Details'),
  ('section.evaluation_form', 'Evaluation Form', 'forms', 'Section title for Evaluation Form'),
  ('section.scoring', 'Scoring Configuration', 'forms', 'Section title for Scoring Configuration'),
  ('section.form_config', 'Form Configuration', 'forms', 'Section title for Form Configuration'),
  ('section.per_lob_forms', 'Per-LOB Evaluation Forms', 'forms', 'Section title for Per-LOB forms'),
  ('section.development_areas', 'Development Areas', 'forms', 'Section title for Development Areas'),

  -- Dashboard titles
  ('dashboard.main_title', 'QA Evaluation Dashboard', 'dashboards', 'Main dashboard title'),
  ('dashboard.total_evaluations', 'Total Evaluations', 'dashboards', 'Stat card: total evaluations'),
  ('dashboard.pass_rate', 'Pass Rate', 'dashboards', 'Stat card: pass rate'),
  ('dashboard.avg_score', 'Average Score', 'dashboards', 'Stat card: average score'),
  ('dashboard.active_agents', 'Active Agents', 'dashboards', 'Stat card: active agents'),
  ('dashboard.recent_evaluations', 'Recent Evaluations', 'dashboards', 'Section: recent evaluations'),
  ('dashboard.score_distribution', 'Score Distribution', 'dashboards', 'Chart: score distribution'),

  -- Report names
  ('report.evaluation_summary', 'Evaluation Summary Report', 'reports', 'Report name: evaluation summary'),
  ('report.coaching_summary', 'Coaching Summary Report', 'reports', 'Report name: coaching summary'),
  ('report.calibration_summary', 'Calibration Summary Report', 'reports', 'Report name: calibration summary'),
  ('report.agent_performance', 'Agent Performance Report', 'reports', 'Report name: agent performance'),

  -- Notification titles
  ('notification.new_evaluation', 'New Evaluation', 'notifications', 'Notification title for new evaluation'),
  ('notification.coaching_scheduled', 'Coaching Session Scheduled', 'notifications', 'Notification title for coaching scheduled'),
  ('notification.coaching_conducted', 'Coaching Session Conducted', 'notifications', 'Notification title for coaching conducted'),
  ('notification.calibration_complete', 'Calibration Complete', 'notifications', 'Notification title for calibration complete'),

  -- Role names
  ('role.admin', 'Administrator', 'roles', 'Display name for the admin role'),
  ('role.quality', 'Quality', 'roles', 'Display name for the quality role'),
  ('role.operation', 'Operation', 'roles', 'Display name for the operation role'),
  ('role.supervisor', 'Supervisor', 'roles', 'Display name for the supervisor role'),
  ('role.agent', 'Agent', 'roles', 'Display name for the agent role')

ON CONFLICT (key) DO NOTHING;
