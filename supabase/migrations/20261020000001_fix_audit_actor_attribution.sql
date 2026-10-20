-- Preserve the staff member who performed a POS action when the database
-- audit trigger runs under the executive's authenticated session.
CREATE OR REPLACE FUNCTION public.log_action()
RETURNS TRIGGER AS $$
DECLARE
  v_store_id uuid;
  v_record_id uuid;
  v_staff_id uuid;
  v_staff_name text;
  v_new_json jsonb;
  v_old_json jsonb;
BEGIN
  v_old_json := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END;
  v_new_json := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END;

  v_store_id := NULLIF(COALESCE(v_new_json->>'store_id', v_old_json->>'store_id'), '')::uuid;
  v_record_id := NULLIF(COALESCE(v_new_json->>'id', v_old_json->>'id'), '')::uuid;
  v_staff_id := NULLIF(COALESCE(v_new_json->>'staff_id', v_old_json->>'staff_id'), '')::uuid;

  IF v_staff_id IS NOT NULL THEN
    SELECT full_name INTO v_staff_name
    FROM public.staff
    WHERE id = v_staff_id;
  END IF;

  INSERT INTO public.audit_logs (
    user_id, store_id, action, table_name, record_id,
    staff_id, staff_name, old_data, new_data
  )
  VALUES (
    auth.uid(), v_store_id, TG_OP, TG_TABLE_NAME, v_record_id,
    v_staff_id, v_staff_name, v_old_json, v_new_json
  );

  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN others THEN
  -- Audit failures must never block the underlying business operation.
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
