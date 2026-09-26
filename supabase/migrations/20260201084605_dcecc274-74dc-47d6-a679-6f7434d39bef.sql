-- Add missing columns to inventory table
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS min_stock_level INTEGER DEFAULT 10;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS reorder_quantity INTEGER DEFAULT 20;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS packaging_type TEXT;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS unit_name TEXT;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS size TEXT;

-- Create product_variants table
CREATE TABLE IF NOT EXISTS public.product_variants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  inventory_id UUID NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  variant_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create customer_transactions table
CREATE TABLE IF NOT EXISTS public.customer_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  type TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  reference_id TEXT,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Helper to add missing columns to tables
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN SELECT unnest(ARRAY['product_variants', 'customer_transactions'])
    LOOP
        -- Add store_id if missing
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = 'store_id') THEN
            EXECUTE format('ALTER TABLE public.%I ADD COLUMN store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE', t);
        END IF;

        -- Add user_id if missing
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = 'user_id') THEN
            EXECUTE format('ALTER TABLE public.%I ADD COLUMN user_id UUID REFERENCES auth.users(id)', t);
            -- Try to populate user_id from stores if possible
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = 'store_id') THEN
                EXECUTE format('UPDATE public.%I t SET user_id = s.user_id FROM public.stores s WHERE t.store_id = s.id AND t.user_id IS NULL', t);
            END IF;
        END IF;

        -- Ensure NOT NULL constraints (only if we can guarantee values exist or if it's acceptable to fail here)
        -- For now, let's just make sure they exist for the policies.
    END LOOP;
END $$;

-- Enable RLS
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for product_variants
DROP POLICY IF EXISTS "Users can view product variants" ON public.product_variants;
CREATE POLICY "Users can view product variants" ON public.product_variants FOR SELECT
  USING (auth.uid() = user_id OR has_store_access(store_id, auth.uid()));

DROP POLICY IF EXISTS "Users can create product variants" ON public.product_variants;
CREATE POLICY "Users can create product variants" ON public.product_variants FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their product variants" ON public.product_variants;
CREATE POLICY "Users can update their product variants" ON public.product_variants FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their product variants" ON public.product_variants;
CREATE POLICY "Users can delete their product variants" ON public.product_variants FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for customer_transactions
DROP POLICY IF EXISTS "Users can view customer transactions" ON public.customer_transactions;
CREATE POLICY "Users can view customer transactions" ON public.customer_transactions FOR SELECT
  USING (auth.uid() = user_id OR has_store_access(store_id, auth.uid()));

DROP POLICY IF EXISTS "Users can create customer transactions" ON public.customer_transactions;
CREATE POLICY "Users can create customer transactions" ON public.customer_transactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their customer transactions" ON public.customer_transactions;
CREATE POLICY "Users can update their customer transactions" ON public.customer_transactions FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their customer transactions" ON public.customer_transactions;
CREATE POLICY "Users can delete their customer transactions" ON public.customer_transactions FOR DELETE
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_product_variants_inventory_id ON public.product_variants(inventory_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_store_id ON public.product_variants(store_id);
CREATE INDEX IF NOT EXISTS idx_customer_transactions_customer_id ON public.customer_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_transactions_store_id ON public.customer_transactions(store_id);