import { useState, useEffect } from "react";
import { fmtCurrency, getCurrencySymbol } from "@/lib/currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Users,
    UserPlus,
    Shield,
    ShieldCheck,
    Clock,
    Calendar,
    Trash2,
    Edit2,
    Lock,
    DollarSign,
    AlertTriangle,
    CheckCircle2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Staff } from "@/types";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

const ALL_PAGES = [
    { id: "dashboard", label: "Dashboard" },
    { id: "sales-entry", label: "Sales Entry" },
    { id: "stock-entry", label: "Stock Entry" },
    { id: "inventory", label: "Inventory" },
    { id: "products", label: "Products" },
    { id: "customers", label: "Customers" },
    { id: "expenses", label: "Expenses" },
    { id: "shifts", label: "Shifts" },
    { id: "reports", label: "Reports" },
    { id: "settings", label: "Settings" },
    { id: "security", label: "Security Logs" },
];

const DEFAULT_PAGES_BY_ROLE: Record<string, string[]> = {
    cashier: ["sales-entry", "shifts"],
    manager: ["dashboard", "sales-entry", "stock-entry", "inventory", "products", "customers", "expenses", "shifts", "reports"],
    admin: ALL_PAGES.map(p => p.id),
};

interface StaffManagementProps { currentStoreId?: string | null; }
const StaffManagement = ({ currentStoreId }: StaffManagementProps) => {
    const [staffList, setStaffList] = useState<Staff[]>([]);
    const [loading, setLoading] = useState(false);
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [editAllowedPages, setEditAllowedPages] = useState<string[]>([]);

    const [newStaff, setNewStaff] = useState({
        full_name: "",
        employee_id: "",
        pin_code: "",
        role: "cashier",
        hourly_rate: 0
    });
    const [newAllowedPages, setNewAllowedPages] = useState<string[]>(DEFAULT_PAGES_BY_ROLE["cashier"]);

    const { toast } = useToast();

    // Last shift discrepancy per staff
    const [staffShiftStats, setStaffShiftStats] = useState<Record<string, { discrepancy: number; date: string; actual: number; expected: number }>>({});

    useEffect(() => {
        fetchStaff();
        fetchStaffShiftStats();
    }, []);

    const resolveStoreId = async (userId: string): Promise<string | null> => {
        // Prefer the store currently selected in the app.
        const current = localStorage.getItem("brec_current_store");
        if (current) return current;

        // Fallback: first owned store, then a shared store.
        const targetStoreId = currentStoreId || (await supabase.from("stores").select("id").eq("user_id", userId).limit(1)).data?.[0]?.id;
        const { data: accessData } = await supabase.from("store_access").select("store_id").eq("user_id", userId).limit(1);
        return targetStoreId || accessData?.[0]?.store_id || null;
    };

    const fetchStaffShiftStats = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const storeId = await resolveStoreId(user.id);
            if (!storeId) return;

            const { data: shifts } = await supabase
                .from('shifts')
                .select('staff_id, ending_cash_actual, ending_cash_expected, end_time, status')
                .eq('store_id', storeId)
                .eq('status', 'closed')
                .not('staff_id', 'is', null)
                .order('end_time', { ascending: false })
                .limit(100);

            // Keep only the most recent closed shift per staff
            const stats: Record<string, { discrepancy: number; date: string; actual: number; expected: number }> = {};
            for (const s of (shifts || [])) {
                if (!s.staff_id || stats[s.staff_id]) continue;
                const actual = Number(s.ending_cash_actual ?? 0);
                const expected = Number(s.ending_cash_expected ?? 0);
                stats[s.staff_id] = {
                    discrepancy: actual - expected,
                    actual,
                    expected,
                    date: s.end_time || '',
                };
            }
            setStaffShiftStats(stats);
        } catch { /* ignore */ }
    };

    const hashPin = async (pin: string): Promise<string | null> => {        // Use DB-side bcrypt hashing (no CORS, consistent with verify_pin_hash()).
        const { data, error } = await supabase.rpc("hash_pin" as any, { pin_input: pin } as any);
        if (error) return null;
        return typeof data === "string" && data.length > 0 ? data : null;
    };

    const getMissingColumnName = (error: any): string | null => {
        const message = String(error?.message || "");
        const explicitMatch = message.match(/Could not find the '([^']+)' column/i);
        if (explicitMatch?.[1]) return explicitMatch[1];

        const pgMatch = message.match(/column\s+["']?([a-zA-Z0-9_]+)["']?\s+does not exist/i);
        if (pgMatch?.[1]) return pgMatch[1];

        return null;
    };

    const updateStaffWithSchemaFallback = async (staffId: string, payload: Record<string, any>) => {
        const workingPayload = { ...payload };
        for (let attempt = 0; attempt < 8; attempt++) {
            const { error } = await supabase
                .from('staff')
                .update(workingPayload as any)
                .eq('id', staffId);

            if (!error) return;

            const missingColumn = getMissingColumnName(error);
            if (!missingColumn || !(missingColumn in workingPayload)) throw error;
            delete workingPayload[missingColumn];
        }
        throw new Error("Could not update staff due to schema mismatch.");
    };

    const insertStaffWithSchemaFallback = async (payload: Record<string, any>) => {
        const workingPayload = { ...payload };
        for (let attempt = 0; attempt < 8; attempt++) {
            const { data, error } = await supabase
                .from("staff")
                .insert([workingPayload] as any)
                .select("id")
                .single();

            if (!error) return data;

            const missingColumn = getMissingColumnName(error);
            if (!missingColumn || !(missingColumn in workingPayload)) throw error;
            delete workingPayload[missingColumn];
        }
        throw new Error("Could not add staff due to schema mismatch.");
    };

    const fetchStaff = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const storeId = await resolveStoreId(user.id);
            if (!storeId) return;

            const baseSelect = 'id, store_id, user_id, full_name, employee_id, role, status, hourly_rate, created_at';
            const extendedSelect = `${baseSelect}, total_sales, sales_count, updated_at, allowed_pages`;

            let staffData: any[] = [];
            {
                const { data, error } = await supabase
                    .from('staff')
                    .select(extendedSelect)
                    .eq('store_id', storeId)
                    .order('full_name', { ascending: true });

                if (!error && data) {
                    staffData = data;
                } else if (error) {
                    const msg = error.message?.toLowerCase() || '';
                    const looksLikeMissingColumn =
                        (msg.includes('allowed_pages') || msg.includes('updated_at') || msg.includes('total_sales') || msg.includes('sales_count')) &&
                        (msg.includes('does not exist') || msg.includes('schema cache') || msg.includes('column'));

                    if (!looksLikeMissingColumn) throw error;

                    const { data: fallbackData, error: fallbackError } = await supabase
                        .from('staff')
                        .select(baseSelect)
                        .eq('store_id', storeId)
                        .order('full_name', { ascending: true });

                    if (fallbackError) throw fallbackError;
                    staffData = fallbackData || [];
                }
            }

            let salesData: any[] = [];
            {
                const { data, error: salesError } = await supabase
                    .from('sales')
                    .select('staff_id, total_amount')
                    .eq('store_id', storeId);
                
                if (salesError) {
                    const msg = salesError.message?.toLowerCase() || '';
                    if (msg.includes('staff_id') || msg.includes('column') && msg.includes('does not exist')) {
                        // Fallback: fetch without staff_id if column is missing
                        const { data: fallbackData } = await supabase
                            .from('sales')
                            .select('total_amount')
                            .eq('store_id', storeId);
                        salesData = fallbackData || [];
                    } else {
                        throw salesError;
                    }
                } else {
                    salesData = data || [];
                }
            }

            const staffWithStats = (staffData || []).map((s) => {
                const staffSales = salesData.filter(sale => sale.staff_id === s.id);
                const cachedPagesRaw = localStorage.getItem(`staff_pages_${s.id}`);
                const cachedPages = cachedPagesRaw ? (() => { try { return JSON.parse(cachedPagesRaw); } catch { return null; } })() : null;
                const allowedPages = Array.isArray(s.allowed_pages)
                    ? s.allowed_pages
                    : Array.isArray(cachedPages)
                        ? cachedPages
                        : DEFAULT_PAGES_BY_ROLE[String(s.role || "cashier")] || DEFAULT_PAGES_BY_ROLE["cashier"];
                return {
                    ...s,
                    total_sales: staffSales.reduce((sum, sale) => sum + Number(sale.total_amount), 0),
                    sales_count: staffSales.length,
                    allowed_pages: allowedPages,
                } as Staff;
            });

            setStaffList(staffWithStats);
        } catch (error: unknown) {
            const err = error as Error;
            // don't show toast for offline
            console.error(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateStaff = async () => {
        if (!editingStaff) return;
        try {
            const updateData: any = {
                full_name: editingStaff.full_name,
                role: editingStaff.role,
                hourly_rate: editingStaff.hourly_rate,
                status: editingStaff.status as any,
                allowed_pages: editAllowedPages as any
            };

            // Only update PIN if a new one was entered (4-6 digits).
            if (editingStaff.pin_code && editingStaff.pin_code.trim() !== "") {
                const pin = editingStaff.pin_code.trim();
                if (!/^\d{4,6}$/.test(pin)) {
                    toast({ title: "Invalid PIN", description: "PIN must be 4-6 digits.", variant: "destructive" });
                    return;
                }

                const pinHash = await hashPin(pin);
                if (pinHash) {
                    updateData.pin_hash = pinHash;
                } else {
                    // Backwards compatibility with older schema that still uses pin_code.
                    updateData.pin_code = pin;
                }
            }
            await updateStaffWithSchemaFallback(editingStaff.id, updateData);

            // Also keep localStorage as cache
            localStorage.setItem(`staff_pages_${editingStaff.id}`, JSON.stringify(editAllowedPages));

            toast({ title: "Success", description: "Staff information updated" });
            setIsEditDialogOpen(false);
            fetchStaff();
        } catch (error: unknown) {
            const err = error as Error;
            toast({ title: "Update Failed", description: err.message, variant: "destructive" });
        }
    };

    const handleAddStaff = async () => {
        if (!newStaff.full_name || !newStaff.employee_id || !newStaff.pin_code) {
            toast({ title: "Required Fields", description: "Please fill name, ID and PIN", variant: "destructive" });
            return;
        }

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const storeId = await resolveStoreId(user.id);
            if (!storeId) throw new Error("No store found");

            const pin = String(newStaff.pin_code || "").trim();
            if (!/^\d{4,6}$/.test(pin)) {
                toast({ title: "Invalid PIN", description: "PIN must be 4-6 digits.", variant: "destructive" });
                return;
            }

            const baseRow: any = {
                full_name: newStaff.full_name,
                employee_id: newStaff.employee_id,
                role: newStaff.role,
                hourly_rate: newStaff.hourly_rate,
                store_id: storeId,
                user_id: user.id,
                allowed_pages: newAllowedPages as any,
            };

            const pinHash = await hashPin(pin);
            const insertRow: any = pinHash
                ? { ...baseRow, pin_hash: pinHash }
                : { ...baseRow, pin_code: pin };

            const newStaffData = await insertStaffWithSchemaFallback(insertRow);

            // Also keep localStorage as cache
            if (newStaffData) {
                localStorage.setItem(`staff_pages_${newStaffData.id}`, JSON.stringify(newAllowedPages));
            }

            toast({ title: "Success", description: "Staff member added" });
            setIsAddDialogOpen(false);
            setNewStaff({ full_name: "", employee_id: "", pin_code: "", role: "cashier", hourly_rate: 0 });
            setNewAllowedPages(DEFAULT_PAGES_BY_ROLE["cashier"]);
            fetchStaff();
        } catch (error: unknown) {
            const err = error as Error;
            toast({ title: "Error", description: err.message, variant: "destructive" });
        }
    };

    const handleDeleteStaff = async (id: string) => {
        if (!confirm("Are you sure you want to remove this staff member?")) return;
        try {
            const { error } = await supabase.from('staff').delete().eq('id', id);
            if (error) throw error;
            localStorage.removeItem(`staff_pages_${id}`);
            toast({ title: "Success", description: "Staff member removed" });
            fetchStaff();
        } catch (error: unknown) {
            const err = error as Error;
            toast({ title: "Error", description: err.message, variant: "destructive" });
        }
    };

    const togglePage = (pageId: string, pages: string[], setPages: (p: string[]) => void) => {
        if (pages.includes(pageId)) {
            setPages(pages.filter(p => p !== pageId));
        } else {
            setPages([...pages, pageId]);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-bold flex items-center gap-3">
                        <Users className="h-8 w-8 text-primary" />
                        Human Resources
                    </h2>
                    <p className="text-muted-foreground mt-1">Manage your cashiers, roles, and shift authorization.</p>
                </div>
                <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                    <DialogTrigger asChild>
                        <Button className="gap-2">
                            <UserPlus className="h-4 w-4" />
                            Add New Staff
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-h-[90vh] overflow-y-auto" aria-describedby="add-staff-description">
                        <DialogHeader>
                            <DialogTitle>Add New Staff Member</DialogTitle>
                            <DialogDescription id="add-staff-description">
                                Enter staff details below. PIN is stored as a secure hash.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 pt-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Full Name</Label>
                                    <Input
                                        value={newStaff.full_name}
                                        onChange={e => setNewStaff({ ...newStaff, full_name: e.target.value })}
                                        placeholder="Jane Doe"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Public PIN (Staff ID)</Label>
                                    <Input
                                        value={newStaff.employee_id}
                                        onChange={e => setNewStaff({ ...newStaff, employee_id: e.target.value })}
                                        placeholder="EMP001"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Shift PIN Code (4-6 digits)</Label>
                                    <Input
                                        type="password"
                                        maxLength={6}
                                        value={newStaff.pin_code}
                                        onChange={e => setNewStaff({ ...newStaff, pin_code: e.target.value })}
                                        placeholder="****"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Hourly Rate ({getCurrencySymbol()})</Label>
                                    <Input
                                        type="number"
                                        value={newStaff.hourly_rate}
                                        onChange={e => setNewStaff({ ...newStaff, hourly_rate: Number(e.target.value) })}
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Role</Label>
                                <select
                                    className="w-full h-10 px-3 rounded-md border border-input bg-background"
                                    value={newStaff.role}
                                    onChange={e => {
                                        const role = e.target.value;
                                        setNewStaff({ ...newStaff, role });
                                        setNewAllowedPages(DEFAULT_PAGES_BY_ROLE[role] || DEFAULT_PAGES_BY_ROLE["cashier"]);
                                    }}
                                >
                                    <option value="cashier">Cashier</option>
                                    <option value="manager">Manager</option>
                                    <option value="admin">Administrator</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-sm font-semibold">Allowed Pages</Label>
                                <div className="grid grid-cols-2 gap-2 p-3 border rounded-lg bg-muted/30">
                                    {ALL_PAGES.map(page => (
                                        <label key={page.id} className="flex items-center gap-2 text-sm cursor-pointer">
                                            <Checkbox
                                                checked={newAllowedPages.includes(page.id)}
                                                onCheckedChange={() => togglePage(page.id, newAllowedPages, setNewAllowedPages)}
                                            />
                                            {page.label}
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <Button onClick={handleAddStaff} className="w-full">Create Staff Account</Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="md:col-span-2">
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <ShieldCheck className="h-5 w-5" />
                            Active Staff Directory
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ScrollArea className="h-[500px] pr-4">
                            <div className="space-y-4">
                                {loading ? (
                                    <LoadingSpinner size="lg" text="Loading staff..." />
                                ) : staffList.length === 0 ? (
                                    <div className="text-center py-10 text-muted-foreground">No staff members found.</div>
                                ) : (
                                    staffList.map((staff) => {
                                        // Use DB allowed_pages first, fall back to localStorage cache, then role defaults
                                        const dbPages = (staff as any).allowed_pages;
                                        const savedPages = localStorage.getItem(`staff_pages_${staff.id}`);
                                        const allowedPages: string[] = (Array.isArray(dbPages) && dbPages.length > 0)
                                            ? dbPages
                                            : savedPages ? JSON.parse(savedPages) : DEFAULT_PAGES_BY_ROLE[staff.role] || [];
                                        
                                        return (
                                            <div key={staff.id} className="flex items-center justify-between p-4 border rounded-xl hover:bg-muted/50 transition-colors">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
                                                        {staff.full_name[0]}
                                                    </div>
                                                    <div className="flex-1 min-w-[150px]">
                                                        <div className="flex items-center gap-2">
                                                            <h4 className="font-semibold">{staff.full_name}</h4>
                                                            <Badge variant={staff.role === 'admin' ? 'default' : 'secondary'} className="text-[10px] uppercase">
                                                                {staff.role}
                                                            </Badge>
                                                        </div>
                                                        <p className="text-xs text-muted-foreground mt-0.5">Public PIN: {staff.employee_id} • Rate: {fmtCurrency(staff.hourly_rate ?? 0)}/hr</p>
                                                        <div className="flex gap-4 mt-1">
                                                            <div className="text-[10px] text-muted-foreground">
                                                                Sales: <span className="font-bold text-emerald-600">{fmtCurrency(staff.total_sales ?? 0)}</span>
                                                            </div>
                                                            <div className="text-[10px] text-muted-foreground">
                                                                Orders: <span className="font-bold text-blue-600">{staff.sales_count}</span>
                                                            </div>
                                                        </div>
                                                        <div className="flex gap-1 flex-wrap mt-1">
                                                            {allowedPages.slice(0, 3).map((p: string) => (
                                                                <Badge key={p} variant="outline" className="text-[8px] px-1 py-0">
                                                                    {ALL_PAGES.find(ap => ap.id === p)?.label || p}
                                                                </Badge>
                                                            ))}
                                                            {allowedPages.length > 3 && (
                                                                <Badge variant="outline" className="text-[8px] px-1 py-0">+{allowedPages.length - 3} more</Badge>
                                                            )}
                                                        </div>
                                                        {staffShiftStats[staff.id] && (() => {
                                                            const stat = staffShiftStats[staff.id];
                                                            const hasDiscrepancy = Math.abs(stat.discrepancy) > 0.01;
                                                            return (
                                                                <div className={`mt-1.5 flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-md w-fit ${hasDiscrepancy ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
                                                                    {hasDiscrepancy
                                                                        ? <AlertTriangle className="h-3 w-3 shrink-0" />
                                                                        : <CheckCircle2 className="h-3 w-3 shrink-0" />}
                                                                    <span className="font-semibold">Last shift:</span>
                                                                    {hasDiscrepancy
                                                                        ? <span>{stat.discrepancy > 0 ? '+' : ''}{fmtCurrency(stat.discrepancy)} discrepancy</span>
                                                                        : <span>No discrepancy</span>}
                                                                    <span className="text-[9px] opacity-70">• {stat.date ? new Date(stat.date).toLocaleDateString([], { month: 'short', day: 'numeric' }) : ''}</span>
                                                                </div>
                                                            );
                                                        })()}
                                                    </div>
                                                </div>
                                                <div className="flex gap-2">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => {
                                                            setEditingStaff(staff);
                                                            // Load from DB first, then localStorage, then role defaults
                                                            const dbPages = (staff as any).allowed_pages;
                                                            const saved = localStorage.getItem(`staff_pages_${staff.id}`);
                                                            const pages = (Array.isArray(dbPages) && dbPages.length > 0)
                                                                ? dbPages
                                                                : saved ? JSON.parse(saved) : DEFAULT_PAGES_BY_ROLE[staff.role] || [];
                                                            setEditAllowedPages(pages);
                                                            setIsEditDialogOpen(true);
                                                        }}
                                                    >
                                                        <Edit2 className="h-4 w-4" />
                                                    </Button>
                                                    <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => handleDeleteStaff(staff.id)}>
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </ScrollArea>
                    </CardContent>
                </Card>

                <div className="space-y-6">
                    <Card className="bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border-indigo-500/20 shadow-none">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base flex items-center gap-2">
                                <Lock className="h-4 w-4 text-indigo-600" />
                                Security Overviews
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="p-3 bg-white/50 backdrop-blur-sm rounded-lg border">
                                <p className="text-xs text-muted-foreground">Cashier Restriction Level</p>
                                <div className="flex justify-between items-center mt-1">
                                    <span className="text-sm font-semibold">Standard POS Role</span>
                                    <Badge variant="outline" className="text-emerald-600 bg-emerald-50 border-emerald-200">ACTIVE</Badge>
                                </div>
                            </div>
                            <p className="text-[10px] text-muted-foreground">
                                Cashiers are restricted from seeing Reports, Settings, Inventory Costs, and HR Management.
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base flex items-center gap-2">
                                <Calendar className="h-4 w-4" />
                                Next Shifts
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-center py-6 text-xs text-muted-foreground">
                                Shift scheduling integration coming in next update.
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent className="max-h-[90vh] overflow-y-auto" aria-describedby="edit-staff-description">
                    <DialogHeader>
                        <DialogTitle>Edit Staff Member</DialogTitle>
                        <DialogDescription id="edit-staff-description">
                            Update role, allowed pages, and PIN. Changes sync to all devices for this store.
                        </DialogDescription>
                    </DialogHeader>
                    {editingStaff && (
                        <div className="space-y-4 pt-4">
                            <div className="space-y-2">
                                <Label>Full Name</Label>
                                <Input
                                    value={editingStaff.full_name}
                                    onChange={e => setEditingStaff({ ...editingStaff, full_name: e.target.value })}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Role</Label>
                                    <select
                                        className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                                        value={editingStaff.role}
                                        onChange={e => {
                                            const role = e.target.value;
                                            setEditingStaff({ ...editingStaff, role });
                                            setEditAllowedPages(DEFAULT_PAGES_BY_ROLE[role] || []);
                                        }}
                                    >
                                        <option value="cashier">Cashier</option>
                                        <option value="manager">Manager</option>
                                        <option value="admin">Administrator</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Status</Label>
                                    <select
                                        className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                                        value={editingStaff.status}
                                        onChange={e => setEditingStaff({ ...editingStaff, status: e.target.value as "active" | "inactive" })}
                                    >
                                        <option value="active">Active</option>
                                        <option value="inactive">Inactive</option>
                                    </select>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Hourly Rate ({getCurrencySymbol()})</Label>
                                <Input
                                    type="number"
                                    value={editingStaff.hourly_rate || 0}
                                    onChange={e => setEditingStaff({ ...editingStaff, hourly_rate: Number(e.target.value) })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Reset PIN Code</Label>
                                <Input
                                    type="password"
                                    placeholder="Enter new PIN"
                                    value={editingStaff.pin_code || ""}
                                    onChange={e => setEditingStaff({ ...editingStaff, pin_code: e.target.value })}
                                />
                                <p className="text-[10px] text-muted-foreground italic">Admin can reset staff PINs here if forgotten.</p>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-sm font-semibold">Allowed Pages</Label>
                                <div className="grid grid-cols-2 gap-2 p-3 border rounded-lg bg-muted/30">
                                    {ALL_PAGES.map(page => (
                                        <label key={page.id} className="flex items-center gap-2 text-sm cursor-pointer">
                                            <Checkbox
                                                checked={editAllowedPages.includes(page.id)}
                                                onCheckedChange={() => togglePage(page.id, editAllowedPages, setEditAllowedPages)}
                                            />
                                            {page.label}
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <Button onClick={handleUpdateStaff} className="w-full">Update Staff Account</Button>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default StaffManagement;
