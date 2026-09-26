-- Add JSONB details to payment methods for storing account info and instructions.
-- Safe to run multiple times due to IF NOT EXISTS.

BEGIN;

ALTER TABLE public.payment_methods
  ADD COLUMN IF NOT EXISTS details JSONB;

COMMIT;

