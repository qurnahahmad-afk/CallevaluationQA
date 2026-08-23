/*
# QA Call Evaluation System Schema

## Purpose
Call-center Quality Assurance evaluation system (based on Malomatia QA Scorecard).
Coaches evaluate agent calls against a 17-item scorecard split into 4 severity
categories, producing a numeric score (0-100) and Pass/Fail verdict. The team
roster, reference dropdown values, and glossary definitions are seeded so the
form is fully guided.

## 1. New Tables

### agents
- id (uuid PK), agent_name, attendance_user, mena_me_code, team_leader, qa, lob,
  active (bool default true), created_at
### evaluations
- id (uuid PK), evaluation_date (date), agent_id (FK agents ON DELETE SET NULL),
  coach_name, email_date_time (timestamptz), main_skill, mistake_type, ticket_link,
  caller_number, call_duration, monitoring_type, call_score (int), pass_fail (text),
  customer_verbatim, comment, call_summary, feedback_to_agent, checklist (jsonb),
  plus DSAT / FCR / hold / AHT / RCA L1-L3 / service mapping fields, created_at
### reference_options
- id (uuid PK), category, value, sort_order, created_at
### glossary
- id (uuid PK), section, attribute, description, created_at

## 2. Security
- RLS enabled on all tables.
- Single-tenant team tool, no sign-in screen: anon + authenticated full CRUD
  on intentionally-shared data.
*/

CREATE TABLE IF NOT EXISTS agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name text NOT NULL,
  attendance_user text,
  mena_me_code text,
  team_leader text,
  qa text,
  lob text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_date date NOT NULL DEFAULT CURRENT_DATE,
  agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
  coach_name text NOT NULL,
  email_date_time timestamptz,
  main_skill text,
  mistake_type text DEFAULT '',
  ticket_link text,
  caller_number text,
  call_duration text,
  monitoring_type text DEFAULT 'Program',
  call_score integer NOT NULL DEFAULT 100,
  pass_fail text NOT NULL DEFAULT 'Pass',
  customer_verbatim text DEFAULT '',
  comment text DEFAULT '',
  call_summary text DEFAULT '',
  feedback_to_agent text DEFAULT '',
  checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  dsat boolean DEFAULT false,
  dsat_reason_l1 text DEFAULT '',
  dsat_reason_l2 text DEFAULT '',
  dsat_reason_l3 text DEFAULT '',
  sub_type text DEFAULT '',
  call_subcategory text DEFAULT '',
  repeated_interaction boolean DEFAULT false,
  repeated_reason_l1 text DEFAULT '',
  repeated_reason_l2 text DEFAULT '',
  repeated_reason_l3 text DEFAULT '',
  solved_customer_issue text DEFAULT 'Yes',
  fcr_not_achieved_l1 text DEFAULT '',
  fcr_not_achieved_l2 text DEFAULT '',
  fcr_not_achieved_l3 text DEFAULT '',
  agent_follow_service_mapping text DEFAULT 'Yes',
  not_follow_mapping_l1 text DEFAULT '',
  not_follow_mapping_l2 text DEFAULT '',
  valid_hold text DEFAULT 'Yes',
  hold_reason text DEFAULT '',
  valid_aht text DEFAULT 'Yes',
  long_aht_reason text DEFAULT '',
  core_issue_l1 text DEFAULT '',
  core_issue_l2 text DEFAULT '',
  core_issue_l3 text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reference_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  value text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS glossary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section text NOT NULL,
  attribute text NOT NULL,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE reference_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE glossary ENABLE ROW LEVEL SECURITY;

-- agents policies (single-tenant shared)
DROP POLICY IF EXISTS "anon_select_agents" ON agents;
CREATE POLICY "anon_select_agents" ON agents FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_agents" ON agents;
CREATE POLICY "anon_insert_agents" ON agents FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_agents" ON agents;
CREATE POLICY "anon_update_agents" ON agents FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_agents" ON agents;
CREATE POLICY "anon_delete_agents" ON agents FOR DELETE
  TO anon, authenticated USING (true);

-- evaluations policies
DROP POLICY IF EXISTS "anon_select_evaluations" ON evaluations;
CREATE POLICY "anon_select_evaluations" ON evaluations FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_evaluations" ON evaluations;
CREATE POLICY "anon_insert_evaluations" ON evaluations FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_evaluations" ON evaluations;
CREATE POLICY "anon_update_evaluations" ON evaluations FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_evaluations" ON evaluations;
CREATE POLICY "anon_delete_evaluations" ON evaluations FOR DELETE
  TO anon, authenticated USING (true);

-- reference_options policies
DROP POLICY IF EXISTS "anon_select_reference_options" ON reference_options;
CREATE POLICY "anon_select_reference_options" ON reference_options FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_reference_options" ON reference_options;
CREATE POLICY "anon_insert_reference_options" ON reference_options FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_reference_options" ON reference_options;
CREATE POLICY "anon_update_reference_options" ON reference_options FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_reference_options" ON reference_options;
CREATE POLICY "anon_delete_reference_options" ON reference_options FOR DELETE
  TO anon, authenticated USING (true);

-- glossary policies
DROP POLICY IF EXISTS "anon_select_glossary" ON glossary;
CREATE POLICY "anon_select_glossary" ON glossary FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_glossary" ON glossary;
CREATE POLICY "anon_insert_glossary" ON glossary FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_glossary" ON glossary;
CREATE POLICY "anon_update_glossary" ON glossary FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_glossary" ON glossary;
CREATE POLICY "anon_delete_glossary" ON glossary FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_evaluations_agent_id ON evaluations(agent_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_date ON evaluations(evaluation_date DESC);
CREATE INDEX IF NOT EXISTS idx_evaluations_pass_fail ON evaluations(pass_fail);
CREATE INDEX IF NOT EXISTS idx_reference_options_category ON reference_options(category, sort_order);
CREATE INDEX IF NOT EXISTS idx_agents_active ON agents(active);