-- Track item returns against a sale (partial or full).
CREATE TABLE IF NOT EXISTS public.sale_returns (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  items jsonb NOT NULL,
  total_amount numeric NOT NULL,
  reason text,
  staff_id uuid NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.sale_returns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own sale returns"
  ON public.sale_returns FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create sale returns"
  ON public.sale_returns FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own sale returns"
  ON public.sale_returns FOR DELETE
  USING (auth.uid() = user_id);

