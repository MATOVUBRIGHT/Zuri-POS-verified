-- Add public sales return table and public pin table columns
-- This migration adds support for sales returns and PIN-based access control

BEGIN;

-- Create public sales return table
CREATE TABLE IF NOT EXISTS public.sales_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  
  -- Return details
  return_reason TEXT NOT NULL,
  return_notes TEXT,
  return_date DATE NOT NULL DEFAULT CURRENT_DATE,
  return_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- Products returned (JSON array)
  returned_products JSONB NOT NULL DEFAULT '[]',
  
  -- Financial details
  total_refund_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  refund_method TEXT NOT NULL DEFAULT 'cash', -- cash, mobile_money, bank_transfer, credit_note
  refund_status TEXT NOT NULL DEFAULT 'pending', -- pending, completed, cancelled
  
  -- Refund details (for non-cash refunds)
  refund_account_number TEXT,
  refund_account_name TEXT,
  refund_transaction_reference TEXT,
  refund_mobile_number TEXT,
  
  -- Audit fields
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- Indexes for performance
  CONSTRAINT valid_refund_status CHECK (refund_status IN ('pending', 'completed', 'cancelled')),
  CONSTRAINT valid_refund_method CHECK (refund_method IN ('cash', 'mobile_money', 'bank_transfer', 'credit_note'))
);

-- Create indexes for sales_returns
CREATE INDEX IF NOT EXISTS idx_sales_returns_sale_id ON public.sales_returns(sale_id);
CREATE INDEX IF NOT EXISTS idx_sales_returns_store_id ON public.sales_returns(store_id);
CREATE INDEX IF NOT EXISTS idx_sales_returns_user_id ON public.sales_returns(user_id);
CREATE INDEX IF NOT EXISTS idx_sales_returns_return_date ON public.sales_returns(return_date);
CREATE INDEX IF NOT EXISTS idx_sales_returns_refund_status ON public.sales_returns(refund_status);

-- Add RLS policies for sales_returns
ALTER TABLE public.sales_returns ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view returns for stores they own or have access to
CREATE POLICY "Users can view returns for their stores" ON public.sales_returns
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = sales_returns.store_id
      AND (s.user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.store_access sa
        WHERE sa.store_id = s.id AND sa.user_id = auth.uid()
      ))
    )
  );

-- Policy: Users can insert returns for their stores
CREATE POLICY "Users can insert returns for their stores" ON public.sales_returns
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = sales_returns.store_id
      AND (s.user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.store_access sa
        WHERE sa.store_id = s.id AND sa.user_id = auth.uid()
      ))
    )
  );

-- Policy: Users can update returns for their stores
CREATE POLICY "Users can update returns for their stores" ON public.sales_returns
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = sales_returns.store_id
      AND (s.user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.store_access sa
        WHERE sa.store_id = s.id AND sa.user_id = auth.uid()
      ))
    )
  );

-- Policy: Users can delete returns for their stores
CREATE POLICY "Users can delete returns for their stores" ON public.sales_returns
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = sales_returns.store_id
      AND (s.user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.store_access sa
        WHERE sa.store_id = s.id AND sa.user_id = auth.uid()
      ))
    )
  );

-- Add PIN columns to existing tables
-- Add PIN to stores table for public access control
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS public_pin TEXT,
  ADD COLUMN IF NOT EXISTS public_access_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS public_access_expires_at TIMESTAMP WITH TIME ZONE;

-- Add PIN to staff table for clock-in/out
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS clock_in_pin TEXT,
  ADD COLUMN IF NOT EXISTS last_clock_in TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS last_clock_out TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS is_clocked_in BOOLEAN NOT NULL DEFAULT false;

-- Add PIN to customers table for quick access
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS access_pin TEXT,
  ADD COLUMN IF NOT EXISTS loyalty_points INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_purchases DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Create public pin access log table
CREATE TABLE IF NOT EXISTS public.pin_access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  
  -- Access details
  access_type TEXT NOT NULL, -- store_access, staff_clock_in, staff_clock_out, customer_access
  pin_used TEXT NOT NULL,
  access_granted BOOLEAN NOT NULL DEFAULT false,
  access_reason TEXT,
  
  -- Device/network info
  ip_address INET,
  user_agent TEXT,
  
  -- Timestamps
  accessed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- Indexes
  CONSTRAINT valid_access_type CHECK (access_type IN ('store_access', 'staff_clock_in', 'staff_clock_out', 'customer_access'))
);

-- Create indexes for pin_access_logs
CREATE INDEX IF NOT EXISTS idx_pin_access_logs_store_id ON public.pin_access_logs(store_id);
CREATE INDEX IF NOT EXISTS idx_pin_access_logs_access_type ON public.pin_access_logs(access_type);
CREATE INDEX IF NOT EXISTS idx_pin_access_logs_accessed_at ON public.pin_access_logs(accessed_at);
CREATE INDEX IF NOT EXISTS idx_pin_access_logs_access_granted ON public.pin_access_logs(access_granted);

-- Add RLS policies for pin_access_logs
ALTER TABLE public.pin_access_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view access logs for their stores
CREATE POLICY "Users can view access logs for their stores" ON public.pin_access_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = pin_access_logs.store_id
      AND (s.user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.store_access sa
        WHERE sa.store_id = s.id AND sa.user_id = auth.uid()
      ))
    )
  );

-- Policy: System can insert access logs (authenticated or public)
CREATE POLICY "System can insert access logs" ON public.pin_access_logs
  FOR INSERT WITH CHECK (true);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for sales_returns updated_at
CREATE TRIGGER update_sales_returns_updated_at
  BEFORE UPDATE ON public.sales_returns
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to validate PIN format (4-6 digits)
CREATE OR REPLACE FUNCTION public.validate_pin_format(pin TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN pin IS NULL OR (pin ~ '^[0-9]{4,6}$');
END;
$$ LANGUAGE plpgsql;

-- Add check constraints for PIN columns
ALTER TABLE public.stores
  ADD CONSTRAINT stores_public_pin_format CHECK (public.validate_pin_format(public_pin));

ALTER TABLE public.staff
  ADD CONSTRAINT staff_clock_in_pin_format CHECK (public.validate_pin_format(clock_in_pin));

ALTER TABLE public.customers
  ADD CONSTRAINT customers_access_pin_format CHECK (public.validate_pin_format(access_pin));

COMMIT;