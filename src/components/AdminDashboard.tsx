import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import StatCard from "@/components/StatCard";
import { fmtCurrency } from "@/lib/currency";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, CreditCard, Clock, AlertCircle, CheckCircle2, XCircle, Search, RefreshCw, Mail, Calendar, Trash2, PauseCircle, Eye, UserX, Shield, X, KeyRound, Store, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

const AdminDashboard = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [suspensions, setSuspensions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [cardFilter, setCardFilter] = useState<"all" | "active" | "pending">("all");
  const hasFetched = useRef(false);
  const fetchTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const [userDetailOpen, setUserDetailOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [suspendUser, setSuspendUser] = useState<any | null>(null);
  const [suspendDays, setSuspendDays] = useState("7");
  const [suspendReason, setSuspendReason] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteUser, setDeleteUser] = useState<any | null>(null);
  const [deleteReason, setDeleteReason] = useState("");

  // Grant access state
  const [grantOpen, setGrantOpen] = useState(false);
  const [grantUser, setGrantUser] = useState<any | null>(null);
  const [grantStores, setGrantStores] = useState<any[]>([]);
  const [grantStoreId, setGrantStoreId] = useState("");
  const [grantRole, setGrantRole] = useState("viewer");
  const [grantExpiry, setGrantExpiry] = useState("");
  const [grantLoading, setGrantLoading] = useState(false);
  const [existingAccess, setExistingAccess] = useState<any[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: profiles } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
      const { data: subs } = await supabase.from("user_subscriptions").select("*, subscription_plans(name, price)").order("created_at", { ascending: false });
      setUsers(profiles || []);
      setSubscriptions((subs || []).filter((s: any) => !s.is_deleted));
      setSuspensions([]);
    } catch (e: any) {
      toast.error("Failed to fetch admin data: " + e.message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    fetchData();
    const channel = supabase.channel("admin-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => {
        if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
        fetchTimeoutRef.current = setTimeout(fetchData, 1000);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "user_subscriptions" }, () => {
        if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
        fetchTimeoutRef.current = setTimeout(fetchData, 1000);
      })
      .subscribe();
    return () => { if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current); supabase.removeChannel(channel); };
  }, [fetchData]);

  const getSubForUser = (uid: string) => subscriptions.find(s => s.user_id === uid);
  const getSuspension = (uid: string) => suspensions.find(s => s.user_id === uid);

  const stats = useMemo(() => ({
    total: users.length,
    active: subscriptions.filter(s => s.status === "active").length,
    pending: subscriptions.filter(s => s.status === "pending").length,
    suspended: suspensions.length,
  }), [users, subscriptions, suspensions]);

    const filtered = useMemo(() => {
      const q = searchQuery.trim().toLowerCase();
      const searched = q
        ? users.filter(u =>
            u.full_name?.toLowerCase().includes(q) ||
            u.email?.toLowerCase().includes(q) ||
            u.user_id?.toLowerCase().includes(q)
          )
        : users;
      // Stat cards narrow the user list by their subscription status.
      if (cardFilter === "all") return searched;
      const matching = new Set(
        subscriptions.filter(s => s.status === cardFilter).map(s => s.user_id),
      );
      return searched.filter(u => matching.has(u.user_id));
    }, [users, searchQuery, cardFilter, subscriptions]);

  const statusBadge = (status: string) => {
    if (status === "active") return <Badge className="bg-green-600 text-white text-xs"><CheckCircle2 className="w-3 h-3 mr-1" />Active</Badge>;
    if (status === "pending") return <Badge variant="outline" className="border-amber-400 text-amber-700 text-xs"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
    if (status === "expired") return <Badge variant="destructive" className="text-xs"><XCircle className="w-3 h-3 mr-1" />Expired</Badge>;
    return <Badge variant="secondary" className="text-xs">{status}</Badge>;
  };

  const handleVerify = async (subId: string, userId: string, name: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("user_subscriptions").update({ status: "active", updated_at: new Date().toISOString(), verified_at: new Date().toISOString(), verified_by: user?.id } as any).eq("id", subId);
      try { await supabase.from("profiles").update({ account_status: "active", is_active: true, updated_at: new Date().toISOString() } as any).eq("user_id", userId); } catch {}
      toast.success(`"${name}" verified`);
      fetchData();
    } catch (e: any) { toast.error("Failed: " + e.message); }
  };

  const handleDelete = async () => {
    if (!deleteUser || !deleteReason.trim()) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("profiles").update({ account_status: "deleted", is_active: false } as any).eq("user_id", deleteUser.user_id);
      const sub = getSubForUser(deleteUser.user_id);
      if (sub) await supabase.from("user_subscriptions" as any).update({ is_deleted: true, deleted_at: new Date().toISOString(), deleted_by: user?.id, status: "expired" }).eq("id", sub.id);
      toast.success(`"${deleteUser.full_name}" deleted`);
      setDeleteOpen(false); setDeleteUser(null); setDeleteReason(""); fetchData();
    } catch (e: any) { toast.error("Failed: " + e.message); }
  };

  const handleSuspend = async () => {
    if (!suspendUser) return;
    try {
      try { await supabase.from("profiles").update({ account_status: "suspended" } as any).eq("user_id", suspendUser.user_id); } catch {}
      toast.success(`"${suspendUser.full_name}" suspended for ${suspendDays} days`);
      setSuspendOpen(false); setSuspendUser(null); setSuspendDays("7"); setSuspendReason(""); fetchData();
    } catch (e: any) { toast.error("Failed: " + e.message); }
  };

  const handleReactivate = async (userId: string, name: string) => {
    try {
      try { await supabase.from("profiles").update({ account_status: "active" } as any).eq("user_id", userId); } catch {}
      toast.success(`"${name}" reactivated`); fetchData();
    } catch (e: any) { toast.error("Failed: " + e.message); }
  };

  const openGrantAccess = async (user: any) => {
    setGrantUser(user);
    setGrantStoreId(""); setGrantRole("viewer"); setGrantExpiry("");
    setGrantLoading(true);
    try {
      // Fetch all stores (admin can see all)
      const { data: stores } = await supabase.from("stores").select("id, store_name, user_id").order("store_name");
      setGrantStores(stores || []);
      // Fetch existing access for this user
      const { data: access } = await supabase.from("store_access").select("*, stores(store_name)").eq("user_id", user.user_id);
      setExistingAccess(access || []);
    } catch (e: any) { toast.error("Failed to load stores: " + e.message); }
    finally { setGrantLoading(false); }
    setGrantOpen(true);
  };

  const handleGrantAccess = async () => {
    if (!grantUser || !grantStoreId) { toast.error("Select a store"); return; }
    setGrantLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      // Check if already has access
      const already = existingAccess.find(a => a.store_id === grantStoreId);
      if (already) {
        // Update role
        await supabase.from("store_access").update({ role: grantRole, ...(grantExpiry ? { expires_at: grantExpiry } : {}) } as any).eq("id", already.id);
        toast.success("Access updated");
      } else {
        await supabase.from("store_access").insert({
          store_id: grantStoreId, user_id: grantUser.user_id,
          role: grantRole, granted_by: user?.id || "",
          ...(grantExpiry ? { expires_at: grantExpiry } : {}),
        } as any);
        toast.success(`Access granted to ${grantUser.full_name}`);
      }
      // Refresh existing access list
      const { data: access } = await supabase.from("store_access").select("*, stores(store_name)").eq("user_id", grantUser.user_id);
      setExistingAccess(access || []);
      setGrantStoreId(""); setGrantRole("viewer"); setGrantExpiry("");
    } catch (e: any) { toast.error("Failed: " + e.message); }
    finally { setGrantLoading(false); }
  };

  const handleRevokeAccess = async (accessId: string) => {
    if (!confirm("Revoke this access?")) return;
    try {
      await supabase.from("store_access").delete().eq("id", accessId);
      setExistingAccess(prev => prev.filter(a => a.id !== accessId));
      toast.success("Access revoked");
    } catch (e: any) { toast.error("Failed: " + e.message); }
  };

  return (
    <div className="flex h-full flex-col space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold flex items-center gap-3">
            <Shield className="h-8 w-8 text-primary" />
            Admin Dashboard
          </h2>
          <p className="text-muted-foreground mt-1">Manage user accounts, subscriptions and store access.</p>
        </div>
        <Button onClick={fetchData} disabled={loading} variant="outline" size="sm" className="gap-2">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { key: "all" as const, label: "Total Users", value: stats.total, sub: cardFilter === "all" ? `showing ${filtered.length}` : "all users", icon: Users, color: "text-blue-600", bg: "bg-blue-50" },
          { key: "active" as const, label: "Active", value: stats.active, sub: "active subscription", icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50" },
          { key: "pending" as const, label: "Pending", value: stats.pending, sub: "awaiting payment", icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
          { key: undefined, label: "Suspended", value: stats.suspended, icon: AlertCircle, color: "text-red-600", bg: "bg-red-50" },
        ].map(({ key, label, value, sub, icon, color, bg }) => (
          <StatCard
            key={label}
            label={label}
            value={value}
            sub={sub}
            icon={icon}
            color={color}
            bg={bg}
            active={!!key && cardFilter === key}
            title={key ? `Show ${label.toLowerCase()} users` : undefined}
            onClick={key ? () => setCardFilter((c) => (c === key ? "all" : key)) : undefined}
          />
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search by name, email, or ID..." className="pl-9 pr-9 h-10" autoComplete="off" />
        {searchQuery && <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
      </div>

      {/* User list */}
        <ScrollArea className="min-h-0 flex-1" type="auto">
        <div className="space-y-4 pr-4">
          {loading ? (
            <div className="flex items-center justify-center py-16"><LoadingSpinner size="lg" text="Loading users..." /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="font-medium">No users found</p>
            </div>
          ) : filtered.map(user => {
            const sub = getSubForUser(user.user_id);
            const isSuspended = !!getSuspension(user.user_id);
            const isPending = sub?.status === "pending";
            return (
              <div key={user.id}
                className={`flex items-center justify-between p-4 border rounded-xl hover:bg-muted/50 transition-colors cursor-pointer ${isPending ? "border-amber-200 bg-amber-50/30" : ""} ${isSuspended ? "border-red-200 bg-red-50/30" : ""}`}
                onClick={() => { setSelectedUser(user); setUserDetailOpen(true); }}>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg shrink-0">
                    {(user.full_name || "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-[150px]">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold">{user.full_name || "No Name"}</h4>
                      {sub && statusBadge(sub.status)}
                      {isSuspended && <Badge variant="destructive" className="text-[10px]">Suspended</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{user.email}</p>
                    <div className="flex gap-4 mt-1">
                      {sub && <div className="text-[10px] text-muted-foreground">{sub.subscription_plans?.name || "Unknown plan"}</div>}
                      {sub?.amount_paid != null && <div className="text-[10px] text-muted-foreground">Paid: <span className="font-bold text-emerald-600">{fmtCurrency(sub.amount_paid)}</span></div>}
                      <div className="text-[10px] text-muted-foreground">{format(new Date(user.created_at), "MMM d, yyyy")}</div>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => { setSelectedUser(user); setUserDetailOpen(true); }}><Eye className="w-4 h-4" /></Button>
                  {sub?.status === "pending" && !sub.verified_at && (
                    <Button size="sm" className="h-8 text-xs gap-1 bg-green-600 hover:bg-green-700" onClick={() => handleVerify(sub.id, user.user_id, user.full_name || "User")}><CheckCircle2 className="w-3 h-3" />Verify</Button>
                  )}
                  <Button size="sm" variant="outline" className="h-8 text-xs gap-1 text-primary border-primary/30" onClick={() => openGrantAccess(user)}><KeyRound className="w-3 h-3" />Access</Button>
                  {!isSuspended ? (
                    <Button size="sm" variant="outline" className="h-8 text-xs gap-1 text-amber-600 border-amber-300" onClick={() => { setSuspendUser(user); setSuspendOpen(true); }}><PauseCircle className="w-3 h-3" />Suspend</Button>
                  ) : (
                    <Button size="sm" variant="outline" className="h-8 text-xs gap-1 text-green-600 border-green-300" onClick={() => handleReactivate(user.user_id, user.full_name || "User")}><CheckCircle2 className="w-3 h-3" />Reactivate</Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10" onClick={() => { setDeleteUser(user); setDeleteOpen(true); }}><Trash2 className="w-4 h-4" /></Button>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* User Detail Dialog */}
      <Dialog open={userDetailOpen} onOpenChange={setUserDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Users className="h-5 w-5" />User Details</DialogTitle></DialogHeader>
          {selectedUser && (() => {
            const sub = getSubForUser(selectedUser.user_id);
            return (
              <ScrollArea className="flex-1 overflow-y-auto" type="always">
                <div className="space-y-4 pr-2">
                  {/* Profile */}
                  <div className="rounded-xl border p-4 space-y-3">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
                        {(selectedUser.full_name || "?").charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-bold text-lg">{selectedUser.full_name || "No Name"}</p>
                        <p className="text-sm text-muted-foreground">{selectedUser.email}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div><p className="text-xs text-muted-foreground">User ID</p><p className="font-mono text-xs break-all">{selectedUser.user_id}</p></div>
                      <div><p className="text-xs text-muted-foreground">Account Status</p><Badge className="mt-0.5">{selectedUser.account_status || "active"}</Badge></div>
                      <div><p className="text-xs text-muted-foreground">Joined</p><p>{format(new Date(selectedUser.created_at), "PPP")}</p></div>
                      {selectedUser.last_login && <div><p className="text-xs text-muted-foreground">Last Login</p><p>{format(new Date(selectedUser.last_login), "PPP")}</p></div>}
                    </div>
                  </div>
                  {/* Subscription */}
                  {sub ? (
                    <div className="rounded-xl border p-4 space-y-3">
                      <p className="font-semibold text-sm flex items-center gap-2"><CreditCard className="h-4 w-4 text-primary" />Subscription</p>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div><p className="text-xs text-muted-foreground">Plan</p><p className="font-medium">{sub.subscription_plans?.name || "Unknown"}</p></div>
                        <div><p className="text-xs text-muted-foreground">Price</p><p>{fmtCurrency(sub.subscription_plans?.price ?? 0)}</p></div>
                        <div><p className="text-xs text-muted-foreground">Status</p><div className="mt-0.5">{statusBadge(sub.status)}</div></div>
                        <div><p className="text-xs text-muted-foreground">Amount Paid</p><p className="font-semibold text-green-600">{sub.amount_paid != null ? `${fmtCurrency(sub.amount_paid)}` : "Not paid"}</p></div>
                        <div><p className="text-xs text-muted-foreground">Payment Ref</p><p className="font-mono text-xs">{sub.payment_reference || "—"}</p></div>
                        <div><p className="text-xs text-muted-foreground">Expires</p><p>{sub.expires_at ? format(new Date(sub.expires_at), "PPP") : "—"}</p></div>
                        {sub.verified_at && <div className="col-span-2"><p className="text-xs text-muted-foreground">Verified</p><p className="text-green-600">{format(new Date(sub.verified_at), "PPP p")}</p></div>}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border p-4 text-center text-muted-foreground text-sm">No subscription found</div>
                  )}
                </div>
              </ScrollArea>
            );
          })()}
          <DialogFooter><Button variant="outline" onClick={() => setUserDetailOpen(false)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suspend Dialog */}
      <Dialog open={suspendOpen} onOpenChange={setSuspendOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><PauseCircle className="h-5 w-5 text-amber-600" />Suspend User</DialogTitle>
            <DialogDescription>Temporarily suspend {suspendUser?.full_name}'s access</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Duration (days)</Label><Input type="number" min="1" max="365" value={suspendDays} onChange={e => setSuspendDays(e.target.value)} className="mt-1" /></div>
            <div><Label className="text-xs">Reason</Label><Textarea value={suspendReason} onChange={e => setSuspendReason(e.target.value)} placeholder="Reason for suspension..." rows={3} className="mt-1" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspendOpen(false)}>Cancel</Button>
            <Button onClick={handleSuspend} className="bg-amber-500 hover:bg-amber-600">Suspend</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive"><UserX className="h-5 w-5" />Delete User</DialogTitle>
            <DialogDescription>Permanently delete {deleteUser?.full_name}'s account. This cannot be undone.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">The user will lose all access and data will be marked as deleted.</div>
            <div><Label className="text-xs">Reason *</Label><Textarea value={deleteReason} onChange={e => setDeleteReason(e.target.value)} placeholder="Reason for deletion..." rows={3} className="mt-1" required /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={!deleteReason.trim()}>Delete User</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Grant Access Dialog */}
      <Dialog open={grantOpen} onOpenChange={setGrantOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-primary" />Grant Store Access</DialogTitle>
            <DialogDescription>Grant or update {grantUser?.full_name}'s access to a store.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Grant form */}
            <div className="rounded-xl border p-4 space-y-3">
              <p className="text-sm font-semibold">Grant New Access</p>
              <div className="space-y-1">
                <Label className="text-xs">Store</Label>
                <Select value={grantStoreId} onValueChange={setGrantStoreId}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select a store" /></SelectTrigger>
                  <SelectContent>
                    {grantStores.map(s => (
                      <SelectItem key={s.id} value={s.id} className="text-sm">
                        <div className="flex items-center gap-2"><Store className="h-3.5 w-3.5 text-muted-foreground" />{s.store_name}</div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Role</Label>
                  <Select value={grantRole} onValueChange={setGrantRole}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="viewer">Viewer (read-only)</SelectItem>
                      <SelectItem value="cashier">Cashier</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Expires (optional)</Label>
                  <Input type="date" value={grantExpiry} onChange={e => setGrantExpiry(e.target.value)} className="h-9" />
                </div>
              </div>
              <Button onClick={handleGrantAccess} disabled={!grantStoreId || grantLoading} className="w-full gap-2">
                {grantLoading ? <><span className="animate-spin">?</span>Processing...</> : <><UserCheck className="h-4 w-4" />Grant Access</>}
              </Button>
            </div>

            {/* Existing access */}
            {existingAccess.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold">Current Access</p>
                {existingAccess.map(a => (
                  <div key={a.id} className="flex items-center justify-between p-3 rounded-xl border bg-card text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <Store className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium truncate">{a.stores?.store_name || a.store_id}</p>
                        <p className="text-xs text-muted-foreground capitalize">{a.role}</p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 text-destructive hover:text-destructive shrink-0"
                      onClick={() => handleRevokeAccess(a.id)}>
                      <X className="h-3.5 w-3.5" />Revoke
                    </Button>
                  </div>
                ))}
              </div>
            )}
            {existingAccess.length === 0 && !grantLoading && (
              <p className="text-xs text-muted-foreground text-center py-2">No store access granted yet.</p>
            )}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setGrantOpen(false)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminDashboard;