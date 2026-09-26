-- Add missing PIN and access columns to staff table
-- Safe to run multiple times (IF NOT EXISTS)
ALTER TABLE IF EXISTS public.staff ADD COLUMN IF NOT EXISTS pin_hash    TEXT;
ALTER TABLE IF EXISTS public.staff ADD COLUMN IF NOT EXISTS pin_code    TEXT;
ALTER TABLE IF EXISTS public.staff ADD COLUMN IF NOT EXISTS allowed_pages JSONB;
ALTER TABLE IF EXISTS public.staff ADD COLUMN IF NOT EXISTS user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS public.staff ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ DEFAULT NOW();

-- Ensure hash_pin RPC exists (needed for PIN hashing)
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.hash_pin(_pin_input text)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $$
  SELECT extensions.crypt(_pin_input, extensions.gen_salt('bf', 8));
$$;
