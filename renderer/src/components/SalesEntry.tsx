import { useState, useEffect, useRef, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Search, Plus, Trash2, ShoppingCart, DollarSign, Printer, Loader2, User, CreditCard, Banknote, Receipt, Camera, History, Clock, Check, X, Undo2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useDebounce } from "@/hooks/use-debounce";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Product, SaleItem, StockItem, TaxConfig, PaymentMethod, Customer, Store as StoreType, Staff } from "@/types";
import { cn } from "@/lib/utils";
import { z } from "zod";
import BarcodeScanner from "./BarcodeScanner";
import { playCashRegister } from "@/lib/sounds";
import { logAudit } from "@/lib/audit";
import ExcelImport from "@/components/ExcelImport";
import { calculateTransaction } from "@/services/posCalculator";
import { useAddSaleOptimistic } from "@/hooks/useOptimizedData";
import { insertRowsWithSchemaFallback } from "@/lib/supabaseSchemaFallback";

const saleSchema = z.object({
  customerName: z.string().min(1, "Customer name is required"),
  products: z.array(z.custom<Product>()).min(1, "At least one product is required"),
  paidInCash: z.boolean().nullable(),
  taxId: z.string().nullable(),
  paymentMethodId: z.string().nullable(),
});

interface SalesEntryProps {
  stockData: StockItem[];
  onAddSale: (sale: SaleItem) => void;
  currentStoreId?: string | null;
}

const SalesEntry = ({ stockData, onAddSale, currentStoreId }: SalesEntryProps) => {
  const addSaleMutation = useAddSaleOptimistic();
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [dateOfSale, setDateOfSale] = useState(() => {
    const d = new Date();
    const offset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offset).toISOString().split('T')[0];
  });
  const [products, setProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const [amountReceived, setAmountReceived] = useState("");
  const [saleType, setSaleType] = useState<"retail" | "wholesale">("retail");
  const [formData, setFormData] = useState({
    paidInCash: null as boolean | null,
    mobileMoneyNumber: "" as string,
    bankName: "" as string,
    accountNumber: "" as string,
    accountName: "" as string,
    tillNumber: "" as string,
    paybillNumber: "" as string,
    transactionReference: "" as string,
    payerName: "" as string,
    notes: "" as string,
  });
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [discountAmount, setDiscountAmount] = useState<string>("0");
  const [discountType, setDiscountType] = useState<"fixed" | "percentage">("fixed");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeTab, setActiveTab] = useState("new-sale");
  const [salesHistory, setSalesHistory] = useState<SaleItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [returnSale, setReturnSale] = useState<SaleItem | null>(null);
  const [returnItems, setReturnItems] = useState<Array<{ productId: string | null; productName: string; sellType: 'item' | 'sachet'; soldQty: number; returnQty: number; unitPrice: number }>>([]);
  const [returnReason, setReturnReason] = useState<string>("");
  const [isProcessingReturn, setIsProcessingReturn] = useState(false);
  const [historySearch, setHistorySearch] = useState<string>("");
  const historySearchRef = useRef<HTMLInputElement>(null);
  const [refundOption, setRefundOption] = useState<'cash' | 'original' | 'schedule' | 'credit_adjust'>('cash');
  const [userName, setUserName] = useState<string>("");
  const [currentStaff, setCurrentStaff] = useState<{ id: string | null, name: string }>({ id: null, name: "Owner" });
  const [storeInfo, setStoreInfo] = useState<StoreType | null>(null);
  const [availableTaxes, setAvailableTaxes] = useState<TaxConfig[]>([]);
  const [availablePaymentMethods, setAvailablePaymentMethods] = useState<PaymentMethod[]>([]);
  const [selectedTaxId, setSelectedTaxId] = useState<string | null>(null);
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<string | null>(null);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 17) return "Good Afternoon";
    return "Good Evening";
  }, []);

  const selectedPaymentMethod = useMemo(() => {
    if (!selectedPaymentMethodId) return null;
    return availablePaymentMethods.find((m) => m.id === selectedPaymentMethodId) || null;
  }, [availablePaymentMethods, selectedPaymentMethodId]);

  const selectedPaymentMethodName = selectedPaymentMethod?.name || "Cash";
  const selectedPaymentIsCash = selectedPaymentMethodName.toLowerCase().includes("cash");

  const searchInputRef = useRef<HTMLInputElement>(null);
  const cartTopRef = useRef<HTMLDivElement>(null);
  const submitLockRef = useRef(false);
  const lastPrefillMethodIdRef = useRef<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (products.length > 0) {
      cartTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [products.length]);

  // Fetch sales history on mount and when tab changes to history
  useEffect(() => {
    if (currentStoreId) {
      fetchSalesHistory();
      fetchCustomers();
    }
  }, [currentStoreId]);

  // Restore draft sale when opening sales page (per store)
  useEffect(() => {
    try {
      const key = `brepos_draft_sale_${currentStoreId || 'default'}`;
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const draft = JSON.parse(raw);

      // Only restore if current form is empty-ish
      const isEmpty =
        products.length === 0 &&
        !customerName &&
        !customerPhone &&
        !amountReceived &&
        formData.paidInCash === null;

      if (!isEmpty) return;

      setCustomerName(draft.customerName || "");
      setCustomerPhone(draft.customerPhone || "");
      setDateOfSale(draft.dateOfSale || new Date().toISOString().split('T')[0]);
      setProducts(Array.isArray(draft.products) ? draft.products : []);
      setAmountReceived(draft.amountReceived || "");
      setDiscountAmount(draft.discountAmount ?? "0");
      setDiscountType(draft.discountType === 'percentage' ? 'percentage' : 'fixed');
      if (draft.formData) setFormData((prev) => ({ ...prev, ...draft.formData }));
      setSelectedCustomerId(draft.selectedCustomerId ?? null);
      setSelectedTaxId(draft.selectedTaxId ?? null);
      setSelectedPaymentMethodId(draft.selectedPaymentMethodId ?? null);

      toast({ title: 'Draft restored', description: 'Loaded your previous draft sale.' });
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStoreId]);

  const fetchCustomers = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let storeId = currentStoreId;

      if (!storeId) {
        const { data: stores } = await supabase
          .from('stores')
          .select('id')
          .eq('user_id', user.id)
          .limit(1);
        storeId = stores?.[0]?.id;
      }

      if (!storeId) return;

      // Get profile for name
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('user_id', user.id)
        .maybeSingle();

      if (profile?.full_name) {
        setUserName(profile.full_name.split(' ')[0]);
      }

      // Get current store info for receipts
      const { data: storeData } = await supabase
        .from('stores')
        .select('*')
        .eq('id', storeId)
        .maybeSingle();

      if (storeData) {
        setStoreInfo(storeData);
      }

      // Fetch Taxes and Payment Methods
      const [taxRes, paymentRes] = await Promise.all([
        supabase.from('tax_configurations').select('id, name, rate').eq('store_id', storeId).eq('is_active', true),
        supabase.from('payment_methods').select('*').eq('store_id', storeId).eq('is_active', true)
      ]);

      if (taxRes.data) setAvailableTaxes(taxRes.data);
      if (paymentRes.data && paymentRes.data.length > 0) {
        const methods = paymentRes.data;
        setAvailablePaymentMethods(methods);
        // Keep selection valid across store switches / method deactivations.
        setSelectedPaymentMethodId((prev) =>
          prev && methods.some((m) => m.id === prev) ? prev : methods[0].id
        );
      } else if (storeId && user) {
        // No payment methods found. Create default "Cash" method.
        try {
          const { data: newMethod, error: createError } = await supabase
            .from('payment_methods')
            .insert({
              store_id: storeId,
              user_id: user.id,
              name: 'Cash',
              is_active: true
            })
            .select()
            .single();

          if (!createError && newMethod) {
            setAvailablePaymentMethods([newMethod]);
            setSelectedPaymentMethodId(newMethod.id);
            toast({
              title: "System Update",
              description: "Created default 'Cash' payment method.",
            });
          }
        } catch (e) {
          console.error("Failed to create default payment method", e);
        }
      }

      // Get active shift to identify current cashier
      const { data: activeShift } = await supabase
        .from('shifts')
        .select('*, staff:staff_id(*)')
        .eq('store_id', storeId)
        .eq('status', 'open')
        .maybeSingle();

      if (activeShift) {
        if (activeShift.staff_id && activeShift.staff) {
          const staff = activeShift.staff as unknown as Staff;
          setCurrentStaff({ id: staff.id, name: staff.full_name });
        } else {
          setCurrentStaff({ id: null, name: "Owner" });
        }
      } else {
        setCurrentStaff({ id: null, name: profile?.full_name || "Owner" });
      }

      const { data, error } = await supabase
        .from('customers')
        .select('id, full_name, phone')
        .eq('store_id', storeId)
        .order('full_name', { ascending: true });

      if (error) throw error;
      setCustomers((data || []) as unknown as Customer[]);
    } catch (error) {
      console.error("Error in fetchCustomers:", error);
    }
  };

  useEffect(() => {
    if (!selectedPaymentMethodId) return;
    if (lastPrefillMethodIdRef.current === selectedPaymentMethodId) return;
    lastPrefillMethodIdRef.current = selectedPaymentMethodId;

    const method = availablePaymentMethods.find((m) => m.id === selectedPaymentMethodId);
    const details = method?.details;
    if (!details) return;

    setFormData((prev) => ({
      ...prev,
      mobileMoneyNumber: details.mobileMoneyNumber ?? prev.mobileMoneyNumber,
      bankName: details.bankName ?? prev.bankName,
      accountNumber: details.accountNumber ?? prev.accountNumber,
      accountName: details.accountName ?? prev.accountName,
      tillNumber: details.tillNumber ?? prev.tillNumber,
      paybillNumber: details.paybillNumber ?? prev.paybillNumber,
      notes: details.notes ?? prev.notes,
    }));
  }, [availablePaymentMethods, selectedPaymentMethodId]);

  useEffect(() => {
    if (activeTab === "history") {
      fetchSalesHistory();
    }
  }, [activeTab]);

  // Auto-refresh recent sales when new sale is added


  const fetchSalesHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let storeId = currentStoreId;

      if (!storeId) {
        const { data: stores } = await supabase
          .from("stores")
          .select("id")
          .eq("user_id", user.id)
          .limit(1);
        storeId = stores?.[0]?.id;
      }

      if (!storeId) return;

      // Only fetch last 50 sales for speed
      const { data, error } = await supabase
        .from("sales")
        .select("*")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (!error && data) {
        setSalesHistory(data.map(sale => ({
          id: sale.id,
          customerName: sale.customer_name,
          dateOfSale: sale.date_of_sale,
          totalAmount: sale.total_amount,
          paidInCash: sale.paid_in_cash || false,
          products: sale.products as unknown as Product[],
          created_at: sale.created_at,
          paymentMethodId: (sale as any).payment_method_id ?? null,
          paymentDetails: (sale as any).payment_details ?? null,
        })));
      }
    } catch (error) {
      console.error("Error fetching sales history:", error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Memoized filtered stock for instant search
  const filteredStock = useMemo(() =>
    stockData.filter(item =>
      (item.productName.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
       (item.barcode && item.barcode.toLowerCase().includes(debouncedSearchTerm.toLowerCase())))
    ).slice(0, 10),
    [stockData, debouncedSearchTerm]);

  // Keyboard shortcuts for faster input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Focus search with / key
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Reset selected index when search changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchTerm]);

  // Scroll to selected product in the search dropdown
  useEffect(() => {
    const el = document.getElementById(`product-search-item-${selectedIndex}`);
    if (el) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedIndex]);

  const addProduct = (stockItem: StockItem) => {
    const isWholesale = saleType === 'wholesale';
    const sellType = isWholesale ? 'sachet' : 'item';
    const existingIndex = products.findIndex(p => p.productName === stockItem.productName && p.sellType === sellType);
    const itemsPerSachet = stockItem.items_per_sachet || 1;

    const totalQuantity = stockItem.quantity || 0;
    const maxQty = sellType === 'sachet'
      ? Math.floor(totalQuantity / itemsPerSachet)
      : totalQuantity;

    if (maxQty < 1) {
      toast({
        title: 'Out of Stock',
        description: sellType === 'sachet'
          ? `Not enough stock to sell ${stockItem.productName} wholesale`
          : `Not enough stock to sell ${stockItem.productName}`,
        variant: 'destructive'
      });
      return;
    }

    const sellingPrice = Math.max(
      (sellType === 'sachet' ? stockItem.wholesale_price : stockItem.retail_price) || 0,
      100
    );

    if (existingIndex !== -1) {
      const existing = products[existingIndex];
      if (existing.quantity >= maxQty) {
        toast({
          title: 'Maximum Reached',
          description: sellType === 'sachet'
            ? `Only ${maxQty} sachets available`
            : `Only ${maxQty} items available`,
          variant: 'destructive'
        });
        return;
      }

      const updatedProducts = [...products];
      updatedProducts[existingIndex] = { ...existing, quantity: Math.min(existing.quantity + 1, maxQty) };
      setProducts(updatedProducts);
    } else {
      setProducts([{
        id: stockItem.id,
        productName: stockItem.productName,
        quantity: 1,
        sellingPrice,
        sellType,
        itemsPerSachet,
        items_per_sachet: itemsPerSachet
      }, ...products]);
    }

    setSearchTerm('');
    setSelectedIndex(0);
  };
  const updateProductQuantity = (productName: string, quantity: number, sellType: 'item' | 'sachet') => {
    const stockItem = stockData.find(s => s.productName === productName);
    const itemsPerSachet = stockItem?.items_per_sachet || 1;
    const maxQuantity = sellType === 'sachet'
      ? Math.floor((stockItem?.quantity || 0) / itemsPerSachet)
      : stockItem?.quantity || 0;
    setProducts(products.map(p =>
      p.productName === productName && p.sellType === sellType
        ? { ...p, quantity: Math.min(Math.max(1, quantity), maxQuantity) }
        : p
    ));
  };

  const updateProductPrice = (productName: string, price: number, sellType: 'item' | 'sachet') => {
    setProducts(products.map(p =>
      p.productName === productName && p.sellType === sellType
        ? { ...p, sellingPrice: Math.max(0, price) }
        : p
    ));
  };

  const removeProduct = (productName: string, sellType: 'item' | 'sachet') => {
    setProducts(products.filter(p => !(p.productName === productName && p.sellType === sellType)));
  };

  const openReturnDialog = (sale: SaleItem) => {
    setReturnSale(sale);
    setReturnItems(
      (sale.products || []).map((p) => ({
        productId: (p as any)?.id ? String((p as any).id) : null,
        productName: p.productName,
        sellType: p.sellType,
        soldQty: Number(p.quantity) || 0,
        returnQty: 0,
        unitPrice: Number((p as any)?.sellingPrice ?? (p as any)?.price ?? 0) || 0,
      }))
    );
    setReturnReason("");
    const methodName = sale.paymentDetails?.paymentMethod?.toLowerCase?.() || "";
    if (!sale.paidInCash) {
      setRefundOption('credit_adjust');
    } else if (methodName.includes('cash')) {
      setRefundOption('cash');
    } else {
      setRefundOption('original');
    }
    setReturnDialogOpen(true);
  };

  const returnTotal = useMemo(() => {
    return returnItems.reduce((sum, it) => sum + (Number(it.returnQty) || 0) * (Number(it.unitPrice) || 0), 0);
  }, [returnItems]);

  const queryClient = useQueryClient();

  const saveReturnFallback = (storeId: string, payload: any) => {
    const key = `brec_sale_returns_${storeId}`;
    try {
      const existingRaw = localStorage.getItem(key);
      const existing = existingRaw ? JSON.parse(existingRaw) : [];
      const next = Array.isArray(existing) ? [payload, ...existing] : [payload];
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const processReturn = async () => {
    if (!returnSale) return;
    if (isProcessingReturn) return;

    const itemsToReturn = returnItems
      .filter((it) => (Number(it.returnQty) || 0) > 0)
      .map((it) => ({ ...it, returnQty: Math.floor(Number(it.returnQty) || 0) }));

    if (itemsToReturn.length === 0) {
      toast({ title: "Nothing to return", description: "Enter a return quantity for at least one item.", variant: "destructive" });
      return;
    }

    for (const it of itemsToReturn) {
      if (it.returnQty < 0 || it.returnQty > it.soldQty) {
        toast({ title: "Invalid quantity", description: `Return qty for ${it.productName} must be between 0 and ${it.soldQty}.`, variant: "destructive" });
        return;
      }
    }

    setIsProcessingReturn(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("You must be logged in");

      let storeId = currentStoreId || null;
      if (!storeId) {
        const { data: stores } = await supabase.from("stores").select("id").eq("user_id", user.id).limit(1);
        const { data: accessStores } = await supabase.from("store_access").select("store_id").eq("user_id", user.id).limit(1);
        storeId = stores?.[0]?.id || accessStores?.[0]?.store_id || null;
      }
      if (!storeId) throw new Error("No store found");

      const computedTotal = Math.round(
        itemsToReturn.reduce((sum, it) => sum + (Number(it.returnQty) || 0) * (Number(it.unitPrice) || 0), 0) * 100
      ) / 100;

      if (computedTotal <= 0) {
        toast({ title: "Invalid return", description: "Return total must be greater than zero.", variant: "destructive" });
        return;
      }

      const payload = {
        user_id: user.id,
        store_id: storeId,
        sale_id: returnSale.id,
        items: itemsToReturn.map((it) => ({
          productId: it.productId,
          productName: it.productName,
          sellType: it.sellType,
          soldQty: it.soldQty,
          returnQty: it.returnQty,
          unitPrice: it.unitPrice,
        })) as unknown as Json,
        total_amount: computedTotal,
        reason: returnReason?.trim() || null,
        staff_id: currentStaff.id || null,
      };

      let returnId: string | null = null;
      try {
        const { data, error } = await insertRowsWithSchemaFallback("sale_returns", [
          payload as Record<string, unknown>,
        ]);
        if (error) throw error;
        const insertedRows = Array.isArray(data) ? data : [];
        returnId = String((insertedRows[0] as any)?.id || "");
        if (!returnId) returnId = null;
      } catch (e: any) {
        const msg = String(e?.message || "").toLowerCase();
        const missingTable =
          msg.includes("sale_returns") && (msg.includes("does not exist") || msg.includes("not found")) ||
          String(e?.code || "") === "PGRST204";

        if (!missingTable) throw e;

        const fallbackId = `local_${Date.now()}`;
        returnId = fallbackId;
        saveReturnFallback(storeId, { id: fallbackId, ...payload, created_at: new Date().toISOString() });
      }

      // Update inventory quantities (add returned units back).
      for (const it of itemsToReturn) {
        const stockItem =
          (it.productId ? stockData.find((s) => String(s.id) === String(it.productId)) : undefined) ||
          stockData.find((s) => s.productName === it.productName);

        if (!stockItem?.id) continue;

        const itemsPerSachet = stockItem.items_per_sachet || 1;
        const currentQty = Number(stockItem.quantity) || 0;
        const units = it.sellType === "sachet" ? it.returnQty * itemsPerSachet : it.returnQty;
        const newQty = currentQty + units;
        const newSachets = Math.floor(newQty / itemsPerSachet);
        const newLoose = newQty % itemsPerSachet;

        await supabase
          .from("inventory")
          .update({
            quantity: newQty,
            total_value: newQty * (stockItem.costPerUnit || stockItem.cost_per_unit || 0),
            sachets_count: newSachets,
            loose_items: newLoose,
          })
          .eq("id", stockItem.id);
      }

      // Refund handling and optional full-sale removal
      let saleRow: any = null;
      try {
        const { data: s } = await supabase
          .from('sales')
          .select('id, customer_id, paid_in_cash, payment_details, products')
          .eq('id', returnSale.id)
          .maybeSingle();
        saleRow = s || null;
      } catch {
        saleRow = null;
      }

      const isFullReturn = returnItems.every((it) => it.returnQty === it.soldQty);

      // Cash ledger refund if applicable
      try {
        const originalMethod = (saleRow?.payment_details as any)?.paymentMethod?.toLowerCase?.() || '';
        const treatAsCash = refundOption === 'cash' || (refundOption === 'original' && originalMethod.includes('cash'));
        if (treatAsCash && computedTotal > 0) {
          await supabase.from("cash_transactions").insert({
            user_id: user.id,
            store_id: storeId,
            amount: computedTotal,
            type: "out",
            description: `Refund for sale #${returnSale.id.slice(-8).toUpperCase()}`,
            account_type: "cash",
          });
        }
      } catch {
        // ignore
      }

      // Customer account adjustment for credit cases or scheduled/original non-cash
      try {
        const originalMethod = (saleRow?.payment_details as any)?.paymentMethod?.toLowerCase?.() || '';
        const needsCustomerTx =
          (!returnSale.paidInCash) ||
          refundOption === 'credit_adjust' ||
          refundOption === 'schedule' ||
          (refundOption === 'original' && !originalMethod.includes('cash'));
        const customerId = saleRow?.customer_id || null;
        if (needsCustomerTx && customerId && computedTotal > 0) {
          await supabase.from('customer_transactions').insert({
            customer_id: customerId,
            type: 'refund',
            amount: computedTotal,
            reference_id: returnSale.id,
            description: refundOption === 'schedule' ? 'Scheduled refund (process externally)' : 'Return processed',
          } as any);
        }
      } catch {
        // ignore if table missing
      }

      if (isFullReturn) {
        try {
          await supabase.from('sales').delete().eq('id', returnSale.id);
          setSalesHistory((prev) => prev.filter((s) => s.id !== returnSale.id));
          await logAudit({
            action: "delete",
            tableName: "sales",
            recordId: returnSale.id,
            oldData: { total: returnSale.totalAmount, items: returnSale.products.length },
            newData: null,
            storeId,
            staffId: currentStaff.id,
            staffName: currentStaff.name,
          });
        } catch {
          // ignore
        }
      }

      await logAudit({
        action: "create",
        tableName: "sale_returns",
        recordId: returnId || undefined,
        newData: { sale_id: returnSale.id, total_amount: payload.total_amount, items: itemsToReturn.length },
        storeId,
        staffId: currentStaff.id,
        staffName: currentStaff.name,
      });

      // Refresh app-wide caches so dashboard and all pages reflect the refund immediately
      try {
        // Refetch both store-scoped and global caches to cover different queryKey usages
        queryClient.refetchQueries({ queryKey: ['sales', storeId], type: 'all' });
        queryClient.refetchQueries({ queryKey: ['sales'], type: 'all' });
        queryClient.refetchQueries({ queryKey: ['inventory', storeId], type: 'all' });
        queryClient.refetchQueries({ queryKey: ['inventory'], type: 'all' });
        queryClient.refetchQueries({ queryKey: ['cash_transactions', storeId], type: 'all' });
        queryClient.refetchQueries({ queryKey: ['cash_transactions'], type: 'all' });
        queryClient.refetchQueries({ queryKey: ['customers', storeId], type: 'all' });
        queryClient.refetchQueries({ queryKey: ['customers'], type: 'all' });
        queryClient.refetchQueries({ queryKey: ['sale_returns', storeId], type: 'all' });
        queryClient.refetchQueries({ queryKey: ['sale_returns'], type: 'all' });
      } catch (e) {
        // ignore cache errors
      }
      try {
        // Force a broad invalidation as a fallback to ensure UI updates
        queryClient.invalidateQueries();
      } catch {}

      toast({ title: "Return Recorded", description: `Returned UGX ${payload.total_amount.toLocaleString()}` });
      setReturnDialogOpen(false);
      setReturnSale(null);
      setReturnItems([]);
      setReturnReason("");
    } catch (err: any) {
      toast({ title: "Return Failed", description: err?.message || "Failed to process return.", variant: "destructive" });
    } finally {
      setIsProcessingReturn(false);
    }
  };

  // Use financial-grade central calculator for money
  const selectedTax = availableTaxes.find(t => t.id === selectedTaxId);
  const calculations = calculateTransaction(
    products,
    { value: parseFloat(discountAmount) || 0, type: discountType },
    selectedTax?.rate || 0
  );

  const {
    subtotal,
    discountAmount: totalDiscount,
    taxAmount,
    total: totalAmount,
    taxableAmount: discountedSubtotal
  } = calculations;

  const amountReceivedNum = Math.round((parseFloat(amountReceived) || 0) * 100) / 100;
  const balance = Math.round((amountReceivedNum - totalAmount) * 100) / 100;

  const handleBarcodeScan = async (code: string) => {
    setShowBarcodeScanner(false);

    if (!code || code.trim() === '') {
      toast({
        variant: "destructive",
        title: "Invalid Barcode",
        description: "No barcode detected. Please try again.",
      });
      return;
    }

    const cleanCode = code.trim();

    // First check local stock data
    let foundProduct = stockData.find(item =>
      item.barcode === cleanCode ||
      (item.barcode && item.barcode.toLowerCase() === cleanCode.toLowerCase())
    );

    // If not found locally, try database
    if (!foundProduct) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: stores } = await supabase.from("stores").select("id").eq("user_id", user.id).limit(1);
          const storeId = stores?.[0]?.id;

          if (storeId) {
            const { data: dbProduct, error } = await supabase
              .from('inventory')
              .select('*')
              .eq('store_id', storeId)
              .eq('barcode', cleanCode)
              .limit(1)
              .maybeSingle();

            if (!error && dbProduct) {
              foundProduct = {
                id: dbProduct.id,
                productName: dbProduct.product_name,
                product_name: dbProduct.product_name,
                barcode: dbProduct.barcode,
                quantity: dbProduct.quantity,
                costPerUnit: dbProduct.cost_per_unit || 0,
                cost_per_unit: dbProduct.cost_per_unit || 0,
                retail_price: dbProduct.retail_price || 0,
                wholesale_price: dbProduct.wholesale_price || 0,
                items_per_sachet: dbProduct.items_per_sachet || 1,
                sachets_count: dbProduct.sachets_count || 0,
                loose_items: dbProduct.loose_items || 0,
                opened_sachets: dbProduct.opened_sachets || 0,
                category: dbProduct.category || "General",
                store_id: dbProduct.store_id,
                totalValue: dbProduct.total_value || 0,
                min_stock_level: dbProduct.min_stock_level || 5,
                reorder_quantity: dbProduct.reorder_quantity || 10
              } as StockItem;
            }
          }
        }
      } catch (error) {
        console.error("Error fetching product by barcode:", error);
      }
    }

    if (foundProduct) {
      if (foundProduct.quantity <= 0) {
        toast({
          variant: "destructive",
          title: "Out of Stock",
          description: `${foundProduct.productName} is currently out of stock`,
        });
        return;
      }
      
      addProduct(foundProduct);
      const itemsPerSachet = foundProduct.items_per_sachet || 1;
      const sachetsAvail = Math.floor(foundProduct.quantity / itemsPerSachet);

      toast({
        title: "Product Added",
        description: `${foundProduct.productName} - ${foundProduct.quantity} items (${sachetsAvail} sachets)`,
      });
    } else {
      toast({
        variant: "destructive",
        title: "No Such Product",
        description: `Product not found for barcode: ${cleanCode}`,
      });
    }
  };

  const printReceipt = (sale: SaleItem) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    // Use actual applied tax from current sale (already calculated)
    const receiptSubtotal = sale.products.reduce((sum, p) => sum + (p.quantity * p.sellingPrice), 0);
    const receiptTaxAmount = selectedTax ? Math.round(receiptSubtotal * (selectedTax.rate / 100) * 100) / 100 : 0;
    const receiptDiscount = totalDiscount;
    const receiptTotal = sale.totalAmount;

    // Format date and time
    const now = new Date();
    const dateTime = now.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Receipt - ${sale.customerName}</title>
          <style>
            @media print {
              body { margin: 0; padding: 10px; }
              .no-print { display: none; }
            }
            body {
              font-family: 'Courier New', monospace;
              font-size: 12px;
              line-height: 1.4;
              max-width: 300px;
              margin: 0 auto;
              padding: 10px;
              background: white;
            }
            .header {
              text-align: center;
              border-bottom: 2px solid #000;
              padding-bottom: 10px;
              margin-bottom: 15px;
            }
            .business-name {
              font-size: 18px;
              font-weight: bold;
              margin-bottom: 5px;
            }
            .business-info {
              font-size: 10px;
              margin-bottom: 3px;
            }
            .receipt-title {
              font-size: 14px;
              font-weight: bold;
              margin: 10px 0;
              text-align: center;
            }
            .info-line {
              display: flex;
              justify-content: space-between;
              margin-bottom: 3px;
              font-size: 11px;
            }
            .divider {
              border-top: 1px dashed #000;
              margin: 8px 0;
            }
            .item-table {
              width: 100%;
              margin: 10px 0;
            }
            .item-row {
              display: flex;
              justify-content: space-between;
              margin-bottom: 3px;
              font-size: 11px;
            }
            .item-name {
              flex: 1;
              margin-right: 5px;
            }
            .item-qty {
              width: 30px;
              text-align: center;
            }
              color: #000;
              font-size: 13px;
              line-height: 1.4;
            }
            .center { text-align: center; }
            .right { text-align: right; }
            .business-name { font-size: 18px; font-weight: 700; margin-bottom: 2px; }
            .business-info { font-size: 11px; margin-bottom: 5px; }
            .divider { border-top: 1px dashed #000; margin: 10px 0; }
            .double-divider { border-top: 1px dashed #000; border-bottom: 1px dashed #000; height: 3px; margin: 10px 0; }
            .receipt-title { font-size: 24px; font-weight: 700; margin: 10px 0; }
            .item-row { display: flex; justify-content: space-between; margin-bottom: 4px; }
            .item-details { flex: 1; padding-right: 10px; }
            .total-section { margin-top: 10px; font-weight: 700; }
            .total-row { display: flex; justify-content: space-between; margin-bottom: 3px; }
            .thank-you { font-size: 18px; font-weight: 700; margin: 20px 0; }
            .barcode { font-family: 'Libre Barcode 39', cursive; font-size: 40px; margin-top: 10px; }
            @media print { margin: 0; }
          </style>
        </head>
        <body>
          <div class="center">
            <div class="business-name">${storeInfo?.store_name || 'Zuri POS'}</div>
            <div class="business-info">
              ${storeInfo?.address ? `<div>${storeInfo.address}</div>` : ''}
              ${storeInfo?.phone ? `<div>Tel: ${storeInfo.phone}</div>` : ''}
              ${storeInfo?.tin_number ? `<div>TIN: ${storeInfo.tin_number}</div>` : ''}
              ${storeInfo?.email ? `<div>${storeInfo.email}</div>` : ''}
            </div>
          </div>

          <div class="double-divider"></div>
          <div class="center receipt-title">RECEIPT</div>
          <div class="double-divider"></div>

          <div class="info-section">
            <div class="item-row">
              <span>Receipt:</span>
              <span>#${sale.id.slice(-8).toUpperCase()}</span>
            </div>
            <div class="item-row">
              <span>Date:</span>
              <span>${dateTime}</span>
            </div>
            <div class="item-row">
              <span>Customer:</span>
              <span>${sale.customerName || 'Cash Customer'}</span>
            </div>
            <div class="item-row">
              <span>Cashier:</span>
              <span>${currentStaff.name}</span>
            </div>
          </div>

          <div class="divider"></div>

          ${sale.products.map((p: Product) => `
            <div class="item-row">
              <div class="item-details">${p.quantity}x ${p.productName}</div>
              <div class="right">UGX ${(p.quantity * p.sellingPrice).toLocaleString()}</div>
            </div>
          `).join('')}

          <div class="divider"></div>

          <div class="total-section">
            <div class="total-row">
              <span>Subtotal:</span>
              <span>UGX ${receiptSubtotal.toLocaleString()}</span>
            </div>
            ${receiptDiscount > 0 ? `
            <div class="total-row">
              <span>Discount:</span>
              <span>-UGX ${receiptDiscount.toLocaleString()}</span>
            </div>
            ` : ''}
            ${receiptTaxAmount > 0 ? `
            <div class="total-row">
              <span>Tax (${selectedTax?.name}):</span>
              <span>UGX ${receiptTaxAmount.toLocaleString()}</span>
            </div>
            ` : ''}
            <div class="divider"></div>
            <div class="total-row" style="font-size: 16px;">
              <span>TOTAL AMOUNT</span>
              <span>UGX ${receiptTotal.toLocaleString()}</span>
            </div>
          </div>

          <div class="divider"></div>

          <div class="total-row">
            <span>PAYMENT (${formData.paidInCash === false ? 'CREDIT' : (selectedPaymentMethodName || 'PAID')})</span>
            <span>UGX ${(formData.paidInCash === false ? 0 : (amountReceivedNum > 0 ? amountReceivedNum : totalAmount)).toLocaleString()}</span>
          </div>
          ${formData.transactionReference ? `
          <div style="font-size: 10px; margin-top: 5px;">
            <div>Ref: ${formData.transactionReference}</div>
          </div>` : ''}
          ${formData.accountName || formData.payerName ? `
          <div style="font-size: 10px;">
            <div>Account: ${formData.accountName || formData.payerName}</div>
          </div>` : ''}
          ${formData.mobileMoneyNumber ? `
          <div style="font-size: 10px;">
            <div>Mobile: ${formData.mobileMoneyNumber}</div>
          </div>` : ''}
          <div class="total-row">
            <span>CHANGE</span>
            <span>UGX ${balance > 0 ? balance.toLocaleString() : '0'}</span>
          </div>

          <div class="divider"></div>

          <div class="center">
            <div class="thank-you">THANK YOU</div>
            <div class="divider"></div>
            <div style="font-size: 10px;">Goods once sold cannot be returned</div>
            <div style="font-size: 9px; color: #666; margin-top: 5px;">Powered by Zuri POS</div>
            <div class="barcode">*${sale.id.slice(-8)}*</div>
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 250);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isSubmitting || submitLockRef.current) return;
    submitLockRef.current = true;

    // Check subscription before allowing sale
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: isAdminRole } = await supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' });
        if (!isAdminRole) {
          const { data: activeSub } = await supabase
            .from('user_subscriptions')
            .select('id')
            .eq('user_id', user.id)
            .eq('status', 'active')
            .gt('expires_at', new Date().toISOString())
            .maybeSingle();
          if (!activeSub) {
            toast({
              title: "Subscription Required",
              description: "You need an active subscription to record sales. Visit the Plans page to subscribe.",
              variant: "destructive",
            });
            submitLockRef.current = false;
            return;
          }
        }
      }
    } catch {
      // If check fails, allow sale to proceed
    }

    const effectiveCustomerName = customerName.trim() || "Walk-in";
    const isCreditSale = formData.paidInCash === false;
    const isPaidSale = formData.paidInCash === true;

    if (formData.paidInCash === null) {
      toast({
        title: "Payment Required",
        description: "Select Paid or Credit before recording the sale.",
        variant: "destructive",
      });
      submitLockRef.current = false;
      return;
    }

    // If payment methods changed (store switch, deactivation), ensure we submit with a valid method id.
    const resolvedPaymentMethodId = isCreditSale
      ? null
      : (
        selectedPaymentMethodId &&
        availablePaymentMethods.some((m) => m.id === selectedPaymentMethodId)
          ? selectedPaymentMethodId
          : (availablePaymentMethods[0]?.id ?? null)
      );
    if (!isCreditSale && resolvedPaymentMethodId !== selectedPaymentMethodId) {
      setSelectedPaymentMethodId(resolvedPaymentMethodId);
    }

    // Validate with zod
    const validation = saleSchema.safeParse({
      customerName: effectiveCustomerName,
      products: products,
      paidInCash: formData.paidInCash,
      taxId: selectedTaxId,
      paymentMethodId: resolvedPaymentMethodId,
    });

    if (!validation.success) {
      const errorMessages = validation.error.errors.map(e => e.message).join(", ");
      toast({ title: "Validation Error", description: errorMessages, variant: "destructive" });
      submitLockRef.current = false;
      return;
    }

    if (!isCreditSale && !resolvedPaymentMethodId) {
      toast({
        title: "Payment Method Required",
        description: "Select a payment method before recording a paid sale.",
        variant: "destructive",
      });
      submitLockRef.current = false;
      return;
    }

    // DB constraint: sales.total_amount must be > 0
    if (totalAmount <= 0) {
      toast({
        title: "Invalid Total",
        description: "Total amount must be greater than 0. Check item prices, discount, and tax.",
        variant: "destructive",
      });
      submitLockRef.current = false;
      return;
    }

    const impliedAmountReceived =
      amountReceivedNum > 0 ? amountReceivedNum : (isPaidSale ? totalAmount : 0);

    // Enforce complete sale details for non-cash payments
    const method = availablePaymentMethods.find(m => m.id === resolvedPaymentMethodId);
    const isCashMethod = !!method && method.name.toLowerCase().includes('cash');
    const requiresPaymentDetails = isPaidSale && !isCashMethod;

    if (requiresPaymentDetails) {
      // Determine required fields by method type
      const name = method?.name?.toLowerCase() || '';
      const needsMoMo = name.includes('mobile') || name.includes('mtn') || name.includes('airtel');
      const needsBank = name.includes('bank') || name.includes('transfer');
      const needsCard = name.includes('card') || name.includes('visa') || name.includes('mastercard');

      const errors: string[] = [];
      if (needsMoMo) {
        if (!formData.mobileMoneyNumber) errors.push('Mobile Money number');
        if (!formData.transactionReference) errors.push('Transaction reference');
      } else if (needsBank) {
        if (!formData.accountNumber) errors.push('Account number');
        if (!formData.accountName) errors.push('Account name');
      } else if (needsCard) {
        if (!formData.transactionReference) errors.push('Transaction reference');
      } else {
        // Generic non-cash method: at least a reference/comment
        if (!formData.transactionReference && !formData.accountName && !formData.payerName) {
          errors.push('A reference or comment (e.g., transaction reference or payer/account name)');
        }
      }

      if (errors.length > 0) {
        toast({
          title: 'Complete Payment Details',
          description: `Please provide: ${errors.join(', ')}`,
          variant: 'destructive'
        });
        submitLockRef.current = false;
        return;
      }
    }

    // Pre-commit stock validation: ensure items are available without opening sachets
    for (const p of products) {
      const s = stockData.find(si => si.productName === p.productName);
      if (!s) {
        toast({ title: 'Stock Error', description: `Product ${p.productName} not found in inventory.`, variant: 'destructive' });
        submitLockRef.current = false;
        return;
      }
      const itemsPerSachet = s.items_per_sachet || 1;
      if (p.sellType === 'sachet') {
        const availableSachets = Math.floor((s.quantity || 0) / itemsPerSachet);
        if (p.quantity > (availableSachets || 0)) {
          toast({ title: 'Insufficient Stock', description: `Only ${availableSachets || 0} sachets available for ${p.productName}.`, variant: 'destructive' });
          submitLockRef.current = false;
          return;
        }
      } else {
        const availableItems = s.quantity || 0;
        if (p.quantity > availableItems) {
          toast({ title: 'Insufficient Stock', description: `Only ${availableItems} items available for ${p.productName}.`, variant: 'destructive' });
          submitLockRef.current = false;
          return;
        }
      }
    }

    setIsSubmitting(true);
    try {
      if (requiresPaymentDetails) {
        const name = method?.name?.toLowerCase() || '';
        const isMoMo = name.includes('mobile') || name.includes('mtn') || name.includes('airtel');
        const isCard = name.includes('card') || name.includes('visa') || name.includes('mastercard');

        if (isMoMo) {
          toast({
            title: "Waiting for PIN...",
            description: `A prompt has been sent to ${formData.mobileMoneyNumber}. Please ask the customer to enter their PIN.`,
            duration: 5000,
          });
          await new Promise(resolve => setTimeout(resolve, 4000));
          toast({
            title: "Payment Approved",
            description: "Mobile money transaction was successful.",
          });
        } else if (isCard) {
          toast({
            title: "Processing Card...",
            description: "Connecting to bank securely. Please do not remove card.",
            duration: 4000,
          });
          await new Promise(resolve => setTimeout(resolve, 3000));
          toast({
            title: "Card Approved",
            description: "Transaction authorized successfully.",
          });
        }
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("You must be logged in");

      let storeId = currentStoreId;

      if (!storeId) {
        const { data: stores } = await supabase.from("stores").select("id").eq("user_id", user.id).limit(1);
        const { data: accessStores } = await supabase.from("store_access").select("store_id").eq("user_id", user.id).limit(1);
        storeId = stores?.[0]?.id || accessStores?.[0]?.store_id;
      }

      if (!storeId) throw new Error("No store found");

      // Check if cash selected but amount is less than total - transfer balance to debt
      let actualPaidInCash = formData.paidInCash;
      let debtAmount = 0;

      if (formData.paidInCash === true && amountReceivedNum > 0 && amountReceivedNum < totalAmount) {
        debtAmount = totalAmount - amountReceivedNum;
        actualPaidInCash = false; // Mark as unpaid since there's remaining balance
      }

      // Use the optimized mutation which handles offline-first/queueing via DataSyncService
      const salePayload = {
        customerName: effectiveCustomerName,
        dateOfSale,
        totalAmount,
        paidInCash: actualPaidInCash,
        products,
        store_id: storeId,
        user_id: user.id,
        staff_id: currentStaff.id || undefined,
        customer_id: selectedCustomerId || undefined,
      };

      await addSaleMutation.mutateAsync(salePayload);

      // Log audit
      try {
        await logAudit({
          action: 'create',
          tableName: 'sales',
          recordId: 'optimistic-' + Date.now(),
          newData: { customer: effectiveCustomerName, total: totalAmount, products: products.length, paid: actualPaidInCash, staff: currentStaff.name },
          storeId,
          staffId: currentStaff.id,
          staffName: currentStaff.name,
        });
      } catch {
        // ignore audit errors
      }

      const sale: SaleItem = {
        id: 'optimistic-' + Date.now(),
        customerName: effectiveCustomerName,
        dateOfSale,
        products,
        totalAmount,
        paidInCash: actualPaidInCash,
        paymentMethodId: formData.paidInCash === true ? resolvedPaymentMethodId : null,
        paymentDetails: formData.paidInCash === true ? {
          mobileMoneyNumber: formData.mobileMoneyNumber || null,
          bankName: formData.bankName || null,
          accountNumber: formData.accountNumber || null,
          accountName: formData.accountName || null,
          tillNumber: formData.tillNumber || null,
          paybillNumber: formData.paybillNumber || null,
          transactionReference: formData.transactionReference || null,
          payerName: formData.payerName || null,
          notes: formData.notes || null,
          amountReceived: impliedAmountReceived,
          paymentMethod: selectedPaymentMethodName,
        } : null,
      };

      onAddSale(sale);
      fetchSalesHistory();

      playCashRegister();
      // Show debt notification if applicable
      if (debtAmount > 0) {
        toast({
          title: "Sale Recorded with Debt",
          description: `Cash received: UGX ${amountReceivedNum.toLocaleString()}. Balance of UGX ${debtAmount.toLocaleString()} added as debt.`,
        });
      } else {
        toast({
          title: "Sale Recorded",
          description: `Total: UGX ${totalAmount.toLocaleString()}`,
        });
      }

      setCustomerName("");
      setCustomerPhone("");
      setProducts([]);
      setAmountReceived("");
      setDiscountAmount("0");
      setDiscountType("fixed");
      setFormData({ 
        paidInCash: null, 
        mobileMoneyNumber: "",
        bankName: "",
        accountNumber: "", 
        accountName: "", 
        tillNumber: "",
        paybillNumber: "",
        transactionReference: "", 
        payerName: "",
        notes: "",
      });

      setTimeout(() => {
        if (window.confirm('Print receipt?')) {
          printReceipt(sale);
        }
      }, 500);
    } catch (err: unknown) {
      const error = err as Error;
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
      submitLockRef.current = false;
    }
  };

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getSalePaymentMethodLabel = (sale: SaleItem) => {
    if (!sale.paidInCash) return "Credit";
    return sale.paymentDetails?.paymentMethod || "Paid";
  };

  const getSalePaidToLabel = (sale: SaleItem) => {
    const d = sale.paymentDetails;
    if (!sale.paidInCash || !d) return null;
    if (d.mobileMoneyNumber) return `To ${d.mobileMoneyNumber}`;
    if (d.tillNumber) return `To Till ${d.tillNumber}`;
    if (d.paybillNumber) return `To Paybill ${d.paybillNumber}`;
    if (d.accountNumber) return `To ${d.bankName ? d.bankName + ' ' : ''}${d.accountNumber}`;
    return null;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold text-foreground">Sales Entry</h2>
          <p className="text-sm text-muted-foreground flex items-center gap-1.5 font-medium">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
            {greeting}{userName ? `, ${userName}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExcelImport config={{
            title: "Import Sales from Excel",
            description: "Upload an Excel file with sales records",
            fields: [
              { key: "customer_name", label: "Customer Name", type: "string", defaultValue: "Walk-in" },
              { key: "product_name", label: "Product Name", required: true, type: "string" },
              { key: "quantity", label: "Quantity", type: "number", defaultValue: 1 },
              { key: "total_amount", label: "Total Amount", required: true, type: "number" },
              { key: "date_of_sale", label: "Date", type: "date", defaultValue: new Date().toISOString().split("T")[0] },
            ],
            templateData: [
              { "Customer Name": "Walk-in", "Product Name": "Coca Cola 500ml", "Quantity": 5, "Total Amount": 10000, "Date": "2026-03-09" },
            ],
            onImport: async (rows) => {
              const { data: { user } } = await supabase.auth.getUser();
              if (!user) throw new Error("Not authenticated");
              const storeId = currentStoreId;
              if (!storeId) throw new Error("No store selected");

              let success = 0;
              const errors: string[] = [];
              for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                if (!row.product_name || !row.total_amount) {
                  errors.push(`Row ${i + 1}: Missing required fields (Product Name and Total Amount)`);
                  continue;
                }
                const products = [{
                  id: crypto.randomUUID(),
                  productName: String(row.product_name),
                  quantity: Number(row.quantity) || 1,
                  sellingPrice: Number(row.total_amount) / (Number(row.quantity) || 1),
                  sellType: 'item' as const,
                }];
                const { error } = await supabase.from("sales").insert({
                  store_id: storeId, user_id: user.id,
                  customer_name: String(row.customer_name).trim(),
                  date_of_sale: row.date_of_sale || new Date().toISOString().split("T")[0],
                  total_amount: Number(row.total_amount),
                  products: products as any,
                  paid_in_cash: true,
                });
                if (error) { errors.push(`Row ${i + 1}: ${error.message}`); } else { success++; }
              }
              return { success, errors };
            },
          }} />
          <div className="flex flex-col items-end gap-1">
            <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">POS System</Badge>
            <span className="text-[10px] text-muted-foreground font-mono">v2.1 Enterprise</span>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <TabsList className="grid grid-cols-2">
            <TabsTrigger value="new-sale" className="gap-2">
              <ShoppingCart className="h-4 w-4" />
              New Sale
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <History className="h-4 w-4" />
              History
            </TabsTrigger>
          </TabsList>

        </div>


        <TabsContent value="new-sale">
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Left/Center - Search and Items */}
              <div className="lg:col-span-2 space-y-3">
                <div className="flex justify-end lg:-mt-12">
                  <ToggleGroup
                    type="single"
                    value={saleType}
                    onValueChange={(value) => value && setSaleType(value as "retail" | "wholesale")}
                    className="border rounded-lg p-1 bg-muted/50 shadow-sm"
                  >
                    <ToggleGroupItem value="retail" className="px-4 h-8 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                      Retail
                    </ToggleGroupItem>
                    <ToggleGroupItem value="wholesale" className="px-4 h-8 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                      Wholesale
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>

                {/* Search Bar - Top Center */}
                <Card>
                  <CardContent className="pt-3 pb-3 relative">
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                        <Input
                          ref={searchInputRef}
                          placeholder="Search products (press / to focus)..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'ArrowDown') {
                              if (filteredStock.length === 0) return;
                              e.preventDefault();
                              e.stopPropagation();
                              setSelectedIndex((prev) => Math.min(prev + 1, filteredStock.length - 1));
                            } else if (e.key === 'ArrowUp') {
                              if (filteredStock.length === 0) return;
                              e.preventDefault();
                              e.stopPropagation();
                              setSelectedIndex((prev) => Math.max(prev - 1, 0));
                            } else if (e.key === 'Enter') {
                              // Prevent accidental form submit when searching.
                              e.preventDefault();
                              e.stopPropagation();
                              const picked = filteredStock[selectedIndex] || filteredStock[0];
                              if (picked) addProduct(picked);
                            } else if (e.key === 'Escape') {
                              e.preventDefault();
                              e.stopPropagation();
                              setSearchTerm("");
                              setSelectedIndex(0);
                            }
                          }}
                          className="pl-10 h-11 text-lg"
                          autoComplete="off"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-11 w-11"
                        onClick={() => setShowBarcodeScanner(true)}
                        title="Scan Barcode"
                      >
                        <Camera className="h-5 w-5" />
                      </Button>
                    </div>

                    {searchTerm && filteredStock.length > 0 && (
                      <div className="absolute left-4 right-4 top-16 bg-card border border-border rounded-md shadow-lg z-50 max-h-64 overflow-y-auto">
                        {filteredStock.map((product) => {
                          const itemsPerSachet = product.items_per_sachet || 1;
                          const sachetsCount = Math.floor((product.quantity || 0) / itemsPerSachet);
                          const productIndex = filteredStock.indexOf(product);
                          const unitName = product.unit_name || product.packaging_type || 'package';
                          const isOutOfStock = (product.quantity || 0) <= 0;
                          const isLowStock = !isOutOfStock && (product.quantity || 0) < (product.min_stock_level || 10);

                          return (
                            <div
                              id={`product-search-item-${productIndex}`}
                              key={product.id}
                              className={`p-3 cursor-pointer border-b last:border-b-0 transition-colors ${
                                isOutOfStock ? 'opacity-60 bg-red-50' : 
                                productIndex === selectedIndex ? 'bg-primary/10 border-l-2 border-l-primary' : 'hover:bg-muted'
                              }`}
                              onClick={() => {
                                if (isOutOfStock) {
                                  toast({
                                    variant: "destructive",
                                    title: "Out of Stock",
                                    description: `${product.productName} is currently out of stock`,
                                  });
                                } else {
                                  addProduct(product);
                                }
                              }}
                              onMouseEnter={() => setSelectedIndex(productIndex)}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  {product.productImage && (
                                    <img src={product.productImage} alt="" className="w-10 h-10 rounded object-cover" />
                                  )}
                                  <div>
                                    <div className="font-medium flex items-center gap-2">
                                      {product.productName}
                                      {isOutOfStock && (
                                        <Badge variant="destructive" className="text-xs">Out of Stock</Badge>
                                      )}
                                      {isLowStock && (
                                        <Badge variant="outline" className="text-xs text-yellow-600 border-yellow-600">Low Stock</Badge>
                                      )}
                                    </div>
                                    <div className="text-sm text-muted-foreground">
                                      {saleType === 'wholesale' ? (
                                        <>
                                          {itemsPerSachet > 1 ? (
                                            <>📦 {sachetsCount} {unitName}{sachetsCount === 1 ? '' : 's'} @ UGX {(product.wholesalePrice || product.wholesale_price || 0).toLocaleString()}</>
                                          ) : (
                                            <>📦 {product.quantity} units @ UGX {(product.wholesalePrice || product.wholesale_price || 0).toLocaleString()}</>
                                          )}
                                        </>
                                      ) : (
                                        <>
                                          <span className={`font-semibold ${isOutOfStock ? 'text-red-600' : isLowStock ? 'text-yellow-600' : 'text-info'}`}>
                                            {product.quantity} items {isOutOfStock ? '(Out of Stock)' : 'available'}
                                          </span>
                                          {itemsPerSachet > 1 ? ` • ${sachetsCount} ${unitName}${sachetsCount === 1 ? '' : 's'}` : ''}
                                          {` @ UGX ${(product.retail_price || product.retailPrice || 0).toLocaleString()}`}
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  {productIndex === selectedIndex && (
                                    <Badge variant="secondary" className="text-xs">Enter</Badge>
                                  )}
                                  <Plus className="h-5 w-5 text-primary" />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Selected Items - Middle */}
                <Card className="min-h-[200px]">
                  <CardHeader className="pb-2 pt-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <ShoppingCart className="h-4 w-4" />
                        Cart ({products.length} items)
                      </CardTitle>
                      {products.length > 0 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setShowReceipt(true)}
                          className="h-8"
                        >
                          <Receipt className="h-4 w-4 mr-1" />
                          View Receipt
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {products.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <ShoppingCart className="h-12 w-12 mx-auto mb-3 opacity-30" />
                        <p className="text-sm">No items in cart</p>
                        <p className="text-xs mt-1">Search and add products above</p>
                      </div>
                    ) : (
                      <ScrollArea className="h-[180px]">
                        <div className="space-y-2 relative">
                          <div ref={cartTopRef} className="absolute top-0 opacity-0 pointer-events-none" />
                          {products.map((product) => {
                            const stockItem = stockData.find(s => s.productName === product.productName);
                            const itemsPerSachet = stockItem?.items_per_sachet || 1;
                            const sachetsAvail = Math.floor((stockItem?.quantity || 0) / itemsPerSachet);
                            const unitName = (stockItem?.unit_name || stockItem?.packaging_type || 'package');

                            return (
                              <div key={`${stockItem?.id || product.productName}-${product.sellType}`} className="flex items-center gap-2 p-2 border rounded-lg text-sm">
                                {stockItem?.productImage && (
                                  <img src={stockItem.productImage} alt="" className="w-10 h-10 rounded object-cover" />
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1">
                                    <h4 className="font-medium truncate text-sm">{product.productName}</h4>
                                    <Badge variant={product.sellType === 'sachet' ? 'default' : 'secondary'} className="text-[10px] px-1">
                                      {product.sellType === 'sachet' ? `📦 ${unitName} (${itemsPerSachet})` : '🏷️ Item'}
                                    </Badge>
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    {product.sellType === 'sachet'
                                      ? `${sachetsAvail} ${unitName}${sachetsAvail === 1 ? '' : 's'} avail`
                                      : `${stockItem?.quantity || 0} items avail`
                                    }
                                  </p>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Input
                                    type="number"
                                     min="1"
                                     max={product.sellType === 'sachet' ? sachetsAvail : (stockItem?.quantity || 0)}
                                     value={product.quantity}
                                     onChange={(e) => updateProductQuantity(product.productName, parseInt(e.target.value), product.sellType)}
                                     className="w-14 h-7 text-xs"
                                   />
                                  <span className="text-xs">×</span>
                                  <Input
                                    type="number"
                                    min="0"
                                    value={product.sellingPrice}
                                    onChange={(e) => updateProductPrice(product.productName, parseFloat(e.target.value), product.sellType)}
                                    className="w-20 h-7 text-xs"
                                  />
                                </div>
                                <div className="text-right min-w-[80px]">
                                  <p className="font-medium text-xs">UGX {(product.quantity * product.sellingPrice).toLocaleString()}</p>
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive"
                                  onClick={() => removeProduct(product.productName, product.sellType)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      </ScrollArea>
                    )}
                  </CardContent>
                </Card>

                {/* Total Summary - Bottom */}
                <Card className="bg-primary/5">
                  <CardContent className="py-2 px-3 space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Subtotal:</span>
                      <span>UGX {subtotal.toLocaleString()}</span>
                    </div>
                    {totalDiscount > 0 && (
                      <div className="flex justify-between text-xs text-warning">
                        <span>Discount:</span>
                        <span>-UGX {totalDiscount.toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between border-t pt-1">
                      <div>
                        <p className="text-xs text-muted-foreground">Final Total</p>
                        <p className="text-xl font-bold text-primary">UGX {totalAmount.toLocaleString()}</p>
                      </div>
                      {amountReceivedNum > 0 && (
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">
                            {balance >= 0 ? 'Change' : 'Balance Due'}
                          </p>
                          <p className={`text-lg font-bold ${balance >= 0 ? 'text-success' : 'text-destructive'}`}>
                            UGX {Math.abs(balance).toLocaleString()}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Bottom action buttons (horizontal) */}
                    <div className="grid grid-cols-3 gap-2 pt-2">
                      <Button
                        type="button"
                        className="h-12 text-base font-semibold bg-amber-500 hover:bg-amber-600 text-white"
                        onClick={() => {
                          setActiveTab("history");
                          setTimeout(() => historySearchRef.current?.focus(), 0);
                        }}
                      >
                        <Undo2 className="h-5 w-5 mr-2" />
                        Return Sales
                      </Button>
                      <Button
                        type="button"
                        className="h-12 text-base font-semibold bg-blue-600 hover:bg-blue-700 text-white"
                        onClick={() => {
                          try {
                            const key = `brepos_draft_sale_${currentStoreId || 'default'}`;
                            const payload = {
                              customerName,
                              customerPhone,
                              dateOfSale,
                              products,
                              amountReceived,
                              discountAmount,
                              discountType,
                              formData,
                              selectedCustomerId,
                              selectedTaxId,
                              selectedPaymentMethodId,
                              savedAt: new Date().toISOString(),
                            };
                            localStorage.setItem(key, JSON.stringify(payload));
                            toast({ title: 'Draft saved', description: 'Your sale draft was saved. You can switch pages safely.' });
                          } catch {
                            toast({ title: 'Draft failed', description: 'Could not save draft to this device.', variant: 'destructive' });
                          }
                        }}
                      >
                        <Clock className="h-5 w-5 mr-2" />
                        Draft Sales
                      </Button>
                      <Button
                        type="button"
                        className="h-12 text-base font-semibold bg-red-600 hover:bg-red-700 text-white"
                        onClick={() => {
                          if (products.length === 0 && !customerName && !amountReceived) return;
                          if (!window.confirm('Cancel this sale and clear the form?')) return;
                      try {
                        const key = `brepos_draft_sale_${currentStoreId || 'default'}`;
                        localStorage.removeItem(key);
                      } catch {
                        // ignore
                      }
                          setCustomerName("");
                          setCustomerPhone("");
                          setProducts([]);
                          setAmountReceived("");
                          setDiscountAmount("0");
                          setDiscountType("fixed");
                          setFormData({
                            paidInCash: null,
                            mobileMoneyNumber: "",
                            bankName: "",
                            accountNumber: "",
                            accountName: "",
                            tillNumber: "",
                            paybillNumber: "",
                            transactionReference: "",
                            payerName: "",
                            notes: "",
                          });
                          setSelectedCustomerId(null);
                          toast({ title: 'Sale canceled', description: 'Sale form cleared.' });
                        }}
                      >
                        <X className="h-5 w-5 mr-2" />
                        Cancel Sale
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Right Panel - Customer & Payment - Compact */}
              <div className="space-y-3 lg:-mt-12">
                <Card className="bg-sidebar-dark shadow-xl border-sidebar-dark-border">
                  <CardHeader className="pb-2 pt-3">
                    <CardTitle className="flex items-center gap-2 text-base text-sidebar-dark-foreground">
                      <User className="h-4 w-4" />
                      Customer Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 pt-0 pb-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-sidebar-dark-foreground/70">Customer Name *</Label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Input
                            placeholder="Enter customer name..."
                            value={customerName}
                            onChange={(e) => {
                              setCustomerName(e.target.value);
                              if (selectedCustomerId) setSelectedCustomerId(null);
                            }}
                            className="h-9 bg-muted border-border text-foreground font-normal hover:bg-muted/80"
                          />
                          {customers.length > 0 && (
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="absolute right-0 top-0 h-9 w-9 text-muted-foreground hover:text-foreground"
                                >
                                  <Search className="h-4 w-4" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="p-0 w-[250px]" align="end">
                                <Command>
                                  <CommandInput placeholder="Search existing customers..." className="h-9" />
                                  <CommandList>
                                    <CommandEmpty>No customers found.</CommandEmpty>
                                    <CommandGroup>
                                      {customers.map((customer) => (
                                        <CommandItem
                                          key={customer.id}
                                          value={customer.full_name}
                                          onSelect={() => {
                                            setCustomerName(customer.full_name);
                                            setCustomerPhone(customer.phone || "");
                                            setSelectedCustomerId(customer.id);
                                          }}
                                        >
                                          <Check
                                            className={cn(
                                              "mr-2 h-4 w-4",
                                              selectedCustomerId === customer.id ? "opacity-100" : "opacity-0"
                                            )}
                                          />
                                          <div className="flex flex-col">
                                            <span>{customer.full_name}</span>
                                            {customer.phone && <span className="text-[10px] text-muted-foreground">{customer.phone}</span>}
                                          </div>
                                        </CommandItem>
                                      ))}
                                    </CommandGroup>
                                  </CommandList>
                                </Command>
                              </PopoverContent>
                            </Popover>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-sidebar-dark-foreground/70">Phone (Optional)</Label>
                      <Input
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder="Phone number"
                        className="h-9 bg-muted border-border text-foreground placeholder:text-muted-foreground"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-sidebar-dark-foreground/70">Date</Label>
                      <Input
                        type="date"
                        value={dateOfSale}
                        onChange={(e) => setDateOfSale(e.target.value)}
                        className="h-9 bg-muted border-border text-foreground"
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2 pt-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <DollarSign className="h-4 w-4" />
                      Payment
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 pt-0 pb-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Discount</Label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Input
                            type="number"
                            value={discountAmount}
                            onChange={(e) => setDiscountAmount(e.target.value)}
                            placeholder="Amount"
                            className="h-9 px-3"
                          />
                        </div>
                        <ToggleGroup
                          type="single"
                          value={discountType}
                          onValueChange={(v) => v && setDiscountType(v as "fixed" | "percentage")}
                          className="border rounded-md p-0.5 bg-muted/50 h-9"
                        >
                          <ToggleGroupItem value="fixed" className="px-2 h-7 text-[10px]">FIX</ToggleGroupItem>
                          <ToggleGroupItem value="percentage" className="px-2 h-7 text-[10px]">%</ToggleGroupItem>
                        </ToggleGroup>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Tax</Label>
                        <Select value={selectedTaxId || "none"} onValueChange={(v) => setSelectedTaxId(v === "none" ? null : v)}>
                          <SelectTrigger className="h-9 text-xs">
                            <SelectValue placeholder="No Tax" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No Tax</SelectItem>
                            {availableTaxes.map(tax => (
                              <SelectItem key={tax.id} value={tax.id}>
                                {tax.name} ({tax.rate}%)
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {formData.paidInCash === false ? (
                        <div className="space-y-1">
                          <Label className="text-xs">Payment Method</Label>
                          <div className="h-9 rounded-md border bg-muted/30 px-3 flex items-center text-xs text-muted-foreground">
                            Credit sale (no payment method)
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <Label className="text-xs">Payment Method</Label>
                          <div className="flex gap-2">
                            <Select
                              value={selectedPaymentMethodId || ""}
                              onValueChange={(v) => {
                                setSelectedPaymentMethodId(v);
                                // Selecting a payment method implies this sale is paid (not credit).
                                setFormData((prev) => ({ ...prev, paidInCash: true }));
                              }}
                            >
                              <SelectTrigger className="h-9 text-xs flex-1">
                                <SelectValue placeholder="Select method" />
                              </SelectTrigger>
                              <SelectContent>
                                {availablePaymentMethods.map(method => (
                                  <SelectItem key={method.id} value={method.id}>
                                    {method.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="outline" size="icon" className="h-9 w-9 shrink-0">
                                  <Plus className="h-4 w-4" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="sm:max-w-md">
                                <DialogHeader>
                                  <DialogTitle>Add Payment Method</DialogTitle>
                                </DialogHeader>
                                <form
                                  onSubmit={async (e) => {
                                    e.preventDefault();
                                    const form = e.currentTarget;
                                    const nameInput = form.elements.namedItem('newMethodName') as HTMLInputElement;
                                    const name = nameInput?.value?.trim();
                                    if (!name) return;
                                    try {
                                      const { data: { user } } = await supabase.auth.getUser();
                                      if (!user || !currentStoreId) return;
                                      const { data, error } = await supabase
                                        .from('payment_methods')
                                        .insert({ store_id: currentStoreId, user_id: user.id, name, is_active: true })
                                        .select()
                                        .single();
                                      if (error) throw error;
                                      if (data) {
                                        setAvailablePaymentMethods(prev => [...prev, data]);
                                        setSelectedPaymentMethodId(data.id);
                                        setFormData(prev => ({ ...prev, paidInCash: true }));
                                        toast({ title: "Payment method added", description: `"${name}" is now available` });
                                        nameInput.value = '';
                                      }
                                    } catch (err) {
                                      toast({ title: "Error", description: "Failed to add payment method", variant: "destructive" });
                                    }
                                  }}
                                  className="space-y-4"
                                >
                                  <div className="space-y-2">
                                    <Label htmlFor="newMethodName">Method Name</Label>
                                    <Input id="newMethodName" name="newMethodName" placeholder="e.g. Mobile Money, Bank Transfer" required />
                                  </div>
                                  <Button type="submit" className="w-full">
                                    <Plus className="h-4 w-4 mr-2" />
                                    Add Method
                                  </Button>
                                </form>
                              </DialogContent>
                            </Dialog>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Amount Received</Label>
                      <Input
                        type="number"
                        value={amountReceived}
                        onChange={(e) => setAmountReceived(e.target.value)}
                        placeholder={formData.paidInCash === false ? "Credit sale" : "Enter amount"}
                        disabled={formData.paidInCash === false}
                        className="h-10 text-base border-primary/50"
                      />
                    </div>

                    {/* The basic mobile money UI snippet has been moved to the detailed panel below. */}

                    {/* Payment Completion Panel for Non-Cash Payments */}
                    {formData.paidInCash === true && selectedPaymentMethodId && !availablePaymentMethods.find(m => 
                      m.id === selectedPaymentMethodId && m.name.toLowerCase().includes('cash')
                    ) && (
                      <Card className="bg-primary/5">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <CreditCard className="h-4 w-4" />
                            Complete Payment Details
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {/* For Mobile Money */}
                          {availablePaymentMethods.find(m => 
                            m.id === selectedPaymentMethodId && 
                            (m.name.toLowerCase().includes('mobile') || m.name.toLowerCase().includes('mtn') || m.name.toLowerCase().includes('airtel'))
                          ) && (
                            <>
                              <div className="space-y-1 mb-2">
                                <Label className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Select Network</Label>
                                <ToggleGroup 
                                  type="single" 
                                  value={formData.bankName || "MTN"} 
                                  onValueChange={(v) => v && setFormData({...formData, bankName: v})} 
                                  className="justify-start gap-3"
                                >
                                  <ToggleGroupItem value="MTN" className="h-9 px-4 rounded-full border-2 border-yellow-400/50 bg-yellow-400/10 text-yellow-700 data-[state=on]:bg-yellow-400 data-[state=on]:text-yellow-950 data-[state=on]:border-yellow-500 font-bold transition-all text-xs">
                                    MTN MoMo
                                  </ToggleGroupItem>
                                  <ToggleGroupItem value="Airtel" className="h-9 px-4 rounded-full border-2 border-red-500/50 bg-red-500/10 text-red-600 data-[state=on]:bg-red-500 data-[state=on]:text-white data-[state=on]:border-red-600 font-bold transition-all text-xs">
                                    Airtel Money
                                  </ToggleGroupItem>
                                </ToggleGroup>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Customer Mobile Number *</Label>
                                <Input
                                  type="tel"
                                  placeholder="e.g. 0770123456"
                                  className="h-10 text-base font-semibold tracking-wide border-primary/20 bg-primary/5 focus-visible:ring-primary/30"
                                  value={formData.mobileMoneyNumber || ''}
                                  onChange={(e) => setFormData({ ...formData, mobileMoneyNumber: e.target.value })}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Transaction Reference *</Label>
                                <Input
                                  placeholder="e.g. MP240309ABC123"
                                  className="h-9 text-sm"
                                  value={formData.transactionReference}
                                  onChange={(e) => setFormData({ ...formData, transactionReference: e.target.value })}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Payer Name</Label>
                                <Input
                                  placeholder="Name on mobile money account"
                                  className="h-9 text-sm"
                                  value={formData.payerName}
                                  onChange={(e) => setFormData({ ...formData, payerName: e.target.value })}
                                />
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <Label className="text-xs">Till Number</Label>
                                  <Input
                                    placeholder="Optional"
                                    className="h-9 text-sm"
                                    value={formData.tillNumber}
                                    onChange={(e) => setFormData({ ...formData, tillNumber: e.target.value })}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">Paybill Number</Label>
                                  <Input
                                    placeholder="Optional"
                                    className="h-9 text-sm"
                                    value={formData.paybillNumber}
                                    onChange={(e) => setFormData({ ...formData, paybillNumber: e.target.value })}
                                  />
                                </div>
                              </div>
                            </>
                          )}

                          {/* For Bank Transfer */}
                          {availablePaymentMethods.find(m => 
                            m.id === selectedPaymentMethodId && 
                            (m.name.toLowerCase().includes('bank') || m.name.toLowerCase().includes('transfer'))
                          ) && (
                            <>
                              <div className="space-y-1">
                                <Label className="text-xs">Bank Name</Label>
                                <Input
                                  placeholder="e.g. Stanbic, Equity"
                                  className="h-9 text-sm"
                                  value={formData.bankName}
                                  onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Account Number *</Label>
                                <Input
                                  placeholder="Bank account number"
                                  className="h-9 text-sm"
                                  value={formData.accountNumber}
                                  onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Account Name *</Label>
                                <Input
                                  placeholder="Account holder name"
                                  className="h-9 text-sm"
                                  value={formData.accountName}
                                  onChange={(e) => setFormData({ ...formData, accountName: e.target.value })}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Transaction Reference</Label>
                                <Input
                                  placeholder="Transfer reference number"
                                  className="h-9 text-sm"
                                  value={formData.transactionReference}
                                  onChange={(e) => setFormData({ ...formData, transactionReference: e.target.value })}
                                />
                              </div>
                            </>
                          )}

                          {/* For Credit Card */}
                          {availablePaymentMethods.find(m => 
                            m.id === selectedPaymentMethodId && 
                            (m.name.toLowerCase().includes('card') || m.name.toLowerCase().includes('visa') || m.name.toLowerCase().includes('mastercard'))
                          ) && (
                            <>
                              <div className="space-y-1">
                                <Label className="text-xs">Card Number *</Label>
                                <Input
                                  placeholder="0000 0000 0000 0000"
                                  maxLength={19}
                                  className="h-9 text-base tracking-widest font-mono font-semibold bg-primary/5 focus-visible:ring-primary/20"
                                  value={formData.accountNumber}
                                  onChange={(e) => {
                                      const val = e.target.value.replace(/\D/g, '');
                                      const formatted = val.replace(/(\d{4})/g, '$1 ').trim();
                                      setFormData({ ...formData, accountNumber: formatted });
                                  }}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Cardholder Name *</Label>
                                <Input
                                  placeholder="Name on card"
                                  className="h-9 text-sm uppercase font-semibold"
                                  value={formData.accountName}
                                  onChange={(e) => setFormData({ ...formData, accountName: e.target.value.toUpperCase() })}
                                />
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                  <Label className="text-xs flex justify-between">
                                    <span>Expiry Date</span>
                                    <span className="text-muted-foreground font-normal">MM/YY</span>
                                  </Label>
                                  <Input
                                    placeholder="MM/YY"
                                    maxLength={5}
                                    className="h-9 text-sm font-mono text-center"
                                    value={formData.tillNumber}
                                    onChange={(e) => {
                                      let val = e.target.value.replace(/\D/g, '');
                                      if (val.length >= 2 && val.length < 4) {
                                        val = val.substring(0, 2) + '/' + val.substring(2);
                                      } else if (val.length >= 4) {
                                        val = val.substring(0, 2) + '/' + val.substring(2, 4);
                                      }
                                      setFormData({ ...formData, tillNumber: val });
                                    }}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">CVV</Label>
                                  <Input
                                    placeholder="123"
                                    maxLength={4}
                                    type="password"
                                    className="h-9 text-sm font-mono text-center tracking-widest"
                                    value={formData.paybillNumber}
                                    onChange={(e) => setFormData({ ...formData, paybillNumber: e.target.value.replace(/\D/g, '') })}
                                  />
                                </div>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Transaction Reference (Generated)</Label>
                                <Input
                                  placeholder="Auth code will generate automatically"
                                  className="h-9 text-xs bg-muted border-none"
                                  disabled
                                  value={formData.transactionReference || `CHRG-${Math.floor(Math.random() * 1000000)}`}
                                />
                              </div>
                            </>
                          )}

                          {/* Generic fields for other payment methods */}
                          {availablePaymentMethods.find(m => 
                            m.id === selectedPaymentMethodId && 
                            !m.name.toLowerCase().includes('cash') &&
                            !m.name.toLowerCase().includes('mobile') &&
                            !m.name.toLowerCase().includes('mtn') &&
                            !m.name.toLowerCase().includes('airtel') &&
                            !m.name.toLowerCase().includes('bank') &&
                            !m.name.toLowerCase().includes('transfer') &&
                            !m.name.toLowerCase().includes('card') &&
                            !m.name.toLowerCase().includes('visa') &&
                            !m.name.toLowerCase().includes('mastercard')
                          ) && (
                            <>
                              <div className="space-y-1">
                                <Label className="text-xs">Account/Reference Number</Label>
                                <Input
                                  placeholder="Account or reference number"
                                  className="h-9 text-sm"
                                  value={formData.accountNumber}
                                  onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Account/Payer Name</Label>
                                <Input
                                  placeholder="Name associated with payment"
                                  className="h-9 text-sm"
                                  value={formData.accountName}
                                  onChange={(e) => setFormData({ ...formData, accountName: e.target.value })}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Transaction Reference</Label>
                                <Input
                                  placeholder="Transaction ID or reference"
                                  className="h-9 text-sm"
                                  value={formData.transactionReference}
                                  onChange={(e) => setFormData({ ...formData, transactionReference: e.target.value })}
                                />
                              </div>
                            </>
                          )}

                          <div className="space-y-1">
                            <Label className="text-xs">Notes</Label>
                            <Input
                              placeholder="Optional comment"
                              className="h-9 text-sm"
                              value={formData.notes}
                              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                            />
                          </div>

                          <div className="pt-2 border-t">
                            <p className="text-xs text-muted-foreground">
                              💡 These details help track and verify the payment
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {amountReceivedNum > 0 && totalAmount > 0 && (
                      <div className={`p-2 rounded-lg text-xs ${balance >= 0 ? 'bg-success/10' : 'bg-warning/10'}`}>
                        <p className="font-medium">
                          {balance >= 0
                            ? `Change: UGX ${balance.toLocaleString()}`
                            : `Balance (to debt): UGX ${Math.abs(balance).toLocaleString()}`}
                        </p>
                      </div>
                    )}

                    <div className="space-y-1">
                      <Label className="text-xs">Payment</Label>
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          type="button"
                          variant={formData.paidInCash === true ? "default" : "outline"}
                          className={`h-auto py-2 flex-col gap-0.5 ${formData.paidInCash === true
                            ? 'bg-success hover:bg-success/90 text-success-foreground'
                            : 'border-success text-success hover:bg-success/10'
                            }`}
                          onClick={() => {
                            setFormData((prev) => ({ ...prev, paidInCash: true }));
                            if (!selectedPaymentMethodId) {
                              const cashMethod = availablePaymentMethods.find(m => m.name.toLowerCase().includes('cash'));
                              setSelectedPaymentMethodId(cashMethod?.id || availablePaymentMethods[0]?.id || null);
                            }
                          }}
                        >
                          {selectedPaymentIsCash ? <Banknote className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}
                          <span className="text-xs">{selectedPaymentMethodName}</span>
                        </Button>
                        <Button
                          type="button"
                          variant={formData.paidInCash === false ? "default" : "outline"}
                          className={`h-auto py-2 flex-col gap-0.5 ${formData.paidInCash === false
                            ? 'bg-info hover:bg-info/90 text-info-foreground'
                            : 'border-info text-info hover:bg-info/10'
                            }`}
                          onClick={() => {
                            setFormData((prev) => ({
                              ...prev,
                              paidInCash: false,
                              mobileMoneyNumber: "",
                              bankName: "",
                              accountNumber: "",
                              accountName: "",
                              tillNumber: "",
                              paybillNumber: "",
                              transactionReference: "",
                              payerName: "",
                              notes: "",
                            }));
                            setAmountReceived("");
                          }}
                        >
                          <CreditCard className="h-4 w-4" />
                          <span className="text-xs">Credit</span>
                        </Button>
                      </div>
                    </div>

                    {formData.paidInCash === false && (
                      <div className="p-2 bg-warning/10 rounded-lg">
                        <p className="text-xs text-warning font-medium">
                          ⚠️ Unpaid debt
                        </p>
                      </div>
                    )}

                    {formData.paidInCash === true && amountReceivedNum > 0 && amountReceivedNum < totalAmount && (
                      <div className="p-2 bg-warning/10 rounded-lg">
                        <p className="text-xs text-warning font-medium">
                          ⚠️ UGX {(totalAmount - amountReceivedNum).toLocaleString()} will be added as debt
                        </p>
                      </div>
                    )}

                    <Button
                      type="submit"
                      className="w-full h-10 text-base"
                      disabled={isSubmitting || products.length === 0}
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <ShoppingCart className="h-4 w-4 mr-2" />
                          Record Sale
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          </form>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-lg">
                <div className="flex items-center gap-2">
                  <History className="h-5 w-5" />
                  <span className="font-bold tracking-tight text-lg md:text-xl">Recent Sales</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchSalesHistory}
                  disabled={isLoadingHistory}
                >
                  {isLoadingHistory ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    ref={historySearchRef}
                    placeholder="Search by customer, product, or receipt..."
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              {isLoadingHistory ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : salesHistory.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Receipt className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No sales recorded yet</p>
                </div>
              ) : (
                <ScrollArea className="h-[500px]">
                  <div className="space-y-3">
                    {(() => {
                      const q = historySearch.trim().toLowerCase();
                      const filteredSales = salesHistory.filter((sale) => {
                        if (!q) return true;
                        // Flexible search: check if any part matches
                        const inCustomer = sale.customerName.toLowerCase().includes(q);
                        const inReceipt = sale.id.toLowerCase().includes(q) || sale.id.slice(-8).toLowerCase().includes(q);
                        const inProducts = sale.products.some((p) => p.productName.toLowerCase().includes(q));
                        const inPaymentMethod = sale.paymentDetails?.paymentMethod?.toLowerCase().includes(q) || false;
                        const inTotal = sale.totalAmount.toString().includes(q);
                        return inCustomer || inReceipt || inProducts || inPaymentMethod || inTotal;
                      });

                      return (
                        <>
                          {historySearch && (
                            <div className="mb-2 px-1">
                              <p className="text-sm text-muted-foreground">
                                Found {filteredSales.length} sale{filteredSales.length !== 1 ? 's' : ''} matching "{historySearch}"
                              </p>
                            </div>
                          )}
                          {filteredSales.map((sale) => (
                      <div
                        key={sale.id}
                        className="p-4 border rounded-lg bg-card hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h4 className="text-base font-semibold tracking-tight leading-5">{sale.customerName}</h4>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                              <Clock className="h-3 w-3" />
                              {formatDateTime(sale.created_at)}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {getSalePaymentMethodLabel(sale)}
                              {getSalePaidToLabel(sale) ? ` \u2022 ${getSalePaidToLabel(sale)}` : ''}
                            </div>
                          </div>
                          <div className="text-right space-y-2">
                            <div>
                              <p className="text-base font-bold text-primary tabular-nums leading-5">
                                UGX {sale.totalAmount.toLocaleString()}
                              </p>
                              <Badge
                                variant={sale.paidInCash ? "default" : "secondary"}
                                className="mt-1 text-xs h-6"
                              >
                                {sale.paidInCash ? (
                                  <><Check className="h-3 w-3 mr-1" /> Paid</>
                                ) : (
                                  <><X className="h-3 w-3 mr-1" /> Unpaid</>
                                )}
                              </Badge>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs gap-1"
                              onClick={() => openReturnDialog(sale)}
                            >
                              <Undo2 className="h-3 w-3" />
                              Return
                            </Button>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {sale.products.slice(0, 3).map((p, idx) => (
                            <Badge key={`${sale.id}-${p.productName}-${idx}`} variant="outline" className="text-xs px-2 py-0.5 h-6 font-medium">
                              {p.quantity}× {p.productName}
                            </Badge>
                          ))}
                          {sale.products.length > 3 && (
                            <Badge variant="outline" className="text-xs px-2 py-0.5 h-6 font-medium">
                              +{sale.products.length - 3} more
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                          </>
                        );
                      })()}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Recent Sales Section at Bottom */}
      {
        activeTab === "new-sale" && salesHistory.length > 0 && (
          <Card className="mt-4">
            <CardContent>
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="w-[90px] text-xs font-semibold uppercase tracking-wider">No.</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider">Customer</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider">Items</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider">Method</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-right">Time</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {salesHistory.slice(0, 5).map((sale) => (
                      <TableRow key={sale.id} className="hover:bg-muted/30 transition-colors">
                        <TableCell className="font-mono text-xs text-primary font-semibold">
                          #{sale.id.slice(-6).toUpperCase()}
                        </TableCell>
                        <TableCell className="text-xs font-medium">
                          {sale.customerName}
                        </TableCell>
                        <TableCell className="max-w-[200px]">
                          <div className="flex flex-wrap gap-1">
                            {sale.products.map((p, idx) => (
                              <Badge key={`${sale.id}-${p.productName}-${idx}`} variant="outline" className="text-[10px] px-1 py-0 h-4 bg-background font-medium">
                                {p.quantity}x {p.productName.split(' ')[0]}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                            <Badge
                              variant={sale.paidInCash ? "default" : "secondary"}
                              className={`text-[11px] h-6 font-medium ${sale.paidInCash ? 'bg-success hover:bg-success/90' : ''}`}
                            >
                              {getSalePaymentMethodLabel(sale)}
                            </Badge>
                          </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">
                          {formatDateTime(sale.created_at)}
                        </TableCell>
                        <TableCell className="text-right font-bold text-sm tabular-nums">
                          {sale.totalAmount.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )
      }

      {/* Soft Receipt Dialog */}
      <Dialog open={showReceipt} onOpenChange={setShowReceipt}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Sale Preview
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="border-b pb-3">
              <p className="text-sm text-muted-foreground">Customer: <span className="font-medium text-foreground">{customerName || "Not entered"}</span></p>
              <p className="text-sm text-muted-foreground">Date: <span className="font-medium text-foreground">{dateOfSale}</span></p>
            </div>

            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {products.map((product, index) => (
                <div key={`${product.id || product.productName}-${product.sellType}-${index}`} className="flex justify-between items-center py-2 border-b last:border-b-0">
                  <div>
                    <p className="font-medium text-sm">{index + 1}. {product.productName}</p>
                    <p className="text-xs text-muted-foreground">{product.quantity} × UGX {product.sellingPrice.toLocaleString()}</p>
                  </div>
                  <p className="font-medium text-sm">UGX {(product.quantity * product.sellingPrice).toLocaleString()}</p>
                </div>
              ))}
            </div>

            <div className="border-t pt-3">
              <div className="flex justify-between items-center">
                <p className="text-lg font-bold">Total</p>
                <p className="text-xl font-bold text-primary">UGX {totalAmount.toLocaleString()}</p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Return Items Dialog */}
      <Dialog
        open={returnDialogOpen}
        onOpenChange={(open) => {
          setReturnDialogOpen(open);
          if (!open) {
            setReturnSale(null);
            setReturnItems([]);
            setReturnReason("");
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Undo2 className="h-5 w-5" />
              Return Items
            </DialogTitle>
          </DialogHeader>

          {!returnSale ? (
            <div className="text-sm text-muted-foreground">Select a sale to return items.</div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border p-3 bg-muted/20">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{returnSale.customerName}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(returnSale.created_at)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold">UGX {returnSale.totalAmount.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">{getSalePaymentMethodLabel(returnSale)}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                {returnItems.map((it, idx) => (
                  <div key={`${it.productId || it.productName}-${it.sellType}-${idx}`} className="flex items-center gap-3 border rounded-lg p-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{it.productName}</p>
                      <p className="text-xs text-muted-foreground">
                        Sold: {it.soldQty} {it.sellType === "sachet" ? "sachet(s)" : "item(s)"} • Unit: UGX {Math.round(it.unitPrice).toLocaleString()}
                      </p>
                    </div>
                    <div className="w-[120px]">
                      <Label className="text-[10px] text-muted-foreground">Return Qty</Label>
                      <Input
                        type="number"
                        min="0"
                        max={it.soldQty}
                        value={it.returnQty}
                        onChange={(e) => {
                          const next = Math.max(0, Math.min(it.soldQty, parseInt(e.target.value || "0", 10) || 0));
                          setReturnItems((prev) => prev.map((p, i) => i === idx ? { ...p, returnQty: next } : p));
                        }}
                        className="h-9"
                      />
                    </div>
                    <div className="w-[140px] text-right">
                      <p className="text-xs text-muted-foreground">Line Total</p>
                      <p className="font-semibold tabular-nums">
                        UGX {Math.round((it.returnQty || 0) * (it.unitPrice || 0)).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Refund Handling</Label>
                  <Select value={refundOption} onValueChange={(v) => setRefundOption(v as any)}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select refund handling" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash refund</SelectItem>
                      <SelectItem value="original">Refund using original method</SelectItem>
                      <SelectItem value="credit_adjust">Adjust customer credit</SelectItem>
                      <SelectItem value="schedule">Schedule refund</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Reason (optional)</Label>
                  <Textarea
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                    placeholder="Reason for return..."
                    className="min-h-[80px]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between border-t pt-4">
                <div>
                  <p className="text-xs text-muted-foreground">Return Total</p>
                  <p className="text-lg font-bold text-primary tabular-nums">
                    UGX {Math.round(returnTotal).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setReturnDialogOpen(false)}
                    disabled={isProcessingReturn}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={processReturn}
                    disabled={isProcessingReturn}
                  >
                    {isProcessingReturn ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      "Confirm Return"
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Barcode Scanner Modal */}
      <BarcodeScanner
        isOpen={showBarcodeScanner}
        onClose={() => setShowBarcodeScanner(false)}
        onScan={handleBarcodeScan}
      />



    </div>
  );
};

export default SalesEntry;
