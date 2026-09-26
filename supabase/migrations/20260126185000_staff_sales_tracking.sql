-- Link Sales to Staff for tracking
ALTER TABLE public.sales 
    ADD COLUMN IF NOT EXISTS staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL;

-- Enable RLS for Staff Management by Managers too
DROP POLICY IF EXISTS "Store owners can manage their staff" ON public.staff;
CREATE POLICY "Store owners and managers can manage staff" ON public.staff
    FOR ALL USING (
        auth.uid() IN (SELECT user_id FROM public.stores WHERE id = store_id)
        OR 
        auth.uid() IN (SELECT user_id FROM public.store_access WHERE store_id = staff.store_id AND role IN ('admin', 'manager'))
    );

-- Add last_closing_balance to stores to suggest opening balance
ALTER TABLE public.stores 
    ADD COLUMN IF NOT EXISTS last_closing_balance NUMERIC DEFAULT 0;
