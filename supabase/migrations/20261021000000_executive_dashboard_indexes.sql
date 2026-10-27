-- Keep executive branch summaries fast as sales and expense history grows.
-- These support the batched, period-scoped queries in ExecutiveWorkspace.
CREATE INDEX IF NOT EXISTS sales_store_created_at_idx
  ON public.sales (store_id, created_at DESC);

CREATE INDEX IF NOT EXISTS sales_store_date_of_sale_idx
  ON public.sales (store_id, date_of_sale DESC);

CREATE INDEX IF NOT EXISTS expenses_store_created_at_idx
  ON public.expenses (store_id, created_at DESC);

CREATE INDEX IF NOT EXISTS expenses_store_date_of_expense_idx
  ON public.expenses (store_id, date_of_expense DESC);

CREATE INDEX IF NOT EXISTS store_access_user_role_store_idx
  ON public.store_access (user_id, role, store_id);
