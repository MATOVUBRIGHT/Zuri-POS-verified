-- Add missing tables for PIN management in HR and barcode management
-- This migration adds comprehensive PIN tracking and barcode generation tables

BEGIN;

-- ============================================
-- PIN MANAGEMENT TABLES
-- ============================================

-- Staff clock-in/out logs with PIN tracking
CREATE TABLE IF NOT EXISTS public.staff_clock_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  
  -- Clock details
  clock_type TEXT NOT NULL CHECK (clock_type IN ('clock_in', 'clock_out')),
  clock_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  pin_used TEXT,
  
  -- Location/device info
  ip_address INET,
  device_info TEXT,
  location_lat DECIMAL(10, 8),
  location_lng DECIMAL(11, 8),
  
  -- Validation
  is_valid BOOLEAN NOT NULL DEFAULT true,
  validation_notes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staff_clock_logs_staff_id ON public.staff_clock_logs(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_clock_logs_store_id ON public.staff_clock_logs(store_id);
CREATE INDEX IF NOT EXISTS idx_staff_clock_logs_clock_time ON public.staff_clock_logs(clock_time);
CREATE INDEX IF NOT EXISTS idx_staff_clock_logs_clock_type ON public.staff_clock_logs(clock_type);

-- Customer PIN access logs
CREATE TABLE IF NOT EXISTS public.customer_pin_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  
  -- Access details
  access_type TEXT NOT NULL, -- loyalty_check, quick_checkout, profile_access
  pin_used TEXT,
  access_granted BOOLEAN NOT NULL DEFAULT false,
  
  -- Transaction reference (if applicable)
  sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
  
  -- Device info
  ip_address INET,
  device_info TEXT,
  
  accessed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_pin_logs_customer_id ON public.customer_pin_logs(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_pin_logs_store_id ON public.customer_pin_logs(store_id);
CREATE INDEX IF NOT EXISTS idx_customer_pin_logs_accessed_at ON public.customer_pin_logs(accessed_at);

-- ============================================
-- BARCODE MANAGEMENT TABLES
-- ============================================

-- Barcode generation history and tracking
CREATE TABLE IF NOT EXISTS public.barcode_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Product reference
  product_id UUID REFERENCES public.inventory(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  
  -- Barcode details
  barcode_value TEXT NOT NULL,
  barcode_type TEXT NOT NULL DEFAULT 'CODE128', -- CODE128, EAN13, UPC, QR
  
  -- Print details
  quantity_printed INTEGER NOT NULL DEFAULT 1,
  label_size TEXT NOT NULL DEFAULT '40x30mm', -- 40x30mm, 50x25mm, 60x40mm, custom
  printer_name TEXT,
  
  -- Batch info
  batch_id UUID,
  is_batch_print BOOLEAN NOT NULL DEFAULT false,
  
  -- Status
  print_status TEXT NOT NULL DEFAULT 'pending', -- pending, printed, failed
  print_error TEXT,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  printed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_barcode_generations_store_id ON public.barcode_generations(store_id);
CREATE INDEX IF NOT EXISTS idx_barcode_generations_product_id ON public.barcode_generations(product_id);
CREATE INDEX IF NOT EXISTS idx_barcode_generations_batch_id ON public.barcode_generations(batch_id);
CREATE INDEX IF NOT EXISTS idx_barcode_generations_created_at ON public.barcode_generations(created_at);

-- Printer configuration and hardware detection
CREATE TABLE IF NOT EXISTS public.printer_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Printer details
  printer_name TEXT NOT NULL,
  printer_type TEXT NOT NULL DEFAULT 'thermal', -- thermal, laser, inkjet
  connection_type TEXT NOT NULL DEFAULT 'usb', -- usb, network, bluetooth
  
  -- Hardware info
  vendor_id TEXT,
  product_id TEXT,
  serial_number TEXT,
  usb_port TEXT,
  ip_address INET,
  
  -- Capabilities
  supported_sizes JSONB DEFAULT '["40x30mm", "50x25mm", "60x40mm"]',
  max_width_mm INTEGER DEFAULT 80,
  max_height_mm INTEGER DEFAULT 120,
  dpi INTEGER DEFAULT 203,
  
  -- Settings
  default_label_size TEXT DEFAULT '40x30mm',
  default_quantity INTEGER DEFAULT 1,
  auto_cut BOOLEAN DEFAULT true,
  darkness_level INTEGER DEFAULT 10 CHECK (darkness_level BETWEEN 1 AND 20),
  
  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  last_used_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_printer_configs_store_id ON public.printer_configs(store_id);
CREATE INDEX IF NOT EXISTS idx_printer_configs_is_active ON public.printer_configs(is_active);
CREATE INDEX IF NOT EXISTS idx_printer_configs_is_default ON public.printer_configs(is_default);

-- ============================================
-- RLS POLICIES
-- ============================================

-- Staff clock logs policies
ALTER TABLE public.staff_clock_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view clock logs for their stores" ON public.staff_clock_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = staff_clock_logs.store_id
      AND (s.user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.store_access sa
        WHERE sa.store_id = s.id AND sa.user_id = auth.uid()
      ))
    )
  );

CREATE POLICY "Staff can insert their own clock logs" ON public.staff_clock_logs
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff st
      WHERE st.id = staff_clock_logs.staff_id
      AND st.user_id = auth.uid()
    )
  );

-- Customer PIN logs policies
ALTER TABLE public.customer_pin_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view customer PIN logs for their stores" ON public.customer_pin_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = customer_pin_logs.store_id
      AND (s.user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.store_access sa
        WHERE sa.store_id = s.id AND sa.user_id = auth.uid()
      ))
    )
  );

CREATE POLICY "System can insert customer PIN logs" ON public.customer_pin_logs
  FOR INSERT WITH CHECK (true);

-- Barcode generations policies
ALTER TABLE public.barcode_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view barcode generations for their stores" ON public.barcode_generations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = barcode_generations.store_id
      AND (s.user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.store_access sa
        WHERE sa.store_id = s.id AND sa.user_id = auth.uid()
      ))
    )
  );

CREATE POLICY "Users can insert barcode generations for their stores" ON public.barcode_generations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = barcode_generations.store_id
      AND (s.user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.store_access sa
        WHERE sa.store_id = s.id AND sa.user_id = auth.uid()
      ))
    )
  );

-- Printer configs policies
ALTER TABLE public.printer_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage printer configs for their stores" ON public.printer_configs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = printer_configs.store_id
      AND (s.user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.store_access sa
        WHERE sa.store_id = s.id AND sa.user_id = auth.uid()
      ))
    )
  );

-- ============================================
-- TRIGGERS
-- ============================================

-- Update updated_at for printer_configs
CREATE TRIGGER update_printer_configs_updated_at
  BEFORE UPDATE ON public.printer_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMIT;
