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

    // Keep the primary payload to columns present in the original audit table.
    // Staff metadata is optional and was added by a later migration.
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

    const firstAttempt = await supabase.from("audit_logs").insert([auditRecord]);
    if (!firstAttempt.error) return;

    const legacy = await supabase.from("audit_logs").insert([{
      user_id: user.id, store_id: storeId, action, entity_type: tableName,
      entity_id: recordId || null, old_data: oldData, new_data: newData,
      staff_id: staffId || null,
      staff_name: staffName || null,
    } as any]);
    if (legacy.error) throw legacy.error;
  } catch (error) {
    console.error("Failed to log audit:", error);
  }
};
