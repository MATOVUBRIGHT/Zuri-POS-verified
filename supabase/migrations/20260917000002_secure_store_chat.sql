-- Branch chat is deliberately scoped to a store the caller owns or has been
-- explicitly linked to. A message is always addressed to that branch owner.
CREATE OR REPLACE FUNCTION public.can_chat_in_store(check_store_id uuid, check_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_store_owner(check_store_id, check_user_id)
      OR public.has_store_access(check_store_id, check_user_id)
$$;

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view messages they sent or received" ON public.messages;
DROP POLICY IF EXISTS "Users can create messages" ON public.messages;
DROP POLICY IF EXISTS "Linked store participants read messages" ON public.messages;
DROP POLICY IF EXISTS "Linked store participants send messages" ON public.messages;
DROP POLICY IF EXISTS "Recipients mark messages read" ON public.messages;
DROP POLICY IF EXISTS "Senders delete their messages" ON public.messages;

CREATE POLICY "Linked store participants read messages"
  ON public.messages FOR SELECT TO authenticated
  USING (
    (auth.uid() = sender_id OR auth.uid() = receiver_id)
    AND public.can_chat_in_store(store_id, auth.uid())
  );

CREATE POLICY "Linked store participants send messages"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND public.can_chat_in_store(store_id, auth.uid())
    AND EXISTS (SELECT 1 FROM public.stores WHERE id = store_id AND user_id = receiver_id)
  );

CREATE POLICY "Recipients mark messages read"
  ON public.messages FOR UPDATE TO authenticated
  USING (auth.uid() = receiver_id AND public.can_chat_in_store(store_id, auth.uid()))
  WITH CHECK (auth.uid() = receiver_id AND public.can_chat_in_store(store_id, auth.uid()));

CREATE POLICY "Senders delete their messages"
  ON public.messages FOR DELETE TO authenticated
  USING (auth.uid() = sender_id AND public.can_chat_in_store(store_id, auth.uid()));

GRANT EXECUTE ON FUNCTION public.can_chat_in_store(uuid, uuid) TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END $$;
