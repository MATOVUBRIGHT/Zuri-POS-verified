-- Security hardening for deployed databases.
-- Keep branch staff administration limited to owners and management roles.

CREATE OR REPLACE FUNCTION public.can_manage_store(_store_id uuid, _user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.stores
    WHERE id = _store_id AND user_id = _user_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.store_access
    WHERE store_id = _store_id
      AND user_id = _user_id
      AND lower(coalesce(role, '')) IN ('boss', 'admin', 'manager')
  );
$$;

REVOKE ALL ON FUNCTION public.can_manage_store(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_store(uuid, uuid) TO authenticated;

-- Older migrations created several overlapping staff policies. PostgreSQL ORs
-- permissive policies, so remove the broad variants before adding one policy.
DROP POLICY IF EXISTS "Store owners can manage their staff" ON public.staff;
DROP POLICY IF EXISTS "Store owners and managers can manage staff" ON public.staff;
DROP POLICY IF EXISTS "Users can manage staff for their stores" ON public.staff;
DROP POLICY IF EXISTS "Users can manage staff" ON public.staff;

CREATE POLICY "Owners and managers can manage branch staff"
  ON public.staff FOR ALL TO authenticated
  USING (public.can_manage_store(store_id, auth.uid()))
  WITH CHECK (public.can_manage_store(store_id, auth.uid()));

-- SECURITY DEFINER audit triggers must not resolve objects through a caller's
-- search_path.
ALTER FUNCTION public.log_action() SET search_path = public;

