-- Final Schema Fix for Missing Tables and Columns
-- This migration ensures all required tables and columns exist

-- 1. Ensure 'customers' table exists with complete structure
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

-- 2. Ensure 'staff' table exists with complete structure
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

-- 4. Ensure 'sales' has 'customer_id' and 'staff_id' columns
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'customer_id') THEN
        ALTER TABLE public.sales ADD COLUMN customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'staff_id') THEN
        ALTER TABLE public.sales ADD COLUMN staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 5. Enable Row Level Security on new tables
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

-- 6. Create policies for customers (if they don't exist)
DO $$
BEGIN
    -- Drop existing policies if they exist
    DROP POLICY IF EXISTS "Users can view customers for their stores" ON public.customers;
    DROP POLICY IF EXISTS "Users can manage customers for their stores" ON public.customers;
    
    -- Create new policies
    CREATE POLICY "Users can view customers for their stores" ON public.customers
        FOR SELECT USING (
            store_id IN (
                SELECT id FROM public.stores WHERE user_id = auth.uid()
                UNION
                SELECT store_id FROM public.store_access WHERE user_id = auth.uid()
            )
        );

    CREATE POLICY "Users can manage customers for their stores" ON public.customers
        FOR ALL USING (
            store_id IN (
                SELECT id FROM public.stores WHERE user_id = auth.uid()
                UNION
                SELECT store_id FROM public.store_access WHERE user_id = auth.uid()
            )
        );
END $$;

-- 7. Create policies for staff (if they don't exist)
DO $$
BEGIN
    -- Drop existing policies if they exist
    DROP POLICY IF EXISTS "Users can view staff for their stores" ON public.staff;
    DROP POLICY IF EXISTS "Users can manage staff for their stores" ON public.staff;
    
    -- Create new policies
    CREATE POLICY "Users can view staff for their stores" ON public.staff
        FOR SELECT USING (
            store_id IN (
                SELECT id FROM public.stores WHERE user_id = auth.uid()
                UNION
                SELECT store_id FROM public.store_access WHERE user_id = auth.uid()
            )
        );

    CREATE POLICY "Users can manage staff for their stores" ON public.staff
        FOR ALL USING (
            store_id IN (
                SELECT id FROM public.stores WHERE user_id = auth.uid()
            )
        );
END $$;

-- 8. Ensure updated_at trigger exists for customers and staff
DO $$
BEGIN
    -- Create trigger for customers updated_at if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.triggers WHERE trigger_name = 'update_customers_updated_at') THEN
        CREATE TRIGGER update_customers_updated_at
            BEFORE UPDATE ON public.customers
            FOR EACH ROW
            EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
    
    -- Create trigger for staff updated_at if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.triggers WHERE trigger_name = 'update_staff_updated_at') THEN
        CREATE TRIGGER update_staff_updated_at
            BEFORE UPDATE ON public.staff
            FOR EACH ROW
            EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
END $$;

-- 9. Add indexes for performance
DO $$
BEGIN
    -- Add indexes if they don't exist
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_customers_store_id') THEN
        CREATE INDEX idx_customers_store_id ON public.customers(store_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_customers_phone') THEN
        CREATE INDEX idx_customers_phone ON public.customers(phone);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_staff_store_id') THEN
        CREATE INDEX idx_staff_store_id ON public.staff(store_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_staff_employee_id') THEN
        CREATE INDEX idx_staff_employee_id ON public.staff(store_id, employee_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_sales_customer_id') THEN
        CREATE INDEX idx_sales_customer_id ON public.sales(customer_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_sales_staff_id') THEN
        CREATE INDEX idx_sales_staff_id ON public.sales(staff_id);
    END IF;
END $$;

-- 10. Ensure realtime subscriptions
DO $$
BEGIN
    -- Add customers to realtime publication if not already added
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'customers') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.customers;
    END IF;
    
    -- Add staff to realtime publication if not already added
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'staff') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.staff;
    END IF;
END $$;