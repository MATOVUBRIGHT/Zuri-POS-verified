-- Migration to create staff, shifts, and customers tables in the 'data' schema
-- and ensure they are also in the 'public' schema for standard POS operations.

-- 0. Create data schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS data;

-- 1. Staff Table (data schema)
CREATE TABLE IF NOT EXISTS data.staff (
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

-- 2. Customers Table (data schema)
CREATE TABLE IF NOT EXISTS data.customers (
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

-- 3. Shifts Table (data schema)
CREATE TABLE IF NOT EXISTS data.shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    staff_id UUID REFERENCES data.staff(id) ON DELETE SET NULL,
    start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_time TIMESTAMPTZ,
    starting_cash NUMERIC(12,2) NOT NULL DEFAULT 0,
    ending_cash_expected NUMERIC(12,2),
    ending_cash_actual NUMERIC(12,2),
    status TEXT DEFAULT 'open', -- 'open', 'closed'
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Sync to public schema (as requested: "create public staff, shft, customer tables")
-- This ensures the standard POS logic (which often looks in public) still works.

-- Public Staff
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

-- Public Customers
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

-- Public Shifts
CREATE TABLE IF NOT EXISTS public.shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
    start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_time TIMESTAMPTZ,
    starting_cash NUMERIC(12,2) NOT NULL DEFAULT 0,
    ending_cash_expected NUMERIC(12,2),
    ending_cash_actual NUMERIC(12,2),
    status TEXT DEFAULT 'open',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Enable Row Level Security
ALTER TABLE data.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE data.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE data.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

-- 6. Create RLS Policies (Idempotent)
DO $$
DECLARE
    schema_name TEXT;
    table_name TEXT;
BEGIN
    FOR schema_name IN SELECT unnest(ARRAY['data', 'public'])
    LOOP
        FOR table_name IN SELECT unnest(ARRAY['staff', 'customers', 'shifts'])
        LOOP
            EXECUTE format('DROP POLICY IF EXISTS "Manage own %I" ON %I.%I', table_name, schema_name, table_name);
            EXECUTE format('CREATE POLICY "Manage own %I" ON %I.%I FOR ALL USING (auth.uid() IN (SELECT user_id FROM public.stores WHERE id = store_id))', table_name, schema_name, table_name);
        END LOOP;
    END LOOP;
END $$;

-- 7. Triggers for updated_at
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.triggers WHERE trigger_name = 'update_data_staff_updated_at') THEN
        CREATE TRIGGER update_data_staff_updated_at BEFORE UPDATE ON data.staff FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.triggers WHERE trigger_name = 'update_data_customers_updated_at') THEN
        CREATE TRIGGER update_data_customers_updated_at BEFORE UPDATE ON data.customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.triggers WHERE trigger_name = 'update_public_staff_updated_at') THEN
        CREATE TRIGGER update_public_staff_updated_at BEFORE UPDATE ON public.staff FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.triggers WHERE trigger_name = 'update_public_customers_updated_at') THEN
        CREATE TRIGGER update_public_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
END $$;

-- 8. Enable Realtime
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE data.staff;
        EXCEPTION WHEN others THEN END;
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE data.customers;
        EXCEPTION WHEN others THEN END;
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE data.shifts;
        EXCEPTION WHEN others THEN END;
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.staff;
        EXCEPTION WHEN others THEN END;
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.customers;
        EXCEPTION WHEN others THEN END;
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.shifts;
        EXCEPTION WHEN others THEN END;
    END IF;
END $$;
