-- Provide a server-side PIN hashing helper for the app.
-- This avoids storing plaintext PINs and keeps hashing compatible with verify_pin_hash().

CREATE OR REPLACE FUNCTION public.hash_pin(_pin_input text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $$
  SELECT extensions.crypt(_pin_input, extensions.gen_salt('bf', 8));
$$;

-- If an old trigger/function exists that referenced the removed `pin_code` column,
-- it will break staff inserts/updates. The app now writes `pin_hash` directly.
DROP TRIGGER IF EXISTS trigger_hash_staff_pin ON public.staff;
DROP FUNCTION IF EXISTS public.hash_staff_pin();

