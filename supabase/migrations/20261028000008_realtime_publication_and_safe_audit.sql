BEGIN;

-- Keep audit logging compatible with installations that still have the older
-- entity_type/entity_id shape. The client uses the canonical table_name form,
-- while this migration ensures both column families exist for older schemas.
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS table_name text,
  ADD COLUMN IF NOT EXISTS record_id text,
  ADD COLUMN IF NOT EXISTS entity_type text,
  ADD COLUMN IF NOT EXISTS entity_id text,
  ADD COLUMN IF NOT EXISTS staff_id uuid,
  ADD COLUMN IF NOT EXISTS staff_name text;

UPDATE public.audit_logs
SET table_name = COALESCE(table_name, entity_type),
    record_id = COALESCE(record_id, entity_id::text)
WHERE table_name IS NULL OR record_id IS NULL;

-- Realtime fails a whole channel when one subscribed table is not in the
-- publication. Register every store-scoped table used by useRealtimeSync.
DO $$
DECLARE
  v_table text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH v_table IN ARRAY ARRAY[
      'inventory', 'sales', 'expenses', 'cash_transactions', 'customers',
      'suppliers', 'staff', 'shifts', 'branch_payment_accounts',
      'payment_account_ledger', 'notifications', 'sale_returns',
      'scheduled_payments', 'cash_banking_deposits'
    ] LOOP
      IF to_regclass('public.' || v_table) IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM pg_publication_tables
           WHERE pubname = 'supabase_realtime'
             AND schemaname = 'public'
             AND tablename = v_table
         ) THEN
        BEGIN
          EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_table);
        EXCEPTION WHEN others THEN
          RAISE NOTICE 'Could not add % to supabase_realtime: %', v_table, SQLERRM;
        END;
      END IF;
    END LOOP;
  END IF;
END;
$$;

-- Notification delivery is best effort. A missing optional column, an old
-- notification schema, or a deleted recipient must never abort the business
-- transaction that caused the activity.
CREATE OR REPLACE FUNCTION public.notify_branch_activity_recipients(
  p_store_id uuid,
  p_activity_id uuid,
  p_activity_type text,
  p_title text,
  p_message text,
  p_data jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_store_id IS NULL OR p_activity_id IS NULL THEN
    RETURN;
  END IF;

  BEGIN
    INSERT INTO public.notifications (user_id, store_id, type, title, message, data)
    SELECT recipients.user_id, p_store_id, p_activity_type, p_title, p_message,
      p_data || jsonb_build_object(
        'activity_id', p_activity_id,
        'activity_type', p_activity_type,
        'store_id', p_store_id
      )
    FROM (
      SELECT s.user_id FROM public.stores s WHERE s.id = p_store_id
      UNION
      SELECT sa.user_id FROM public.store_access sa WHERE sa.store_id = p_store_id
      UNION
      SELECT ur.user_id FROM public.user_roles ur
      WHERE ur.role::text IN ('boss', 'admin', 'master_developer')
    ) recipients
    WHERE recipients.user_id IS NOT NULL;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'Branch activity notification skipped: %', SQLERRM;
  END;
END;
$$;

COMMIT;
