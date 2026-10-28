BEGIN;

-- A reseller can have a default, while each supplied line stores the rate that
-- was actually agreed for that transaction.
ALTER TABLE public.resellers
  ADD COLUMN IF NOT EXISTS commission_percent numeric(5, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.resellers
  DROP CONSTRAINT IF EXISTS resellers_commission_percent_check;
ALTER TABLE public.resellers
  ADD CONSTRAINT resellers_commission_percent_check
  CHECK (commission_percent >= 0 AND commission_percent <= 100);

ALTER TABLE public.reseller_commissions
  ADD COLUMN IF NOT EXISTS sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS commission_percent numeric(5, 2),
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';
ALTER TABLE public.reseller_commissions
  DROP CONSTRAINT IF EXISTS reseller_commissions_percent_check;
ALTER TABLE public.reseller_commissions
  ADD CONSTRAINT reseller_commissions_percent_check
  CHECK (commission_percent IS NULL OR (commission_percent >= 0 AND commission_percent <= 100));

CREATE INDEX IF NOT EXISTS reseller_commissions_sale_idx
  ON public.reseller_commissions (sale_id)
  WHERE sale_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.reseller_settlement_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  reseller_id uuid NOT NULL REFERENCES public.resellers(id) ON DELETE CASCADE,
  amount numeric(12, 2) NOT NULL CHECK (amount > 0),
  scheduled_for date NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'claimed', 'paid', 'cancelled')),
  notes text,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  claimed_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reseller_settlement_schedule_idx
  ON public.reseller_settlement_schedules (store_id, reseller_id, scheduled_for DESC);
ALTER TABLE public.reseller_settlement_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Store users manage reseller settlements" ON public.reseller_settlement_schedules;
CREATE POLICY "Store users manage reseller settlements"
  ON public.reseller_settlement_schedules FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.stores s WHERE s.id = reseller_settlement_schedules.store_id AND s.user_id = auth.uid())
    OR public.has_store_access(reseller_settlement_schedules.store_id, auth.uid())
  )
  WITH CHECK (
    created_by = auth.uid()
    AND (
      EXISTS (SELECT 1 FROM public.stores s WHERE s.id = reseller_settlement_schedules.store_id AND s.user_id = auth.uid())
      OR public.has_store_access(reseller_settlement_schedules.store_id, auth.uid())
    )
  );
GRANT SELECT, INSERT, UPDATE ON public.reseller_settlement_schedules TO authenticated;

-- Called after a reseller sale is committed. The function creates one inbox
-- message per permitted recipient and is safe to call more than once.
CREATE OR REPLACE FUNCTION public.notify_reseller_sale(
  p_sale_id uuid,
  p_store_id uuid,
  p_reseller_name text,
  p_commission_amount numeric,
  p_payment_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title text := 'Reseller sale recorded';
  v_message text := format('%s supplied stock sale recorded. Commission earned: %s. Payment: %s.',
    COALESCE(NULLIF(p_reseller_name, ''), 'Reseller'), to_char(COALESCE(p_commission_amount, 0), 'FM999999999990.00'), p_payment_status);
BEGIN
  IF auth.uid() IS NULL OR p_sale_id IS NULL OR p_store_id IS NULL THEN RETURN; END IF;
  IF NOT public.can_chat_in_store(p_store_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized for this branch';
  END IF;

  INSERT INTO public.notifications (user_id, store_id, type, title, message, data)
  SELECT recipients.user_id, p_store_id, 'reseller_sale', v_title, v_message,
    jsonb_build_object('sale_id', p_sale_id, 'commission_amount', COALESCE(p_commission_amount, 0), 'store_id', p_store_id)
  FROM (
    SELECT s.user_id FROM public.stores s WHERE s.id = p_store_id
    UNION SELECT sa.user_id FROM public.store_access sa WHERE sa.store_id = p_store_id
    UNION SELECT ur.user_id FROM public.user_roles ur WHERE ur.role::text IN ('boss', 'admin', 'master_developer')
  ) recipients
  WHERE NOT EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.user_id = recipients.user_id AND n.store_id = p_store_id
      AND n.type = 'reseller_sale'
      AND n.data @> jsonb_build_object('sale_id', p_sale_id)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.notify_reseller_sale(uuid, uuid, text, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_reseller_sale(uuid, uuid, text, numeric, text) TO authenticated;

COMMIT;
