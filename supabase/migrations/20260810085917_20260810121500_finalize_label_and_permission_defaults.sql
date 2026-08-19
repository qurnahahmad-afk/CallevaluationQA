/*
# Finalize Case ID branding and role permission defaults

1. Modified Labels
- Changes the existing `field.caller_number` system label from Caller Number to Case ID.
- This preserves the existing key and data while making the new terminology available to every screen that uses the label manager.

2. Modified Role Permissions
- Adds `data_clearance` and `modify_score` permission keys to every existing role permission JSON object.
- Existing permission values are preserved; both new permissions start disabled and can be enabled by an administrator in User Management.

3. Data Safety
- No tables, rows, or existing permission keys are deleted.
- The migration is idempotent and safe to apply more than once.
*/

UPDATE system_labels
SET label = 'Case ID', updated_at = now()
WHERE key = 'field.caller_number';

UPDATE role_permissions
SET permissions = permissions || '{"data_clearance": false, "modify_score": false}'::jsonb,
    updated_at = now()
WHERE permissions IS NOT NULL;
