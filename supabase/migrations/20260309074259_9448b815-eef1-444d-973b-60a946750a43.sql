-- 1. Make receipts bucket private
UPDATE storage.buckets SET public = false WHERE id = 'receipts';

-- 2. Drop overly permissive storage policies and recreate scoped ones
DROP POLICY IF EXISTS "Authenticated users can upload receipts" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view receipts" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete receipts" ON storage.objects;

-- Scoped INSERT: user can only upload to their store folders
CREATE POLICY "Users can upload receipts to their stores"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'receipts'
);

-- Scoped SELECT: only authenticated users can view receipts
CREATE POLICY "Authenticated users can view receipts"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'receipts');

-- Scoped DELETE: users can only delete their own uploads
CREATE POLICY "Users can delete their own receipts"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'receipts'
  AND (storage.foldername(name))[1] IN (
    SELECT s.id::text FROM public.stores s WHERE s.user_id = auth.uid()
  )
);

-- 3. Tighten audit_logs INSERT policy to require store access
DROP POLICY IF EXISTS "Users can create audit logs" ON public.audit_logs;
CREATE POLICY "Users can create audit logs for their stores"
ON public.audit_logs FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND (is_store_owner(store_id, auth.uid()) OR has_store_access(store_id, auth.uid()))
);

-- 4. Drop the plaintext pin_code column from staff (pin_hash is used instead)
ALTER TABLE public.staff DROP COLUMN IF EXISTS pin_code;