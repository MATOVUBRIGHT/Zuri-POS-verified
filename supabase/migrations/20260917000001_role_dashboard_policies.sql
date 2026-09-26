-- Kept separate from the enum migration because PostgreSQL only exposes a new
-- enum value after that transaction commits.
CREATE OR REPLACE FUNCTION public.is_master_developer(check_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(check_user_id, 'master_developer'::public.app_role)
$$;

CREATE OR REPLACE FUNCTION public.can_manage_role_dashboard(check_user_id uuid, check_store_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_master_developer(check_user_id)
      OR EXISTS (SELECT 1 FROM public.stores WHERE id = check_store_id AND user_id = check_user_id)
$$;

DROP POLICY IF EXISTS "Role dashboard managers manage store access" ON public.store_access;
CREATE POLICY "Role dashboard managers manage store access" ON public.store_access FOR ALL TO authenticated
  USING (public.can_manage_role_dashboard(auth.uid(), store_id)) WITH CHECK (public.can_manage_role_dashboard(auth.uid(), store_id));

DROP POLICY IF EXISTS "Master developers view platform stores" ON public.stores;
CREATE POLICY "Master developers view platform stores" ON public.stores FOR SELECT TO authenticated USING (public.is_master_developer(auth.uid()));

-- These policies support the platform's aggregate reporting view. They do not
-- grant write access and are intentionally limited to the master role.
DROP POLICY IF EXISTS "Master developers view platform sales" ON public.sales;
CREATE POLICY "Master developers view platform sales" ON public.sales FOR SELECT TO authenticated USING (public.is_master_developer(auth.uid()));

DROP POLICY IF EXISTS "Master developers view platform expenses" ON public.expenses;
CREATE POLICY "Master developers view platform expenses" ON public.expenses FOR SELECT TO authenticated USING (public.is_master_developer(auth.uid()));

DROP POLICY IF EXISTS "Master developers manage global roles" ON public.user_roles;
CREATE POLICY "Master developers manage global roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.is_master_developer(auth.uid())) WITH CHECK (public.is_master_developer(auth.uid()));

GRANT EXECUTE ON FUNCTION public.is_master_developer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_role_dashboard(uuid, uuid) TO authenticated;
