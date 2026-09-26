-- Barcode Enhancement: Add barcode_type and barcode_mode columns to inventory
-- This migration adds support for different barcode types and modes

-- Add barcode_type column (e.g., CODE128, EAN13, UPC)
ALTER TABLE public.inventory 
ADD COLUMN IF NOT EXISTS barcode_type TEXT DEFAULT 'CODE128';

-- Add barcode_mode column for different product types
-- standard: One barcode per product (normal packaged products)
-- each_item: Each unit can have its own barcode (sachets)
-- loose: Barcode represents product only, price calculated by weight (loose items)
ALTER TABLE public.inventory 
ADD COLUMN IF NOT EXISTS barcode_mode TEXT DEFAULT 'standard';

-- Add unit_name for loose items (e.g., KG, L, pieces)
ALTER TABLE public.inventory 
ADD COLUMN IF NOT EXISTS unit_name TEXT DEFAULT 'unit';

-- Add label_size for printing
ALTER TABLE public.inventory 
ADD COLUMN IF NOT EXISTS label_size TEXT DEFAULT '50x25mm';

-- Barcode value on inventory (indexed below; later migrations may add the same column with IF NOT EXISTS)
ALTER TABLE public.inventory
ADD COLUMN IF NOT EXISTS barcode TEXT;

-- user_settings is not created by earlier migrations; create it before ALTERs
CREATE TABLE IF NOT EXISTS public.user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own user settings" ON public.user_settings;
CREATE POLICY "Users can view their own user settings"
  ON public.user_settings FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own user settings" ON public.user_settings;
CREATE POLICY "Users can insert their own user settings"
  ON public.user_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own user settings" ON public.user_settings;
CREATE POLICY "Users can update their own user settings"
  ON public.user_settings FOR UPDATE
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_user_settings_updated_at ON public.user_settings;
CREATE TRIGGER update_user_settings_updated_at
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add printer_id for saved printer preference
ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS default_barcode_printer TEXT;

-- Add printer_settings JSON column for storing printer configurations
ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS printer_settings JSONB DEFAULT '{}';

-- Create barcode_print_jobs table for tracking print jobs
CREATE TABLE IF NOT EXISTS public.barcode_print_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  inventory_id UUID REFERENCES public.inventory(id) ON DELETE CASCADE,
  barcode TEXT NOT NULL,
  barcode_type TEXT DEFAULT 'CODE128',
  product_name TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  label_size TEXT DEFAULT '50x25mm',
  include_price BOOLEAN DEFAULT true,
  include_product_name BOOLEAN DEFAULT true,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Enable RLS on barcode_print_jobs
ALTER TABLE public.barcode_print_jobs ENABLE ROW LEVEL SECURITY;

-- Create policy for barcode_print_jobs
CREATE POLICY "Users can manage their own print jobs"
  ON public.barcode_print_jobs FOR ALL
  USING (auth.uid() = user_id);

-- Create index for faster barcode lookups
CREATE INDEX IF NOT EXISTS idx_inventory_barcode ON public.inventory(barcode);
CREATE INDEX IF NOT EXISTS idx_inventory_barcode_mode ON public.inventory(barcode_mode);
