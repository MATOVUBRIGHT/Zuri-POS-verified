import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Search, Users, UserPlus, Phone, Mail, MapPin, History, Edit2, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Customer, SaleItem } from "@/types";
import ExcelImport from "@/components/ExcelImport";

interface CustomerTransaction {
    id: string;
    type: 'sale_credit' | 'payment' | 'refund' | 'adjustment';
    amount: number;
    reference_id?: string;
    description?: string;
    created_at: string;
}

const Customers = () => {
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    // Support global header search navigation: #/customers?q=...
    try {
      const hash = window.location.hash || '';
      const qIndex = hash.indexOf('?');
      if (qIndex === -1) return;
      const params = new URLSearchParams(hash.slice(qIndex + 1));
      const q = params.get('q');
      if (q && q.trim()) setSearchTerm(q.trim());
    } catch {
      // ignore
    }
  }, []);
    const [loading, setLoading] = useState(true);
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
    const [viewingHistory, setViewingHistory] = useState<Customer | null>(null);
    const [customerTransactions, setCustomerTransactions] = useState<CustomerTransaction[]>([]);
    const [loadingTransactions, setLoadingTransactions] = useState(false);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);

    const [newCustomer, setNewCustomer] = useState({
        full_name: "",
        email: "",
        phone: "",
        address: "",
        notes: ""
    });
    const { toast } = useToast();

    useEffect(() => {
        fetchCustomers();
    }, []);

    const fetchCustomers = async () => {
        try {
            setLoading(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: stores } = await supabase.from('stores').select('id').eq('user_id', user.id).limit(1);
            const { data: accessData } = await supabase.from('store_access').select('store_id').eq('user_id', user.id).limit(1);
            const storeId = stores?.[0]?.id || accessData?.[0]?.store_id;

            if (!storeId) return;

            const { data, error } = await supabase
                .from('customers')
                .select('*')
                .eq('store_id', storeId)
                .order('full_name', { ascending: true });

            if (error) throw error;
            
            setCustomers(data || []);
        } catch (error: unknown) {
            const err = error as Error;
            console.error("Error fetching customers:", error);
            toast({ title: "Error", description: err.message, variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    const fetchCustomerTransactions = async (customerId: string) => {
        try {
            setLoadingTransactions(true);
            const { data, error } = await supabase
                .from('customer_transactions')
                .select('*')
                .eq('customer_id', customerId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            
            const transactions: CustomerTransaction[] = (data || []).map(tx => ({
                id: tx.id,
                type: (['sale_credit', 'payment', 'refund', 'adjustment'].includes(tx.type) 
                    ? tx.type 
                    : 'adjustment') as CustomerTransaction['type'],
                amount: Number(tx.amount),
                reference_id: tx.reference_id || undefined,
                description: tx.description || undefined,
                created_at: tx.created_at || new Date().toISOString()
            }));

            setCustomerTransactions(transactions);
        } catch (error: unknown) {
            console.error("Error fetching customer transactions:", error);
            toast({ title: "Error", description: "Failed to load transaction history", variant: "destructive" });
        } finally {
            setLoadingTransactions(false);
        }
    };

    const handleAddCustomer = async () => {
        if (!newCustomer.full_name) {
            toast({ title: "Validation Error", description: "Customer name is required", variant: "destructive" });
            return;
        }

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: stores } = await supabase.from('stores').select('id').eq('user_id', user.id).limit(1);
            const { data: accessData } = await supabase.from('store_access').select('store_id').eq('user_id', user.id).limit(1);
            const storeId = stores?.[0]?.id || accessData?.[0]?.store_id;

            if (!storeId) return;

            const { error } = await supabase.from('customers').insert({ ...newCustomer, store_id: storeId, user_id: user.id });
            if (error) throw error;

            toast({ title: "Success", description: "Customer added successfully" });
            setIsAddDialogOpen(false);
            setNewCustomer({ full_name: "", email: "", phone: "", address: "", notes: "" });
            fetchCustomers();
        } catch (error: unknown) {
            const err = error as Error;
            toast({ title: "Error", description: err.message, variant: "destructive" });
        }
    };

    const handleUpdateCustomer = async () => {
        if (!editingCustomer) return;
        try {
            const { error } = await supabase
                .from('customers')
                .update({
                    full_name: editingCustomer.full_name,
                    email: editingCustomer.email,
                    phone: editingCustomer.phone,
                    address: editingCustomer.address,
                    notes: editingCustomer.notes,
                    credit_limit: editingCustomer.credit_limit
                })
                .eq('id', editingCustomer.id);

            if (error) throw error;
            toast({ title: "Success", description: "Customer information updated" });
            setIsEditDialogOpen(false);
            fetchCustomers();
        } catch (error: unknown) {
            const err = error as Error;
            toast({ title: "Update Failed", description: err.message, variant: "destructive" });
        }
    };

    const handleDeleteCustomer = async (id: string) => {
        if (!confirm("Are you sure you want to remove this customer?")) return;
        try {
            const { error } = await supabase.from('customers').delete().eq('id', id);
            if (error) throw error;
            toast({ title: "Success", description: "Customer removed" });
            fetchCustomers();
        } catch (error: unknown) {
            const err = error as Error;
            toast({ title: "Error", description: err.message, variant: "destructive" });
        }
    };

    const filteredCustomers = customers.filter(c =>
        c.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.phone?.includes(searchTerm) ||
        c.email?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h2 className="text-3xl font-bold flex items-center gap-2">
                    <Users className="h-8 w-8 text-primary" />
                    CRM
                </h2>
                <div className="flex gap-2">
                    <ExcelImport config={{
                        title: "Import Customers from Excel",
                        description: "Upload an Excel file with customer data",
                        fields: [
                            { key: "full_name", label: "Full Name", required: true, type: "string" },
                            { key: "phone", label: "Phone", type: "string" },
                            { key: "email", label: "Email", type: "string" },
                            { key: "address", label: "Address", type: "string" },
                            { key: "notes", label: "Notes", type: "string" },
                        ],
                        templateData: [
                            { "Full Name": "John Doe", "Phone": "+256700000000", "Email": "john@example.com", "Address": "Kampala", "Notes": "" },
                        ],
                        onImport: async (rows) => {
                            const { data: { user } } = await supabase.auth.getUser();
                            if (!user) throw new Error("Not authenticated");
                            const { data: stores } = await supabase.from("stores").select("id").eq("user_id", user.id).limit(1);
                            const { data: accessData } = await supabase.from("store_access").select("store_id").eq("user_id", user.id).limit(1);
                            const storeId = stores?.[0]?.id || accessData?.[0]?.store_id;
                            if (!storeId) throw new Error("No store found");

                            let success = 0;
                            const errors: string[] = [];
                            for (let i = 0; i < rows.length; i++) {
                                const row = rows[i];
                                if (!row.full_name) { errors.push(`Row ${i + 1}: Missing full name`); continue; }
                                const { error } = await supabase.from("customers").insert({
                                    store_id: storeId, user_id: user.id,
                                    full_name: String(row.full_name).trim(),
                                    phone: row.phone ? String(row.phone) : null,
                                    email: row.email ? String(row.email) : null,
                                    address: row.address ? String(row.address) : null,
                                    notes: row.notes ? String(row.notes) : null,
                                });
                                if (error) { errors.push(`Row ${i + 1}: ${error.message}`); } else { success++; }
                            }
                            fetchCustomers();
                            return { success, errors };
                        },
                    }} />
                    <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                        <DialogTrigger asChild>
                            <Button className="gap-2">
                                <UserPlus className="h-4 w-4" />
                                Add Customer
                            </Button>
                        </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Add New Customer</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 pt-4">
                            <div className="space-y-2">
                                <Label>Full Name *</Label>
                                <Input
                                    value={newCustomer.full_name}
                                    onChange={e => setNewCustomer({ ...newCustomer, full_name: e.target.value })}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Phone</Label>
                                    <Input
                                        value={newCustomer.phone}
                                        onChange={e => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Email</Label>
                                    <Input
                                        value={newCustomer.email}
                                        onChange={e => setNewCustomer({ ...newCustomer, email: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Physical Address</Label>
                                <Input
                                    value={newCustomer.address}
                                    onChange={e => setNewCustomer({ ...newCustomer, address: e.target.value })}
                                />
                            </div>
                            <Button onClick={handleAddCustomer} className="w-full">Save Customer</Button>
                        </div>
                    </DialogContent>
                    </Dialog>
                </div>
            </div>

            <Card className="border-none shadow-sm bg-muted/30">
                <CardContent className="pt-6">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search by name, phone, or email..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10 h-11 bg-background"
                        />
                    </div>
                </CardContent>
            </Card>

            <ScrollArea className="h-[calc(100vh-280px)]">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-10">
                    {loading ? (
                        <div className="col-span-full text-center py-20">Loading...</div>
                    ) : filteredCustomers.length === 0 ? (
                        <div className="col-span-full text-center py-20 text-muted-foreground">No customers found.</div>
                    ) : (
                        filteredCustomers.map((customer) => (
                            <Card key={customer.id} className="hover:shadow-md transition-shadow group">
                                <CardHeader className="pb-2">
                                    <div className="flex justify-between items-start">
                                        <CardTitle className="text-lg">{customer.full_name}</CardTitle>
                                        <div className="flex flex-col gap-1 items-end">
                                            <Badge variant="secondary" className="bg-primary/10 text-primary">
                                                {customer.loyalty_points} pts
                                            </Badge>
                                            {customer.unpaid_balance && customer.unpaid_balance > 0 ? (
                                                <Badge variant="destructive" className="text-[10px]">
                                                    Debt: UGX {customer.unpaid_balance.toLocaleString()}
                                                </Badge>
                                            ) : null}
                                            {customer.credit_limit > 0 && (
                                                <Badge variant="outline" className="text-[10px]">
                                                    Limit: UGX {customer.credit_limit.toLocaleString()}
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    <div className="space-y-1 text-sm text-muted-foreground min-h-[60px]">
                                        {customer.phone && <div className="flex items-center gap-2"><Phone className="h-3 w-3" />{customer.phone}</div>}
                                        {customer.email && <div className="flex items-center gap-2"><Mail className="h-3 w-3" />{customer.email}</div>}
                                        {customer.address && <div className="flex items-center gap-2"><MapPin className="h-3 w-3" />{customer.address}</div>}
                                    </div>
                                    <div className="pt-2 border-t flex justify-between items-center">
                                        <div>
                                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Contribution</p>
                                            <p className="font-bold text-sm text-primary">UGX {customer.total_spent.toLocaleString()}</p>
                                        </div>
                                        <div className="flex opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => {
                                                    setViewingHistory(customer);
                                                    setIsHistoryOpen(true);
                                                    fetchCustomerTransactions(customer.id);
                                                }}
                                                title="View History"
                                            >
                                                <History className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => {
                                                    setEditingCustomer(customer);
                                                    setIsEditDialogOpen(true);
                                                }}
                                                title="Edit Customer"
                                            >
                                                <Edit2 className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-destructive hover:bg-destructive/10"
                                                onClick={() => handleDeleteCustomer(customer.id)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))
                    )}
                </div>
            </ScrollArea>

            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Customer</DialogTitle>
                    </DialogHeader>
                    {editingCustomer && (
                        <div className="space-y-4 pt-4">
                            <div className="space-y-2">
                                <Label>Full Name</Label>
                                <Input
                                    value={editingCustomer.full_name}
                                    onChange={e => setEditingCustomer({ ...editingCustomer, full_name: e.target.value })}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Phone</Label>
                                    <Input
                                        value={editingCustomer.phone}
                                        onChange={e => setEditingCustomer({ ...editingCustomer, phone: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Email</Label>
                                    <Input
                                        value={editingCustomer.email}
                                        onChange={e => setEditingCustomer({ ...editingCustomer, email: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Physical Address</Label>
                                <Input
                                    value={editingCustomer.address}
                                    onChange={e => setEditingCustomer({ ...editingCustomer, address: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Credit Limit (UGX)</Label>
                                <Input
                                    type="number"
                                    value={editingCustomer.credit_limit}
                                    onChange={e => setEditingCustomer({ ...editingCustomer, credit_limit: Number(e.target.value) })}
                                />
                            </div>
                            <Button onClick={handleUpdateCustomer} className="w-full">Update Customer Details</Button>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <History className="h-5 w-5" />
                            Transaction History: {viewingHistory?.full_name}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                        <div className="grid grid-cols-2 gap-4">
                            <Card className="bg-muted/30">
                                <CardContent className="pt-4">
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Unpaid Balance</p>
                                    <p className="text-xl font-bold text-destructive">UGX {viewingHistory?.unpaid_balance?.toLocaleString()}</p>
                                </CardContent>
                            </Card>
                            <Card className="bg-muted/30">
                                <CardContent className="pt-4">
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Credit Limit</p>
                                    <p className="text-xl font-bold">UGX {viewingHistory?.credit_limit?.toLocaleString()}</p>
                                </CardContent>
                            </Card>
                        </div>

                        <ScrollArea className="h-[400px] border rounded-md p-4">
                            {loadingTransactions ? (
                                <div className="text-center py-10">Loading transactions...</div>
                            ) : customerTransactions.length === 0 ? (
                                <div className="text-center py-10 text-muted-foreground">No transaction history found.</div>
                            ) : (
                                <div className="space-y-3">
                                    {customerTransactions.map((tx) => (
                                        <div key={tx.id} className="flex justify-between items-center p-3 border rounded-lg bg-background hover:bg-muted/10 transition-colors">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <Badge variant={
                                                        tx.type === 'sale_credit' ? 'destructive' : 
                                                        tx.type === 'payment' ? 'outline' : 'outline'
                                                    } className={`text-[10px] capitalize ${tx.type === 'payment' ? 'bg-success/10 text-success hover:bg-success/10 border-success/20' : ''}`}>
                                                        {tx.type.replace('_', ' ')}
                                                    </Badge>
                                                    <span className="text-xs text-muted-foreground">
                                                        {new Date(tx.created_at).toLocaleDateString()} {new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </div>
                                                <p className="text-sm font-medium">{tx.description || 'No description'}</p>
                                                {tx.reference_id && <p className="text-[10px] text-muted-foreground">Ref: {tx.reference_id}</p>}
                                            </div>
                                            <div className={`text-sm font-bold ${
                                                tx.type === 'payment' || tx.type === 'refund' ? 'text-success' : 'text-destructive'
                                            }`}>
                                                {tx.type === 'payment' || tx.type === 'refund' ? '-' : '+'} UGX {tx.amount.toLocaleString()}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </ScrollArea>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default Customers;
