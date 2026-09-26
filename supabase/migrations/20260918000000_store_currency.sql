-- A currency is a branch-level accounting setting.  Keeping it on stores lets
-- executive reporting format each branch correctly without mixing currencies.
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'UGX';

ALTER TABLE public.stores
  DROP CONSTRAINT IF EXISTS stores_currency_code_check;

ALTER TABLE public.stores
  ADD CONSTRAINT stores_currency_code_check
  CHECK (currency = upper(currency) AND currency ~ '^[A-Z]{3}$') NOT VALID;

ALTER TABLE public.stores
  VALIDATE CONSTRAINT stores_currency_code_check;
