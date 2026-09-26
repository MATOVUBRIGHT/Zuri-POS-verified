-- Executive, accountant and platform access for role-specific dashboards.
-- All checks are server-side; the UI is only a convenience layer.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'boss';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'master_developer';

-- Keep accountant branch scope in the existing store_access mapping.  The role
-- is deliberately a text value for backwards compatibility with deployed data.
ALTER TABLE public.store_access
  DROP CONSTRAINT IF EXISTS store_access_role_check;
ALTER TABLE public.store_access
  ADD CONSTRAINT store_access_role_check
  CHECK (role IN ('owner', 'manager', 'user', 'cashier', 'accountant', 'boss', 'admin', 'viewer'));
