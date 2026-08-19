-- Fix and expand clearance types with multi-table support.
-- Each type's value has: icon, tables[] = [{table, dateColumn}]
-- Pages listed: evaluation, repeated failure, calibration, report, analysis, dashboard, agent performance/coaching

DELETE FROM system_config WHERE category = 'clearance_types';

INSERT INTO system_config (category, key, label, description, value, active, sort_order)
VALUES
('clearance_types','evaluations','Evaluations','Clear evaluation records, scores, and root causes',
 '{"icon":"FileText","tables":[{"table":"evaluations","dateColumn":"evaluation_date"},{"table":"evaluation_root_causes","dateColumn":"created_at"}]}'::jsonb, true, 0),

('clearance_types','repeated_failure','Repeated Failure','Clear repeated failure processes and assessments',
 '{"icon":"AlertTriangle","tables":[{"table":"repeated_failure_processes","dateColumn":"created_at"},{"table":"rf_assessments","dateColumn":"created_at"}]}'::jsonb, true, 1),

('clearance_types','calibration','Calibration','Clear calibration sessions and their evaluations',
 '{"icon":"ShieldCheck","tables":[{"table":"calibration_sessions","dateColumn":"calibration_date"},{"table":"calibration_evaluations","dateColumn":"created_at"}]}'::jsonb, true, 2),

('clearance_types','reporting','Reports','Clear evaluation data used to generate reports',
 '{"icon":"BarChart3","tables":[{"table":"evaluations","dateColumn":"evaluation_date"}]}'::jsonb, true, 3),

('clearance_types','analysis','Analysis','Clear saved analysis suggestions and custom analyses',
 '{"icon":"Search","tables":[{"table":"analysis_suggestions","dateColumn":"created_at"},{"table":"custom_analyses","dateColumn":"created_at"}]}'::jsonb, true, 4),

('clearance_types','dashboard','Dashboard','Clear evaluation and coaching data shown on the dashboard',
 '{"icon":"LayoutDashboard","tables":[{"table":"evaluations","dateColumn":"evaluation_date"},{"table":"coaching_sessions","dateColumn":"scheduled_date"}]}'::jsonb, true, 5),

('clearance_types','agent_performance','Agent Performance & Coaching','Clear coaching sessions and evaluations driving agent performance',
 '{"icon":"Users","tables":[{"table":"coaching_sessions","dateColumn":"scheduled_date"},{"table":"evaluations","dateColumn":"evaluation_date"}]}'::jsonb, true, 6);
