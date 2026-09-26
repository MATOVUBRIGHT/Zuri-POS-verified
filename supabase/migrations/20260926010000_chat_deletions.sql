-- Per-user chat deletion (WhatsApp-style "Delete chat").
--
-- A deleted chat is hidden for the deleting user ONLY. The other party keeps
-- their copy, and no message rows are ever removed: this table stores just a
-- marker per (user, counterpart).
--
-- Resurrection: a thread reappears automatically once a message newer than
-- deleted_at arrives, because that is what clients compare against. No extra
-- write is needed to un-hide a thread.
--
-- Covers both chat tables:
--   public.executive_messages  (executive <-> branch / executive)
--   public.branch_messages     (branch <-> branch)

create table if not exists public.chat_deletions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  scope       text not null check (scope in ('user', 'store')),
  peer_id     uuid not null,
  deleted_at  timestamptz not null default now(),
  unique (user_id, scope, peer_id)
);

alter table public.chat_deletions enable row level security;

-- A user may only ever see, write, or clear their own markers.
create policy "chat_deletions_own_select" on public.chat_deletions
  for select using (auth.uid() = user_id);

create policy "chat_deletions_own_insert" on public.chat_deletions
  for insert with check (auth.uid() = user_id);

create policy "chat_deletions_own_delete" on public.chat_deletions
  for delete using (auth.uid() = user_id);

create policy "chat_deletions_own_update" on public.chat_deletions
  for update using (auth.uid() = user_id);

-- Fast lookup of "which threads has this user hidden?"
create index if not exists chat_deletions_user_idx
  on public.chat_deletions(user_id);
