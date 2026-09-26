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
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

/** When false (default), all signed-in users get app access (free basic). Set VITE_REQUIRE_PAID_SUBSCRIPTION=true to enforce paid/active plans only. */
const requirePaidSubscription = import.meta.env.VITE_REQUIRE_PAID_SUBSCRIPTION === 'true';

function applySubscriptionRow(
  data: SubscriptionContextType['subscription'],
  previousStatus: string | null,
  setPreviousStatus: (s: string | null) => void,
  toast: (opts: { title: string; description: string }) => void
) {
  if (!requirePaidSubscription) {
    const row = data as any;
    const merged = {
      id: row?.id ?? 'free-basic',
      status: 'active' as const,
      expires_at: row?.expires_at ?? null,
    };
    setPreviousStatus('active');
    return merged;
  }
  if (data && previousStatus !== 'active' && (data as any)?.status === 'active') {
    toast({
      title: '✅ Plan Approved!',
      description: 'Your payment has been approved. You now have full access.',
    });
  }
  setPreviousStatus((data as any)?.status || null);
  return data as SubscriptionContextType['subscription'];
}

export const SubscriptionProvider: React.FC<{ children: React.ReactNode; userId?: string | null }> = ({ 
  children, 
  userId 
}) => {
  const [subscription, setSubscription] = useState<SubscriptionContextType['subscription']>(null);
  const [loading, setLoading] = useState(!requirePaidSubscription ? false : true);
  const [previousStatus, setPreviousStatus] = useState<string | null>(null);
  const { toast } = useToast();
  const hasFetched = useRef(false);
  const subscription_unsubscribe = useRef<(() => void) | null>(null);

  const fetchSubscription = useCallback(async (id: string) => {
    try {
      if (!navigator.onLine) throw new Error("Offline");

      const { data, error } = await supabase
        .from('user_subscriptions')
        .select('id, status, expires_at')
        .eq('user_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      const next = applySubscriptionRow(data as any, previousStatus, setPreviousStatus, (o) => toast(o));
      setSubscription(next);
      if (data || !requirePaidSubscription) {
        localStorage.setItem(`brec_offline_sub_${id}`, JSON.stringify(next));
      }
    } catch (error) {
      console.warn("Using offline subscription fallback:", error);
      if (!requirePaidSubscription) {
        setSubscription({ id: 'free-basic', status: 'active', expires_at: null });
      } else {
        try {
          const cachedSub = localStorage.getItem(`brec_offline_sub_${id}`);
          if (cachedSub) {
            setSubscription(JSON.parse(cachedSub));
          } else {
            setSubscription(null);
          }
        } catch (e) {
          setSubscription(null);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [previousStatus, toast]);

  // Subscribe to real-time changes
  const setupRealtimeListener = useCallback((id: string) => {
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
      supabase.removeChannel(channel);
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

    if (!requirePaidSubscription) {
      setSubscription({ id: 'free-basic', status: 'active', expires_at: null });
      setLoading(false);
    } else {
      setLoading(true);
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

  const refreshSubscription = useCallback(async () => {
    if (!userId) return;
    await fetchSubscription(userId);
  }, [userId, fetchSubscription]);

  return (
    <SubscriptionContext.Provider value={{ subscription, loading, refreshSubscription }}>
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
