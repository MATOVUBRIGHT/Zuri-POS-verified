
CREATE OR REPLACE FUNCTION public.lookup_store_for_linking(_store_id uuid)
RETURNS TABLE(id uuid, store_name text, user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT s.id, s.store_name, s.user_id
  FROM public.stores s
  WHERE s.id = _store_id
  LIMIT 1;
$$;
