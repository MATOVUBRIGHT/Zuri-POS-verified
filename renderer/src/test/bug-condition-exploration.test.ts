/**
 * Bug Condition Exploration Test
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6**
 * 
 * This test validates that the bug conditions exist in the unfixed code:
 * 1. Auth lock timeout warnings in React Strict Mode
 * 2. 404 error when querying user_access_suspension table
 * 3. Cascading failures in data fetches
 * 
 * **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bugs exist
 * **DO NOT attempt to fix the test or the code when it fails**
 * 
 * Expected Counterexamples:
 * - "@supabase/gotrue-js: Lock was not released within 5000ms" warnings
 * - "AbortError: Lock broken by another request with the 'steal' option"
 * - 404 error when querying user_access_suspension table
 * - "Error fetching paired stores" and "Error fetching notifications" cascading failures
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';

// Mock console to capture warnings and errors
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;
let consoleWarnings: string[] = [];
let consoleErrors: string[] = [];

beforeEach(() => {
  consoleWarnings = [];
  consoleErrors = [];
  
  console.warn = (...args: unknown[]) => {
    consoleWarnings.push(args.map(a => String(a)).join(' '));
    originalConsoleWarn(...args);
  };
  
  console.error = (...args: unknown[]) => {
    consoleErrors.push(args.map(a => String(a)).join(' '));
    originalConsoleError(...args);
  };
});

afterEach(() => {
  console.warn = originalConsoleWarn;
  console.error = originalConsoleError;
});

describe('Bug Condition Exploration - Property 1: Auth Lock Cleanup and Missing Table Issues', () => {
  /**
   * Property 1.1: Auth Lock Cleanup in React Strict Mode
   * 
   * Bug Condition: React Strict Mode enabled AND multiple concurrent auth listeners 
   * compete for same lock
   * 
   * Expected Behavior: Auth listeners properly cleaned up on unmount, no lock timeout errors
   */
  it('should detect auth lock timeout warnings when multiple listeners are created', async () => {
    // Simulate React Strict Mode double-mounting behavior
    // This creates multiple concurrent auth state listeners
    
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'placeholder-key';
    
    const client = createClient(supabaseUrl, supabaseKey);
    
    // Create multiple auth listeners without cleanup (simulating the bug)
    const subscription1 = client.auth.onAuthStateChange(() => {});
    const subscription2 = client.auth.onAuthStateChange(() => {});
    const subscription3 = client.auth.onAuthStateChange(() => {});
    
    // Trigger auth operations that compete for locks
    const promises = [
      client.auth.getSession(),
      client.auth.getSession(),
      client.auth.getSession(),
    ];
    
    // Wait for operations to complete or timeout
    await Promise.allSettled(promises);
    
    // Wait for lock timeout (5000ms + buffer)
    await new Promise(resolve => setTimeout(resolve, 6000));
    
    // Check for lock timeout warnings
    const hasLockWarning = consoleWarnings.some(warning => 
      warning.includes('Lock was not released within 5000ms') ||
      warning.includes('@supabase/gotrue-js')
    );
    
    const hasAbortError = consoleErrors.some(error =>
      error.includes('AbortError') ||
      error.includes('Lock broken by another request')
    );
    
    // Cleanup
    subscription1.data.subscription.unsubscribe();
    subscription2.data.subscription.unsubscribe();
    subscription3.data.subscription.unsubscribe();
    
    // EXPECTED TO FAIL: This assertion should fail on unfixed code
    // When it fails, it confirms the bug exists
    expect(hasLockWarning, 
      'Expected NO auth lock timeout warnings, but found warnings. This confirms Bug 1.1 exists.'
    ).toBe(false);
    
    expect(hasAbortError,
      'Expected NO AbortError messages, but found errors. This confirms Bug 1.3 exists.'
    ).toBe(false);
  });
  
  /**
   * Property 1.2: Missing user_access_suspension Table
   * 
   * Bug Condition: Querying user_access_suspension table returns 404 error
   * 
   * Expected Behavior: Table exists and can be queried successfully
   */
  it('should detect 404 error when querying user_access_suspension table', async () => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'placeholder-key';
    
    const client = createClient(supabaseUrl, supabaseKey);
    
    // Attempt to query the user_access_suspension table
    const { data, error } = await client
      .from('user_access_suspension')
      .select('*')
      .eq('is_active', true)
      .limit(1);
    
    // EXPECTED TO FAIL: This assertion should fail on unfixed code
    // When it fails, it confirms the bug exists
    expect(error, 
      'Expected NO error when querying user_access_suspension table, but got error. This confirms Bug 1.4 exists.'
    ).toBeNull();
    
    expect(data,
      'Expected data to be an array (even if empty), but got null/undefined. This confirms Bug 1.4 exists.'
    ).toBeDefined();
    
    // If error exists, check if it's a 404
    if (error) {
      const is404Error = error.message?.includes('404') || 
                        error.code === '404' ||
                        error.message?.includes('not found') ||
                        error.message?.includes('does not exist');
      
      expect(is404Error,
        `Error is a 404 (table not found): ${error.message}. This confirms Bug 1.4 exists.`
      ).toBe(false);
    }
  });
  
  /**
   * Property 1.3: Cascading Fetch Failures
   * 
   * Bug Condition: Auth lock issues cause cascading failures in data fetches
   * 
   * Expected Behavior: Data fetches handle auth errors gracefully without cascading failures
   */
  it('should detect cascading fetch failures in ShiftProvider', async () => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'placeholder-key';
    
    const client = createClient(supabaseUrl, supabaseKey);
    
    // Simulate the ShiftProvider's fetchInitialData behavior
    // This should trigger cascading failures if auth locks are broken
    
    // Create auth lock contention
    const subscription1 = client.auth.onAuthStateChange(() => {});
    const subscription2 = client.auth.onAuthStateChange(() => {});
    
    // Trigger multiple concurrent operations
    const operations = [
      client.auth.getUser(),
      client.from('stores').select('*').limit(1),
      client.from('store_access').select('store_id').limit(1),
    ];
    
    await Promise.allSettled(operations);
    
    // Wait for potential cascading failures
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check for cascading failure error messages
    const hasPairedStoresError = consoleErrors.some(error =>
      error.includes('Error fetching paired stores') ||
      error.includes('paired stores')
    );
    
    const hasNotificationsError = consoleErrors.some(error =>
      error.includes('Error fetching notifications') ||
      error.includes('notifications')
    );
    
    const hasShiftDataError = consoleErrors.some(error =>
      error.includes('Error fetching shift data') ||
      error.includes('shift data')
    );
    
    // Cleanup
    subscription1.data.subscription.unsubscribe();
    subscription2.data.subscription.unsubscribe();
    
    // EXPECTED TO FAIL: This assertion should fail on unfixed code
    // When it fails, it confirms the bug exists
    expect(hasPairedStoresError,
      'Expected NO "Error fetching paired stores" messages, but found errors. This confirms Bug 1.6 exists.'
    ).toBe(false);
    
    expect(hasNotificationsError,
      'Expected NO "Error fetching notifications" messages, but found errors. This confirms Bug 1.6 exists.'
    ).toBe(false);
    
    expect(hasShiftDataError,
      'Expected NO "Error fetching shift data" messages, but found errors. This confirms Bug 1.6 exists.'
    ).toBe(false);
  });
  
  /**
   * Property 1.4: Auth Listener Cleanup on Unmount
   * 
   * Bug Condition: Components unmount during React Strict Mode's double-mounting 
   * behavior and leave orphaned auth locks
   * 
   * Expected Behavior: Auth locks released immediately without timeout errors
   */
  it('should detect orphaned auth locks after component unmount', async () => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'placeholder-key';
    
    const client = createClient(supabaseUrl, supabaseKey);
    
    // Simulate component mount/unmount cycle (React Strict Mode behavior)
    const subscription1 = client.auth.onAuthStateChange(() => {});
    
    // Simulate unmount WITHOUT proper cleanup (the bug)
    // In the buggy code, the subscription is not unsubscribed
    
    // Create a new subscription (simulating remount)
    const subscription2 = client.auth.onAuthStateChange(() => {});
    
    // Trigger auth operations
    await client.auth.getSession();
    
    // Wait for lock timeout
    await new Promise(resolve => setTimeout(resolve, 6000));
    
    // Check for orphaned lock warnings
    const hasOrphanedLockWarning = consoleWarnings.some(warning =>
      warning.includes('Lock was not released') ||
      warning.includes('gotrue-js')
    );
    
    // Cleanup
    subscription1.data.subscription.unsubscribe();
    subscription2.data.subscription.unsubscribe();
    
    // EXPECTED TO FAIL: This assertion should fail on unfixed code
    // When it fails, it confirms the bug exists
    expect(hasOrphanedLockWarning,
      'Expected NO orphaned lock warnings after unmount, but found warnings. This confirms Bug 1.2 exists.'
    ).toBe(false);
  });
});
