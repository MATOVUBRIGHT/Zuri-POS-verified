import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Clock, Play, Square, History, DollarSign, Wallet, Lock, CheckCircle, XCircle, AlertCircle, LogOut, LogIn } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Shift, Staff, Store as StoreType } from "@/types";
import { playSuccess, playCashRegister } from "@/lib/sounds";

interface ShiftsProps {
    onUpdateCash?: (amount: number) => void;
    onRefresh?: () => void;
    onStaffLogin?: (staff: Staff) => void;
    onStaffLogout?: () => void;
}

const Shifts = ({ onUpdateCash, onRefresh, onStaffLogin, onStaffLogout }: ShiftsProps) => {
    const [activeShift, setActiveShift] = useState<Shift | null>(null);
    const [loading, setLoading] = useState(true);
    const [startingCash, setStartingCash] = useState("");
    const [endingCash, setEndingCash] = useState("");
    const [staffList, setStaffList] = useState<Staff[]>([]);
    const [selectedStaffId, setSelectedStaffId] = useState<string>("owner");
    const [isAuthorized, setIsAuthorized] = useState(false);
    const [pinCode, setPinCode] = useState("");

    // Reconcile security
    const [isReconcileAuthorized, setIsReconcileAuthorized] = useState(false);
    const [managerPin, setManagerPin] = useState("");
    const [storeData, setStoreData] = useState<StoreType | null>(null);
    const [shiftHistory, setShiftHistory] = useState<Shift[]>([]);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    
    // End shift confirmation popup
    const [showEndShiftConfirm, setShowEndShiftConfirm] = useState(false);
    const [endShiftSummary, setEndShiftSummary] = useState<{ actual: number; expected: number; discrepancy: number } | null>(null);

    // Shift handover (logout current + login next)
    const [showHandover, setShowHandover] = useState(false);
    const [handoverStaffId, setHandoverStaffId] = useState<string>("owner");
    const [handoverPin, setHandoverPin] = useState("");

    const { toast } = useToast();

    const fetchStaff = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: stores } = await supabase.from('stores').select('id').eq('user_id', user.id).limit(1);
            const { data: accessData } = await supabase.from('store_access').select('store_id').eq('user_id', user.id).limit(1);
            const storeId = stores?.[0]?.id || accessData?.[0]?.store_id;

            if (!storeId) return;

            const baseSelect = 'id, store_id, user_id, full_name, employee_id, role, status, hourly_rate, created_at';
            const extendedSelect = `${baseSelect}, total_sales, sales_count, updated_at, allowed_pages`;

            const { data, error } = await supabase
                .from('staff')
                .select(extendedSelect)
                .eq('store_id', storeId)
                .eq('status', 'active');

            if (error) {
                const msg = error.message?.toLowerCase() || '';
                const looksLikeMissingColumn =
                    (msg.includes('allowed_pages') || msg.includes('updated_at') || msg.includes('total_sales') || msg.includes('sales_count')) &&
                    (msg.includes('does not exist') || msg.includes('schema cache') || msg.includes('column'));

                if (looksLikeMissingColumn) {
                    const { data: fallbackData } = await supabase
                        .from('staff')
                        .select(baseSelect)
                        .eq('store_id', storeId)
                        .eq('status', 'active');
                    setStaffList((fallbackData as Staff[]) || []);
                    return;
                }
            }

            setStaffList((data as Staff[]) || []);
        } catch (error) {
            console.error("Error fetching staff:", error);
        }
    };

    const fetchShiftHistory = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: stores } = await supabase.from('stores').select('id').eq('user_id', user.id).limit(1);
            const { data: accessData } = await supabase.from('store_access').select('store_id').eq('user_id', user.id).limit(1);
            const storeId = stores?.[0]?.id || accessData?.[0]?.store_id;

            if (!storeId) return;

            const isSchemaMismatch = (err: any): boolean => {
                const msg = String(err?.message || '').toLowerCase();
                const code = String(err?.code || '');
                return (
                    code === 'PGRST204' ||
                    code === '42703' ||
                    msg.includes('schema cache') ||
                    msg.includes('does not exist') ||
                    msg.includes('relationship') ||
                    msg.includes('staff_id')
                );
            };

            const res = await supabase
                .from('shifts')
                .select('*, staff:staff_id(full_name)')
                .eq('store_id', storeId)
                .order('start_time', { ascending: false })
                .limit(10);

            if (res.error && isSchemaMismatch(res.error)) {
                const retry = await supabase
                    .from('shifts')
                    .select('*')
                    .eq('store_id', storeId)
                    .order('start_time', { ascending: false })
                    .limit(10);
                setShiftHistory((retry.data as unknown as Shift[]) || []);
            } else {
                setShiftHistory((res.data as unknown as Shift[]) || []);
            }
        } catch (error) {
            console.error("Error fetching history:", error);
        }
    };

    const fetchInitialData = async () => {
        try {
            setLoading(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            setCurrentUserId(user.id);

            const { data: stores } = await supabase.from('stores').select('*').eq('user_id', user.id).limit(1) as { data: StoreType[] | null };
            const { data: accessData } = await supabase.from('store_access').select('store_id').eq('user_id', user.id).limit(1);
            const storeId = stores?.[0]?.id || accessData?.[0]?.store_id;

            if (stores && stores[0]) {
                setStoreData(stores[0]);
                setStartingCash(String(stores[0].last_closing_balance || ""));
            }

            if (!storeId) return;

            const { data: shift, error } = await supabase
                .from('shifts')
                .select('*')
                .eq('store_id', storeId)
                .eq('status', 'open')
                .maybeSingle() as { data: Shift | null, error: any };

            if (error) throw error;
            if (shift) {
                setActiveShift(shift);
                setIsAuthorized(true);
            }
        } catch (error: unknown) {
            console.error("Error fetching active shift:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchInitialData();
        fetchStaff();
        fetchShiftHistory();
    }, []);

    const getStoreId = () => {
        return storeData?.id || null;
    };

    const handleAuthorize = async () => {
        if (selectedStaffId === "owner") {
            setIsAuthorized(true);
            playSuccess();
            return;
        }

        const storeId = getStoreId();
        if (!storeId) {
            toast({ title: "Error", description: "Store not found", variant: "destructive" });
            return;
        }

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            const response = await supabase.functions.invoke('verify-staff-pin', {
                body: { staff_id: selectedStaffId, pin_code: pinCode, store_id: storeId },
            });

            if (response.data?.success) {
                setIsAuthorized(true);
                setPinCode("");
                playSuccess();
                toast({ title: "Authorized", description: `Welcome, ${response.data.staff.full_name}` });
            } else {
                toast({ title: "Invalid PIN", description: "The PIN code entered is incorrect", variant: "destructive" });
            }
        } catch (error) {
            toast({ title: "Error", description: "Failed to verify PIN", variant: "destructive" });
        }
    };

    const handleReconcileAuthorize = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        const isOwner = storeData?.user_id === user?.id;

        if (isOwner) {
            setIsReconcileAuthorized(true);
            setManagerPin("");
            playSuccess();
            toast({ title: "Authorized", description: "Owner access granted for reconciliation." });
            return;
        }

        const storeId = getStoreId();
        if (!storeId) {
            toast({ title: "Error", description: "Store not found", variant: "destructive" });
            return;
        }

        try {
            const response = await supabase.functions.invoke('verify-staff-pin', {
                body: { pin_code: managerPin, store_id: storeId, check_role: true },
            });

            if (response.data?.success) {
                setIsReconcileAuthorized(true);
                setManagerPin("");
                playSuccess();
                toast({ title: "Authorized", description: "Manager access granted for reconciliation." });
            } else {
                toast({ title: "Unauthorized", description: "Invalid PIN or insufficient permissions.", variant: "destructive" });
            }
        } catch (error) {
            toast({ title: "Unauthorized", description: "Invalid PIN or insufficient permissions.", variant: "destructive" });
        }
    };

    const handleRequestShift = async () => {
        const cash = parseFloat(startingCash);
        if (isNaN(cash) || cash < 0) {
            toast({ title: "Invalid Amount", description: "Please enter a valid starting cash amount", variant: "destructive" });
            return;
        }

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: stores } = await supabase.from('stores').select('id').eq('user_id', user.id).limit(1);
            const { data: accessData } = await supabase.from('store_access').select('store_id').eq('user_id', user.id).limit(1);
            const storeId = stores?.[0]?.id || accessData?.[0]?.store_id;

            if (!storeId) return;

            const isOwner = storeData?.user_id === user.id;
            const autoApprove = isOwner || selectedStaffId === 'owner';

            const { data, error } = await supabase
                .from('shifts')
                .insert({
                    user_id: user.id,
                    store_id: storeId,
                    staff_id: selectedStaffId === 'owner' ? null : selectedStaffId,
                    starting_cash: cash,
                    status: autoApprove ? 'open' : ('pending' as any),
                    approval_status: autoApprove ? 'approved' : 'pending',
                    approved_by: autoApprove ? user.id : null
                } as any)
                .select()
                .single();

            if (error) throw error;

            if (autoApprove) {
                await supabase.from('cash_transactions').insert({
                    user_id: user.id,
                    store_id: storeId,
                    amount: cash,
                    type: 'in',
                    description: `Shift Starting Cash - ${selectedStaffId === 'owner' ? 'Owner' : staffList.find(s => s.id === selectedStaffId)?.full_name}`,
                    account_type: 'cash'
                });

                if (onUpdateCash) onUpdateCash(cash);
                setActiveShift(data as Shift);
                
                // Notify parent about staff login
                if (selectedStaffId !== 'owner' && onStaffLogin) {
                    const staff = staffList.find(s => s.id === selectedStaffId);
                    if (staff) onStaffLogin(staff);
                }
                
                playCashRegister();
                toast({ title: "Shift Started", description: `Shift opened with UGX ${cash.toLocaleString()} starting cash.` });
            } else {
                playSuccess();
                toast({ title: "Shift Requested", description: "Waiting for admin/manager approval to start shift." });
            }

            if (onRefresh) onRefresh();
            fetchShiftHistory();
            setStartingCash("");
        } catch (error: unknown) {
            const err = error as Error;
            toast({ title: "Error", description: err.message, variant: "destructive" });
        }
    };

    const handleApproveShift = async (shiftId: string, approved: boolean) => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            if (approved) {
                const { data: shift } = await supabase.from('shifts').select('*').eq('id', shiftId).single();
                if (!shift) return;

                const { error } = await supabase
                    .from('shifts')
                    .update({
                        status: 'open',
                        approval_status: 'approved',
                        approved_by: user.id
                    } as any)
                    .eq('id', shiftId);

                if (error) throw error;

                await supabase.from('cash_transactions').insert({
                    user_id: shift.user_id,
                    store_id: shift.store_id,
                    amount: shift.starting_cash,
                    type: 'in',
                    description: `Shift Starting Cash (Approved)`,
                    account_type: 'cash'
                });

                playSuccess();
                toast({ title: "Shift Approved", description: "Shift has been approved and started." });
            } else {
                const { error } = await supabase
                    .from('shifts')
                    .update({
                        status: 'closed',
                        approval_status: 'rejected',
                        approved_by: user.id
                    } as any)
                    .eq('id', shiftId);

                if (error) throw error;
                toast({ title: "Shift Rejected", description: "Shift request has been rejected." });
            }

            fetchShiftHistory();
            fetchInitialData();
            if (onRefresh) onRefresh();
        } catch (error: unknown) {
            const err = error as Error;
            toast({ title: "Error", description: err.message, variant: "destructive" });
        }
    };

    const handlePrepareEndShift = async () => {
        const cash = parseFloat(endingCash);
        if (isNaN(cash) || cash < 0) {
            toast({ title: "Invalid Amount", description: "Please enter a valid ending cash amount", variant: "destructive" });
            return;
        }

        if (!activeShift) return;

        try {
            const { data: cashTx } = await supabase
                .from('cash_transactions')
                .select('amount, type')
                .eq('store_id', activeShift.store_id)
                .gte('created_at', activeShift.start_time);

            const { data: expenses } = await supabase
                .from('expenses')
                .select('amount')
                .eq('store_id', activeShift.store_id)
                .in('payment_method', ['Cash', 'cash'])
                .gte('created_at', activeShift.start_time);

            const cashIn = (cashTx || []).filter((tx: any) => tx.type === 'in').reduce((sum: number, tx: any) => sum + Number(tx.amount), 0);
            const cashOut = (cashTx || []).filter((tx: any) => tx.type === 'out').reduce((sum: number, tx: any) => sum + Number(tx.amount), 0);
            const totalExpenses = expenses?.reduce((sum, e) => sum + Number(e.amount), 0) || 0;
            const expectedCash = activeShift.starting_cash + cashIn - cashOut - totalExpenses;
            const discrepancy = cash - expectedCash;

            setEndShiftSummary({ actual: cash, expected: expectedCash, discrepancy });
            setShowEndShiftConfirm(true);
        } catch (error) {
            console.error("Error preparing end shift:", error);
        }
    };

    const handleConfirmEndShift = async () => {
        if (!activeShift || !endShiftSummary) return;

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { error } = await supabase
                .from('shifts')
                .update({
                    end_time: new Date().toISOString(),
                    ending_cash_actual: endShiftSummary.actual,
                    ending_cash_expected: endShiftSummary.expected,
                    status: 'closed' as any
                })
                .eq('id', activeShift.id);

            if (error) throw error;

            await supabase.from('stores').update({ last_closing_balance: endShiftSummary.actual } as any).eq('id', activeShift.store_id);

            if (onRefresh) onRefresh();
            fetchShiftHistory();
            setActiveShift(null);
            setEndingCash("");
            setIsReconcileAuthorized(false);
            setIsAuthorized(false);
            setShowEndShiftConfirm(false);
            
            // Notify parent about staff logout
            if (onStaffLogout) onStaffLogout();

            playCashRegister();
            toast({
                title: "Shift Closed",
                description: `Actual: UGX ${endShiftSummary.actual.toLocaleString()}. Expected: UGX ${endShiftSummary.expected.toLocaleString()}. Discrepancy: UGX ${endShiftSummary.discrepancy.toLocaleString()}`,
                variant: endShiftSummary.discrepancy === 0 ? "default" : "destructive"
            });
        } catch (error: unknown) {
            const err = error as Error;
            toast({ title: "Error", description: err.message, variant: "destructive" });
        }
    };

    // Shift handover: end current shift and immediately start new one for next staff
    const handleShiftHandover = async () => {
        if (!activeShift) return;

        const storeId = getStoreId();
        if (!storeId) return;

        // Verify the next staff member's PIN if not owner
        if (handoverStaffId !== "owner") {
            try {
                const response = await supabase.functions.invoke('verify-staff-pin', {
                    body: { staff_id: handoverStaffId, pin_code: handoverPin, store_id: storeId },
                });

                if (!response.data?.success) {
                    toast({ title: "Invalid PIN", description: "The PIN code for the next staff member is incorrect", variant: "destructive" });
                    return;
                }
            } catch (error) {
                toast({ title: "Error", description: "Failed to verify PIN", variant: "destructive" });
                return;
            }
        }

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // Close current shift with current cash as ending
            const currentCash = parseFloat(endingCash) || activeShift.starting_cash;

             // Get expected cash
              const { data: cashTx } = await supabase
                  .from('cash_transactions')
                  .select('amount, type')
                  .eq('store_id', activeShift.store_id)
                  .gte('created_at', activeShift.start_time);
 
             const { data: expenses } = await supabase
                 .from('expenses')
                 .select('amount')
                 .eq('store_id', activeShift.store_id)
                 .in('payment_method', ['Cash', 'cash'])
                 .gte('created_at', activeShift.start_time);
 
              const cashIn = (cashTx || []).filter((tx: any) => tx.type === 'in').reduce((sum: number, tx: any) => sum + Number(tx.amount), 0);
              const cashOut = (cashTx || []).filter((tx: any) => tx.type === 'out').reduce((sum: number, tx: any) => sum + Number(tx.amount), 0);
             const totalExpenses = expenses?.reduce((sum, e) => sum + Number(e.amount), 0) || 0;
             const expectedCash = activeShift.starting_cash + cashIn - cashOut - totalExpenses;

            // Close the current shift
            await supabase
                .from('shifts')
                .update({
                    end_time: new Date().toISOString(),
                    ending_cash_actual: currentCash,
                    ending_cash_expected: expectedCash,
                    status: 'closed' as any
                })
                .eq('id', activeShift.id);

            await supabase.from('stores').update({ last_closing_balance: currentCash } as any).eq('id', activeShift.store_id);

            // Logout current staff
            if (onStaffLogout) onStaffLogout();

            // Open new shift for next staff
            const isOwner = storeData?.user_id === user.id;
            const autoApprove = isOwner || handoverStaffId === 'owner';

            const { data: newShift, error: newShiftError } = await supabase
                .from('shifts')
                .insert({
                    user_id: user.id,
                    store_id: storeId,
                    staff_id: handoverStaffId === 'owner' ? null : handoverStaffId,
                    starting_cash: currentCash,
                    status: autoApprove ? 'open' : ('pending' as any),
                    approval_status: autoApprove ? 'approved' : 'pending',
                    approved_by: autoApprove ? user.id : null
                } as any)
                .select()
                .single();

            if (newShiftError) throw newShiftError;

            if (autoApprove) {
                await supabase.from('cash_transactions').insert({
                    user_id: user.id,
                    store_id: storeId,
                    amount: currentCash,
                    type: 'in',
                    description: `Shift Handover - ${handoverStaffId === 'owner' ? 'Owner' : staffList.find(s => s.id === handoverStaffId)?.full_name}`,
                    account_type: 'cash'
                });

                setActiveShift(newShift as Shift);

                // Login next staff
                if (handoverStaffId !== 'owner' && onStaffLogin) {
                    const staff = staffList.find(s => s.id === handoverStaffId);
                    if (staff) onStaffLogin(staff);
                }
            }

            setShowHandover(false);
            setHandoverPin("");
            setEndingCash("");
            setIsReconcileAuthorized(false);
            
            playCashRegister();
            toast({ 
                title: "Shift Handover Complete", 
                description: `New shift started for ${handoverStaffId === 'owner' ? 'Owner' : staffList.find(s => s.id === handoverStaffId)?.full_name} with UGX ${currentCash.toLocaleString()}`
            });

            if (onRefresh) onRefresh();
            fetchShiftHistory();
        } catch (error: unknown) {
            const err = error as Error;
            toast({ title: "Error", description: err.message, variant: "destructive" });
        }
    };

    // Quick logout from active shift (just logs out staff, keeps shift open for owner)
    const handleQuickLogout = () => {
        if (onStaffLogout) onStaffLogout();
        setIsAuthorized(false);
        setSelectedStaffId("owner");
        playSuccess();
        toast({ title: "Logged Out", description: "Staff logged out. Select next staff to continue." });
    };

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold flex items-center gap-2">
                <Clock className="h-6 w-6 text-primary" />
                Shift Management
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className={activeShift ? "border-primary shadow-lg rounded-xl overflow-hidden" : "rounded-xl overflow-hidden shadow-sm"}>
                    <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                            Shift Status
                            <Badge variant={activeShift ? "default" : "secondary"}>
                                {activeShift ? "Active" : "No Active Shift"}
                            </Badge>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {activeShift ? (
                            isReconcileAuthorized ? (
                                <div className="space-y-4">
                                    <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                                        <p className="text-sm font-semibold text-emerald-800">Authorization Granted</p>
                                        <p className="text-xs text-emerald-700">Enter final cash amount to close shift.</p>
                                    </div>
                                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg mb-2">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-xs text-blue-600 font-semibold uppercase tracking-wide">Opening Balance (Start)</p>
                                            </div>
                                            <p className="text-lg font-bold text-blue-600">UGX {activeShift.starting_cash.toLocaleString()}</p>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="endingCash" className="text-sm font-semibold text-orange-600 uppercase tracking-wide">Closing Balance (End) - Actual Cash Count</Label>
                                        <div className="relative">
                                            <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                            <Input
                                                id="endingCash"
                                                type="number"
                                                placeholder="0"
                                                value={endingCash}
                                                onChange={e => setEndingCash(e.target.value)}
                                                className="pl-10 text-lg font-bold border-orange-300 focus:border-orange-500"
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <Button variant="destructive" className="gap-2 h-12" onClick={handlePrepareEndShift}>
                                            <Square className="h-4 w-4" />
                                            Close Shift
                                        </Button>
                                        <Button variant="outline" className="gap-2 h-12 border-primary text-primary" onClick={() => setShowHandover(true)}>
                                            <LogIn className="h-4 w-4" />
                                            Handover to Next
                                        </Button>
                                    </div>
                                    <Button variant="ghost" className="w-full text-xs" onClick={() => setIsReconcileAuthorized(false)}>Cancel</Button>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="p-3 bg-muted rounded-lg">
                                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Cashier</p>
                                            <p className="font-semibold text-sm">{activeShift.staff_id ? staffList.find(s => s.id === activeShift.staff_id)?.full_name : 'Owner'}</p>
                                        </div>
                                        <div className="p-3 bg-muted rounded-lg">
                                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Start Time</p>
                                            <p className="font-semibold text-sm">{new Date(activeShift.start_time).toLocaleTimeString()}</p>
                                        </div>
                                    </div>
                                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-xs text-blue-600 font-semibold uppercase tracking-wide">Opening Balance</p>
                                                <p className="text-sm text-blue-700 mt-1">Starting cash in drawer</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-2xl font-bold text-blue-600">UGX {activeShift.starting_cash.toLocaleString()}</p>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {/* Quick actions: Logout current staff / Handover */}
                                    {activeShift.staff_id && (
                                        <div className="flex gap-2">
                                            <Button variant="outline" className="flex-1 gap-2 text-destructive border-destructive/30" onClick={handleQuickLogout}>
                                                <LogOut className="h-4 w-4" />
                                                Logout Staff
                                            </Button>
                                            <Button variant="outline" className="flex-1 gap-2 border-primary text-primary" onClick={() => setShowHandover(true)}>
                                                <LogIn className="h-4 w-4" />
                                                Handover
                                            </Button>
                                        </div>
                                    )}

                                    <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg space-y-3 mt-4">
                                        <p className="text-xs font-semibold text-orange-800 flex items-center gap-2">
                                            <Lock className="h-4 w-4" /> Manager Input Required
                                        </p>
                                        <div className="space-y-1">
                                            <Label className="text-[10px]">Manager/Admin PIN</Label>
                                            <Input
                                                type="password"
                                                placeholder="****"
                                                value={managerPin}
                                                onChange={e => setManagerPin(e.target.value)}
                                                className="h-9"
                                            />
                                        </div>
                                        <Button onClick={handleReconcileAuthorize} className="w-full bg-orange-600 hover:bg-orange-700 h-9 text-xs">Authorize to End Shift</Button>
                                    </div>
                                </div>
                            )
                        ) : !isAuthorized ? (
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label>Authorized Staff Member</Label>
                                    <select
                                        className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                                        value={selectedStaffId}
                                        onChange={e => setSelectedStaffId(e.target.value)}
                                    >
                                        <option value="owner">Owner / Administrative Access</option>
                                        {staffList.map(s => (
                                            <option key={s.id} value={s.id}>{s.full_name} ({s.employee_id})</option>
                                        ))}
                                    </select>
                                </div>
                                {selectedStaffId !== "owner" && (
                                    <div className="space-y-2">
                                        <Label>Entry PIN</Label>
                                        <Input
                                            type="password"
                                            placeholder="****"
                                            value={pinCode}
                                            onChange={e => setPinCode(e.target.value)}
                                            maxLength={6}
                                        />
                                    </div>
                                )}
                                <Button className="w-full h-11" onClick={handleAuthorize}>Unlock POS Session</Button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="p-3 bg-primary/5 rounded-lg border border-primary/20 flex justify-between items-center">
                                    <p className="text-sm font-medium">Session: {selectedStaffId === 'owner' ? 'Owner' : staffList.find(s => s.id === selectedStaffId)?.full_name}</p>
                                    <Button variant="ghost" size="sm" onClick={() => setIsAuthorized(false)} className="text-[10px]">Switch</Button>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="startingCash" className="text-sm font-semibold text-blue-600 uppercase tracking-wide flex items-center gap-2">
                                        <Wallet className="h-4 w-4" />
                                        Opening Balance (Starting Cash)
                                    </Label>
                                    <div className="relative">
                                        <Wallet className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            id="startingCash"
                                            type="number"
                                            placeholder="0"
                                            value={startingCash}
                                            onChange={e => setStartingCash(e.target.value)}
                                            className="pl-10 h-12 text-lg font-bold border-blue-300 focus:border-blue-500"
                                        />
                                    </div>
                                    <p className="text-[10px] text-muted-foreground italic">Suggested: UGX {storeData?.last_closing_balance?.toLocaleString() || '0'} (from previous close)</p>
                                </div>
                                <Button className="w-full gap-2 h-12 bg-primary text-primary-foreground" onClick={handleRequestShift}>
                                    <Play className="h-4 w-4" />
                                    {selectedStaffId === 'owner' ? 'Open Terminal Shift' : 'Request Shift (Admin Approval)'}
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className="rounded-xl overflow-hidden shadow-sm">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <History className="h-5 w-5" />
                            Security Log
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-4">
                        {shiftHistory.length === 0 ? (
                                <div className="p-4 bg-muted/30 rounded-lg border border-dashed border-muted-foreground/30 text-center py-10">
                                    <History className="h-8 w-8 mx-auto mb-2 opacity-20" />
                                    <p className="text-xs text-muted-foreground">No shift history found.</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {shiftHistory.map((shift) => {
                                        const approvalStatus = (shift as any).approval_status || 'approved';
                                        const isPending = approvalStatus === 'pending';
                                        const isRejected = approvalStatus === 'rejected';
                                        const isStoreOwner = storeData?.user_id === currentUserId;

                                        return (
                                            <div key={shift.id} className={`flex flex-col gap-2 p-3 border rounded-lg hover:bg-muted/30 transition-colors ${isPending ? 'border-yellow-300 bg-yellow-50/50' : isRejected ? 'border-red-200 bg-red-50/30' : ''}`}>
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <Badge variant={shift.status === 'open' ? 'default' : isPending ? 'outline' : 'secondary'} className={`text-[10px] ${isPending ? 'border-yellow-500 text-yellow-700' : isRejected ? 'border-red-400 text-red-600' : ''}`}>
                                                                {isPending ? '⏳ PENDING' : isRejected ? '✗ REJECTED' : shift.status.toUpperCase()}
                                                            </Badge>
                                                            <span className="text-xs font-medium">
                                                                {/* @ts-ignore */}
                                                                {shift.staff?.full_name || 'Owner'}
                                                            </span>
                                                        </div>
                                                        <div className="text-[10px] text-muted-foreground mt-1">
                                                            {new Date(shift.start_time).toLocaleString()}
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-xs font-bold">
                                                            Start: {shift.starting_cash.toLocaleString()}
                                                        </div>
                                                        {shift.ending_cash_actual != null && (
                                                            <div className={`text-xs font-bold ${shift.ending_cash_actual !== shift.ending_cash_expected ? 'text-orange-600' : 'text-green-600'}`}>
                                                                End: {shift.ending_cash_actual.toLocaleString()}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                {isPending && isStoreOwner && (
                                                    <div className="flex gap-2 mt-1 pt-2 border-t border-yellow-200">
                                                        <Button
                                                            size="sm"
                                                            className="flex-1 gap-1 bg-emerald-600 hover:bg-emerald-700 h-8 text-xs"
                                                            onClick={() => handleApproveShift(shift.id, true)}
                                                        >
                                                            <CheckCircle className="h-3 w-3" /> Approve
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="destructive"
                                                            className="flex-1 gap-1 h-8 text-xs"
                                                            onClick={() => handleApproveShift(shift.id, false)}
                                                        >
                                                            <XCircle className="h-3 w-3" /> Reject
                                                        </Button>
                                                    </div>
                                                )}
                                                {isPending && !isStoreOwner && (
                                                    <div className="flex items-center gap-1 mt-1 pt-2 border-t border-yellow-200 text-yellow-700 text-xs">
                                                        <AlertCircle className="h-3 w-3" />
                                                        Awaiting admin approval
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* End Shift Confirmation Dialog */}
            <Dialog open={showEndShiftConfirm} onOpenChange={setShowEndShiftConfirm}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Square className="h-5 w-5 text-destructive" />
                            Confirm End Shift
                        </DialogTitle>
                        <DialogDescription>
                            Review the shift summary before closing.
                        </DialogDescription>
                    </DialogHeader>
                    {endShiftSummary && (
                        <div className="space-y-4 py-2">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                    <p className="text-xs text-blue-600 font-semibold">Opening Cash</p>
                                    <p className="text-lg font-bold text-blue-700">UGX {activeShift?.starting_cash.toLocaleString()}</p>
                                </div>
                                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                                    <p className="text-xs text-emerald-600 font-semibold">Expected Cash</p>
                                    <p className="text-lg font-bold text-emerald-700">UGX {endShiftSummary.expected.toLocaleString()}</p>
                                </div>
                                <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                                    <p className="text-xs text-orange-600 font-semibold">Actual Cash</p>
                                    <p className="text-lg font-bold text-orange-700">UGX {endShiftSummary.actual.toLocaleString()}</p>
                                </div>
                                <div className={`p-3 rounded-lg border ${endShiftSummary.discrepancy === 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                                    <p className={`text-xs font-semibold ${endShiftSummary.discrepancy === 0 ? 'text-green-600' : 'text-red-600'}`}>Discrepancy</p>
                                    <p className={`text-lg font-bold ${endShiftSummary.discrepancy === 0 ? 'text-green-700' : 'text-red-700'}`}>
                                        UGX {endShiftSummary.discrepancy.toLocaleString()}
                                    </p>
                                </div>
                            </div>
                            {endShiftSummary.discrepancy !== 0 && (
                                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                    <p className="text-xs text-yellow-800 font-semibold">⚠️ Cash discrepancy detected. This will be logged for audit purposes.</p>
                                </div>
                            )}
                        </div>
                    )}
                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => setShowEndShiftConfirm(false)}>Cancel</Button>
                        <Button variant="destructive" onClick={handleConfirmEndShift}>
                            <Square className="h-4 w-4 mr-2" />
                            Close Shift
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Shift Handover Dialog */}
            <Dialog open={showHandover} onOpenChange={setShowHandover}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <LogIn className="h-5 w-5 text-primary" />
                            Shift Handover
                        </DialogTitle>
                        <DialogDescription>
                            End current shift and start a new one for the next staff member.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="p-3 bg-muted rounded-lg">
                            <p className="text-xs text-muted-foreground">Current Cashier</p>
                            <p className="font-semibold">{activeShift?.staff_id ? staffList.find(s => s.id === activeShift.staff_id)?.full_name : 'Owner'}</p>
                        </div>

                        <div className="space-y-2">
                            <Label>Current Cash in Drawer (UGX)</Label>
                            <Input
                                type="number"
                                placeholder="Enter current cash amount"
                                value={endingCash}
                                onChange={e => setEndingCash(e.target.value)}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Next Staff Member</Label>
                            <select
                                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                                value={handoverStaffId}
                                onChange={e => setHandoverStaffId(e.target.value)}
                            >
                                <option value="owner">Owner / Administrative Access</option>
                                {staffList.filter(s => s.id !== activeShift?.staff_id).map(s => (
                                    <option key={s.id} value={s.id}>{s.full_name} ({s.employee_id})</option>
                                ))}
                            </select>
                        </div>

                        {handoverStaffId !== "owner" && (
                            <div className="space-y-2">
                                <Label>Next Staff PIN</Label>
                                <Input
                                    type="password"
                                    placeholder="****"
                                    value={handoverPin}
                                    onChange={e => setHandoverPin(e.target.value)}
                                    maxLength={6}
                                />
                            </div>
                        )}
                    </div>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => setShowHandover(false)}>Cancel</Button>
                        <Button onClick={handleShiftHandover} className="gap-2">
                            <LogIn className="h-4 w-4" />
                            Complete Handover
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default Shifts;

