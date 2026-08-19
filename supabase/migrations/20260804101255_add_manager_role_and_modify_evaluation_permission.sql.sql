-- Add manager role with full permissions (including modify_evaluation)
-- Add modify_evaluation permission to admin role
-- Ensure modify_evaluation is only granted to admin and manager

-- Upsert manager role permissions
INSERT INTO role_permissions (role, permissions)
VALUES (
  'manager',
  jsonb_build_object(
    'view_dashboard', true,
    'create_evaluation', true,
    'view_evaluations', true,
    'manage_agents', true,
    'manage_projects', true,
    'manage_users', true,
    'view_reports', true,
    'view_analysis', true,
    'manage_coaching', true,
    'manage_calibration', true,
    'view_glossary', true,
    'view_agent_performance', true,
    'send_invitations', true,
    'reset_passwords', true,
    'view_audit_history', true,
    'view_coaching_dashboard', true,
    'export_data', true,
    'view_own_evaluations', true,
    'view_own_coaching', true,
    'add_coaching_feedback', true,
    'modify_evaluation', true
  )
)
ON CONFLICT (role) DO UPDATE SET permissions = EXCLUDED.permissions;

-- Add modify_evaluation: true for admin
UPDATE role_permissions
SET permissions = permissions || jsonb_build_object('modify_evaluation', true)
WHERE role = 'admin';

-- Ensure modify_evaluation is false for all other roles
UPDATE role_permissions
SET permissions = permissions || jsonb_build_object('modify_evaluation', false)
WHERE role NOT IN ('admin', 'manager');
