
CREATE POLICY "Users can link themselves to stores"
ON public.store_access
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id AND role = 'viewer');
