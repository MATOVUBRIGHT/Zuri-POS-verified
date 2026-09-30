import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Pencil, Plus, ShieldCheck, UserMinus, UsersRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BRANCH_ASSIGNABLE_POS_PAGES } from "@/lib/posPageRegistry";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { PageLoader } from "@/components/ui/loading-spinner";

const pageIds = BRANCH_ASSIGNABLE_POS_PAGES.map((page) => page.id);
const defaults: Record<string, string[]> = { cashier: ["sales-entry", "shifts"], manager: pageIds, admin: pageIds, accountant: ["dashboard", "accounts", "expenses", "reports"] };
type Branch = { id: string; store_name: string };
type Member = { id: string; full_name: string; login_username: string | null; role: string; status: string; allowed_pages: string[] | null; store_id: string };
type Form = { full_name: string; username: string; password: string; role: string; allowed_pages: string[] };
const fresh = (): Form => ({ full_name: "", username: "", password: "", role: "cashier", allowed_pages: defaults.cashier });

export default function ExecutiveTeamAccess({ userId }: { userId: string | null }) {
  const { toast } = useToast(); const [branches, setBranches] = useState<Branch[]>([]); const [members, setMembers] = useState<Member[]>([]); const [branchId, setBranchId] = useState(""); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [open, setOpen] = useState(false); const [editing, setEditing] = useState<Member | null>(null); const [form, setForm] = useState<Form>(fresh());
  const branch = useMemo(() => branches.find((item) => item.id === branchId), [branches, branchId]);
  const loadBranches = useCallback(async () => { if (!userId) return; setLoading(true); const { data, error } = await supabase.from("stores").select("id, store_name").eq("user_id", userId).order("store_name"); if (error) toast({ title: "Could not load branches", description: error.message, variant: "destructive" }); const next = (data || []) as Branch[]; setBranches(next); setBranchId((current) => current || next[0]?.id || ""); setLoading(false); }, [toast, userId]);
  const loadMembers = useCallback(async () => { if (!branchId) return setMembers([]); const { data, error } = await supabase.from("staff").select("id, full_name, login_username, role, status, allowed_pages, store_id").eq("store_id", branchId).order("full_name"); if (error) return toast({ title: "Could not load team", description: error.message, variant: "destructive" }); setMembers((data || []) as unknown as Member[]); }, [branchId, toast]);
  useEffect(() => { void loadBranches(); }, [loadBranches]); useEffect(() => { void loadMembers(); }, [loadMembers]);
  const startCreate = () => { setEditing(null); setForm(fresh()); setOpen(true); };
  const startEdit = (member: Member) => { setEditing(member); setForm({ full_name: member.full_name, username: member.login_username || "", password: "", role: member.role, allowed_pages: member.allowed_pages || defaults[member.role] || [] }); setOpen(true); };
  const toggle = (id: string) => setForm((current) => ({ ...current, allowed_pages: current.allowed_pages.includes(id) ? current.allowed_pages.filter((page) => page !== id) : [...current.allowed_pages, id] }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!branchId || !form.full_name.trim() || !form.role) return;
    if (!editing && (!form.username.trim() || form.password.length < 8)) {
      return toast({ title: "Complete the login details", description: "A username and password of at least 8 characters are required.", variant: "destructive" });
    }
    setSaving(true);
    try {
      // Both create and edit go through the edge function so auth.users metadata
      // and store_access role are always kept in sync with the staff record.
      const { data, error } = await supabase.functions.invoke("provision-branch-user", {
        body: {
          store_id: branchId,
          full_name: form.full_name.trim(),
          username: form.username.trim().toLowerCase(),
          password: form.password || undefined,
          role: form.role,
          allowed_pages: form.allowed_pages,
          ...(editing ? { staff_id: editing.id } : {}),
        },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message || "Could not save branch user");
      toast({
        title: editing ? "User updated" : "User created",
        description: editing
          ? `${form.full_name} has been updated.`
          : `${form.full_name} can now sign in to ${branch?.store_name}.`,
      });
      setOpen(false);
      setEditing(null);
      await loadMembers();
    } catch (error: any) {
      toast({ title: editing ? "Could not update user" : "Could not create user", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };
  const deactivate = async (member: Member) => { const { data, error } = await supabase.functions.invoke("provision-branch-user", { body: { action: "deactivate", store_id: member.store_id, staff_id: member.id } }); if (error || data?.error) return toast({ title: "Could not deactivate login", description: data?.error || error?.message, variant: "destructive" }); toast({ title: "Login deactivated" }); await loadMembers(); };
  if (loading) return <PageLoader text="Loading team access…" className="min-h-[360px]" />;
  return <section className="space-y-6"><Card className="border-slate-200 shadow-sm"><CardHeader><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div className="flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700"><UsersRound className="h-4 w-4" /></span><div><CardTitle className="text-xl text-slate-950">Team & Roles</CardTitle><CardDescription>Each direct login is scoped to its selected branch and permitted pages.</CardDescription></div></div><Button onClick={startCreate} disabled={!branches.length}><Plus className="mr-2 h-4 w-4" />Create user</Button></div></CardHeader><CardContent className="space-y-3"><Select value={branchId} onValueChange={setBranchId}><SelectTrigger className="max-w-sm"><SelectValue placeholder="Select branch" /></SelectTrigger><SelectContent>{branches.map((item) => <SelectItem key={item.id} value={item.id}>{item.store_name}</SelectItem>)}</SelectContent></Select>{members.length ? members.map((member) => <article key={member.id} className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-950">{member.full_name}</p><Badge variant="outline">{member.role}</Badge><Badge variant={member.status === "active" ? "secondary" : "outline"}>{member.status}</Badge></div><p className="mt-1 text-sm text-slate-500">{member.login_username ? `@${member.login_username}` : "Existing staff profile"}</p></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => startEdit(member)}><Pencil className="mr-2 h-4 w-4" />Edit</Button>{member.status === "active" && member.login_username && <Button variant="outline" size="sm" className="text-rose-700" onClick={() => void deactivate(member)}><UserMinus className="mr-2 h-4 w-4" />Deactivate</Button>}</div></article>) : <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No team users yet. Use Create user to add one.</div>}</CardContent></Card><Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>{editing ? "Edit team user" : "Create team user"}</DialogTitle><DialogDescription>{editing ? "Update role and page access, or choose Create user to add another person." : "Create a secure branch login with a role and page access."}</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-4"><div className="space-y-2"><Label>Assigned branch</Label><Select value={branchId} onValueChange={setBranchId} disabled={Boolean(editing)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{branches.map((item) => <SelectItem key={item.id} value={item.id}>{item.store_name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Name</Label><Input value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} required /></div>{!editing && <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Login username</Label><Input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value.toLowerCase().replace(/\s/g, "") })} required /></div><div className="space-y-2"><Label>Password</Label><Input type="password" value={form.password} minLength={8} onChange={(event) => setForm({ ...form, password: event.target.value })} required /></div></div>}{editing && <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Login username</Label><Input value={form.username} readOnly disabled className="opacity-60 cursor-not-allowed" /></div><div className="space-y-2"><Label>New password <span className="text-muted-foreground text-xs">(leave blank to keep current)</span></Label><Input type="password" value={form.password} minLength={8} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="Leave blank to keep current" /></div></div>}<div className="space-y-2"><Label>Role</Label><Select value={form.role} onValueChange={(role) => setForm({ ...form, role, allowed_pages: defaults[role] || [] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="cashier">Cashier</SelectItem><SelectItem value="manager">Manager</SelectItem><SelectItem value="accountant">Accountant</SelectItem><SelectItem value="admin">Branch administrator</SelectItem></SelectContent></Select></div><fieldset className="space-y-2"><legend className="text-sm font-medium">POS pages</legend><div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">{BRANCH_ASSIGNABLE_POS_PAGES.map((page) => <label key={page.id} className="flex items-center gap-2 text-sm"><Checkbox checked={form.allowed_pages.includes(page.id)} onCheckedChange={() => toggle(page.id)} />{page.label}</label>)}</div></fieldset><Button type="submit" className="w-full" disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editing ? "Save changes" : "Create user"}</Button>{editing && <Button type="button" variant="outline" className="w-full" disabled={saving} onClick={() => { setOpen(false); setTimeout(startCreate, 80); }}><Plus className="mr-2 h-4 w-4" />Create new user</Button>}</form></DialogContent></Dialog><div className="flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50/50 px-4 py-3 text-sm text-emerald-900"><ShieldCheck className="h-4 w-4 shrink-0" />Role provisioning remains server-side; this screen only submits the scoped assignment.</div></section>;
}
