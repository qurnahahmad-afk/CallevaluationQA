/*
# Add case-control and DSAT score support

1. New Tables
- `evaluation_case_locks` stores active case IDs while an evaluation is being worked on, preventing two users from evaluating the same case at once.
- `id` is the lock identifier.
- `case_id` is the normalized case ID and is unique while the lock is active.
- `evaluation_id` links a released lock to its completed evaluation when available.
- `locked_by` records the signed-in user who started the evaluation.
- `locked_at` and `released_at` record the lock lifecycle.

2. New Columns
- `evaluations.dsat_score` stores the selected DSAT rating (1 through 5) without changing the existing `dsat` boolean used by reports.

3. Security
- Row-level security is enabled on the new lock table.
- Authenticated users may read and manage locks so the application can provide immediate duplicate-case feedback.
- Existing evaluation data and columns are preserved.

4. Important Notes
- Existing rows are not changed.
- The unique active-case index prevents duplicate active locks even if two users submit at the same time.
*/

ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS dsat_score text;

CREATE TABLE IF NOT EXISTS evaluation_case_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id text NOT NULL,
  evaluation_id uuid REFERENCES evaluations(id) ON DELETE SET NULL,
  locked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  locked_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS evaluation_case_locks_active_case_idx
  ON evaluation_case_locks (lower(trim(case_id)))
  WHERE released_at IS NULL;

ALTER TABLE evaluation_case_locks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_case_locks" ON evaluation_case_locks;
CREATE POLICY "authenticated_read_case_locks" ON evaluation_case_locks
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_case_locks" ON evaluation_case_locks;
CREATE POLICY "authenticated_insert_case_locks" ON evaluation_case_locks
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = locked_by);

DROP POLICY IF EXISTS "authenticated_update_case_locks" ON evaluation_case_locks;
CREATE POLICY "authenticated_update_case_locks" ON evaluation_case_locks
  FOR UPDATE TO authenticated USING (auth.uid() = locked_by) WITH CHECK (auth.uid() = locked_by);

DROP POLICY IF EXISTS "authenticated_delete_case_locks" ON evaluation_case_locks;
CREATE POLICY "authenticated_delete_case_locks" ON evaluation_case_locks
  FOR DELETE TO authenticated USING (auth.uid() = locked_by);
