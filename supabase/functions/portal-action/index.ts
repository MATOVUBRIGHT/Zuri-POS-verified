import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-portal-key",
};

// Simple shared secret — change this to something only you know
const PORTAL_SECRET = "zuri-portal-secret-2026";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Verify portal secret header
    const portalKey = req.headers.get("x-portal-key");
    if (portalKey !== PORTAL_SECRET) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const { action, payload } = await req.json();

    let result: any = null;

    switch (action) {
      case "verify_subscription": {
        const { sub_id, user_id } = payload;
        const update: any = { status: "active" };
        // Try with optional columns first
        const { error: e1 } = await admin.from("user_subscriptions")
          .update({ ...update, verified_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("id", sub_id);
        if (e1) await admin.from("user_subscriptions").update(update).eq("id", sub_id);
        await admin.from("profiles").update({ account_status: "active", is_active: true }).eq("user_id", user_id).catch(() => {});
        result = { ok: true };
        break;
      }
      case "revoke_subscription": {
        const { sub_id } = payload;
        const update: any = { status: "expired" };
        const { error: e1 } = await admin.from("user_subscriptions")
          .update({ ...update, updated_at: new Date().toISOString() }).eq("id", sub_id);
        if (e1) await admin.from("user_subscriptions").update(update).eq("id", sub_id);
        result = { ok: true };
        break;
      }
      case "suspend_user": {
        const { user_id } = payload;
        await admin.from("profiles").update({ account_status: "suspended" }).eq("user_id", user_id);
        result = { ok: true };
        break;
      }
      case "reactivate_user": {
        const { user_id } = payload;
        await admin.from("profiles").update({ account_status: "active" }).eq("user_id", user_id);
        result = { ok: true };
        break;
      }
      case "delete_user": {
        const { user_id, sub_id } = payload;
        await admin.from("profiles").update({ account_status: "deleted", is_active: false }).eq("user_id", user_id);
        if (sub_id) {
          const { error: e1 } = await admin.from("user_subscriptions")
            .update({ is_deleted: true, status: "expired" }).eq("id", sub_id);
          if (e1) await admin.from("user_subscriptions").update({ status: "expired" }).eq("id", sub_id);
        }
        result = { ok: true };
        break;
      }
      default:
        return new Response(JSON.stringify({ error: "Unknown action: " + action }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    return new Response(JSON.stringify(result), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
