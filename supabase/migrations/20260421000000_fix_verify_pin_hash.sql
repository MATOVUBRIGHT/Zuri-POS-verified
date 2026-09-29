-- Fix verify_pin_hash function (drop first to avoid parameter name conflict)
DROP FUNCTION IF EXISTS public.verify_pin_hash(text, text);

CREATE OR REPLACE FUNCTION public.verify_pin_hash(pin_input text, pin_hash text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $$
  SELECT extensions.crypt(pin_input, pin_hash) = pin_hash;
$$;

-- Also ensure hash_pin function exists for creating new PINs
DROP FUNCTION IF EXISTS public.hash_pin(text);
CREATE OR REPLACE FUNCTION public.hash_pin(pin_input text)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $$
  SELECT extensions.crypt(pin_input, extensions.gen_salt('bf'));
$$;

-- Ensure staff table has all needed columns
ALTER TABLE IF EXISTS public.staff ADD COLUMN IF NOT EXISTS pin_hash TEXT;
ALTER TABLE IF EXISTS public.staff ADD COLUMN IF NOT EXISTS pin_code TEXT;
ALTER TABLE IF EXISTS public.staff ADD COLUMN IF NOT EXISTS allowed_pages JSONB;
ALTER TABLE IF EXISTS public.staff ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Ensure shifts table exists with all columns
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
  USING (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM public.stores WHERE id = shifts.store_id AND user_id = auth.uid())
  )
  WITH CHECK (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM public.stores WHERE id = shifts.store_id AND user_id = auth.uid())
  );

-- Ensure sale_returns has all needed columns
ALTER TABLE IF EXISTS public.sale_returns ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]';
ALTER TABLE IF EXISTS public.sale_returns ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE IF EXISTS public.sale_returns ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE IF EXISTS public.sale_returns ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'return';
ALTER TABLE IF EXISTS public.sale_returns ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'completed';

-- Realtime
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.shifts; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.sale_returns; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
