-- Drop existing problematic policies
DROP POLICY IF EXISTS "Store owners can manage access" ON public.store_access;
DROP POLICY IF EXISTS "Users can view their access" ON public.store_access;
DROP POLICY IF EXISTS "Users can view accessible stores" ON public.stores;
DROP POLICY IF EXISTS "Users can view accessible expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users can view accessible inventory" ON public.inventory;
DROP POLICY IF EXISTS "Users can view accessible sales" ON public.sales;
DROP POLICY IF EXISTS "Users can view accessible stock loans" ON public.stock_loans;

-- Create security definer function to check store ownership
CREATE OR REPLACE FUNCTION public.is_store_owner(_store_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.stores
    WHERE id = _store_id
      AND user_id = _user_id
  )
$$;

-- Create security definer function to check store access
CREATE OR REPLACE FUNCTION public.has_store_access(_store_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.store_access
    WHERE store_id = _store_id
      AND user_id = _user_id
  )
$$;

-- Recreate store_access policies using security definer functions
CREATE POLICY "Store owners can manage access"
ON public.store_access
FOR ALL
USING (public.is_store_owner(store_id, auth.uid()));

CREATE POLICY "Users can view their access"
ON public.store_access
FOR SELECT
USING (auth.uid() = user_id);

-- Recreate stores policy
CREATE POLICY "Users can view accessible stores"
ON public.stores
FOR SELECT
USING (
  auth.uid() = user_id 
  OR public.has_store_access(id, auth.uid())
);

-- Recreate expenses policy
CREATE POLICY "Users can view accessible expenses"
ON public.expenses
FOR SELECT
USING (
  auth.uid() = user_id 
  OR public.has_store_access(store_id, auth.uid())
);

-- Recreate inventory policy
CREATE POLICY "Users can view accessible inventory"
ON public.inventory
FOR SELECT
USING (
  auth.uid() = user_id 
  OR public.has_store_access(store_id, auth.uid())
);

-- Recreate sales policy
CREATE POLICY "Users can view accessible sales"
ON public.sales
FOR SELECT
USING (
  auth.uid() = user_id 
  OR public.has_store_access(store_id, auth.uid())
);

-- Recreate stock_loans policy
CREATE POLICY "Users can view accessible stock loans"
ON public.stock_loans
FOR SELECT
USING (
  auth.uid() = user_id 
  OR public.has_store_access(store_id, auth.uid())
);