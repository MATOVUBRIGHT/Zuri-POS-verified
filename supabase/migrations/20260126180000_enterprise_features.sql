-- Enterprise POS Features Schema Extension

-- 1. Categories Table (Formalized)
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT, -- For UI display
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    UNIQUE(store_id, name)
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own categories" ON public.categories
    FOR ALL USING (auth.uid() IN (SELECT user_id FROM public.stores WHERE id = store_id));

-- 2. Customers Table (Full CRM)
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

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own customers" ON public.customers
    FOR ALL USING (auth.uid() IN (SELECT user_id FROM public.stores WHERE id = store_id));

-- 3. Product Definitions (Decoupled from Inventory)
CREATE TABLE IF NOT EXISTS public.product_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    sku TEXT,
    barcode TEXT,
    description TEXT,
    image_url TEXT,
    is_service BOOLEAN DEFAULT false, -- For non-physical items like haircuts
    tax_rate NUMERIC DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    UNIQUE(store_id, sku),
    UNIQUE(store_id, barcode)
);

ALTER TABLE public.product_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own product definitions" ON public.product_definitions
    FOR ALL USING (auth.uid() IN (SELECT user_id FROM public.stores WHERE id = store_id));

-- 4. Orders Table (Lifecycle Management)
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    user_id UUID REFERENCES auth.users(id) NOT NULL, -- The staff member who took the order
    status TEXT NOT NULL DEFAULT 'pending', -- pending, paid, cancelled, refunded, partially_paid
    total_amount NUMERIC NOT NULL DEFAULT 0,
    tax_amount NUMERIC NOT NULL DEFAULT 0,
    discount_amount NUMERIC NOT NULL DEFAULT 0,
    payment_method TEXT, -- cash, card, mobile_money, split
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own orders" ON public.orders
    FOR ALL USING (auth.uid() IN (SELECT user_id FROM public.stores WHERE id = store_id));

-- 5. Order Items
CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.product_definitions(id) ON DELETE SET NULL,
    quantity NUMERIC NOT NULL,
    unit_price NUMERIC NOT NULL,
    total_price NUMERIC NOT NULL,
    discount_amount NUMERIC DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own order items" ON public.order_items
    FOR ALL USING (auth.uid() IN (SELECT o.user_id FROM public.orders o WHERE o.id = order_id));

-- 6. Shifts & Cash Management
CREATE TABLE IF NOT EXISTS public.shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE,
    starting_cash NUMERIC NOT NULL DEFAULT 0,
    ending_cash_actual NUMERIC,
    ending_cash_expected NUMERIC,
    status TEXT DEFAULT 'open', -- open, closed
    notes TEXT
);

ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own shifts" ON public.shifts
    FOR ALL USING (auth.uid() IN (SELECT user_id FROM public.stores WHERE id = store_id));

-- 7. Audit Logs (Security & Compliance)
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id),
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    old_data JSONB,
    new_data JSONB,
    ip_address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own audit logs" ON public.audit_logs
    FOR SELECT USING (auth.uid() IN (SELECT user_id FROM public.stores WHERE id = store_id));

-- 8. Add Foreign Keys to existing tables for better integration
ALTER TABLE public.inventory 
    ADD COLUMN IF NOT EXISTS product_definition_id UUID REFERENCES public.product_definitions(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER DEFAULT 5;

ALTER TABLE public.sales
    ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL;

-- 9. Realtime Enablement
ALTER PUBLICATION supabase_realtime ADD TABLE public.categories;
ALTER PUBLICATION supabase_realtime ADD TABLE public.customers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.product_definitions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.shifts;
