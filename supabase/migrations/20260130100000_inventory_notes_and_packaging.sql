-- Migration to add notes to inventory and improve product categorization
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory' AND column_name = 'notes') THEN
        ALTER TABLE public.inventory ADD COLUMN notes TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory' AND column_name = 'packaging_type') THEN
        ALTER TABLE public.inventory ADD COLUMN packaging_type TEXT DEFAULT 'individual';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory' AND column_name = 'unit_name') THEN
        ALTER TABLE public.inventory ADD COLUMN unit_name TEXT DEFAULT 'unit';
    END IF;
END $$;
