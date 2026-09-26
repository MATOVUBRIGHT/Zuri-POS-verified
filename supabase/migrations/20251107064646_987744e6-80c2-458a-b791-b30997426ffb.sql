-- Add theme and color scheme columns to profiles table for cross-device sync
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS theme text DEFAULT 'system',
ADD COLUMN IF NOT EXISTS color_scheme text DEFAULT 'default';

-- Enable realtime for stock_loans table
ALTER TABLE public.stock_loans REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_loans;