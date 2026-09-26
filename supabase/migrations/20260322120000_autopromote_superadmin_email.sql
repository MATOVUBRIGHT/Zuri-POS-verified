-- Auto-assign admin role when a user signs up with the bootstrap superadmin email.
-- Create this user in Supabase Dashboard → Authentication → Users (do not store passwords in git).

CREATE OR REPLACE FUNCTION public.promote_bootstrap_superadmin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS NOT NULL AND lower(trim(NEW.email)) = 'brightadmin77@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_promote_superadmin ON auth.users;
CREATE TRIGGER on_auth_user_promote_superadmin
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.promote_bootstrap_superadmin();

-- Backfill if the account already exists
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role
FROM auth.users
WHERE lower(trim(email)) = 'brightadmin77@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;
