
-- Fix the hash_staff_pin trigger function to use extensions schema
CREATE OR REPLACE FUNCTION public.hash_staff_pin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $$
BEGIN
  IF NEW.pin_code IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.pin_code IS DISTINCT FROM OLD.pin_code) THEN
    NEW.pin_hash = extensions.crypt(NEW.pin_code, extensions.gen_salt('bf', 8));
    NEW.pin_code = NULL;
  END IF;
  RETURN NEW;
END;
$$;
