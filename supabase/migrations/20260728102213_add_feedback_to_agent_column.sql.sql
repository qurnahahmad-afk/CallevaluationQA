/*
# Add feedback_to_agent column to coaching_sessions

1. Modified Tables
- coaching_sessions: Added `feedback_to_agent text` column to store coach feedback to the agent during coaching sessions.
*/

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'coaching_sessions' AND column_name = 'feedback_to_agent') THEN
    ALTER TABLE coaching_sessions ADD COLUMN feedback_to_agent text;
  END IF;
END $$;
