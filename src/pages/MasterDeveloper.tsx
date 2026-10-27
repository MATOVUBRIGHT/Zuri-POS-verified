import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { Activity, Building2, CalendarClock, CheckCircle2, CreditCard, Landmark, Megaphone, RefreshCw, Search, ShieldCheck, Trash2, UserCog, UsersRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Store = { id: string; store_name: string; user_id: string; created_at: string };
type Person = { user_id: string; full_name?: string | null; account_status?: string | null; last_login?: string | null };
type Plan = { id: string; user_id: string; status?: string | null; expires_at?: string | null; payment_reference?: string | null; plan_name?: string | null };
type Access = { id: string; store_id: string; user_id: string; role: string; created_at: string };
type GlobalRole = { id: string; user_id: string; role: string; created_at: string };

const personName = (people: Person[], id: string) => people.find((p) => p.user_id === id)?.full_name || "Unprofiled user";
const dateLabel = (value?: string | null) => value ? new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "Not set";

function subscriptionState(plan?: Plan) {
  if (!plan) return { label: "No plan", tone: "outline" as const, detail: "Set up subscription" };
  if (plan.expires_at && new Date(plan.expires_at) < new Date() && plan.status === "active") return { label: "Expired", tone: "destructive" as const, detail: `Ended ${dateLabel(plan.expires_at)}` };
  if (plan.status === "active") return { label: "Active", tone: "default" as const, detail: plan.expires_at ? `Until ${dateLabel(plan.expires_at)}` : "No expiry" };
  return { label: plan.status || "Pending", tone: "outline" as const, detail: plan.expires_at ? `Until ${dateLabel(plan.expires_at)}` : "No expiry" };
}

export default function MasterDeveloper() {
  const [state, setState] = useState<"checking" | "allowed" | "denied">("checking");
  const [me, setMe] = useState<string | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [access, setAccess] = useState<Access[]>([]);
  const [roles, setRoles] = useState<GlobalRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [accessQuery, setAccessQuery] = useState("");
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [assignmentStore, setAssignmentStore] = useState("");
  const [subscriptionTarget, setSubscriptionTarget] = useState<Plan | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState("pending");
  const [subscriptionExpiry, setSubscriptionExpiry] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [savingSubscription, setSavingSubscription] = useState(false);

  const load = async () => {
    setLoading(true);
    const [s, p, pl, a, r] = await Promise.all([
      supabase.from("stores").select("id, store_name, user_id, created_at").order("created_at", { ascending: false }),
      supabase.from("profiles").select("user_id, full_name, account_status, last_login"),
      supabase.from("user_subscriptions").select("id, user_id, status, expires_at, payment_reference, subscription_plans(name)").order("created_at", { ascending: false }),
      supabase.from("store_access").select("id, store_id, user_id, role, created_at").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("id, user_id, role, created_at").order("created_at", { ascending: false }),
    ]);
    setStores((s.data || []) as Store[]);
    setPeople((p.data || []) as unknown as Person[]);
    setPlans(((pl.data || []) as any[]).map((item) => ({ ...item, plan_name: item.subscription_plans?.name || null })) as Plan[]);
    setAccess((a.data || []) as unknown as Access[]);
    setRoles((r.data || []) as unknown as GlobalRole[]);
    setLoading(false);
  };

  useEffect(() => {
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return setState("denied");
      setMe(session.user.id);
      const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", session.user.id);
      if (error || !data?.some((entry) => ["master_developer", "admin"].includes(String(entry.role)))) return setState("denied");
      setState("allowed");
      void load();
    })();
  }, []);

  const branches = useMemo(() => stores.filter((s) => `${s.store_name} ${personName(people, s.user_id)}`.toLowerCase().includes(query.toLowerCase())), [stores, people, query]);
  const assignments = useMemo(() => access.filter((a) => `${personName(people, a.user_id)} ${stores.find((s) => s.id === a.store_id)?.store_name || ""} ${a.role}`.toLowerCase().includes(accessQuery.toLowerCase())), [access, people, stores, accessQuery]);
  const businesses = new Set(stores.map((store) => store.user_id)).size;
  const activeAccounts = people.filter((person) => (person.account_status || "active") === "active").length;
  const activePlans = plans.filter((plan) => subscriptionState(plan).label === "Active").length;
  const expiringPlans = plans.filter((plan) => plan.expires_at && new Date(plan.expires_at) >= new Date() && new Date(plan.expires_at).getTime() - Date.now() < 1000 * 60 * 60 * 24 * 30).length;

  const openSubscription = (plan: Plan | undefined, userId: string) => {
    const target = plan || { id: "", user_id: userId, status: "pending" };
    setSubscriptionTarget(target);
    setSubscriptionStatus(target.status || "pending");
    setSubscriptionExpiry(target.expires_at?.slice(0, 10) || "");
    setPaymentReference(target.payment_reference || "");
  };

  const saveSubscription = async () => {
    if (!subscriptionTarget) return;
    setSavingSubscription(true);
    const payload = { user_id: subscriptionTarget.user_id, status: subscriptionStatus, expires_at: subscriptionExpiry ? new Date(`${subscriptionExpiry}T23:59:59`).toISOString() : null, payment_reference: paymentReference.trim() || null };
    const result = subscriptionTarget.id ? await supabase.from("user_subscriptions").update(payload).eq("id", subscriptionTarget.id) : await supabase.from("user_subscriptions").insert(payload);
    setSavingSubscription(false);
    if (!result.error) { setSubscriptionTarget(null); void load(); }
  };

  const revokeBusiness = async (ownerId: string) => {
    if (!window.confirm("Revoke this business account and remove access from all its branches?")) return;
    const ownedBranchIds = stores.filter((store) => store.user_id === ownerId).map((store) => store.id);
    await supabase.from("profiles").update({ account_status: "suspended", is_active: false }).eq("user_id", ownerId);
    if (ownedBranchIds.length) await supabase.from("store_access").delete().in("store_id", ownedBranchIds);
    void load();
  };

  if (state === "checking") return <LoadingSpinner size="xl" fullScreen />;
  if (state === "denied") return <Navigate to="/" replace />;

  return <main className="min-h-screen overflow-y-auto bg-slate-50/70 px-4 py-6 pb-16 md:p-8"><section className="mx-auto max-w-7xl space-y-6"><header className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 px-5 py-7 text-white shadow-sm sm:px-8"><div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-emerald-400/20 blur-3xl" /><div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><Badge className="border-white/20 bg-white/10 text-emerald-100 hover:bg-white/10">Developer portal</Badge><h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Zuri platform control</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">One protected workspace for the businesses, subscriptions, branches, and platform roles powering Zuri.</p></div><Button variant="secondary" className="w-fit" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh data</Button></div></header>{loading ? <Card className="min-h-[420px]"><CardContent className="flex min-h-[420px] items-center justify-center"><LoadingSpinner size="lg" /></CardContent></Card> : <><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Businesses" value={businesses} detail="Business owners with branches" icon={UsersRound} tone="emerald" /><Metric label="Branches" value={stores.length} detail="Locations across Zuri" icon={Building2} tone="sky" /><Metric label="Active accounts" value={activeAccounts} detail="Profiles ready to operate" icon={ShieldCheck} tone="violet" /><Metric label="Active subscriptions" value={activePlans} detail={expiringPlans ? `${expiringPlans} expiring in 30 days` : "No upcoming expiries"} icon={Landmark} tone="amber" /></div><Card className="overflow-hidden rounded-2xl border-slate-200 shadow-sm"><CardHeader className="gap-4 border-b bg-white sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700"><Activity className="h-4 w-4" /></span><div><CardTitle className="text-base">Business overview</CardTitle><CardDescription>Review ownership, branch health, account status, and subscription coverage.</CardDescription></div></div><Finder value={query} change={setQuery} placeholder="Search business or branch" /></CardHeader><CardContent className="p-0"><div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[900px] text-sm"><thead className="border-b bg-slate-50/70 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-6 py-3">Branch</th><th className="py-3">Business owner</th><th className="py-3">Account</th><th className="py-3">Subscription</th><th className="py-3">Created</th><th className="px-6 py-3 text-right">Actions</th></tr></thead><tbody>{branches.map((store) => <BusinessRow key={store.id} store={store} owner={people.find((p) => p.user_id === store.user_id)} plan={plans.find((p) => p.user_id === store.user_id)} openSubscription={openSubscription} setSelectedStore={setSelectedStore} setAssignmentStore={setAssignmentStore} />)}</tbody></table></div><div className="divide-y md:hidden">{branches.map((store) => <BusinessCard key={store.id} store={store} owner={people.find((p) => p.user_id === store.user_id)} plan={plans.find((p) => p.user_id === store.user_id)} openSubscription={openSubscription} setSelectedStore={setSelectedStore} setAssignmentStore={setAssignmentStore} />)}</div>{!branches.length && <p className="py-12 text-center text-sm text-muted-foreground">No businesses or branches match this search.</p>}</CardContent></Card><AccessConsole grantedBy={me!} stores={stores} people={people} assignments={assignments} selectedStore={assignmentStore} selectStore={setAssignmentStore} query={accessQuery} setQuery={setAccessQuery} reload={load} /><GlobalRoles people={people} roles={roles} reload={load} /></>}</section><BranchHealth store={selectedStore} people={people} access={access} close={() => setSelectedStore(null)} /><SubscriptionEditor target={subscriptionTarget} status={subscriptionStatus} expiry={subscriptionExpiry} setStatus={setSubscriptionStatus} setExpiry={setSubscriptionExpiry} saving={savingSubscription} close={() => setSubscriptionTarget(null)} save={saveSubscription} /></main>;
}

function Metric({ label, value, detail, icon: Icon, tone }: { label: string; value: number; detail: string; icon: typeof Building2; tone: "emerald" | "sky" | "violet" | "amber" }) { const styles = { emerald: "border-emerald-200 bg-emerald-50/70 text-emerald-700", sky: "border-sky-200 bg-sky-50/70 text-sky-700", violet: "border-violet-200 bg-violet-50/70 text-violet-700", amber: "border-amber-200 bg-amber-50/70 text-amber-700" }[tone]; return <Card className={`rounded-2xl shadow-sm ${styles}`}><CardContent className="p-5"><div className="flex items-center justify-between"><p className="text-sm font-medium">{label}</p><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/80 shadow-sm"><Icon className="h-5 w-5" /></span></div><p className="mt-4 text-3xl font-bold tracking-tight text-slate-950">{value.toLocaleString()}</p><p className="mt-1 text-xs text-slate-600">{detail}</p></CardContent></Card>; }
function Finder({ value, change, placeholder }: { value: string; change: (value: string) => void; placeholder: string }) { return <div className="relative w-full sm:w-80"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="border-slate-200 bg-slate-50 pl-9" value={value} onChange={(e) => change(e.target.value)} placeholder={placeholder} /></div>; }

type BusinessProps = { store: Store; owner?: Person; plan?: Plan; openSubscription: (plan: Plan | undefined, userId: string) => void; setSelectedStore: (store: Store) => void; setAssignmentStore: (id: string) => void; revokeBusiness?: () => void };
function BusinessRow({ store, owner, plan, openSubscription, setSelectedStore, setAssignmentStore }: BusinessProps) { const subscription = subscriptionState(plan); return <tr className="border-b last:border-0 hover:bg-slate-50/60"><td className="px-6 py-4"><p className="font-semibold text-slate-950">{store.store_name}</p><p className="mt-0.5 text-xs text-muted-foreground">Branch location</p></td><td><p className="font-medium">{owner?.full_name || "Unprofiled owner"}</p><p className="text-xs text-muted-foreground">Business account</p><p className="text-xs text-muted-foreground">Last login: {dateLabel(owner?.last_login)}</p></td><td><Badge variant={owner?.account_status === "suspended" ? "destructive" : "secondary"}>{owner?.account_status || "active"}</Badge></td><td><button type="button" className="group flex items-center gap-2 text-left" onClick={() => openSubscription(plan, store.user_id)}><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600 group-hover:bg-emerald-50 group-hover:text-emerald-700"><CreditCard className="h-4 w-4" /></span><span><span className="block font-medium">{plan?.plan_name || "No plan assigned"}</span><span className="flex items-center gap-1 text-xs text-muted-foreground"><Badge variant={subscription.tone}>{subscription.label}</Badge>{subscription.detail}</span></span></button></td><td className="text-muted-foreground">{dateLabel(store.created_at)}</td><td className="px-6 text-right"><div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => setSelectedStore(store)}>Health</Button><Button size="sm" variant="ghost" onClick={() => setAssignmentStore(store.id)}>Access</Button></div></td></tr>; }
function BusinessCard({ store, owner, plan, openSubscription, setSelectedStore, setAssignmentStore, revokeBusiness }: BusinessProps) { const subscription = subscriptionState(plan); return <article className="space-y-4 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-slate-950">{store.store_name}</p><p className="mt-1 text-sm text-muted-foreground">{owner?.full_name || "Unprofiled owner"}</p><p className="text-xs text-muted-foreground">Last login: {dateLabel(owner?.last_login)}</p></div><Badge variant={owner?.account_status === "suspended" ? "destructive" : "secondary"}>{owner?.account_status || "active"}</Badge></div><button type="button" className="flex w-full items-center gap-3 rounded-xl border bg-slate-50 p-3 text-left" onClick={() => openSubscription(plan, store.user_id)}><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-slate-600"><CreditCard className="h-4 w-4" /></span><span><span className="block text-sm font-medium">{plan?.plan_name || "No plan assigned"}</span><span className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground"><Badge variant={subscription.tone}>{subscription.label}</Badge>{subscription.detail}</span></span></button><div className="flex items-center justify-between gap-2"><span className="text-xs text-muted-foreground">Created {dateLabel(store.created_at)}</span><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setSelectedStore(store)}>Health</Button><Button size="sm" variant="ghost" onClick={() => setAssignmentStore(store.id)}>Access</Button><Button size="sm" variant="destructive" onClick={revokeBusiness}><Trash2 className="h-4 w-4" /></Button></div></div></article>; }

function SubscriptionEditor({ target, status, expiry, setStatus, setExpiry, saving, close, save }: { target: Plan | null; status: string; expiry: string; setStatus: (value: string) => void; setExpiry: (value: string) => void; saving: boolean; close: () => void; save: () => void }) { return <Dialog open={!!target} onOpenChange={(open) => !open && close()}><DialogContent><DialogHeader><DialogTitle>Manage business subscription</DialogTitle><DialogDescription>Update the license state and expiry date for this business. Changes apply to the account owner.</DialogDescription></DialogHeader><div className="space-y-4"><div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-muted-foreground"><CalendarClock className="mr-2 inline h-4 w-4" />{target?.expires_at ? `Current expiry: ${dateLabel(target.expires_at)}` : "No expiry date is currently set."}</div><div className="space-y-2"><Label>Status</Label><Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pending">Pending</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="expired">Expired</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label htmlFor="portal-subscription-expiry">Expiry date</Label><Input id="portal-subscription-expiry" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} /></div></div><DialogFooter><Button variant="outline" onClick={close}>Cancel</Button><Button disabled={saving} onClick={() => void save()}>{saving ? "Saving..." : "Save subscription"}</Button></DialogFooter></DialogContent></Dialog>; }

function AccessConsole({ grantedBy, stores, people, assignments, selectedStore, selectStore, query, setQuery, reload }: { grantedBy: string; stores: Store[]; people: Person[]; assignments: Access[]; selectedStore: string; selectStore: (id: string) => void; query: string; setQuery: (value: string) => void; reload: () => void }) { const [userId, setUserId] = useState(""); const [role, setRole] = useState("accountant"); const [message, setMessage] = useState(""); const save = async () => { const { error } = await supabase.from("store_access").upsert({ store_id: selectedStore, user_id: userId, granted_by: grantedBy, role }, { onConflict: "store_id,user_id" }); setMessage(error ? "Could not save branch access." : "Branch access saved."); if (!error) { reload(); setUserId(""); } }; return <Card className="rounded-2xl border-slate-200 shadow-sm"><CardHeader className="gap-4 border-b bg-white sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-50 text-sky-700"><UserCog className="h-4 w-4" /></span><div><CardTitle className="text-base">Branch access</CardTitle><CardDescription>Grant or review scoped access by branch and role.</CardDescription></div></div><Finder value={query} change={setQuery} placeholder="Filter people, branches, roles" /></CardHeader><CardContent className="space-y-4 p-5"><div className="grid gap-3 md:grid-cols-4"><Select value={selectedStore} onValueChange={selectStore}><SelectTrigger><SelectValue placeholder="Choose branch" /></SelectTrigger><SelectContent>{stores.map((store) => <SelectItem key={store.id} value={store.id}>{store.store_name}</SelectItem>)}</SelectContent></Select><Select value={userId} onValueChange={setUserId}><SelectTrigger><SelectValue placeholder="Choose person" /></SelectTrigger><SelectContent>{people.map((person) => <SelectItem key={person.user_id} value={person.user_id}>{person.full_name || person.user_id}</SelectItem>)}</SelectContent></Select><Select value={role} onValueChange={setRole}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="accountant">Accountant</SelectItem><SelectItem value="boss">Boss</SelectItem><SelectItem value="manager">Manager</SelectItem></SelectContent></Select><Button disabled={!selectedStore || !userId} onClick={() => void save()}>Grant or update</Button></div>{message && <p className="text-sm text-muted-foreground" role="status">{message}</p>}<div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="pb-3">Person</th><th className="pb-3">Branch</th><th className="pb-3">Role</th><th className="pb-3">Date</th></tr></thead><tbody>{assignments.map((assignment) => <tr key={assignment.id} className="border-b last:border-0"><td className="py-3 font-medium">{personName(people, assignment.user_id)}</td><td>{stores.find((store) => store.id === assignment.store_id)?.store_name || "Deleted branch"}</td><td><Badge variant="outline">{assignment.role}</Badge></td><td>{dateLabel(assignment.created_at)}</td></tr>)}</tbody></table>{!assignments.length && <p className="py-6 text-center text-sm text-muted-foreground">No branch access assignments match this filter.</p>}</div></CardContent></Card>; }

function GlobalRoles({ people, roles, reload }: { people: Person[]; roles: GlobalRole[]; reload: () => void }) { const [userId, setUserId] = useState(""); const [role, setRole] = useState("master_developer"); const save = async () => { const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: role as any }); if (!error) { reload(); setUserId(""); } }; return <Card className="rounded-2xl border-slate-200 shadow-sm"><CardHeader className="border-b bg-white"><div className="flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-50 text-violet-700"><ShieldCheck className="h-4 w-4" /></span><div><CardTitle className="text-base">Global roles</CardTitle><CardDescription>Control who can open the developer portal and administer the platform.</CardDescription></div></div></CardHeader><CardContent className="space-y-4 p-5"><div className="grid gap-3 md:grid-cols-3"><Select value={userId} onValueChange={setUserId}><SelectTrigger><SelectValue placeholder="Choose person" /></SelectTrigger><SelectContent>{people.map((person) => <SelectItem key={person.user_id} value={person.user_id}>{person.full_name || person.user_id}</SelectItem>)}</SelectContent></Select><Select value={role} onValueChange={setRole}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="master_developer">Master developer</SelectItem><SelectItem value="admin">Admin</SelectItem><SelectItem value="manager">Manager</SelectItem></SelectContent></Select><Button disabled={!userId} variant="outline" onClick={() => void save()}>Grant global role</Button></div><div className="grid gap-2 md:grid-cols-2">{roles.map((item) => <div key={item.id} className="flex items-center gap-3 rounded-lg border border-violet-100 bg-violet-50/40 px-3 py-3"><CheckCircle2 className="h-4 w-4 shrink-0 text-violet-600" /><div><p className="text-sm font-medium">{personName(people, item.user_id)}</p><p className="text-xs capitalize text-muted-foreground">{item.role.split("_").join(" ")} · {dateLabel(item.created_at)}</p></div></div>)}</div></CardContent></Card>; }

function BranchHealth({ store, people, access, close }: { store: Store | null; people: Person[]; access: Access[]; close: () => void }) { const listed = access.filter((item) => item.store_id === store?.id); return <Dialog open={!!store} onOpenChange={(open) => !open && close()}><DialogContent><DialogHeader><DialogTitle>{store?.store_name || "Branch health"}</DialogTitle><DialogDescription>Current business owner and assigned access.</DialogDescription></DialogHeader>{store && <div className="grid gap-4"><div className="grid grid-cols-2 gap-3"><div className="border-l-2 border-primary bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Business owner</p><p className="mt-1 font-medium">{personName(people, store.user_id)}</p></div><div className="border-l-2 border-emerald-600 bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Access grants</p><p className="mt-1 font-medium">{listed.length} active</p></div></div><div><p className="text-sm font-medium">Assigned people</p><div className="mt-2 space-y-2">{listed.map((item) => <div key={item.id} className="flex justify-between border-b pb-2 text-sm"><span>{personName(people, item.user_id)}</span><Badge variant="outline">{item.role}</Badge></div>)}{!listed.length && <p className="text-sm text-muted-foreground">No extra branch access has been granted.</p>}</div></div></div>}</DialogContent></Dialog>; }
