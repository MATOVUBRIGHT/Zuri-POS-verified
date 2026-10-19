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
const branchAssignablePages = new Set([
  "dashboard", "products", "suppliers", "supplier-reports",
  "stock-entry", "sales-entry",
  "inventory", "barcode-manager", "customers", "expenses",
  "accounts", "banking", "scheduled-payments", "tracker",
  "returns", "staff", "shifts", "reports",
]);

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

    const body = await req.json().catch(() => null);
    if (!body) return response({ error: "Invalid JSON in request body." }, 400);
    const action = body.action || "upsert";
    const storeId = typeof body.store_id === "string" ? body.store_id : "";
    if (!storeId) return response({ error: "Choose a branch before saving a team member." }, 400);

    const admin = createClient(url, serviceKey);
    const { data: ownedStore } = await admin.from("stores").select("id").eq("id", storeId).eq("user_id", caller.id).maybeSingle();
    const { data: accessRecord } = await admin.from("store_access").select("role").eq("store_id", storeId).eq("user_id", caller.id).maybeSingle();
    const canManageStaff = Boolean(ownedStore) || ["boss", "admin", "manager"].includes(String(accessRecord?.role || "").toLowerCase());
    if (!canManageStaff) return response({ error: "Only a store owner, boss, admin or manager can manage branch users." }, 403);

    if (action === "deactivate") {
      if (typeof body.staff_id !== "string") return response({ error: "Staff member is required." }, 400);
      const { data: staffRow, error: staffErr } = await admin.from("staff").select("id, user_id").eq("id", body.staff_id).eq("store_id", storeId).maybeSingle();
      if (staffErr || !staffRow) return response({ error: "Staff member was not found for this branch." }, 404);
      await admin.from("staff").update({ status: "inactive" }).eq("id", staffRow.id);
      if (staffRow.user_id) await admin.from("store_access").delete().eq("store_id", storeId).eq("user_id", staffRow.user_id);
      return response({ success: true });
    }

    const fullName = String(body.full_name || "").trim();
    const username = String(body.username || "").trim().toLowerCase();
    const password = String(body.password || "");
    const role = String(body.role || "cashier").toLowerCase();

    // Filter pages through the server allowlist — always produce a plain string array
    const allowedPages: string[] = Array.isArray(body.allowed_pages)
      ? body.allowed_pages.filter((p: unknown) => typeof p === "string" && branchAssignablePages.has(p as string)) as string[]
      : [];

    const isEdit = Boolean(body.staff_id);
    if (!fullName) return response({ error: "Enter the staff member's full name." }, 400);
    if (!isEdit && !usernamePattern.test(username)) return response({ error: "Username must be 3-50 characters: letters, numbers, dots, underscores or hyphens." }, 400);
    if (isEdit && username && !usernamePattern.test(username)) return response({ error: "Username must be 3-50 characters: letters, numbers, dots, underscores or hyphens." }, 400);
    if (!allowedRoles.has(role)) return response({ error: "Choose a valid role: cashier, manager, accountant or admin." }, 400);
    if (password && password.length < 8) return response({ error: "Password must be at least 8 characters." }, 400);

    let staffRow: { id: string; user_id: string | null } | null = null;
    if (body.staff_id) {
      const { data, error } = await admin.from("staff").select("id, user_id").eq("id", body.staff_id).eq("store_id", storeId).maybeSingle();
      if (error || !data) return response({ error: "Staff member was not found for this branch." }, 404);
      staffRow = data as { id: string; user_id: string | null };
    }
    if (!staffRow && !password) return response({ error: "Set a password when creating a new branch login." }, 400);

    const authEmail = username ? `${username}.${storeId.replaceAll("-", "")}@branch.zuripos.local` : null;
    let authUserId: string | null = staffRow?.user_id || null;

    if (authUserId) {
      const update: Record<string, unknown> = {
        user_metadata: { full_name: fullName, branch_id: storeId, branch_role: role },
      };
      if (authEmail) update.email = authEmail;
      if (password) update.password = password;
      const { error } = await admin.auth.admin.updateUserById(authUserId, update);
      if (error) return response({ error: error.message || "Could not update the login account." }, 400);
    } else {
      if (!authEmail) return response({ error: "Username is required when creating a new branch login." }, 400);
      const { data: createData, error: createError } = await admin.auth.admin.createUser({
        email: authEmail,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, branch_id: storeId, branch_role: role },
      });
      if (createError) {
        const isDuplicate = createError.message?.toLowerCase().includes("already") ||
          createError.message?.toLowerCase().includes("exists") ||
          (createError as any).status === 422;
        if (!isDuplicate) return response({ error: createError.message || "Could not create the login account." }, 400);
        // Reuse orphaned auth user from a previous failed attempt
        const { data: listData, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
        if (listError) return response({ error: "Could not look up existing user: " + listError.message }, 400);
        const found = (listData?.users || []).find((u: any) => u.email === authEmail);
        if (!found) return response({ error: "User already exists but could not be retrieved." }, 400);
        const updatePayload: Record<string, unknown> = { user_metadata: { full_name: fullName, branch_id: storeId, branch_role: role } };
        if (password) updatePayload.password = password;
        const { error: updateErr } = await admin.auth.admin.updateUserById(found.id, updatePayload);
        if (updateErr) return response({ error: updateErr.message || "Could not update existing account." }, 400);
        authUserId = found.id;
      } else {
        if (!createData?.user) return response({ error: "Auth user was not returned after creation." }, 400);
        authUserId = createData.user.id;
      }
    }

    // Build the staff row payload.
    // CRITICAL: allowed_pages must be JSON.stringify'd so Supabase JS sends it as
    // a JSON string, which Postgres correctly parses into JSONB.
    // Without this, Supabase JS sends a native Postgres array literal and Postgres
    // tries to cast it from the staff composite type, producing:
    //   "cannot cast type staff to jsonb"
    const payload: Record<string, unknown> = {
      store_id: storeId,
      user_id: authUserId,
      full_name: fullName,
      role,
      allowed_pages: JSON.stringify(allowedPages),
      status: "active",
      updated_at: new Date().toISOString(),
    };
    if (username) {
      payload.employee_id = username;
      payload.login_username = username;
      payload.auth_email = authEmail;
    }

    const result = staffRow
      ? await admin.from("staff").update(payload).eq("id", staffRow.id).select("id").single()
      : await admin.from("staff").insert(payload).select("id").single();

    if (result.error) {
      console.error("[provision-branch-user] staff write error:", result.error.message, result.error.details);
      return response({ error: result.error.message || "The staff profile could not be saved." }, 400);
    }

    const { error: grantError } = await admin.from("store_access").upsert(
      { store_id: storeId, user_id: authUserId, role, granted_by: caller.id },
      { onConflict: "store_id,user_id" }
    );
    if (grantError) return response({ error: grantError.message || "The branch assignment could not be saved." }, 400);

    return response({ success: true, staff_id: result.data.id });
  } catch (error) {
    console.error("provision-branch-user unhandled:", error);
    return response({ error: "We could not save this branch login. Please try again." }, 500);
  }
});
