-- The stock-transfer RPC reads inventory.damaged_quantity when validating
-- available stock. Keep this repair idempotent for environments where the
-- damaged-stock migration was not applied before the transfer migration.
ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS damaged_quantity integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'inventory_damaged_quantity_within_quantity'
  ) THEN
    ALTER TABLE public.inventory
      ADD CONSTRAINT inventory_damaged_quantity_within_quantity
      CHECK (damaged_quantity >= 0 AND damaged_quantity <= quantity);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS inventory_damaged_review_idx
  ON public.inventory (store_id)
  WHERE damaged_quantity > 0;
