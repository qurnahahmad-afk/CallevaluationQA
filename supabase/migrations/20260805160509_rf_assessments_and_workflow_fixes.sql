-- RF Assessments table: coach builds custom questions, agent submits, pass/fail flows back
CREATE TABLE IF NOT EXISTS rf_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rf_process_id uuid NOT NULL REFERENCES repeated_failure_processes(id) ON DELETE CASCADE,
  coach_user_id uuid REFERENCES profiles(id),
  title text NOT NULL DEFAULT 'Assessment',
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  agent_submitted_at timestamptz,
  agent_answers jsonb,
  agent_score integer,
  agent_passed boolean,
  status text NOT NULL DEFAULT 'draft', -- draft, sent, submitted, reviewed
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE repeated_failure_processes
  ADD COLUMN IF NOT EXISTS quality_feedback_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS rf_evaluation_id uuid REFERENCES evaluations(id),
  ADD COLUMN IF NOT EXISTS coaching_done_at timestamptz,
  ADD COLUMN IF NOT EXISTS assessment_id uuid REFERENCES rf_assessments(id);

ALTER TABLE repeated_failure_processes
  ADD COLUMN IF NOT EXISTS eval_call_score integer,
  ADD COLUMN IF NOT EXISTS eval_pass_fail text,
  ADD COLUMN IF NOT EXISTS eval_checklist jsonb,
  ADD COLUMN IF NOT EXISTS eval_remark text;

ALTER TABLE rf_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_rf_assessments" ON rf_assessments FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'operation', 'coach', 'quality', 'quality_expert', 'manager'))
  );

CREATE POLICY "insert_rf_assessments" ON rf_assessments FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'coach'))
  );

CREATE POLICY "update_rf_assessments" ON rf_assessments FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'coach', 'operation'))
  );

INSERT INTO analysis_suggestions (name, description, analysis_type, config)
VALUES
  ('Top 10 Failing Attributes', 'Identifies the most frequently failed evaluation attributes across all calls', 'pareto', '{"groupBy":"pass_fail","metric":"count"}'),
  ('Root Cause by Category', 'Groups root causes by critical category (Customer, Business, Compliance, Non-Critical)', 'fishbone', '{"groupBy":"lob","metric":"count"}'),
  ('Agent Score Trends', 'Shows average score trend per agent over time', 'trend', '{"groupBy":"month","metric":"avg_score"}'),
  ('Pass Rate by LOB', 'Compares pass rates across different Lines of Business', 'bar', '{"groupBy":"lob","metric":"pass_rate"}'),
  ('DSAT Root Causes', 'Analyzes DSAT evaluations to find common root causes', 'bar', '{"groupBy":"agent","metric":"count"}'),
  ('Coaching Effectiveness', 'Compares scores before and after coaching sessions', 'line', '{"groupBy":"month","metric":"avg_score"}'),
  ('Compliance Accuracy by Agent', 'Shows compliance critical accuracy per agent', 'bar', '{"groupBy":"agent","metric":"compliance_accuracy"}'),
  ('Customer Critical Errors by Transaction Type', 'Shows which transaction types have the most customer critical errors', 'bar', '{"groupBy":"transaction_type","metric":"customer_accuracy"}')
ON CONFLICT DO NOTHING;
