BEGIN;

-- Keep the original cost_per_unit column for compatibility with existing
-- callers, while recording both sides of a cross-currency transfer.
ALTER TABLE public.stock_transfer_items
  ADD COLUMN IF NOT EXISTS received_amount numeric,
  ADD COLUMN IF NOT EXISTS received_currency text,
  ADD COLUMN IF NOT EXISTS branch_amount numeric,
  ADD COLUMN IF NOT EXISTS branch_currency text,
  ADD COLUMN IF NOT EXISTS exchange_rate numeric,
  ADD COLUMN IF NOT EXISTS exchange_rate_source text,
  ADD COLUMN IF NOT EXISTS reviewed_retail_price numeric,
  ADD COLUMN IF NOT EXISTS reviewed_wholesale_price numeric,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

ALTER TABLE public.stock_transfer_items
  DROP CONSTRAINT IF EXISTS stock_transfer_items_received_amount_check,
  DROP CONSTRAINT IF EXISTS stock_transfer_items_branch_amount_check,
  DROP CONSTRAINT IF EXISTS stock_transfer_items_exchange_rate_check,
  ADD CONSTRAINT stock_transfer_items_received_amount_check
    CHECK (received_amount IS NULL OR received_amount >= 0),
  ADD CONSTRAINT stock_transfer_items_branch_amount_check
    CHECK (branch_amount IS NULL OR branch_amount >= 0),
  ADD CONSTRAINT stock_transfer_items_exchange_rate_check
    CHECK (exchange_rate IS NULL OR exchange_rate > 0),
  ADD CONSTRAINT stock_transfer_items_reviewed_retail_price_check
    CHECK (reviewed_retail_price IS NULL OR reviewed_retail_price >= 0),
  ADD CONSTRAINT stock_transfer_items_reviewed_wholesale_price_check
    CHECK (reviewed_wholesale_price IS NULL OR reviewed_wholesale_price >= 0);

-- Backfill historical rows without inventing a conversion. New approvals must
-- provide a rate when the source and destination currencies differ.
UPDATE public.stock_transfer_items i
SET received_amount = COALESCE(i.received_amount, i.cost_per_unit),
    received_currency = COALESCE(i.received_currency, UPPER(COALESCE(source_store.currency, 'UGX'))),
    branch_currency = COALESCE(i.branch_currency, UPPER(COALESCE(destination_store.currency, 'UGX'))),
    branch_amount = COALESCE(i.branch_amount, i.cost_per_unit),
    exchange_rate = COALESCE(i.exchange_rate, 1),
    exchange_rate_source = COALESCE(i.exchange_rate_source, 'legacy')
FROM public.stock_transfer_requests r
JOIN public.stores source_store ON source_store.id = r.from_store_id
JOIN public.stores destination_store ON destination_store.id = r.to_store_id
WHERE i.request_id = r.id;

CREATE INDEX IF NOT EXISTS stock_transfer_items_review_status_idx
  ON public.stock_transfer_items (request_id, status, reviewed_at DESC);

-- Populate the received side as soon as a request is created. The receiving
-- RPC recalculates these values from the current branch currencies before it
-- approves an item, so a later currency-setting change cannot be trusted from
-- client-supplied data.
CREATE OR REPLACE FUNCTION public.populate_stock_transfer_item_currency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from_currency text;
  v_to_currency text;
BEGIN
  SELECT UPPER(COALESCE(s.currency, 'UGX')) INTO v_from_currency
  FROM public.stock_transfer_requests r
  JOIN public.stores s ON s.id = r.from_store_id
  WHERE r.id = NEW.request_id;
  SELECT UPPER(COALESCE(s.currency, 'UGX')) INTO v_to_currency
  FROM public.stock_transfer_requests r
  JOIN public.stores s ON s.id = r.to_store_id
  WHERE r.id = NEW.request_id;

  NEW.received_amount := COALESCE(NEW.received_amount, NEW.cost_per_unit);
  NEW.received_currency := COALESCE(NEW.received_currency, v_from_currency);
  NEW.branch_currency := COALESCE(NEW.branch_currency, v_to_currency);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS populate_stock_transfer_item_currency_trigger
  ON public.stock_transfer_items;
CREATE TRIGGER populate_stock_transfer_item_currency_trigger
BEFORE INSERT ON public.stock_transfer_items
FOR EACH ROW
EXECUTE FUNCTION public.populate_stock_transfer_item_currency();
REVOKE ALL ON FUNCTION public.populate_stock_transfer_item_currency() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.review_stock_transfer_item(
  p_item_id uuid,
  p_decision text,
  p_retail_price numeric DEFAULT NULL,
  p_wholesale_price numeric DEFAULT NULL,
  p_exchange_rate numeric DEFAULT 1,
  p_rate_source text DEFAULT 'custom'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_item public.stock_transfer_items%ROWTYPE;
  v_request public.stock_transfer_requests%ROWTYPE;
  v_source public.inventory%ROWTYPE;
  v_destination public.inventory%ROWTYPE;
  v_source_store public.stores%ROWTYPE;
  v_destination_store public.stores%ROWTYPE;
  v_destination_owner uuid;
  v_received_amount numeric;
  v_branch_amount numeric;
  v_rate numeric;
  v_source_currency text;
  v_destination_currency text;
  v_new_quantity numeric;
  v_sellable numeric;
  v_items_per_pack numeric;
  v_identity_key text;
  v_pending integer;
  v_approved integer;
  v_rejected integer;
  v_summary text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to receive a stock transfer';
  END IF;
  IF lower(p_decision) NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Decision must be approved or rejected';
  END IF;

  SELECT * INTO v_item
  FROM public.stock_transfer_items
  WHERE id = p_item_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer item not found';
  END IF;

  SELECT * INTO v_request
  FROM public.stock_transfer_requests
  WHERE id = v_item.request_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer request not found';
  END IF;

  IF NOT public.can_manage_stock_transfer_store(v_request.to_store_id) THEN
    RAISE EXCEPTION 'You need owner, admin, or manager access to the receiving branch';
  END IF;

  SELECT * INTO v_source_store FROM public.stores WHERE id = v_request.from_store_id;
  SELECT * INTO v_destination_store FROM public.stores WHERE id = v_request.to_store_id;
  IF v_source_store.id IS NULL OR v_destination_store.id IS NULL THEN
    RAISE EXCEPTION 'The sending or receiving branch could not be found';
  END IF;
  IF v_source_store.user_id <> v_destination_store.user_id THEN
    RAISE EXCEPTION 'The sending and receiving branches no longer belong to the same business';
  END IF;

  -- Locking the item and request above makes retries deterministic and keeps
  -- inventory changes and review metadata in one transaction.
  IF v_item.status <> 'pending' THEN
    IF v_item.status = lower(p_decision) THEN
      RETURN v_item.status;
    END IF;
    RAISE EXCEPTION 'This item has already been %', v_item.status;
  END IF;

  IF lower(p_decision) = 'rejected' THEN
    UPDATE public.stock_transfer_items
    SET status = 'rejected', reviewed_by = v_user_id, reviewed_at = now(),
        decided_by = v_user_id, decided_at = now()
    WHERE id = v_item.id;
  ELSE
    IF p_retail_price IS NULL OR p_wholesale_price IS NULL
      OR p_retail_price < 0 OR p_wholesale_price < 0 THEN
      RAISE EXCEPTION 'Retail and wholesale prices are required and cannot be negative';
    END IF;

    v_source_currency := UPPER(COALESCE(v_source_store.currency, 'UGX'));
    v_destination_currency := UPPER(COALESCE(v_destination_store.currency, 'UGX'));
    v_received_amount := COALESCE(v_item.received_amount, v_item.cost_per_unit, 0);

    IF v_source_currency <> v_destination_currency THEN
      IF p_exchange_rate IS NULL OR p_exchange_rate <= 0 THEN
        RAISE EXCEPTION 'A positive exchange rate is required when currencies differ';
      END IF;
      IF lower(COALESCE(p_rate_source, '')) NOT IN ('custom', 'online') THEN
        RAISE EXCEPTION 'Rate source must be custom or online when currencies differ';
      END IF;
      v_rate := p_exchange_rate;
    ELSE
      IF p_exchange_rate IS NOT NULL AND p_exchange_rate <= 0 THEN
        RAISE EXCEPTION 'Exchange rate must be positive';
      END IF;
      v_rate := COALESCE(p_exchange_rate, 1);
    END IF;
    v_branch_amount := v_received_amount * v_rate;

    SELECT * INTO v_source
    FROM public.inventory
    WHERE id = v_item.source_inventory_id
      AND store_id = v_request.from_store_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The source inventory record no longer exists';
    END IF;

    v_sellable := greatest(coalesce(v_source.quantity, 0) - coalesce(v_source.damaged_quantity, 0), 0);
    IF v_sellable < v_item.quantity THEN
      RAISE EXCEPTION 'STOCK_TRANSFER_INSUFFICIENT: % has % sellable units, but % were requested',
        v_item.product_name, v_sellable, v_item.quantity;
    END IF;

    v_new_quantity := coalesce(v_source.quantity, 0) - v_item.quantity;
    v_items_per_pack := greatest(coalesce(v_source.items_per_sachet, 1), 1);
    UPDATE public.inventory
    SET quantity = v_new_quantity,
        total_value = v_new_quantity * coalesce(v_source.cost_per_unit, 0),
        sachets_count = floor(v_new_quantity / v_items_per_pack),
        loose_items = mod(v_new_quantity, v_items_per_pack),
        opened_sachets = least(coalesce(v_source.opened_sachets, 0), floor(v_new_quantity / v_items_per_pack))
    WHERE id = v_source.id;

    SELECT s.user_id INTO v_destination_owner
    FROM public.stores s
    WHERE s.id = v_request.to_store_id;

    v_identity_key := CASE
      WHEN nullif(btrim(v_source.barcode), '') IS NOT NULL
        THEN 'barcode:' || lower(btrim(v_source.barcode))
      ELSE 'product:' || lower(btrim(v_source.product_name)) || ':' ||
        lower(btrim(coalesce(v_source.category, ''))) || ':' ||
        lower(btrim(coalesce(v_source.size, '')))
    END;
    PERFORM pg_advisory_xact_lock(hashtext(v_request.to_store_id::text || ':' || v_identity_key)::bigint);

    IF nullif(btrim(v_source.barcode), '') IS NOT NULL THEN
      SELECT * INTO v_destination
      FROM public.inventory
      WHERE store_id = v_request.to_store_id AND barcode = v_source.barcode
      ORDER BY id LIMIT 1 FOR UPDATE;
    ELSE
      SELECT * INTO v_destination
      FROM public.inventory
      WHERE store_id = v_request.to_store_id
        AND lower(btrim(product_name)) = lower(btrim(v_source.product_name))
        AND lower(btrim(coalesce(category, ''))) = lower(btrim(coalesce(v_source.category, '')))
        AND lower(btrim(coalesce(size, ''))) = lower(btrim(coalesce(v_source.size, '')))
      ORDER BY id LIMIT 1 FOR UPDATE;
    END IF;

    IF FOUND THEN
      v_new_quantity := coalesce(v_destination.quantity, 0) + v_item.quantity;
      v_items_per_pack := greatest(coalesce(v_destination.items_per_sachet, v_source.items_per_sachet, 1), 1);
      UPDATE public.inventory
      SET quantity = v_new_quantity,
          total_value = coalesce(v_destination.total_value, 0) + v_item.quantity * v_branch_amount,
          cost_per_unit = CASE WHEN v_new_quantity > 0
            THEN (coalesce(v_destination.total_value, 0) + v_item.quantity * v_branch_amount) / v_new_quantity
            ELSE v_branch_amount END,
          retail_price = p_retail_price,
          wholesale_price = p_wholesale_price,
          sachets_count = floor(v_new_quantity / v_items_per_pack),
          loose_items = mod(v_new_quantity, v_items_per_pack),
          opened_sachets = least(coalesce(v_destination.opened_sachets, 0), floor(v_new_quantity / v_items_per_pack))
      WHERE id = v_destination.id;
    ELSE
      v_items_per_pack := greatest(coalesce(v_source.items_per_sachet, 1), 1);
      INSERT INTO public.inventory (
        store_id, user_id, product_name, category, size, barcode, barcode_type, barcode_mode,
        quantity, cost_per_unit, total_value, date_of_purchase, retail_price, wholesale_price,
        loose_item_price, items_per_sachet, sachets_count, opened_sachets, loose_items,
        unit_name, packaging_type, product_image, notes, min_stock_level, reorder_quantity,
        supplier_id, supplier_name
      )
      VALUES (
        v_request.to_store_id, v_destination_owner, v_source.product_name, v_source.category,
        v_source.size, nullif(btrim(v_source.barcode), ''), v_source.barcode_type, v_source.barcode_mode,
        v_item.quantity, v_branch_amount, v_item.quantity * v_branch_amount, current_date,
        p_retail_price, p_wholesale_price, v_source.loose_item_price, v_items_per_pack,
        floor(v_item.quantity / v_items_per_pack), 0, mod(v_item.quantity, v_items_per_pack),
        v_source.unit_name, v_source.packaging_type, v_source.product_image, v_source.notes,
        0, 0, NULL, NULL
      );
    END IF;

    UPDATE public.stock_transfer_items
    SET status = 'approved',
        cost_per_unit = v_branch_amount,
        received_amount = v_received_amount,
        received_currency = v_source_currency,
        branch_amount = v_branch_amount,
        branch_currency = v_destination_currency,
        exchange_rate = v_rate,
        exchange_rate_source = CASE
          WHEN v_source_currency = v_destination_currency THEN COALESCE(lower(p_rate_source), 'same_currency')
          ELSE lower(p_rate_source)
        END,
        reviewed_retail_price = p_retail_price,
        reviewed_wholesale_price = p_wholesale_price,
        reviewed_by = v_user_id,
        reviewed_at = now(),
        decided_by = v_user_id,
        decided_at = now()
    WHERE id = v_item.id;
  END IF;

  SELECT count(*) FILTER (WHERE status = 'pending'),
         count(*) FILTER (WHERE status = 'approved'),
         count(*) FILTER (WHERE status = 'rejected')
  INTO v_pending, v_approved, v_rejected
  FROM public.stock_transfer_items
  WHERE request_id = v_request.id;

  v_summary := CASE
    WHEN v_pending > 0 AND v_approved = 0 AND v_rejected = 0 THEN 'pending'
    WHEN v_pending > 0 THEN 'partial'
    WHEN v_approved > 0 THEN 'completed'
    ELSE 'rejected'
  END;
  UPDATE public.stock_transfer_requests
  SET status = v_summary, updated_at = now()
  WHERE id = v_request.id;

  RETURN lower(p_decision);
END;
$$;

-- Preserve the existing signature for older clients. It delegates to the
-- reviewed flow using the source branch's current prices and a 1:1 legacy
-- rate; new clients should call review_stock_transfer_item directly.
CREATE OR REPLACE FUNCTION public.decide_stock_transfer_item(
  p_item_id uuid,
  p_decision text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source public.inventory%ROWTYPE;
  v_item public.stock_transfer_items%ROWTYPE;
  v_request public.stock_transfer_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_item FROM public.stock_transfer_items WHERE id = p_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer item not found'; END IF;
  IF lower(p_decision) = 'rejected' THEN
    RETURN public.review_stock_transfer_item(p_item_id, p_decision, NULL, NULL, NULL, NULL);
  END IF;
  SELECT * INTO v_request FROM public.stock_transfer_requests WHERE id = v_item.request_id;
  SELECT * INTO v_source FROM public.inventory
  WHERE id = v_item.source_inventory_id AND store_id = v_request.from_store_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'The source inventory record no longer exists'; END IF;
  RETURN public.review_stock_transfer_item(
    p_item_id, p_decision, COALESCE(v_source.retail_price, 0),
    COALESCE(v_source.wholesale_price, 0), 1, 'custom'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.review_stock_transfer_item(uuid, text, numeric, numeric, numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decide_stock_transfer_item(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_stock_transfer_item(uuid, text, numeric, numeric, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_stock_transfer_item(uuid, text) TO authenticated;

COMMIT;
