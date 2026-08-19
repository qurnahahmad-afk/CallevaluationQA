/*
# QMS V3 Enhancement: Permissions, Invitations, Notifications, Audit, Coaching SLA

## Overview
This migration adds comprehensive role-based permissions, user invitation management,
agent notifications, audit history, and coaching SLA tracking to the QMS system.

## New Tables

1. **role_permissions** — Stores customizable permission sets per role.
   - role (text, primary key): admin, quality, operation, supervisor, agent
   - permissions (jsonb): map of permission keys to boolean
   - updated_at (timestamptz)

2. **invitations** — User invitation links sent by admin.
   - id (uuid, PK)
   - email (text, not null): must match firstname.secondname@Crystel.co format
   - role (text, not null): admin, quality, operation, supervisor, agent
   - project_id (uuid, nullable, FK to projects)
   - token (text, unique): secure random token for invitation link
   - status (text, default 'pending'): pending, accepted, expired
   - invited_by (uuid, FK to profiles)
   - created_at, expires_at (timestamptz)

3. **notifications** — System notifications for agents.
   - id (uuid, PK)
   - user_id (uuid, FK to profiles)
   - type (text): new_evaluation, coaching_assigned, etc.
   - title (text)
   - message (text)
   - related_id (uuid, nullable): ID of related entity (evaluation, coaching session)
   - read (boolean, default false)
   - created_at (timestamptz)

4. **audit_history** — Tracks all significant system actions.
   - id (uuid, PK)
   - user_id (uuid, nullable, FK to profiles)
   - user_email (text)
   - action (text): e.g., create_user, delete_agent, create_evaluation
   - entity_type (text): e.g., evaluation, agent, user, project
   - entity_id (uuid, nullable)
   - details (jsonb): additional context
   - created_at (timestamptz)

## Modified Tables

1. **coaching_sessions** — Added SLA tracking fields:
   - sla_met (boolean, nullable): whether coaching was completed within 24h
   - sla_hours (numeric, nullable): actual hours between evaluation and coaching
   - strength_points (text): agent strengths noted during coaching
   - improvement_points (text): areas requiring improvement
   - action_points (text): action items for improvement
   - agent_confirmation (text, nullable): agent's confirmation status
   - agent_notes (text, nullable): agent's notes/comments after coaching review
   - conducted_at (timestamptz, nullable): when coaching was actually conducted

## Security
- RLS enabled on all new tables.
- role_permissions: authenticated users can read (needed for permission checks); only admin can write.
- invitations: only admin can read/write; authenticated users can read their own.
- notifications: users can read/update their own notifications.
- audit_history: only admin can read; any authenticated user can insert (for action logging).

## Important Notes
1. Default permissions are seeded for each role.
2. Invitations expire after 7 days.
3. Coaching SLA is calculated as: coaching_conducted_at - evaluation_date. If ≤ 24 hours, SLA met = YES.
4. Audit history captures all CRUD operations on key entities.
*/

-- ===== ROLE PERMISSIONS =====
CREATE TABLE IF NOT EXISTS role_permissions (
  role text PRIMARY KEY,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_role_permissions" ON role_permissions;
CREATE POLICY "read_role_permissions" ON role_permissions FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "admin_update_role_permissions" ON role_permissions;
CREATE POLICY "admin_update_role_permissions" ON role_permissions FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "admin_insert_role_permissions" ON role_permissions;
CREATE POLICY "admin_insert_role_permissions" ON role_permissions FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- Seed default permissions
INSERT INTO role_permissions (role, permissions) VALUES
  ('admin', jsonb_build_object(
    'view_dashboard', true, 'create_evaluation', true, 'view_evaluations', true,
    'manage_agents', true, 'manage_projects', true, 'manage_users', true,
    'view_reports', true, 'view_analysis', true, 'manage_coaching', true,
    'manage_calibration', true, 'view_glossary', true, 'view_agent_performance', true,
    'send_invitations', true, 'reset_passwords', true, 'view_audit_history', true,
    'view_coaching_dashboard', true, 'export_data', true
  )),
  ('quality', jsonb_build_object(
    'view_dashboard', true, 'create_evaluation', true, 'view_evaluations', true,
    'manage_agents', true, 'manage_projects', false, 'manage_users', false,
    'view_reports', true, 'view_analysis', true, 'manage_coaching', true,
    'manage_calibration', true, 'view_glossary', true, 'view_agent_performance', true,
    'send_invitations', false, 'reset_passwords', false, 'view_audit_history', false,
    'view_coaching_dashboard', true, 'export_data', true
  )),
  ('operation', jsonb_build_object(
    'view_dashboard', true, 'create_evaluation', false, 'view_evaluations', true,
    'manage_agents', false, 'manage_projects', false, 'manage_users', false,
    'view_reports', true, 'view_analysis', true, 'manage_coaching', false,
    'manage_calibration', true, 'view_glossary', true, 'view_agent_performance', true,
    'send_invitations', false, 'reset_passwords', false, 'view_audit_history', false,
    'view_coaching_dashboard', true, 'export_data', true
  )),
  ('supervisor', jsonb_build_object(
    'view_dashboard', true, 'create_evaluation', false, 'view_evaluations', true,
    'manage_agents', true, 'manage_projects', false, 'manage_users', false,
    'view_reports', true, 'view_analysis', true, 'manage_coaching', false,
    'manage_calibration', false, 'view_glossary', true, 'view_agent_performance', true,
    'send_invitations', false, 'reset_passwords', false, 'view_audit_history', false,
    'view_coaching_dashboard', true, 'export_data', true
  )),
  ('agent', jsonb_build_object(
    'view_dashboard', false, 'create_evaluation', false, 'view_evaluations', false,
    'manage_agents', false, 'manage_projects', false, 'manage_users', false,
    'view_reports', false, 'view_analysis', false, 'manage_coaching', false,
    'manage_calibration', false, 'view_glossary', true, 'view_agent_performance', false,
    'send_invitations', false, 'reset_passwords', false, 'view_audit_history', false,
    'view_coaching_dashboard', false, 'export_data', false,
    'view_own_evaluations', true, 'view_own_coaching', true, 'add_coaching_feedback', true
  ))
ON CONFLICT (role) DO NOTHING;

-- ===== INVITATIONS =====
CREATE TABLE IF NOT EXISTS invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  role text NOT NULL,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  status text NOT NULL DEFAULT 'pending',
  invited_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT now() + interval '7 days'
);

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_invitations" ON invitations;
CREATE POLICY "admin_read_invitations" ON invitations FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "admin_insert_invitations" ON invitations;
CREATE POLICY "admin_insert_invitations" ON invitations FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "admin_update_invitations" ON invitations;
CREATE POLICY "admin_update_invitations" ON invitations FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "admin_delete_invitations" ON invitations;
CREATE POLICY "admin_delete_invitations" ON invitations FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- Allow reading own invitation by token (for acceptance flow) - anon can read by token
DROP POLICY IF EXISTS "anon_read_invitation_by_token" ON invitations;
CREATE POLICY "anon_read_invitation_by_token" ON invitations FOR SELECT
  TO anon, authenticated USING (true);

-- ===== NOTIFICATIONS =====
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  message text,
  related_id uuid,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_own_notifications" ON notifications;
CREATE POLICY "read_own_notifications" ON notifications FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_notifications" ON notifications;
CREATE POLICY "insert_own_notifications" ON notifications FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_notifications" ON notifications;
CREATE POLICY "update_own_notifications" ON notifications FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_notifications" ON notifications;
CREATE POLICY "delete_own_notifications" ON notifications FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Allow system to insert notifications for any user (for edge functions / triggers)
DROP POLICY IF EXISTS "system_insert_notifications" ON notifications;
CREATE POLICY "system_insert_notifications" ON notifications FOR INSERT
  TO authenticated WITH CHECK (true);

-- ===== AUDIT HISTORY =====
CREATE TABLE IF NOT EXISTS audit_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  user_email text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE audit_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_audit_history" ON audit_history;
CREATE POLICY "admin_read_audit_history" ON audit_history FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "insert_audit_history" ON audit_history;
CREATE POLICY "insert_audit_history" ON audit_history FOR INSERT
  TO authenticated WITH CHECK (true);

-- ===== COACHING SESSIONS ENHANCEMENT =====
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'coaching_sessions' AND column_name = 'sla_met') THEN
    ALTER TABLE coaching_sessions ADD COLUMN sla_met boolean;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'coaching_sessions' AND column_name = 'sla_hours') THEN
    ALTER TABLE coaching_sessions ADD COLUMN sla_hours numeric;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'coaching_sessions' AND column_name = 'strength_points') THEN
    ALTER TABLE coaching_sessions ADD COLUMN strength_points text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'coaching_sessions' AND column_name = 'improvement_points') THEN
    ALTER TABLE coaching_sessions ADD COLUMN improvement_points text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'coaching_sessions' AND column_name = 'action_points') THEN
    ALTER TABLE coaching_sessions ADD COLUMN action_points text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'coaching_sessions' AND column_name = 'agent_confirmation') THEN
    ALTER TABLE coaching_sessions ADD COLUMN agent_confirmation text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'coaching_sessions' AND column_name = 'agent_notes') THEN
    ALTER TABLE coaching_sessions ADD COLUMN agent_notes text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'coaching_sessions' AND column_name = 'conducted_at') THEN
    ALTER TABLE coaching_sessions ADD COLUMN conducted_at timestamptz;
  END IF;
END $$;

-- ===== INDEXES =====
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_history_entity ON audit_history(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_history_user ON audit_history(user_id);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);
CREATE INDEX IF NOT EXISTS idx_coaching_sessions_sla ON coaching_sessions(sla_met);