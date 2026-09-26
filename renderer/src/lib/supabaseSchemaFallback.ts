import { supabase } from "@/integrations/supabase/client";

type MissingColumnResult = {
  missingColumn: string | null;
  isMissingColumnError: boolean;
};

const detectMissingColumn = (error: unknown): MissingColumnResult => {
  const err = error as { message?: string; code?: string } | null;
  const message = String(err?.message || "");
  const code = String(err?.code || "");
  const lowered = message.toLowerCase();

  const isMissingColumnError =
    code.startsWith("PGRST2") ||
    lowered.includes("does not exist") ||
    (lowered.includes("could not find") && lowered.includes("column")) ||
    lowered.includes("schema cache");

  if (!isMissingColumnError) {
    return { missingColumn: null, isMissingColumnError: false };
  }

  const singleQuoteMatch = message.match(/'([^']+)'/);
  if (singleQuoteMatch?.[1]) {
    return { missingColumn: singleQuoteMatch[1], isMissingColumnError: true };
  }

  const columnMatch = message.match(/column\s+([a-zA-Z0-9_]+)/i);
  if (columnMatch?.[1]) {
    return { missingColumn: columnMatch[1], isMissingColumnError: true };
  }

  return { missingColumn: null, isMissingColumnError: true };
};

const stripColumn = <T extends Record<string, unknown>>(row: T, column: string): T => {
  if (!(column in row)) return row;
  const next = { ...row };
  delete next[column];
  return next as T;
};

export async function updateByIdWithSchemaFallback<T extends Record<string, unknown>>(
  table: string,
  id: string,
  payload: T
): Promise<{ error: unknown; removedColumns: string[] }> {
  let working = { ...payload };
  const removed = new Set<string>();

  for (let i = 0; i < 15; i++) {
    const result = await (supabase as any).from(table).update(working).eq("id", id);
    if (!result.error) return { error: null, removedColumns: Array.from(removed) };

    const { missingColumn, isMissingColumnError } = detectMissingColumn(result.error);
    if (!isMissingColumnError || !missingColumn || removed.has(missingColumn) || !(missingColumn in working)) {
      return { error: result.error, removedColumns: Array.from(removed) };
    }

    removed.add(missingColumn);
    working = stripColumn(working, missingColumn);
  }

  return { error: new Error("Schema fallback exhausted"), removedColumns: Array.from(removed) };
}

export async function insertRowsWithSchemaFallback<T extends Record<string, unknown>>(
  table: string,
  rows: T[]
): Promise<{ data: unknown; error: unknown; removedColumns: string[] }> {
  let working = rows.map((row) => ({ ...row }));
  const removed = new Set<string>();

  for (let i = 0; i < 15; i++) {
    const result = await (supabase as any).from(table).insert(working).select();
    if (!result.error) {
      return { data: result.data, error: null, removedColumns: Array.from(removed) };
    }

    const { missingColumn, isMissingColumnError } = detectMissingColumn(result.error);
    if (!isMissingColumnError || !missingColumn || removed.has(missingColumn)) {
      return { data: null, error: result.error, removedColumns: Array.from(removed) };
    }

    const hasColumn = working.some((row) => missingColumn in row);
    if (!hasColumn) {
      return { data: null, error: result.error, removedColumns: Array.from(removed) };
    }

    removed.add(missingColumn);
    working = working.map((row) => stripColumn(row, missingColumn));
  }

  return { data: null, error: new Error("Schema fallback exhausted"), removedColumns: Array.from(removed) };
}
