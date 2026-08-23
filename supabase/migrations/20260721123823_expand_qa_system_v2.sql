/*
# Expand QA System: Multi-Project, Auth, Coaching, Calibration

## New Tables
- projects: name, form_config (jsonb), active
- profiles: id FK auth.users, email, full_name, role, active
- user_projects: user_id, project_id (access control)
- coaching_sessions: evaluation_id, agent_id, scheduled/conducted, duration, status
- calibration_sessions: project_id, transaction_id, transaction_type, status
- calibration_evaluations: calibration_id, user_id, checklist, score, pass_fail

## Modified Tables
- evaluations: +project_id, +task_type, +transaction_type, +evaluation_duration_seconds, +coach_user_id, +form_config
- agents: +project_id, +email, +date_of_join, +assigned_quality, +assigned_operation, +assigned_supervisor, +role

## Security
- All tables RLS enabled, authenticated-only CRUD
- Admin role gets insert/update/delete on projects, profiles, user_projects
*/

-- ============================================================
-- CREATE ALL TABLES FIRST
-- ============================================================
CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  description text DEFAULT '',
  form_config jsonb DEFAULT '{}'::jsonb,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  full_name text DEFAULT '',
  role text DEFAULT 'agent',
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, project_id)
);

CREATE TABLE IF NOT EXISTS coaching_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id uuid REFERENCES evaluations(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  scheduled_date date,
  scheduled_time time DEFAULT '09:00',
  conducted_date date,
  duration_minutes int,
  status text DEFAULT 'scheduled',
  conducted_by text,
  confirmed_by text,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS calibration_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  transaction_id text DEFAULT '',
  transaction_type text DEFAULT 'Inbound',
  calibration_date date DEFAULT CURRENT_DATE,
  status text DEFAULT 'open',
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS calibration_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calibration_id uuid NOT NULL REFERENCES calibration_sessions(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  user_name text DEFAULT '',
  checklist jsonb DEFAULT '[]'::jsonb,
  call_score int DEFAULT 100,
  pass_fail text DEFAULT 'Pass',
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- ALTER EXISTING TABLES
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'evaluations' AND column_name = 'project_id') THEN
    ALTER TABLE evaluations ADD COLUMN project_id uuid REFERENCES projects(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'evaluations' AND column_name = 'task_type') THEN
    ALTER TABLE evaluations ADD COLUMN task_type text DEFAULT 'Program';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'evaluations' AND column_name = 'transaction_type') THEN
    ALTER TABLE evaluations ADD COLUMN transaction_type text DEFAULT 'Inbound';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'evaluations' AND column_name = 'evaluation_duration_seconds') THEN
    ALTER TABLE evaluations ADD COLUMN evaluation_duration_seconds int;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'evaluations' AND column_name = 'coach_user_id') THEN
    ALTER TABLE evaluations ADD COLUMN coach_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'evaluations' AND column_name = 'form_config') THEN
    ALTER TABLE evaluations ADD COLUMN form_config jsonb;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'agents' AND column_name = 'project_id') THEN
    ALTER TABLE agents ADD COLUMN project_id uuid REFERENCES projects(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'agents' AND column_name = 'email') THEN
    ALTER TABLE agents ADD COLUMN email text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'agents' AND column_name = 'date_of_join') THEN
    ALTER TABLE agents ADD COLUMN date_of_join date;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'agents' AND column_name = 'assigned_quality') THEN
    ALTER TABLE agents ADD COLUMN assigned_quality text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'agents' AND column_name = 'assigned_operation') THEN
    ALTER TABLE agents ADD COLUMN assigned_operation text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'agents' AND column_name = 'assigned_supervisor') THEN
    ALTER TABLE agents ADD COLUMN assigned_supervisor text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'agents' AND column_name = 'role') THEN
    ALTER TABLE agents ADD COLUMN role text;
  END IF;
END $$;

-- ============================================================
-- ENABLE RLS ON ALL TABLES
-- ============================================================
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE coaching_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE calibration_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE calibration_evaluations ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- POLICIES: PROJECTS
-- ============================================================
DROP POLICY IF EXISTS "auth_select_projects" ON projects;
CREATE POLICY "auth_select_projects" ON projects FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "admin_insert_projects" ON projects;
CREATE POLICY "admin_insert_projects" ON projects FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

DROP POLICY IF EXISTS "admin_update_projects" ON projects;
CREATE POLICY "admin_update_projects" ON projects FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

DROP POLICY IF EXISTS "admin_delete_projects" ON projects;
CREATE POLICY "admin_delete_projects" ON projects FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- ============================================================
-- POLICIES: PROFILES
-- ============================================================
DROP POLICY IF EXISTS "auth_select_profiles" ON profiles;
CREATE POLICY "auth_select_profiles" ON profiles FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "self_update_profile" ON profiles;
CREATE POLICY "self_update_profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "admin_update_profiles" ON profiles;
CREATE POLICY "admin_update_profiles" ON profiles FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

DROP POLICY IF EXISTS "admin_insert_profiles" ON profiles;
CREATE POLICY "admin_insert_profiles" ON profiles FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

DROP POLICY IF EXISTS "admin_delete_profiles" ON profiles;
CREATE POLICY "admin_delete_profiles" ON profiles FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- ============================================================
-- POLICIES: USER_PROJECTS
-- ============================================================
DROP POLICY IF EXISTS "auth_select_user_projects" ON user_projects;
CREATE POLICY "auth_select_user_projects" ON user_projects FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "admin_insert_user_projects" ON user_projects;
CREATE POLICY "admin_insert_user_projects" ON user_projects FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

DROP POLICY IF EXISTS "admin_delete_user_projects" ON user_projects;
CREATE POLICY "admin_delete_user_projects" ON user_projects FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- ============================================================
-- POLICIES: COACHING_SESSIONS
-- ============================================================
DROP POLICY IF EXISTS "auth_select_coaching" ON coaching_sessions;
CREATE POLICY "auth_select_coaching" ON coaching_sessions FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_coaching" ON coaching_sessions;
CREATE POLICY "auth_insert_coaching" ON coaching_sessions FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_coaching" ON coaching_sessions;
CREATE POLICY "auth_update_coaching" ON coaching_sessions FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_coaching" ON coaching_sessions;
CREATE POLICY "auth_delete_coaching" ON coaching_sessions FOR DELETE
  TO authenticated USING (true);

-- ============================================================
-- POLICIES: CALIBRATION_SESSIONS
-- ============================================================
DROP POLICY IF EXISTS "auth_select_calibration" ON calibration_sessions;
CREATE POLICY "auth_select_calibration" ON calibration_sessions FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_calibration" ON calibration_sessions;
CREATE POLICY "auth_insert_calibration" ON calibration_sessions FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_calibration" ON calibration_sessions;
CREATE POLICY "auth_update_calibration" ON calibration_sessions FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_calibration" ON calibration_sessions;
CREATE POLICY "auth_delete_calibration" ON calibration_sessions FOR DELETE
  TO authenticated USING (true);

-- ============================================================
-- POLICIES: CALIBRATION_EVALUATIONS
-- ============================================================
DROP POLICY IF EXISTS "auth_select_cal_evals" ON calibration_evaluations;
CREATE POLICY "auth_select_cal_evals" ON calibration_evaluations FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_cal_evals" ON calibration_evaluations;
CREATE POLICY "auth_insert_cal_evals" ON calibration_evaluations FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_cal_evals" ON calibration_evaluations;
CREATE POLICY "auth_update_cal_evals" ON calibration_evaluations FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_cal_evals" ON calibration_evaluations;
CREATE POLICY "auth_delete_cal_evals" ON calibration_evaluations FOR DELETE
  TO authenticated USING (true);

-- ============================================================
-- POLICIES: EVALUATIONS (replace anon policies)
-- ============================================================
DROP POLICY IF EXISTS "anon_select_evaluations" ON evaluations;
DROP POLICY IF EXISTS "anon_insert_evaluations" ON evaluations;
DROP POLICY IF EXISTS "anon_update_evaluations" ON evaluations;
DROP POLICY IF EXISTS "anon_delete_evaluations" ON evaluations;

DROP POLICY IF EXISTS "auth_select_evaluations" ON evaluations;
CREATE POLICY "auth_select_evaluations" ON evaluations FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_evaluations" ON evaluations;
CREATE POLICY "auth_insert_evaluations" ON evaluations FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_evaluations" ON evaluations;
CREATE POLICY "auth_update_evaluations" ON evaluations FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_evaluations" ON evaluations;
CREATE POLICY "auth_delete_evaluations" ON evaluations FOR DELETE
  TO authenticated USING (true);

-- ============================================================
-- POLICIES: AGENTS (replace anon policies)
-- ============================================================
DROP POLICY IF EXISTS "anon_select_agents" ON agents;
DROP POLICY IF EXISTS "anon_insert_agents" ON agents;
DROP POLICY IF EXISTS "anon_update_agents" ON agents;
DROP POLICY IF EXISTS "anon_delete_agents" ON agents;

DROP POLICY IF EXISTS "auth_select_agents" ON agents;
CREATE POLICY "auth_select_agents" ON agents FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_agents" ON agents;
CREATE POLICY "auth_insert_agents" ON agents FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_agents" ON agents;
CREATE POLICY "auth_update_agents" ON agents FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_agents" ON agents;
CREATE POLICY "auth_delete_agents" ON agents FOR DELETE
  TO authenticated USING (true);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_evaluations_project_id ON evaluations(project_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_task_type ON evaluations(task_type);
CREATE INDEX IF NOT EXISTS idx_evaluations_transaction_type ON evaluations(transaction_type);
CREATE INDEX IF NOT EXISTS idx_evaluations_coach_user_id ON evaluations(coach_user_id);
CREATE INDEX IF NOT EXISTS idx_coaching_agent_id ON coaching_sessions(agent_id);
CREATE INDEX IF NOT EXISTS idx_coaching_project_id ON coaching_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_coaching_status ON coaching_sessions(status);
CREATE INDEX IF NOT EXISTS idx_calibration_project_id ON calibration_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_cal_evals_calibration_id ON calibration_evaluations(calibration_id);
CREATE INDEX IF NOT EXISTS idx_user_projects_user_id ON user_projects(user_id);
CREATE INDEX IF NOT EXISTS idx_user_projects_project_id ON user_projects(project_id);
CREATE INDEX IF NOT EXISTS idx_agents_project_id ON agents(project_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);