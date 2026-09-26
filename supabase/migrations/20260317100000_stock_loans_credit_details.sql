-- Add supplier linkage and credit metadata to stock_loans (supplier payables).
-- Safe to run multiple times.

ALTER TABLE public.stock_loans
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS reference text,
  ADD COLUMN IF NOT EXISTS details text;

CREATE INDEX IF NOT EXISTS idx_stock_loans_supplier_id ON public.stock_loans(supplier_id);
CREATE INDEX IF NOT EXISTS idx_stock_loans_due_date ON public.stock_loans(due_date);

