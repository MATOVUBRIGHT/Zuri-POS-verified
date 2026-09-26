-- Create table for tracking stock purchased on credit/loan
CREATE TABLE public.stock_loans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  store_id UUID NOT NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  cost_per_unit NUMERIC NOT NULL,
  total_amount NUMERIC NOT NULL,
  amount_paid NUMERIC NOT NULL DEFAULT 0,
  balance NUMERIC NOT NULL,
  supplier TEXT NOT NULL,
  date_of_purchase DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'unpaid',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for tracking loan payments history
CREATE TABLE public.loan_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  loan_id UUID NOT NULL REFERENCES public.stock_loans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  amount_paid NUMERIC NOT NULL,
  payment_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.stock_loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_payments ENABLE ROW LEVEL SECURITY;

-- Create policies for stock_loans
CREATE POLICY "Users can view their own stock loans"
ON public.stock_loans
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own stock loans"
ON public.stock_loans
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own stock loans"
ON public.stock_loans
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own stock loans"
ON public.stock_loans
FOR DELETE
USING (auth.uid() = user_id);

-- Create policies for loan_payments
CREATE POLICY "Users can view their own loan payments"
ON public.loan_payments
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own loan payments"
ON public.loan_payments
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates on stock_loans
CREATE TRIGGER update_stock_loans_updated_at
BEFORE UPDATE ON public.stock_loans
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();