-- Product images are uploaded from the POS and authorized mobile devices.
-- Keep the bucket public so product cards can use stable public URLs on every
-- signed-in device, while restricting uploads to users who can access the
-- store encoded as the first path segment.
INSERT INTO storage.buckets (id, name, public)
VALUES ('pos-files', 'pos-files', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Authorized users upload product images" ON storage.objects;
CREATE POLICY "Authorized users upload product images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'pos-files'
  AND (storage.foldername(name))[2] = 'product-images'
  AND (storage.foldername(name))[1] IN (
    SELECT s.id::text FROM public.stores s WHERE s.user_id = auth.uid()
    UNION
    SELECT sa.store_id::text FROM public.store_access sa WHERE sa.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Authorized users update product images" ON storage.objects;
CREATE POLICY "Authorized users update product images"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'pos-files'
  AND (storage.foldername(name))[2] = 'product-images'
  AND (storage.foldername(name))[1] IN (
    SELECT s.id::text FROM public.stores s WHERE s.user_id = auth.uid()
    UNION
    SELECT sa.store_id::text FROM public.store_access sa WHERE sa.user_id = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'pos-files'
  AND (storage.foldername(name))[2] = 'product-images'
  AND (storage.foldername(name))[1] IN (
    SELECT s.id::text FROM public.stores s WHERE s.user_id = auth.uid()
    UNION
    SELECT sa.store_id::text FROM public.store_access sa WHERE sa.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Authorized users delete product images" ON storage.objects;
CREATE POLICY "Authorized users delete product images"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'pos-files'
  AND (storage.foldername(name))[2] = 'product-images'
  AND (storage.foldername(name))[1] IN (
    SELECT s.id::text FROM public.stores s WHERE s.user_id = auth.uid()
    UNION
    SELECT sa.store_id::text FROM public.store_access sa WHERE sa.user_id = auth.uid()
  )
);
