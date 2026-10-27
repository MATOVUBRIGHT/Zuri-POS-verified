-- Deliver transaction activity and daily summaries to every permitted user.
-- SECURITY DEFINER keeps this reliable even when the actor cannot insert rows
-- for another recipient under the normal notifications RLS policy.

CREATE OR REPLACE FUNCTION public.notify_transaction_recipients()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  branch_id uuid := (to_jsonb(NEW)->>'store_id')::uuid;
  transaction_id uuid := (to_jsonb(NEW)->>'id')::uuid;
  amount_text text := COALESCE(to_jsonb(NEW)->>'total_amount', to_jsonb(NEW)->>'amount', '0');
  subject text;
  detail text;
  notification_type text;
BEGIN
  IF branch_id IS NULL OR transaction_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'sales' THEN
    notification_type := 'transaction_sale';
    subject := 'Sale recorded';
    detail := format('A sale of %s was recorded%s.', amount_text,
      CASE WHEN NULLIF(to_jsonb(NEW)->>'customer_name', '') IS NULL THEN ''
           ELSE format(' for %s', to_jsonb(NEW)->>'customer_name') END);
  ELSIF TG_TABLE_NAME = 'expenses' THEN
    notification_type := 'transaction_expense';
    subject := 'Expense recorded';
    detail := format('An expense of %s was recorded%s.', amount_text,
      CASE WHEN NULLIF(to_jsonb(NEW)->>'description', '') IS NULL THEN ''
           ELSE format(': %s', to_jsonb(NEW)->>'description') END);
  ELSIF TG_TABLE_NAME = 'sale_returns' THEN
    notification_type := 'transaction_return';
    subject := 'Sale return recorded';
    detail := format('A return of %s was recorded.', amount_text);
  ELSE
    notification_type := 'transaction_cash';
    subject := 'Cash transaction recorded';
    detail := format('A cash movement of %s (%s) was recorded.', amount_text,
      COALESCE(to_jsonb(NEW)->>'type', 'transaction'));
  END IF;

  INSERT INTO public.notifications (user_id, store_id, type, title, message, data)
  SELECT recipients.user_id, branch_id, notification_type, subject, detail,
    jsonb_build_object(
      'transaction_id', transaction_id,
      'transaction_table', TG_TABLE_NAME,
      'amount', amount_text,
      'store_id', branch_id
    )
  FROM (
    SELECT s.user_id FROM public.stores s WHERE s.id = branch_id
    UNION
    SELECT sa.user_id FROM public.store_access sa WHERE sa.store_id = branch_id
    UNION
    SELECT ur.user_id FROM public.user_roles ur
      WHERE ur.role::text IN ('boss', 'admin', 'master_developer')
  ) AS recipients
  WHERE NOT EXISTS (
    SELECT 1 FROM public.notifications existing
    WHERE existing.user_id = recipients.user_id
      AND existing.store_id = branch_id
      AND existing.type = notification_type
      AND existing.data @> jsonb_build_object('transaction_id', transaction_id)
  );

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.sales') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS notify_sale_recipients ON public.sales;
    CREATE TRIGGER notify_sale_recipients
      AFTER INSERT ON public.sales
      FOR EACH ROW EXECUTE FUNCTION public.notify_transaction_recipients();
  END IF;
  IF to_regclass('public.expenses') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS notify_expense_recipients ON public.expenses;
    CREATE TRIGGER notify_expense_recipients
      AFTER INSERT ON public.expenses
      FOR EACH ROW EXECUTE FUNCTION public.notify_transaction_recipients();
  END IF;
  IF to_regclass('public.cash_transactions') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS notify_cash_transaction_recipients ON public.cash_transactions;
    CREATE TRIGGER notify_cash_transaction_recipients
      AFTER INSERT ON public.cash_transactions
      FOR EACH ROW EXECUTE FUNCTION public.notify_transaction_recipients();
  END IF;
  IF to_regclass('public.sale_returns') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS notify_sale_return_recipients ON public.sale_returns;
    CREATE TRIGGER notify_sale_return_recipients
      AFTER INSERT ON public.sale_returns
      FOR EACH ROW EXECUTE FUNCTION public.notify_transaction_recipients();
  END IF;
END $$;

-- Called when an authenticated app session starts. It is idempotent per user,
-- branch, and date, so it is safe to call from every installed client.
CREATE OR REPLACE FUNCTION public.create_daily_branch_reports(p_report_date date DEFAULT current_date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;

  INSERT INTO public.notifications (user_id, store_id, type, title, message, data)
  SELECT recipients.user_id, branches.id, 'daily_report',
    'Daily branch report',
    format('%s: %s sales totaling %s and %s expenses totaling %s.',
      branches.store_name, report.sales_count, report.sales_total,
      report.expense_count, report.expense_total),
    jsonb_build_object(
      'report_date', p_report_date,
      'store_id', branches.id,
      'sales_count', report.sales_count,
      'sales_total', report.sales_total,
      'expense_count', report.expense_count,
      'expense_total', report.expense_total
    )
  FROM public.stores branches
  CROSS JOIN LATERAL (
    SELECT
      (SELECT count(*) FROM public.sales s WHERE s.store_id = branches.id AND s.date_of_sale = p_report_date) AS sales_count,
      COALESCE((SELECT sum(s.total_amount) FROM public.sales s WHERE s.store_id = branches.id AND s.date_of_sale = p_report_date), 0) AS sales_total,
      (SELECT count(*) FROM public.expenses e WHERE e.store_id = branches.id AND e.date_of_expense = p_report_date) AS expense_count,
      COALESCE((SELECT sum(e.amount) FROM public.expenses e WHERE e.store_id = branches.id AND e.date_of_expense = p_report_date), 0) AS expense_total
  ) report
  CROSS JOIN LATERAL (
    SELECT s.user_id FROM public.stores s WHERE s.id = branches.id
    UNION
    SELECT sa.user_id FROM public.store_access sa WHERE sa.store_id = branches.id
    UNION
    SELECT ur.user_id FROM public.user_roles ur WHERE ur.role::text IN ('boss', 'admin', 'master_developer')
  ) recipients
  WHERE NOT EXISTS (
    SELECT 1 FROM public.notifications existing
    WHERE existing.user_id = recipients.user_id
      AND existing.store_id = branches.id
      AND existing.type = 'daily_report'
      AND existing.data @> jsonb_build_object('report_date', p_report_date)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_daily_branch_reports(date) TO authenticated;
