-- Relax barcode uniqueness to be import-friendly and forgiving.
-- Created: 2026-04-09

-- Older migrations created non-unique indexes; newer local migration added a unique-per-store barcode index.
-- Drop both so duplicates are allowed.
DROP INDEX IF EXISTS public.idx_inventory_store_barcode_unique;
DROP INDEX IF EXISTS public.idx_inventory_barcode;

