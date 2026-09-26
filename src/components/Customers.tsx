import { useState, useEffect, useMemo } from "react";
import { PageLoader, useMinimumLoading } from "@/components/ui/loading-spinner";
import StatCard from "@/components/StatCard";
import { fmtCurrency, getCurrencySymbol } from "@/lib/currency";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Search, Users, UserPlus, Phone, Mail, History,
  Edit2, Trash2, TrendingUp, CreditCard, Star, X, Download
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Customer } from "@/types";
import ExcelImport from "@/components/ExcelImport";
import * as XLSX from "xlsx";

interface CustomerTransaction {
  id: string; type: "sale_credit" | "payment" | "refund" | "adjustment";
  amount: number; reference_id?: string; description?: string; created_at: string;
}

const emptyForm = { full_name: "", email: "", phone: "", address: "", notes: "" };

interface CustomersProps { currentStoreId?: string | null; }
const Customers = ({ currentStoreId }: CustomersProps) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [cardFilter, setCardFilter] = useState<"all" | "with_debt">("all");
  const [loading, setLoading] = useState(true);
  const showLoader = useMinimumLoading(loading, 350);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [viewingCustomer, setViewingCustomer] = useState<Customer | null>(null);
  const [transactions, setTransactions] = useState<CustomerTransaction[]>([]);
  const [loadingTx, setLoadingTx] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const { toast } = useToast();

  useEffect(() => { fetchCustomers(); }, [currentStoreId]);

  const getStoreId = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    // Prefer the currentStoreId prop (already scoped to the active branch).
    // Fall back: check owned stores first, then store_access for staff.
    const targetStoreId =
      currentStoreId ||
      (await supabase.from("stores").select("id").eq("user_id", user.id).limit(1)).data?.[0]?.id ||
      (await supabase.from("store_access").select("store_id").eq("user_id", user.id).limit(1)).data?.[0]?.store_id;
    return { storeId: targetStoreId, userId: user.id };
  };

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const { storeId } = await getStoreId();
      if (!storeId) return;
      const { data, error } = await supabase.from("customers").select("*").eq("store_id", storeId).order("full_name");
      if (error) throw error;
      setCustomers(data || []);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const handleAdd = async () => {
    if (!form.full_name.trim()) { toast({ title: "Name required", variant: "destructive" }); return; }
    try {
      const { storeId, userId } = await getStoreId();
      if (!storeId) return;
      const { error } = await supabase.from("customers").insert({ ...form, store_id: storeId, user_id: userId });
      if (error) throw error;
      toast({ title: "✓ Customer added" });
      setAddOpen(false); setForm(emptyForm); fetchCustomers();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const handleUpdate = async () => {
    if (!editingCustomer) return;
    try {
      const { error } = await supabase.from("customers").update({
        full_name: editingCustomer.full_name, email: editingCustomer.email,
        phone: editingCustomer.phone, address: editingCustomer.address,
        notes: editingCustomer.notes, credit_limit: editingCustomer.credit_limit,
      }).eq("id", editingCustomer.id);
      if (error) throw error;
      toast({ title: "✓ Customer updated" });
      setEditOpen(false); fetchCustomers();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Remove ${name}?`)) return;
    try {
      const { error } = await supabase.from("customers").delete().eq("id", id);
      if (error) throw error;
      toast({ title: "Customer removed" }); fetchCustomers();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const openHistory = async (customer: Customer) => {
    setViewingCustomer(customer); setHistoryOpen(true); setLoadingTx(true);
    try {
      const { data } = await supabase.from("customer_transactions").select("*")
        .eq("customer_id", customer.id).order("created_at", { ascending: false });
      setTransactions((data || []).map((tx: any) => ({
        id: tx.id, type: tx.type || "adjustment", amount: Number(tx.amount),
        reference_id: tx.reference_id, description: tx.description, created_at: tx.created_at,
      })));
    } catch { setTransactions([]); } finally { setLoadingTx(false); }
  };

  const exportCustomers = () => {
    const rows = filtered.map(c => ({
      Name: c.full_name, Phone: c.phone || "", Email: c.email || "",
      Address: c.address || "", "Total Spent": c.total_spent || 0,
      "Unpaid Balance": c.unpaid_balance || 0, "Credit Limit": c.credit_limit || 0,
      "Loyalty Points": c.loyalty_points || 0,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Customers");
    XLSX.writeFile(wb, "customers.xlsx");
  };

    const filtered = useMemo(() => {
      const q = searchTerm.trim().toLowerCase();
      const searched = q
        ? customers.filter(c =>
            c.full_name.toLowerCase().includes(q) ||
            (c.phone || "").includes(q) ||
            (c.email || "").toLowerCase().includes(q)
          )
        : customers;
      if (cardFilter === "with_debt") return searched.filter(c => (c.unpaid_balance || 0) > 0);
      return searched;
    }, [customers, searchTerm, cardFilter]);

  const stats = useMemo(() => ({
    total: customers.length,
    withDebt: customers.filter(c => (c.unpaid_balance || 0) > 0).length,
    totalSpent: customers.reduce((s, c) => s + (c.total_spent || 0), 0),
    totalDebt: customers.reduce((s, c) => s + (c.unpaid_balance || 0), 0),
  }), [customers]);

  const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  if (showLoader) {
    return <PageLoader text="Loading customers..." />;
  }
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-bold flex items-center gap-3">
            <Users className="h-8 w-8 text-primary" />
            Customers
          </h2>
          <p className="text-muted-foreground mt-1">{customers.length} registered customer{customers.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={exportCustomers}><Download className="h-4 w-4 mr-1" />Export</Button>
          <ExcelImport config={{
            title: "Import Customers",
            fields: [
              { key: "full_name", label: "Full Name", required: true, type: "string" },
              { key: "phone", label: "Phone", type: "string" },
              { key: "email", label: "Email", type: "string" },
              { key: "address", label: "Address", type: "string" },
              { key: "notes", label: "Notes", type: "string" },
            ],
            templateData: [{ "Full Name": "John Doe", "Phone": "+256700000000", "Email": "john@example.com", "Address": "Kampala", "Notes": "" }],
            onImport: async (rows) => {
              const { storeId, userId } = await getStoreId();
              if (!storeId) throw new Error("No store found");
              let success = 0; const errors: string[] = [];
              for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                if (!row.full_name) { errors.push(`Row ${i + 1}: Missing name`); continue; }
                const { error } = await supabase.from("customers").insert({
                  store_id: storeId, user_id: userId,
                  full_name: String(row.full_name).trim(),
                  phone: row.phone ? String(row.phone) : null,
                  email: row.email ? String(row.email) : null,
                  address: row.address ? String(row.address) : null,
                  notes: row.notes ? String(row.notes) : null,
                });
                if (error) errors.push(`Row ${i + 1}: ${error.message}`); else success++;
              }
              fetchCustomers();
              return { success, errors };
            },
          }} />
          <Button onClick={() => { setForm(emptyForm); setAddOpen(true); }} className="gap-2">
            <UserPlus className="h-4 w-4" />Add Customer
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { key: "all" as const, label: "Total Customers", value: stats.total, sub: cardFilter === "with_debt" ? `showing ${filtered.length}` : "all customers", icon: Users, color: "text-blue-600", bg: "bg-blue-50" },
          { key: "with_debt" as const, label: "With Debt", value: stats.withDebt, sub: "unpaid balance", icon: CreditCard, color: "text-red-600", bg: "bg-red-50" },
          { key: undefined, label: "Total Revenue", value: `${fmtCurrency(stats.totalSpent)}`, icon: TrendingUp, color: "text-green-600", bg: "bg-green-50" },
          { key: undefined, label: "Total Debt", value: `${fmtCurrency(stats.totalDebt)}`, icon: CreditCard, color: "text-amber-600", bg: "bg-amber-50" },
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
            title={key ? `Show ${label.toLowerCase()}` : undefined}
            onClick={key ? () => setCardFilter((c) => (c === key ? "all" : key)) : undefined}
          />
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
          placeholder="Search by name, phone, or email..." className="pl-9 pr-9 h-10" autoComplete="off" />
        {searchTerm && (
          <button onClick={() => setSearchTerm("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-16 text-muted-foreground">Loading customers...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Users className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <p className="font-medium">{searchTerm ? "No customers match your search" : "No customers yet"}</p>
          {!searchTerm && (
            <Button className="mt-4" onClick={() => setAddOpen(true)}>
              <UserPlus className="h-4 w-4 mr-2" />Add First Customer
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(customer => (
              <div key={customer.id} className="flex items-center justify-between p-4 border rounded-xl hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-primary font-bold text-lg">
                    {customer.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-[150px]">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold">{customer.full_name}</h4>
                      {(customer.loyalty_points || 0) > 0 && (
                        <Badge variant="secondary" className="text-[10px] uppercase">★ {customer.loyalty_points}</Badge>
                      )}
                      {(customer.unpaid_balance || 0) > 0 && (
                        <Badge variant="destructive" className="text-[10px]">Debt</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {[customer.phone, customer.email].filter(Boolean).join(" · ")}
                    </p>
                    <div className="flex gap-4 mt-1">
                      <div className="text-[10px] text-muted-foreground">
                        Spent: <span className="font-bold text-emerald-600">{fmtCurrency(customer.total_spent || 0)}</span>
                      </div>
                      {(customer.unpaid_balance || 0) > 0 && (
                        <div className="text-[10px] text-muted-foreground">
                          Owes: <span className="font-bold text-red-600">{fmtCurrency(customer.unpaid_balance || 0)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => openHistory(customer)}><History className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => { setEditingCustomer(customer); setEditOpen(true); }}><Edit2 className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => handleDelete(customer.id, customer.full_name)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5" />Add Customer</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div><Label className="text-xs">Full Name *</Label><Input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} className="mt-1" placeholder="Customer name" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Phone</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="mt-1" placeholder="+256..." /></div>
              <div><Label className="text-xs">Email</Label><Input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="mt-1" placeholder="email@..." /></div>
            </div>
            <div><Label className="text-xs">Address</Label><Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className="mt-1" placeholder="Physical address" /></div>
            <div><Label className="text-xs">Notes</Label><Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="mt-1" placeholder="Optional notes" /></div>
            <Button onClick={handleAdd} className="w-full">Save Customer</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Edit2 className="h-5 w-5" />Edit Customer</DialogTitle></DialogHeader>
          {editingCustomer && (
            <div className="space-y-3 pt-2">
              <div><Label className="text-xs">Full Name</Label><Input value={editingCustomer.full_name} onChange={e => setEditingCustomer({ ...editingCustomer, full_name: e.target.value })} className="mt-1" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Phone</Label><Input value={editingCustomer.phone || ""} onChange={e => setEditingCustomer({ ...editingCustomer, phone: e.target.value })} className="mt-1" /></div>
                <div><Label className="text-xs">Email</Label><Input value={editingCustomer.email || ""} onChange={e => setEditingCustomer({ ...editingCustomer, email: e.target.value })} className="mt-1" /></div>
              </div>
              <div><Label className="text-xs">Address</Label><Input value={editingCustomer.address || ""} onChange={e => setEditingCustomer({ ...editingCustomer, address: e.target.value })} className="mt-1" /></div>
              <div><Label className="text-xs">Credit Limit ({getCurrencySymbol()})</Label><Input type="number" value={editingCustomer.credit_limit || 0} onChange={e => setEditingCustomer({ ...editingCustomer, credit_limit: Number(e.target.value) })} className="mt-1" /></div>
              <Button onClick={handleUpdate} className="w-full">Update Customer</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />{viewingCustomer?.full_name} — History
            </DialogTitle>
          </DialogHeader>
          {viewingCustomer && (
            <div className="space-y-4 flex-1 min-h-0">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-green-50 border border-green-200 p-3">
                  <p className="text-xs text-muted-foreground">Total Spent</p>
                  <p className="font-bold text-green-700">{fmtCurrency((viewingCustomer.total_spent || 0))}</p>
                </div>
                <div className="rounded-xl bg-red-50 border border-red-200 p-3">
                  <p className="text-xs text-muted-foreground">Unpaid Balance</p>
                  <p className="font-bold text-red-600">{fmtCurrency((viewingCustomer.unpaid_balance || 0))}</p>
                </div>
                <div className="rounded-xl bg-blue-50 border border-blue-200 p-3">
                  <p className="text-xs text-muted-foreground">Credit Limit</p>
                  <p className="font-bold text-blue-700">{fmtCurrency((viewingCustomer.credit_limit || 0))}</p>
                </div>
              </div>
              <ScrollArea className="h-[380px]" type="auto">
                {loadingTx ? (
                  <div className="text-center py-10 text-muted-foreground">Loading...</div>
                ) : transactions.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <History className="h-8 w-8 mx-auto mb-2 opacity-20" /><p>No transactions yet</p>
                  </div>
                ) : (
                  <div className="space-y-2 pr-2">
                    {transactions.map(tx => (
                      <div key={tx.id} className="flex items-center justify-between p-3 rounded-xl border bg-card hover:bg-muted/30 transition-colors">
                        <div>
                          <div className="flex items-center gap-2 mb-0.5">
                            <Badge variant={tx.type === "sale_credit" ? "destructive" : "outline"}
                              className={`text-[10px] capitalize ${tx.type === "payment" ? "bg-green-50 text-green-700 border-green-300" : ""}`}>
                              {tx.type.replace("_", " ")}
                            </Badge>
                            <span className="text-xs text-muted-foreground">{fmtDate(tx.created_at)}</span>
                          </div>
                          <p className="text-sm">{tx.description || "No description"}</p>
                          {tx.reference_id && <p className="text-[10px] text-muted-foreground">Ref: {tx.reference_id}</p>}
                        </div>
                        <p className={`font-bold text-sm ${tx.type === "payment" || tx.type === "refund" ? "text-green-600" : "text-red-600"}`}>
                          {tx.type === "payment" || tx.type === "refund" ? "-" : "+"} {fmtCurrency(tx.amount)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Customers;
