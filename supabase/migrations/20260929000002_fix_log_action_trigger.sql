-- Fix log_action() trigger function.
-- The original implementation used OLD::jsonb and NEW::jsonb which fails on
-- tables whose composite row type name conflicts with user-defined types.
-- Specifically: "cannot cast type staff to jsonb" when inserting into staff table.
-- Fix: use to_jsonb(OLD) / to_jsonb(NEW) which is the safe explicit cast.
-- Also added EXCEPTION handler so audit logging never breaks the actual operation.

CREATE OR REPLACE FUNCTION public.log_action()
RETURNS TRIGGER AS $$
DECLARE
    v_store_id UUID;
    v_new_json jsonb;
    v_old_json jsonb;
BEGIN
    -- Use to_jsonb() explicitly — casting via ::jsonb fails on tables whose
    -- composite row type shares a name with a user-defined type (e.g. staff).
    v_old_json := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END;
    v_new_json := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END;

    v_store_id := CASE
        WHEN TG_OP = 'DELETE' THEN (v_old_json->>'store_id')::UUID
        ELSE (v_new_json->>'store_id')::UUID
    END;

    INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, old_data, new_data)
    VALUES (
        auth.uid(),
        v_store_id,
        TG_OP,
        TG_TABLE_NAME,
        COALESCE((v_new_json->>'id')::UUID, (v_old_json->>'id')::UUID),
        v_old_json,
        v_new_json
    );
    RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN others THEN
    -- Never let audit logging break the actual operation
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
