-- Secure, password-gated data deletion.
--
-- Why this exists: src/components/Settings.tsx "Clear All Data" only called
-- handleDataImport({stock:[],sales:[],expenses:[]}), which just blanked React
-- state. Nothing was deleted server-side, so the offline sync mirror and the
-- next refetch brought every row straight back.
--
-- This function is the only supported way to wipe branch data. It refuses
-- unless the caller is the store owner, supplies the store access password, and
-- types the confirmation word. Password comparison happens here with the same
-- pgcrypto helper used for staff PINs, so the hash never has to be trusted by
-- the client.

CREATE OR REPLACE FUNCTION public.clear_branch_data(
  p_store_id  uuid,
  p_password  text,
  p_scope     text DEFAULT 'all',
  p_confirm   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_store_name text;
  v_hash       text;
  v_tables     text[];
  v_counts     jsonb := '{}'::jsonb;
  t            text;
  v_n          bigint;
  v_skipped    text[] := '{}';
BEGIN
  ---------------------------------------------------------------------------
  -- 1. Hard gates
  ---------------------------------------------------------------------------
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in.' USING ERRCODE = '42501';
  END IF;

  IF p_confirm IS DISTINCT FROM 'DELETE' THEN
    RAISE EXCEPTION 'Confirmation word did not match. Nothing was deleted.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_store_owner(p_store_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only the owner of this store can delete its data.'
      USING ERRCODE = '42501';
  END IF;

  SELECT name, access_password_hash
    INTO v_store_name, v_hash
    FROM public.stores
   WHERE id = p_store_id;

  IF v_store_name IS NULL THEN
    RAISE EXCEPTION 'Store not found.' USING ERRCODE = '42501';
  END IF;

  IF v_hash IS NULL OR v_hash = '' THEN
    RAISE EXCEPTION 'This store has no password set, so deletion is blocked. Set a store password in Stores first.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.verify_pin_hash(p_password, v_hash) THEN
    RAISE EXCEPTION 'Incorrect password. Nothing was deleted.' USING ERRCODE = '42501';
  END IF;

  ---------------------------------------------------------------------------
  -- 2. Decide the table set.
  --    Accounts are never in any list: staff, profiles, stores, roles,
  --    subscriptions and payment accounts survive a data wipe.
  ---------------------------------------------------------------------------
  v_tables := CASE p_scope
    WHEN 'sales' THEN ARRAY[
      'sale_returns', 'sales', 'cash_transactions', 'customer_transactions'
    ]
    WHEN 'inventory' THEN ARRAY[
      'stock_transfers', 'stock_loans', 'inventory'
    ]
    WHEN 'expenses' THEN ARRAY['expenses']
    WHEN 'customers' THEN ARRAY['customer_transactions', 'customers']
    WHEN 'suppliers' THEN ARRAY['suppliers']
    WHEN 'tracker' THEN ARRAY['tracker_documents']
    WHEN 'shifts' THEN ARRAY['shifts']
    WHEN 'banking' THEN ARRAY['cash_banking_deposits']
    WHEN 'all' THEN ARRAY[
      'sale_returns', 'sales', 'cash_transactions', 'customer_transactions',
      'stock_transfers', 'stock_loans', 'inventory',
      'expenses', 'suppliers', 'tracker_documents',
      'shifts', 'cash_banking_deposits', 'customers'
    ]
    ELSE NULL
  END;

  IF v_tables IS NULL THEN
    RAISE EXCEPTION 'Unknown scope: %', p_scope USING ERRCODE = '22023';
  END IF;

  ---------------------------------------------------------------------------
  -- 3. Delete, children first, counting what went.
  --    Tables are resolved at run time so a partially migrated database does
  --    not abort the whole wipe, and store_id is confirmed per table because a
  --    few legacy tables never had it.
  ---------------------------------------------------------------------------
  FOREACH t IN ARRAY v_tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      v_skipped := v_skipped || (t || ' (missing)');
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = t AND column_name = 'store_id'
    ) THEN
      v_skipped := v_skipped || (t || ' (no store_id)');
      CONTINUE;
    END IF;

    EXECUTE format('SELECT count(*) FROM public.%I WHERE store_id = $1', t)
      INTO v_n USING p_store_id;

    EXECUTE format('DELETE FROM public.%I WHERE store_id = $1', t)
      USING p_store_id;

    v_counts := v_counts || jsonb_build_object(t, v_n);
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'scope', p_scope,
    'store', v_store_name,
    'deleted', v_counts,
    'skipped', to_jsonb(v_skipped)
  );
END;
$$;

COMMENT ON FUNCTION public.clear_branch_data(uuid, text, text, text) IS
  'Password-gated, branch-scoped data deletion. Owner only. Requires the store access password and the literal confirmation word DELETE. Returns per-table deleted row counts.';

REVOKE ALL ON FUNCTION public.clear_branch_data(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_branch_data(uuid, text, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
