// Auth cleanup utility to prevent stale token errors
import { supabase } from '@/integrations/supabase/client';

export class AuthCleanup {
  private static instance: AuthCleanup;
  
  static getInstance() {
    if (!AuthCleanup.instance) {
      AuthCleanup.instance = new AuthCleanup();
    }
    return AuthCleanup.instance;
  }

  // Clean up invalid or stale auth tokens
  async cleanupStaleTokens(): Promise<void> {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) {
        // Check for specific token-related errors
        if (this.isTokenError(error)) {
          console.log('Detected stale tokens, cleaning up...');
          await supabase.auth.signOut({ scope: 'local' });
          
          // Clear any cached auth data
          this.clearAuthCache();
          return;
        }
      }
      
      // If we have a session, verify it's still valid
      if (session) {
        try {
          // Make a quick test call to verify the session works
          await supabase.auth.getUser();
        } catch (verifyError) {
          if (this.isTokenError(verifyError as Error)) {
            console.log('Session verification failed, cleaning up...');
            await supabase.auth.signOut({ scope: 'local' });
            this.clearAuthCache();
          }
        }
      }
    } catch (error) {
      console.warn('Auth cleanup failed:', error);
      // A transient network/Web Lock failure is not proof that the session is
      // invalid. Never sign users out from a generic cleanup failure; the
      // auth state listener will handle a real SIGNED_OUT event.
    }
  }

  private isTokenError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return (
      message.includes('refresh_token_not_found') ||
      message.includes('refresh token not found') ||
      message.includes('invalid refresh token') ||
      message.includes('token has expired') ||
      message.includes('invalid jwt')
    );
  }

  private clearAuthCache(): void {
    try {
      // Clear any auth-related localStorage items
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (
          key.startsWith('sb-') || 
          key.includes('supabase') || 
          key.includes('auth') ||
          key.includes('session')
        )) {
          keysToRemove.push(key);
        }
      }
      
      keysToRemove.forEach(key => {
        try {
          localStorage.removeItem(key);
        } catch (e) {
          // Ignore individual removal errors
        }
      });
      
      console.log('Cleared auth cache');
    } catch (error) {
      console.warn('Failed to clear auth cache:', error);
    }
  }

  // Run cleanup on app startup
  async runStartupCleanup(): Promise<void> {
    // Add a small delay to avoid blocking initial render
    setTimeout(() => {
      this.cleanupStaleTokens().catch(error => {
        console.warn('Startup auth cleanup failed:', error);
      });
    }, 100);
  }
}

// Export singleton instance
export const authCleanup = AuthCleanup.getInstance();
