// @ts-nocheck -- Supabase Edge Functions run in Deno.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const { store_id, username, password } = body;

    if (!store_id || typeof store_id !== "string" ||
        !username || typeof username !== "string" ||
        !password || typeof password !== "string") {
      return json({ error: "Choose a branch and enter your username and password." }, 400);
    }

    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) {
      return json({ error: "Branch sign-in is not configured on this server." }, 503);
    }

    const admin = createClient(url, serviceKey);

    // Look up the staff member by branch + username
    const { data: staff, error: staffError } = await admin
      .from("staff")
      .select("user_id, auth_email")
      .eq("store_id", store_id)
      .eq("login_username", username.trim().toLowerCase())
      .eq("status", "active")
      .maybeSingle();

    if (staffError) {
      console.error("branch-login staff lookup:", staffError.message);
      return json({ error: "The branch, username, or password is incorrect." }, 401);
    }

    if (!staff?.user_id || !staff?.auth_email) {
      return json({ error: "The branch, username, or password is incorrect." }, 401);
    }

    // Exchange credentials for a session token via Supabase Auth REST
    const tokenResponse = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: staff.auth_email, password }),
    });

    if (!tokenResponse.ok) {
      // Don't leak auth error details to the client
      return json({ error: "The branch, username, or password is incorrect." }, 401);
    }

    const session = await tokenResponse.json().catch(() => null);

    // Guard against malformed/unexpected auth response
    if (!session || !session.access_token || !session.refresh_token) {
      console.error("branch-login: malformed session response from auth API", session);
      return json({ error: "Sign-in failed — please try again." }, 500);
    }

    // Confirm the issued token belongs to the staff member we looked up
    if (session.user?.id !== staff.user_id) {
      return json({ error: "This login is not assigned to the selected branch." }, 403);
    }

    return json({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      token_type: session.token_type ?? "bearer",
      expires_in: session.expires_in ?? 3600,
      store_id,
    });
  } catch (error) {
    console.error("branch-login", error);
    return json({ error: "We could not sign you in. Please try again." }, 500);
  }
});
