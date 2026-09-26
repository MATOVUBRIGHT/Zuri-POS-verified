-- Add last_closing_balance to stores table for shift continuity
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS last_closing_balance NUMERIC DEFAULT 0;

-- Update the column comment
COMMENT ON COLUMN public.stores.last_closing_balance IS 'The closing balance from the last shift, used as suggested opening balance for next shift';
