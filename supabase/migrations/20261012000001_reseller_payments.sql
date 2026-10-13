CREATE TABLE IF NOT EXISTS public.reseller_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  reseller_id uuid NOT NULL REFERENCES public.resellers(id) ON DELETE CASCADE,
  recorded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  amount numeric(12, 2) NOT NULL CHECK (amount > 0),
  payment_method text NOT NULL DEFAULT 'Cash'
    CHECK (payment_method IN ('Cash', 'Bank Transfer', 'Mobile Money', 'Cheque', 'Other')),
  paid_at date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reseller_payments_store_reseller_paid_at
  ON public.reseller_payments (store_id, reseller_id, paid_at DESC, created_at DESC);

ALTER TABLE public.reseller_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Store users can view reseller payments" ON public.reseller_payments;
CREATE POLICY "Store users can view reseller payments"
  ON public.reseller_payments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stores
      WHERE stores.id = reseller_payments.store_id
        AND stores.user_id = auth.uid()
    )
    OR public.has_store_access(reseller_payments.store_id, auth.uid())
  );

DROP POLICY IF EXISTS "Store users can record reseller payments" ON public.reseller_payments;
CREATE POLICY "Store users can record reseller payments"
  ON public.reseller_payments FOR INSERT TO authenticated
  WITH CHECK (
    recorded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.resellers
      WHERE resellers.id = reseller_payments.reseller_id
        AND resellers.store_id = reseller_payments.store_id
    )
    AND (
      EXISTS (
        SELECT 1 FROM public.stores
        WHERE stores.id = reseller_payments.store_id
          AND stores.user_id = auth.uid()
      )
      OR public.has_store_access(reseller_payments.store_id, auth.uid())
    )
  );

REVOKE ALL ON public.reseller_payments FROM anon;
REVOKE ALL ON public.reseller_payments FROM authenticated;
GRANT SELECT, INSERT ON public.reseller_payments TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_reseller_payment_balance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_reseller_store_id uuid;
  v_unpaid_sales numeric;
  v_existing_payments numeric;
BEGIN
  SELECT store_id
  INTO v_reseller_store_id
  FROM public.resellers
  WHERE id = NEW.reseller_id;

  IF v_reseller_store_id IS NULL OR v_reseller_store_id <> NEW.store_id THEN
    RAISE EXCEPTION 'Payment store does not match the reseller';
  END IF;

  IF NOT (
    EXISTS (
      SELECT 1 FROM public.stores
      WHERE stores.id = NEW.store_id
        AND stores.user_id = auth.uid()
    )
    OR public.has_store_access(NEW.store_id, auth.uid())
  ) THEN
    RAISE EXCEPTION 'Not authorized to record payments for this store'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.reseller_id::text, 0));

  SELECT store_id
  INTO v_reseller_store_id
  FROM public.resellers
  WHERE id = NEW.reseller_id;

  IF v_reseller_store_id IS NULL OR v_reseller_store_id <> NEW.store_id THEN
    RAISE EXCEPTION 'Payment store does not match the reseller';
  END IF;

  SELECT COALESCE(SUM(total_amount), 0)
  INTO v_unpaid_sales
  FROM public.sales
  WHERE reseller_id = NEW.reseller_id
    AND store_id = NEW.store_id
    AND paid_in_cash IS DISTINCT FROM TRUE;

  SELECT COALESCE(SUM(amount), 0)
  INTO v_existing_payments
  FROM public.reseller_payments
  WHERE reseller_id = NEW.reseller_id
    AND store_id = NEW.store_id;

  IF NEW.amount > GREATEST(v_unpaid_sales - v_existing_payments, 0) + 0.005 THEN
    RAISE EXCEPTION 'Payment exceeds the reseller outstanding balance';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_reseller_payment_balance ON public.reseller_payments;
CREATE TRIGGER enforce_reseller_payment_balance
  BEFORE INSERT ON public.reseller_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_reseller_payment_balance();
