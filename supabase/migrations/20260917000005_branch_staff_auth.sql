-- Branch staff authentication and executive access management.
-- Passwords are owned exclusively by Supabase Auth, never by public.staff.
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS login_username text,
  ADD COLUMN IF NOT EXISTS auth_email text;

CREATE UNIQUE INDEX IF NOT EXISTS staff_store_login_username_unique
  ON public.staff (store_id, lower(login_username))
  WHERE login_username IS NOT NULL;

CREATE INDEX IF NOT EXISTS staff_user_id_store_id_idx ON public.staff (user_id, store_id);

-- A staff member can read their own assignment. Existing owner/access RLS policies
-- remain responsible for managers and executives.
DROP POLICY IF EXISTS "Staff can view their own branch assignment" ON public.staff;
CREATE POLICY "Staff can view their own branch assignment"
  ON public.staff FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Branch users must never create their own access records. The provisioning Edge
-- Function runs with service-role credentials after validating store ownership.

-- The executive access migration may already have installed a role check. Keep
-- the branch-administrator role accepted by that shared assignment table.
ALTER TABLE public.store_access
  DROP CONSTRAINT IF EXISTS store_access_role_check;
ALTER TABLE public.store_access
  ADD CONSTRAINT store_access_role_check
  CHECK (role IN ('owner', 'manager', 'user', 'cashier', 'accountant', 'boss', 'admin', 'viewer'));
