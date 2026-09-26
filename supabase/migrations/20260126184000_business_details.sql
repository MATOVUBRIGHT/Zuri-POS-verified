-- Add business details to stores table
ALTER TABLE public.stores 
    ADD COLUMN IF NOT EXISTS address TEXT,
    ADD COLUMN IF NOT EXISTS phone TEXT,
    ADD COLUMN IF NOT EXISTS email TEXT,
    ADD COLUMN IF NOT EXISTS tin_number TEXT,
    ADD COLUMN IF NOT EXISTS logo_url TEXT,
    ADD COLUMN IF NOT EXISTS website TEXT;

-- Informational comment
COMMENT ON TABLE public.stores IS 'Stores with full business details for receipt printing and branding';
