-- Walk-in days are now edited rather than appended: saving a day replaces that
-- day's figures instead of inserting another row. That needs three things.
--
-- 1. RLS allowed SELECT/INSERT/UPDATE but not DELETE, so replacing a day's
--    figures was rejected by the database.
-- 2. A unique index per (store, day, visitor group) so a day cannot drift into
--    duplicate rows again.
-- 3. Legacy rows created by the old append-only form are collapsed first,
--    otherwise the unique index cannot be created.

-- Collapse legacy duplicates: keep one row per group and sum the figures.
WITH grouped AS (
  SELECT
    store_id,
    recorded_date,
    visitor_type,
    max(id::text) AS keep_id,
    sum(expat_female)::int AS expat_female,
    sum(expat_male)::int   AS expat_male,
    sum(local_female)::int AS local_female,
    sum(local_male)::int   AS local_male
  FROM public.walkin_counts
  GROUP BY store_id, recorded_date, visitor_type
)
UPDATE public.walkin_counts w
SET expat_female = g.expat_female,
    expat_male   = g.expat_male,
    local_female = g.local_female,
    local_male   = g.local_male
FROM grouped g
WHERE w.id::text = g.keep_id
  AND (w.expat_female, w.expat_male, w.local_female, w.local_male)
      IS DISTINCT FROM (g.expat_female, g.expat_male, g.local_female, g.local_male);

-- Drop the rows that were folded into the keeper.
WITH grouped AS (
  SELECT store_id, recorded_date, visitor_type, max(id::text) AS keep_id
  FROM public.walkin_counts
  GROUP BY store_id, recorded_date, visitor_type
)
DELETE FROM public.walkin_counts w
USING grouped g
WHERE w.store_id      = g.store_id
  AND w.recorded_date = g.recorded_date
  AND w.visitor_type  = g.visitor_type
  AND w.id::text <> g.keep_id;

CREATE UNIQUE INDEX IF NOT EXISTS walkin_counts_store_date_type_uniq
  ON public.walkin_counts(store_id, recorded_date, visitor_type);

ALTER TABLE public.walkin_counts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS walkin_counts_delete_scoped ON public.walkin_counts;
CREATE POLICY walkin_counts_delete_scoped ON public.walkin_counts FOR DELETE
  USING (public.is_store_owner(store_id, auth.uid()) OR public.has_store_access(store_id, auth.uid()));