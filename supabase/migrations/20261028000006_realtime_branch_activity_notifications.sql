BEGIN;

-- Central notification helper used by branch activity triggers.  It sends the
-- event to the branch owner, permitted branch users, and executive roles so
-- the executive workspace receives activity from every branch in realtime.
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

  INSERT INTO public.notifications (user_id, store_id, type, title, message, data)
  SELECT recipients.user_id,
    p_store_id,
    p_activity_type,
    p_title,
    p_message,
    p_data || jsonb_build_object(
      'activity_id', p_activity_id,
      'activity_type', p_activity_type,
      'store_id', p_store_id
    )
  FROM (
    SELECT s.user_id
    FROM public.stores s
    WHERE s.id = p_store_id
    UNION
    SELECT sa.user_id
    FROM public.store_access sa
    WHERE sa.store_id = p_store_id
    UNION
    SELECT ur.user_id
    FROM public.user_roles ur
    WHERE ur.role::text IN ('boss', 'admin', 'master_developer')
  ) AS recipients
  WHERE recipients.user_id IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_branch_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row_data jsonb := to_jsonb(NEW);
  v_store_id uuid := NULLIF(row_data->>'store_id', '')::uuid;
  v_activity_id uuid := NULLIF(row_data->>'id', '')::uuid;
  v_amount text := COALESCE(row_data->>'total_amount', row_data->>'amount', row_data->>'quantity', '');
  v_title text := 'Branch activity';
  v_message text := format('%s activity was recorded.', replace(TG_TABLE_NAME, '_', ' '));
BEGIN
  IF v_store_id IS NULL OR v_activity_id IS NULL THEN
    RETURN NEW;
  END IF;

  CASE TG_TABLE_NAME
    WHEN 'inventory' THEN
      v_title := CASE WHEN TG_OP = 'INSERT' THEN 'Inventory added' ELSE 'Inventory updated' END;
      v_message := format('%s inventory item%s%s.',
        CASE WHEN TG_OP = 'INSERT' THEN 'New' ELSE 'An' END,
        CASE WHEN NULLIF(row_data->>'product_name', '') IS NULL THEN '' ELSE format(' (%s)', row_data->>'product_name') END,
        CASE WHEN v_amount = '' THEN '' ELSE format(' with quantity %s', v_amount) END);
    WHEN 'supplier_returns' THEN
      v_title := 'Supplier return recorded';
      v_message := format('A supplier return%s was recorded.', CASE WHEN v_amount = '' THEN '' ELSE format(' for %s', v_amount) END);
    WHEN 'stock_loans' THEN
      v_title := 'Stock loan activity';
      v_message := format('A stock loan%s was recorded.', CASE WHEN v_amount = '' THEN '' ELSE format(' for %s', v_amount) END);
    WHEN 'reseller_payments' THEN
      v_title := 'Reseller payment received';
      v_message := format('A reseller payment of %s was recorded.', COALESCE(NULLIF(v_amount, ''), '0'));
    WHEN 'reseller_commissions' THEN
      v_title := 'Reseller commission activity';
      v_message := format('Reseller commission activity%s was recorded.', CASE WHEN v_amount = '' THEN '' ELSE format(' for %s', v_amount) END);
    WHEN 'reseller_settlement_schedules' THEN
      v_title := 'Reseller settlement updated';
      v_message := 'A reseller settlement schedule was created or updated.';
    WHEN 'payment_account_transfers' THEN
      v_title := 'Payment account transfer';
      v_message := format('A payment account transfer of %s was recorded.', COALESCE(NULLIF(v_amount, ''), '0'));
    WHEN 'payment_account_ledger' THEN
      v_title := 'Payment account activity';
      v_message := format('A payment account ledger entry%s was recorded.', CASE WHEN v_amount = '' THEN '' ELSE format(' for %s', v_amount) END);
    WHEN 'scheduled_payments' THEN
      v_title := 'Scheduled payment updated';
      v_message := 'A scheduled payment was created or updated.';
    WHEN 'cash_banking_deposits' THEN
      v_title := 'Banking deposit recorded';
      v_message := format('A banking deposit of %s was recorded.', COALESCE(NULLIF(v_amount, ''), '0'));
    WHEN 'branch_payment_accounts' THEN
      v_title := 'Payment account updated';
      v_message := 'A branch payment account was created or updated.';
    WHEN 'walkin_counts' THEN
      v_title := 'Walk-in activity updated';
      v_message := 'Walk-in customer activity was recorded or updated.';
    WHEN 'audit_logs' THEN
      v_title := 'Branch activity logged';
      v_message := format('Activity was logged for %s.', COALESCE(NULLIF(row_data->>'table_name', ''), 'the branch'));
  END CASE;

  PERFORM public.notify_branch_activity_recipients(
    v_store_id,
    v_activity_id,
    'branch_' || TG_TABLE_NAME,
    v_title,
    v_message,
    jsonb_build_object('table_name', TG_TABLE_NAME, 'operation', TG_OP)
  );
  RETURN NEW;
END;
$$;

-- Transfers belong to two branches, so notify both sides of the movement.
CREATE OR REPLACE FUNCTION public.notify_stock_transfer_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title text := CASE
    WHEN TG_OP = 'INSERT' THEN 'Stock transfer requested'
    ELSE 'Stock transfer updated'
  END;
  v_message text := format('Stock transfer%s is now %s.',
    CASE WHEN NULLIF(NEW.reference, '') IS NULL THEN '' ELSE format(' %s', NEW.reference) END,
    NEW.status);
BEGIN
  PERFORM public.notify_branch_activity_recipients(
    NEW.from_store_id, NEW.id, 'branch_stock_transfer', v_title, v_message,
    jsonb_build_object('from_store_id', NEW.from_store_id, 'to_store_id', NEW.to_store_id, 'status', NEW.status)
  );
  PERFORM public.notify_branch_activity_recipients(
    NEW.to_store_id, NEW.id, 'branch_stock_transfer', v_title, v_message,
    jsonb_build_object('from_store_id', NEW.from_store_id, 'to_store_id', NEW.to_store_id, 'status', NEW.status)
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_stock_transfer_item_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.stock_transfer_requests%ROWTYPE;
  v_message text;
BEGIN
  SELECT * INTO v_request
  FROM public.stock_transfer_requests
  WHERE id = NEW.request_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_message := format('%s stock transfer item%s (%s units).',
    initcap(NEW.status),
    CASE WHEN NULLIF(NEW.product_name, '') IS NULL THEN '' ELSE format(' for %s', NEW.product_name) END,
    NEW.quantity);

  PERFORM public.notify_branch_activity_recipients(
    v_request.from_store_id, NEW.id, 'branch_stock_transfer_item', 'Stock transfer item updated', v_message,
    jsonb_build_object('request_id', NEW.request_id, 'status', NEW.status, 'product_name', NEW.product_name, 'quantity', NEW.quantity)
  );
  PERFORM public.notify_branch_activity_recipients(
    v_request.to_store_id, NEW.id, 'branch_stock_transfer_item', 'Stock transfer item updated', v_message,
    jsonb_build_object('request_id', NEW.request_id, 'status', NEW.status, 'product_name', NEW.product_name, 'quantity', NEW.quantity)
  );
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.inventory') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS notify_inventory_branch_activity ON public.inventory;
    CREATE TRIGGER notify_inventory_branch_activity
      AFTER INSERT OR UPDATE ON public.inventory
      FOR EACH ROW EXECUTE FUNCTION public.notify_branch_activity();
  END IF;
  IF to_regclass('public.supplier_returns') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS notify_supplier_return_branch_activity ON public.supplier_returns;
    CREATE TRIGGER notify_supplier_return_branch_activity
      AFTER INSERT ON public.supplier_returns
      FOR EACH ROW EXECUTE FUNCTION public.notify_branch_activity();
  END IF;
  IF to_regclass('public.stock_loans') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS notify_stock_loan_branch_activity ON public.stock_loans;
    CREATE TRIGGER notify_stock_loan_branch_activity
      AFTER INSERT OR UPDATE ON public.stock_loans
      FOR EACH ROW EXECUTE FUNCTION public.notify_branch_activity();
  END IF;
  IF to_regclass('public.reseller_payments') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS notify_reseller_payment_branch_activity ON public.reseller_payments;
    CREATE TRIGGER notify_reseller_payment_branch_activity
      AFTER INSERT ON public.reseller_payments
      FOR EACH ROW EXECUTE FUNCTION public.notify_branch_activity();
  END IF;
  IF to_regclass('public.reseller_commissions') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS notify_reseller_commission_branch_activity ON public.reseller_commissions;
    CREATE TRIGGER notify_reseller_commission_branch_activity
      AFTER INSERT OR UPDATE ON public.reseller_commissions
      FOR EACH ROW EXECUTE FUNCTION public.notify_branch_activity();
  END IF;
  IF to_regclass('public.reseller_settlement_schedules') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS notify_reseller_settlement_branch_activity ON public.reseller_settlement_schedules;
    CREATE TRIGGER notify_reseller_settlement_branch_activity
      AFTER INSERT OR UPDATE ON public.reseller_settlement_schedules
      FOR EACH ROW EXECUTE FUNCTION public.notify_branch_activity();
  END IF;
  IF to_regclass('public.payment_account_transfers') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS notify_payment_transfer_branch_activity ON public.payment_account_transfers;
    CREATE TRIGGER notify_payment_transfer_branch_activity
      AFTER INSERT ON public.payment_account_transfers
      FOR EACH ROW EXECUTE FUNCTION public.notify_branch_activity();
  END IF;
  IF to_regclass('public.payment_account_ledger') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS notify_payment_ledger_branch_activity ON public.payment_account_ledger;
    CREATE TRIGGER notify_payment_ledger_branch_activity
      AFTER INSERT ON public.payment_account_ledger
      FOR EACH ROW EXECUTE FUNCTION public.notify_branch_activity();
  END IF;
  IF to_regclass('public.scheduled_payments') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS notify_scheduled_payment_branch_activity ON public.scheduled_payments;
    CREATE TRIGGER notify_scheduled_payment_branch_activity
      AFTER INSERT OR UPDATE ON public.scheduled_payments
      FOR EACH ROW EXECUTE FUNCTION public.notify_branch_activity();
  END IF;
  IF to_regclass('public.cash_banking_deposits') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS notify_banking_deposit_branch_activity ON public.cash_banking_deposits;
    CREATE TRIGGER notify_banking_deposit_branch_activity
      AFTER INSERT ON public.cash_banking_deposits
      FOR EACH ROW EXECUTE FUNCTION public.notify_branch_activity();
  END IF;
  IF to_regclass('public.branch_payment_accounts') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS notify_payment_account_branch_activity ON public.branch_payment_accounts;
    CREATE TRIGGER notify_payment_account_branch_activity
      AFTER INSERT OR UPDATE ON public.branch_payment_accounts
      FOR EACH ROW EXECUTE FUNCTION public.notify_branch_activity();
  END IF;
  IF to_regclass('public.walkin_counts') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS notify_walkin_branch_activity ON public.walkin_counts;
    CREATE TRIGGER notify_walkin_branch_activity
      AFTER INSERT OR UPDATE ON public.walkin_counts
      FOR EACH ROW EXECUTE FUNCTION public.notify_branch_activity();
  END IF;
  IF to_regclass('public.audit_logs') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS notify_audit_branch_activity ON public.audit_logs;
    CREATE TRIGGER notify_audit_branch_activity
      AFTER INSERT ON public.audit_logs
      FOR EACH ROW EXECUTE FUNCTION public.notify_branch_activity();
  END IF;
  IF to_regclass('public.stock_transfer_requests') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS notify_stock_transfer_activity ON public.stock_transfer_requests;
    CREATE TRIGGER notify_stock_transfer_activity
      AFTER INSERT OR UPDATE ON public.stock_transfer_requests
      FOR EACH ROW EXECUTE FUNCTION public.notify_stock_transfer_activity();
  END IF;
  IF to_regclass('public.stock_transfer_items') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS notify_stock_transfer_item_activity ON public.stock_transfer_items;
    CREATE TRIGGER notify_stock_transfer_item_activity
      AFTER INSERT OR UPDATE OF status ON public.stock_transfer_items
      FOR EACH ROW EXECUTE FUNCTION public.notify_stock_transfer_item_activity();
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_branch_activity_recipients(uuid, uuid, text, text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.notify_branch_activity() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.notify_stock_transfer_activity() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.notify_stock_transfer_item_activity() FROM PUBLIC, anon;

COMMIT;
