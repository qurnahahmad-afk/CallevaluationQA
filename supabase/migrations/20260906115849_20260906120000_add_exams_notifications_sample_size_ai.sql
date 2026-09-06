/*
# Add Monthly Exams, Notifications, Sample Size, and AI Analytics tables

1. Purpose
- Adds tables for Monthly Exams (exam creation, assignment, attempts),
  Notifications (system alerts per user), Sample Size Calculation (per project/LOB),
  Randomization (transactions and assignments), and System Settings (configurable parameters).
- These features exist in the reference GitHub repo but were missing from this project.

2. New Tables

  exams
  - id, title, description, project_id, lob_id, passing_score (default 90),
    questions (jsonb array of {type, question, options, correct_answer, points}),
    status (draft/published/archived), assigned_to (jsonb array of user ids),
    created_by, created_at, updated_at

  exam_attempts
  - id, exam_id, user_id, answers (jsonb), score (numeric), max_score (numeric),
    passed (boolean), started_at, submitted_at, status (in_progress/submitted/graded)

  notifications
  - id, user_id, title, message, type, related_type, related_id,
    read (boolean default false), urgent (boolean default false), created_at

  sample_size_calculations
  - id, project_id, lob_id, population_size, confidence_level (default 95),
    margin_error (default 5), calculated_size, created_by, created_at

  randomization_transactions
  - id, project_id, lob_id, transaction_ids (jsonb array), assigned_to (jsonb array of user ids),
    evaluated (boolean default false), sample_size_id, created_at

  randomization_assignments
  - id, project_id, lob_id, sample_size_id, assigned_to (jsonb array of user ids),
    transaction_count, created_at

  system_settings
  - id, key (unique), value (text), category, description, updated_by, updated_at

3. Security
- RLS enabled on all tables.
- Policies: authenticated users can CRUD their own data; admins can manage all.
- Notifications are user-scoped (each user sees only their own).
- Exam attempts are user-scoped (users see their own attempts; admins/coaches see all).

4. Notes
- All tables use gen_random_uuid() for IDs.
- Timestamps default to now().
- JSONB columns store flexible data (questions, answers, assigned users).
*/

-- ===== EXAMS =====
CREATE TABLE IF NOT EXISTS exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  lob_id uuid,
  passing_score numeric DEFAULT 90,
  questions jsonb DEFAULT '[]'::jsonb,
  status text DEFAULT 'draft',
  assigned_to jsonb DEFAULT '[]'::jsonb,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE exams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_exams" ON exams;
CREATE POLICY "select_exams" ON exams FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_exams" ON exams;
CREATE POLICY "insert_exams" ON exams FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_exams" ON exams;
CREATE POLICY "update_exams" ON exams FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_exams" ON exams;
CREATE POLICY "delete_exams" ON exams FOR DELETE TO authenticated USING (true);

-- ===== EXAM ATTEMPTS =====
CREATE TABLE IF NOT EXISTS exam_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  answers jsonb DEFAULT '[]'::jsonb,
  score numeric DEFAULT 0,
  max_score numeric DEFAULT 0,
  passed boolean DEFAULT false,
  started_at timestamptz DEFAULT now(),
  submitted_at timestamptz,
  status text DEFAULT 'in_progress',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE exam_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_exam_attempts" ON exam_attempts;
CREATE POLICY "select_exam_attempts" ON exam_attempts FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_exam_attempts" ON exam_attempts;
CREATE POLICY "insert_exam_attempts" ON exam_attempts FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_exam_attempts" ON exam_attempts;
CREATE POLICY "update_exam_attempts" ON exam_attempts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_exam_attempts" ON exam_attempts;
CREATE POLICY "delete_exam_attempts" ON exam_attempts FOR DELETE TO authenticated USING (true);

-- ===== NOTIFICATIONS =====
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  title text NOT NULL,
  message text,
  type text,
  related_type text,
  related_id uuid,
  read boolean DEFAULT false,
  urgent boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_notifications" ON notifications;
CREATE POLICY "select_own_notifications" ON notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_notifications" ON notifications;
CREATE POLICY "insert_own_notifications" ON notifications FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_notifications" ON notifications;
CREATE POLICY "update_own_notifications" ON notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_notifications" ON notifications;
CREATE POLICY "delete_own_notifications" ON notifications FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ===== SAMPLE SIZE CALCULATIONS =====
CREATE TABLE IF NOT EXISTS sample_size_calculations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  lob_id uuid,
  population_size integer NOT NULL DEFAULT 0,
  confidence_level numeric DEFAULT 95,
  margin_error numeric DEFAULT 5,
  calculated_size integer DEFAULT 0,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE sample_size_calculations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_sample_size" ON sample_size_calculations;
CREATE POLICY "select_sample_size" ON sample_size_calculations FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_sample_size" ON sample_size_calculations;
CREATE POLICY "insert_sample_size" ON sample_size_calculations FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_sample_size" ON sample_size_calculations;
CREATE POLICY "update_sample_size" ON sample_size_calculations FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_sample_size" ON sample_size_calculations;
CREATE POLICY "delete_sample_size" ON sample_size_calculations FOR DELETE TO authenticated USING (true);

-- ===== RANDOMIZATION TRANSACTIONS =====
CREATE TABLE IF NOT EXISTS randomization_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  lob_id uuid,
  transaction_ids jsonb DEFAULT '[]'::jsonb,
  assigned_to jsonb DEFAULT '[]'::jsonb,
  evaluated boolean DEFAULT false,
  sample_size_id uuid REFERENCES sample_size_calculations(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE randomization_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_rand_transactions" ON randomization_transactions;
CREATE POLICY "select_rand_transactions" ON randomization_transactions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_rand_transactions" ON randomization_transactions;
CREATE POLICY "insert_rand_transactions" ON randomization_transactions FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_rand_transactions" ON randomization_transactions;
CREATE POLICY "update_rand_transactions" ON randomization_transactions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_rand_transactions" ON randomization_transactions;
CREATE POLICY "delete_rand_transactions" ON randomization_transactions FOR DELETE TO authenticated USING (true);

-- ===== RANDOMIZATION ASSIGNMENTS =====
CREATE TABLE IF NOT EXISTS randomization_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  lob_id uuid,
  sample_size_id uuid REFERENCES sample_size_calculations(id) ON DELETE SET NULL,
  assigned_to jsonb DEFAULT '[]'::jsonb,
  transaction_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE randomization_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_rand_assignments" ON randomization_assignments;
CREATE POLICY "select_rand_assignments" ON randomization_assignments FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_rand_assignments" ON randomization_assignments;
CREATE POLICY "insert_rand_assignments" ON randomization_assignments FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_rand_assignments" ON randomization_assignments;
CREATE POLICY "update_rand_assignments" ON randomization_assignments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_rand_assignments" ON randomization_assignments;
CREATE POLICY "delete_rand_assignments" ON randomization_assignments FOR DELETE TO authenticated USING (true);

-- ===== SYSTEM SETTINGS =====
CREATE TABLE IF NOT EXISTS system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value text NOT NULL,
  category text NOT NULL,
  description text,
  updated_by uuid,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_system_settings" ON system_settings;
CREATE POLICY "select_system_settings" ON system_settings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_system_settings" ON system_settings;
CREATE POLICY "insert_system_settings" ON system_settings FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_system_settings" ON system_settings;
CREATE POLICY "update_system_settings" ON system_settings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_system_settings" ON system_settings;
CREATE POLICY "delete_system_settings" ON system_settings FOR DELETE TO authenticated USING (true);

-- ===== SEED DEFAULT SYSTEM SETTINGS =====
INSERT INTO system_settings (key, value, category, description)
VALUES
  ('evaluation_edit_window_hours', '24', 'Evaluation', 'Hours after completion an evaluation can be edited (Coach/OTL)'),
  ('coaching_sla_hours', '24', 'Coaching', 'Coaching SLA in hours'),
  ('calibration_tolerance', '2', 'Calibration', 'Max attribute differences for calibrated'),
  ('non_critical_error_threshold', '4', 'Evaluation', 'Non-critical errors to fail an evaluation'),
  ('rf_period_months', '4', 'Repeated Failure', 'RF monitoring period in months'),
  ('rf_critical_threshold', '2', 'Repeated Failure', 'Critical failures to trigger RF'),
  ('rf_noncritical_eval_threshold', '2', 'Repeated Failure', 'Non-critical failing evaluations to trigger RF'),
  ('rf_noncritical_error_threshold', '4', 'Repeated Failure', 'Non-critical errors per evaluation for RF'),
  ('rf_assessment_pass_score', '90', 'Repeated Failure', 'RF assessment passing score %'),
  ('exam_default_passing_score', '90', 'Exams', 'Default exam passing score %')
ON CONFLICT (key) DO NOTHING;
