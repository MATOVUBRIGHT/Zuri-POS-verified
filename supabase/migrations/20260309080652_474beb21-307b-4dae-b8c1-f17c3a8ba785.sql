
-- Fix receipt storage policies: drop all old/stale policies and recreate properly scoped ones

-- Drop ALL existing policies on storage.objects for receipts bucket
DROP POLICY IF EXISTS "Public read access for receipts" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view receipts" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view receipts" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload receipts" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their receipts" ON storage.objects;
DROP POLICY IF EXISTS "Store owners can delete receipts" ON storage.objects;

-- SELECT: Users can only view receipts from their own stores
CREATE POLICY "Users can view their store receipts"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'receipts'
  AND (storage.foldername(name))[1] IN (
    SELECT s.id::text FROM public.stores s WHERE s.user_id = auth.uid()
    UNION
    SELECT sa.store_id::text FROM public.store_access sa WHERE sa.user_id = auth.uid()
  )
);

-- INSERT: Users can only upload to their own store folders
CREATE POLICY "Users can upload to their store receipts"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'receipts'
  AND (storage.foldername(name))[1] IN (
    SELECT s.id::text FROM public.stores s WHERE s.user_id = auth.uid()
  )
);

-- DELETE: Store owners can delete receipts from their stores
CREATE POLICY "Store owners can delete their receipts"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'receipts'
  AND (storage.foldername(name))[1] IN (
    SELECT s.id::text FROM public.stores s WHERE s.user_id = auth.uid()
  )
);
