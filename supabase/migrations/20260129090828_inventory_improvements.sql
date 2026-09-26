-- 1. Add min_stock_level to inventory table
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory' AND column_name = 'min_stock_level') THEN
        ALTER TABLE public.inventory ADD COLUMN min_stock_level INTEGER DEFAULT 10;
    END IF;
END $$;

-- 2. Update Low Stock Alerts View to use per-product threshold
DROP VIEW IF EXISTS public.low_stock_alerts;
CREATE OR REPLACE VIEW public.low_stock_alerts AS
SELECT 
    i.id as inventory_id,
    i.product_name,
    i.quantity,
    i.sachets_count,
    i.store_id,
    i.user_id,
    i.min_stock_level
FROM 
    public.inventory i
WHERE 
    i.quantity <= i.min_stock_level OR (i.sachets_count IS NOT NULL AND i.sachets_count <= 2);

-- 3. Add Category Table (if not exists)
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(store_id, name)
);

-- 4. Ensure category_id exists in inventory
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory' AND column_name = 'category_id') THEN
        ALTER TABLE public.inventory ADD COLUMN category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL;
    END IF;
END $$;
