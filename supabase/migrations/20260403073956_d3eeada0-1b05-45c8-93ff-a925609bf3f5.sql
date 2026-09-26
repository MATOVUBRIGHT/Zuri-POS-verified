
-- Drop the old restrictive insert policy
DROP POLICY IF EXISTS "Users can create pending subscriptions" ON public.user_subscriptions;

-- Create new policy that allows both pending subscriptions AND free trial active subscriptions
CREATE POLICY "Users can create subscriptions"
ON public.user_subscriptions
FOR INSERT
TO authenticated
WITH CHECK (
  (auth.uid() = user_id)
  AND (
    -- Allow pending subscriptions (paid plans awaiting approval)
    (status = 'pending' AND (amount_paid IS NULL OR amount_paid = 0))
    OR
    -- Allow active free trials (amount_paid = 0, payment_reference starts with 'free_')
    (status = 'active' AND (amount_paid IS NULL OR amount_paid = 0) AND payment_reference LIKE 'free_%')
  )
);
