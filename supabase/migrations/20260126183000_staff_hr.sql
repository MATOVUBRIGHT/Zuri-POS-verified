-- HR and Staff Management Schema

-- 1. Staff Table (Internal to Store, for PIN-based access)
CREATE TABLE IF NOT EXISTS public.staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    employee_id TEXT NOT NULL, -- Human readable ID (e.g. EMP001)
    pin_code TEXT NOT NULL, -- 4-6 digit PIN for quick shift access
    role TEXT NOT NULL DEFAULT 'cashier', -- 'cashier', 'manager', 'admin'
    hourly_rate NUMERIC DEFAULT 0,
    contact_number TEXT,
    email TEXT,
    status TEXT DEFAULT 'active', -- 'active', 'inactive', 'on_leave'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    UNIQUE(store_id, employee_id)
);

ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Store owners can manage their staff" ON public.staff
    FOR ALL USING (auth.uid() IN (SELECT user_id FROM public.stores WHERE id = store_id));

-- 2. Staff Schedule / Suggested Shifts
CREATE TABLE IF NOT EXISTS public.staff_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID REFERENCES public.staff(id) ON DELETE CASCADE,
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL, -- 0-6 (Sunday-Saturday)
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

ALTER TABLE public.staff_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Store owners can manage schedules" ON public.staff_schedules
    FOR ALL USING (auth.uid() IN (SELECT user_id FROM public.stores WHERE id = store_id));

-- 3. Update Shifts to link to Staff
ALTER TABLE public.shifts 
    ADD COLUMN IF NOT EXISTS staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS shift_type TEXT DEFAULT 'standard', -- 'standard', 'overtime'
    ADD COLUMN IF NOT EXISTS notes TEXT;

-- 4. Audit staff actions
ALTER TABLE public.audit_logs 
    ADD COLUMN IF NOT EXISTS staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL;

-- 5. Realtime Enablement
ALTER PUBLICATION supabase_realtime ADD TABLE public.staff;
ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_schedules;
