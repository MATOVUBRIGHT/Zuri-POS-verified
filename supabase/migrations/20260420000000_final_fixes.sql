-- Final comprehensive fix for all remaining issues
-- Run this in Supabase SQL Editor

-- ── SALE_RETURNS: add missing columns ─────────────────────────────────────
ALTER TABLE public.sale_returns ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]';
ALTER TABLE public.sale_returns ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE public.sale_returns ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE public.sale_returns ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'return';
ALTER TABLE public.sale_returns ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'completed';

-- ── SHIFTS: ensure table exists with all columns ───────────────────────────
CREATE TABLE IF NOT EXISTS public.shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  staff_id UUID NULL,
  status TEXT DEFAULT 'open',
  starting_cash NUMERIC DEFAULT 0,
  ending_cash_actual NUMERIC,
  ending_cash_expected NUMERIC,
  start_time TIMESTAMPTZ DEFAULT NOW(),
  end_time TIMESTAMPTZ,
  approval_status TEXT DEFAULT 'approved',
  approved_by UUID NULL,
  shift_type TEXT DEFAULT 'standard',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their shifts" ON public.shifts;
CREATE POLICY "Users can manage their shifts" ON public.shifts FOR ALL
  USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.stores WHERE id = shifts.store_id AND user_id = auth.uid()))
  WITH CHECK (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.stores WHERE id = shifts.store_id AND user_id = auth.uid()));

-- ── STAFF: ensure pin columns exist ───────────────────────────────────────
ALTER TABLE IF EXISTS public.staff ADD COLUMN IF NOT EXISTS pin_hash TEXT;
ALTER TABLE IF EXISTS public.staff ADD COLUMN IF NOT EXISTS pin_code TEXT;
ALTER TABLE IF EXISTS public.staff ADD COLUMN IF NOT EXISTS allowed_pages JSONB;
ALTER TABLE IF EXISTS public.staff ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS public.staff ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ── VERIFY_PIN_HASH function (for local PIN verification) ─────────────────
DROP FUNCTION IF EXISTS public.verify_pin_hash(text, text);
CREATE OR REPLACE FUNCTION public.verify_pin_hash(_pin_input text, _hash text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $$
  SELECT extensions.crypt(_pin_input, _hash) = _hash;
$$;

-- ── PAYMENT_METHODS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Cash',
  is_active BOOLEAN DEFAULT true,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage payment methods" ON public.payment_methods;
CREATE POLICY "Users can manage payment methods" ON public.payment_methods FOR ALL
  USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.stores WHERE id = payment_methods.store_id AND user_id = auth.uid()))
  WITH CHECK (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.stores WHERE id = payment_methods.store_id AND user_id = auth.uid()));

-- ── INVENTORY RLS ──────────────────────────────────────────────────────────
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their inventory" ON public.inventory;
CREATE POLICY "Users can manage their inventory" ON public.inventory FOR ALL
  USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.stores WHERE id = inventory.store_id AND user_id = auth.uid()))
  WITH CHECK (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.stores WHERE id = inventory.store_id AND user_id = auth.uid()));

-- ── SALES RLS ──────────────────────────────────────────────────────────────
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can create sales" ON public.sales;
CREATE POLICY "Users can create sales" ON public.sales FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can view accessible sales" ON public.sales;
CREATE POLICY "Users can view accessible sales" ON public.sales FOR SELECT
  USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.store_access WHERE store_id = sales.store_id AND user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can update their own sales" ON public.sales;
CREATE POLICY "Users can update their own sales" ON public.sales FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete their own sales" ON public.sales;
CREATE POLICY "Users can delete their own sales" ON public.sales FOR DELETE USING (auth.uid() = user_id);

-- ── REALTIME ───────────────────────────────────────────────────────────────
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.shifts; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.sale_returns; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_methods; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
