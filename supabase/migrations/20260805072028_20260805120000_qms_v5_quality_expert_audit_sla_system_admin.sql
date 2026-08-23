/*
# QMS V5: Quality Expert Role, Enhanced Audit, SLA, System Admin Config

## Summary
This migration adds the Quality Expert role, enhances the audit history table with richer tracking,
adds new permissions for the agent page and quality expert capabilities, creates a system configuration
table for the System Administration page, and seeds default permissions for the new role.

## 1. New Role: Quality Expert
- Adds 'quality_expert' to the Role type via profiles table constraint update.
- Seeds default permissions for 'quality_expert' in role_permissions table.
- Quality Expert has all Quality permissions PLUS: create_calibration, manage_calibration,
  review_expert_evaluations, compare_coach_expert, finalize_calibration.

## 2. New Permissions
- 'view_agents_page' — separate permission for accessing the Agents page (item 2).
- 'create_calibration' — create calibration sessions.
- 'manage_calibration_sessions' — manage (edit/delete) calibration sessions.
- 'review_expert_evaluations' — review expert evaluations.
- 'compare_coach_expert' — compare coach vs expert evaluations.
- 'finalize_calibration' — finalize calibration results.

## 3. Enhanced Audit History
- Adds columns to audit_history: user_role, page_module, old_value (jsonb), new_value (jsonb), ip_address.
- Existing rows will have NULL for new columns (backward compatible).

## 4. New Table: system_config
- Stores system-level configuration managed by the System Administration page.
- Key-value structure with category grouping.
- Allows admin to configure pages, features, workflows, settings without code changes.

## 5. New Table: guide_book_sections
- Stores Guide Book content organized by role and section.
- Replaces the old glossary-only approach with structured user manual content.

## 6. RLS
- system_config: admin-only write, all authenticated read.
- guide_book_sections: admin-only write, all authenticated read.
- audit_history: admin/manager read (existing), all authenticated insert (existing).
*/

-- ============================================================
-- 1. Add quality_expert role permissions
-- ============================================================

-- Seed default permissions for quality_expert
INSERT INTO role_permissions (role, permissions, updated_at)
VALUES (
  'quality_expert',
  '{
    "view_dashboard": true,
    "create_evaluation": true,
    "view_evaluations": true,
    "manage_agents": false,
    "manage_projects": false,
    "manage_users": false,
    "view_reports": true,
    "view_analysis": true,
    "manage_coaching": true,
    "manage_calibration": true,
    "view_glossary": true,
    "view_agent_performance": true,
    "send_invitations": false,
    "reset_passwords": false,
    "view_audit_history": false,
    "view_coaching_dashboard": true,
    "export_data": true,
    "view_own_evaluations": false,
    "view_own_coaching": false,
    "add_coaching_feedback": false,
    "modify_evaluation": false,
    "view_agents_page": true,
    "create_calibration": true,
    "manage_calibration_sessions": true,
    "review_expert_evaluations": true,
    "compare_coach_expert": true,
    "finalize_calibration": true,
    "manage_system_admin": false
  }'::jsonb,
  now()
)
ON CONFLICT (role) DO UPDATE SET permissions = EXCLUDED.permissions, updated_at = now();

-- Add new permission keys to all existing roles (default false, will be enabled per-role below)
DO $$
DECLARE
  r text;
  existing_perms jsonb;
  new_perms jsonb;
BEGIN
  FOR r IN SELECT role FROM role_permissions LOOP
    SELECT permissions INTO existing_perms FROM role_permissions WHERE role = r;
    new_perms := existing_perms || jsonb_build_object(
      'view_agents_page', CASE WHEN r IN ('admin','manager','quality','supervisor','quality_expert') THEN true ELSE false END,
      'create_calibration', CASE WHEN r IN ('admin','manager','quality','quality_expert') THEN true ELSE false END,
      'manage_calibration_sessions', CASE WHEN r IN ('admin','manager','quality_expert') THEN true ELSE false END,
      'review_expert_evaluations', CASE WHEN r IN ('admin','manager','quality_expert') THEN true ELSE false END,
      'compare_coach_expert', CASE WHEN r IN ('admin','manager','quality_expert') THEN true ELSE false END,
      'finalize_calibration', CASE WHEN r IN ('admin','manager','quality_expert') THEN true ELSE false END,
      'manage_system_admin', CASE WHEN r = 'admin' THEN true ELSE false END
    );
    UPDATE role_permissions SET permissions = new_perms, updated_at = now() WHERE role = r;
  END LOOP;
END $$;

-- ============================================================
-- 2. Enhance audit_history table
-- ============================================================

ALTER TABLE audit_history ADD COLUMN IF NOT EXISTS user_role text;
ALTER TABLE audit_history ADD COLUMN IF NOT EXISTS page_module text;
ALTER TABLE audit_history ADD COLUMN IF NOT EXISTS old_value jsonb;
ALTER TABLE audit_history ADD COLUMN IF NOT EXISTS new_value jsonb;
ALTER TABLE audit_history ADD COLUMN IF NOT EXISTS ip_address text;

-- ============================================================
-- 3. Create system_config table
-- ============================================================

CREATE TABLE IF NOT EXISTS system_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  key text NOT NULL,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  label text,
  description text,
  sort_order integer DEFAULT 0,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  UNIQUE(category, key)
);

ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_system_config" ON system_config;
CREATE POLICY "admin_all_system_config" ON system_config
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

DROP POLICY IF EXISTS "authenticated_read_system_config" ON system_config;
CREATE POLICY "authenticated_read_system_config" ON system_config
  FOR SELECT TO authenticated
  USING (true);

-- ============================================================
-- 4. Create guide_book_sections table
-- ============================================================

CREATE TABLE IF NOT EXISTS guide_book_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL,
  section text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  sort_order integer DEFAULT 0,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

ALTER TABLE guide_book_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_guide_book" ON guide_book_sections;
CREATE POLICY "admin_all_guide_book" ON guide_book_sections
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

DROP POLICY IF EXISTS "authenticated_read_guide_book" ON guide_book_sections;
CREATE POLICY "authenticated_read_guide_book" ON guide_book_sections
  FOR SELECT TO authenticated
  USING (true);

-- ============================================================
-- 5. Seed default guide book content
-- ============================================================

INSERT INTO guide_book_sections (role, section, title, content, sort_order) VALUES
-- Operations Team
('operation', 'Dashboard', 'Dashboard Overview', 'The Dashboard provides a high-level overview of key quality metrics. You can view evaluation summaries, coaching status, and performance trends across your assigned projects.', 1),
('operation', 'Evaluations', 'Viewing Evaluations', 'Navigate to the Evaluations page to see all QA evaluations. You can filter by project, agent, date range, and pass/fail status. Click on any evaluation to see the full checklist and scoring details.', 2),
('operation', 'Reports', 'Generating Reports', 'The Reports page lets you generate and export quality reports. Select your project and date range, then export to CSV, Excel, or PDF format.', 3),
('operation', 'Analysis', 'Analysis Tools', 'The Analysis page provides visual breakdowns of evaluation data including score distributions, trend analysis, and category-level insights.', 4),
('operation', 'Coaching Dashboard', 'Coaching Dashboard', 'View coaching SLA metrics, coach performance, and session status. Monitor whether coaching sessions are completed within the 24-hour SLA window.', 5),
-- Quality Team
('quality', 'New Evaluation', 'Creating Evaluations', 'Navigate to New Evaluation to score a call. Select the project, agent, and transaction details. Fill in the checklist (Yes/No/N/A for each item), add notes, and submit. The system auto-calculates the score based on the form configuration.', 1),
('quality', 'Evaluations', 'Managing Evaluations', 'View and manage your evaluations. Quality users can only see their own evaluations unless additional permissions are granted. Use filters to find specific evaluations quickly.', 2),
('quality', 'Coaching', 'Conducting Coaching', 'After an evaluation, create a coaching session. Enter strength points, improvement areas, and action points. The SLA is automatically calculated (24 hours from evaluation date). Mark sessions as conducted once completed.', 3),
('quality', 'Calibration', 'Calibration Sessions', 'Participate in calibration sessions to ensure scoring consistency. Submit your evaluation for the transaction being calibrated. The expert evaluation is used as the reference for comparison.', 4),
('quality', 'Reports', 'Quality Reports', 'Generate detailed quality reports including score trends, fail rates, and category breakdowns. Export to multiple formats for sharing with stakeholders.', 5),
-- Quality Expert
('quality_expert', 'Calibration', 'Managing Calibration', 'As a Quality Expert, you can create, manage, and finalize calibration sessions. Create a new session for a transaction, submit your expert evaluation, and compare it against coach evaluations. The system calculates agreement percentage and identifies matching/differing attributes.', 1),
('quality_expert', 'Expert Evaluation', 'Expert Review', 'Your evaluation serves as the reference standard. Submit it through the Expert Evaluation tab. The system automatically compares each checklist item against the coach evaluation and generates a detailed comparison report.', 2),
('quality_expert', 'Finalization', 'Finalizing Calibration', 'Review the comparison results. If there are zero critical mismatches and at most 2 non-critical mismatches, the session is marked as Calibrated. You can finalize the decision and add notes for the coaching team.', 3),
-- Agents
('agent', 'My Portal', 'Agent Portal', 'Your portal shows your recent evaluations, coaching sessions, and performance scores. Review your feedback to understand strengths and areas for improvement.', 1),
('agent', 'Coaching', 'Coaching Feedback', 'After a coaching session, you can review the strength points, improvement areas, and action points. Add your own notes and confirm the coaching session to acknowledge receipt.', 2),
('agent', 'Guide Book', 'Using the Guide Book', 'This Guide Book provides instructions for your role. Browse the sections to learn about each module and how to use the system effectively.', 3),
-- Supervisors
('supervisor', 'Team Overview', 'Monitoring Your Team', 'View your team''s evaluation scores, coaching status, and performance trends. Use the Agent Performance page for individual agent insights.', 1),
('supervisor', 'Coaching', 'Coaching Oversight', 'Monitor coaching sessions for your team. Ensure coaches are completing sessions within the 24-hour SLA. Review coaching notes and action points.', 2),
('supervisor', 'Calibration', 'Calibration Participation', 'Participate in calibration sessions to ensure scoring consistency across your team. Your input helps align quality standards.', 3),
('supervisor', 'Reports', 'Team Reports', 'Generate reports focused on your team''s performance. Filter by agent, date, and evaluation type for targeted insights.', 4),
-- Managers
('manager', 'System Overview', 'System Management', 'As a Manager, you have access to all operational pages plus user management, projects, and audit history. Configure user permissions, manage projects, and monitor system-wide quality metrics.', 1),
('manager', 'User Management', 'Managing Users', 'Create and manage user accounts. Assign roles and project access. Use the Permissions tab to configure what each role can do. Reset passwords and send invitations to new users.', 2),
('manager', 'Projects', 'Project Configuration', 'Create and configure projects with custom evaluation forms. Set up LOB-specific configurations, transaction types, and scoring parameters.', 3),
('manager', 'Audit History', 'Audit Trail', 'Review the audit history to track all user activities. Filter by action type, entity, or user. Export audit logs for compliance and reporting purposes.', 4),
('manager', 'Reports', 'Management Reports', 'Generate comprehensive reports across all projects and teams. Export data for executive presentations and stakeholder reviews.', 5)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 6. Seed default system_config entries
-- ============================================================

INSERT INTO system_config (category, key, value, label, description, sort_order) VALUES
('pages', 'dashboard', '{"visible": true, "label": "Dashboard"}', 'Dashboard Page', 'Main dashboard showing quality metrics overview', 1),
('pages', 'new_evaluation', '{"visible": true, "label": "New Evaluation"}', 'New Evaluation Page', 'Create new QA evaluations', 2),
('pages', 'evaluations', '{"visible": true, "label": "Evaluations"}', 'Evaluations Page', 'List and manage evaluations', 3),
('pages', 'calibration', '{"visible": true, "label": "Calibration"}', 'Calibration Page', 'Calibration sessions management', 4),
('pages', 'coaching', '{"visible": true, "label": "Coaching"}', 'Coaching Page', 'Coaching sessions management', 5),
('pages', 'coaching_dashboard', '{"visible": true, "label": "Coaching Dashboard"}', 'Coaching Dashboard Page', 'SLA and coaching performance dashboard', 6),
('pages', 'agent_performance', '{"visible": true, "label": "Agent Performance"}', 'Agent Performance Page', 'Individual agent performance metrics', 7),
('pages', 'agents', '{"visible": true, "label": "Agents"}', 'Agents Page', 'Agent roster management', 8),
('pages', 'reports', '{"visible": true, "label": "Reports"}', 'Reports Page', 'Generate and export reports', 9),
('pages', 'analysis', '{"visible": true, "label": "Analysis"}', 'Analysis Page', 'Data analysis and visualizations', 10),
('pages', 'users', '{"visible": true, "label": "User Management"}', 'User Management Page', 'Manage users and permissions', 11),
('pages', 'projects', '{"visible": true, "label": "Projects"}', 'Projects Page', 'Project configuration', 12),
('pages', 'audit', '{"visible": true, "label": "Audit History"}', 'Audit History Page', 'System audit trail', 13),
('pages', 'guide_book', '{"visible": true, "label": "Guide Book"}', 'Guide Book Page', 'User manual and guidance', 14),
('pages', 'branding', '{"visible": true, "label": "System Branding"}', 'System Branding Page', 'Customize system appearance', 15),
('pages', 'system_admin', '{"visible": true, "label": "System Administration"}', 'System Administration Page', 'System configuration and customization', 16),
('settings', 'sla_hours', '24', 'Coaching SLA Hours', 'Number of hours within which coaching must be completed to meet SLA', 1),
('settings', 'inactivity_timeout_minutes', '15', 'Inactivity Timeout (minutes)', 'Auto sign-out after this many minutes of inactivity', 2),
('settings', 'evaluation_pass_threshold', '80', 'Pass Score Threshold', 'Minimum score percentage to pass an evaluation', 3),
('features', 'calibration_history', '{"enabled": true}', 'Calibration History', 'Allow viewing historical calibration sessions for the same transaction', 1),
('features', 'quality_user_isolation', '{"enabled": true}', 'Quality User Isolation', 'Restrict quality users to their own evaluations only', 2),
('features', 'agent_portal', '{"enabled": true}', 'Agent Portal', 'Enable the agent self-service portal', 3)
ON CONFLICT (category, key) DO NOTHING;
