-- ============================================================
-- BOOTSTRAP FIX - run this in Supabase SQL Editor if the full
-- migration chain has not been applied to a new project.
-- Covers: RLS policies, missing columns, hash_pin function,
--         realtime publication, and store access password.
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- hash_pin RPC (used by staff PIN setup)
CREATE OR REPLACE FUNCTION public.hash_pin(_pin_input text)
RETURNS text
AS $$
  SELECT extensions.crypt(_pin_input, extensions.gen_salt('bf', 8));
$$
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public, extensions;

-- Helper functions to avoid RLS recursion in policy cross-checks
CREATE OR REPLACE FUNCTION public.is_store_owner(_store_id uuid, _user_id uuid)
RETURNS boolean
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.stores
    WHERE id = _store_id
      AND user_id = _user_id
  );
$$
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public;

CREATE OR REPLACE FUNCTION public.has_store_access(_store_id uuid, _user_id uuid)
RETURNS boolean
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.store_access
    WHERE store_id = _store_id
      AND user_id = _user_id
  );
$$
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public;

-- Ensure helper functions run as a role that can bypass RLS (Supabase usually has postgres)
DO $$
BEGIN
  ALTER FUNCTION public.is_store_owner(uuid, uuid) OWNER TO postgres;
  ALTER FUNCTION public.has_store_access(uuid, uuid) OWNER TO postgres;
EXCEPTION
  WHEN insufficient_privilege THEN
    NULL;
  WHEN undefined_object THEN
    NULL;
END $$ LANGUAGE plpgsql;

-- Remove any legacy policies that may still reference each table recursively
DO $$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'stores'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.stores', p.policyname);
  END LOOP;

  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'store_access'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.store_access', p.policyname);
  END LOOP;
END $$ LANGUAGE plpgsql;

-- Stores
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own stores" ON public.stores;
CREATE POLICY "Users can manage their own stores"
  ON public.stores FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view accessible stores" ON public.stores;
DROP POLICY IF EXISTS "Users can view their own stores" ON public.stores;
CREATE POLICY "Users can view accessible stores"
  ON public.stores FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.has_store_access(id, auth.uid())
  );

-- Store access password column (safe to run multiple times)
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS access_password_hash text DEFAULT NULL;

-- Store Access
ALTER TABLE public.store_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Store owners can manage access" ON public.store_access;
DROP POLICY IF EXISTS "Store owners can insert access" ON public.store_access;
DROP POLICY IF EXISTS "Store owners can update access" ON public.store_access;
DROP POLICY IF EXISTS "Store owners can delete access" ON public.store_access;
DROP POLICY IF EXISTS "Users can insert their access" ON public.store_access;
DROP POLICY IF EXISTS "Users can update their access" ON public.store_access;
DROP POLICY IF EXISTS "Users can delete their access" ON public.store_access;
DROP POLICY IF EXISTS "Users can manage their access" ON public.store_access;

CREATE POLICY "Users can delete their access"
  ON public.store_access FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their access" ON public.store_access;
CREATE POLICY "Users can view their access"
  ON public.store_access FOR SELECT
  USING (auth.uid() = user_id);

-- Sales
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own sales" ON public.sales;
DROP POLICY IF EXISTS "Users can view accessible sales" ON public.sales;
CREATE POLICY "Users can view accessible sales"
  ON public.sales FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.has_store_access(store_id, auth.uid())
  );

DROP POLICY IF EXISTS "Users can create sales" ON public.sales;
CREATE POLICY "Users can create sales"
  ON public.sales FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own sales" ON public.sales;
CREATE POLICY "Users can update their own sales"
  ON public.sales FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own sales" ON public.sales;
CREATE POLICY "Users can delete their own sales"
  ON public.sales FOR DELETE
  USING (auth.uid() = user_id);

-- Inventory
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their inventory" ON public.inventory;
CREATE POLICY "Users can manage their inventory"
  ON public.inventory FOR ALL
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM public.stores
      WHERE stores.id = inventory.store_id
        AND stores.user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM public.stores
      WHERE stores.id = inventory.store_id
        AND stores.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can view accessible inventory" ON public.inventory;
CREATE POLICY "Users can view accessible inventory"
  ON public.inventory FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.is_store_owner(store_id, auth.uid())
    OR public.has_store_access(store_id, auth.uid())
  );

-- Expenses
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their expenses" ON public.expenses;
CREATE POLICY "Users can manage their expenses"
  ON public.expenses FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view accessible expenses" ON public.expenses;
CREATE POLICY "Users can view accessible expenses"
  ON public.expenses FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.has_store_access(store_id, auth.uid())
  );

-- Cash Transactions
ALTER TABLE public.cash_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage cash transactions" ON public.cash_transactions;
CREATE POLICY "Users can manage cash transactions"
  ON public.cash_transactions FOR ALL
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM public.stores
      WHERE stores.id = cash_transactions.store_id
        AND stores.user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM public.stores
      WHERE stores.id = cash_transactions.store_id
        AND stores.user_id = auth.uid()
    )
  );

-- Staff
ALTER TABLE IF EXISTS public.staff
  ADD COLUMN IF NOT EXISTS pin_hash text,
  ADD COLUMN IF NOT EXISTS pin_code text,
  ADD COLUMN IF NOT EXISTS allowed_pages jsonb,
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT NOW();

ALTER TABLE IF EXISTS public.staff ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Store owners can manage their staff" ON public.staff;
CREATE POLICY "Store owners can manage their staff"
  ON public.staff FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.stores
      WHERE stores.id = staff.store_id
        AND stores.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.stores
      WHERE stores.id = staff.store_id
        AND stores.user_id = auth.uid()
    )
  );

-- Sale Returns (may not exist on new projects)
CREATE TABLE IF NOT EXISTS public.sale_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sale_id uuid REFERENCES public.sales(id) ON DELETE CASCADE,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_amount numeric NOT NULL DEFAULT 0,
  reason text,
  staff_id uuid NULL REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

-- Keep sale_returns compatible with both old and new app payloads.
ALTER TABLE IF EXISTS public.sale_returns
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS type text DEFAULT 'return',
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS returned_products jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS return_reason text,
  ADD COLUMN IF NOT EXISTS return_notes text,
  ADD COLUMN IF NOT EXISTS return_date date DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS refund_method text DEFAULT 'cash',
  ADD COLUMN IF NOT EXISTS refund_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS refund_account_number text,
  ADD COLUMN IF NOT EXISTS refund_account_name text,
  ADD COLUMN IF NOT EXISTS refund_transaction_reference text,
  ADD COLUMN IF NOT EXISTS refund_mobile_number text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sale_returns'
      AND column_name = 'sale_id'
      AND is_nullable = 'NO'
  ) THEN
    EXECUTE 'ALTER TABLE public.sale_returns ALTER COLUMN sale_id DROP NOT NULL';
  END IF;
EXCEPTION
  WHEN undefined_table THEN
    NULL;
END $$ LANGUAGE plpgsql;

ALTER TABLE IF EXISTS public.sale_returns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage sale returns" ON public.sale_returns;
CREATE POLICY "Users can manage sale returns"
  ON public.sale_returns FOR ALL
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM public.stores
      WHERE stores.id = sale_returns.store_id
        AND stores.user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM public.stores
      WHERE stores.id = sale_returns.store_id
        AND stores.user_id = auth.uid()
    )
  );

-- Payment Methods (may not exist on new projects)
CREATE TABLE IF NOT EXISTS public.payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_active boolean DEFAULT true,
  details jsonb,
  created_at timestamptz DEFAULT NOW()
);

ALTER TABLE IF EXISTS public.payment_methods
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS details jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT NOW();

ALTER TABLE IF EXISTS public.payment_methods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage payment methods" ON public.payment_methods;
CREATE POLICY "Users can manage payment methods"
  ON public.payment_methods FOR ALL
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM public.stores
      WHERE stores.id = payment_methods.store_id
        AND stores.user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM public.stores
      WHERE stores.id = payment_methods.store_id
        AND stores.user_id = auth.uid()
    )
  );

-- Shifts (may not exist on new projects)
CREATE TABLE IF NOT EXISTS public.shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  staff_id uuid NULL REFERENCES public.staff(id) ON DELETE SET NULL,
  status text DEFAULT 'open',
  starting_cash numeric DEFAULT 0,
  ending_cash_actual numeric,
  ending_cash_expected numeric,
  start_time timestamptz DEFAULT NOW(),
  end_time timestamptz,
  approval_status text DEFAULT 'approved',
  approved_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  shift_type text DEFAULT 'standard',
  notes text,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW()
);

ALTER TABLE IF EXISTS public.shifts
  ADD COLUMN IF NOT EXISTS start_time timestamptz DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS end_time timestamptz,
  ADD COLUMN IF NOT EXISTS ending_cash_actual numeric,
  ADD COLUMN IF NOT EXISTS ending_cash_expected numeric,
  ADD COLUMN IF NOT EXISTS approval_status text DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS shift_type text DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT NOW();

ALTER TABLE IF EXISTS public.shifts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their shifts" ON public.shifts;
CREATE POLICY "Users can manage their shifts"
  ON public.shifts FOR ALL
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM public.stores
      WHERE stores.id = shifts.store_id
        AND stores.user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM public.stores
      WHERE stores.id = shifts.store_id
        AND stores.user_id = auth.uid()
    )
  );

-- Realtime registration for key tables (idempotent)
DO $$
DECLARE
  pub_oid oid;
  tbl text;
BEGIN
  SELECT oid INTO pub_oid
  FROM pg_publication
  WHERE pubname = 'supabase_realtime';

  IF pub_oid IS NULL THEN
    RAISE NOTICE 'Publication supabase_realtime not found; skipping realtime registration.';
    RETURN;
  END IF;

  FOREACH tbl IN ARRAY ARRAY[
    'sales',
    'inventory',
    'expenses',
    'staff',
    'shifts',
    'sale_returns',
    'payment_methods',
    'cash_transactions'
  ]
  LOOP
    IF to_regclass(format('public.%I', tbl)) IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM pg_publication_rel pr
         JOIN pg_class c ON c.oid = pr.prrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE pr.prpubid = pub_oid
           AND n.nspname = 'public'
           AND c.relname = tbl
       ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
    END IF;
  END LOOP;
END $$ LANGUAGE plpgsql;
