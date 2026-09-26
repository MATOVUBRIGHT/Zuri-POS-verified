-- Add access_password_hash column to stores table
-- Safe to run multiple times (IF NOT EXISTS)
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS access_password_hash TEXT DEFAULT NULL;
