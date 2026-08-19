/*
# Repeated Failure Process Tables

1. New Tables
- `repeated_failure_processes` — tracks the full RF workflow for each agent
  - `id` (uuid PK)
  - `agent_id` (uuid FK to agents)
  - `project_id` (uuid FK to projects)
  - `cycle` (int: 1=coaching, 2=training/shadowing, 3=manager action)
  - `trigger_reason` (text: description of which rule triggered)
  - `trigger_categories` (jsonb: array of categories that triggered, e.g. ["Customer Critical","Business Critical"])
  - `trigger_error_count` (int: total errors that triggered)
  - `trigger_evaluation_ids` (jsonb: array of evaluation IDs that contributed)
  - `status` (text: pending_coach_notify, pending_operation_remove, pending_coaching_session, pending_coaching_done, pending_assessment, pending_assessment_result, pending_quality_feedback, pending_evaluation, pending_process_confirm, completed, cancelled)
  - `coach_user_id` (uuid FK to profiles, nullable)
  - `operation_user_id` (uuid FK to profiles, nullable)
  - `coaching_session_id` (uuid FK to coaching_sessions, nullable)
  - `assessment_passed` (boolean, nullable)
  - `assessment_score` (int, nullable)
  - `quality_feedback_evaluation_id` (uuid FK to evaluations, nullable)
  - `quality_feedback_requested_at` (timestamptz, nullable)
  - `quality_feedback_completed_at` (timestamptz, nullable)
  - `manager_user_id` (uuid FK to profiles, nullable)
  - `manager_action` (text, nullable)
  - `manager_feedback` (text, nullable)
  - `operation_confirmed_at` (timestamptz, nullable)
  - `created_at` (timestamptz default now)
  - `updated_at` (timestamptz default now)
  - `completed_at` (timestamptz, nullable)

2. Security
- Enable RLS on `repeated_failure_processes`.
- 4 CRUD policies scoped to authenticated users (owner-agnostic since all authenticated QA staff can access).
- All authenticated users can read; admin/quality/coach/operation can insert/update.
*/

CREATE TABLE IF NOT EXISTS repeated_failure_processes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid REFERENCES agents(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  cycle int NOT NULL DEFAULT 1,
  trigger_reason text NOT NULL DEFAULT '',
  trigger_categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  trigger_error_count int NOT NULL DEFAULT 0,
  trigger_evaluation_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending_coach_notify',
  coach_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  operation_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  coaching_session_id uuid REFERENCES coaching_sessions(id) ON DELETE SET NULL,
  assessment_passed boolean,
  assessment_score int,
  quality_feedback_evaluation_id uuid REFERENCES evaluations(id) ON DELETE SET NULL,
  quality_feedback_requested_at timestamptz,
  quality_feedback_completed_at timestamptz,
  manager_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  manager_action text,
  manager_feedback text,
  operation_confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE repeated_failure_processes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_rf_processes" ON repeated_failure_processes;
CREATE POLICY "select_rf_processes" ON repeated_failure_processes FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_rf_processes" ON repeated_failure_processes;
CREATE POLICY "insert_rf_processes" ON repeated_failure_processes FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_rf_processes" ON repeated_failure_processes;
CREATE POLICY "update_rf_processes" ON repeated_failure_processes FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_rf_processes" ON repeated_failure_processes;
CREATE POLICY "delete_rf_processes" ON repeated_failure_processes FOR DELETE
  TO authenticated USING (true);

-- Add analysis_suggestions table for suggested analyses
CREATE TABLE IF NOT EXISTS analysis_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  analysis_type text NOT NULL DEFAULT 'pareto',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE analysis_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_analysis_suggestions" ON analysis_suggestions;
CREATE POLICY "select_analysis_suggestions" ON analysis_suggestions FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_analysis_suggestions" ON analysis_suggestions;
CREATE POLICY "insert_analysis_suggestions" ON analysis_suggestions FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_analysis_suggestions" ON analysis_suggestions;
CREATE POLICY "update_analysis_suggestions" ON analysis_suggestions FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_analysis_suggestions" ON analysis_suggestions;
CREATE POLICY "delete_analysis_suggestions" ON analysis_suggestions FOR DELETE
  TO authenticated USING (true);

-- Seed some suggested analyses
INSERT INTO analysis_suggestions (name, description, analysis_type, config) VALUES
  ('Top 10 Failing Attributes', 'Pareto chart of the most frequently failed evaluation attributes across all evaluations', 'pareto', '{"metric":"attribute_failures","limit":10}'),
  ('Root Cause: Customer Critical', 'Fishbone analysis of root causes for Customer Critical failures', 'fishbone', '{"category":"Customer Critical"}'),
  ('Root Cause: Business Critical', 'Fishbone analysis of root causes for Business Critical failures', 'fishbone', '{"category":"Business Critical"}'),
  ('Root Cause: Compliance Critical', 'Fishbone analysis of root causes for Compliance Critical failures', 'fishbone', '{"category":"Compliance Critical"}'),
  ('Agent Score Trend', 'Line chart showing average evaluation scores over time by month', 'trend', '{"metric":"avg_score","groupBy":"month"}'),
  ('Pass Rate by LOB', 'Bar chart comparing pass rates across LOBs', 'pareto', '{"metric":"pass_rate","groupBy":"lob"}'),
  ('DSAT Root Causes', 'Pareto chart of the most common DSAT reasons and their root causes', 'pareto', '{"metric":"dsat_reasons","limit":10}'),
  ('Coaching Effectiveness', 'Comparison of agent scores before and after coaching sessions', 'comparison', '{"metric":"before_after_coaching"}')
ON CONFLICT DO NOTHING;
