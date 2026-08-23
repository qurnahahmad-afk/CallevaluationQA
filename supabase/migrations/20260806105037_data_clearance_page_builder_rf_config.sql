/*
# Data Clearance, Dynamic Page Builder, RF Configuration

1. New Tables
- `custom_pages` — Admin-created pages with title, description, type, layout config, fields, filters, charts, buttons, permissions, draft/publish status.
- `rf_config` — Repeated Failure rules: monitoring period, error thresholds per category, escalation levels with conditions and actions, project/LOB/task type scoping.
- `data_clearance_log` — Audit trail for every data clearance operation: admin name, modules, date filter, record count, reason, timestamp.

2. Security
- RLS enabled on all tables.
- Only admin role can insert/update/delete custom_pages, rf_config, data_clearance_log.
- All authenticated users can read custom_pages and rf_config (to render nav and apply rules).
- All authenticated users can read data_clearance_log (audit visibility).

3. Notes
- custom_pages.layout is a jsonb column storing the full page builder configuration (fields, filters, tables, charts, buttons, actions, workflows).
- rf_config.rules is a jsonb column storing an array of escalation levels, each with conditions and actions.
- rf_config is project-scoped (project_id nullable = applies to all projects).
*/

CREATE TABLE IF NOT EXISTS custom_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  page_type text NOT NULL DEFAULT 'custom', -- dashboard, form, report, analysis, table, custom
  slug text NOT NULL,
  layout jsonb NOT NULL DEFAULT '{}'::jsonb,
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  filters jsonb NOT NULL DEFAULT '[]'::jsonb,
  charts jsonb NOT NULL DEFAULT '[]'::jsonb,
  tables jsonb NOT NULL DEFAULT '[]'::jsonb,
  buttons jsonb NOT NULL DEFAULT '[]'::jsonb,
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  workflows jsonb NOT NULL DEFAULT '[]'::jsonb,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft', -- draft, published, disabled
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE custom_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_custom_pages" ON custom_pages;
CREATE POLICY "select_custom_pages" ON custom_pages FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_custom_pages" ON custom_pages;
CREATE POLICY "insert_custom_pages" ON custom_pages FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "update_custom_pages" ON custom_pages;
CREATE POLICY "update_custom_pages" ON custom_pages FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "delete_custom_pages" ON custom_pages;
CREATE POLICY "delete_custom_pages" ON custom_pages FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- RF Configuration
CREATE TABLE IF NOT EXISTS rf_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  monitoring_period_months integer NOT NULL DEFAULT 4,
  customer_critical_threshold integer NOT NULL DEFAULT 2,
  business_critical_threshold integer NOT NULL DEFAULT 2,
  compliance_critical_threshold integer NOT NULL DEFAULT 2,
  non_critical_threshold integer NOT NULL DEFAULT 4,
  total_failed_evaluations integer NOT NULL DEFAULT 0,
  combined_critical_threshold integer NOT NULL DEFAULT 3,
  pass_fail_condition text NOT NULL DEFAULT 'pass',
  rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rf_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_rf_config" ON rf_config;
CREATE POLICY "select_rf_config" ON rf_config FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_rf_config" ON rf_config;
CREATE POLICY "insert_rf_config" ON rf_config FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "update_rf_config" ON rf_config;
CREATE POLICY "update_rf_config" ON rf_config FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "delete_rf_config" ON rf_config;
CREATE POLICY "delete_rf_config" ON rf_config FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Data Clearance Log
CREATE TABLE IF NOT EXISTS data_clearance_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid REFERENCES profiles(id),
  admin_name text NOT NULL,
  modules text[] NOT NULL DEFAULT '{}',
  date_filter date NOT NULL,
  record_count integer NOT NULL DEFAULT 0,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE data_clearance_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_data_clearance_log" ON data_clearance_log;
CREATE POLICY "select_data_clearance_log" ON data_clearance_log FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_data_clearance_log" ON data_clearance_log;
CREATE POLICY "insert_data_clearance_log" ON data_clearance_log FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Seed default RF config
INSERT INTO rf_config (name, description, project_id, monitoring_period_months, customer_critical_threshold, business_critical_threshold, compliance_critical_threshold, non_critical_threshold, combined_critical_threshold, rules, active, sort_order)
VALUES (
  'Default RF Rules',
  'Default repeated failure detection rules — 4 month monitoring period',
  NULL,
  4, 2, 2, 2, 4, 3,
  '[{"level":1,"name":"Cycle 1 — Coaching","conditions":{"customer_critical":2,"business_critical":2,"compliance_critical":2,"non_critical":4,"combined_critical":3},"actions":[{"name":"Coaching Session","type":"coaching"},{"name":"Notify Team Leader","type":"notify","role":"team_leader"}]},{"level":2,"name":"Cycle 2 — Training & Shadowing","conditions":{"any_critical":1},"actions":[{"name":"Refresher Training","type":"training"},{"name":"Increased QA Monitoring","type":"monitoring"},{"name":"Notify Supervisor","type":"notify","role":"supervisor"}]},{"level":3,"name":"Cycle 3 — Manager Action","conditions":{"any_critical":1},"actions":[{"name":"Escalate to Manager","type":"escalate_manager"},{"name":"Performance Improvement Plan (PIP)","type":"pip"},{"name":"Written Warning","type":"written_warning"}]}]'::jsonb,
  true,
  0
) ON CONFLICT DO NOTHING;
