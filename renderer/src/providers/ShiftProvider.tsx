import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { offlineServices } from '@/lib/offlineServices';
import { Shift, Staff, Store } from '@/types';
import { useToast } from '@/hooks/use-toast';

interface ShiftContextType {
  activeShift: Shift | null;
  loading: boolean;
  refreshShift: () => Promise<void>;
  startShift: (amount: number, staffId?: string) => Promise<void>;
  endShift: (actualCash: number) => Promise<{ actual: number; expected: number; discrepancy: number }>;
  user: import('@supabase/supabase-js').User | null;
  store: Store | null;
  isAdmin: boolean;
}

const ShiftContext = createContext<ShiftContextType | undefined>(undefined);

export const ShiftProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<import('@supabase/supabase-js').User | null>(null);
  const [store, setStore] = useState<Store | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const { toast } = useToast();
  const hasFetched = useRef(false);

  const fetchInitialData = useCallback(async () => {
    try {
      setLoading(true);

      // Offline-first: when in Electron, try local SQLite auth first
      if (typeof window !== 'undefined' && (window as any).api?.authGetSession) {
        const token = offlineServices.session.get();
        if (token) {
          try {
            const { user: localUser } = await (window as any).api.authGetSession(token);
            if (localUser) {
              setUser(localUser);
              setIsAdmin(localUser.role === 'admin');
              let storeData = JSON.parse(localStorage.getItem('zuripos_offline_store') || 'null');
              if (!storeData) {
                const stores = await (window as any).api.getAll('stores');
                storeData = stores?.[0] || { id: localUser.store_id || 'default', store_name: 'Default Store' };
                if (storeData) localStorage.setItem('zuripos_offline_store', JSON.stringify(storeData));
              }
              setStore(storeData);
              setActiveShift(null);
              setLoading(false);
              return;
            }
          } catch (_) {
            localStorage.removeItem('zuripos_offline_session');
            localStorage.removeItem('zuripos_offline_user');
            localStorage.removeItem('zuripos_offline_store');
          }
        }
      }

      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      let user = session?.user || null;

      // Fallback to local storage if offline and session failed to load
      if (!user && !navigator.onLine) {
         try {
           const cachedUser = localStorage.getItem('brec_offline_user');
           if (cachedUser) {
             user = JSON.parse(cachedUser);
             console.log("Using cached offline user");
           }
         } catch(e) {}
      } else if (user) {
         localStorage.setItem('brec_offline_user', JSON.stringify(user));
      }

      setUser(user);
      
      if (!user) {
        setActiveShift(null);
        setStore(null);
        setIsAdmin(false);
        return;
      }

      // Check if user is admin - fallback to cache if offline; env superadmin list always passes
      const superAdminEmails = (import.meta.env.VITE_SUPERADMIN_EMAILS || 'brightadmin77@gmail.com')
        .split(',')
        .map((e: string) => e.trim().toLowerCase())
        .filter(Boolean);
      const emailLower = (user.email || '').toLowerCase();
      let adminStatus = emailLower && superAdminEmails.includes(emailLower);
      try {
        if (!adminStatus) {
          if (!navigator.onLine) {
            adminStatus = localStorage.getItem('brec_is_admin') === 'true';
          } else {
            const { data: hasAdminRole, error: adminError } = await supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' });
            if (adminError) throw adminError;
            adminStatus = !!hasAdminRole;
            localStorage.setItem('brec_is_admin', adminStatus ? 'true' : 'false');
          }
        } else {
          localStorage.setItem('brec_is_admin', 'true');
        }
      } catch (err) {
        adminStatus = adminStatus || localStorage.getItem('brec_is_admin') === 'true';
      }
      setIsAdmin(adminStatus);

      // Fetch store
      let currentStoreId = null;
      try {
        if (!navigator.onLine) {
           throw new Error('Offline');
        }
        const { data: stores, error: storesError } = await supabase.from('stores').select('*').eq('user_id', user.id).limit(1);
        if (storesError) throw storesError;

        const { data: accessData } = await supabase.from('store_access').select('store_id').eq('user_id', user.id).limit(1);
        currentStoreId = stores?.[0]?.id || accessData?.[0]?.store_id;

        if (stores?.[0]) {
          const s = stores[0];
          const typedStore = { ...s, last_closing_balance: s.last_closing_balance ?? undefined } as Store;
          setStore(typedStore);
          localStorage.setItem('brec_offline_store', JSON.stringify(typedStore));
        } else if (currentStoreId) {
          const { data: storeData } = await supabase.from('stores').select('*').eq('id', currentStoreId).single();
          if (storeData) {
              const typedStore = { ...storeData, last_closing_balance: storeData.last_closing_balance ?? undefined } as Store;
              setStore(typedStore);
              localStorage.setItem('brec_offline_store', JSON.stringify(typedStore));
          }
        }
      } catch (err) {
        try {
          const cachedStore = localStorage.getItem('brec_offline_store');
          if (cachedStore) {
             const parsedStore = JSON.parse(cachedStore);
             setStore(parsedStore);
             currentStoreId = parsedStore.id;
          }
        } catch(e) {}
      }

      if (!currentStoreId) return;

      // Fetch active shift (most recent if multiple exist)
      try {
        if (!navigator.onLine) throw new Error("Offline");
        
        const { data: shifts, error } = await supabase
          .from('shifts')
          .select('*')
          .eq('store_id', currentStoreId)
          .eq('status', 'open')
          .order('created_at', { ascending: false })
          .limit(1);

        if (error) throw error;
        const shift = (shifts && shifts.length > 0) ? shifts[0] : null;
        setActiveShift(shift as Shift | null);
        
        if (shift) {
            localStorage.setItem('brec_offline_shift', JSON.stringify(shift));
        } else {
            localStorage.removeItem('brec_offline_shift');
        }
      } catch (error) {
        try {
          const cachedShift = localStorage.getItem('brec_offline_shift');
          if (cachedShift) {
             setActiveShift(JSON.parse(cachedShift));
          }
        } catch(e) {}
      }
    } catch (error) {
      console.error("Error fetching shift data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const initializeAuth = async () => {
      // Ref guard prevents double fetch in StrictMode
      if (hasFetched.current) return;
      hasFetched.current = true;

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!mounted) return;
        
        await fetchInitialData();
      } catch (error) {
        console.error("Error initializing auth:", error);
        if (mounted) setLoading(false);
      }
    };

    // Initialize on mount only once
    initializeAuth();

    // Listen for auth state changes ONLY for sign in/out, not for initial session
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (!mounted) return;
      // Only refetch on explicit sign in/out, not on initial load
      if (event === 'SIGNED_IN') {
        hasFetched.current = false; // Allow refetch on new login
        fetchInitialData();
      } else if (event === 'SIGNED_OUT') {
        hasFetched.current = false;
        setUser(null);
        setActiveShift(null);
        setStore(null);
        setIsAdmin(false);
        setLoading(false);
        
        // Clear all offline caches to ensure user remains logged out
        localStorage.removeItem('brec_offline_user');
        localStorage.removeItem('brec_offline_store');
        localStorage.removeItem('brec_offline_shift');
        localStorage.removeItem('brec_is_admin');
        offlineServices.session.clear();
        for (let i = 0; i < localStorage.length; i++) {
           const key = localStorage.key(i);
           if (key && key.startsWith('brec_offline_sub_')) {
               localStorage.removeItem(key);
           }
        }
      }
    });

    // Listen for offline login (Electron)
    const onOfflineLogin = () => {
      hasFetched.current = false;
      fetchInitialData();
    };
    window.addEventListener('offline-login-success', onOfflineLogin);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      window.removeEventListener('offline-login-success', onOfflineLogin);
    };
  }, [fetchInitialData]);

  const refreshShift = async () => {
    await fetchInitialData();
  };

  const startShift = async (amount: number, staffId?: string) => {
    if (!user || !store) return;

    try {
      const { data, error } = await supabase
        .from('shifts')
        .insert({
          user_id: user.id,
          store_id: store.id,
          staff_id: staffId || null,
          starting_cash: amount,
          status: 'open',
          approval_status: 'approved',
          approved_by: user.id,
          start_time: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      // Add cash transaction for starting cash
      try {
        const { error: txError } = await supabase.from('cash_transactions').insert({
          user_id: user.id,
          store_id: store.id,
          amount: Number(amount) || 0,
          type: 'in',
          description: `Shift Starting Cash`,
          account_type: 'cash'
        });
        if (txError) console.warn("Failed to record cash transaction:", txError);
      } catch (txError) {
        console.warn("Error recording cash transaction:", txError);
        // Don't throw - shift was created successfully, just the transaction record failed
      }

      setActiveShift(data as Shift);
      toast({ title: "Shift Started", description: `Shift opened with starting cash of UGX ${amount.toLocaleString()}` });
    } catch (error: unknown) {
      toast({ title: "Error starting shift", description: (error as Error).message, variant: "destructive" });
      throw error;
    }
  };

  const endShift = async (actualCash: number) => {
    if (!activeShift || !user || !store) throw new Error("No active shift");

    try {
      // Calculate expected cash
      const { data: cashTx } = await supabase
        .from('cash_transactions')
        .select('amount, type')
        .eq('store_id', store.id)
        .gte('created_at', activeShift.start_time);

      const totalIn = cashTx?.filter(tx => tx.type === 'in').reduce((sum, tx) => sum + (tx.amount || 0), 0) || 0;
      const totalOut = cashTx?.filter(tx => tx.type === 'out').reduce((sum, tx) => sum + (tx.amount || 0), 0) || 0;
      const expectedCash = totalIn - totalOut;
      const discrepancy = actualCash - expectedCash;

      const { error } = await supabase
        .from('shifts')
        .update({
          status: 'closed',
          end_time: new Date().toISOString(),
          ending_cash_actual: actualCash,
          ending_cash_expected: expectedCash,
        })
        .eq('id', activeShift.id);

      if (error) throw error;

      // Update store last closing balance
      await supabase
        .from('stores')
        .update({ last_closing_balance: actualCash })
        .eq('id', store.id);

      setActiveShift(null);
      toast({ title: "Shift Ended", description: "Shift closed successfully." });
      
      return { actual: actualCash, expected: expectedCash, discrepancy };
    } catch (error: unknown) {
      toast({ title: "Error ending shift", description: (error as Error).message, variant: "destructive" });
      throw error;
    }
  };

  return (
    <ShiftContext.Provider value={{ activeShift, loading, refreshShift, startShift, endShift, user, store, isAdmin }}>
      {children}
    </ShiftContext.Provider>
  );
};

export const useShift = () => {
  const context = useContext(ShiftContext);
  if (context === undefined) {
    throw new Error('useShift must be used within a ShiftProvider');
  }
  return context;
};
