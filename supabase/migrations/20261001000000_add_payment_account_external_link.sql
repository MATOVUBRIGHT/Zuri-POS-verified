ALTER TABLE public.branch_payment_accounts
  ADD COLUMN IF NOT EXISTS external_link text;

NOTIFY pgrst, 'reload schema';