
-- Add supplier_id and supplier_name columns to inventory table
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS supplier_name text;
