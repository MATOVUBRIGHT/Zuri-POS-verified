-- ── audit_logs: add missing staff_id and staff_name columns ─────────────────
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS staff_id   UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS staff_name TEXT;

-- ── branch_payment_accounts ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.branch_payment_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  provider_type   TEXT NOT NULL DEFAULT 'bank',
  account_number  TEXT,
  opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  current_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  external_link   TEXT,
  notes           TEXT,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS branch_payment_accounts_store_id_idx
  ON public.branch_payment_accounts(store_id);

ALTER TABLE public.branch_payment_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_accounts_read_scoped ON public.branch_payment_accounts;
CREATE POLICY payment_accounts_read_scoped ON public.branch_payment_accounts FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.stores WHERE id = branch_payment_accounts.store_id AND user_id = auth.uid())
    OR public.has_store_access(store_id, auth.uid())
  );

DROP POLICY IF EXISTS payment_accounts_write_scoped ON public.branch_payment_accounts;
CREATE POLICY payment_accounts_write_scoped ON public.branch_payment_accounts FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.stores WHERE id = branch_payment_accounts.store_id AND user_id = auth.uid())
    OR public.has_store_access(store_id, auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.stores WHERE id = branch_payment_accounts.store_id AND user_id = auth.uid())
    OR public.has_store_access(store_id, auth.uid())
  );

-- ── payment_account_ledger ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_account_ledger (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES public.branch_payment_accounts(id) ON DELETE RESTRICT,
  store_id    UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  amount      NUMERIC(14,2) NOT NULL,
  direction   TEXT NOT NULL CHECK (direction IN ('in','out')),
  description TEXT,
  reference   TEXT,
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payment_account_ledger_account_id_idx
  ON public.payment_account_ledger(account_id);
CREATE INDEX IF NOT EXISTS payment_account_ledger_store_id_idx
  ON public.payment_account_ledger(store_id);

ALTER TABLE public.payment_account_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ledger_read_scoped ON public.payment_account_ledger;
CREATE POLICY ledger_read_scoped ON public.payment_account_ledger FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.stores WHERE id = payment_account_ledger.store_id AND user_id = auth.uid())
    OR public.has_store_access(store_id, auth.uid())
  );

DROP POLICY IF EXISTS ledger_write_scoped ON public.payment_account_ledger;
CREATE POLICY ledger_write_scoped ON public.payment_account_ledger FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.stores WHERE id = payment_account_ledger.store_id AND user_id = auth.uid())
    OR public.has_store_access(store_id, auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.stores WHERE id = payment_account_ledger.store_id AND user_id = auth.uid())
    OR public.has_store_access(store_id, auth.uid())
  );

-- ── tracker_documents ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tracker_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('receipt','invoice','statement')),
  title         TEXT NOT NULL,
  reference     TEXT,
  payee         TEXT,
  amount        NUMERIC(14,2),
  status        TEXT DEFAULT 'filed',
  document_date DATE NOT NULL,
  notes         TEXT,
  file_path     TEXT,
  account_name  TEXT,
  account_type  TEXT,
  period_start  DATE,
  period_end    DATE,
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tracker_documents_store_id_idx
  ON public.tracker_documents(store_id);
CREATE INDEX IF NOT EXISTS tracker_documents_date_idx
  ON public.tracker_documents(store_id, document_date DESC);

ALTER TABLE public.tracker_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tracker_documents_scoped ON public.tracker_documents;
CREATE POLICY tracker_documents_scoped ON public.tracker_documents FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.stores WHERE id = tracker_documents.store_id AND user_id = auth.uid())
    OR public.has_store_access(store_id, auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.stores WHERE id = tracker_documents.store_id AND user_id = auth.uid())
    OR public.has_store_access(store_id, auth.uid())
  );

-- ── sale_payment_splits ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sale_payment_splits (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id     UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  store_id    UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  account_id  UUID NOT NULL REFERENCES public.branch_payment_accounts(id) ON DELETE RESTRICT,
  amount      NUMERIC(14,2) NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.sale_payment_splits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sale_payment_splits_scoped ON public.sale_payment_splits;
CREATE POLICY sale_payment_splits_scoped ON public.sale_payment_splits FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.stores WHERE id = sale_payment_splits.store_id AND user_id = auth.uid())
    OR public.has_store_access(store_id, auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.stores WHERE id = sale_payment_splits.store_id AND user_id = auth.uid())
    OR public.has_store_access(store_id, auth.uid())
  );

-- ── sales: add payment_account_id if missing ─────────────────────────────────
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS payment_account_id UUID REFERENCES public.branch_payment_accounts(id) ON DELETE SET NULL;

-- ── receipts storage bucket ───────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for receipts bucket
DROP POLICY IF EXISTS "Users can view their store receipts" ON storage.objects;
CREATE POLICY "Users can view their store receipts"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'receipts'
  AND (storage.foldername(name))[1] IN (
    SELECT s.id::text FROM public.stores s WHERE s.user_id = auth.uid()
    UNION
    SELECT sa.store_id::text FROM public.store_access sa WHERE sa.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can upload to their store receipts" ON storage.objects;
CREATE POLICY "Users can upload to their store receipts"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'receipts'
  AND (storage.foldername(name))[1] IN (
    SELECT s.id::text FROM public.stores s WHERE s.user_id = auth.uid()
    UNION
    SELECT sa.store_id::text FROM public.store_access sa WHERE sa.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Store owners can delete their receipts" ON storage.objects;
CREATE POLICY "Store owners can delete their receipts"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'receipts'
  AND (storage.foldername(name))[1] IN (
    SELECT s.id::text FROM public.stores s WHERE s.user_id = auth.uid()
  )
);

-- ── Realtime ──────────────────────────────────────────────────────────────────
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.branch_payment_accounts; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.tracker_documents; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_account_ledger; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
