BEGIN;

-- Direct inbox messages may only target another user who belongs to a
-- different branch that the sender can access. This prevents self-inbox rows
-- even if a client bypasses the recipient picker.
DROP POLICY IF EXISTS "exec_msg_insert" ON public.executive_messages;
CREATE POLICY "exec_msg_insert" ON public.executive_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_user_id
    AND (
      (
        recipient_store_id IS NOT NULL
        AND public.can_chat_in_store(recipient_store_id, auth.uid())
        AND recipient_store_id IS DISTINCT FROM sender_store_id
      )
      OR
      (
        recipient_user_id IS NOT NULL
        AND recipient_user_id IS DISTINCT FROM auth.uid()
        AND EXISTS (
          SELECT 1
          FROM public.stores recipient_branch
          WHERE recipient_branch.user_id = recipient_user_id
            AND public.can_chat_in_store(recipient_branch.id, auth.uid())
            AND recipient_branch.id IS DISTINCT FROM sender_store_id
        )
        AND (
          EXISTS (
            SELECT 1
            FROM public.stores recipient_owner_branch
            WHERE recipient_owner_branch.user_id = recipient_user_id
              AND public.can_chat_in_store(recipient_owner_branch.id, auth.uid())
              AND recipient_owner_branch.id IS DISTINCT FROM sender_store_id
          )
          OR EXISTS (
            SELECT 1
            FROM public.store_access recipient_access
            WHERE recipient_access.user_id = recipient_user_id
              AND public.can_chat_in_store(recipient_access.store_id, auth.uid())
              AND recipient_access.store_id IS DISTINCT FROM sender_store_id
          )
        )
      )
    )
  );

-- Branch-to-branch inboxes also cannot address their own branch.
DROP POLICY IF EXISTS "Branch members send addressed messages" ON public.branch_messages;
CREATE POLICY "Branch members send addressed messages" ON public.branch_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND sender_store_id IS DISTINCT FROM recipient_store_id
    AND public.can_chat_in_store(sender_store_id, auth.uid())
    AND public.can_chat_in_store(recipient_store_id, auth.uid())
  );

COMMIT;
