-- 1. Enhance Customers Table
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'credit_limit') THEN
        ALTER TABLE public.customers ADD COLUMN credit_limit DECIMAL(12,2) DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'unpaid_balance') THEN
        ALTER TABLE public.customers ADD COLUMN unpaid_balance DECIMAL(12,2) DEFAULT 0;
    END IF;
END $$;

-- 2. Customer Transactions Table (for credit/payment history)
CREATE TABLE IF NOT EXISTS public.customer_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- 'sale_credit', 'payment', 'refund'
    amount DECIMAL(12,2) NOT NULL,
    reference_id UUID, -- Link to sales.id if applicable
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Enhance Inventory Table
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory' AND column_name = 'min_stock_level') THEN
        ALTER TABLE public.inventory ADD COLUMN min_stock_level INTEGER DEFAULT 10;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory' AND column_name = 'reorder_quantity') THEN
        ALTER TABLE public.inventory ADD COLUMN reorder_quantity INTEGER DEFAULT 20;
    END IF;
END $$;

-- 4. Update Low Stock Alerts View
DROP VIEW IF EXISTS public.low_stock_alerts;
CREATE OR REPLACE VIEW public.low_stock_alerts AS
SELECT 
    i.id as inventory_id,
    i.product_name,
    i.quantity,
    i.store_id,
    i.user_id,
    i.min_stock_level
FROM 
    public.inventory i
WHERE 
    i.quantity <= i.min_stock_level;

-- 5. RLS Policies for Customer Transactions
ALTER TABLE public.customer_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view customer transactions for their stores" 
ON public.customer_transactions FOR SELECT 
USING (
    store_id IN (
        SELECT store_id FROM public.store_access WHERE user_id = auth.uid()
        UNION
        SELECT id FROM public.stores WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Users can insert customer transactions for their stores" 
ON public.customer_transactions FOR INSERT 
WITH CHECK (
    store_id IN (
        SELECT store_id FROM public.store_access WHERE user_id = auth.uid()
        UNION
        SELECT id FROM public.stores WHERE user_id = auth.uid()
    )
);
