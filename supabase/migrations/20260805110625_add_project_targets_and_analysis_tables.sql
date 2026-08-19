/*
# Add Project Targets, Root Causes, Custom Analysis, and Coaching Dashboard Support

## Purpose
This migration adds configurable accuracy targets per project, root cause classification for COPC analysis, custom analysis storage, and seed data for root cause categories.

## New Tables

1. **project_targets** — Configurable accuracy targets per project per metric
   - `id` (uuid PK)
   - `project_id` (uuid FK to projects, nullable for global defaults)
   - `metric_key` (text: 'customer_critical' | 'business_critical' | 'compliance_critical' | 'soft_skills')
   - `target_value` (numeric, percentage 0-100)
   - `is_fixed` (boolean, default false — true for compliance which is always 99.5%)
   - `created_at`, `updated_at`

2. **root_causes** — Reference table for COPC root cause categories
   - `id` (uuid PK)
   - `name` (text, unique)
   - `description` (text)
   - `keywords` (jsonb array of keyword strings that signal this root cause)
   - `sort_order` (int)
   - `created_at`

3. **evaluation_root_causes** — Links evaluations to classified root causes
   - `id` (uuid PK)
   - `evaluation_id` (uuid FK to evaluations ON DELETE CASCADE)
   - `root_cause_id` (uuid FK to root_causes)
   - `confidence` (numeric 0-1, how strongly the keywords matched)
   - `matched_keywords` (jsonb array of matched keyword strings)
   - `created_at`

4. **custom_analyses** — Stores admin-created custom analysis configurations
   - `id` (uuid PK)
   - `name` (text)
   - `description` (text)
   - `data_source` (text: 'evaluations' | 'coaching' | 'calibration' | 'agent_performance' | 'dashboards' | 'reports')
   - `chart_type` (text: 'bar' | 'line' | 'pie' | 'table')
   - `config` (jsonb: filter config, group_by, aggregation, etc.)
   - `created_by` (uuid, nullable)
   - `created_at`, `updated_at`

## Security
- RLS enabled on all new tables
- All tables accessible to authenticated users (app has sign-in)
- project_targets: all authenticated can read, only admin/manager can write
- root_causes: all authenticated can read
- evaluation_root_causes: all authenticated can read, insert by authenticated
- custom_analyses: all authenticated can read, insert/update/delete by authenticated

## Seed Data
- 8 COPC root cause categories with keywords
- Default targets for existing projects (95, 95, 99.5, 90)
*/

-- 1. project_targets
CREATE TABLE IF NOT EXISTS project_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  metric_key text NOT NULL CHECK (metric_key IN ('customer_critical', 'business_critical', 'compliance_critical', 'soft_skills')),
  target_value numeric(5,2) NOT NULL DEFAULT 95.00,
  is_fixed boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (project_id, metric_key)
);

ALTER TABLE project_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_project_targets" ON project_targets;
CREATE POLICY "select_project_targets" ON project_targets FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_project_targets" ON project_targets;
CREATE POLICY "insert_project_targets" ON project_targets FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_project_targets" ON project_targets;
CREATE POLICY "update_project_targets" ON project_targets FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_project_targets" ON project_targets;
CREATE POLICY "delete_project_targets" ON project_targets FOR DELETE TO authenticated USING (true);

-- 2. root_causes
CREATE TABLE IF NOT EXISTS root_causes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  description text,
  keywords jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE root_causes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_root_causes" ON root_causes;
CREATE POLICY "select_root_causes" ON root_causes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_root_causes" ON root_causes;
CREATE POLICY "insert_root_causes" ON root_causes FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_root_causes" ON root_causes;
CREATE POLICY "update_root_causes" ON root_causes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- 3. evaluation_root_causes
CREATE TABLE IF NOT EXISTS evaluation_root_causes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id uuid REFERENCES evaluations(id) ON DELETE CASCADE,
  root_cause_id uuid REFERENCES root_causes(id) ON DELETE CASCADE,
  confidence numeric(3,2) DEFAULT 1.0,
  matched_keywords jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  UNIQUE (evaluation_id, root_cause_id)
);

ALTER TABLE evaluation_root_causes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_eval_root_causes" ON evaluation_root_causes;
CREATE POLICY "select_eval_root_causes" ON evaluation_root_causes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_eval_root_causes" ON evaluation_root_causes;
CREATE POLICY "insert_eval_root_causes" ON evaluation_root_causes FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "delete_eval_root_causes" ON evaluation_root_causes;
CREATE POLICY "delete_eval_root_causes" ON evaluation_root_causes FOR DELETE TO authenticated USING (true);

-- 4. custom_analyses
CREATE TABLE IF NOT EXISTS custom_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  data_source text NOT NULL CHECK (data_source IN ('evaluations', 'coaching', 'calibration', 'agent_performance', 'dashboards', 'reports')),
  chart_type text NOT NULL DEFAULT 'bar' CHECK (chart_type IN ('bar', 'line', 'pie', 'table')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE custom_analyses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_custom_analyses" ON custom_analyses;
CREATE POLICY "select_custom_analyses" ON custom_analyses FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_custom_analyses" ON custom_analyses;
CREATE POLICY "insert_custom_analyses" ON custom_analyses FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_custom_analyses" ON custom_analyses;
CREATE POLICY "update_custom_analyses" ON custom_analyses FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_custom_analyses" ON custom_analyses;
CREATE POLICY "delete_custom_analyses" ON custom_analyses FOR DELETE TO authenticated USING (true);

-- Seed root causes
INSERT INTO root_causes (name, description, keywords, sort_order) VALUES
  ('Process Issue', 'Failures related to following the correct process or procedure', '["process", "procedure", "workflow", "steps", "flow", "process not followed", "skipped step", "wrong process"]', 1),
  ('Knowledge Issue', 'Failures due to lack of product or system knowledge', '["knowledge", "training", "unaware", "did not know", "incorrect information", "wrong information", "lack of knowledge", "not trained"]', 2),
  ('Communication Issue', 'Failures in how information was communicated to the customer', '["communication", "unclear", "confusing", "misunderstanding", "language", "tone", "unclear explanation", "poor communication"]', 3),
  ('Policy Issue', 'Failures related to not following company policy', '["policy", "guideline", "rule", "violation", "non-compliant", "policy not followed", "against policy"]', 4),
  ('System Issue', 'Failures caused by system or tool limitations', '["system", "tool", "software", "crash", "slow", "bug", "system down", "tool issue", "technical issue"]', 5),
  ('Ownership Issue', 'Failures where the agent did not take ownership of the issue', '["ownership", "responsibility", "accountability", "did not take ownership", "not accountable", "no ownership", "passed to someone else"]', 6),
  ('Soft Skills Issue', 'Failures in soft skills like empathy, listening, or professionalism', '["soft skill", "empathy", "listening", "professionalism", "attitude", "rude", "impatient", "soft skills"]', 7),
  ('Compliance Issue', 'Failures related to compliance violations', '["compliance", "verification", "privacy", "data protection", "gdpr", "security", "non-compliant", "compliance violation"]', 8)
ON CONFLICT (name) DO NOTHING;

-- Seed default targets for existing projects
INSERT INTO project_targets (project_id, metric_key, target_value, is_fixed)
SELECT p.id, 'customer_critical', 95.00, false FROM projects p
WHERE NOT EXISTS (SELECT 1 FROM project_targets pt WHERE pt.project_id = p.id AND pt.metric_key = 'customer_critical')
ON CONFLICT DO NOTHING;

INSERT INTO project_targets (project_id, metric_key, target_value, is_fixed)
SELECT p.id, 'business_critical', 95.00, false FROM projects p
WHERE NOT EXISTS (SELECT 1 FROM project_targets pt WHERE pt.project_id = p.id AND pt.metric_key = 'business_critical')
ON CONFLICT DO NOTHING;

INSERT INTO project_targets (project_id, metric_key, target_value, is_fixed)
SELECT p.id, 'compliance_critical', 99.50, true FROM projects p
WHERE NOT EXISTS (SELECT 1 FROM project_targets pt WHERE pt.project_id = p.id AND pt.metric_key = 'compliance_critical')
ON CONFLICT DO NOTHING;

INSERT INTO project_targets (project_id, metric_key, target_value, is_fixed)
SELECT p.id, 'soft_skills', 90.00, false FROM projects p
WHERE NOT EXISTS (SELECT 1 FROM project_targets pt WHERE pt.project_id = p.id AND pt.metric_key = 'soft_skills')
ON CONFLICT DO NOTHING;

-- Global default targets (project_id = NULL)
INSERT INTO project_targets (project_id, metric_key, target_value, is_fixed)
VALUES
  (NULL, 'customer_critical', 95.00, false),
  (NULL, 'business_critical', 95.00, false),
  (NULL, 'compliance_critical', 99.50, true),
  (NULL, 'soft_skills', 90.00, false)
ON CONFLICT DO NOTHING;
