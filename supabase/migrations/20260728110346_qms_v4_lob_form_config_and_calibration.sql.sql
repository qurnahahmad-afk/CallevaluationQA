/*
# QMS V4: Per-LOB Form Config + Calibration Enhancement

## Overview
This migration adds support for multiple evaluation forms per project (linked by LOB),
and enhances the calibration system with expert evaluation and comparison fields.

## Modified Tables

1. **projects** — Added `lob_form_config jsonb` column.
   This stores a map of LOB name → FormConfig, allowing different evaluation forms
   per LOB within the same project. When null, the project's default `form_config` is used.

2. **calibration_sessions** — Added comparison and expert evaluation fields:
   - `expert_user_id` (uuid, nullable): The expert/reference evaluator's user ID
   - `expert_user_name` (text, nullable): Expert's display name
   - `expert_checklist` (jsonb, nullable): Expert's checklist answers
   - `expert_call_score` (integer, nullable): Expert's computed score
   - `expert_pass_fail` (text, nullable): Expert's pass/fail result
   - `agreement_percentage` (numeric, nullable): Overall attribute agreement %
   - `matching_attributes` (integer, nullable): Count of matching attributes
   - `different_attributes` (integer, nullable): Count of different attributes
   - `comparison_details` (jsonb, nullable): Detailed comparison (per-attribute match/diff)
   - `final_decision` (text, nullable): Final calibration decision
   - `calibration_status` (text, nullable): 'Calibrated' or 'Not Calibrated'

## Security
- No new tables, existing RLS policies on projects and calibration_sessions remain in effect.

## Important Notes
1. `lob_form_config` is optional — projects without it fall back to `form_config`.
2. Expert evaluation is considered the reference when comparing.
3. Calibration status is auto-set to 'Calibrated' when agreement ≥ 80%, else 'Not Calibrated'.
*/

-- ===== PROJECTS: lob_form_config =====
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'lob_form_config') THEN
    ALTER TABLE projects ADD COLUMN lob_form_config jsonb;
  END IF;
END $$;

-- ===== CALIBRATION SESSIONS: expert + comparison fields =====
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'calibration_sessions' AND column_name = 'expert_user_id') THEN
    ALTER TABLE calibration_sessions ADD COLUMN expert_user_id uuid;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'calibration_sessions' AND column_name = 'expert_user_name') THEN
    ALTER TABLE calibration_sessions ADD COLUMN expert_user_name text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'calibration_sessions' AND column_name = 'expert_checklist') THEN
    ALTER TABLE calibration_sessions ADD COLUMN expert_checklist jsonb;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'calibration_sessions' AND column_name = 'expert_call_score') THEN
    ALTER TABLE calibration_sessions ADD COLUMN expert_call_score integer;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'calibration_sessions' AND column_name = 'expert_pass_fail') THEN
    ALTER TABLE calibration_sessions ADD COLUMN expert_pass_fail text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'calibration_sessions' AND column_name = 'agreement_percentage') THEN
    ALTER TABLE calibration_sessions ADD COLUMN agreement_percentage numeric;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'calibration_sessions' AND column_name = 'matching_attributes') THEN
    ALTER TABLE calibration_sessions ADD COLUMN matching_attributes integer;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'calibration_sessions' AND column_name = 'different_attributes') THEN
    ALTER TABLE calibration_sessions ADD COLUMN different_attributes integer;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'calibration_sessions' AND column_name = 'comparison_details') THEN
    ALTER TABLE calibration_sessions ADD COLUMN comparison_details jsonb;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'calibration_sessions' AND column_name = 'final_decision') THEN
    ALTER TABLE calibration_sessions ADD COLUMN final_decision text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'calibration_sessions' AND column_name = 'calibration_status') THEN
    ALTER TABLE calibration_sessions ADD COLUMN calibration_status text;
  END IF;
END $$;
