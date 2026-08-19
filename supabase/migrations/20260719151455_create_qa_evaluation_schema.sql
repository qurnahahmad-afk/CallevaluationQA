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
- id (uuid, PK)
- agent_name (text)  -- "CAFU Username" display name
- attendance_user (text)  -- system/login username
- mena_me_code (text)  -- HR code
- team_leader (text)
- qa (text)  -- assigned QA reviewer
- lob (text)  -- line of business: Voice / Non-Voice / Escalation / Over Night
- active (boolean, default true)
- created_at (timestamptz)

### evaluations
- id (uuid, PK)
- evaluation_date (date)  -- when evaluation was performed
- agent_id (uuid, FK -> agents.id ON DELETE SET NULL)
- coach_name (text)
- email_date_time (timestamptz)  -- call timestamp from the ticketing email
- main_skill (text)  -- e.g. HMC
- mistake_type (text)  -- Non Critical / End-user Critical / Business Critical / Compliance Critical / ""
- ticket_link (text)
- caller_number (text)
- call_duration (text)  -- e.g. "2min 16s"
- monitoring_type (text)  -- Program / Call Back / ...
- call_score (integer)  -- computed 0-100
- pass_fail (text)  -- Pass / Failed
- customer_verbatim (text)
- comment (text)
- call_summary (text)
- feedback_to_agent (text)
- checklist (jsonb)  -- { "call_opening": "Yes"|"No", ... } per criterion key
- dsat (boolean)
- dsat_reason_l1 (text), dsat_reason_l2 (text), dsat_reason_l3 (text)
- sub_type (text)
- call_subcategory (text)
- repeated_interaction (boolean)
- repeated_reason_l1 (text), repeated_reason_l2 (text), repeated_reason_l3 (text)
- solved_customer_issue (text)  -- Yes / No
- fcr_not_achieved_l1 (text), l2, l3
- agent_follow_service_mapping (text)
- not_follow_mapping_l1 (text), l2
- valid_hold (text), hold_reason (text)
- valid_aht (text), long_aht_reason (text)
- core_issue_l1 (text), core_issue_l2 (text), core_issue_l3 (text)
- created_at (timestamptz)

### reference_options (reference dropdowns)
- id (uuid, PK)
- category (text)  -- rca_l1, rca_l2, rca_l3, fcr_l1, fcr_l3, csat, agent, aht, hold, sub_type, mistake_type, main_skill, monitoring_type, lob
- value (text)
- sort_order (integer)
- created_at (timestamptz)

### glossary
- id (uuid, PK)
- section (text)
- attribute (text)
- description (text)
- created_at (timestamptz)

## 2. Security
- Enable RLS on all four tables.
- This is a single-tenant team tool (no sign-in screen required), so policies
  allow anon + authenticated full CRUD on shared data. Documented intentionally public.
*/