
-- 1. Add INSERT policy for notifications table (may already exist from 20260126190500_fix_errors.sql)
DROP POLICY IF EXISTS "Users can create their own notifications" ON public.notifications;
CREATE POLICY "Users can create their own notifications"
ON public.notifications
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- 2. Add database constraints for input validation
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_total_amount_positive;
ALTER TABLE public.sales ADD CONSTRAINT sales_total_amount_positive
  CHECK (total_amount > 0);

ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_amount_positive;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_amount_positive
  CHECK (amount > 0);

ALTER TABLE public.staff DROP CONSTRAINT IF EXISTS staff_hourly_rate_reasonable;
ALTER TABLE public.staff ADD CONSTRAINT staff_hourly_rate_reasonable
  CHECK (hourly_rate >= 0 AND hourly_rate < 1000000);

ALTER TABLE public.stores DROP CONSTRAINT IF EXISTS store_name_length;
ALTER TABLE public.stores ADD CONSTRAINT store_name_length
  CHECK (length(store_name) <= 255);

ALTER TABLE public.cash_transactions DROP CONSTRAINT IF EXISTS cash_tx_amount_positive;
ALTER TABLE public.cash_transactions ADD CONSTRAINT cash_tx_amount_positive
  CHECK (amount > 0);
