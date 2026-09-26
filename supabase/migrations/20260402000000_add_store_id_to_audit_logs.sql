-- Add  missing store_id column to audit_logs table
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'store_id') THEN
        ALTER TABLE public.audit_logs ADD COLUMN store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'staff_name') THEN
        ALTER TABLE public.audit_logs ADD COLUMN staff_name TEXT;
    END IF;
END $$;
