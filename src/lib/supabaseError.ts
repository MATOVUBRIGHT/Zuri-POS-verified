type SupabaseLikeError = {
  message?: string | null;
  details?: string | null;
  hint?: string | null;
  code?: string | null;
  status?: number | null;
};

export const logSupabaseError = (
  context: string,
  error: unknown,
  meta?: Record<string, unknown>
) => {
  const e = (error || {}) as SupabaseLikeError;
  const payload = {
    context,
    code: e.code ?? null,
    status: e.status ?? null,
    message: e.message ?? "Unknown Supabase error",
    details: e.details ?? null,
    hint: e.hint ?? null,
    ...(meta || {}),
  };

  console.error("SUPABASE_ERROR", payload);
};
