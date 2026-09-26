import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Search, Pencil, Trash2, Truck, Phone, Mail, MapPin, Building2, DollarSign, Package } from "lucide-react";
import { logAudit } from "@/lib/audit";
import ExcelImport from "@/components/ExcelImport";
// import { LoadingSpinner } from "@/components/ui/loading-spinner";

interface Supplier {
  id: string;
  store_id: string;
  user_id?: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  company: string | null;
  notes: string | null;
  total_supplied: number;
  outstanding_balance: number;
  created_at: string;
  updated_at: string;
}

interface RecentProduct {
  id: string;
  product_name: string;
  quantity: number;
  cost_per_unit: number;
  total_value: number;
  date_of_purchase: string;
}

const Suppliers = () => {
  const { toast } = useToast();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [payingSupplier, setPayingSupplier] = useState<Supplier | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [viewSupplier, setViewSupplier] = useState<Supplier | null>(null);
  const [recentProducts, setRecentProducts] = useState<RecentProduct[]>([]);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    company: "",
    notes: "",
  });

  useEffect(() => {
    fetchSuppliers();

    // Prefill supplier name if navigated from Stock Entry (hash routing)
    try {
      const hash = window.location.hash || '';
      const qIndex = hash.indexOf('?');
      if (qIndex !== -1) {
        const query = hash.slice(qIndex + 1);
        const params = new URLSearchParams(query);
        const prefill = params.get('prefillSupplierName');
        if (prefill && prefill.trim()) {
          setFormData((prev) => ({ ...prev, name: prefill.trim() }));
          setIsDialogOpen(true);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const resolveStoreId = async (userId: string): Promise<string | null> => {
    const current = localStorage.getItem("brec_current_store");
    if (current) return current;

    const { data: stores } = await supabase.from("stores").select("id").eq("user_id", userId).limit(1);
    const { data: accessData } = await supabase.from("store_access").select("store_id").eq("user_id", userId).limit(1);
    return stores?.[0]?.id || accessData?.[0]?.store_id || null;
  };

  const fetchSuppliers = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const storeId = await resolveStoreId(user.id);
      if (!storeId) return;

      let res = await supabase
        .from("suppliers")
        .select("id, store_id, name, phone, email, address, company, notes, total_supplied, outstanding_balance, created_at, updated_at")
        .eq("store_id", storeId)
        .order("name", { ascending: true });

      if (res.error) {
        console.error("Error fetching suppliers:", res.error);
        return;
      }

      const rows = (res.data || []).map((s: any) => ({
        ...s,
        total_supplied: Number(s.total_supplied || 0) || 0,
        outstanding_balance: Number(s.outstanding_balance || 0) || 0,
      }));
      setSuppliers(rows as any);
    } catch (error) {
      console.error("Error fetching suppliers:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchRecentProducts = async (supplier: Supplier) => {
    try {
      // Try supplier_id first, fallback to supplier_name match
      let res = await (supabase.from("inventory") as any)
        .select("id, product_name, quantity, cost_per_unit, total_value, date_of_purchase")
        .eq("store_id", supplier.store_id)
        .eq("supplier_id", supplier.id)
        .order("date_of_purchase", { ascending: false })
        .limit(50);

      // If no results with supplier_id, try supplier_name
      if (!res.error && (!res.data || res.data.length === 0)) {
        res = await (supabase.from("inventory") as any)
          .select("id, product_name, quantity, cost_per_unit, total_value, date_of_purchase")
          .eq("store_id", supplier.store_id)
          .eq("supplier_name", supplier.name)
          .order("date_of_purchase", { ascending: false })
          .limit(50);
      }

      if (res.error) {
        console.error("Error fetching products:", res.error);
        setRecentProducts([]);
        return;
      }

      setRecentProducts(res.data || []);
    } catch (error) {
      console.error("Error fetching products:", error);
    }
  };

  const handleViewSupplier = (supplier: Supplier) => {
    setViewSupplier(supplier);
    fetchRecentProducts(supplier);
  };

  const handlePaySupplier = async () => {
    if (!payingSupplier || !payAmount || parseFloat(payAmount) <= 0) {
      toast({ title: "Error", description: "Enter a valid payment amount", variant: "destructive" });
      return;
    }

    const amount = parseFloat(payAmount);
    const currentOutstanding = Number((payingSupplier as any).outstanding_balance || 0) || 0;
    if (amount > currentOutstanding) {
      toast({ title: "Error", description: "Payment exceeds outstanding balance", variant: "destructive" });
      return;
    }

    try {
      const newBalance = Math.max(0, currentOutstanding - amount);
      const { error } = await supabase
        .from("suppliers")
        .update({
          outstanding_balance: newBalance,
          updated_at: new Date().toISOString(),
        })
        .eq("id", payingSupplier.id);

      if (error) {
        const msg = String(error.message || "").toLowerCase();
        const looksLikeMissingSchema =
          msg.includes("does not exist") || msg.includes("schema cache") || msg.includes("column") || msg.includes("outstanding_balance");
        if (!looksLikeMissingSchema) throw error;

        // Fallback: apply payment to unpaid stock_loans for this supplier (name match).
        const supplierName = payingSupplier.name;
        const storeId = payingSupplier.store_id;

        const { data: loans, error: loansError } = await supabase
          .from("stock_loans")
          .select("id, balance, amount_paid, total_amount, status")
          .eq("store_id", storeId)
          .eq("status", "unpaid")
          .eq("supplier", supplierName)
          .order("created_at", { ascending: true });
        if (loansError) throw loansError;

        let remaining = amount;
        for (const loan of (loans as any[]) || []) {
          if (remaining <= 0) break;
          const bal = Number(loan.balance || 0) || 0;
          if (bal <= 0) continue;
          const pay = Math.min(bal, remaining);
          remaining -= pay;

          const nextBal = Math.max(0, bal - pay);
          const nextPaid = (Number(loan.amount_paid || 0) || 0) + pay;
          const nextStatus = nextBal <= 0 ? "paid" : "unpaid";

          const { error: upErr } = await supabase
            .from("stock_loans")
            .update({ balance: nextBal, amount_paid: nextPaid, status: nextStatus } as any)
            .eq("id", loan.id);
          if (upErr) throw upErr;

          const { error: payErr } = await supabase
            .from("loan_payments")
            .insert({ loan_id: loan.id, amount_paid: pay } as any);
          if (payErr) throw payErr;
        }
      }

      await logAudit({
        action: "update",
        tableName: "suppliers",
        recordId: payingSupplier.id,
        oldData: { outstanding_balance: currentOutstanding },
        newData: { outstanding_balance: newBalance, payment: amount },
        storeId: payingSupplier.store_id,
      });

      toast({ title: "Payment Recorded", description: `UGX ${amount.toLocaleString()} paid to ${payingSupplier.name}` });
      setPayDialogOpen(false);
      setPayAmount("");
      setPayingSupplier(null);
      fetchSuppliers();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast({ title: "Error", description: "Supplier name is required", variant: "destructive" });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const storeId = await resolveStoreId(user.id);
      if (!storeId) throw new Error("No store found");

      if (editingSupplier) {
        let res = await supabase
          .from("suppliers")
          .update({
            name: formData.name.trim(),
            phone: formData.phone || null,
            email: formData.email || null,
            address: formData.address || null,
            company: formData.company || null,
            notes: formData.notes || null,
            updated_at: new Date().toISOString(),
          } as any)
          .eq("id", editingSupplier.id);

        if (res.error) {
          const msg = String(res.error.message || "").toLowerCase();
          const looksLikeMissingCols =
            (msg.includes("company") || msg.includes("notes") || msg.includes("updated_at") || msg.includes("email") || msg.includes("phone") || msg.includes("address")) &&
            (msg.includes("column") || msg.includes("schema cache") || msg.includes("does not exist"));
          if (looksLikeMissingCols) {
            res = await supabase
              .from("suppliers")
              .update({ name: formData.name.trim() } as any)
              .eq("id", editingSupplier.id);
          }
        }

        if (res.error) throw res.error;

        await logAudit({
          action: "update",
          tableName: "suppliers",
          recordId: editingSupplier.id,
          oldData: { name: editingSupplier.name },
          newData: { name: formData.name.trim() },
          storeId,
        });

        toast({ title: "Supplier Updated", description: `${formData.name} has been updated` });
      } else {
        let res = await supabase
          .from("suppliers")
          .insert({
            store_id: storeId,
            user_id: user.id,
            name: formData.name.trim(),
            phone: formData.phone || null,
            email: formData.email || null,
            address: formData.address || null,
            company: formData.company || null,
            notes: formData.notes || null,
          } as any)
          .select()
          .single();

        if (res.error) {
          const msg = String(res.error.message || "").toLowerCase();
          const looksLikeMissingUserId =
            msg.includes("user_id") && (msg.includes("column") || msg.includes("schema cache") || msg.includes("does not exist"));
          if (looksLikeMissingUserId) {
            res = await supabase
              .from("suppliers")
              .insert({
                store_id: storeId,
                name: formData.name.trim(),
                phone: formData.phone || null,
                email: formData.email || null,
                address: formData.address || null,
                company: formData.company || null,
                notes: formData.notes || null,
              } as any)
              .select()
              .single();
          }
        }

        if (res.error) throw res.error;

        await logAudit({
          action: "create",
          tableName: "suppliers",
          recordId: (res.data as any).id,
          newData: { name: formData.name.trim(), company: formData.company },
          storeId,
        });

        toast({ title: "Supplier Added", description: `${formData.name} has been added` });
      }

      resetForm();
      setIsDialogOpen(false);
      fetchSuppliers();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleDelete = async (supplier: Supplier) => {
    if (!confirm(`Delete supplier "${supplier.name}"?`)) return;

    try {
      const { error } = await supabase.from("suppliers").delete().eq("id", supplier.id);
      if (error) throw error;

      await logAudit({
        action: "delete" as any,
        tableName: "suppliers",
        recordId: supplier.id,
        oldData: { name: supplier.name },
        storeId: supplier.store_id,
      });

      toast({ title: "Deleted", description: `${supplier.name} has been removed` });
      fetchSuppliers();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name,
      phone: supplier.phone || "",
      email: supplier.email || "",
      address: supplier.address || "",
      company: supplier.company || "",
      notes: supplier.notes || "",
    });
    setIsDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({ name: "", phone: "", email: "", address: "", company: "", notes: "" });
    setEditingSupplier(null);
  };

  const filtered = suppliers.filter(s =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.company || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.phone || "").includes(searchTerm)
  );

  const totalOwed = suppliers.reduce((sum, s) => sum + (Number((s as any).outstanding_balance || 0) || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-foreground">Suppliers</h2>
          <p className="text-sm text-muted-foreground">
            {suppliers.length} supplier{suppliers.length !== 1 ? "s" : ""}
            {totalOwed > 0 && <span className="text-destructive ml-2">• UGX {totalOwed.toLocaleString()} owed</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <ExcelImport config={{
            title: "Import Suppliers from Excel",
            description: "Upload an Excel file with supplier data",
            fields: [
              { key: "name", label: "Name", required: true, type: "string" },
              { key: "company", label: "Company", type: "string" },
              { key: "phone", label: "Phone", type: "string" },
              { key: "email", label: "Email", type: "string" },
              { key: "address", label: "Address", type: "string" },
              { key: "notes", label: "Notes", type: "string" },
            ],
            templateData: [
              { "Name": "Jane Supplier", "Company": "ABC Ltd", "Phone": "+256700000000", "Email": "jane@abc.com", "Address": "Kampala", "Notes": "" },
            ],
            onImport: async (rows) => {
              const { data: { user } } = await supabase.auth.getUser();
              if (!user) throw new Error("Not authenticated");
              const storeId = await resolveStoreId(user.id);
              if (!storeId) throw new Error("No store found");

              let success = 0;
              const errors: string[] = [];
              for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                if (!row.name) { errors.push(`Row ${i + 1}: Missing name`); continue; }
                let res = await supabase.from("suppliers").insert({
                  store_id: storeId,
                  user_id: user.id,
                  name: String(row.name).trim(),
                  company: row.company ? String(row.company) : null,
                  phone: row.phone ? String(row.phone) : null,
                  email: row.email ? String(row.email) : null,
                  address: row.address ? String(row.address) : null,
                  notes: row.notes ? String(row.notes) : null,
                } as any);

                if (res.error) {
                  const msg = String(res.error.message || "").toLowerCase();
                  const looksLikeMissingUserId =
                    msg.includes("user_id") && (msg.includes("column") || msg.includes("schema cache") || msg.includes("does not exist"));
                  if (looksLikeMissingUserId) {
                    res = await supabase.from("suppliers").insert({
                      store_id: storeId,
                      name: String(row.name).trim(),
                      company: row.company ? String(row.company) : null,
                      phone: row.phone ? String(row.phone) : null,
                      email: row.email ? String(row.email) : null,
                      address: row.address ? String(row.address) : null,
                      notes: row.notes ? String(row.notes) : null,
                    } as any);
                  }
                }

                if (res.error) { errors.push(`Row ${i + 1}: ${res.error.message}`); } else { success++; }
              }
              fetchSuppliers();
              return { success, errors };
            },
          }} />
          <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus size={16} />
                Add Supplier
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
            <DialogHeader className="pb-4">
              <DialogTitle>{editingSupplier ? "Edit Supplier" : "Add New Supplier"}</DialogTitle>
            </DialogHeader>
            <ScrollArea className="flex-1 pr-4">
              <div className="pb-4 space-y-4">
              <div className="space-y-2">
                <Label>Supplier Name *</Label>
                <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. John's Wholesale" />
              </div>
              <div className="space-y-2">
                <Label>Company</Label>
                <Input value={formData.company} onChange={(e) => setFormData({ ...formData, company: e.target.value })} placeholder="Company name" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="+256..." />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="email@example.com" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Address</Label>
                <Input value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} placeholder="Location / address" />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Additional notes..." rows={3} />
              </div>
              <Button onClick={handleSubmit} className="w-full">
                {editingSupplier ? "Update Supplier" : "Add Supplier"}
              </Button>
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search suppliers..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
      </div>

      {/* Suppliers List */}
      <Card>
        <CardContent className="p-0">
          {loading && suppliers.length === 0 ? (
            <LoadingSpinner size="lg" text="Loading suppliers..." />
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Truck className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>{searchTerm ? "No suppliers match your search" : "No suppliers added yet"}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden md:table-cell">Company</TableHead>
                  <TableHead className="hidden md:table-cell">Contact</TableHead>
                  <TableHead className="text-right">Supplied</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="w-32">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((supplier) => (
                  <TableRow key={supplier.id} className="cursor-pointer" onClick={() => handleViewSupplier(supplier)}>
                    <TableCell className="font-medium">{supplier.name}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      {supplier.company && (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Building2 size={14} />
                          {supplier.company}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="space-y-1">
                        {supplier.phone && <div className="flex items-center gap-1 text-sm"><Phone size={12} />{supplier.phone}</div>}
                        {supplier.email && <div className="flex items-center gap-1 text-sm"><Mail size={12} />{supplier.email}</div>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">UGX {supplier.total_supplied.toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      {supplier.outstanding_balance > 0 ? (
                        <Badge variant="destructive">UGX {supplier.outstanding_balance.toLocaleString()}</Badge>
                      ) : (
                        <Badge variant="outline" className="text-emerald-600">Clear</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                        {supplier.outstanding_balance > 0 && (
                          <Button variant="default" size="sm" className="gap-1 text-xs" onClick={() => { setPayingSupplier(supplier); setPayDialogOpen(true); }}>
                            <DollarSign size={12} />
                            Pay
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(supplier)}>
                          <Pencil size={14} />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(supplier)} className="text-destructive">
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pay Supplier Dialog */}
      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Pay {payingSupplier?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-muted rounded-lg text-sm">
              <p>Outstanding: <strong className="text-destructive">UGX {(payingSupplier?.outstanding_balance || 0).toLocaleString()}</strong></p>
            </div>
            <div className="space-y-2">
              <Label>Payment Amount (UGX)</Label>
              <Input type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="Enter amount..." min="0" max={payingSupplier?.outstanding_balance || 0} />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setPayAmount(String(payingSupplier?.outstanding_balance || 0))} className="flex-1 text-xs">
                Pay Full
              </Button>
              <Button onClick={handlePaySupplier} className="flex-1 gap-1">
                <DollarSign size={14} />
                Confirm Payment
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Supplier Dialog */}
      <Dialog open={!!viewSupplier} onOpenChange={(open) => !open && setViewSupplier(null)}>
        <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
          <DialogHeader className="pb-4">
            <DialogTitle className="flex items-center gap-2">
              <Truck size={18} />
              {viewSupplier?.name}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1 pr-4">
            <div className="pb-4">
          {viewSupplier && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                {viewSupplier.company && <div><p className="text-xs text-muted-foreground">Company</p><p className="font-medium">{viewSupplier.company}</p></div>}
                {viewSupplier.phone && <div><p className="text-xs text-muted-foreground">Phone</p><p className="font-medium">{viewSupplier.phone}</p></div>}
                {viewSupplier.email && <div><p className="text-xs text-muted-foreground">Email</p><p className="font-medium">{viewSupplier.email}</p></div>}
                {viewSupplier.address && <div><p className="text-xs text-muted-foreground">Address</p><p className="font-medium">{viewSupplier.address}</p></div>}
                <div><p className="text-xs text-muted-foreground">Total Supplied</p><p className="font-bold">UGX {viewSupplier.total_supplied.toLocaleString()}</p></div>
                <div><p className="text-xs text-muted-foreground">Outstanding</p><p className={`font-bold ${viewSupplier.outstanding_balance > 0 ? 'text-destructive' : 'text-emerald-600'}`}>UGX {viewSupplier.outstanding_balance.toLocaleString()}</p></div>
              </div>
              {/* Payment Details */}
              {(viewSupplier as any)?.payment_details && (
                <div className="border-t pt-3">
                  <h4 className="font-semibold text-sm flex items-center gap-2 mb-2">
                    <DollarSign size={14} />
                    Payment Details
                  </h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {(viewSupplier as any).payment_details?.bank_name && (
                      <div>
                        <p className="text-xs text-muted-foreground">Bank</p>
                        <p className="font-medium">{(viewSupplier as any).payment_details.bank_name}</p>
                      </div>
                    )}
                    {(viewSupplier as any).payment_details?.account_name && (
                      <div>
                        <p className="text-xs text-muted-foreground">Account Name</p>
                        <p className="font-medium">{(viewSupplier as any).payment_details.account_name}</p>
                      </div>
                    )}
                    {(viewSupplier as any).payment_details?.account_number && (
                      <div>
                        <p className="text-xs text-muted-foreground">Account Number</p>
                        <p className="font-medium">{(viewSupplier as any).payment_details.account_number}</p>
                      </div>
                    )}
                    {(viewSupplier as any).payment_details?.mobile_money_number && (
                      <div>
                        <p className="text-xs text-muted-foreground">Mobile Money</p>
                        <p className="font-medium">{(viewSupplier as any).payment_details.mobile_money_number}</p>
                      </div>
                    )}
                    {(viewSupplier as any).payment_details?.payment_terms && (
                      <div className="col-span-2">
                        <p className="text-xs text-muted-foreground">Payment Terms</p>
                        <p className="font-medium">{(viewSupplier as any).payment_details.payment_terms}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {viewSupplier.notes && (
                <div className="p-3 bg-muted rounded-lg text-sm">
                  <p className="text-xs text-muted-foreground mb-1">Notes</p>
                  <p>{viewSupplier.notes}</p>
                </div>
              )}
              {/* Recent Products */}
              <div className="border-t pt-3">
                <h4 className="font-semibold text-sm flex items-center gap-2 mb-2">
                  <Package size={14} />
                  Products Supplied ({recentProducts.length})
                </h4>
                {recentProducts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No products found from this supplier</p>
                ) : (
                  <>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {recentProducts.map(p => (
                        <div key={p.id} className="flex items-center justify-between text-sm p-2 bg-muted/50 rounded">
                          <div>
                            <p className="font-medium">{p.product_name}</p>
                            <p className="text-xs text-muted-foreground">{p.date_of_purchase} • {p.quantity} units</p>
                          </div>
                          <p className="font-semibold">UGX {(p.total_value || p.quantity * p.cost_per_unit).toLocaleString()}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 p-2 bg-muted rounded-lg text-sm flex justify-between">
                      <span className="text-muted-foreground">Total Cost from Products</span>
                      <span className="font-bold">UGX {recentProducts.reduce((sum, p) => sum + (p.total_value || p.quantity * p.cost_per_unit), 0).toLocaleString()}</span>
                    </div>
                  </>
                )}
              </div>
              {viewSupplier.outstanding_balance > 0 && (
                <Button className="w-full gap-2" onClick={() => { setPayingSupplier(viewSupplier); setPayDialogOpen(true); setViewSupplier(null); }}>
                  <DollarSign size={14} />
                  Pay UGX {viewSupplier.outstanding_balance.toLocaleString()}
                </Button>
              )}
            </div>
          )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Suppliers;
