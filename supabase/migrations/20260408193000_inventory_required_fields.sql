-- Ensure public.inventory contains all columns used by the app (safe to re-run).
-- Created: 2026-04-08

-- Core fields (some may already exist in older schemas)
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS store_id UUID;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS product_name TEXT;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS category TEXT;

-- Stock + pricing
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS quantity NUMERIC DEFAULT 0;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS cost_per_unit NUMERIC DEFAULT 0;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS total_value NUMERIC DEFAULT 0;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS retail_price NUMERIC DEFAULT 0;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS wholesale_price NUMERIC DEFAULT 0;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS loose_item_price NUMERIC DEFAULT 0;

-- Purchase metadata
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS date_of_purchase DATE;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS supplier_id UUID;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS supplier_name TEXT;

-- Barcode system
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS barcode TEXT;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS barcode_type TEXT DEFAULT 'CODE128';
-- NOTE: In this codebase, barcode_mode is the product/packaging barcode mode:
--   standard | each_item | loose
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS barcode_mode TEXT DEFAULT 'standard';

-- Packaging + units
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS unit_name TEXT DEFAULT 'unit';
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS packaging_type TEXT DEFAULT 'individual';
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS items_per_sachet NUMERIC DEFAULT 1;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS sachets_count NUMERIC DEFAULT 0;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS loose_items NUMERIC DEFAULT 0;

-- Misc
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS size TEXT;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS product_image TEXT;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS min_stock_level NUMERIC DEFAULT 0;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS reorder_quantity NUMERIC DEFAULT 0;

-- Defaults + backfill (avoid null math and UI edge cases)
ALTER TABLE public.inventory ALTER COLUMN quantity SET DEFAULT 0;
UPDATE public.inventory SET quantity = 0 WHERE quantity IS NULL;

DO $$
BEGIN
  -- Enforce allowed barcode modes (skip if constraint already exists).
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_barcode_mode_check'
  ) THEN
    ALTER TABLE public.inventory
      ADD CONSTRAINT inventory_barcode_mode_check
      CHECK (barcode_mode IN ('standard', 'each_item', 'loose'));
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_inventory_store_id ON public.inventory(store_id);

-- Unique per store (allows multiple NULL barcodes).
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_store_barcode_unique
  ON public.inventory(store_id, barcode)
  WHERE barcode IS NOT NULL;

