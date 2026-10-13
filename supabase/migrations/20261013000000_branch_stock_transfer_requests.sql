BEGIN;

CREATE TABLE public.stock_transfer_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  to_store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  reference text,
  notes text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'partial', 'completed', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_store_id <> to_store_id)
);

CREATE TABLE public.stock_transfer_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.stock_transfer_requests(id) ON DELETE CASCADE,
  source_inventory_id uuid NOT NULL REFERENCES public.inventory(id) ON DELETE RESTRICT,
  product_name text NOT NULL,
  category text NOT NULL,
  size text,
  barcode text,
  quantity numeric NOT NULL CHECK (quantity > 0 AND quantity = trunc(quantity)),
  cost_per_unit numeric NOT NULL CHECK (cost_per_unit >= 0),
  available_quantity_at_request numeric NOT NULL CHECK (available_quantity_at_request >= 0),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX stock_transfer_requests_from_store_idx
  ON public.stock_transfer_requests (from_store_id, created_at DESC);
CREATE INDEX stock_transfer_requests_to_store_idx
  ON public.stock_transfer_requests (to_store_id, created_at DESC);
CREATE INDEX stock_transfer_items_request_idx
  ON public.stock_transfer_items (request_id, created_at);

ALTER TABLE public.stock_transfer_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transfer_items ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_view_stock_transfer_store(_store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.stores s
    WHERE s.id = _store_id
      AND (
        s.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.store_access sa
          WHERE sa.store_id = s.id AND sa.user_id = auth.uid()
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_stock_transfer_store(_store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.stores s
    WHERE s.id = _store_id
      AND (
        s.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.store_access sa
          WHERE sa.store_id = s.id
            AND sa.user_id = auth.uid()
            AND lower(sa.role) IN ('owner', 'admin', 'manager')
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_view_stock_transfer_store(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_stock_transfer_store(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_stock_transfer_store(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_stock_transfer_store(uuid) TO authenticated;

CREATE POLICY "Accessible branches can view transfer requests"
  ON public.stock_transfer_requests FOR SELECT TO authenticated
  USING (
    public.can_view_stock_transfer_store(from_store_id)
    OR public.can_view_stock_transfer_store(to_store_id)
  );

CREATE POLICY "Accessible branches can view transfer items"
  ON public.stock_transfer_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.stock_transfer_requests r
      WHERE r.id = request_id
        AND (
          public.can_view_stock_transfer_store(r.from_store_id)
          OR public.can_view_stock_transfer_store(r.to_store_id)
        )
    )
  );

REVOKE ALL ON public.stock_transfer_requests FROM anon, authenticated;
REVOKE ALL ON public.stock_transfer_items FROM anon, authenticated;
GRANT SELECT ON public.stock_transfer_requests, public.stock_transfer_items TO authenticated;

CREATE OR REPLACE FUNCTION public.create_stock_transfer_request(
  p_from_store_id uuid,
  p_to_store_id uuid,
  p_reference text,
  p_notes text,
  p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_owner_id uuid;
  v_destination_owner_id uuid;
  v_request_id uuid;
  v_item jsonb;
  v_inventory public.inventory%ROWTYPE;
  v_requested_quantity numeric;
  v_available numeric;
  v_item_count integer := 0;
  v_seen_inventory_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to create a stock transfer';
  END IF;
  IF p_from_store_id IS NULL OR p_to_store_id IS NULL OR p_from_store_id = p_to_store_id THEN
    RAISE EXCEPTION 'Choose two different branches';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Add at least one stock item to the request';
  END IF;
  IF jsonb_array_length(p_items) > 100 THEN
    RAISE EXCEPTION 'A transfer can contain at most 100 items';
  END IF;

  SELECT s.user_id INTO v_owner_id
  FROM public.stores s
  WHERE s.id = p_from_store_id;
  SELECT s.user_id INTO v_destination_owner_id
  FROM public.stores s
  WHERE s.id = p_to_store_id;

  IF v_owner_id IS NULL OR v_destination_owner_id IS NULL THEN
    RAISE EXCEPTION 'The selected branch could not be found';
  END IF;
  IF v_owner_id <> v_destination_owner_id THEN
    RAISE EXCEPTION 'Transfers are only allowed between branches of the same business';
  END IF;
  IF NOT public.can_manage_stock_transfer_store(p_from_store_id) THEN
    RAISE EXCEPTION 'You need owner, admin, or manager access to the sending branch';
  END IF;

  INSERT INTO public.stock_transfer_requests (
    from_store_id, to_store_id, created_by, reference, notes
  )
  VALUES (
    p_from_store_id,
    p_to_store_id,
    v_user_id,
    nullif(btrim(p_reference), ''),
    nullif(btrim(p_notes), '')
  )
  RETURNING id INTO v_request_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    IF jsonb_typeof(v_item) <> 'object'
      OR nullif(v_item->>'inventory_id', '') IS NULL
      OR nullif(v_item->>'quantity', '') IS NULL THEN
      RAISE EXCEPTION 'Each transfer item must include an inventory item and quantity';
    END IF;

    v_requested_quantity := (v_item->>'quantity')::numeric;
    IF v_requested_quantity <= 0 OR v_requested_quantity <> trunc(v_requested_quantity) THEN
      RAISE EXCEPTION 'Transfer quantities must be positive whole numbers';
    END IF;

    IF (v_item->>'inventory_id')::uuid = ANY(v_seen_inventory_ids) THEN
      RAISE EXCEPTION 'An inventory item can only appear once in a transfer';
    END IF;
    v_seen_inventory_ids := array_append(v_seen_inventory_ids, (v_item->>'inventory_id')::uuid);

    SELECT i.* INTO v_inventory
    FROM public.inventory i
    WHERE i.id = (v_item->>'inventory_id')::uuid
      AND i.store_id = p_from_store_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'A selected item is no longer in the sending branch';
    END IF;

    v_available := greatest(coalesce(v_inventory.quantity, 0) - coalesce(v_inventory.damaged_quantity, 0), 0);
    IF v_requested_quantity > v_available THEN
      RAISE EXCEPTION 'Only % sellable units of % are available; pending requests do not reserve stock',
        v_available, v_inventory.product_name;
    END IF;

    INSERT INTO public.stock_transfer_items (
      request_id, source_inventory_id, product_name, category, size, barcode,
      quantity, cost_per_unit, available_quantity_at_request
    )
    VALUES (
      v_request_id,
      v_inventory.id,
      v_inventory.product_name,
      v_inventory.category,
      v_inventory.size,
      v_inventory.barcode,
      v_requested_quantity,
      coalesce(v_inventory.cost_per_unit, 0),
      v_available
    );
    v_item_count := v_item_count + 1;
  END LOOP;

  IF v_item_count = 0 THEN
    RAISE EXCEPTION 'Add at least one stock item to the request';
  END IF;
  RETURN v_request_id;
END;
$$;

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
  v_user_id uuid := auth.uid();
  v_item public.stock_transfer_items%ROWTYPE;
  v_request public.stock_transfer_requests%ROWTYPE;
  v_source public.inventory%ROWTYPE;
  v_destination public.inventory%ROWTYPE;
  v_destination_owner uuid;
  v_new_quantity numeric;
  v_sellable numeric;
  v_transfer_cost numeric;
  v_items_per_pack numeric;
  v_identity_key text;
  v_pending integer;
  v_approved integer;
  v_rejected integer;
  v_summary text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to decide a stock transfer';
  END IF;
  IF p_decision NOT IN ('approved', 'rejected') THEN
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

  PERFORM 1
  FROM public.stores source_store
  JOIN public.stores destination_store ON destination_store.id = v_request.to_store_id
  WHERE source_store.id = v_request.from_store_id
    AND source_store.user_id = destination_store.user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The sending and receiving branches no longer belong to the same business';
  END IF;

  IF v_item.status <> 'pending' THEN
    IF v_item.status = p_decision THEN
      RETURN v_item.status;
    END IF;
    RAISE EXCEPTION 'This item has already been %', v_item.status;
  END IF;

  IF p_decision = 'approved' THEN
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
      RAISE EXCEPTION 'STOCK_TRANSFER_INSUFFICIENT: % has % sellable units, but % were requested. Ask the sending branch to reconcile stock and resend if needed.',
        v_item.product_name, v_sellable, v_item.quantity;
    END IF;

    v_transfer_cost := coalesce(v_source.cost_per_unit, 0);
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
      WHERE store_id = v_request.to_store_id
        AND barcode = v_source.barcode
      ORDER BY id
      LIMIT 1
      FOR UPDATE;
    ELSE
      SELECT * INTO v_destination
      FROM public.inventory
      WHERE store_id = v_request.to_store_id
        AND lower(btrim(product_name)) = lower(btrim(v_source.product_name))
        AND lower(btrim(coalesce(category, ''))) = lower(btrim(coalesce(v_source.category, '')))
        AND lower(btrim(coalesce(size, ''))) = lower(btrim(coalesce(v_source.size, '')))
      ORDER BY id
      LIMIT 1
      FOR UPDATE;
    END IF;

    IF FOUND THEN
      v_new_quantity := coalesce(v_destination.quantity, 0) + v_item.quantity;
      v_items_per_pack := greatest(coalesce(v_destination.items_per_sachet, v_source.items_per_sachet, 1), 1);
      UPDATE public.inventory
      SET quantity = v_new_quantity,
          total_value = coalesce(v_destination.total_value, 0) + v_item.quantity * v_transfer_cost,
          cost_per_unit = CASE
            WHEN v_new_quantity > 0
              THEN (coalesce(v_destination.total_value, 0) + v_item.quantity * v_transfer_cost) / v_new_quantity
            ELSE v_transfer_cost
          END,
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
        v_item.quantity, v_transfer_cost,
        v_item.quantity * v_transfer_cost, current_date,
        v_source.retail_price, v_source.wholesale_price, v_source.loose_item_price,
        v_items_per_pack, floor(v_item.quantity / v_items_per_pack), 0,
        mod(v_item.quantity, v_items_per_pack), v_source.unit_name, v_source.packaging_type,
        v_source.product_image, v_source.notes, 0, 0, NULL, NULL
      );
    END IF;
  END IF;

  UPDATE public.stock_transfer_items
  SET status = p_decision,
      cost_per_unit = CASE WHEN p_decision = 'approved' THEN v_transfer_cost ELSE cost_per_unit END,
      decided_by = v_user_id,
      decided_at = now()
  WHERE id = v_item.id;

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

  RETURN p_decision;
END;
$$;

REVOKE ALL ON FUNCTION public.create_stock_transfer_request(uuid, uuid, text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decide_stock_transfer_item(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_stock_transfer_request(uuid, uuid, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_stock_transfer_item(uuid, text) TO authenticated;

COMMIT;
