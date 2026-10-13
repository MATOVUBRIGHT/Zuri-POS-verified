CREATE TABLE IF NOT EXISTS public.reseller_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  reseller_id uuid NOT NULL REFERENCES public.resellers(id) ON DELETE CASCADE,
  recorded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  amount numeric(12, 2) NOT NULL CHECK (amount > 0),
  commission_date date NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'paid')),
  paid_at timestamptz,
  paid_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reseller_commissions_paid_audit_check CHECK (
    (status = 'unpaid' AND paid_at IS NULL AND paid_by IS NULL)
    OR (status = 'paid' AND paid_at IS NOT NULL AND paid_by IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_reseller_commissions_store_reseller_date
  ON public.reseller_commissions (store_id, reseller_id, commission_date DESC, created_at DESC);

ALTER TABLE public.reseller_commissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Store users can view reseller commissions" ON public.reseller_commissions;
CREATE POLICY "Store users can view reseller commissions"
  ON public.reseller_commissions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stores
      WHERE stores.id = reseller_commissions.store_id
        AND stores.user_id = auth.uid()
    )
    OR public.has_store_access(reseller_commissions.store_id, auth.uid())
  );

DROP POLICY IF EXISTS "Store users can record reseller commissions" ON public.reseller_commissions;
CREATE POLICY "Store users can record reseller commissions"
  ON public.reseller_commissions FOR INSERT TO authenticated
  WITH CHECK (
    recorded_by = auth.uid()
    AND status = 'unpaid'
    AND paid_at IS NULL
    AND paid_by IS NULL
    AND EXISTS (
      SELECT 1 FROM public.resellers
      WHERE resellers.id = reseller_commissions.reseller_id
        AND resellers.store_id = reseller_commissions.store_id
    )
    AND (
      EXISTS (
        SELECT 1 FROM public.stores
        WHERE stores.id = reseller_commissions.store_id
          AND stores.user_id = auth.uid()
      )
      OR public.has_store_access(reseller_commissions.store_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "Store users can mark reseller commissions paid" ON public.reseller_commissions;
CREATE POLICY "Store users can mark reseller commissions paid"
  ON public.reseller_commissions FOR UPDATE TO authenticated
  USING (
    status = 'unpaid'
    AND (
      EXISTS (
        SELECT 1 FROM public.stores
        WHERE stores.id = reseller_commissions.store_id
          AND stores.user_id = auth.uid()
      )
      OR public.has_store_access(reseller_commissions.store_id, auth.uid())
    )
  )
  WITH CHECK (
    status = 'paid'
    AND paid_by = auth.uid()
    AND paid_at IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM public.stores
        WHERE stores.id = reseller_commissions.store_id
          AND stores.user_id = auth.uid()
      )
      OR public.has_store_access(reseller_commissions.store_id, auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.enforce_reseller_commission_ledger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_reseller_store_id uuid;
BEGIN
  SELECT store_id
  INTO v_reseller_store_id
  FROM public.resellers
  WHERE id = NEW.reseller_id;

  IF v_reseller_store_id IS NULL OR v_reseller_store_id <> NEW.store_id THEN
    RAISE EXCEPTION 'Commission store does not match the reseller';
  END IF;

  IF NOT (
    EXISTS (
      SELECT 1 FROM public.stores
      WHERE stores.id = NEW.store_id
        AND stores.user_id = auth.uid()
    )
    OR public.has_store_access(NEW.store_id, auth.uid())
  ) THEN
    RAISE EXCEPTION 'Not authorized to manage commissions for this store'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'unpaid' OR NEW.paid_at IS NOT NULL OR NEW.paid_by IS NOT NULL
      OR NEW.recorded_by <> auth.uid() THEN
      RAISE EXCEPTION 'New commissions must be recorded as unpaid by the current user';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status <> 'unpaid' OR NEW.status <> 'paid'
    OR NEW.id IS DISTINCT FROM OLD.id
    OR NEW.store_id IS DISTINCT FROM OLD.store_id
    OR NEW.reseller_id IS DISTINCT FROM OLD.reseller_id
    OR NEW.recorded_by IS DISTINCT FROM OLD.recorded_by
    OR NEW.amount IS DISTINCT FROM OLD.amount
    OR NEW.commission_date IS DISTINCT FROM OLD.commission_date
    OR NEW.description IS DISTINCT FROM OLD.description
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.paid_at IS NOT NULL
    OR NEW.paid_by IS NOT NULL THEN
    RAISE EXCEPTION 'A commission can only transition once from unpaid to paid';
  END IF;

  NEW.paid_at := now();
  NEW.paid_by := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_reseller_commission_ledger ON public.reseller_commissions;
CREATE TRIGGER enforce_reseller_commission_ledger
  BEFORE INSERT OR UPDATE ON public.reseller_commissions
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_reseller_commission_ledger();

REVOKE ALL ON public.reseller_commissions FROM anon;
REVOKE ALL ON public.reseller_commissions FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.reseller_commissions TO authenticated;
