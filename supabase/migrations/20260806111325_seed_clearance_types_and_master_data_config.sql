-- Seed clearance_types into system_config so admins can add/edit/remove data clearance types
INSERT INTO system_config (category, key, label, description, value, sort_order, active)
VALUES
  ('clearance_types', 'evaluations', 'Evaluations', 'Clear evaluation records before a given date', '{"table":"evaluations","dateColumn":"evaluation_date","icon":"FileText"}'::jsonb, 0, true),
  ('clearance_types', 'coaching', 'Coaching', 'Clear coaching session records before a given date', '{"table":"coaching_sessions","dateColumn":"scheduled_date","icon":"CheckCircle2"}'::jsonb, 1, true),
  ('clearance_types', 'calibration', 'Calibration', 'Clear calibration session records before a given date', '{"table":"calibration_sessions","dateColumn":"calibration_date","icon":"ShieldCheck"}'::jsonb, 2, true),
  ('clearance_types', 'analysis', 'Analysis', 'Clear analysis suggestion records before a given date', '{"table":"analysis_suggestions","dateColumn":"created_at","icon":"Search"}'::jsonb, 3, true)
ON CONFLICT (category, key) DO NOTHING;

-- Add a 'master_data' category for lookup/reference data management
-- (uses existing reference_options table; no new table needed)
INSERT INTO system_config (category, key, label, description, value, sort_order, active)
VALUES
  ('master_data', 'main_skill', 'Main Skill', 'Primary skill categories for evaluations', '{"table":"reference_options","filter_column":"category"}'::jsonb, 0, true),
  ('master_data', 'mistake_type', 'Mistake Type', 'Types of mistakes tracked in evaluations', '{"table":"reference_options","filter_column":"category"}'::jsonb, 1, true),
  ('master_data', 'task_type', 'Task Type', 'Task types for evaluations', '{"table":"reference_options","filter_column":"category"}'::jsonb, 2, true),
  ('master_data', 'transaction_type', 'Transaction Type', 'Transaction types for evaluations', '{"table":"reference_options","filter_column":"category"}'::jsonb, 3, true),
  ('master_data', 'lob', 'Line of Business', 'Lines of business for agents and projects', '{"table":"reference_options","filter_column":"category"}'::jsonb, 4, true),
  ('master_data', 'call_subcategory', 'Call Subcategory', 'Subcategories for call classification', '{"table":"reference_options","filter_column":"category"}'::jsonb, 5, true)
ON CONFLICT (category, key) DO NOTHING;
