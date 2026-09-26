// @ts-nocheck -- only exposes branch names/identifiers needed for the public sign-in selector.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Loose UUID v4 shape check — doesn't need to be cryptographically strict. */
const looksLikeUuid = (s: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.trim());

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let businessId = "";
  try {
    const url = new URL(req.url);
    businessId = url.searchParams.get("business_id") || "";
    if (!businessId && req.method === "POST") {
      const body = await req.json();
      businessId = body.business_id || "";
    }
  } catch (_) {
    // ignore parse errors
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return json({ error: "Branch sign-in is not configured on this server." }, 503);
  }

  const admin = createClient(supabaseUrl, serviceKey);

  // ── Path A: caller passed a direct branch/store UUID ──────────────────────
  // This lets staff log in by pasting or scanning their branch ID directly,
  // without knowing their executive's Business ID.
  if (looksLikeUuid(businessId)) {
    const { data: store, error } = await admin
      .from("stores")
      .select("id, store_name")
      .eq("id", businessId.trim())
      .maybeSingle();

    if (error || !store) {
      return json(
        { branches: [], error: "No branch found for this ID. Check the ID and try again." },
        200,
      );
    }

    return json({ branches: [{ id: store.id, store_name: store.store_name }] });
  }

  // ── Path B: caller passed an Executive Business ID (phone-based) ──────────
  if (!businessId.trim()) {
    return json({ branches: [] });
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("user_id")
    .eq("phone", businessId.trim())
    .maybeSingle();

  if (!profile) {
    return json({ branches: [], error: "Invalid Executive Business ID." }, 200);
  }

  const { data, error } = await admin
    .from("stores")
    .select("id, store_name")
    .eq("user_id", profile.user_id)
    .order("store_name");

  if (error) {
    return json({ error: "Could not load branches." }, 500);
  }

  return json({ branches: data || [] });
});
