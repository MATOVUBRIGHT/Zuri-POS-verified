-- 1. Audit Logs Table
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    staff_name TEXT,
    action TEXT NOT NULL,
    table_name TEXT,
    record_id UUID,
    old_data JSONB,
    new_data JSONB,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Tax Configurations Table
CREATE TABLE IF NOT EXISTS public.tax_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    rate DECIMAL(5,2) NOT NULL, -- e.g. 18.00
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Payment Methods Table
CREATE TABLE IF NOT EXISTS public.payment_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL, -- Cash, Card, Mobile Money, etc.
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Update Sales Table
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'status') THEN
        ALTER TABLE public.sales ADD COLUMN status TEXT DEFAULT 'completed';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'tax_id') THEN
        ALTER TABLE public.sales ADD COLUMN tax_id UUID REFERENCES public.tax_configurations(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'payment_method_id') THEN
        ALTER TABLE public.sales ADD COLUMN payment_method_id UUID REFERENCES public.payment_methods(id);
    END IF;
END $$;

-- 5. Product Variants & Modifiers
CREATE TABLE IF NOT EXISTS public.product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_id UUID REFERENCES public.inventory(id) ON DELETE CASCADE,
    variant_name TEXT NOT NULL, -- e.g. Small, Large, Red, Blue
    sku TEXT,
    price_adjustment DECIMAL(12,2) DEFAULT 0,
    quantity INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Low Stock Alerts View
CREATE OR REPLACE VIEW public.low_stock_alerts AS
SELECT 
    i.id as inventory_id,
    i.product_name,
    i.quantity,
    i.store_id,
    i.user_id,
    COALESCE(s.min_stock_level, 10) as min_stock_level
FROM 
    public.inventory i
LEFT JOIN (
    -- Assuming a settings table for thresholds, or hardcoded for now
    SELECT NULL::UUID as inventory_id, 10 as min_stock_level
) s ON i.id = s.inventory_id
WHERE 
    i.quantity <= COALESCE(s.min_stock_level, 10);

-- 7. Audit Log Triggers
CREATE OR REPLACE FUNCTION public.log_action()
RETURNS TRIGGER AS $$
DECLARE
    v_store_id UUID;
BEGIN
    -- Extract store_id from the record
    v_store_id := CASE 
        WHEN TG_OP = 'DELETE' THEN (OLD::jsonb->>'store_id')::UUID
        ELSE (NEW::jsonb->>'store_id')::UUID
    END;

    INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, old_data, new_data)
    VALUES (
        auth.uid(),
        v_store_id,
        TG_OP,
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        CASE WHEN TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP = 'UPDATE' OR TG_OP = 'INSERT' THEN to_jsonb(NEW) ELSE NULL END
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply to sensitive tables
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trig_inventory_audit') THEN
        CREATE TRIGGER trig_inventory_audit AFTER INSERT OR UPDATE OR DELETE ON public.inventory FOR EACH ROW EXECUTE FUNCTION public.log_action();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trig_sales_audit') THEN
        CREATE TRIGGER trig_sales_audit AFTER INSERT OR UPDATE OR DELETE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.log_action();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trig_staff_audit') THEN
        CREATE TRIGGER trig_staff_audit AFTER INSERT OR UPDATE OR DELETE ON public.staff FOR EACH ROW EXECUTE FUNCTION public.log_action();
    END IF;
END $$;
