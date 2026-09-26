
-- Remove the dangerous self-link policy that allows any user to grant themselves access to any store
DROP POLICY IF EXISTS "Users can link themselves to stores" ON public.store_access;

-- Restrict subscription inserts: only allow 'pending' status with amount_paid = 0
DROP POLICY IF EXISTS "Users can create their own subscriptions" ON public.user_subscriptions;
CREATE POLICY "Users can create pending subscriptions"
ON public.user_subscriptions FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND status = 'pending'
  AND (amount_paid IS NULL OR amount_paid = 0)
);
