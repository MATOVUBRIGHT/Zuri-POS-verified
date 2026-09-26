-- Create missing customers table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    phone_number TEXT,
    email TEXT,
    address TEXT,
    total_spent DECIMAL(12,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Associate customers with sales if column doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'customer_id') THEN
        ALTER TABLE public.sales ADD COLUMN customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Create missing staff table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    employee_id TEXT,
    role TEXT DEFAULT 'cashier', -- 'cashier', 'manager', 'admin'
    pin_code TEXT,
    hourly_rate DECIMAL(10,2) DEFAULT 0,
    status TEXT DEFAULT 'active', -- 'active', 'inactive'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add size column to inventory if it doesn't exist (User called it stock, referencing inventory table)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory' AND column_name = 'size') THEN
        ALTER TABLE public.inventory ADD COLUMN size TEXT;
    END IF;
END $$;

-- Enable RLS on new tables
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

-- Add basic policies for customers (assuming authenticated users can access own store's data)
DROP POLICY IF EXISTS "Users can view customers for their stores" ON public.customers;
CREATE POLICY "Users can view customers for their stores" ON public.customers
    FOR SELECT USING (
        store_id IN (
            SELECT id FROM public.stores WHERE user_id = auth.uid()
            UNION
            SELECT store_id FROM public.store_access WHERE user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can insert customers for their stores" ON public.customers;
CREATE POLICY "Users can insert customers for their stores" ON public.customers
    FOR INSERT WITH CHECK (
        store_id IN (
            SELECT id FROM public.stores WHERE user_id = auth.uid()
            UNION
            SELECT store_id FROM public.store_access WHERE user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can update customers for their stores" ON public.customers;
CREATE POLICY "Users can update customers for their stores" ON public.customers
    FOR UPDATE USING (
        store_id IN (
            SELECT id FROM public.stores WHERE user_id = auth.uid()
            UNION
            SELECT store_id FROM public.store_access WHERE user_id = auth.uid()
        )
    );

-- Add basic policies for staff
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
