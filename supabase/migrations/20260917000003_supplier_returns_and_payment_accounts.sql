-- Branch payment accounts and supplier returns.  This migration deliberately
-- stores records only; it never stores provider credentials or calls a gateway.
BEGIN;

CREATE TABLE IF NOT EXISTS public.branch_payment_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  provider_type text NOT NULL CHECK (provider_type IN ('cash','bank','mobile_money','pesapal','card','other')),
  account_number text,
  reference_instructions text,
  opening_balance numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS branch_payment_accounts_store_id_idx ON public.branch_payment_accounts(store_id);

CREATE OR REPLACE FUNCTION public.set_payment_account_creator()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN NEW.created_by := auth.uid(); END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS branch_payment_accounts_set_creator ON public.branch_payment_accounts;
CREATE TRIGGER branch_payment_accounts_set_creator BEFORE INSERT OR UPDATE ON public.branch_payment_accounts
FOR EACH ROW EXECUTE FUNCTION public.set_payment_account_creator();

CREATE TABLE IF NOT EXISTS public.payment_account_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.branch_payment_accounts(id) ON DELETE RESTRICT,
  amount numeric NOT NULL CHECK (amount <> 0),
  entry_type text NOT NULL CHECK (entry_type IN ('sale','adjustment','refund')),
  sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  reference text,
  notes text,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payment_account_ledger_account_id_idx ON public.payment_account_ledger(account_id, created_at DESC);

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS payment_account_id uuid REFERENCES public.branch_payment_accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS sales_payment_account_id_idx ON public.sales(payment_account_id);

-- Only store owners and operational administrators/managers may change money
-- configuration. A linked boss/accountant remains read-only.
CREATE OR REPLACE FUNCTION public.can_write_store(_store_id uuid, _user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_store_owner(_store_id, _user_id)
    OR EXISTS (SELECT 1 FROM public.store_access sa
               WHERE sa.store_id = _store_id AND sa.user_id = _user_id
                 AND sa.role IN ('owner','admin','manager'))
$$;

ALTER TABLE public.branch_payment_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_account_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_accounts_read_scoped ON public.branch_payment_accounts;
DROP POLICY IF EXISTS payment_accounts_write_scoped ON public.branch_payment_accounts;
CREATE POLICY payment_accounts_read_scoped ON public.branch_payment_accounts FOR SELECT
  USING (public.is_store_owner(store_id, auth.uid()) OR public.has_store_access(store_id, auth.uid()));
CREATE POLICY payment_accounts_write_scoped ON public.branch_payment_accounts FOR ALL
  USING (public.can_write_store(store_id)) WITH CHECK (public.can_write_store(store_id));
DROP POLICY IF EXISTS payment_account_ledger_read_scoped ON public.payment_account_ledger;
CREATE POLICY payment_account_ledger_read_scoped ON public.payment_account_ledger FOR SELECT
  USING (public.is_store_owner(store_id, auth.uid()) OR public.has_store_access(store_id, auth.uid()));

-- One trigger is the ledger source of truth for recorded paid sales. It rejects
-- cross-branch/deactivated accounts, preventing client-side balance tampering.
CREATE OR REPLACE FUNCTION public.record_sale_to_payment_account()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE account_store uuid;
BEGIN
  IF NEW.payment_account_id IS NULL OR COALESCE(NEW.paid_in_cash, false) = false THEN RETURN NEW; END IF;
  SELECT store_id INTO account_store FROM public.branch_payment_accounts
    WHERE id = NEW.payment_account_id AND is_active = true FOR SHARE;
  IF account_store IS NULL OR account_store <> NEW.store_id THEN
    RAISE EXCEPTION 'The selected receiving account is unavailable for this branch';
  END IF;
  INSERT INTO public.payment_account_ledger (store_id, account_id, amount, entry_type, sale_id, reference, created_by)
  VALUES (NEW.store_id, NEW.payment_account_id, NEW.total_amount, 'sale', NEW.id,
          COALESCE(NEW.payment_details->>'transactionReference', NEW.id::text), NEW.user_id);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sales_payment_account_ledger ON public.sales;
CREATE TRIGGER sales_payment_account_ledger AFTER INSERT ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.record_sale_to_payment_account();

CREATE OR REPLACE FUNCTION public.record_payment_account_adjustment(
  p_account_id uuid, p_amount numeric, p_entry_type text, p_reference text DEFAULT NULL, p_notes text DEFAULT NULL)
RETURNS public.payment_account_ledger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.branch_payment_accounts; result public.payment_account_ledger;
BEGIN
  SELECT * INTO a FROM public.branch_payment_accounts WHERE id = p_account_id FOR UPDATE;
  IF a.id IS NULL OR NOT public.can_write_store(a.store_id) THEN RAISE EXCEPTION 'Not authorised for this branch account'; END IF;
  IF p_amount = 0 OR p_entry_type NOT IN ('adjustment','refund') THEN RAISE EXCEPTION 'Invalid account adjustment'; END IF;
  INSERT INTO public.payment_account_ledger(store_id, account_id, amount, entry_type, reference, notes, created_by)
  VALUES (a.store_id, a.id, p_amount, p_entry_type, NULLIF(btrim(p_reference), ''), NULLIF(btrim(p_notes), ''), auth.uid()) RETURNING * INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.record_payment_account_adjustment(uuid,numeric,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_payment_account_adjustment(uuid,numeric,text,text,text) TO authenticated;

CREATE TABLE IF NOT EXISTS public.supplier_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  inventory_id uuid NOT NULL REFERENCES public.inventory(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_credit numeric NOT NULL CHECK (unit_credit >= 0),
  credit_amount numeric NOT NULL CHECK (credit_amount >= 0),
  supplier_credit_amount numeric NOT NULL DEFAULT 0 CHECK (supplier_credit_amount >= 0),
  reason text,
  reference text,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS supplier_returns_store_id_idx ON public.supplier_returns(store_id, created_at DESC);
ALTER TABLE public.supplier_returns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS supplier_returns_read_scoped ON public.supplier_returns;
CREATE POLICY supplier_returns_read_scoped ON public.supplier_returns FOR SELECT
  USING (public.is_store_owner(store_id, auth.uid()) OR public.has_store_access(store_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.return_inventory_to_supplier(
  p_supplier_id uuid, p_inventory_id uuid, p_quantity integer, p_unit_credit numeric,
  p_reason text DEFAULT NULL, p_reference text DEFAULT NULL)
RETURNS public.supplier_returns LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv public.inventory; supp public.suppliers; credit numeric; excess numeric; result public.supplier_returns;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 OR p_unit_credit IS NULL OR p_unit_credit < 0 THEN RAISE EXCEPTION 'Quantity and unit credit must be valid'; END IF;
  SELECT * INTO inv FROM public.inventory WHERE id = p_inventory_id FOR UPDATE;
  IF inv.id IS NULL OR NOT public.can_write_store(inv.store_id) THEN RAISE EXCEPTION 'Not authorised to return stock from this branch'; END IF;
  IF inv.quantity < p_quantity THEN RAISE EXCEPTION 'Only % unit(s) are available to return', inv.quantity; END IF;
  SELECT * INTO supp FROM public.suppliers WHERE id = p_supplier_id AND store_id = inv.store_id FOR UPDATE;
  IF supp.id IS NULL OR (inv.supplier_id IS NOT NULL AND inv.supplier_id <> p_supplier_id) THEN RAISE EXCEPTION 'Supplier and inventory item must belong to the same branch'; END IF;
  credit := p_quantity * p_unit_credit;
  excess := GREATEST(0, credit - COALESCE(supp.outstanding_balance, 0));
  UPDATE public.inventory SET quantity = quantity - p_quantity,
    total_value = GREATEST(0, COALESCE(total_value, 0) - (p_quantity * COALESCE(cost_per_unit, 0))) WHERE id = inv.id;
  UPDATE public.suppliers SET outstanding_balance = GREATEST(0, COALESCE(outstanding_balance, 0) - credit), updated_at = now() WHERE id = supp.id;
  INSERT INTO public.supplier_returns(store_id,supplier_id,inventory_id,quantity,unit_credit,credit_amount,supplier_credit_amount,reason,reference,created_by)
  VALUES(inv.store_id,supp.id,inv.id,p_quantity,p_unit_credit,credit,excess,NULLIF(btrim(p_reason),''),NULLIF(btrim(p_reference),''),auth.uid()) RETURNING * INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.return_inventory_to_supplier(uuid,uuid,integer,numeric,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.return_inventory_to_supplier(uuid,uuid,integer,numeric,text,text) TO authenticated;
COMMIT;
