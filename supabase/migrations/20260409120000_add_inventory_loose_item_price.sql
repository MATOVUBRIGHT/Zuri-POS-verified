alter table if exists public.inventory
add column if not exists loose_item_price numeric default 0;
