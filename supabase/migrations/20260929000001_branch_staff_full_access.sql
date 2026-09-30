-- ============================================================
-- Branch staff full access migration
-- Ensures every column provision-branch-user writes exists on
-- the staff table, and that branch staff can read/write all POS
-- tables for their assigned store via has_store_access().
-- ============================================================

-- ── STAFF: ensure all columns written by provision-branch-user exist ─────────
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS login_username  TEXT,
  ADD COLUMN IF NOT EXISTS auth_email      TEXT,
  ADD COLUMN IF NOT EXISTS employee_id     TEXT,
  ADD COLUMN IF NOT EXISTS user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS allowed_pages   JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS status          TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS pin_hash        TEXT,
  ADD COLUMN IF NOT EXISTS pin_code        TEXT,
  ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ DEFAULT NOW();

-- Unique login per branch (case-insensitive username per store)
CREATE UNIQUE INDEX IF NOT EXISTS staff_store_login_username_unique
  ON public.staff (store_id, lower(login_username))
  WHERE login_username IS NOT NULL;

-- Fast lookup by auth user + store (used in Index.tsx loadBranchStaff)
CREATE INDEX IF NOT EXISTS staff_user_id_store_id_idx
  ON public.staff (user_id, store_id);

-- ── STAFF RLS ────────────────────────────────────────────────────────────────
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

-- Owner / executive can manage all staff for their stores
DROP POLICY IF EXISTS "Store owners can manage their staff" ON public.staff;
CREATE POLICY "Store owners can manage their staff"
  ON public.staff FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.stores WHERE id = staff.store_id AND user_id = auth.uid())
    OR public.has_store_access(store_id, auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.stores WHERE id = staff.store_id AND user_id = auth.uid())
    OR public.has_store_access(store_id, auth.uid())
  );

-- Branch staff can read their own assignment (needed by Index.tsx loadBranchStaff)
DROP POLICY IF EXISTS "Staff can view their own branch assignment" ON public.staff;
CREATE POLICY "Staff can view their own branch assignment"
  ON public.staff FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ── INVENTORY RLS ────────────────────────────────────────────────────────────
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Branch staff can view store inventory" ON public.inventory;
CREATE POLICY "Branch staff can view store inventory"
  ON public.inventory FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_store_access(store_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.stores WHERE id = inventory.store_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Branch staff can insert inventory" ON public.inventory;
CREATE POLICY "Branch staff can insert inventory"
  ON public.inventory FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    OR public.has_store_access(store_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.stores WHERE id = inventory.store_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Branch staff can update inventory" ON public.inventory;
CREATE POLICY "Branch staff can update inventory"
  ON public.inventory FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_store_access(store_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.stores WHERE id = inventory.store_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Branch staff can delete inventory" ON public.inventory;
CREATE POLICY "Branch staff can delete inventory"
  ON public.inventory FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_store_access(store_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.stores WHERE id = inventory.store_id AND user_id = auth.uid())
  );

-- ── SALES RLS ────────────────────────────────────────────────────────────────
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Branch staff can view store sales" ON public.sales;
CREATE POLICY "Branch staff can view store sales"
  ON public.sales FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_store_access(store_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.stores WHERE id = sales.store_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Branch staff can insert sales" ON public.sales;
CREATE POLICY "Branch staff can insert sales"
  ON public.sales FOR INSERT TO authenticated
  WITH CHECK (
    public.has_store_access(store_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.stores WHERE id = sales.store_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Branch staff can update sales" ON public.sales;
CREATE POLICY "Branch staff can update sales"
  ON public.sales FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_store_access(store_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.stores WHERE id = sales.store_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Branch staff can delete sales" ON public.sales;
CREATE POLICY "Branch staff can delete sales"
  ON public.sales FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_store_access(store_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.stores WHERE id = sales.store_id AND user_id = auth.uid())
  );

-- ── EXPENSES RLS ─────────────────────────────────────────────────────────────
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Branch staff can view store expenses" ON public.expenses;
CREATE POLICY "Branch staff can view store expenses"
  ON public.expenses FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_store_access(store_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.stores WHERE id = expenses.store_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Branch staff can insert expenses" ON public.expenses;
CREATE POLICY "Branch staff can insert expenses"
  ON public.expenses FOR INSERT TO authenticated
  WITH CHECK (
    public.has_store_access(store_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.stores WHERE id = expenses.store_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Branch staff can update expenses" ON public.expenses;
CREATE POLICY "Branch staff can update expenses"
  ON public.expenses FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_store_access(store_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.stores WHERE id = expenses.store_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Branch staff can delete expenses" ON public.expenses;
CREATE POLICY "Branch staff can delete expenses"
  ON public.expenses FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_store_access(store_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.stores WHERE id = expenses.store_id AND user_id = auth.uid())
  );

-- ── CASH TRANSACTIONS RLS ────────────────────────────────────────────────────
ALTER TABLE public.cash_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Branch staff can view cash transactions" ON public.cash_transactions;
CREATE POLICY "Branch staff can view cash transactions"
  ON public.cash_transactions FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_store_access(store_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.stores WHERE id = cash_transactions.store_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Branch staff can insert cash transactions" ON public.cash_transactions;
CREATE POLICY "Branch staff can insert cash transactions"
  ON public.cash_transactions FOR INSERT TO authenticated
  WITH CHECK (
    public.has_store_access(store_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.stores WHERE id = cash_transactions.store_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Branch staff can update cash transactions" ON public.cash_transactions;
CREATE POLICY "Branch staff can update cash transactions"
  ON public.cash_transactions FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_store_access(store_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.stores WHERE id = cash_transactions.store_id AND user_id = auth.uid())
  );

-- ── CUSTOMERS RLS ────────────────────────────────────────────────────────────
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Branch staff can manage customers" ON public.customers;
CREATE POLICY "Branch staff can manage customers"
  ON public.customers FOR ALL TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_store_access(store_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.stores WHERE id = customers.store_id AND user_id = auth.uid())
  )
  WITH CHECK (
    public.has_store_access(store_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.stores WHERE id = customers.store_id AND user_id = auth.uid())
  );

-- ── SHIFTS RLS ───────────────────────────────────────────────────────────────
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Branch staff can manage shifts" ON public.shifts;
CREATE POLICY "Branch staff can manage shifts"
  ON public.shifts FOR ALL TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_store_access(store_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.stores WHERE id = shifts.store_id AND user_id = auth.uid())
  )
  WITH CHECK (
    auth.uid() = user_id
    OR public.has_store_access(store_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.stores WHERE id = shifts.store_id AND user_id = auth.uid())
  );

-- ── CATEGORIES RLS ───────────────────────────────────────────────────────────
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Branch staff can manage categories" ON public.categories;
CREATE POLICY "Branch staff can manage categories"
  ON public.categories FOR ALL TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_store_access(store_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.stores WHERE id = categories.store_id AND user_id = auth.uid())
  )
  WITH CHECK (
    public.has_store_access(store_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.stores WHERE id = categories.store_id AND user_id = auth.uid())
  );

-- ── SUPPLIERS RLS ────────────────────────────────────────────────────────────
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Branch staff can manage suppliers" ON public.suppliers;
CREATE POLICY "Branch staff can manage suppliers"
  ON public.suppliers FOR ALL TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_store_access(store_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.stores WHERE id = suppliers.store_id AND user_id = auth.uid())
  )
  WITH CHECK (
    public.has_store_access(store_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.stores WHERE id = suppliers.store_id AND user_id = auth.uid())
  );

-- ── NOTIFICATIONS RLS ────────────────────────────────────────────────────────
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Branch staff can manage notifications" ON public.notifications;
CREATE POLICY "Branch staff can manage notifications"
  ON public.notifications FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_store_access(store_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.stores WHERE id = notifications.store_id AND user_id = auth.uid())
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.has_store_access(store_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.stores WHERE id = notifications.store_id AND user_id = auth.uid())
  );

-- ── SALE RETURNS RLS ─────────────────────────────────────────────────────────
ALTER TABLE public.sale_returns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Branch staff can manage sale returns" ON public.sale_returns;
CREATE POLICY "Branch staff can manage sale returns"
  ON public.sale_returns FOR ALL TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_store_access(store_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.stores WHERE id = sale_returns.store_id AND user_id = auth.uid())
  )
  WITH CHECK (
    public.has_store_access(store_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.stores WHERE id = sale_returns.store_id AND user_id = auth.uid())
  );

-- ── STORE ACCESS: users can view their own rows ──────────────────────────────
ALTER TABLE public.store_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their access" ON public.store_access;
CREATE POLICY "Users can view their access"
  ON public.store_access FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Store owners manage access for their branches
DROP POLICY IF EXISTS "Store owners can delete access" ON public.store_access;
CREATE POLICY "Store owners can delete access"
  ON public.store_access FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.stores WHERE id = store_access.store_id AND user_id = auth.uid())
  );

-- ── REALTIME publications ────────────────────────────────────────────────────
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.staff; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.sale_returns; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
