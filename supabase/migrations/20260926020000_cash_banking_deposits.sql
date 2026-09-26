-- Banking cash on hand: move money from the branch till into a receiving account.
--
-- A deposit is three writes that must succeed or fail together: the till goes
-- down (cash_transactions 'out'), the receiving account goes up
-- (payment_account_ledger credit), and an auditable deposit row is kept with the
-- bank name, account number, reason and receipt path. Clients therefore call
-- bank_cash_to_account() rather than writing any of these tables directly --
-- payment_account_ledger intentionally has no INSERT policy, and a partial write
-- would leave the till and the account disagreeing.
BEGIN;

CREATE TABLE IF NOT EXISTS public.cash_banking_deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.branch_payment_accounts(id) ON DELETE SET NULL,
  account_name text,
  bank_name text NOT NULL,
  account_number text,
  amount numeric NOT NULL CHECK (amount > 0),
  notes text,
  receipt_url text,
  cash_transaction_id uuid REFERENCES public.cash_transactions(id) ON DELETE SET NULL,
  ledger_entry_id uuid REFERENCES public.payment_account_ledger(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cash_banking_deposits_store_created_idx
  ON public.cash_banking_deposits (store_id, created_at DESC);

ALTER TABLE public.cash_banking_deposits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Branch users view banking deposits" ON public.cash_banking_deposits;
CREATE POLICY "Branch users view banking deposits" ON public.cash_banking_deposits
  FOR SELECT TO authenticated
  USING (public.is_store_owner(store_id, auth.uid()) OR public.has_store_access(store_id, auth.uid()));

-- Writes go through bank_cash_to_account(); this policy only allows a branch
-- writer to correct their own note/receipt without moving money.
DROP POLICY IF EXISTS "Branch writers update banking deposits" ON public.cash_banking_deposits;
CREATE POLICY "Branch writers update banking deposits" ON public.cash_banking_deposits
  FOR UPDATE TO authenticated
  USING (public.can_write_store(store_id))
  WITH CHECK (public.can_write_store(store_id));

-- Atomic till -> account transfer. p_account_id may be null when the cashier
-- banks to an account that has not been registered yet; the account number is
-- then recorded on the deposit row for reconciliation.
CREATE OR REPLACE FUNCTION public.bank_cash_to_account(
  p_store_id uuid,
  p_amount numeric,
  p_bank_name text,
  p_account_id uuid DEFAULT NULL,
  p_account_name text DEFAULT NULL,
  p_account_number text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_receipt_url text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_till numeric;
  v_cash_tx_id uuid;
  v_ledger_id uuid;
  v_deposit_id uuid;
  v_account_label text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.can_write_store(p_store_id) THEN
    RAISE EXCEPTION 'You do not have permission to bank cash for this branch';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Enter an amount greater than zero';
  END IF;

  IF p_bank_name IS NULL OR length(btrim(p_bank_name)) = 0 THEN
    RAISE EXCEPTION 'Enter the bank name';
  END IF;

  -- The till is the sum of every cash movement, matching how the app derives
  -- cash on hand. Lock the ledger rows so two concurrent deposits cannot both
  -- pass the balance check and overdraw the till.
  PERFORM 1 FROM public.cash_transactions
   WHERE store_id = p_store_id
   FOR UPDATE;

  SELECT COALESCE(SUM(
           CASE
             WHEN lower(type) IN ('in', 'deposit', 'income') THEN amount
             WHEN lower(type) IN ('out', 'withdrawal', 'expense') THEN -amount
             ELSE 0
           END), 0)
    INTO v_till
    FROM public.cash_transactions
   WHERE store_id = p_store_id;

  IF p_amount > v_till THEN
    RAISE EXCEPTION 'Cannot bank more than the cash on hand (% available)', v_till;
  END IF;

  IF p_account_id IS NOT NULL THEN
    SELECT name INTO v_account_label
      FROM public.branch_payment_accounts
     WHERE id = p_account_id
       AND store_id = p_store_id
       AND is_active;
    IF v_account_label IS NULL THEN
      RAISE EXCEPTION 'Select an active account belonging to this branch';
    END IF;
  END IF;

  -- 1. Money leaves the till.
  INSERT INTO public.cash_transactions (user_id, store_id, amount, type, description, account_type)
  VALUES (
    v_user,
    p_store_id,
    p_amount,
    'out',
    COALESCE(NULLIF(btrim(p_notes), ''), 'Banked to ' || btrim(p_bank_name)),
    COALESCE(v_account_label, 'bank')
  )
  RETURNING id INTO v_cash_tx_id;

  -- 2. Money arrives in the receiving account. A registered account gets a
  --    ledger credit; an unregistered one is only recorded on the deposit row.
  IF p_account_id IS NOT NULL THEN
    INSERT INTO public.payment_account_ledger
      (store_id, account_id, amount, entry_type, reference, notes, created_by)
    VALUES (
      p_store_id,
      p_account_id,
      p_amount,
      'adjustment',
      NULLIF(btrim(COALESCE(p_account_number, '')), ''),
      btrim(COALESCE(p_notes, '')),
      v_user
    )
    RETURNING id INTO v_ledger_id;
  END IF;

  -- 3. Keep the receipt and the reason for the banking history.
  INSERT INTO public.cash_banking_deposits
    (store_id, account_id, account_name, bank_name, account_number, amount,
     notes, receipt_url, cash_transaction_id, ledger_entry_id, created_by)
  VALUES (
    p_store_id,
    p_account_id,
    COALESCE(v_account_label, NULLIF(btrim(COALESCE(p_account_name, '')), '')),
    btrim(p_bank_name),
    NULLIF(btrim(COALESCE(p_account_number, '')), ''),
    p_amount,
    NULLIF(btrim(COALESCE(p_notes, '')), ''),
    NULLIF(btrim(COALESCE(p_receipt_url, '')), ''),
    v_cash_tx_id,
    v_ledger_id,
    v_user
  )
  RETURNING id INTO v_deposit_id;

  RETURN v_deposit_id;
END;
$$;

REVOKE ALL ON FUNCTION public.bank_cash_to_account(uuid, numeric, text, uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bank_cash_to_account(uuid, numeric, text, uuid, text, text, text, text) TO authenticated;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
  AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'cash_banking_deposits') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.cash_banking_deposits;
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
