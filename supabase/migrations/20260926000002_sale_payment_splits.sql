CREATE TABLE IF NOT EXISTS public.sale_payment_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.branch_payment_accounts(id) ON DELETE RESTRICT,
  amount numeric NOT NULL CHECK (amount > 0),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sale_payment_splits_sale_id_idx ON public.sale_payment_splits(sale_id);
ALTER TABLE public.sale_payment_splits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sale_payment_splits_read_scoped ON public.sale_payment_splits;
CREATE POLICY sale_payment_splits_read_scoped ON public.sale_payment_splits FOR SELECT
  USING (public.is_store_owner(store_id, auth.uid()) OR public.has_store_access(store_id, auth.uid()));
DROP POLICY IF EXISTS sale_payment_splits_insert_scoped ON public.sale_payment_splits;
CREATE POLICY sale_payment_splits_insert_scoped ON public.sale_payment_splits FOR INSERT
  WITH CHECK (public.is_store_owner(store_id, auth.uid()) OR public.has_store_access(store_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.record_sale_payment_split()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE sale_store uuid; account_store uuid;
BEGIN
  SELECT store_id INTO sale_store FROM public.sales WHERE id = NEW.sale_id;
  SELECT store_id INTO account_store FROM public.branch_payment_accounts WHERE id = NEW.account_id AND is_active = true;
  IF sale_store IS NULL OR account_store IS NULL OR sale_store <> NEW.store_id OR account_store <> NEW.store_id THEN
    RAISE EXCEPTION 'Invalid account or sale branch for payment split';
  END IF;
  INSERT INTO public.payment_account_ledger (store_id, account_id, amount, entry_type, sale_id, reference, created_by)
  VALUES (NEW.store_id, NEW.account_id, NEW.amount, 'sale', NEW.sale_id, NEW.sale_id::text, NEW.created_by);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sale_payment_splits_ledger ON public.sale_payment_splits;
CREATE TRIGGER sale_payment_splits_ledger AFTER INSERT ON public.sale_payment_splits
FOR EACH ROW EXECUTE FUNCTION public.record_sale_payment_split();
