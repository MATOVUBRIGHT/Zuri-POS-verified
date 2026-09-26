import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { generateBarcodeByType, validateBarcode } from "@/lib/barcode";
import { sanitizeInventoryPayload } from "@/lib/inventoryPayload";
import { logSupabaseError } from "@/lib/supabaseError";

export type InventoryInsert = Database["public"]["Tables"]["inventory"]["Insert"];

export class InventoryValidationError extends Error {
  name = "InventoryValidationError";
}

export async function insertInventoryItem(payload: InventoryInsert) {
  const barcodeType = (payload.barcode_type || "CODE128") as any;

  const providedBarcode = typeof payload.barcode === "string" ? payload.barcode.trim() : "";
  let barcode = providedBarcode || generateBarcodeByType(barcodeType);

  if (!validateBarcode(barcode, barcodeType)) {
    // Forgiving behavior: if invalid, replace with a generated barcode.
    barcode = generateBarcodeByType(barcodeType);
  }

  const attemptInsert = async (finalBarcode: string) => {
    const sanitizedPayload = sanitizeInventoryPayload({
      ...payload,
      barcode: finalBarcode,
    } as Record<string, unknown>);

    return supabase
      .from("inventory")
      .insert([sanitizedPayload as any])
      .select("id, barcode")
      .single();
  };

  let { data, error } = await attemptInsert(barcode);

  // Backward-compatible fallback: if schema cache misses one or more columns, strip them and retry.
  if (error && String((error as any).code || "").startsWith("PGRST2")) {
    const basePayload = sanitizeInventoryPayload({
      ...payload,
      barcode,
    } as Record<string, unknown>) as Record<string, unknown>;

    let mutablePayload = { ...basePayload };
    let currentError: any = error;

    for (let i = 0; i < 12; i++) {
      const message = String(currentError?.message || "");
      const missingColumn = message.match(/Could not find the '([^']+)' column/i)?.[1];
      if (!missingColumn || !(missingColumn in mutablePayload)) break;

      delete mutablePayload[missingColumn];
      const retryWithoutMissingColumn = await supabase
        .from("inventory")
        .insert([mutablePayload as any])
        .select("id, barcode")
        .single();

      data = retryWithoutMissingColumn.data;
      error = retryWithoutMissingColumn.error;
      if (!error) break;
      currentError = error;
    }
  }

  // If a unique constraint exists in some environments, auto-resolve and retry once.
  if (error && String((error as any).code || "") === "23505") {
    const adjusted = `${barcode}-${Date.now()}`;
    const retry = await attemptInsert(adjusted);
    data = retry.data;
    error = retry.error;
    if (!error) {
      // Inform caller if they care to display it.
      return { ...data, barcodeAdjusted: true };
    }
  }

  if (error) {
    logSupabaseError("inventoryService.insertInventoryItem", error);
    throw error;
  }
  return { ...data, barcodeAdjusted: false };
}
