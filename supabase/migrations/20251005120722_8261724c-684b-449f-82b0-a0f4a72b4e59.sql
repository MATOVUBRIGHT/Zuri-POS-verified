-- Create store_access table to manage who can access which stores
CREATE TABLE public.store_access (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  granted_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(store_id, user_id)
);

-- Enable RLS
ALTER TABLE public.store_access ENABLE ROW LEVEL SECURITY;

-- Owners can manage access to their stores
CREATE POLICY "Store owners can manage access"
ON public.store_access
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.stores
    WHERE stores.id = store_access.store_id
    AND stores.user_id = auth.uid()
  )
);

-- Users can view their own access grants
CREATE POLICY "Users can view their access"
ON public.store_access
FOR SELECT
USING (auth.uid() = user_id);

-- Update stores RLS to allow access based on store_access table
DROP POLICY IF EXISTS "Users can view their own stores" ON public.stores;
CREATE POLICY "Users can view accessible stores"
ON public.stores
FOR SELECT
USING (
  auth.uid() = user_id 
  OR EXISTS (
    SELECT 1 FROM public.store_access
    WHERE store_access.store_id = stores.id
    AND store_access.user_id = auth.uid()
  )
);

-- Update sales RLS policies
DROP POLICY IF EXISTS "Users can view their own sales" ON public.sales;
CREATE POLICY "Users can view accessible sales"
ON public.sales
FOR SELECT
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.store_access
    WHERE store_access.store_id = sales.store_id
    AND store_access.user_id = auth.uid()
  )
);

-- Update inventory RLS policies
DROP POLICY IF EXISTS "Users can view their own inventory" ON public.inventory;
CREATE POLICY "Users can view accessible inventory"
ON public.inventory
FOR SELECT
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.store_access
    WHERE store_access.store_id = inventory.store_id
    AND store_access.user_id = auth.uid()
  )
);

-- Update expenses RLS policies
DROP POLICY IF EXISTS "Users can view their own expenses" ON public.expenses;
CREATE POLICY "Users can view accessible expenses"
ON public.expenses
FOR SELECT
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.store_access
    WHERE store_access.store_id = expenses.store_id
    AND store_access.user_id = auth.uid()
  )
);

-- Update stock_loans RLS policies
DROP POLICY IF EXISTS "Users can view their own stock loans" ON public.stock_loans;
CREATE POLICY "Users can view accessible stock loans"
ON public.stock_loans
FOR SELECT
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.store_access
    WHERE store_access.store_id = stock_loans.store_id
    AND store_access.user_id = auth.uid()
  )
);