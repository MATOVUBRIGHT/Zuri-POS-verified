-- Add missing created_at column to shifts table.
-- Some early migrations created shifts without created_at (only start_time/updated_at).
-- This backfills the column safely using start_time as the default for existing rows.

ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;

-- Backfill existing rows using start_time (equivalent semantically)
UPDATE public.shifts
SET created_at = start_time
WHERE created_at IS NULL;

-- Apply a default for all future rows
ALTER TABLE public.shifts
  ALTER COLUMN created_at SET DEFAULT NOW();

-- Publish shifts in realtime if not already there
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.shifts;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
