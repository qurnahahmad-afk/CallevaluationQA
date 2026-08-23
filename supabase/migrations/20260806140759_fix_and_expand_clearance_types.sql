-- Fix and expand clearance types to cover all pages:
-- 1. Evaluations (was wrongly pointing to repeated_failure_processes!)
-- 2. Repeated Failure
-- 3. Calibration
-- 4. Reports
-- 5. Analysis
-- 6. Dashboard
-- 7. Agent Performance / Coaching Dashboard

-- Clear existing clearance types
DELETE FROM system_config WHERE category = 'clearance_types';

INSERT INTO system_config (category, key, label, description, value, active, sort_order)
VALUES
('clearance_types','evaluations','Evaluations','Clear evaluation records including scores and root causes',
 '{"icon":"FileText","table":"evaluations","dateColumn":"evaluation_date"}'::jsonb, true, 0),

('clearance_types','repeated_failure','Repeated Failure','Clear repeated failure processes and assessments',
 '{"icon":"AlertTriangle","table":"repeated_failure_processes","dateColumn":"created_at"}'::jsonb, true, 1),

('clearance_types','calibration','Calibration','Clear calibration sessions and their evaluations',
 '{"icon":"ShieldCheck","table":"calibration_sessions","dateColumn":"calibration_date"}'::jsonb, true, 2),

('clearance_types','reporting','Reports','Clear report-related audit history entries',
 '{"icon":"BarChart3","table":"audit_history","dateColumn":"created_at"}'::jsonb, true, 3),

('clearance_types','analysis','Analysis','Clear saved analysis suggestions and custom analyses',
 '{"icon":"Search","table":"analysis_suggestions","dateColumn":"created_at"}'::jsonb, true, 4),

('clearance_types','dashboard','Dashboard','Clear dashboard-related audit history entries',
 '{"icon":"LayoutDashboard","table":"audit_history","dateColumn":"created_at"}'::jsonb, true, 5),

('clearance_types','agent_performance','Agent Performance & Coaching','Clear coaching sessions linked to agent performance',
 '{"icon":"Users","table":"coaching_sessions","dateColumn":"scheduled_date"}'::jsonb, true, 6);
