// @ts-nocheck
// This file runs in Supabase Edge Functions (Deno). The URL import and `Deno` globals
// are valid in that environment but confuse the local TypeScript language service.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import bcrypt from "https://esm.sh/bcryptjs@2.4.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Verify JWT using getUser
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = user.id;

    const { staff_id, pin_code, store_id, check_role } = await req.json();

    if (!pin_code || typeof pin_code !== 'string' || pin_code.length < 4 || pin_code.length > 6) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid PIN format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!store_id || typeof store_id !== 'string') {
      return new Response(
        JSON.stringify({ success: false, error: 'Store ID required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user has access to this store
    const { data: storeOwner } = await adminClient
      .from('stores')
      .select('id')
      .eq('id', store_id)
      .eq('user_id', userId)
      .maybeSingle();

    const { data: sharedAccess } = await adminClient
      .from('store_access')
      .select('id')
      .eq('store_id', store_id)
      .eq('user_id', userId)
      .maybeSingle();

    if (!storeOwner && !sharedAccess) {
      return new Response(
        JSON.stringify({ success: false, error: 'Access denied' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use SQL to do bcrypt comparison server-side via crypt()
    let sqlQuery = `
      SELECT id, full_name, role 
      FROM public.staff 
      WHERE store_id = $1 
        AND status = 'active'
        AND pin_hash = crypt($2, pin_hash)
    `;
    const params: string[] = [store_id, pin_code];
    let paramIndex = 3;

    if (staff_id) {
      sqlQuery += ` AND id = $${paramIndex}`;
      params.push(staff_id);
      paramIndex++;
    }

    if (check_role) {
      sqlQuery += ` AND role IN ('admin', 'manager')`;
    }

    sqlQuery += ` LIMIT 1`;

    // Use the admin client's rpc to run the query
    // Since we can't run raw SQL via supabase-js, use a different approach:
    // Query staff with pin_hash and compare using crypt() via a DB function
    
    // Alternative: query staff members then verify hash in Edge Function.
    // This is resilient to older schemas (pin_code) and to missing DB helper functions.
    let staffMembers = null;
    let usingPinHash = true;

    // Try pin_hash first (new schema)
    {
      let query = adminClient
        .from('staff')
        .select('id, full_name, role, pin_hash')
        .eq('store_id', store_id)
        .eq('status', 'active')
        .not('pin_hash', 'is', null);

      if (staff_id) query = query.eq('id', staff_id);
      if (check_role) query = query.in('role', ['admin', 'manager']);

      const { data, error } = await query;
      if (!error && data) {
        staffMembers = data;
      } else {
        const msg = (error?.message || '').toLowerCase();
        if (msg.includes('pin_hash') && (msg.includes('does not exist') || msg.includes('schema cache'))) {
          usingPinHash = false;
        } else if (error) {
          return new Response(
            JSON.stringify({ success: false, error: error.message || 'Staff lookup failed' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    // Fallback to pin_code (older schema)
    if (!usingPinHash) {
      let query = adminClient
        .from('staff')
        .select('id, full_name, role, pin_code')
        .eq('store_id', store_id)
        .eq('status', 'active')
        .not('pin_code', 'is', null);

      if (staff_id) query = query.eq('id', staff_id);
      if (check_role) query = query.in('role', ['admin', 'manager']);

      const { data, error } = await query;
      if (error || !data) {
        return new Response(
          JSON.stringify({ success: false, error: 'Staff member not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      staffMembers = data;
    }

    if (!staffMembers || staffMembers.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Staff member not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let matchedStaff = null;
    for (const staff of staffMembers) {
      if (!usingPinHash) {
        if (String(staff.pin_code) === pin_code) {
          matchedStaff = staff;
          break;
        }
        continue;
      }

      // Prefer DB helper when available (fast), but fall back to bcryptjs compare when missing.
      let matchResult = null;
      try {
        const { data, error } = await adminClient.rpc('verify_pin_hash', {
          _pin_input: pin_code,
          _pin_hash: staff.pin_hash,
        });
        if (!error) matchResult = data;
      } catch {
        // ignore
      }

      const ok = matchResult === true || bcrypt.compareSync(pin_code, staff.pin_hash);
      if (ok) {
        matchedStaff = staff;
        break;
      }
    }

    if (!matchedStaff) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid PIN' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        staff: {
          id: matchedStaff.id,
          full_name: matchedStaff.full_name,
          role: matchedStaff.role,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error verifying PIN:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
