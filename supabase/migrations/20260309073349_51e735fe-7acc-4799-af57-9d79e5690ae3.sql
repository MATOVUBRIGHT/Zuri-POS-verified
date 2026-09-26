
-- Create a function to verify PIN hash using pgcrypto's crypt()
CREATE OR REPLACE FUNCTION public.verify_pin_hash(_pin_input text, _pin_hash text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $$
  SELECT _pin_hash = extensions.crypt(_pin_input, _pin_hash);
$$;
