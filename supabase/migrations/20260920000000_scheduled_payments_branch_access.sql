-- Scheduled payments are optional in older deployments. Creating the table here
-- makes the role workspace deployable in either order, while RLS keeps every
-- payment visible only to users assigned to its branch.
CREATE TABLE IF NOT EXISTS public.scheduled_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  payee text NOT NULL,
  amount numeric NOT NULL CHECK (amount >= 0),
  schedule_type text NOT NULL DEFAULT 'other',
  period text NOT NULL DEFAULT 'monthly',
  month text,
  notes text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'authorized', 'approved', 'paid', 'rejected')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  authorized_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  authorized_at timestamptz,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  rejected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  rejected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scheduled_payments_store_status_created_idx
  ON public.scheduled_payments (store_id, status, created_at DESC);

ALTER TABLE public.scheduled_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Assigned users view scheduled payments" ON public.scheduled_payments;
CREATE POLICY "Assigned users view scheduled payments" ON public.scheduled_payments FOR SELECT TO authenticated
  USING (public.can_chat_in_store(store_id, auth.uid()));
DROP POLICY IF EXISTS "Assigned users create scheduled payments" ON public.scheduled_payments;
CREATE POLICY "Assigned users create scheduled payments" ON public.scheduled_payments FOR INSERT TO authenticated
  WITH CHECK (public.can_chat_in_store(store_id, auth.uid()) AND created_by = auth.uid());
DROP POLICY IF EXISTS "Assigned users update scheduled payments" ON public.scheduled_payments;
CREATE POLICY "Assigned users update scheduled payments" ON public.scheduled_payments FOR UPDATE TO authenticated
  USING (public.can_chat_in_store(store_id, auth.uid()))
  WITH CHECK (public.can_chat_in_store(store_id, auth.uid()));

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
  AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'scheduled_payments') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.scheduled_payments;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
