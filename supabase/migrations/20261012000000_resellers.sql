CREATE TABLE IF NOT EXISTS public.resellers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  business_name text,
  email text,
  phone text,
  notes text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'inactive')),
  is_application boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resellers_store_status
  ON public.resellers (store_id, status, created_at DESC);

ALTER TABLE public.resellers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Store users can view resellers" ON public.resellers;
CREATE POLICY "Store users can view resellers"
  ON public.resellers FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stores
      WHERE stores.id = resellers.store_id
        AND stores.user_id = auth.uid()
    )
    OR public.has_store_access(resellers.store_id, auth.uid())
  );

DROP POLICY IF EXISTS "Store owners can create resellers" ON public.resellers;
CREATE POLICY "Store owners can create resellers"
  ON public.resellers FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.stores
      WHERE stores.id = resellers.store_id
        AND stores.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Store owners can update resellers" ON public.resellers;
CREATE POLICY "Store owners can update resellers"
  ON public.resellers FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stores
      WHERE stores.id = resellers.store_id
        AND stores.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.stores
      WHERE stores.id = resellers.store_id
        AND stores.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Store owners can delete resellers" ON public.resellers;
CREATE POLICY "Store owners can delete resellers"
  ON public.resellers FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stores
      WHERE stores.id = resellers.store_id
        AND stores.user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.resellers TO authenticated;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS reseller_id uuid REFERENCES public.resellers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sales_reseller_id
  ON public.sales (reseller_id, created_at DESC)
  WHERE reseller_id IS NOT NULL;
