-- Tracker: unified document store for receipts, invoices and bank/account statements.
--
-- Why a new table: src/components/Tracker.tsx queried "invoices" and "receipts"
-- tables that exist in no migration and in no generated type, so the page could
-- only ever fail with "relation does not exist". This migration creates the real
-- schema. Any legacy "invoices"/"receipts" rows are copied across if those tables
-- happen to exist in the live database, so nothing is lost.
--
-- Files live in the existing private "receipts" storage bucket under a "tracker/"
-- prefix, so Expenses.tsx and MobileAction.tsx uploads are unaffected.

CREATE TABLE IF NOT EXISTS public.tracker_documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Category discriminator. Drives the All / Receipts / Invoices / Statements cards.
  kind          text NOT NULL CHECK (kind IN ('receipt', 'invoice', 'statement')),

  title         text NOT NULL,
  reference     text,
  payee         text,
  amount        numeric(14, 2),
  notes         text,
  status        text NOT NULL DEFAULT 'filed'
                  CHECK (status IN ('filed', 'pending', 'paid', 'overdue', 'void')),

  -- Drives the month folders. Defaults to today so an upload always lands somewhere.
  document_date date NOT NULL DEFAULT current_date,

  -- Statement-only fields: which account, and the period the statement covers.
  account_name  text,
  account_type  text,
  period_start  date,
  period_end    date,

  -- File attached to the document, relative to the "receipts" bucket.
  file_path     text,
  file_name     text,
  file_type     text,
  file_size     bigint,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tracker_documents IS
  'Branch-scoped document archive: receipts, invoices and bank/account statements, filed into month folders.';

CREATE INDEX IF NOT EXISTS idx_tracker_documents_store_kind_date
  ON public.tracker_documents (store_id, kind, document_date DESC);

CREATE INDEX IF NOT EXISTS idx_tracker_documents_store_date
  ON public.tracker_documents (store_id, document_date DESC);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_tracker_documents_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tracker_documents_updated_at ON public.tracker_documents;
CREATE TRIGGER trg_tracker_documents_updated_at
  BEFORE UPDATE ON public.tracker_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_tracker_documents_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security: branch scoped, same helpers used by cash_banking_deposits
-- ---------------------------------------------------------------------------
ALTER TABLE public.tracker_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Branch users view tracker documents" ON public.tracker_documents;
CREATE POLICY "Branch users view tracker documents" ON public.tracker_documents
  FOR SELECT
  USING (
    public.is_store_owner(store_id, auth.uid())
    OR public.has_store_access(store_id, auth.uid())
  );

DROP POLICY IF EXISTS "Branch users insert tracker documents" ON public.tracker_documents;
CREATE POLICY "Branch users insert tracker documents" ON public.tracker_documents
  FOR INSERT
  WITH CHECK (public.can_write_store(store_id));

DROP POLICY IF EXISTS "Branch users update tracker documents" ON public.tracker_documents;
CREATE POLICY "Branch users update tracker documents" ON public.tracker_documents
  FOR UPDATE
  USING (public.can_write_store(store_id))
  WITH CHECK (public.can_write_store(store_id));

DROP POLICY IF EXISTS "Branch users delete tracker documents" ON public.tracker_documents;
CREATE POLICY "Branch users delete tracker documents" ON public.tracker_documents
  FOR DELETE
  USING (public.can_write_store(store_id));

-- ---------------------------------------------------------------------------
-- One-time carry-over from the legacy tables, if they exist in the live DB.
-- Wrapped so an unexpected column layout can never block the migration.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.invoices') IS NOT NULL THEN
    BEGIN
      EXECUTE $q$
        INSERT INTO public.tracker_documents
          (store_id, kind, title, reference, payee, amount, document_date, created_at)
        SELECT
          i.store_id,
          'invoice',
          COALESCE(NULLIF(i.payee, ''), NULLIF(i.number, ''), 'Invoice'),
          i.number,
          i.payee,
          i.amount,
          COALESCE(i.created_at::date, current_date),
          COALESCE(i.created_at, now())
        FROM public.invoices i
        WHERE i.store_id IS NOT NULL
      $q$;
      RAISE NOTICE 'tracker: invoices carried over';
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'tracker: skipped invoices carry-over (%', SQLERRM;
    END;
  END IF;

  IF to_regclass('public.receipts') IS NOT NULL THEN
    BEGIN
      EXECUTE $q$
        INSERT INTO public.tracker_documents
          (store_id, kind, title, reference, amount, document_date, file_path, file_name, created_at)
        SELECT
          r.store_id,
          'receipt',
          COALESCE(NULLIF(r.reference, ''), 'Receipt'),
          r.reference,
          r.amount,
          COALESCE(r.created_at::date, current_date),
          r.receipt_url,
          r.reference,
          COALESCE(r.created_at, now())
        FROM public.receipts r
        WHERE r.store_id IS NOT NULL
      $q$;
      RAISE NOTICE 'tracker: receipts carried over';
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'tracker: skipped receipts carry-over (%', SQLERRM;
    END;
  END IF;
END $$;
