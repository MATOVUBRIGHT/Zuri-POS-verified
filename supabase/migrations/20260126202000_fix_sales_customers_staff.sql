-- Fix Sales, Customers, and Staff Tables Schema Issues

-- 1. Ensure customers table exists with proper structure
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    address TEXT,
    loyalty_points INTEGER DEFAULT 0,
    total_spent NUMERIC DEFAULT 0,
    notes TEXT,
    marketing_consent BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Enable RLS for customers
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists and recreate
DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Users can manage their own customers" ON public.customers;
EXCEPTION
    WHEN undefined_object THEN NULL;
END $$;

CREATE POLICY "Users can manage their own customers" ON public.customers
    FOR ALL USING (
        auth.uid() IN (SELECT user_id FROM public.stores WHERE id = store_id)
        OR 
        auth.uid() IN (SELECT user_id FROM public.store_access WHERE store_id = customers.store_id)
    );

-- 2. Ensure staff table exists with proper structure
CREATE TABLE IF NOT EXISTS public.staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    employee_id TEXT NOT NULL,
    pin_code TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'cashier',
    hourly_rate NUMERIC DEFAULT 0,
    contact_number TEXT,
    email TEXT,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    UNIQUE(store_id, employee_id)
);

-- Enable RLS for staff
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists and recreate
DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Store owners and managers can manage staff" ON public.staff;
EXCEPTION
    WHEN undefined_object THEN NULL;
END $$;

CREATE POLICY "Store owners and managers can manage staff" ON public.staff
    FOR ALL USING (
        auth.uid() IN (SELECT user_id FROM public.stores WHERE id = store_id)
        OR 
        auth.uid() IN (SELECT user_id FROM public.store_access WHERE store_id = staff.store_id AND role IN ('admin', 'manager'))
    );

-- 3. Fix sales table - make customer_id optional (nullable)
DO $$ 
BEGIN
    -- Add customer_id column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sales' AND column_name = 'customer_id'
    ) THEN
        ALTER TABLE public.sales ADD COLUMN customer_id UUID;
    END IF;

    -- Make sure customer_id is nullable
    ALTER TABLE public.sales ALTER COLUMN customer_id DROP NOT NULL;

    -- Add foreign key constraint if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'sales_customer_id_fkey' AND table_name = 'sales'
    ) THEN
        ALTER TABLE public.sales ADD CONSTRAINT sales_customer_id_fkey 
            FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        -- Customer ID might already exist and be configured correctly
        NULL;
END $$;

-- 4. Fix sales table - make staff_id optional (nullable)
DO $$ 
BEGIN
    -- Add staff_id column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sales' AND column_name = 'staff_id'
    ) THEN
        ALTER TABLE public.sales ADD COLUMN staff_id UUID;
    END IF;

    -- Make sure staff_id is nullable
    ALTER TABLE public.sales ALTER COLUMN staff_id DROP NOT NULL;

    -- Add foreign key constraint if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'sales_staff_id_fkey' AND table_name = 'sales'
    ) THEN
        ALTER TABLE public.sales ADD CONSTRAINT sales_staff_id_fkey 
            FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE SET NULL;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        -- Staff ID might already exist and be configured correctly
        NULL;
END $$;

-- 5. Update shifts table to properly reference staff
DO $$ 
BEGIN
    -- Add staff_id column to shifts if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'shifts' AND column_name = 'staff_id'
    ) THEN
        ALTER TABLE public.shifts ADD COLUMN staff_id UUID;
    END IF;

    -- Make sure staff_id is nullable
    ALTER TABLE public.shifts ALTER COLUMN staff_id DROP NOT NULL;

    -- Add foreign key constraint if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'shifts_staff_id_fkey' AND table_name = 'shifts'
    ) THEN
        ALTER TABLE public.shifts ADD CONSTRAINT shifts_staff_id_fkey 
            FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE SET NULL;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        NULL;
END $$;

-- 6. Enable realtime for customers and staff
DO $$
BEGIN
    -- Add customers to realtime publication if not already added
    PERFORM pg_publication_tables.tablename 
    FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'customers';
    
    IF NOT FOUND THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.customers;
    END IF;
EXCEPTION
    WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
    -- Add staff to realtime publication if not already added
    PERFORM pg_publication_tables.tablename 
    FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'staff';
    
    IF NOT FOUND THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.staff;
    END IF;
EXCEPTION
    WHEN OTHERS THEN NULL;
END $$;

-- 7. Create helpful indexes for performance
CREATE INDEX IF NOT EXISTS idx_customers_store_id ON public.customers(store_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone);
CREATE INDEX IF NOT EXISTS idx_staff_store_id ON public.staff(store_id);
CREATE INDEX IF NOT EXISTS idx_staff_employee_id ON public.staff(store_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_sales_customer_id ON public.sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_staff_id ON public.sales(staff_id);
CREATE INDEX IF NOT EXISTS idx_shifts_staff_id ON public.shifts(staff_id);
