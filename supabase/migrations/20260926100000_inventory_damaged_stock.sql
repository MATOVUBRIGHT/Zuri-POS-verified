-- Damaged stock is flagged instead of being silently deducted from `quantity`.
-- Previously recording damaged stock reduced `quantity` outright, which left no
-- trace that the units existed, so nothing could be reviewed before the goods
-- were written off or returned to sale.
--
-- Model:
--   quantity          = total units still on hand (including damaged)
--   damaged_quantity  = the subset currently flagged as damaged
--   sellable          = quantity - damaged_quantity
--
-- Recording damage increments damaged_quantity only. Resolving a review either
-- returns units to sellable (damaged_quantity--) or writes them off (both--).

ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS damaged_quantity integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS damaged_at timestamptz,
  ADD COLUMN IF NOT EXISTS damaged_reason text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_damaged_quantity_within_quantity'
  ) THEN
    ALTER TABLE public.inventory
      ADD CONSTRAINT inventory_damaged_quantity_within_quantity
      CHECK (damaged_quantity >= 0 AND damaged_quantity <= quantity);
  END IF;
END $$;

-- Supports the damaged-stock review queue without scanning the whole table.
CREATE INDEX IF NOT EXISTS inventory_damaged_review_idx
  ON public.inventory (store_id)
  WHERE damaged_quantity > 0;

COMMENT ON COLUMN public.inventory.damaged_quantity IS
  'Units flagged as damaged. Excluded from sale until reviewed. Sellable = quantity - damaged_quantity.';
COMMENT ON COLUMN public.inventory.damaged_at IS
  'When the units were most recently flagged as damaged.';
COMMENT ON COLUMN public.inventory.damaged_reason IS
  'Reason recorded for the most recent damaged-stock flag.';