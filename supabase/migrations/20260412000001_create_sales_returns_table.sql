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

-- Enable RLS on sales_returns
ALTER TABLE public.sales_returns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view returns for their stores" ON public.sales_returns;
DROP POLICY IF EXISTS "Users can insert returns for their stores" ON public.sales_returns;
DROP POLICY IF EXISTS "Users can update returns for their stores" ON public.sales_returns;
DROP POLICY IF EXISTS "Users can delete returns for their stores" ON public.sales_returns;

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

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_sales_returns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for sales_returns updated_at
DROP TRIGGER IF EXISTS update_sales_returns_updated_at ON public.sales_returns;
CREATE TRIGGER update_sales_returns_updated_at
  BEFORE UPDATE ON public.sales_returns
  FOR EACH ROW
  EXECUTE FUNCTION public.update_sales_returns_updated_at();
