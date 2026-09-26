// @ts-nocheck -- Supabase Edge Functions run in Deno.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const response = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const usernamePattern = /^[a-z0-9][a-z0-9._-]{2,48}$/i;
const allowedRoles = new Set(["cashier", "manager", "admin", "accountant"]);
// Keep this server allow-list aligned with src/lib/posPageRegistry.ts. Store,
// security, settings and executive/platform pages must never be grantable to a
// direct branch login, even if a caller crafts an Edge Function request.
const branchAssignablePages = new Set(["dashboard", "products", "suppliers", "stock-entry", "sales-entry", "inventory", "barcode-manager", "customers", "expenses", "accounts", "returns", "staff", "shifts", "reports", "cash-sales-report"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return response({ error: "Method not allowed" }, 405);

  try {
    const authorization = req.headers.get("Authorization");
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!authorization || !url || !anonKey || !serviceKey) return response({ error: "Branch access is not configured on this server." }, 503);

    const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return response({ error: "Your executive session has expired. Please sign in again." }, 401);

    const body = await req.json();
    const action = body.action || "upsert";
    const storeId = typeof body.store_id === "string" ? body.store_id : "";
    if (!storeId) return response({ error: "Choose a branch before saving a team member." }, 400);

    const admin = createClient(url, serviceKey);
    const { data: ownedStore } = await admin.from("stores").select("id").eq("id", storeId).eq("user_id", caller.id).maybeSingle();
    if (!ownedStore) return response({ error: "You can only manage staff for branches you own." }, 403);

    if (action === "deactivate") {
      if (typeof body.staff_id !== "string") return response({ error: "Staff member is required." }, 400);
      const { data: staff, error } = await admin.from("staff").select("id, user_id").eq("id", body.staff_id).eq("store_id", storeId).maybeSingle();
      if (error || !staff) return response({ error: "Staff member was not found for this branch." }, 404);
      await admin.from("staff").update({ status: "inactive" }).eq("id", staff.id);
      if (staff.user_id) await admin.from("store_access").delete().eq("store_id", storeId).eq("user_id", staff.user_id);
      return response({ success: true });
    }

    const fullName = String(body.full_name || "").trim();
    const username = String(body.username || "").trim().toLowerCase();
    const password = String(body.password || "");
    const role = String(body.role || "cashier").toLowerCase();
    const allowedPages = Array.isArray(body.allowed_pages) ? body.allowed_pages.filter((page) => typeof page === "string" && branchAssignablePages.has(page)) : [];
    if (!fullName || !usernamePattern.test(username) || !allowedRoles.has(role)) return response({ error: "Enter a name, a valid username, and a valid role." }, 400);
    if (password && password.length < 8) return response({ error: "Password must be at least 8 characters." }, 400);

    let staff = null;
    if (body.staff_id) {
      const { data, error } = await admin.from("staff").select("id, user_id").eq("id", body.staff_id).eq("store_id", storeId).maybeSingle();
      if (error || !data) return response({ error: "Staff member was not found for this branch." }, 404);
      staff = data;
    }
    if (!staff && !password) return response({ error: "Set a password when creating a new branch login." }, 400);

    const authEmail = `${username}.${storeId.replaceAll("-", "")}@branch.zuripos.local`;
    let authUserId = staff?.user_id || null;
    if (authUserId) {
      const update = { email: authEmail, user_metadata: { full_name: fullName, branch_id: storeId, branch_role: role } };
      if (password) update.password = password;
      const { error } = await admin.auth.admin.updateUserById(authUserId, update);
      if (error) return response({ error: error.message || "Could not update the login account." }, 400);
    } else {
      const { data, error } = await admin.auth.admin.createUser({ email: authEmail, password, email_confirm: true, user_metadata: { full_name: fullName, branch_id: storeId, branch_role: role } });
      if (error || !data.user) return response({ error: error?.message || "Could not create the login account." }, 400);
      authUserId = data.user.id;
    }

    const payload = { store_id: storeId, user_id: authUserId, full_name: fullName, employee_id: username, login_username: username, auth_email: authEmail, role, allowed_pages: allowedPages, status: "active", updated_at: new Date().toISOString() };
    const result = staff
      ? await admin.from("staff").update(payload).eq("id", staff.id).select("id").single()
      : await admin.from("staff").insert(payload).select("id").single();
    if (result.error) return response({ error: result.error.message || "The staff profile could not be saved." }, 400);

    const { error: grantError } = await admin.from("store_access").upsert({ store_id: storeId, user_id: authUserId, role, granted_by: caller.id }, { onConflict: "store_id,user_id" });
    if (grantError) return response({ error: grantError.message || "The branch assignment could not be saved." }, 400);
    return response({ success: true, staff_id: result.data.id });
  } catch (error) {
    console.error("provision-branch-user", error);
    return response({ error: "We could not save this branch login. Please try again." }, 500);
  }
});
