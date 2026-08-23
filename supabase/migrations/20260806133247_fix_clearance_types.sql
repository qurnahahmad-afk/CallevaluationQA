-- Remove the invalid "Evaluation" clearance type (capital E, non-existent table)
DELETE FROM system_config WHERE category = 'clearance_types' AND key = 'Evaluation';

-- Fix the "reporting" clearance type: reports are generated from evaluations on-the-fly,
-- so clearing "Reporting" should clear report-related audit_history entries only.
UPDATE system_config
SET value = '{"icon": "BarChart3", "table": "audit_history", "dateColumn": "created_at", "action_filter": "report"}'::jsonb,
    updated_at = now()
WHERE category = 'clearance_types' AND key = 'reporting';
