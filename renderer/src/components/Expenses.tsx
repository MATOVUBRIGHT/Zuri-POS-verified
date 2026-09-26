import { useState, useRef } from "react";
import { ExpenseItem } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Minus, Plus, Receipt, Trash2, Loader2, Upload, Image, Wallet, CreditCard, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAddExpenseOptimistic, useDeleteExpenseOptimistic } from "@/hooks/useOptimizedData";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import ExcelImport from "@/components/ExcelImport";

const expenseSchema = z.object({
  description: z.string().trim().min(1, "Description is required").max(500, "Description too long"),
  category: z.string().min(1, "Category is required"),
  amount: z.number().positive("Amount must be positive"),
  paymentMethod: z.string().optional(),
  date: z.string().min(1, "Date is required"),
});

interface ExpensesProps {
  expensesData: ExpenseItem[];
  onAddExpense: (expense: ExpenseItem) => void;
  onDeleteExpense: (expenseId: string) => void;
}

const Expenses = ({ expensesData, onAddExpense, onDeleteExpense }: ExpensesProps) => {
  const { toast } = useToast();
  const addExpenseMutation = useAddExpenseOptimistic();
  const deleteExpenseMutation = useDeleteExpenseOptimistic();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    description: "",
    category: "",
    amount: "",
    paymentMethod: "",
    date: new Date().toISOString().split('T')[0],
    notes: ""
  });

  const expenseCategories = [
    "Transport", "Utilities", "Rent", "Supplies", "Marketing",
    "Maintenance", "Insurance", "Petty Cash", "Other"
  ];

  const paymentMethods = ["Cash", "Bank Transfer", "Mobile Money", "Cheque"];

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleReceiptChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast({ title: "Error", description: "Receipt image must be under 5MB", variant: "destructive" });
        return;
      }
      setReceiptFile(file);
      const reader = new FileReader();
      reader.onload = (ev) => setReceiptPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const uploadReceipt = async (userId: string, storeId: string): Promise<string | null> => {
    if (!receiptFile) return null;
    const ext = receiptFile.name.split('.').pop();
    const path = `${storeId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('receipts').upload(path, receiptFile);
    if (error) throw new Error(`Receipt upload failed: ${error.message}`);
    // Store the path for signed URL generation later
    return path;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    
    const amount = parseFloat(formData.amount) || 0;
    const validation = expenseSchema.safeParse({
      description: formData.description,
      category: formData.category,
      amount,
      paymentMethod: formData.paymentMethod,
      date: formData.date,
    });

    if (!validation.success) {
      toast({ title: "Validation Error", description: validation.error.errors.map(e => e.message).join(", "), variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: stores } = await (supabase as any).from("stores").select("id").eq("user_id" as any, user.id as any).limit(1);
      const { data: accessStores } = await (supabase as any).from("store_access").select("store_id").eq("user_id" as any, user.id as any).limit(1);
      const storeId = (stores as any)?.[0]?.id || (accessStores as any)?.[0]?.store_id;
      if (!storeId) throw new Error("No store found");

      // Upload receipt if attached
      const receiptUrl = await uploadReceipt(user.id, storeId);

      const expensePayload = {
        user_id: user.id,
        store_id: storeId,
        description: formData.description,
        category: formData.category,
        amount: parseFloat(formData.amount),
        payment_method: formData.paymentMethod,
        date_of_expense: formData.date,
        receipt_url: receiptUrl,
      };

      await addExpenseMutation.mutateAsync(expensePayload);

      if (String(formData.paymentMethod || "").toLowerCase().includes("cash")) {
        // Track cash outflows (already handled by DataSyncService/TransactionOptimizer in batchOperations if we wanted, 
        // but here we just record it separately in the same batch or a new one)
        try {
          const { error: txError } = await supabase.from("cash_transactions").insert({
            user_id: user.id,
            store_id: storeId,
            amount: Number(amount) || 0,
            type: "out",
            description: `Expense: ${formData.description}`,
            account_type: "cash",
          });
          if (txError) console.warn("Failed to record cash expense transaction:", txError);
        } catch (e) {
          console.warn("Failed to record cash expense transaction:", e);
        }
      }

      await logAudit({
        action: 'create', tableName: 'expenses',
        newData: { description: formData.description, category: formData.category, amount: parseFloat(formData.amount), paymentMethod: formData.paymentMethod },
        storeId,
      });

      onAddExpense({
        id: 'optimistic-' + Date.now(), description: formData.description, category: formData.category,
        amount: parseFloat(formData.amount), paymentMethod: formData.paymentMethod,
        date: formData.date, notes: formData.notes, createdAt: new Date().toISOString()
      });

      setFormData({ description: "", category: "", amount: "", paymentMethod: "", date: new Date().toISOString().split('T')[0], notes: "" });
      setReceiptFile(null);
      setReceiptPreview(null);
      toast({ title: "Success", description: "Expense recorded successfully" });
    } catch (error: unknown) {
      const err = error as Error;
      toast({ title: "Error", description: err.message || "Failed to record expense", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this expense?")) return;
    try {
      await deleteExpenseMutation.mutateAsync(id);
      onDeleteExpense(id);
      toast({ title: "Success", description: "Expense deleted successfully" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const totalExpenses = expensesData.reduce((sum, expense) => sum + expense.amount, 0);
  const todayExpenses = expensesData
    .filter(expense => expense.date === new Date().toISOString().split('T')[0])
    .reduce((sum, expense) => sum + expense.amount, 0);
  const pettyCashExpenses = expensesData.filter(e => e.category === "Petty Cash");
  const pettyCashTotal = pettyCashExpenses.reduce((sum, e) => sum + e.amount, 0);

  const renderExpenseList = (items: ExpenseItem[], emptyMsg: string) => (
    <div className="space-y-3 max-h-96 overflow-y-auto">
      {items.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Receipt className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p>{emptyMsg}</p>
        </div>
      ) : (
        items
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .map((expense) => (
            <div key={expense.id} className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex-1">
                <h4 className="font-medium">{expense.description}</h4>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-xs">{expense.category}</Badge>
                  {expense.paymentMethod && <Badge variant="secondary" className="text-xs">{expense.paymentMethod}</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">{new Date(expense.date).toLocaleDateString()}</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <div className="font-medium text-destructive">-UGX {expense.amount.toLocaleString()}</div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(expense.id)} className="text-destructive hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Receipt className="h-8 w-8 text-primary" />
          <h2 className="text-3xl font-bold text-foreground">Expenses Management</h2>
        </div>
        <ExcelImport config={{
          title: "Import Expenses from Excel",
          description: "Upload an Excel file with expense records",
          fields: [
            { key: "description", label: "Description", required: true, type: "string" },
            { key: "category", label: "Category", type: "string", defaultValue: "Other" },
            { key: "amount", label: "Amount", type: "number", defaultValue: 0 },
            { key: "payment_method", label: "Payment Method", type: "string", defaultValue: "Cash" },
            { key: "date_of_expense", label: "Date", type: "date", defaultValue: new Date().toISOString().split("T")[0] },
          ],
          templateData: [
            { "Description": "Office supplies", "Category": "Supplies", "Amount": 50000, "Payment Method": "Cash", "Date": "2026-03-09" },
          ],
          onImport: async (rows) => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Not authenticated");
            const { data: stores } = await (supabase as any).from("stores").select("id").eq("user_id" as any, user.id as any).limit(1);
            const { data: accessStores } = await (supabase as any).from("store_access").select("store_id").eq("user_id" as any, user.id as any).limit(1);
            const storeId = (stores as any)?.[0]?.id || (accessStores as any)?.[0]?.store_id;
            if (!storeId) throw new Error("No store found");

            let success = 0;
            const errors: string[] = [];
            for (let i = 0; i < rows.length; i++) {
              const row = rows[i];
              if (!row.description) {
                errors.push(`Row ${i + 1}: Missing description`);
                continue;
              }
              const { error } = await supabase.from("expenses").insert({
                store_id: storeId, user_id: user.id,
                description: String(row.description).trim(),
                category: String(row.category).trim(),
                amount: Number(row.amount) || 0,
                payment_method: String(row.payment_method || "Cash"),
                date_of_expense: row.date_of_expense || new Date().toISOString().split("T")[0],
              } as any);
              if (error) { errors.push(`Row ${i + 1}: ${error.message}`); } else { success++; }
            }
            return { success, errors };
          },
        }} />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-destructive/10 to-destructive/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
            <Minus className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">UGX {totalExpenses.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-warning/10 to-warning/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today's Expenses</CardTitle>
            <Receipt className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-warning">UGX {todayExpenses.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Petty Cash</CardTitle>
            <Wallet className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">UGX {pettyCashTotal.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-accent/10 to-accent/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Records</CardTitle>
            <FileText className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-accent">{expensesData.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="expenses" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="expenses" className="gap-2">
            <Receipt className="h-4 w-4" />
            Expenses
          </TabsTrigger>
          <TabsTrigger value="petty-cash" className="gap-2">
            <Wallet className="h-4 w-4" />
            Petty Cash
          </TabsTrigger>
          <TabsTrigger value="payables" className="gap-2">
            <CreditCard className="h-4 w-4" />
            Payables
          </TabsTrigger>
        </TabsList>

        <TabsContent value="expenses">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Add Expense Form */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus className="h-5 w-5" />
                  Record New Expense
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="description">Description *</Label>
                    <Input id="description" placeholder="e.g., Fuel for delivery truck" value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} required />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Category *</Label>
                      <Select value={formData.category} onValueChange={(value) => setFormData({...formData, category: value})}>
                        <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                        <SelectContent>
                          {expenseCategories.map((cat) => (
                            <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Amount (UGX) *</Label>
                      <Input type="number" step="0.01" placeholder="e.g., 50000" value={formData.amount} onChange={(e) => setFormData({...formData, amount: e.target.value})} required />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Payment Method</Label>
                      <Select value={formData.paymentMethod} onValueChange={(value) => setFormData({...formData, paymentMethod: value})}>
                        <SelectTrigger><SelectValue placeholder="Select method" /></SelectTrigger>
                        <SelectContent>
                          {paymentMethods.map((method) => (
                            <SelectItem key={method} value={method}>{method}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Date</Label>
                      <Input type="date" value={formData.date} onChange={(e) => setFormData({...formData, date: e.target.value})} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea placeholder="Additional notes..." value={formData.notes} onChange={(e) => setFormData({...formData, notes: e.target.value})} rows={2} />
                  </div>

                  {/* Receipt Upload */}
                  <div className="space-y-2">
                    <Label>Attach Receipt</Label>
                    <input type="file" ref={fileInputRef} accept="image/*" onChange={handleReceiptChange} className="hidden" />
                    <div className="flex items-center gap-3">
                      <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => fileInputRef.current?.click()}>
                        <Upload className="h-4 w-4" />
                        {receiptFile ? "Change" : "Upload Receipt"}
                      </Button>
                      {receiptFile && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Image className="h-4 w-4" />
                          {receiptFile.name}
                          <Button type="button" variant="ghost" size="sm" onClick={() => { setReceiptFile(null); setReceiptPreview(null); }}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                    {receiptPreview && (
                      <img src={receiptPreview} alt="Receipt preview" className="mt-2 max-h-32 rounded-lg border object-cover" />
                    )}
                  </div>

                  <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
                    {isSubmitting ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Recording...</>) : (<><Plus className="h-4 w-4 mr-2" />Record Expense</>)}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Recent Expenses */}
            <Card>
              <CardHeader><CardTitle>Recent Expenses</CardTitle></CardHeader>
              <CardContent>
                {renderExpenseList(expensesData, "No expenses recorded yet.")}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="petty-cash">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="h-5 w-5" />
                  Petty Cash Expenses
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Track small day-to-day cash expenses. Use "Petty Cash" category when recording expenses.
                </p>
                <div className="p-4 bg-primary/5 rounded-lg mb-4">
                  <p className="text-sm font-medium">Total Petty Cash Spent</p>
                  <p className="text-2xl font-bold text-primary">UGX {pettyCashTotal.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">{pettyCashExpenses.length} transaction{pettyCashExpenses.length !== 1 ? 's' : ''}</p>
                </div>
                {renderExpenseList(pettyCashExpenses, "No petty cash expenses yet. Record one using 'Petty Cash' category.")}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Quick Add Petty Cash</CardTitle></CardHeader>
              <CardContent>
                <form onSubmit={(e) => {
                  e.preventDefault();
                  setFormData(prev => ({ ...prev, category: "Petty Cash", paymentMethod: "Cash" }));
                  handleSubmit(e);
                }} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Description *</Label>
                    <Input placeholder="e.g., Airtime, Boda fare..." value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} required />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Amount (UGX) *</Label>
                      <Input type="number" placeholder="Amount" value={formData.amount} onChange={(e) => setFormData({...formData, amount: e.target.value})} required />
                    </div>
                    <div className="space-y-2">
                      <Label>Date</Label>
                      <Input type="date" value={formData.date} onChange={(e) => setFormData({...formData, date: e.target.value})} />
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={isSubmitting}>
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-2" />Add Petty Cash Expense</>}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="payables">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Payables & Pending Payments
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-muted-foreground">
                <CreditCard className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No pending payables</p>
                <p className="text-sm mt-1">Outstanding supplier balances and scheduled payments will appear here.</p>
                <p className="text-sm mt-3">Check the <strong>Suppliers</strong> page to view and pay supplier balances.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Expenses;
