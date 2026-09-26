-- Make payment-account balances and account configuration audit-safe.
BEGIN;

-- Balances are calculated in PostgreSQL over the complete ledger. The client
-- intentionally loads only the most recent activity rows for display.
CREATE OR REPLACE FUNCTION public.get_payment_account_balances(p_store_id uuid)
RETURNS TABLE(account_id uuid, available_balance numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id,
         a.opening_balance + COALESCE(SUM(l.amount), 0) AS available_balance
  FROM public.branch_payment_accounts a
  LEFT JOIN public.payment_account_ledger l ON l.account_id = a.id
  WHERE a.store_id = p_store_id
    AND (public.is_store_owner(p_store_id, auth.uid()) OR public.has_store_access(p_store_id, auth.uid()))
  GROUP BY a.id, a.opening_balance
$$;
REVOKE ALL ON FUNCTION public.get_payment_account_balances(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_payment_account_balances(uuid) TO authenticated;

-- Accounts never move between branches, and the opening figure is a creation
-- record rather than a mutable balance. Corrections must use the ledger RPC.
CREATE OR REPLACE FUNCTION public.protect_payment_account_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.store_id IS DISTINCT FROM OLD.store_id THEN
    RAISE EXCEPTION 'A receiving account cannot be moved to another branch';
  END IF;
  IF NEW.opening_balance IS DISTINCT FROM OLD.opening_balance THEN
    RAISE EXCEPTION 'Opening balance is immutable; record an account adjustment instead';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS branch_payment_accounts_protect_history ON public.branch_payment_accounts;
CREATE TRIGGER branch_payment_accounts_protect_history
BEFORE UPDATE ON public.branch_payment_accounts
FOR EACH ROW EXECUTE FUNCTION public.protect_payment_account_history();

-- When a branch has configured active receiving accounts, every paid sale must
-- name one explicitly. Credit sales remain account-free by design.
CREATE OR REPLACE FUNCTION public.require_payment_account_for_paid_sale()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(NEW.paid_in_cash, false)
     AND NEW.payment_account_id IS NULL
     AND EXISTS (SELECT 1 FROM public.branch_payment_accounts a WHERE a.store_id = NEW.store_id AND a.is_active) THEN
    RAISE EXCEPTION 'Select the branch receiving account for this paid sale';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sales_require_payment_account ON public.sales;
CREATE TRIGGER sales_require_payment_account
BEFORE INSERT ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.require_payment_account_for_paid_sale();

COMMIT;
