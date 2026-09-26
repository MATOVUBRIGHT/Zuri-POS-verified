alter table if exists public.inventory
add column if not exists barcode_type text;
