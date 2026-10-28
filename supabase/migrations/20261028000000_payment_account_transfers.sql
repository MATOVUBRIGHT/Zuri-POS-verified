BEGIN;

-- Transfers are represented as two signed ledger entries so the existing
-- balance function remains the single source of truth.
ALTER TABLE public.payment_account_ledger
  DROP CONSTRAINT IF EXISTS payment_account_ledger_entry_type_check;
ALTER TABLE public.payment_account_ledger
  ADD CONSTRAINT payment_account_ledger_entry_type_check
  CHECK (entry_type IN ('sale', 'adjustment', 'refund', 'transfer_in', 'transfer_out'));

CREATE TABLE IF NOT EXISTS public.payment_account_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  from_account_id uuid NOT NULL REFERENCES public.branch_payment_accounts(id) ON DELETE RESTRICT,
  to_account_id uuid NOT NULL REFERENCES public.branch_payment_accounts(id) ON DELETE RESTRICT,
  amount numeric NOT NULL CHECK (amount > 0),
  reference text,
  notes text,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_account_transfers_different_accounts CHECK (from_account_id <> to_account_id)
);
CREATE INDEX IF NOT EXISTS payment_account_transfers_store_created_idx
  ON public.payment_account_transfers(store_id, created_at DESC);

ALTER TABLE public.payment_account_ledger
  ADD COLUMN IF NOT EXISTS transfer_id uuid REFERENCES public.payment_account_transfers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS payment_account_ledger_transfer_id_idx
  ON public.payment_account_ledger(transfer_id);

-- The banking flow already debits the legacy cash_transactions till and
-- credits the selected receiving account. Mirror that outgoing movement into
-- the configured Cash account so the account balance and POS cash-on-hand stay
-- consistent after a deposit as well. Older branches without a Cash account
-- continue using the legacy till fallback.
CREATE OR REPLACE FUNCTION public.record_banking_deposit_from_cash_account()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cash_account public.branch_payment_accounts;
BEGIN
  SELECT * INTO cash_account
  FROM public.branch_payment_accounts
  WHERE store_id = NEW.store_id AND is_active = true AND provider_type = 'cash'
  ORDER BY created_at, id
  LIMIT 1;

  IF cash_account.id IS NOT NULL AND cash_account.id <> NEW.account_id THEN
    INSERT INTO public.payment_account_ledger
      (store_id, account_id, amount, entry_type, reference, notes, created_by)
    VALUES
      (NEW.store_id, cash_account.id, -NEW.amount, 'transfer_out',
       COALESCE(NEW.id::text, 'banking-deposit'),
       'Cash banked to ' || COALESCE(NEW.account_name, NEW.bank_name), NEW.created_by);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS cash_banking_deposit_account_ledger ON public.cash_banking_deposits;
CREATE TRIGGER cash_banking_deposit_account_ledger
AFTER INSERT ON public.cash_banking_deposits
FOR EACH ROW EXECUTE FUNCTION public.record_banking_deposit_from_cash_account();

-- A returned paid sale must remove the refunded amount from the account that
-- received the original sale. This keeps account balances aligned with the
-- reduced sale total and the cash refund recorded by the return screen.
CREATE OR REPLACE FUNCTION public.record_sale_return_to_payment_account()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE original_sale public.sales;
BEGIN
  IF NEW.sale_id IS NULL OR COALESCE(NEW.total_amount, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT * INTO original_sale FROM public.sales WHERE id = NEW.sale_id;
  IF original_sale.payment_account_id IS NOT NULL THEN
    INSERT INTO public.payment_account_ledger
      (store_id, account_id, amount, entry_type, reference, notes, created_by)
    VALUES
      (NEW.store_id, original_sale.payment_account_id, -NEW.total_amount, 'refund',
       NEW.id::text, 'Refund for returned sale', NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS sale_return_payment_account_ledger ON public.sale_returns;
CREATE TRIGGER sale_return_payment_account_ledger
AFTER INSERT ON public.sale_returns
FOR EACH ROW EXECUTE FUNCTION public.record_sale_return_to_payment_account();

ALTER TABLE public.payment_account_transfers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_account_transfers_read_scoped ON public.payment_account_transfers;
CREATE POLICY payment_account_transfers_read_scoped ON public.payment_account_transfers FOR SELECT
  USING (public.is_store_owner(store_id, auth.uid()) OR public.has_store_access(store_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.transfer_payment_account_funds(
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_amount numeric,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS public.payment_account_transfers
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  source_account public.branch_payment_accounts;
  target_account public.branch_payment_accounts;
  transfer public.payment_account_transfers;
  current_source_balance numeric;
  first_id uuid;
  second_id uuid;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Transfer amount must be greater than zero';
  END IF;
  IF p_from_account_id IS NULL OR p_to_account_id IS NULL OR p_from_account_id = p_to_account_id THEN
    RAISE EXCEPTION 'Choose two different accounts';
  END IF;

  first_id := LEAST(p_from_account_id, p_to_account_id);
  second_id := GREATEST(p_from_account_id, p_to_account_id);
  PERFORM 1 FROM public.branch_payment_accounts WHERE id = first_id FOR UPDATE;
  PERFORM 1 FROM public.branch_payment_accounts WHERE id = second_id FOR UPDATE;

  SELECT * INTO source_account
  FROM public.branch_payment_accounts
  WHERE id = p_from_account_id AND is_active = true;
  SELECT * INTO target_account
  FROM public.branch_payment_accounts
  WHERE id = p_to_account_id AND is_active = true;

  IF source_account.id IS NULL OR target_account.id IS NULL
     OR source_account.store_id <> target_account.store_id
     OR NOT public.can_write_store(source_account.store_id) THEN
    RAISE EXCEPTION 'Both accounts must be active accounts in a branch you can manage';
  END IF;

  SELECT source_account.opening_balance + COALESCE(SUM(l.amount), 0)
    INTO current_source_balance
  FROM public.payment_account_ledger l
  WHERE l.account_id = source_account.id;
  IF current_source_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance in % (available %)', source_account.name, current_source_balance;
  END IF;

  INSERT INTO public.payment_account_transfers
    (store_id, from_account_id, to_account_id, amount, reference, notes, created_by)
  VALUES
    (source_account.store_id, source_account.id, target_account.id, p_amount,
     NULLIF(btrim(p_reference), ''), NULLIF(btrim(p_notes), ''), auth.uid())
  RETURNING * INTO transfer;

  INSERT INTO public.payment_account_ledger
    (store_id, account_id, amount, entry_type, transfer_id, reference, notes, created_by)
  VALUES
    (source_account.store_id, source_account.id, -p_amount, 'transfer_out', transfer.id,
     COALESCE(NULLIF(btrim(p_reference), ''), transfer.id::text),
     COALESCE(NULLIF(btrim(p_notes), ''), 'Transfer to ' || target_account.name), auth.uid()),
    (target_account.store_id, target_account.id, p_amount, 'transfer_in', transfer.id,
     COALESCE(NULLIF(btrim(p_reference), ''), transfer.id::text),
     COALESCE(NULLIF(btrim(p_notes), ''), 'Transfer from ' || source_account.name), auth.uid());

  RETURN transfer;
END;
$$;
REVOKE ALL ON FUNCTION public.transfer_payment_account_funds(uuid, uuid, numeric, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_payment_account_funds(uuid, uuid, numeric, text, text) TO authenticated;

COMMIT;
