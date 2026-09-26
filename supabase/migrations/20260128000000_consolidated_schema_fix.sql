-- Consolidated Schema Fix for Missing Tables and Columns
-- Generated: 2026-01-28

-- 1. Ensure 'customers' table exists
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    address TEXT,
    loyalty_points INTEGER DEFAULT 0,
    total_spent NUMERIC(12,2) DEFAULT 0,
    notes TEXT,
    marketing_consent BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Ensure 'staff' table exists
CREATE TABLE IF NOT EXISTS public.staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    employee_id TEXT,
    pin_code TEXT,
    role TEXT DEFAULT 'cashier', -- 'cashier', 'manager', 'admin'
    hourly_rate NUMERIC(10,2) DEFAULT 0,
    status TEXT DEFAULT 'active', -- 'active', 'inactive'
    contact_number TEXT,
    email TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(store_id, employee_id)
);

-- 3. Ensure 'inventory' has 'size' column
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory' AND column_name = 'size') THEN
        ALTER TABLE public.inventory ADD COLUMN size TEXT;
    END IF;
END $$;

-- 4. Ensure 'sales' has 'customer_id' and 'staff_id'
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'customer_id') THEN
        ALTER TABLE public.sales ADD COLUMN customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'staff_id') THEN
        ALTER TABLE public.sales ADD COLUMN staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 5. Enable Row Level Security
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

-- 6. Re-apply Policies (Idempotent)
-- Customers Policies
DROP POLICY IF EXISTS "Users can view customers for their stores" ON public.customers;
CREATE POLICY "Users can view customers for their stores" ON public.customers
    FOR SELECT USING (
        store_id IN (
            SELECT id FROM public.stores WHERE user_id = auth.uid()
            UNION
            SELECT store_id FROM public.store_access WHERE user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can manage customers for their stores" ON public.customers;
CREATE POLICY "Users can manage customers for their stores" ON public.customers
    FOR ALL USING (
        store_id IN (
            SELECT id FROM public.stores WHERE user_id = auth.uid()
            UNION
            SELECT store_id FROM public.store_access WHERE user_id = auth.uid()
        )
    );

-- Staff Policies
DROP POLICY IF EXISTS "Users can view staff for their stores" ON public.staff;
CREATE POLICY "Users can view staff for their stores" ON public.staff
    FOR SELECT USING (
        store_id IN (
            SELECT id FROM public.stores WHERE user_id = auth.uid()
            UNION
            SELECT store_id FROM public.store_access WHERE user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can manage staff for their stores" ON public.staff;
CREATE POLICY "Users can manage staff for their stores" ON public.staff
    FOR ALL USING (
        store_id IN (
            SELECT id FROM public.stores WHERE user_id = auth.uid()
        )
    );

-- 7. Realtime subscriptions
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'customers') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.customers;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'staff') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.staff;
    END IF;
END $$;
