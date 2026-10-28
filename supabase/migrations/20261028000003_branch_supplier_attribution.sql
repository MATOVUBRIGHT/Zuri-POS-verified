BEGIN;

-- A branch is the source of origin for transferred stock.  Keep this separate
-- from the supplier's own name so reports can distinguish "Acme" from
-- "Acme supplied by Kampala Branch".
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS country_of_origin text NOT NULL DEFAULT 'Uganda';

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS supplier_branch_name text,
  ADD COLUMN IF NOT EXISTS supplier_branch_store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supplier_branch_country text;

ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS supplier_branch_name text,
  ADD COLUMN IF NOT EXISTS supplier_branch_store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supplier_branch_country text;

ALTER TABLE public.stock_transfer_items
  ADD COLUMN IF NOT EXISTS source_supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_supplier_name text,
  ADD COLUMN IF NOT EXISTS source_branch_name text,
  ADD COLUMN IF NOT EXISTS source_branch_country text;

CREATE INDEX IF NOT EXISTS suppliers_branch_origin_idx
  ON public.suppliers (store_id, supplier_branch_store_id, name);
CREATE INDEX IF NOT EXISTS inventory_supplier_branch_idx
  ON public.inventory (store_id, supplier_branch_store_id);

-- Snapshot the supplier and branch at request time. This keeps the audit trail
-- stable even if the original inventory record is later edited.
CREATE OR REPLACE FUNCTION public.snapshot_stock_transfer_supplier()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inventory public.inventory%ROWTYPE;
  v_store public.stores%ROWTYPE;
  v_supplier public.suppliers%ROWTYPE;
BEGIN
  SELECT * INTO v_inventory FROM public.inventory WHERE id = NEW.source_inventory_id;
  SELECT * INTO v_store FROM public.stores WHERE id = (SELECT from_store_id FROM public.stock_transfer_requests WHERE id = NEW.request_id);
  IF v_inventory.id IS NOT NULL THEN
    NEW.source_supplier_id := v_inventory.supplier_id;
    NEW.source_supplier_name := NULLIF(btrim(v_inventory.supplier_name), '');
    IF v_inventory.supplier_id IS NOT NULL THEN
      SELECT * INTO v_supplier FROM public.suppliers WHERE id = v_inventory.supplier_id;
      NEW.source_supplier_name := COALESCE(NULLIF(btrim(v_supplier.name), ''), NEW.source_supplier_name);
    END IF;
  END IF;
  NEW.source_branch_name := v_store.store_name;
  NEW.source_branch_country := COALESCE(NULLIF(btrim(v_store.country_of_origin), ''), 'Uganda');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS snapshot_stock_transfer_supplier_trigger ON public.stock_transfer_items;
CREATE TRIGGER snapshot_stock_transfer_supplier_trigger
BEFORE INSERT ON public.stock_transfer_items
FOR EACH ROW EXECUTE FUNCTION public.snapshot_stock_transfer_supplier();
REVOKE ALL ON FUNCTION public.snapshot_stock_transfer_supplier() FROM PUBLIC, anon, authenticated;

-- On approval, create a destination-branch supplier record for monitoring and
-- attach the newly received inventory to it. The original supplier name is
-- retained; branch origin is stored in dedicated columns.
CREATE OR REPLACE FUNCTION public.attach_transferred_stock_supplier()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.stock_transfer_requests%ROWTYPE;
  v_source public.inventory%ROWTYPE;
  v_destination_store public.stores%ROWTYPE;
  v_supplier public.suppliers%ROWTYPE;
  v_supplier_id uuid;
  v_supplier_name text;
  v_branch_name text;
  v_branch_country text;
  v_destination_inventory_id uuid;
BEGIN
  IF NEW.status <> 'approved' OR (TG_OP = 'UPDATE' AND OLD.status = 'approved') THEN RETURN NEW; END IF;
  SELECT * INTO v_request FROM public.stock_transfer_requests WHERE id = NEW.request_id;
  SELECT * INTO v_source FROM public.inventory WHERE id = NEW.source_inventory_id;
  SELECT * INTO v_destination_store FROM public.stores WHERE id = v_request.to_store_id;
  v_supplier_name := COALESCE(NULLIF(btrim(NEW.source_supplier_name), ''), NULLIF(btrim(v_source.supplier_name), ''));
  v_branch_name := COALESCE(NULLIF(btrim(NEW.source_branch_name), ''), (SELECT store_name FROM public.stores WHERE id = v_request.from_store_id));
  v_branch_country := COALESCE(NULLIF(btrim(NEW.source_branch_country), ''), (SELECT country_of_origin FROM public.stores WHERE id = v_request.from_store_id), 'Uganda');

  IF v_supplier_name IS NULL OR v_destination_store.id IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO v_supplier
  FROM public.suppliers
  WHERE store_id = v_request.to_store_id
    AND name = v_supplier_name
    AND supplier_branch_store_id = v_request.from_store_id
  ORDER BY created_at
  LIMIT 1;

  IF v_supplier.id IS NULL THEN
    INSERT INTO public.suppliers (store_id, name, company, supplier_branch_name, supplier_branch_store_id, supplier_branch_country)
    VALUES (v_request.to_store_id, v_supplier_name, v_supplier_name, v_branch_name, v_request.from_store_id, v_branch_country)
    RETURNING id INTO v_supplier_id;
  ELSE
    v_supplier_id := v_supplier.id;
  END IF;

  IF NULLIF(btrim(v_source.barcode), '') IS NOT NULL THEN
    SELECT id INTO v_destination_inventory_id FROM public.inventory
    WHERE store_id = v_request.to_store_id AND barcode = v_source.barcode
    ORDER BY id LIMIT 1;
  ELSE
    SELECT id INTO v_destination_inventory_id FROM public.inventory
    WHERE store_id = v_request.to_store_id
      AND lower(btrim(product_name)) = lower(btrim(v_source.product_name))
      AND lower(btrim(coalesce(category, ''))) = lower(btrim(coalesce(v_source.category, '')))
      AND lower(btrim(coalesce(size, ''))) = lower(btrim(coalesce(v_source.size, '')))
    ORDER BY id LIMIT 1;
  END IF;

  IF v_destination_inventory_id IS NOT NULL THEN
    UPDATE public.inventory
    SET supplier_id = v_supplier_id,
        supplier_name = v_supplier_name,
        supplier_branch_name = v_branch_name,
        supplier_branch_store_id = v_request.from_store_id,
        supplier_branch_country = v_branch_country
    WHERE id = v_destination_inventory_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS attach_transferred_stock_supplier_trigger ON public.stock_transfer_items;
CREATE TRIGGER attach_transferred_stock_supplier_trigger
AFTER UPDATE OF status ON public.stock_transfer_items
FOR EACH ROW EXECUTE FUNCTION public.attach_transferred_stock_supplier();
REVOKE ALL ON FUNCTION public.attach_transferred_stock_supplier() FROM PUBLIC, anon, authenticated;

COMMIT;
