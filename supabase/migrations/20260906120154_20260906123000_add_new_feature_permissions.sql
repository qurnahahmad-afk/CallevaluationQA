/*
# Add permissions for new exam, analytics, notification, and settings pages

1. Purpose
- Adds permission keys required by the new Monthly Exams, Sample Size, AI Analytics,
  Notifications, and System Settings navigation entries.

2. Modified Data
- Extends the JSON permissions object in each existing role_permissions row.
- No existing permission is removed or changed.
- Administrator receives full access to the new features.
- Manager, quality, quality expert, operation, and supervisor receive read access to
  exams, sample size, AI analytics, and notifications.
- Only Administrator receives exam management and system settings management by default.

3. Security
- Existing role_permissions row-level security and role checks are unchanged.
- New pages remain hidden unless the role has the corresponding permission.

4. Notes
- The permission values are stored in the existing JSON object to preserve compatibility
  with the current permission editor and authorization helper.
*/

UPDATE role_permissions
SET permissions = permissions || jsonb_build_object(
  'view_exams', role IN ('admin', 'manager', 'quality', 'quality_expert', 'operation', 'supervisor', 'agent'),
  'manage_exams', role = 'admin',
  'view_sample_size', role IN ('admin', 'manager', 'quality', 'quality_expert', 'operation', 'supervisor'),
  'view_ai_analytics', role IN ('admin', 'manager', 'quality', 'quality_expert', 'operation', 'supervisor'),
  'view_notifications', true,
  'manage_system_settings', role = 'admin'
), updated_at = now();
