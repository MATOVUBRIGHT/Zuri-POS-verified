-- Payment accounts never received realtime updates because
-- public.branch_payment_accounts was never added to the supabase_realtime
-- publication. postgres_changes silently never fires for tables that are not
-- published, so edits from another device/session never reached the UI.
--
-- Also publishes payment_account_ledger so balance/ledger refreshes propagate.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'branch_payment_accounts'
     )
  THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.branch_payment_accounts;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'payment_account_ledger'
     )
  THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_account_ledger;
  END IF;
END $$;