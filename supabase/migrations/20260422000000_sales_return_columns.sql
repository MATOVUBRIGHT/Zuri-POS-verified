-- Add return tracking columns to sales table
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS return_status TEXT DEFAULT NULL;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS returned_amount NUMERIC DEFAULT 0;

-- Index for quick lookup of returned sales
CREATE INDEX IF NOT EXISTS idx_sales_return_status ON public.sales(return_status) WHERE return_status IS NOT NULL;

-- Ensure cash_transactions has description column
ALTER TABLE public.cash_transactions ADD COLUMN IF NOT EXISTS description TEXT;

NOTIFY pgrst, 'reload schema';
