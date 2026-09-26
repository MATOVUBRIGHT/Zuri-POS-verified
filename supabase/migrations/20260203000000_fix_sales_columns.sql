-- Add missing columns to sales table for Enterprise features
-- Address "discount not found" error and support full sales data

ALTER TABLE public.sales
    ADD COLUMN IF NOT EXISTS discount_amount NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS tax_amount NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS tax_id UUID REFERENCES public.tax_configurations(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS payment_method_id UUID REFERENCES public.payment_methods(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'completed',
    ADD COLUMN IF NOT EXISTS staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL;

-- Also ensure cash_transactions table exists for "payments not saving" issue
CREATE TABLE IF NOT EXISTS public.cash_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id),
    amount NUMERIC NOT NULL,
    type TEXT NOT NULL, -- 'in' (deposit) or 'out' (withdrawal)
    description TEXT,
    account_type TEXT DEFAULT 'cash',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Enable RLS for cash_transactions
ALTER TABLE public.cash_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view store cash transactions" ON public.cash_transactions
    FOR SELECT USING (auth.uid() = user_id OR auth.uid() IN (SELECT user_id FROM public.store_access WHERE store_id = cash_transactions.store_id));

CREATE POLICY "Users can insert cash transactions" ON public.cash_transactions
    FOR INSERT WITH CHECK (auth.uid() = user_id);
