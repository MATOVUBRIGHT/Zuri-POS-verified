import { supabase } from "@/integrations/supabase/client";

interface AuditLogParams {
  action: string;
  tableName: string;
  recordId?: string;
  oldData?: Record<string, unknown> | null;
  newData?: Record<string, unknown> | null;
  storeId: string;
  staffId?: string | null;
  staffName?: string | null;
}

export const logAudit = async ({
  action,
  tableName,
  recordId,
  oldData = null,
  newData = null,
  storeId,
  staffId = null,
  staffName = null,
}: AuditLogParams) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !storeId) return;

    const auditRecord = {
      user_id: user.id,
      store_id: storeId,
      action,
      table_name: tableName,
      record_id: recordId || null,
      staff_id: staffId || null,
      staff_name: staffName || null,
      old_data: oldData as any,
      new_data: newData as any,
    };

    const firstAttempt = await (supabase.from("audit_logs") as any).insert([auditRecord]);
    if (!firstAttempt.error) return;

    // Older deployed databases may expose only the legacy entity columns or
    // may not yet have staff metadata. Retry with the smallest shared shape so
    // audit failures never surface as a user-facing transaction error.
    const legacy = await (supabase.from("audit_logs") as any).insert([{
      user_id: user.id,
      store_id: storeId,
      action,
      entity_type: tableName,
      entity_id: recordId || null,
      old_data: oldData,
      new_data: newData,
    }]);
    if (!legacy.error) return;

    await (supabase.from("audit_logs") as any).insert([{
      user_id: user.id,
      store_id: storeId,
      action,
      old_data: oldData,
      new_data: newData,
    }]);
  } catch (error) {
    console.error("Failed to log audit:", error);
  }
};
