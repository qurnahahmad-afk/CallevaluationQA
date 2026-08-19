-- Add "Reporting" clearance type to system_config
-- Reports are generated from evaluations on-the-fly, so "Reporting" clearance
-- clears the audit_history entries related to report exports/generations.
INSERT INTO system_config (category, key, label, description, value, active, sort_order, updated_by)
VALUES (
  'clearance_types',
  'reporting',
  'Reporting',
  'Clear report export and generation audit logs before a given date',
  '{"icon": "BarChart3", "table": "audit_history", "dateColumn": "created_at"}'::jsonb,
  true,
  4,
  NULL
)
ON CONFLICT (category, key) DO UPDATE
SET label = EXCLUDED.label,
    description = EXCLUDED.description,
    value = EXCLUDED.value,
    active = EXCLUDED.active,
    sort_order = EXCLUDED.sort_order;
