CREATE TABLE IF NOT EXISTS public.walkin_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  recorded_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  recorded_date date NOT NULL DEFAULT CURRENT_DATE,
  visitor_type text NOT NULL CHECK (visitor_type IN ('buyers', 'non_buyers')),
  expat_female integer NOT NULL DEFAULT 0 CHECK (expat_female >= 0),
  expat_male integer NOT NULL DEFAULT 0 CHECK (expat_male >= 0),
  local_female integer NOT NULL DEFAULT 0 CHECK (local_female >= 0),
  local_male integer NOT NULL DEFAULT 0 CHECK (local_male >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS walkin_counts_store_date_idx
  ON public.walkin_counts(store_id, recorded_date DESC);

ALTER TABLE public.walkin_counts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS walkin_counts_read_scoped ON public.walkin_counts;
CREATE POLICY walkin_counts_read_scoped ON public.walkin_counts FOR SELECT
  USING (public.is_store_owner(store_id, auth.uid()) OR public.has_store_access(store_id, auth.uid()));

DROP POLICY IF EXISTS walkin_counts_insert_scoped ON public.walkin_counts;
CREATE POLICY walkin_counts_insert_scoped ON public.walkin_counts FOR INSERT
  WITH CHECK (public.is_store_owner(store_id, auth.uid()) OR EXISTS (
    SELECT 1 FROM public.store_access
    WHERE store_access.store_id = walkin_counts.store_id
      AND store_access.user_id = auth.uid()
      AND store_access.role IN ('owner', 'admin', 'manager', 'cashier')
  ));

DROP POLICY IF EXISTS walkin_counts_update_scoped ON public.walkin_counts;
CREATE POLICY walkin_counts_update_scoped ON public.walkin_counts FOR UPDATE
  USING (public.is_store_owner(store_id, auth.uid()) OR public.has_store_access(store_id, auth.uid()))
  WITH CHECK (public.is_store_owner(store_id, auth.uid()) OR public.has_store_access(store_id, auth.uid()));
