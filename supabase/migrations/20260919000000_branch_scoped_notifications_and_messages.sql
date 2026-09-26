-- New notifications must carry their branch. Existing rows remain nullable because
-- their correct branch cannot be inferred safely from historical JSON metadata.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS notifications_user_store_created_idx
  ON public.notifications (user_id, store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_store_unread_idx
  ON public.notifications (store_id, read, created_at DESC)
  WHERE store_id IS NOT NULL;

-- Replace the legacy user-only policies for newly scoped rows. NULL legacy rows
-- remain readable by their owner but are never returned by branch-scoped clients.
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their notifications" ON public.notifications;
CREATE POLICY "Users can view their notifications" ON public.notifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id AND (store_id IS NULL OR public.can_chat_in_store(store_id, auth.uid())));
DROP POLICY IF EXISTS "Users can update their notifications" ON public.notifications;
CREATE POLICY "Users can update their notifications" ON public.notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND (store_id IS NULL OR public.can_chat_in_store(store_id, auth.uid())))
  WITH CHECK (auth.uid() = user_id AND (store_id IS NULL OR public.can_chat_in_store(store_id, auth.uid())));
DROP POLICY IF EXISTS "Users can create their own notifications" ON public.notifications;
CREATE POLICY "Users can create their own notifications" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND store_id IS NOT NULL AND public.can_chat_in_store(store_id, auth.uid()));

-- Secure, branch-addressed staff inbox. "All branches" is sent as one permitted
-- recipient row per branch, so a recipient can only ever read its own rows.
CREATE TABLE IF NOT EXISTS public.branch_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  recipient_store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  message text NOT NULL CHECK (length(trim(message)) BETWEEN 1 AND 4000),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS branch_messages_recipient_created_idx
  ON public.branch_messages (recipient_store_id, created_at DESC);

ALTER TABLE public.branch_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Branch members read addressed messages" ON public.branch_messages;
CREATE POLICY "Branch members read addressed messages" ON public.branch_messages FOR SELECT TO authenticated
  USING (sender_id = auth.uid() OR public.can_chat_in_store(recipient_store_id, auth.uid()));
DROP POLICY IF EXISTS "Branch members send addressed messages" ON public.branch_messages;
CREATE POLICY "Branch members send addressed messages" ON public.branch_messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid()
    AND public.can_chat_in_store(sender_store_id, auth.uid())
    AND public.can_chat_in_store(recipient_store_id, auth.uid()));
DROP POLICY IF EXISTS "Recipients read their messages" ON public.branch_messages;
CREATE POLICY "Recipients read their messages" ON public.branch_messages FOR UPDATE TO authenticated
  USING (public.can_chat_in_store(recipient_store_id, auth.uid()))
  WITH CHECK (public.can_chat_in_store(recipient_store_id, auth.uid()));

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
  AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'branch_messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.branch_messages;
  END IF;
END $$;

-- Make the new table and column immediately visible to Supabase's REST schema.
NOTIFY pgrst, 'reload schema';
