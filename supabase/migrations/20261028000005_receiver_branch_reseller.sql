BEGIN;

-- A receiving branch is also a reseller/customer of the sending branch. Keep
-- the branch link separate from the display name so the branch can still be
-- renamed without losing the relationship.
ALTER TABLE public.resellers
  ADD COLUMN IF NOT EXISTS reseller_branch_store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reseller_branch_country text;

CREATE INDEX IF NOT EXISTS resellers_branch_store_idx
  ON public.resellers (store_id, reseller_branch_store_id);

CREATE OR REPLACE FUNCTION public.ensure_receiver_branch_reseller(p_request_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.stock_transfer_requests%ROWTYPE;
  v_receiver public.stores%ROWTYPE;
  v_sender_owner uuid;
  v_reseller_id uuid;
  v_name text;
  v_country text;
BEGIN
  SELECT * INTO v_request
  FROM public.stock_transfer_requests
  WHERE id = p_request_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT * INTO v_receiver FROM public.stores WHERE id = v_request.to_store_id;
  SELECT user_id INTO v_sender_owner FROM public.stores WHERE id = v_request.from_store_id;
  IF v_receiver.id IS NULL OR v_sender_owner IS NULL THEN RETURN NULL; END IF;

  v_name := COALESCE(NULLIF(btrim(v_receiver.store_name), ''), 'Receiving branch');
  v_country := COALESCE(NULLIF(btrim(v_receiver.country_of_origin), ''), 'Uganda');

  SELECT id INTO v_reseller_id
  FROM public.resellers
  WHERE store_id = v_request.from_store_id
    AND reseller_branch_store_id = v_receiver.id
  ORDER BY created_at
  LIMIT 1;

  IF v_reseller_id IS NULL THEN
    INSERT INTO public.resellers (
      store_id, created_by, name, business_name, notes, status,
      is_application, reseller_branch_store_id, reseller_branch_country
    )
    VALUES (
      v_request.from_store_id,
      COALESCE(v_request.created_by, v_sender_owner),
      v_name,
      v_name,
      format('Receiving branch reseller created from stock transfer %s.', v_request.id),
      'active',
      false,
      v_receiver.id,
      v_country
    )
    RETURNING id INTO v_reseller_id;
  ELSE
    UPDATE public.resellers
    SET name = v_name,
        business_name = COALESCE(business_name, v_name),
        reseller_branch_country = v_country,
        updated_at = now()
    WHERE id = v_reseller_id;
  END IF;

  RETURN v_reseller_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_receiver_branch_reseller_on_transfer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved') THEN
    PERFORM public.ensure_receiver_branch_reseller(NEW.request_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_receiver_branch_reseller_trigger ON public.stock_transfer_items;
CREATE TRIGGER ensure_receiver_branch_reseller_trigger
AFTER UPDATE OF status ON public.stock_transfer_items
FOR EACH ROW
EXECUTE FUNCTION public.ensure_receiver_branch_reseller_on_transfer();

REVOKE ALL ON FUNCTION public.ensure_receiver_branch_reseller(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_receiver_branch_reseller_on_transfer() FROM PUBLIC, anon, authenticated;

-- Backfill approved transfers created before this migration.
DO $$
DECLARE
  v_request_id uuid;
BEGIN
  FOR v_request_id IN
    SELECT DISTINCT request_id
    FROM public.stock_transfer_items
    WHERE status = 'approved'
  LOOP
    PERFORM public.ensure_receiver_branch_reseller(v_request_id);
  END LOOP;
END;
$$;

COMMIT;
