-- Create customers table
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  loyalty_points INTEGER NOT NULL DEFAULT 0,
  total_spent NUMERIC NOT NULL DEFAULT 0,
  unpaid_balance NUMERIC NOT NULL DEFAULT 0,
  credit_limit NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create staff table
CREATE TABLE IF NOT EXISTS public.staff (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  full_name TEXT NOT NULL,
  employee_id TEXT,
  pin_code TEXT,
  role TEXT NOT NULL DEFAULT 'cashier',
  status TEXT NOT NULL DEFAULT 'active',
  hourly_rate NUMERIC DEFAULT 0,
  total_sales NUMERIC DEFAULT 0,
  sales_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create shifts table
CREATE TABLE IF NOT EXISTS public.shifts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  end_time TIMESTAMP WITH TIME ZONE,
  starting_cash NUMERIC NOT NULL DEFAULT 0,
  ending_cash_actual NUMERIC,
  ending_cash_expected NUMERIC,
  status TEXT NOT NULL DEFAULT 'open',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create categories table
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create sizes table
CREATE TABLE IF NOT EXISTS public.sizes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create tax_configurations table
CREATE TABLE IF NOT EXISTS public.tax_configurations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  rate NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create payment_methods table
CREATE TABLE IF NOT EXISTS public.payment_methods (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create audit_logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id TEXT,
  old_data JSONB,
  new_data JSONB,
  staff_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper to add user_id to tables if missing
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN SELECT unnest(ARRAY['customers', 'staff', 'shifts', 'categories', 'sizes', 'tax_configurations', 'payment_methods', 'audit_logs'])
    LOOP
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = 'user_id') THEN
            EXECUTE format('ALTER TABLE public.%I ADD COLUMN user_id UUID REFERENCES auth.users(id)', t);
            -- Try to populate user_id from stores if possible
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = 'store_id') THEN
                EXECUTE format('UPDATE public.%I t SET user_id = s.user_id FROM public.stores s WHERE t.store_id = s.id AND t.user_id IS NULL', t);
            END IF;
        END IF;
    END LOOP;
END $$;

-- RLS Policies for customers
DROP POLICY IF EXISTS "Users can view store customers" ON public.customers;
CREATE POLICY "Users can view store customers" ON public.customers FOR SELECT
  USING (auth.uid() = user_id OR has_store_access(store_id, auth.uid()));
DROP POLICY IF EXISTS "Users can create customers" ON public.customers;
CREATE POLICY "Users can create customers" ON public.customers FOR INSERT
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their customers" ON public.customers;
CREATE POLICY "Users can update their customers" ON public.customers FOR UPDATE
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete their customers" ON public.customers;
CREATE POLICY "Users can delete their customers" ON public.customers FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for staff
DROP POLICY IF EXISTS "Users can view store staff" ON public.staff;
CREATE POLICY "Users can view store staff" ON public.staff FOR SELECT
  USING (auth.uid() = user_id OR has_store_access(store_id, auth.uid()));
DROP POLICY IF EXISTS "Users can create staff" ON public.staff;
CREATE POLICY "Users can create staff" ON public.staff FOR INSERT
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their staff" ON public.staff;
CREATE POLICY "Users can update their staff" ON public.staff FOR UPDATE
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete their staff" ON public.staff;
CREATE POLICY "Users can delete their staff" ON public.staff FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for shifts
DROP POLICY IF EXISTS "Users can view store shifts" ON public.shifts;
CREATE POLICY "Users can view store shifts" ON public.shifts FOR SELECT
  USING (auth.uid() = user_id OR has_store_access(store_id, auth.uid()));
DROP POLICY IF EXISTS "Users can create shifts" ON public.shifts;
CREATE POLICY "Users can create shifts" ON public.shifts FOR INSERT
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their shifts" ON public.shifts;
CREATE POLICY "Users can update their shifts" ON public.shifts FOR UPDATE
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete their shifts" ON public.shifts;
CREATE POLICY "Users can delete their shifts" ON public.shifts FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for categories
DROP POLICY IF EXISTS "Users can view store categories" ON public.categories;
CREATE POLICY "Users can view store categories" ON public.categories FOR SELECT
  USING (auth.uid() = user_id OR has_store_access(store_id, auth.uid()));
DROP POLICY IF EXISTS "Users can create categories" ON public.categories;
CREATE POLICY "Users can create categories" ON public.categories FOR INSERT
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their categories" ON public.categories;
CREATE POLICY "Users can update their categories" ON public.categories FOR UPDATE
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete their categories" ON public.categories;
CREATE POLICY "Users can delete their categories" ON public.categories FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for sizes
DROP POLICY IF EXISTS "Users can view store sizes" ON public.sizes;
CREATE POLICY "Users can view store sizes" ON public.sizes FOR SELECT
  USING (auth.uid() = user_id OR has_store_access(store_id, auth.uid()));
DROP POLICY IF EXISTS "Users can create sizes" ON public.sizes;
CREATE POLICY "Users can create sizes" ON public.sizes FOR INSERT
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their sizes" ON public.sizes;
CREATE POLICY "Users can update their sizes" ON public.sizes FOR UPDATE
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete their sizes" ON public.sizes;
CREATE POLICY "Users can delete their sizes" ON public.sizes FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for tax_configurations
DROP POLICY IF EXISTS "Users can view store taxes" ON public.tax_configurations;
CREATE POLICY "Users can view store taxes" ON public.tax_configurations FOR SELECT
  USING (auth.uid() = user_id OR has_store_access(store_id, auth.uid()));
DROP POLICY IF EXISTS "Users can create taxes" ON public.tax_configurations;
CREATE POLICY "Users can create taxes" ON public.tax_configurations FOR INSERT
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their taxes" ON public.tax_configurations;
CREATE POLICY "Users can update their taxes" ON public.tax_configurations FOR UPDATE
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete their taxes" ON public.tax_configurations;
CREATE POLICY "Users can delete their taxes" ON public.tax_configurations FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for payment_methods
DROP POLICY IF EXISTS "Users can view store payment methods" ON public.payment_methods;
CREATE POLICY "Users can view store payment methods" ON public.payment_methods FOR SELECT
  USING (auth.uid() = user_id OR has_store_access(store_id, auth.uid()));
DROP POLICY IF EXISTS "Users can create payment methods" ON public.payment_methods;
CREATE POLICY "Users can create payment methods" ON public.payment_methods FOR INSERT
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their payment methods" ON public.payment_methods;
CREATE POLICY "Users can update their payment methods" ON public.payment_methods FOR UPDATE
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete their payment methods" ON public.payment_methods;
CREATE POLICY "Users can delete their payment methods" ON public.payment_methods FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for audit_logs
DROP POLICY IF EXISTS "Users can view store audit logs" ON public.audit_logs;
CREATE POLICY "Users can view store audit logs" ON public.audit_logs FOR SELECT
  USING (auth.uid() = user_id OR has_store_access(store_id, auth.uid()));
DROP POLICY IF EXISTS "Users can create audit logs" ON public.audit_logs;
CREATE POLICY "Users can create audit logs" ON public.audit_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Add realtime for new tables
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.customers; EXCEPTION WHEN others THEN END;
        BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.staff; EXCEPTION WHEN others THEN END;
        BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.shifts; EXCEPTION WHEN others THEN END;
        BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.categories; EXCEPTION WHEN others THEN END;
        BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.sizes; EXCEPTION WHEN others THEN END;
    END IF;
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_customers_store_id ON public.customers(store_id);
CREATE INDEX IF NOT EXISTS idx_customers_user_id ON public.customers(user_id);
CREATE INDEX IF NOT EXISTS idx_staff_store_id ON public.staff(store_id);
CREATE INDEX IF NOT EXISTS idx_staff_user_id ON public.staff(user_id);
CREATE INDEX IF NOT EXISTS idx_shifts_store_id ON public.shifts(store_id);
CREATE INDEX IF NOT EXISTS idx_shifts_user_id ON public.shifts(user_id);
CREATE INDEX IF NOT EXISTS idx_shifts_status ON public.shifts(status);
CREATE INDEX IF NOT EXISTS idx_categories_store_id ON public.categories(store_id);
CREATE INDEX IF NOT EXISTS idx_sizes_store_id ON public.sizes(store_id);
CREATE INDEX IF NOT EXISTS idx_tax_configurations_store_id ON public.tax_configurations(store_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_store_id ON public.payment_methods(store_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_store_id ON public.audit_logs(store_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

-- Add updated_at trigger for customers
DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_customers_updated_at') THEN
  CREATE TRIGGER update_customers_updated_at
    BEFORE UPDATE ON public.customers
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
END IF; END $$;

-- Add updated_at trigger for staff
DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_staff_updated_at') THEN
  CREATE TRIGGER update_staff_updated_at
    BEFORE UPDATE ON public.staff
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
END IF; END $$;