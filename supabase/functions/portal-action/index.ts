// @ts-nocheck -- Supabase Edge Functions run in Deno.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-portal-key",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Secret read from env — never hardcode in source.
// Set PORTAL_SECRET in Supabase Dashboard → Edge Functions → Secrets.
const PORTAL_SECRET = Deno.env.get("PORTAL_SECRET");

/** Validate a UUID v4 string to prevent injection via payload fields. */
const isUuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    // Require the portal secret. Reject if not configured so deployments
    // without the secret fail loudly instead of being open.
    if (!PORTAL_SECRET) {
      console.error("[portal-action] PORTAL_SECRET env var is not set.");
      return json({ error: "Portal is not configured on this server." }, 503);
    }

    const portalKey = req.headers.get("x-portal-key");
    if (!portalKey || portalKey !== PORTAL_SECRET) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const { action, payload } = body;

    if (!action || typeof action !== "string") {
      return json({ error: "action is required" }, 400);
    }
    if (!payload || typeof payload !== "object") {
      return json({ error: "payload is required" }, 400);
    }

    let result: unknown = null;

    switch (action) {
      case "verify_subscription": {
        const { sub_id, user_id } = payload as Record<string, unknown>;
        if (!isUuid(sub_id)) return json({ error: "Invalid sub_id" }, 400);
        if (!isUuid(user_id)) return json({ error: "Invalid user_id" }, 400);
        const now = new Date().toISOString();
        const { error: e1 } = await admin
          .from("user_subscriptions")
          .update({ status: "active", verified_at: now, updated_at: now })
          .eq("id", sub_id);
        if (e1) {
          await admin.from("user_subscriptions").update({ status: "active" }).eq("id", sub_id);
        }
        await admin
          .from("profiles")
          .update({ account_status: "active", is_active: true })
          .eq("user_id", user_id)
          .catch(() => {});
        result = { ok: true };
        break;
      }
      case "revoke_subscription": {
        const { sub_id } = payload as Record<string, unknown>;
        if (!isUuid(sub_id)) return json({ error: "Invalid sub_id" }, 400);
        const now = new Date().toISOString();
        const { error: e1 } = await admin
          .from("user_subscriptions")
          .update({ status: "expired", updated_at: now })
          .eq("id", sub_id);
        if (e1) {
          await admin.from("user_subscriptions").update({ status: "expired" }).eq("id", sub_id);
        }
        result = { ok: true };
        break;
      }
      case "suspend_user": {
        const { user_id } = payload as Record<string, unknown>;
        if (!isUuid(user_id)) return json({ error: "Invalid user_id" }, 400);
        await admin.from("profiles").update({ account_status: "suspended" }).eq("user_id", user_id);
        result = { ok: true };
        break;
      }
      case "reactivate_user": {
        const { user_id } = payload as Record<string, unknown>;
        if (!isUuid(user_id)) return json({ error: "Invalid user_id" }, 400);
        await admin.from("profiles").update({ account_status: "active" }).eq("user_id", user_id);
        result = { ok: true };
        break;
      }
      case "delete_user": {
        const { user_id, sub_id } = payload as Record<string, unknown>;
        if (!isUuid(user_id)) return json({ error: "Invalid user_id" }, 400);
        await admin
          .from("profiles")
          .update({ account_status: "deleted", is_active: false })
          .eq("user_id", user_id);
        if (sub_id !== undefined) {
          if (!isUuid(sub_id)) return json({ error: "Invalid sub_id" }, 400);
          const { error: e1 } = await admin
            .from("user_subscriptions")
            .update({ is_deleted: true, status: "expired" })
            .eq("id", sub_id);
          if (e1) {
            await admin.from("user_subscriptions").update({ status: "expired" }).eq("id", sub_id);
          }
        }
        result = { ok: true };
        break;
      }
      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }

    return json(result);
  } catch (err) {
    console.error("[portal-action]", err);
    return json({ error: String((err as Error)?.message || err) }, 500);
  }
});
