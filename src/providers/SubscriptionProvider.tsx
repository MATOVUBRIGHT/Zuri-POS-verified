import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface SubscriptionContextType {
  subscription: {
    id: string;
    status: 'pending' | 'active' | 'expired' | 'cancelled';
    expires_at: string | null;
  } | null;
  loading: boolean;
  refreshSubscription: () => Promise<void>;
  isTrialActive: boolean;
  daysRemaining: number | null;
  isTrialExpiring: boolean; // true if 3 days or less remaining
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);
const enableSubscriptionRealtime =
  import.meta.env.VITE_ENABLE_SUBSCRIPTION_REALTIME === 'true' ||
  (!import.meta.env.DEV && import.meta.env.VITE_ENABLE_SUBSCRIPTION_REALTIME !== 'false');

// Helper function to calculate days remaining
const calculateDaysRemaining = (expiresAt: string | null): number | null => {
  if (!expiresAt) return null;
  const expiryDate = new Date(expiresAt);
  const today = new Date();
  const daysLeft = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return daysLeft > 0 ? daysLeft : 0;
};

// Helper function to check if this is a trial subscription
const isTrialSubscription = (paymentRef: string | null): boolean => {
  return paymentRef === 'free_trial_7days' || paymentRef === 'free_basic_plan';
};

export const SubscriptionProvider: React.FC<{ children: React.ReactNode; userId?: string | null }> = ({ 
  children, 
  userId 
}) => {
  const [subscription, setSubscription] = useState<SubscriptionContextType['subscription']>(null);
  const [paymentRef, setPaymentRef] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [previousStatus, setPreviousStatus] = useState<string | null>(null);
  const [trialWarningShown, setTrialWarningShown] = useState(false);
  const { toast } = useToast();
  const hasFetched = useRef(false);
  const subscription_unsubscribe = useRef<(() => void) | null>(null);

  const daysRemaining = calculateDaysRemaining(subscription?.expires_at || null);
  const isTrialActive = subscription?.status === 'active' && isTrialSubscription(paymentRef);
  const isTrialExpiring = isTrialActive && daysRemaining !== null && daysRemaining <= 3 && daysRemaining > 0;

  const fetchSubscription = useCallback(async (id: string) => {
    try {
      const { data, error } = await supabase
        .from('user_subscriptions')
        .select('id, status, expires_at, payment_reference')
        .eq('user_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      setSubscription(data as any);
      setPaymentRef((data as any)?.payment_reference || null);

      try {
        const persistedKey = `subscription_status_${id}`;
        const persisted = localStorage.getItem(persistedKey);
        // Show toast only if persisted status wasn't active and current is active
        if (persisted !== 'active' && (data as any)?.status === 'active') {
          toast({
            title: "✅ Plan Approved!",
            description: "Your payment has been approved. You now have full access.",
          });
        }
        try { localStorage.setItem(persistedKey, (data as any)?.status || ''); } catch {}
      } catch (e) {
        // ignore localStorage errors
      }
      setPreviousStatus((data as any)?.status || null);
    } catch (error) {
      console.error("Error fetching subscription:", error);
      setSubscription(null);
    } finally {
      setLoading(false);
    }
  }, [previousStatus, toast]);

  // Subscribe to real-time changes
  const setupRealtimeListener = useCallback((id: string) => {
    if (!enableSubscriptionRealtime) {
      subscription_unsubscribe.current = null;
      return () => {};
    }

    // Clean up previous subscription
    if (subscription_unsubscribe.current) {
      subscription_unsubscribe.current();
    }

    const channel = supabase
      .channel(`subscription-${id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_subscriptions',
          filter: `user_id=eq.${id}`,
        },
        () => {
          // Refetch when subscription changes
          fetchSubscription(id);
        }
      )
      .subscribe();

    subscription_unsubscribe.current = () => {
      void supabase.removeChannel(channel).catch((error) => {
        if (import.meta.env.DEV) {
          console.debug("Subscription realtime cleanup skipped:", error);
        }
      });
    };

    return () => {
      if (subscription_unsubscribe.current) {
        subscription_unsubscribe.current();
      }
    };
  }, [fetchSubscription]);

  useEffect(() => {
    if (!userId) {
      setSubscription(null);
      setLoading(false);
      return;
    }

    let mounted = true;

    const initializeSubscription = async () => {
      if (hasFetched.current) return;
      hasFetched.current = true;

      try {
        if (!mounted) return;
        await fetchSubscription(userId);

        if (mounted) {
          setupRealtimeListener(userId);
        }
      } catch (error) {
        console.error("Error initializing subscription:", error);
        if (mounted) setLoading(false);
      }
    };

    initializeSubscription();

    return () => {
      mounted = false;
      if (subscription_unsubscribe.current) {
        subscription_unsubscribe.current();
      }
    };
  }, [userId, fetchSubscription, setupRealtimeListener]);

  // Show trial expiration warning
  useEffect(() => {
    if (isTrialExpiring && !trialWarningShown) {
      setTrialWarningShown(true);
      toast({
        title: "⏰ Your Free Trial is Ending Soon!",
        description: `You have ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} left. Upgrade to a paid plan to continue using the app.`,
        variant: "default",
      });
    }
  }, [isTrialExpiring, daysRemaining, trialWarningShown, toast]);

  const refreshSubscription = useCallback(async () => {
    if (!userId) return;
    await fetchSubscription(userId);
  }, [userId, fetchSubscription]);

  return (
    <SubscriptionContext.Provider value={{ subscription, loading, refreshSubscription, isTrialActive, daysRemaining, isTrialExpiring }}>
      {children}
    </SubscriptionContext.Provider>
  );
};

export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within SubscriptionProvider');
  }
  return context;
};
