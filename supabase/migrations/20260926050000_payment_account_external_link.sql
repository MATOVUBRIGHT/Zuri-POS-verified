-- Optional bank / payment portal link for a branch receiving account.
--
-- PaymentAccounts.tsx has always sent `external_link` when saving an account, but
-- the column was never created, so every account insert and update failed with
--   column "external_link" of relation "branch_payment_accounts" does not exist
--
-- The column is nullable on purpose: an account is valid without a link, so this
-- must never be required. PaymentAccounts.tsx also omits the key entirely when
-- the field is blank, which keeps older schemas working until this migration runs.
ALTER TABLE public.branch_payment_accounts
  ADD COLUMN IF NOT EXISTS external_link text;

COMMENT ON COLUMN public.branch_payment_accounts.external_link IS
  'Optional https:// link to a bank or payment portal for this receiving account.';