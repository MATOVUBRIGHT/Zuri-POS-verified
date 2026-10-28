BEGIN;

-- Keep profile names durable even when the client sends `name` (the signup
-- form field) instead of `full_name`.  Existing accounts are repaired below.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
BEGIN
  v_name := NULLIF(btrim(COALESCE(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    split_part(new.email, '@', 1),
    'User'
  )), '');

  INSERT INTO public.profiles (user_id, full_name)
  VALUES (new.id, COALESCE(v_name, 'User'))
  ON CONFLICT (user_id) DO UPDATE
  SET full_name = COALESCE(NULLIF(btrim(public.profiles.full_name), ''), EXCLUDED.full_name);
  RETURN new;
END;
$$;

-- Repair profiles created by the older trigger, which could leave full_name
-- null when signup supplied metadata under the `name` key.
UPDATE public.profiles p
SET full_name = COALESCE(
  NULLIF(btrim(p.full_name), ''),
  NULLIF(btrim(u.raw_user_meta_data->>'full_name'), ''),
  NULLIF(btrim(u.raw_user_meta_data->>'name'), ''),
  NULLIF(btrim(split_part(u.email, '@', 1)), ''),
  'User'
)
FROM auth.users u
WHERE u.id = p.user_id
  AND NULLIF(btrim(p.full_name), '') IS NULL;

-- Called after every successful session restore/login. It repairs old rows,
-- records the last login, and never overwrites a name the user already saved.
CREATE OR REPLACE FUNCTION public.sync_authenticated_identity()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user auth.users%ROWTYPE;
  v_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO v_user FROM auth.users WHERE id = auth.uid();
  v_name := NULLIF(btrim(COALESCE(
    v_user.raw_user_meta_data->>'full_name',
    v_user.raw_user_meta_data->>'name',
    split_part(v_user.email, '@', 1),
    'User'
  )), '');

  INSERT INTO public.profiles (user_id, full_name, last_login)
  VALUES (v_user.id, COALESCE(v_name, 'User'), now())
  ON CONFLICT (user_id) DO UPDATE
  SET full_name = COALESCE(NULLIF(btrim(public.profiles.full_name), ''), EXCLUDED.full_name),
      last_login = EXCLUDED.last_login;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_authenticated_identity() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_authenticated_identity() TO authenticated;

COMMIT;
