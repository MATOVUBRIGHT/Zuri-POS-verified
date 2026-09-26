-- Executive / accountant ↔ branch chat
-- Messages can flow:
--   executive → branch  (sender_user_id set, sender_store_id NULL)
--   branch → executive  (sender_store_id set, sender_user_id NULL)
--   executive → executive (both users set, both store IDs NULL)
-- The existing branch_messages table covers branch↔branch only.

create table if not exists public.executive_messages (
  id               uuid primary key default gen_random_uuid(),
  sender_user_id   uuid references auth.users(id) on delete set null,
  sender_store_id  uuid references public.stores(id) on delete set null,
  recipient_user_id  uuid references auth.users(id) on delete set null,
  recipient_store_id uuid references public.stores(id) on delete set null,
  message          text not null,
  read_at          timestamptz,
  created_at       timestamptz not null default now(),
  -- at least one recipient dimension must be set
  constraint recipient_required check (
    recipient_user_id is not null or recipient_store_id is not null
  )
);

-- Allow an owner/executive to see messages sent to them or by them.
-- RLS keeps everything tenant-scoped.
alter table public.executive_messages enable row level security;

create policy "exec_msg_sender_read" on public.executive_messages
  for select using (
    auth.uid() = sender_user_id
    or auth.uid() = recipient_user_id
    -- store owner can read messages addressed to their branch
    or recipient_store_id in (
      select id from public.stores where user_id = auth.uid()
    )
    -- store owner can see messages sent from their branch
    or sender_store_id in (
      select id from public.stores where user_id = auth.uid()
    )
    -- branch staff with store_access can read messages addressed to their branch
    or recipient_store_id in (
      select store_id from public.store_access where user_id = auth.uid()
    )
  );

create policy "exec_msg_insert" on public.executive_messages
  for insert with check (
    auth.uid() = sender_user_id
    or sender_store_id in (
      select id from public.stores where user_id = auth.uid()
      union
      select store_id from public.store_access where user_id = auth.uid()
    )
  );

create policy "exec_msg_update_read" on public.executive_messages
  for update using (
    auth.uid() = recipient_user_id
    or recipient_store_id in (
      select id from public.stores where user_id = auth.uid()
      union
      select store_id from public.store_access where user_id = auth.uid()
    )
  );

-- Realtime publication
alter publication supabase_realtime add table public.executive_messages;

-- Index for fast inbox queries
create index if not exists executive_messages_recipient_user_idx on public.executive_messages(recipient_user_id, created_at desc);
create index if not exists executive_messages_recipient_store_idx on public.executive_messages(recipient_store_id, created_at desc);
