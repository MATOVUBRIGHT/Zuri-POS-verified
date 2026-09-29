import { useState, useEffect } from "react";
import { PageLoader, useMinimumLoading } from "@/components/ui/loading-spinner";
import { fmtCurrency } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import {
  Clock, Play, Square, History, Wallet, Lock,
  CheckCircle, XCircle, AlertCircle, LogOut, LogIn,
  Users, Timer, RefreshCw, ShieldCheck
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Shift, Staff } from "@/types";
import { playSuccess, playCashRegister } from "@/lib/sounds";
import { useShift } from "@/providers/ShiftProvider";
import { useAppStateStore } from "@/store/appStateStore";
import StatCard from "@/components/StatCard";
import { useNavigate } from "react-router-dom";

interface ShiftsProps {
  onUpdateCash?: (amount: number) => void;
  onRefresh?: () => void;
  onStaffLogin?: (staff: Staff) => void;
  onStaffLogout?: () => void;
}

const Shifts = ({ onRefresh, onStaffLogin, onStaffLogout }: ShiftsProps) => {
  const navigate = useNavigate();
  const { activeShift, setActiveShift, refreshShift, store, user } = useShift();
  const setActiveStaff = useAppStateStore(s => s.setActiveStaff);
  const setUserRole = useAppStateStore(s => s.setUserRole);
  const { toast } = useToast();
  const [staffList, setStaffList] = useState<any[]>([]);
  const [shiftHistory, setShiftHistory] = useState<Shift[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState("owner");
  const [pinCode, setPinCode] = useState("");
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [startingCash, setStartingCash] = useState("");
  const [isReconcileAuthorized, setIsReconcileAuthorized] = useState(false);
  const [managerPin, setManagerPin] = useState("");
  const [endingCash, setEndingCash] = useState("");
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [endSummary, setEndSummary] = useState<{actual:number;expected:number;discrepancy:number}|null>(null);

  const [showHandover, setShowHandover] = useState(false);
  const [handoverStaffId, setHandoverStaffId] = useState("owner");
  const [handoverPin, setHandoverPin] = useState("");
  const [handoverCash, setHandoverCash] = useState("");  const storeId = store?.id || null;
  const isOwner = store?.user_id === user?.id;

  useEffect(() => {
    if (store?.last_closing_balance != null) setStartingCash(String(store.last_closing_balance));
  }, [store?.last_closing_balance]);

  useEffect(() => { if (activeShift) setIsAuthorized(true); }, [activeShift]);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!storeId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchStaff(), fetchHistory()]).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [storeId]);

  const fetchStaff = async () => {
    if (!storeId) return;
    const { data } = await (supabase.from("staff") as any)
      .select("id,full_name,employee_id,role,status,hourly_rate,pin_code,pin_hash,allowed_pages,store_id,user_id,created_at")
      .eq("store_id", storeId).eq("status", "active");
    setStaffList(data || []);
  };

  const fetchHistory = async () => {
    if (!storeId) return;
    const { data, error } = await supabase.from("shifts")
      .select("*, staff:staff_id(full_name)")
      .eq("store_id", storeId).order("start_time", { ascending: false }).limit(20);
    if (!error) setShiftHistory((data as unknown as Shift[]) || []);
    else {
      const { data: d2 } = await supabase.from("shifts").select("*")
        .eq("store_id", storeId).order("start_time", { ascending: false }).limit(20);
      setShiftHistory((d2 as unknown as Shift[]) || []);
    }
  };

  const verifyPin = async (staffId: string, pin: string): Promise<boolean> => {
    const s = staffList.find((x: any) => x.id === staffId);
    if (!s) return false;
    if (s.pin_code && s.pin_code === pin) return true;
    if (s.pin_hash) {
      const { data } = await supabase.rpc("verify_pin_hash" as any, { pin_input: pin, pin_hash: s.pin_hash }).maybeSingle();
      if (data) return true;
    }
    return false;
  };


  const applyStaffLogin = (staffId: string) => {
    if (staffId === "owner") {
      setActiveStaff(null); setUserRole("owner"); try { const key = localStorage.getItem('brec_current_store') ? `brec_active_staff_${localStorage.getItem('brec_current_store')}` : 'brec_active_staff'; localStorage.removeItem(key); } catch {}
    } else {
      const s = staffList.find((x: any) => x.id === staffId);
      if (s) {
        setActiveStaff(s); setUserRole(s.role || "cashier");
        try { const key = localStorage.getItem('brec_current_store') ? `brec_active_staff_${localStorage.getItem('brec_current_store')}` : 'brec_active_staff'; localStorage.setItem(key, JSON.stringify(s)); } catch {}
        if (onStaffLogin) onStaffLogin(s as Staff);
      }
    }
  };

  const handleAuthorize = async () => {
    if (selectedStaffId === "owner") { setIsAuthorized(true); playSuccess(); return; }
    const ok = await verifyPin(selectedStaffId, pinCode);
    if (ok) {
      setIsAuthorized(true); setPinCode(""); playSuccess();
      toast({ title: "Authorized", description: `Welcome, ${staffList.find((s: any) => s.id === selectedStaffId)?.full_name}` });
    } else toast({ title: "Invalid PIN", variant: "destructive" });
  };

  const handleStartShift = async () => {
    const cash = parseFloat(startingCash);
    if (isNaN(cash) || cash < 0) { toast({ title: "Enter a valid cash amount", variant: "destructive" }); return; }
    if (!user || !storeId) return;
    const opt: any = {
      id: "opt-" + Date.now(), store_id: storeId, user_id: user.id,
      staff_id: selectedStaffId === "owner" ? null : selectedStaffId,
      starting_cash: cash, status: "open", start_time: new Date().toISOString(), approval_status: "approved"
    };
    setActiveShift(opt as Shift);
    applyStaffLogin(selectedStaffId);
    playCashRegister();
    toast({ title: "Shift Started", description: `Opening cash: ${fmtCurrency(cash)}` });
    try {
      const { data, error } = await supabase.from("shifts").insert({
        user_id: user.id, store_id: storeId,
        staff_id: selectedStaffId === "owner" ? null : selectedStaffId,
        starting_cash: cash, status: "open", approval_status: "approved",
        approved_by: user.id, start_time: new Date().toISOString()
      } as any).select().single();
      if (error) throw error;
      setActiveShift(data as Shift);
    } catch (e: any) {
      toast({ title: "Error saving shift", description: e.message, variant: "destructive" });
      await refreshShift();
    }
    setStartingCash(""); fetchHistory(); if (onRefresh) onRefresh();
  };


  const handleReconcileAuthorize = async () => {
    if (!storeId) return;
    if (isOwner) { setIsReconcileAuthorized(true); setManagerPin(""); playSuccess(); return; }
    const { data: rows } = await (supabase.from("staff") as any)
      .select("pin_code,pin_hash,role").eq("store_id", storeId).in("role", ["manager", "admin"]);
    let ok = false;
    for (const s of (rows as any[] || [])) {
      if (s.pin_code && s.pin_code === managerPin) { ok = true; break; }
      if (s.pin_hash) {
        const { data } = await supabase.rpc("verify_pin_hash" as any, { pin_input: managerPin, pin_hash: s.pin_hash }).maybeSingle();
        if (data) { ok = true; break; }
      }
    }
    if (ok) { setIsReconcileAuthorized(true); setManagerPin(""); playSuccess(); toast({ title: "Authorized" }); }
    else toast({ title: "Invalid PIN", variant: "destructive" });
  };

  const handlePrepareEndShift = async () => {
    const cash = parseFloat(endingCash);
    if (isNaN(cash) || cash < 0 || !activeShift) { toast({ title: "Enter a valid cash amount", variant: "destructive" }); return; }
    const { data: txs } = await supabase.from("cash_transactions").select("amount,type")
      .eq("store_id", activeShift.store_id).gte("created_at", activeShift.start_time);
    const { data: exps } = await supabase.from("expenses").select("amount")
      .eq("store_id", activeShift.store_id).in("payment_method", ["Cash", "cash"]).gte("created_at", activeShift.start_time);
    const ci = (txs || []).filter((t: any) => t.type === "in").reduce((s: number, t: any) => s + Number(t.amount), 0);
    const co = (txs || []).filter((t: any) => t.type === "out").reduce((s: number, t: any) => s + Number(t.amount), 0);
    const ex = (exps || []).reduce((s: number, e: any) => s + Number(e.amount), 0);
    const expected = activeShift.starting_cash + ci - co - ex;
    setEndSummary({ actual: cash, expected, discrepancy: cash - expected });
    setShowEndConfirm(true);
  };

  const handleConfirmEndShift = async () => {
    if (!activeShift || !endSummary) return;
    const sc = activeShift;
    const closingSummary = endSummary;

    try {
      const { error: shiftError } = await supabase.from("shifts").update({
        end_time: new Date().toISOString(), ending_cash_actual: closingSummary.actual,
        ending_cash_expected: closingSummary.expected, status: "closed" as any
      }).eq("id", sc.id);
      if (shiftError) throw shiftError;
      const { error: storeError } = await supabase.from("stores").update({ last_closing_balance: closingSummary.actual } as any).eq("id", sc.store_id);
      if (storeError) throw storeError;
    } catch {
      toast({ title: "Shift closed locally", description: "The branch login screen will open, but the final sync may need to be retried.", variant: "destructive" });
    }

    setActiveShift(null); setIsReconcileAuthorized(false); setIsAuthorized(false);
    setShowEndConfirm(false); setEndingCash("");
    if (onStaffLogout) onStaffLogout();
    setActiveStaff(null); setUserRole("owner"); try { const key = localStorage.getItem('brec_current_store') ? `brec_active_staff_${localStorage.getItem('brec_current_store')}` : 'brec_active_staff'; localStorage.removeItem(key); } catch {}
    playCashRegister();
    toast({
      title: "Shift Closed",
      description: `Counted: ${fmtCurrency(closingSummary.actual)} | Expected: ${fmtCurrency(closingSummary.expected)} | Diff: ${fmtCurrency(closingSummary.discrepancy)}`,
      variant: closingSummary.discrepancy === 0 ? "default" : "destructive"
    });

    try { sessionStorage.setItem("brec_return_to_branch_login", sc.store_id); } catch {}
    try {
      await supabase.auth.signOut();
    } finally {
      navigate(`/branch-login?branch=${encodeURIComponent(sc.store_id)}`, { replace: true });
    }
  };


  const handleHandover = async () => {
    if (!activeShift || !user || !storeId) return;
    if (handoverStaffId !== "owner") {
      const ok = await verifyPin(handoverStaffId, handoverPin);
      if (!ok) { toast({ title: "Invalid PIN for next staff", variant: "destructive" }); return; }
    }
    const cash = parseFloat(handoverCash) || activeShift.starting_cash;
    const sc = activeShift;
    const opt: any = {
      id: "opt-" + Date.now(), store_id: storeId, user_id: user.id,
      staff_id: handoverStaffId === "owner" ? null : handoverStaffId,
      starting_cash: cash, status: "open", start_time: new Date().toISOString(), approval_status: "approved"
    };
    setActiveShift(opt as Shift);
    applyStaffLogin(handoverStaffId);
    if (handoverStaffId === "owner" && onStaffLogout) onStaffLogout();
    setShowHandover(false); setHandoverPin(""); setHandoverCash(""); setIsReconcileAuthorized(false);
    playCashRegister();
    toast({ title: "Handover Complete", description: `New shift for ${handoverStaffId === "owner" ? "Owner" : staffList.find((s: any) => s.id === handoverStaffId)?.full_name}` });
    try {
      const { data: txs } = await supabase.from("cash_transactions").select("amount,type")
        .eq("store_id", sc.store_id).gte("created_at", sc.start_time);
      const ci = (txs || []).filter((t: any) => t.type === "in").reduce((s: number, t: any) => s + Number(t.amount), 0);
      const co = (txs || []).filter((t: any) => t.type === "out").reduce((s: number, t: any) => s + Number(t.amount), 0);
      await supabase.from("shifts").update({
        end_time: new Date().toISOString(), ending_cash_actual: cash,
        ending_cash_expected: sc.starting_cash + ci - co, status: "closed" as any
      }).eq("id", sc.id);
      await supabase.from("stores").update({ last_closing_balance: cash } as any).eq("id", storeId);
      const { data: ns } = await supabase.from("shifts").insert({
        user_id: user.id, store_id: storeId,
        staff_id: handoverStaffId === "owner" ? null : handoverStaffId,
        starting_cash: cash, status: "open", approval_status: "approved",
        approved_by: user.id, start_time: new Date().toISOString()
      } as any).select().single();
      if (ns) setActiveShift(ns as Shift);
    } catch { await refreshShift(); }
    fetchHistory(); if (onRefresh) onRefresh();
  };

  const handleApproveShift = async (shiftId: string, approved: boolean) => {
    const { data: { user: u } } = await supabase.auth.getUser();
    if (!u) return;
    if (approved) {
      await supabase.from("shifts").update({ status: "open", approval_status: "approved", approved_by: u.id } as any).eq("id", shiftId);
      toast({ title: "Shift Approved" });
    } else {
      await supabase.from("shifts").update({ status: "closed", approval_status: "rejected", approved_by: u.id } as any).eq("id", shiftId);
      toast({ title: "Shift Rejected" });
    }
    fetchHistory(); await refreshShift();
  };

  const handleQuickLogout = () => {
    setIsAuthorized(false); setSelectedStaffId("owner");
    if (onStaffLogout) onStaffLogout();
    setActiveStaff(null); setUserRole("owner"); try { const key = localStorage.getItem('brec_current_store') ? `brec_active_staff_${localStorage.getItem('brec_current_store')}` : 'brec_active_staff'; localStorage.removeItem(key); } catch {}
    playSuccess(); toast({ title: "Staff logged out" });
  };

  const shiftDur = activeShift ? Math.floor((Date.now() - new Date(activeShift.start_time).getTime()) / 60000) : 0;
  const durH = Math.floor(shiftDur / 60), durM = shiftDur % 60, isLong = shiftDur > 480;

  const showLoader = useMinimumLoading(loading, 350);
  if (showLoader) {
    return <PageLoader text="Loading shifts..." />;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-bold flex items-center gap-3">
            <Clock className="h-8 w-8 text-primary" />Shift Management
          </h2>
          <p className="text-muted-foreground mt-1">Manage cashier shifts, handovers and reconciliation</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { fetchHistory(); refreshShift(); }} className="gap-2">
          <RefreshCw className="h-4 w-4" />Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Status" value={activeShift ? "Active" : "No Shift"} sub={activeShift ? "Shift in progress" : "Ready to open"} icon={Clock} color={activeShift ? "text-primary" : "text-muted-foreground"} bg={activeShift ? "bg-primary/10" : "bg-muted/30"} />
        <StatCard label="Duration" value={activeShift ? `${durH}h ${durM}m` : "—"} sub={isLong ? "Consider a handover" : "Current shift time"} icon={Timer} color={isLong ? "text-amber-600" : "text-primary"} bg={isLong ? "bg-amber-50 dark:bg-amber-950" : "bg-primary/10"} />
        <StatCard label="Opening Cash" value={activeShift ? fmtCurrency(activeShift.starting_cash) : "—"} sub="Drawer starting balance" icon={Wallet} color="text-primary" bg="bg-primary/10" />
        <StatCard label="Cashier" value={activeShift?.staff_id ? (staffList.find((s: any) => s.id === activeShift.staff_id)?.full_name || "Staff") : "Owner"} sub="Assigned to this shift" icon={Users} color="text-primary" bg="bg-primary/10" />
      </div>

      {isLong && (
        <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-950 border border-amber-200 rounded-xl">
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800 dark:text-amber-200">Long shift ({durH}h {durM}m) — consider a handover.</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b border-primary/10 bg-primary/5 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">{activeShift ? "Active Shift" : "Start Shift"}</h3>
          </div>
          <div className="p-5 space-y-4">

            {activeShift ? (
              isReconcileAuthorized ? (
                <div className="space-y-4">
                  <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg text-sm text-primary font-medium">✓ Authorized — enter closing cash</div>
                  <div className="p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 rounded-lg flex justify-between">
                    <span className="text-sm text-blue-700 dark:text-blue-300 font-medium">Opening Balance</span>
                    <span className="font-bold text-blue-700 dark:text-blue-300">{fmtCurrency(activeShift.starting_cash)}</span>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm font-semibold text-orange-600">Closing Cash (Actual Count)</Label>
                    <Input type="number" placeholder="0" value={endingCash} onChange={e => setEndingCash(e.target.value)} className="h-11 text-lg font-bold" onKeyDown={e => e.key === "Enter" && handlePrepareEndShift()} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="destructive" className="gap-2 h-11" onClick={handlePrepareEndShift}><Square className="h-4 w-4" />End Shift</Button>
                    <Button variant="outline" className="gap-2 h-11 border-primary text-primary" onClick={() => setShowHandover(true)}><LogIn className="h-4 w-4" />Handover</Button>
                  </div>
                  <Button variant="ghost" className="w-full text-xs" onClick={() => setIsReconcileAuthorized(false)}>Cancel</Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-xs text-muted-foreground">Cashier</p>
                      <p className="font-semibold text-sm">{activeShift.staff_id ? staffList.find((s: any) => s.id === activeShift.staff_id)?.full_name : "Owner"}</p>
                    </div>
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-xs text-muted-foreground">Started</p>
                      <p className="font-semibold text-sm">{new Date(activeShift.start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                    </div>
                  </div>
                  <div className="p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 rounded-lg flex justify-between items-center">
                    <span className="text-sm text-blue-700 dark:text-blue-300 font-medium">Opening Balance</span>
                    <span className="text-xl font-bold text-blue-700 dark:text-blue-300">{fmtCurrency(activeShift.starting_cash)}</span>
                  </div>
                  {activeShift.staff_id && (
                    <div className="flex gap-2">
                      <Button variant="outline" className="flex-1 gap-2 text-destructive border-destructive/30" onClick={handleQuickLogout}><LogOut className="h-4 w-4" />Logout Staff</Button>
                      <Button variant="outline" className="flex-1 gap-2 border-primary text-primary" onClick={() => setShowHandover(true)}><LogIn className="h-4 w-4" />Handover</Button>
                    </div>
                  )}
                  <div className="p-4 bg-orange-50 dark:bg-orange-950 border border-orange-200 rounded-lg space-y-3">
                    <p className="text-xs font-semibold text-orange-800 dark:text-orange-200 flex items-center gap-2">
                      <Lock className="h-4 w-4" />{isOwner ? "Owner — leave blank or enter PIN" : "Manager PIN Required"}
                    </p>
                    <Input type="password" placeholder={isOwner ? "Leave blank for owner" : "Manager PIN"} value={managerPin} onChange={e => setManagerPin(e.target.value)} className="h-9" onKeyDown={e => e.key === "Enter" && handleReconcileAuthorize()} />
                    <Button onClick={handleReconcileAuthorize} className="w-full h-9 text-sm">Authorize End Shift</Button>
                  </div>
                </div>
              )
            ) : !isAuthorized ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Staff Member</Label>
                  <select className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm" value={selectedStaffId} onChange={e => { setSelectedStaffId(e.target.value); setPinCode(""); }}>
                    <option value="owner">Owner / Admin Access</option>
                    {staffList.map((s: any) => <option key={s.id} value={s.id}>{s.full_name} ({s.employee_id})</option>)}
                  </select>
                </div>
                {selectedStaffId !== "owner" && (
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">PIN Code</Label>
                    <Input type="password" placeholder="••••" value={pinCode} onChange={e => setPinCode(e.target.value)} maxLength={6} onKeyDown={e => e.key === "Enter" && handleAuthorize()} />
                  </div>
                )}
                <Button className="w-full h-11 gap-2" onClick={handleAuthorize}><ShieldCheck className="h-4 w-4" />Unlock POS Session</Button>
              </div>

            ) : (
              <div className="space-y-4">
                <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                      {selectedStaffId === "owner" ? "O" : (staffList.find((s: any) => s.id === selectedStaffId)?.full_name?.[0] || "S")}
                    </div>
                    <span className="font-semibold text-sm">{selectedStaffId === "owner" ? "Owner" : staffList.find((s: any) => s.id === selectedStaffId)?.full_name}</span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setIsAuthorized(false)} className="text-xs">Switch</Button>
                </div>
                {store?.last_closing_balance != null && store.last_closing_balance > 0 && (
                  <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 rounded-lg">
                    <span className="text-xs text-blue-700 dark:text-blue-300 font-medium">Expected in drawer</span>
                    <span className="text-base font-bold text-blue-700 dark:text-blue-300">{fmtCurrency(store.last_closing_balance)}</span>
                  </div>
                )}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-blue-600 flex items-center gap-2"><Wallet className="h-4 w-4" />Counted Cash in Drawer</Label>
                  <Input type="number" placeholder="0" value={startingCash} onChange={e => setStartingCash(e.target.value)} className="h-12 text-lg font-bold" onKeyDown={e => e.key === "Enter" && handleStartShift()} />
                </div>
                <Button className="w-full gap-2 h-12" onClick={handleStartShift}><Play className="h-4 w-4" />Open Shift</Button>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b border-primary/10 bg-primary/5 flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Recent Shifts</h3>
          </div>
          <ScrollArea className="h-[500px]">
            <div className="p-4 space-y-3">
              {shiftHistory.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <History className="h-10 w-10 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">No shift history yet</p>
                </div>
              ) : shiftHistory.map(shift => {
                const isPending = (shift as any).approval_status === "pending";
                const isRejected = (shift as any).approval_status === "rejected";
                const d = shift.end_time ? Math.floor((new Date(shift.end_time).getTime() - new Date(shift.start_time).getTime()) / 60000) : null;
                const disc = shift.ending_cash_actual != null && shift.ending_cash_expected != null ? shift.ending_cash_actual - shift.ending_cash_expected : null;
                return (
                  <div key={shift.id} className={`p-4 border rounded-xl transition-colors ${isPending ? "border-amber-300 bg-amber-50/40 dark:bg-amber-950/40" : isRejected ? "border-red-200 bg-red-50/20" : "hover:bg-muted/30"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                          {((shift as any).staff?.full_name || "O")[0].toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm">{(shift as any).staff?.full_name || "Owner"}</span>
                            <Badge variant={shift.status === "open" ? "default" : isPending ? "outline" : "secondary"} className={`text-[10px] ${isPending ? "border-amber-400 text-amber-700" : isRejected ? "text-red-600" : ""}`}>
                              {isPending ? "Pending" : isRejected ? "Rejected" : shift.status}
                            </Badge>
                            {disc !== null && Math.abs(disc) > 0.01 && (
                              <Badge variant="destructive" className="text-[10px]">{disc > 0 ? "+" : ""}{fmtCurrency(disc)}</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{new Date(shift.start_time).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                          {d !== null && <p className="text-[10px] text-muted-foreground">Duration: {Math.floor(d / 60)}h {d % 60}m</p>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-muted-foreground">Open</p>
                        <p className="font-bold text-sm">{fmtCurrency(shift.starting_cash)}</p>
                        {shift.ending_cash_actual != null && (
                          <>
                            <p className="text-xs text-muted-foreground mt-1">Close</p>
                            <p className={`font-bold text-sm ${disc !== null && Math.abs(disc) > 0.01 ? "text-amber-600" : "text-green-600"}`}>{fmtCurrency(shift.ending_cash_actual)}</p>
                          </>
                        )}
                      </div>
                    </div>
                    {isPending && isOwner && (
                      <div className="flex gap-2 mt-3 pt-3 border-t border-amber-200">
                        <Button size="sm" className="flex-1 gap-1 bg-green-600 hover:bg-green-700 h-8 text-xs" onClick={() => handleApproveShift(shift.id, true)}><CheckCircle className="h-3 w-3" />Approve</Button>
                        <Button size="sm" variant="destructive" className="flex-1 gap-1 h-8 text-xs" onClick={() => handleApproveShift(shift.id, false)}><XCircle className="h-3 w-3" />Reject</Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>
      </div>


      <Dialog open={showEndConfirm} onOpenChange={setShowEndConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Square className="h-5 w-5 text-destructive" />Confirm End Shift</DialogTitle>
            <DialogDescription>Review before closing.</DialogDescription>
          </DialogHeader>
          {endSummary && (
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 rounded-lg">
                  <p className="text-xs text-blue-600 font-semibold">Opening</p>
                  <p className="text-lg font-bold text-blue-700">{fmtCurrency(activeShift?.starting_cash)}</p>
                </div>
                <div className="p-3 bg-green-50 dark:bg-green-950 border border-green-200 rounded-lg">
                  <p className="text-xs text-green-600 font-semibold">Expected</p>
                  <p className="text-lg font-bold text-green-700">{fmtCurrency(endSummary.expected)}</p>
                </div>
                <div className="p-3 bg-orange-50 dark:bg-orange-950 border border-orange-200 rounded-lg">
                  <p className="text-xs text-orange-600 font-semibold">Counted</p>
                  <p className="text-lg font-bold text-orange-700">{fmtCurrency(endSummary.actual)}</p>
                </div>
                <div className={`p-3 rounded-lg border ${endSummary.discrepancy === 0 ? "bg-green-50 dark:bg-green-950 border-green-200" : "bg-red-50 dark:bg-red-950 border-red-200"}`}>
                  <p className={`text-xs font-semibold ${endSummary.discrepancy === 0 ? "text-green-600" : "text-red-600"}`}>Discrepancy</p>
                  <p className={`text-lg font-bold ${endSummary.discrepancy === 0 ? "text-green-700" : "text-red-700"}`}>{endSummary.discrepancy >= 0 ? "+" : ""}{fmtCurrency(endSummary.discrepancy)}</p>
                </div>
              </div>
              {endSummary.discrepancy !== 0 && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 rounded-lg text-xs text-amber-800 dark:text-amber-200 font-semibold">⚠ Discrepancy will be logged for audit.</div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowEndConfirm(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleConfirmEndShift}><Square className="h-4 w-4 mr-2" />Close Shift</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showHandover} onOpenChange={setShowHandover}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><LogIn className="h-5 w-5 text-primary" />Shift Handover</DialogTitle>
            <DialogDescription>End current shift and start a new one for the next staff member.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="p-3 bg-muted rounded-lg flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                {activeShift?.staff_id ? (staffList.find((s: any) => s.id === activeShift.staff_id)?.full_name?.[0] || "S") : "O"}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Current Cashier</p>
                <p className="font-semibold text-sm">{activeShift?.staff_id ? staffList.find((s: any) => s.id === activeShift.staff_id)?.full_name : "Owner"}</p>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-sm">Cash in Drawer Now</Label>
              <Input type="number" placeholder="Enter current cash" value={handoverCash} onChange={e => setHandoverCash(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-sm">Next Staff Member</Label>
              <select className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm" value={handoverStaffId} onChange={e => { setHandoverStaffId(e.target.value); setHandoverPin(""); }}>
                <option value="owner">Owner / Admin</option>
                {staffList.filter((s: any) => s.id !== activeShift?.staff_id).map((s: any) => (
                  <option key={s.id} value={s.id}>{s.full_name} ({s.employee_id})</option>
                ))}
              </select>
            </div>
            {handoverStaffId !== "owner" && (
              <div className="space-y-1">
                <Label className="text-sm">Next Staff PIN</Label>
                <Input type="password" placeholder="••••" value={handoverPin} onChange={e => setHandoverPin(e.target.value)} maxLength={6} />
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowHandover(false)}>Cancel</Button>
            <Button onClick={handleHandover} className="gap-2"><LogIn className="h-4 w-4" />Complete Handover</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Shifts;
