ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS receipt_number text;

CREATE SEQUENCE IF NOT EXISTS public.sales_receipt_number_seq;

UPDATE public.sales
SET receipt_number = 'R-' || to_char(COALESCE(created_at, now()), 'YYYYMMDD') || '-' || lpad(nextval('public.sales_receipt_number_seq')::text, 6, '0')
WHERE receipt_number IS NULL OR btrim(receipt_number) = '';

CREATE OR REPLACE FUNCTION public.assign_sale_receipt_number()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.receipt_number IS NULL OR btrim(NEW.receipt_number) = '' THEN
    NEW.receipt_number := 'R-' || to_char(COALESCE(NEW.created_at, now()), 'YYYYMMDD') || '-' || lpad(nextval('public.sales_receipt_number_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS sales_assign_receipt_number ON public.sales;
CREATE TRIGGER sales_assign_receipt_number
  BEFORE INSERT ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.assign_sale_receipt_number();

CREATE UNIQUE INDEX IF NOT EXISTS sales_store_receipt_number_uidx
  ON public.sales(store_id, receipt_number);
