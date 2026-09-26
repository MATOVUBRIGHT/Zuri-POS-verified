-- Add payment_details column to sales if missing, and (optionally) ensure payment_method_id exists
-- Safe to run multiple times due to IF NOT EXISTS guards

BEGIN;

-- jsonb payload storing provider-specific payment metadata (MoMo ref, card ref, payer/account, etc.)
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS payment_details JSONB;

-- Ensure a foreign key for payment method is present (referenced by the UI)
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS payment_method_id UUID REFERENCES public.payment_methods(id) ON DELETE SET NULL;

COMMIT;