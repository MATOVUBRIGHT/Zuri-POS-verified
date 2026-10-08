-- Storage policies for Tracker files in the private "receipts" bucket.
--
-- Every pre-existing policy on this bucket scopes access with
--   (storage.foldername(name))[1] IN (SELECT store ids the user can reach)
-- which requires the STORE ID to be the first folder in the object name.
--
-- Tracker originally uploaded to "tracker/<store_id>/<file>", so foldername[1]
-- was the literal "tracker" and no policy matched. Uploads were only possible
-- where a looser bucket-wide policy happened to exist, and preview/download via
-- createSignedUrl failed for anyone who could not read it -- which is the
-- "Preview failed" toast.
--
-- Tracker.tsx now uploads to "<store_id>/tracker/<file>", matching Expenses and
-- BankCashForm, so the existing store-scoped policies apply unchanged. The second
-- pair of policies below keeps files already written under the old
-- "tracker/<store_id>/..." layout readable, so previously uploaded documents
-- recover without a data migration.

-- New layout: <store_id>/tracker/<file>
DROP POLICY IF EXISTS "Branch users read tracker files" ON storage.objects;
CREATE POLICY "Branch users read tracker files" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] IN (
      SELECT s.id::text FROM public.stores s WHERE s.user_id = auth.uid()
      UNION
      SELECT sa.store_id::text FROM public.store_access sa WHERE sa.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Branch users insert tracker files" ON storage.objects;
CREATE POLICY "Branch users insert tracker files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] IN (
      SELECT s.id::text FROM public.stores s WHERE s.user_id = auth.uid()
      UNION
      SELECT sa.store_id::text FROM public.store_access sa WHERE sa.user_id = auth.uid()
    )
  );

-- Legacy layout: tracker/<store_id>/<file>
DROP POLICY IF EXISTS "Branch users read legacy tracker files" ON storage.objects;
CREATE POLICY "Branch users read legacy tracker files" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] = 'tracker'
    AND (storage.foldername(name))[2] IN (
      SELECT s.id::text FROM public.stores s WHERE s.user_id = auth.uid()
      UNION
      SELECT sa.store_id::text FROM public.store_access sa WHERE sa.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Branch users insert legacy tracker files" ON storage.objects;
CREATE POLICY "Branch users insert legacy tracker files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] = 'tracker'
    AND (storage.foldername(name))[2] IN (
      SELECT s.id::text FROM public.stores s WHERE s.user_id = auth.uid()
      UNION
      SELECT sa.store_id::text FROM public.store_access sa WHERE sa.user_id = auth.uid()
    )
  );