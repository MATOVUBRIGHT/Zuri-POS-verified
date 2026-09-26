import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { dualAuthStorage } from '@/lib/authStorage';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.trim();
/** Anon JWT first (widest @supabase/supabase-js support); then publishable key (sb_publishable_…). Both are client-safe with RLS. */
const SUPABASE_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

/** True when real env is present — App shows setup UI instead of a blank screen when false. */
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);

/** Local Supabase CLI defaults — only used so createClient never receives undefined (prevents white screen on import). */
const PLACEHOLDER_URL = 'http://127.0.0.1:54321';
const PLACEHOLDER_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

// Import the supabase client like this:
// import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(
  isSupabaseConfigured ? (SUPABASE_URL as string) : PLACEHOLDER_URL,
  isSupabaseConfigured ? (SUPABASE_KEY as string) : PLACEHOLDER_KEY,
  {
    auth: {
      storage: dualAuthStorage,
      persistSession: isSupabaseConfigured,
      autoRefreshToken: isSupabaseConfigured,
      detectSessionInUrl: isSupabaseConfigured,
      lock: (async (_name: string, _acquireTimeout: number, fn: () => Promise<any>) => {
        return await fn();
      }) as any,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  }
);
