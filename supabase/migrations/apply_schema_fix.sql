-- Direct SQL to apply to your Supabase database
-- Copy and paste this entire block into your Supabase SQL Editor and execute

-- 0. Create data schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS data;

-- 1. Create customers table if it doesn't exist
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

-- 1b. Create customer table (singular) if it doesn't exist
CREATE TABLE IF NOT EXISTS public.customer (
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

-- 2. Create staff table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    employee_id TEXT,
    pin_code TEXT,
    role TEXT DEFAULT 'cashier',
    hourly_rate NUMERIC(10,2) DEFAULT 0,
    status TEXT DEFAULT 'active',
    contact_number TEXT,
    email TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(store_id, employee_id)
);

-- 2b. Create staff table in data schema if it doesn't exist
CREATE TABLE IF NOT EXISTS data.staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    employee_id TEXT,
    pin_code TEXT,
    role TEXT DEFAULT 'cashier',
    hourly_rate NUMERIC(10,2) DEFAULT 0,
    status TEXT DEFAULT 'active',
    contact_number TEXT,
    email TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(store_id, employee_id)
);

-- 3. Add size and in_stock columns to inventory table if they don't exist
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS size TEXT;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS in_stock INTEGER DEFAULT 0;

-- 4. Add customer_id column to sales table if it doesn't exist
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL;

-- 5. Add staff_id column to sales table if it doesn't exist
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL;

-- 6. Enable Row Level Security on new tables
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE data.staff ENABLE ROW LEVEL SECURITY;

-- 7. Create policies for customers
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

DROP POLICY IF EXISTS "Users can view customer for their stores" ON public.customer;
CREATE POLICY "Users can view customer for their stores" ON public.customer
    FOR SELECT USING (
        store_id IN (
            SELECT id FROM public.stores WHERE user_id = auth.uid()
            UNION
            SELECT store_id FROM public.store_access WHERE user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can manage customer for their stores" ON public.customer;
CREATE POLICY "Users can manage customer for their stores" ON public.customer
    FOR ALL USING (
        store_id IN (
            SELECT id FROM public.stores WHERE user_id = auth.uid()
            UNION
            SELECT store_id FROM public.store_access WHERE user_id = auth.uid()
        )
    );

-- 8. Create policies for staff
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

DROP POLICY IF EXISTS "Users can view staff for their stores" ON data.staff;
CREATE POLICY "Users can view staff for their stores" ON data.staff
    FOR SELECT USING (
        store_id IN (
            SELECT id FROM public.stores WHERE user_id = auth.uid()
            UNION
            SELECT store_id FROM public.store_access WHERE user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can manage staff for their stores" ON data.staff;
CREATE POLICY "Users can manage staff for their stores" ON data.staff
    FOR ALL USING (
        store_id IN (
            SELECT id FROM public.stores WHERE user_id = auth.uid()
        )
    );

-- 9. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_customers_store_id ON public.customers(store_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone);
CREATE INDEX IF NOT EXISTS idx_customer_store_id ON public.customer(store_id);
CREATE INDEX IF NOT EXISTS idx_customer_phone ON public.customer(phone);
CREATE INDEX IF NOT EXISTS idx_staff_store_id ON public.staff(store_id);
CREATE INDEX IF NOT EXISTS idx_staff_employee_id ON public.staff(store_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_data_staff_store_id ON data.staff(store_id);
CREATE INDEX IF NOT EXISTS idx_data_staff_employee_id ON data.staff(store_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_sales_customer_id ON public.sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_staff_id ON public.sales(staff_id);

-- 10. Add realtime subscriptions
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS public.customers;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS public.customer;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS public.staff;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS data.staff;

-- 11. Add updated_at triggers
CREATE TRIGGER IF NOT EXISTS update_customers_updated_at
    BEFORE UPDATE ON public.customers
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER IF NOT EXISTS update_customer_updated_at
    BEFORE UPDATE ON public.customer
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER IF NOT EXISTS update_staff_updated_at
    BEFORE UPDATE ON public.staff
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER IF NOT EXISTS update_data_staff_updated_at
    BEFORE UPDATE ON data.staff
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Success message
SELECT 'Schema fix applied successfully! All missing tables and columns have been added.' as message;