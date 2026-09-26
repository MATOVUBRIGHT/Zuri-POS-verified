-- Allow authenticated users to read profiles and subscriptions
-- (portal uses anon key but authenticated session)

-- Profiles: allow any authenticated user to read all profiles
DROP POLICY IF EXISTS "Authenticated can read profiles" ON public.profiles;
CREATE POLICY "Authenticated can read profiles"
  ON public.profiles FOR SELECT
  USING (true);

-- Profiles: allow authenticated update (for suspend/reactivate/delete)
DROP POLICY IF EXISTS "Authenticated can update profiles" ON public.profiles;
CREATE POLICY "Authenticated can update profiles"
  ON public.profiles FOR UPDATE
  USING (auth.role() = 'authenticated');

-- user_subscriptions: allow authenticated read
DROP POLICY IF EXISTS "Authenticated can read subscriptions" ON public.user_subscriptions;
CREATE POLICY "Authenticated can read subscriptions"
  ON public.user_subscriptions FOR SELECT
  USING (true);

-- user_subscriptions: allow authenticated update (for verify/revoke)
DROP POLICY IF EXISTS "Authenticated can update subscriptions" ON public.user_subscriptions;
CREATE POLICY "Authenticated can update subscriptions"
  ON public.user_subscriptions FOR UPDATE
  USING (auth.role() = 'authenticated');

-- subscription_plans: allow public read
DROP POLICY IF EXISTS "Public can read plans" ON public.subscription_plans;
CREATE POLICY "Public can read plans"
  ON public.subscription_plans FOR SELECT
  USING (true);

-- stores: allow authenticated read all
DROP POLICY IF EXISTS "Authenticated can read all stores" ON public.stores;
CREATE POLICY "Authenticated can read all stores"
  ON public.stores FOR SELECT
  USING (true);

-- Enable realtime for subscriptions so portal gets live updates
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.user_subscriptions;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
