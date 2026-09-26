-- Add sachet/packaging columns to inventory table
ALTER TABLE public.inventory 
ADD COLUMN IF NOT EXISTS items_per_sachet integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS sachets_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS opened_sachets integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS loose_items integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS retail_price numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS wholesale_price numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS barcode text;

-- Add comment to explain the sachet system
COMMENT ON COLUMN public.inventory.items_per_sachet IS 'Number of items in each sachet/packet';
COMMENT ON COLUMN public.inventory.sachets_count IS 'Total number of complete sachets';
COMMENT ON COLUMN public.inventory.opened_sachets IS 'Number of sachets that have been opened';
COMMENT ON COLUMN public.inventory.loose_items IS 'Number of individual items from opened sachets';
COMMENT ON COLUMN public.inventory.retail_price IS 'Selling price per single item';
COMMENT ON COLUMN public.inventory.wholesale_price IS 'Selling price per sachet';