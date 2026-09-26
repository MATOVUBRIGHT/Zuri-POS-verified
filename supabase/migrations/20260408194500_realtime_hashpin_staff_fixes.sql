-- Production fixes: realtime publication + PIN hashing RPC + safer RLS policies for inventory/staff.
-- Created: 2026-04-08

-- 1) Ensure pgcrypto is installed (Supabase typically installs it in schema `extensions`).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') THEN
    CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN
    -- Extension already exists (possibly in a different schema). Safe to ignore.
    NULL;
END $$;

-- 2) Ensure hash_pin RPC exists (bcrypt using pgcrypto's crypt()).
-- NOTE: The argument name is `_pin_input` because the frontend uses it.
CREATE OR REPLACE FUNCTION public.hash_pin(_pin_input text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $$
  SELECT extensions.crypt(_pin_input, extensions.gen_salt('bf', 8));
$$;

-- 3) Ensure verify_pin_hash exists (used for PIN checks).
CREATE OR REPLACE FUNCTION public.verify_pin_hash(_pin_input text, _pin_hash text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $$
  SELECT _pin_hash = extensions.crypt(_pin_input, _pin_hash);
$$;

-- 4) Ensure staff has `pin_hash` (some older DBs may still be missing it).
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS pin_hash text;

-- 5) Enable Realtime replication for required tables (idempotent).
-- Postgres does not support "ADD TABLE IF NOT EXISTS" for publications, so we check catalog first.
DO $$
DECLARE
  pub_oid oid;
BEGIN
  SELECT oid INTO pub_oid FROM pg_publication WHERE pubname = 'supabase_realtime';
  IF pub_oid IS NULL THEN
    RAISE NOTICE 'Publication supabase_realtime not found; skipping realtime table registration.';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_rel pr
    JOIN pg_class c ON c.oid = pr.prrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pr.prpubid = pub_oid AND n.nspname = 'public' AND c.relname = 'inventory'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_rel pr
    JOIN pg_class c ON c.oid = pr.prrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pr.prpubid = pub_oid AND n.nspname = 'public' AND c.relname = 'staff'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.staff';
  END IF;
END $$;

-- 6) Ensure RLS is enabled (required for production; Realtime also uses it for access control).
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

-- 7) RLS policies: allow authenticated users to SELECT rows for stores they own or have access to.
-- This avoids "SELECT USING (true)" which would leak data cross-tenant.
DROP POLICY IF EXISTS "Allow realtime inventory" ON public.inventory;
CREATE POLICY "Allow realtime inventory"
ON public.inventory
FOR SELECT
USING (
  auth.role() = 'authenticated' AND (
    auth.uid() = user_id OR
    store_id IN (SELECT id FROM public.stores WHERE user_id = auth.uid()) OR
    store_id IN (SELECT store_id FROM public.store_access WHERE user_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Allow realtime staff" ON public.staff;
CREATE POLICY "Allow realtime staff"
ON public.staff
FOR SELECT
USING (
  auth.role() = 'authenticated' AND (
    auth.uid() = user_id OR
    store_id IN (SELECT id FROM public.stores WHERE user_id = auth.uid()) OR
    store_id IN (SELECT store_id FROM public.store_access WHERE user_id = auth.uid())
  )
);

