import { useCallback, useEffect, useMemo, useState } from "react";
import { LoadingMark, PageLoader, useMinimumLoading } from "@/components/ui/loading-spinner";
import { CircleAlert, Info, Landmark, Pencil, Plus, Scale, WalletCards } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fmtCurrency } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

type Account = { id: string; store_id: string; name: string; provider_type: string; account_number: string | null; reference_instructions: string | null; external_link?: string | null; opening_balance: number; is_active: boolean };
type Branch = { id: string; store_name: string };
type Ledger = { id: string; account_id: string; amount: number; entry_type: string; reference: string | null; notes: string | null; created_at: string };
const TYPES = ["cash", "bank", "mobile_money", "pesapal", "card", "other"];
const label = (value: string) => value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
const blank = { name: "", provider_type: "cash", account_number: "", reference_instructions: "", external_link: "", opening_balance: "0", is_active: true };

export default function PaymentAccounts({ currentStoreId, executive = false, userId }: { currentStoreId?: string | null; executive?: boolean; userId?: string | null }) {
  const { toast } = useToast();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [storeId, setStoreId] = useState(currentStoreId || "");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [ledger, setLedger] = useState<Ledger[]>([]);
  const [balances, setBalances] = useState<Record<string, number>>({});

  const [loading, setLoading] = useState(true);
  const showLoader = useMinimumLoading(loading, 350);
  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [adjusting, setAdjusting] = useState<Account | null>(null);
  const [reconciling, setReconciling] = useState<Account | null>(null);
  const [reconcileLedger, setReconcileLedger] = useState<Ledger[]>([]);
  const [reconcileLoading, setReconcileLoading] = useState(false);
  const [statementBalance, setStatementBalance] = useState("");
  const [providerCharges, setProviderCharges] = useState("");
  const [chargesTouched, setChargesTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<any>(blank);
  const [adjustment, setAdjustment] = useState({ amount: "", entry_type: "adjustment", reference: "", notes: "" });

  const loadBranches = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const id = userId || auth.user?.id;
    if (!id) return;
    const [owned, linked] = await Promise.all([
      supabase.from("stores").select("id, store_name").eq("user_id", id),
      executive ? supabase.from("store_access").select("store_id").eq("user_id", id).in("role", ["boss", "accountant"]) : Promise.resolve({ data: [] as any[] }),
    ]);
    const ids = [
      ...new Set([...(owned.data || []).map((b: any) => b.id), ...((linked.data || []).map((b: any) => b.store_id))]),
    ];
    const fetched = ids.length ? await supabase.from("stores").select("id, store_name").in("id", ids) : { data: [] as any[] };
    const rows = (fetched.data || owned.data || []) as Branch[];
    setBranches(rows);
    setStoreId((v) => v || currentStoreId || rows[0]?.id || "");
  }, [currentStoreId, executive, userId]);

  const load = useCallback(async () => {
    if (!storeId) { setLoading(false); return; }
    setLoading(true);
    const [a, l, b] = await Promise.all([
      supabase.from("branch_payment_accounts" as any).select("*").eq("store_id", storeId).order("created_at", { ascending: false }),
      supabase.from("payment_account_ledger" as any).select("*").eq("store_id", storeId).order("created_at", { ascending: false }).limit(12),
      supabase.rpc("get_payment_account_balances" as any, { p_store_id: storeId }),
    ]);
    const error = a.error || l.error || b.error;
    if (error) toast({ title: "Accounts unavailable", description: error.message, variant: "destructive" });
    setAccounts((a.data || []) as unknown as Account[]);
    setLedger((l.data || []) as unknown as Ledger[]);
    setBalances(Object.fromEntries(((b.data || []) as any[]).map((row) => [row.account_id, Number(row.available_balance || 0)])));
    setLoading(false);
  }, [storeId, toast]);

  useEffect(() => { void loadBranches(); }, [loadBranches]);
  useEffect(() => { void load(); }, [load]);

  const openNew = () => { setEditing(null); setForm(blank); setDialog(true); };
  const openEdit = (account: Account) => {
    setEditing(account);
    setForm({
      name: account.name,
      provider_type: account.provider_type,
      account_number: account.account_number || "",
      reference_instructions: account.reference_instructions || "",
      external_link: (account as any).external_link || "",
      opening_balance: String(account.opening_balance || 0),
      is_active: account.is_active,
    });
    setDialog(true);
  };

  const save = async () => {
    if (!storeId || !form.name.trim()) return;
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    const payload = editing
      ? {
          name: form.name.trim(),
          provider_type: form.provider_type,
          account_number: form.account_number.trim() || null,
          reference_instructions: form.reference_instructions.trim() || null,
          external_link: (form as any).external_link?.trim() || null,
          is_active: form.is_active,
        }
      : {
          store_id: storeId,
          name: form.name.trim(),
          provider_type: form.provider_type,
          account_number: form.account_number.trim() || null,
          reference_instructions: form.reference_instructions.trim() || null,
          external_link: (form as any).external_link?.trim() || null,
          opening_balance: Number(form.opening_balance || 0),
          is_active: form.is_active,
          created_by: auth.user?.id,
        };
    const result: any = editing
      ? await (supabase.from("branch_payment_accounts" as any) as any).update(payload).eq("id", editing.id)
      : await (supabase.from("branch_payment_accounts" as any) as any).insert(payload);
    setSaving(false);
    if (result.error) { toast({ title: "Could not save account", description: result.error.message, variant: "destructive" }); return; }
    toast({ title: editing ? "Account updated" : "Receiving account added" });
    setDialog(false);
    void load();
  };

  // Reconciliation. Zuri only knows what a human typed into it, so provider
  // charges are invisible until someone reads them off a statement. The gap
  // between the recorded balance and the statement balance is that charge.
  const openReconcile = async (account: Account) => {
    setReconciling(account);
    setStatementBalance("");
    setProviderCharges("");
    setChargesTouched(false);
    setReconcileLoading(true);
    try {
      const { data, error: ledgerError } = await supabase
        .from("payment_account_ledger" as any)
        .select("*")
        .eq("account_id", account.id);
      if (ledgerError) throw ledgerError;
      setReconcileLedger((data || []) as unknown as Ledger[]);
    } catch {
      setReconcileLedger([]);
    } finally {
      setReconcileLoading(false);
    }
  };

  const outgoingTotal = useMemo(
    () =>
      reconcileLedger.reduce(
        (sum, row) => sum + (Number(row.amount) < 0 ? Math.abs(Number(row.amount)) : 0),
        0,
      ),
    [reconcileLedger],
  );

  // available_balance is already net of recorded outflows, so it is the
  // "entered" figure on its own. The gap against the statement is the money
  // the provider took that nobody ever typed in.
  const enteredBalance = reconciling ? Number(balances[reconciling.id] || 0) : 0;
  const statement = Number(statementBalance);
  const hasStatement = statementBalance.trim() !== "" && Number.isFinite(statement);
  const gap = hasStatement ? enteredBalance - statement : 0;
  const charges = chargesTouched ? Math.abs(Number(providerCharges) || 0) : Math.max(0, gap);
  const actualNet = enteredBalance - charges;

  const saveCharges = async () => {
    if (!reconciling || !Number(charges)) return;
    setSaving(true);
    const { error } = await supabase.rpc("record_payment_account_adjustment" as any, {
      p_account_id: reconciling.id,
      p_amount: -Math.abs(Number(charges)),
      p_entry_type: "adjustment",
      p_reference: "Provider charges",
      p_notes: "Provider fees recorded from statement during reconciliation.",
    });
    setSaving(false);
    if (error) {
      toast({ title: "Could not record charges", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: "Provider charges recorded",
      description: "The account balance now matches your statement.",
    });
    setReconciling(null);
    void load();
  };

  const recordAdjustment = async () => {
    if (!adjusting || !Number(adjustment.amount)) return;
    setSaving(true);
    const signed = adjustment.entry_type === "refund" ? -Math.abs(Number(adjustment.amount)) : Number(adjustment.amount);
    const { error } = await supabase.rpc("record_payment_account_adjustment" as any, { p_account_id: adjusting.id, p_amount: signed, p_entry_type: adjustment.entry_type, p_reference: adjustment.reference || null, p_notes: adjustment.notes || null });
    setSaving(false);
    if (error) { toast({ title: "Could not record adjustment", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Account entry recorded" });
    setAdjusting(null);
    void load();
  };

  if (showLoader) {
    return <PageLoader text="Loading accounts..." />;
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="flex items-center gap-3 text-3xl font-bold">
            <Landmark className="h-8 w-8 text-primary" />
            Accounts
          </h2>
          <p className="mt-1 text-muted-foreground">Record where branch payments are received. No payment gateway is connected.</p>
        </div>
        <div className="flex gap-2">
          {executive && (
            <Select value={storeId} onValueChange={setStoreId}>
              <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Select branch" /></SelectTrigger>
              <SelectContent>{branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.store_name}</SelectItem>)}</SelectContent>
            </Select>
          )}
          {executive && (
            <Button onClick={openNew} disabled={!storeId}><Plus className="mr-2 h-4 w-4" />Add account</Button>
          )}
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
        <div className="text-sm text-amber-950">
          <p className="font-semibold">These balances only capture what was entered into Zuri.</p>
          <p className="mt-1 leading-6">
            No provider statement is read, so charges and fees deducted by your bank or
            mobile money operator are never captured. A recorded balance will therefore
            look higher than the real one. To get the exact figure, open{" "}
            <span className="font-semibold">Reconcile</span>, enter the actual amount from
            your provider statement, and Zuri will show the entered amount, the charges it
            could not see, the outgoing payments, and the true net figure.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-48 items-center justify-center"><LoadingMark size="sm" /></div>
      ) : !storeId ? (
        <Empty />
      ) : accounts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <WalletCards className="mx-auto mb-3 text-muted-foreground" />
            <p className="font-medium">No receiving accounts yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Add Cash, mobile money, bank, Pesapal, or another branch account.</p>
            {executive && (
              <Button className="mt-4" onClick={openNew}>Add first account</Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {accounts.map((account) => (
              <Card key={account.id} className={!account.is_active ? "opacity-60" : "metric-card metric-card-cash"}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base text-white">{account.name}</CardTitle>
                    <span className="rounded bg-white/15 px-2 py-1 text-[10px] font-bold uppercase text-white">{label(account.provider_type)}</span>
                  </div>
                  <CardDescription className="text-white/70">{account.account_number || "No account number"}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-black">{fmtCurrency(balances[account.id] || 0)}</p>
                  <p className="mt-1 text-xs text-white/70">Entered in Zuri only {account.is_active ? "" : "· Inactive"}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => void openReconcile(account)}>
                      <Scale className="mr-1 h-3.5 w-3.5" />Reconcile
                    </Button>
                    {executive && (
                      <Button size="sm" variant="secondary" onClick={() => openEdit(account)}><Pencil className="mr-1 h-3.5 w-3.5" />Edit</Button>
                    )}
                    <Button size="sm" variant="secondary" onClick={() => { setAdjusting(account); setAdjustment({ amount: "", entry_type: "adjustment", reference: "", notes: "" }); }}>Record entry</Button>
                    {account.external_link ? (
                      <Button size="sm" onClick={() => { try { window.open(account.external_link, '_blank'); } catch {} }}>Open</Button>
                    ) : executive ? (
                      <Button size="sm" onClick={async () => {
                        const link = window.prompt('External link (https://...)');
                        if (!link) return;
                        const { error } = await (supabase as any).from('branch_payment_accounts').update({ external_link: link }).eq('id', account.id);
                        if (error) return toast({ title: 'Could not save link', description: error.message, variant: 'destructive' });
                        toast({ title: 'Link saved' });
                        void load();
                      }}>Set link</Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Activity accounts={accounts} ledger={ledger} />
        </>
      )}

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit account" : "Add receiving account"}</DialogTitle>
            <DialogDescription>Record display details only. Never enter passwords, API keys, or PINs.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <Label>Account name</Label>
              <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. MTN MoMo Till" />
            </div>
            <div>
              <Label>Provider / type</Label>
              <Select value={form.provider_type} onValueChange={(value) => setForm({ ...form, provider_type: value })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map((type) => <SelectItem key={type} value={type}>{label(type)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Account, phone, till or paybill number</Label>
              <Input value={form.account_number} onChange={(event) => setForm({ ...form, account_number: event.target.value })} />
            </div>

            {editing ? (
              <p className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">Opening balance is locked after creation. Record a signed adjustment to correct it and preserve the audit trail.</p>
            ) : (
              <div>
                <Label>Opening balance</Label>
                <Input type="number" value={form.opening_balance} onChange={(event) => setForm({ ...form, opening_balance: event.target.value })} />
              </div>
            )}

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label htmlFor="account-active">Account active</Label>
                <p className="text-xs text-muted-foreground">Inactive accounts cannot receive new sales.</p>
              </div>
              <Switch id="account-active" checked={form.is_active} onCheckedChange={(checked) => setForm({ ...form, is_active: checked })} />
            </div>

            <div>
              <Label>Reference instructions (optional)</Label>
              <Textarea value={form.reference_instructions} onChange={(event) => setForm({ ...form, reference_instructions: event.target.value })} placeholder="What cashier should record with the sale" />
            </div>

            <div>
              <Label>External link (bank / payment portal)</Label>
              <Input value={form.external_link} onChange={(event) => setForm({ ...form, external_link: event.target.value })} placeholder="https://bank.example.com/payment" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)}>Cancel</Button>
            <Button disabled={saving || !form.name.trim()} onClick={save}>{editing ? "Update" : "Add account"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!adjusting} onOpenChange={(open) => !open && setAdjusting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record account entry</DialogTitle>
            <DialogDescription>{adjusting?.name}. Use a refund for money that leaves the account.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Entry type</Label>
              <Select value={adjustment.entry_type} onValueChange={(value) => setAdjustment({ ...adjustment, entry_type: value })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="adjustment">Adjustment (signed amount)</SelectItem>
                  <SelectItem value="refund">Refund / outgoing</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Amount</Label>
              <Input type="number" min="0" value={adjustment.amount} onChange={(event) => setAdjustment({ ...adjustment, amount: event.target.value })} />
            </div>
            <div>
              <Label>Reference</Label>
              <Input value={adjustment.reference} onChange={(event) => setAdjustment({ ...adjustment, reference: event.target.value })} />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={adjustment.notes} onChange={(event) => setAdjustment({ ...adjustment, notes: event.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjusting(null)}>Cancel</Button>
            <Button disabled={saving || !Number(adjustment.amount)} onClick={recordAdjustment}>Record entry</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!reconciling}
        onOpenChange={(open) => {
          if (!open) {
            setReconciling(null);
            setReconcileLedger([]);
            setStatementBalance("");
            setProviderCharges("");
            setChargesTouched(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Reconcile {reconciling?.name}</DialogTitle>
            <DialogDescription>
              Zuri recorded what you entered. It never sees your provider statement, so
              enter the actual balance and the difference will be shown as provider charges.
            </DialogDescription>
          </DialogHeader>

          {reconcileLoading ? (
            <div className="flex min-h-32 items-center justify-center">
              <LoadingMark size="sm" />
            </div>
          ) : (
            <>
              <div className="grid gap-3 py-2">
                <div>
                  <Label htmlFor="statement-balance">Actual balance on your statement</Label>
                  <Input
                    id="statement-balance"
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    value={statementBalance}
                    onChange={(event) => setStatementBalance(event.target.value)}
                    placeholder="e.g. 425000"
                  />
                </div>
                <div>
                  <Label htmlFor="provider-charges">Provider charges (not captured by Zuri)</Label>
                  <Input
                    id="provider-charges"
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    value={providerCharges}
                    onChange={(event) => {
                      setProviderCharges(event.target.value);
                      setChargesTouched(true);
                    }}
                    placeholder={hasStatement ? String(charges.toFixed(2)) : "Enter the fee taken by your provider"}
                  />
                  {!chargesTouched && hasStatement && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Filled in automatically from the gap between the recorded and statement balances.
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-lg border">
                <div className="grid grid-cols-[1fr_auto] gap-3 border-b bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <span>Figure</span>
                  <span className="text-right">Amount</span>
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-3 border-b px-3 py-2.5 text-sm">
                  <span>Entered in Zuri</span>
                  <span className="text-right font-semibold tabular-nums">{fmtCurrency(enteredBalance)}</span>
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-3 border-b px-3 py-2.5 text-sm">
                  <span className="text-muted-foreground">Less provider charges</span>
                  <span className="text-right tabular-nums text-amber-700">
                    {charges ? `-${fmtCurrency(charges)}` : fmtCurrency(0)}
                  </span>
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-3 border-b px-3 py-2.5 text-sm">
                  <span className="text-muted-foreground">Outgoing recorded ({reconcileLedger.length} entries)</span>
                  <span className="text-right tabular-nums text-muted-foreground">
                    {outgoingTotal ? `-${fmtCurrency(outgoingTotal)}` : fmtCurrency(0)}
                  </span>
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-3 bg-muted/40 px-3 py-2.5 text-sm font-semibold">
                  <span>Actual net figure</span>
                  <span className="text-right tabular-nums">{fmtCurrency(actualNet)}</span>
                </div>
              </div>

              <p className="text-xs leading-5 text-muted-foreground">
                The outgoing figure is already deducted from the entered amount, so it is shown
                for reference only. The actual net figure is the entered amount minus the
                provider charges.
              </p>

              {hasStatement && (
                <div
                  className={`flex items-start gap-2 rounded-md border p-3 text-sm ${
                    charges > 0
                      ? "border-amber-200 bg-amber-50 text-amber-950"
                      : "border-emerald-200 bg-emerald-50 text-emerald-900"
                  }`}
                >
                  {charges > 0 ? (
                    <>
                      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                      <p>
                        Zuri was over by {fmtCurrency(charges)}. Recording that as provider charges
                        brings the account to the {fmtCurrency(statement)} on your statement.
                      </p>
                    </>
                  ) : (
                    <>
                      <Scale className="mt-0.5 h-4 w-4 shrink-0" />
                      <p>
                        This account matches the {fmtCurrency(statement)} on your statement. No
                        provider charges were missed.
                      </p>
                    </>
                  )}
                </div>
              )}
            </>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setReconciling(null)}>Close</Button>
            <Button
              disabled={saving || !Number(charges)}
              onClick={saveCharges}
            >
              Record {charges ? fmtCurrency(charges) : "charges"} to account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Activity({ accounts, ledger }: { accounts: Account[]; ledger: Ledger[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent account activity</CardTitle>
        <CardDescription>Incoming sales and explicit adjustments for this branch.</CardDescription>
      </CardHeader>
      <CardContent>
        {ledger.length ? (
          <div className="space-y-3">
            {ledger.map((row) => (
              <div className="flex items-center justify-between border-b pb-3 last:border-0" key={row.id}>
                <div>
                  <p className="text-sm font-medium">{accounts.find((account) => account.id === row.account_id)?.name || "Account"} · {label(row.entry_type)}</p>
                  <p className="text-xs text-muted-foreground">{row.reference || row.notes || new Date(row.created_at).toLocaleString()}</p>
                </div>
                <p className={Number(row.amount) < 0 ? "font-semibold text-destructive" : "font-semibold text-emerald-600"}>{Number(row.amount) < 0 ? "−" : "+"}{fmtCurrency(Math.abs(Number(row.amount)))}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-5 text-sm text-muted-foreground">No account activity has been recorded for this branch.</p>
        )}
      </CardContent>
    </Card>
  );
}

function Empty() {
  return (
    <Card>
      <CardContent className="py-12 text-center">
        <Landmark className="mx-auto mb-3 text-muted-foreground" />
        <p className="font-medium">Select a branch to manage its accounts.</p>
      </CardContent>
    </Card>
  );
}
