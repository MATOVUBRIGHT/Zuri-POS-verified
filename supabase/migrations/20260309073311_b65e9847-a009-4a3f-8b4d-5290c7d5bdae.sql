
-- Enable pgcrypto extension for password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Add pin_hash column to staff table
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS pin_hash text;

-- Migrate existing plain-text PINs to hashed versions
UPDATE public.staff 
SET pin_hash = extensions.crypt(pin_code, extensions.gen_salt('bf', 8))
WHERE pin_code IS NOT NULL AND pin_hash IS NULL;

-- Create a function to hash PINs automatically on insert/update
CREATE OR REPLACE FUNCTION public.hash_staff_pin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.pin_code IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.pin_code IS DISTINCT FROM OLD.pin_code) THEN
    NEW.pin_hash = extensions.crypt(NEW.pin_code, extensions.gen_salt('bf', 8));
    NEW.pin_code = NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger to auto-hash PINs
DROP TRIGGER IF EXISTS trigger_hash_staff_pin ON public.staff;
CREATE TRIGGER trigger_hash_staff_pin
  BEFORE INSERT OR UPDATE ON public.staff
  FOR EACH ROW
  EXECUTE FUNCTION public.hash_staff_pin();

-- Clear all plain-text PINs now that they're hashed
UPDATE public.staff SET pin_code = NULL WHERE pin_hash IS NOT NULL;
