-- Database Fixes for 403 and 404 Errors

-- 1. Fix Notifications 403 (Forbidden) by adding INSERT policy
-- This allows the system/user to create notifications (low stock, etc)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'notifications' AND policyname = 'Users can create their own notifications'
    ) THEN
        CREATE POLICY "Users can create their own notifications"
        ON public.notifications
        FOR INSERT
        WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;

-- 2. Repair Staff table (Fixing 404)
-- This ensures the table exists even if previous migrations were skipped
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

ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'staff' AND policyname = 'Store owners and managers can manage staff'
    ) THEN
        CREATE POLICY "Store owners and managers can manage staff" ON public.staff
        FOR ALL USING (
            auth.uid() IN (SELECT user_id FROM public.stores WHERE id = store_id)
            OR 
            auth.uid() IN (SELECT user_id FROM public.store_access WHERE store_id = staff.store_id AND role IN ('admin', 'manager'))
        );
    END IF;
END $$;

-- 3. Link Sales and Staff (Re-ensure column exists)
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL;

-- 4. Enable Realtime for Staff (In case it was missed)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'staff'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.staff;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        -- Handle cases where publication doesn't exist or table already added
        NULL;
END $$;
