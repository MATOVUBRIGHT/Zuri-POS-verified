import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { fmtCurrency } from "@/lib/currency";
import { supabase } from '@/integrations/supabase/client';
import { Shift, Staff, Store } from '@/types';
import { useToast } from '@/hooks/use-toast';

interface ShiftContextType {
  activeShift: Shift | null;
  loading: boolean;
  refreshShift: () => Promise<void>;
  startShift: (amount: number, staffId?: string) => Promise<Shift>;
  endShift: (actualCash: number) => Promise<{ actual: number; expected: number; discrepancy: number }>;
  setActiveShift: (shift: Shift | null) => void;
  user: import('@supabase/supabase-js').User | null;
  store: Store | null;
  isAdmin: boolean;
}

const ShiftContext = createContext<ShiftContextType | undefined>(undefined);

const SHIFT_CACHE_KEY = 'brec_shift_cache';

function loadShiftCache(): { user: any; store: any; activeShift: any; isAdmin: boolean } | null {
  try {
    const raw = localStorage.getItem(SHIFT_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveShiftCache(data: { user: any; store: any; activeShift: any; isAdmin: boolean }) {
  try { localStorage.setItem(SHIFT_CACHE_KEY, JSON.stringify(data)); } catch {}
}

function clearShiftCache() {
  localStorage.removeItem(SHIFT_CACHE_KEY);
}

export const ShiftProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const cached = loadShiftCache();
  const [activeShift, setActiveShift] = useState<Shift | null>(cached?.activeShift ?? null);
  const [loading, setLoading] = useState(!cached); // instant if cached
  const [user, setUser] = useState<import('@supabase/supabase-js').User | null>(cached?.user ?? null);
  const [store, setStore] = useState<Store | null>(cached?.store ?? null);
  const [isAdmin, setIsAdmin] = useState(cached?.isAdmin ?? false);
  const { toast } = useToast();
  const hasFetched = useRef(false);

  const fetchInitialData = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user || null;
      setUser(user);
      
      if (!user) {
        setActiveShift(null);
        setStore(null);
        setIsAdmin(false);
        clearShiftCache();
        return;
      }

      // Check if user is admin
      const { data: hasAdminRole } = await supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' });
      const adminStatus = !!hasAdminRole;
      setIsAdmin(adminStatus);

      // Prefer the branch selected by the explicit POS route. The query remains
      // RLS-scoped, so a stale or unauthorised stored id simply falls back below.
      const preferredStoreId = localStorage.getItem('brec_current_store');
      const { data: preferredStore } = preferredStoreId
        ? await supabase.from('stores').select('*').eq('id', preferredStoreId).maybeSingle()
        : { data: null };
      // Fetch store
      const { data: stores } = await supabase.from('stores').select('*').eq('user_id', user.id).limit(1);
      const { data: accessData } = await supabase.from('store_access').select('store_id').eq('user_id', user.id).limit(1);
      const storeId = preferredStore?.id || stores?.[0]?.id || accessData?.[0]?.store_id;

      let resolvedStore: Store | null = null;
      if (preferredStore) {
        resolvedStore = preferredStore;
        setStore(preferredStore);
      } else if (stores?.[0]) {
        resolvedStore = stores[0];
        setStore(stores[0]);
      } else if (storeId) {
          const { data: storeData } = await supabase.from('stores').select('*').eq('id', storeId).single();
          resolvedStore = storeData;
          setStore(storeData);
      }
      if (!storeId) {
        saveShiftCache({ user, store: resolvedStore, activeShift: null, isAdmin: adminStatus });
        return;
      }

      // Fetch active shift (most recent if multiple exist)
      const { data: shifts, error } = await supabase
        .from('shifts')
        .select('*')
        .eq('store_id', storeId)
        .eq('status', 'open')
        .order('start_time', { ascending: false })
        .limit(1);

      if (error) {
        // Surface the real Supabase error message instead of just logging the object
        console.error("Error fetching shift data:", error.message, error.details, error.hint);
        // Fall back to cache rather than throwing — a 400 here shouldn't crash the app
        const cachedShift = loadShiftCache()?.activeShift ?? null;
        setActiveShift(cachedShift as Shift | null);
        saveShiftCache({ user, store: resolvedStore, activeShift: cachedShift, isAdmin: adminStatus });
        return;
      }

      const resolvedShift = (shifts && shifts.length > 0 ? shifts[0] : null) as Shift | null;
      setActiveShift(resolvedShift);

      // Persist to localStorage for instant hydration on next load
      saveShiftCache({ user, store: resolvedStore, activeShift: resolvedShift, isAdmin: adminStatus });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("Error fetching shift data:", msg, error);
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
        clearShiftCache();
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchInitialData]);

  const refreshShift = useCallback(async () => {
    await fetchInitialData();
  }, [fetchInitialData]);

  const startShift = async (amount: number, staffId?: string): Promise<Shift> => {
    if (!user || !store) throw new Error("No user or store");

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

      const newShift = data as Shift;
      setActiveShift(newShift);
      saveShiftCache({ user, store, activeShift: newShift, isAdmin });
      return newShift;
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
      saveShiftCache({ user, store, activeShift: null, isAdmin });
      
      return { actual: actualCash, expected: expectedCash, discrepancy };
    } catch (error: unknown) {
      toast({ title: "Error ending shift", description: (error as Error).message, variant: "destructive" });
      throw error;
    }
  };

  return (
    <ShiftContext.Provider value={{ activeShift, loading, refreshShift, startShift, endShift, setActiveShift, user, store, isAdmin }}>
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
