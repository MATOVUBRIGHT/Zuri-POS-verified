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

    await supabase.from("audit_logs").insert([{
      user_id: user.id,
      store_id: storeId,
      action,
      table_name: tableName,
      record_id: recordId || null,
      old_data: oldData as any,
      new_data: newData as any,
      staff_id: staffId,
      staff_name: staffName,
    }]);
  } catch (error) {
    console.error("Failed to log audit:", error);
  }
};
