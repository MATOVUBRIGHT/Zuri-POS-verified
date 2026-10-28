import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronUp,
  Clock3,
  Download,
  FileBarChart2,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  Search,
  Share2,
  Send,
  X,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { fmtCurrency, fmtCurrencyFor } from "@/lib/currency";
import { supabase } from "@/integrations/supabase/client";
import type { StockTransferItem, StockTransferRequest } from "@/types";

type Branch = { id: string; store_name: string; user_id: string; currency?: string | null };
type InventoryChoice = {
  id: string;
  product_name: string;
  category: string;
  size: string | null;
  barcode: string | null;
  quantity: number;
  damaged_quantity: number;
  cost_per_unit: number;
  retail_price: number | null;
  wholesale_price: number | null;
};

type TransferRecord = StockTransferRequest & {
  items: TransferItem[];
};
type TransferItem = StockTransferItem & {
  received_amount?: number | null;
  received_currency?: string | null;
  received_cost_per_unit?: number | null;
  branch_currency?: string | null;
  branch_cost_per_unit?: number | null;
  exchange_rate?: number | null;
  exchange_rate_source?: string | null;
  reviewed_retail_price?: number | null;
  reviewed_wholesale_price?: number | null;
};

const describeSupabaseError = (error: unknown, fallback: string) => {
  if (error && typeof error === "object") {
    const details = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const parts = [details.message, details.details, details.hint]
      .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
      .map((part) => part.trim());
    if (parts.length) return parts.join(" — ");
    if (typeof details.code === "string" && details.code.trim()) return `Request failed (${details.code.trim()})`;
  }
  return error instanceof Error && error.message ? error.message : fallback;
};

const statusLabel: Record<StockTransferRequest["status"], string> = {
  pending: "Pending",
  partial: "Partially reviewed",
  completed: "Completed",
  rejected: "Rejected",
};

const statusClass: Record<StockTransferRequest["status"], string> = {
  pending: "border-amber-300 bg-amber-50 text-amber-800",
  partial: "border-sky-300 bg-sky-50 text-sky-800",
  completed: "border-emerald-300 bg-emerald-50 text-emerald-800",
  rejected: "border-slate-300 bg-slate-100 text-slate-700",
};

const itemStatusClass: Record<StockTransferItem["status"], string> = {
  pending: "border-amber-300 bg-amber-50 text-amber-800",
  approved: "border-emerald-300 bg-emerald-50 text-emerald-800",
  rejected: "border-slate-300 bg-slate-100 text-slate-700",
};

const dateLabel = (value: string) => new Date(value).toLocaleDateString(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
});

const stockSellable = (item: InventoryChoice) =>
  Math.floor(Math.max(0, Number(item.quantity || 0) - Number(item.damaged_quantity || 0)));

const BranchStockTransfers = ({ currentStoreId }: { currentStoreId: string | null }) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [canManageTransfers, setCanManageTransfers] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [inventory, setInventory] = useState<InventoryChoice[]>([]);
  const [transfers, setTransfers] = useState<TransferRecord[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [reportStart, setReportStart] = useState("");
  const [reportEnd, setReportEnd] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [destinationId, setDestinationId] = useState("");
  const [inventorySearch, setInventorySearch] = useState("");
  const [selectedQuantities, setSelectedQuantities] = useState<Record<string, number>>({});
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [reviewing, setReviewing] = useState<{ transfer: TransferRecord; item: TransferItem } | null>(null);
  const [reviewRetailPrice, setReviewRetailPrice] = useState("");
  const [reviewWholesalePrice, setReviewWholesalePrice] = useState("");
  const [reviewRate, setReviewRate] = useState("1");
  const [reviewRateSource, setReviewRateSource] = useState<"custom" | "online">("custom");
  const [rateLoading, setRateLoading] = useState(false);

  const loadWorkspace = useCallback(async () => {
    if (!currentStoreId) {
      setLoading(false);
      setErrorMessage("");
      setBranches([]);
      setInventory([]);
      setTransfers([]);
      setCanManageTransfers(false);
      return;
    }

    setLoading(true);
    setErrorMessage("");
    try {
      const { data: store, error: storeError } = await supabase
        .from("stores")
        .select("id, store_name, user_id, currency")
        .eq("id", currentStoreId)
        .maybeSingle();
      if (storeError) throw storeError;
      if (!store) throw new Error("This branch is not available to your account.");
      setOwnerId(store.user_id);

      const { data: canManage } = await supabase.rpc("can_manage_stock_transfer_store", {
        _store_id: currentStoreId,
      });
      setCanManageTransfers(Boolean(canManage));

      const [branchResult, inventoryResult] = await Promise.all([
        supabase.from("stores").select("id, store_name, user_id, currency").eq("user_id", store.user_id).order("store_name"),
        supabase.from("inventory")
          .select("id, product_name, category, size, barcode, quantity, cost_per_unit, retail_price, wholesale_price")
          .eq("store_id", currentStoreId)
          .gt("quantity", 0)
          .order("product_name"),
      ]);
      if (branchResult.error) throw branchResult.error;
      if (inventoryResult.error) throw inventoryResult.error;

      const branchRows = (branchResult.data || []) as Branch[];
      const requests: StockTransferRequest[] = [];
      for (let offset = 0; ; offset += 500) {
        const page = await supabase.from("stock_transfer_requests").select("*")
          .or(`from_store_id.eq.${currentStoreId},to_store_id.eq.${currentStoreId}`)
          .order("created_at", { ascending: false })
          .range(offset, offset + 499);
        if (page.error) throw page.error;
        const rows = (page.data || []) as StockTransferRequest[];
        requests.push(...rows);
        if (rows.length < 500) break;
      }

      const itemMap = new Map<string, StockTransferItem[]>();
      const requestIds = requests.map((request) => request.id);
      for (let start = 0; start < requestIds.length; start += 50) {
        const requestIdBatch = requestIds.slice(start, start + 50);
        for (let offset = 0; ; offset += 500) {
          const page = await supabase.from("stock_transfer_items").select("*")
            .in("request_id", requestIdBatch)
            .order("created_at")
            .range(offset, offset + 499);
          if (page.error) throw page.error;
          const rows = (page.data || []) as StockTransferItem[];
          rows.forEach((item) => {
            itemMap.set(item.request_id, [...(itemMap.get(item.request_id) || []), item]);
          });
          if (rows.length < 500) break;
        }
      }

      setBranches(branchRows);
      setInventory((inventoryResult.data || []) as InventoryChoice[]);
      setTransfers(requests.map((request) => ({ ...request, items: itemMap.get(request.id) || [] })));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load branch transfers.";
      setErrorMessage(message);
      setTransfers([]);
      setInventory([]);
    } finally {
      setLoading(false);
    }
  }, [currentStoreId]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const branchById = useMemo(() => new Map(branches.map((branch) => [branch.id, branch])), [branches]);
  const currentCurrency = String(branchById.get(currentStoreId || "")?.currency || "UGX").toUpperCase();
  const eligibleDestinations = useMemo(
    () => branches.filter((branch) => branch.user_id === ownerId && branch.id !== currentStoreId),
    [branches, currentStoreId, ownerId],
  );
  const visibleTransfers = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const from = reportStart ? new Date(`${reportStart}T00:00:00`) : null;
    const through = reportEnd ? new Date(`${reportEnd}T23:59:59.999`) : null;
    return transfers.filter((transfer) => {
      if (statusFilter !== "all" && transfer.status !== statusFilter) return false;
      const created = new Date(transfer.created_at);
      if (from && created < from) return false;
      if (through && created > through) return false;
      if (!needle) return true;
      const names = `${branchById.get(transfer.from_store_id)?.store_name || ""} ${branchById.get(transfer.to_store_id)?.store_name || ""}`;
      return `${transfer.reference || ""} ${transfer.notes || ""} ${names} ${transfer.items.map((item) => item.product_name).join(" ")}`
        .toLowerCase().includes(needle);
    });
  }, [branchById, reportEnd, reportStart, search, statusFilter, transfers]);

  const pendingCount = useMemo(
    () => transfers
      .filter((transfer) => transfer.to_store_id === currentStoreId)
      .flatMap((transfer) => transfer.items)
      .filter((item) => item.status === "pending").length,
    [currentStoreId, transfers],
  );
  const allItems = useMemo(() => transfers.flatMap((transfer) => transfer.items), [transfers]);
  const approvedItems = allItems.filter((item) => item.status === "approved");
  const approvedValue = approvedItems.reduce((sum, item) => sum + Number(item.quantity) * Number(item.cost_per_unit), 0);
  const visibleItems = useMemo(() => visibleTransfers.flatMap((transfer) => transfer.items), [visibleTransfers]);
  const visibleApproved = visibleItems.filter((item) => item.status === "approved");
  const sellableInventory = useMemo(
    () => inventory.filter((item) => stockSellable(item) > 0),
    [inventory],
  );
  const availableInventory = useMemo(() => {
    const needle = inventorySearch.trim().toLowerCase();
    if (!needle) return sellableInventory;
    return sellableInventory.filter((item) =>
      `${item.product_name} ${item.category} ${item.size || ""} ${item.barcode || ""}`.toLowerCase().includes(needle),
    );
  }, [inventorySearch, sellableInventory]);
  const selectedItems = useMemo(
    () => inventory.filter((item) => selectedQuantities[item.id] > 0),
    [inventory, selectedQuantities],
  );

  const reviewSourceCurrency = reviewing
    ? String(branchById.get(reviewing.transfer.from_store_id)?.currency || "UGX").toUpperCase()
    : currentCurrency;
  const reviewBranchCurrency = reviewing
    ? String(branchById.get(reviewing.transfer.to_store_id)?.currency || currentCurrency).toUpperCase()
    : currentCurrency;
  const reviewConvertedCost = (Number(reviewing?.item.cost_per_unit || 0) || 0) * (Number(reviewRate) || 0);

  const openReview = (transfer: TransferRecord, item: TransferItem) => {
    const sourceCurrency = String(branchById.get(transfer.from_store_id)?.currency || "UGX").toUpperCase();
    const branchCurrency = String(branchById.get(transfer.to_store_id)?.currency || currentCurrency).toUpperCase();
    const branchRetail = item.reviewed_retail_price ?? 0;
    const branchWholesale = item.reviewed_wholesale_price ?? 0;
    setReviewing({ transfer, item });
    setReviewRetailPrice(String(branchRetail));
    setReviewWholesalePrice(String(branchWholesale));
    setReviewRate(sourceCurrency === branchCurrency ? "1" : String(item.exchange_rate || ""));
    setReviewRateSource((item.exchange_rate_source === "online" ? "online" : "custom"));
  };

  const loadOnlineRate = async () => {
    if (!reviewing || reviewSourceCurrency === reviewBranchCurrency) {
      setReviewRate("1");
      return;
    }
    setRateLoading(true);
    try {
      const response = await fetch(`https://api.frankfurter.app/latest?from=${encodeURIComponent(reviewSourceCurrency)}&to=${encodeURIComponent(reviewBranchCurrency)}`);
      if (!response.ok) throw new Error("Online exchange rate unavailable");
      const result = await response.json() as { rates?: Record<string, number> };
      const rate = Number(result.rates?.[reviewBranchCurrency]);
      if (!Number.isFinite(rate) || rate <= 0) throw new Error("No online rate was returned for these currencies");
      setReviewRate(String(rate));
      setReviewRateSource("online");
      toast({ title: "Online rate loaded", description: `1 ${reviewSourceCurrency} = ${rate} ${reviewBranchCurrency}` });
    } catch (error) {
      toast({ title: "Could not load online rate", description: error instanceof Error ? error.message : "Enter a custom rate instead.", variant: "destructive" });
    } finally {
      setRateLoading(false);
    }
  };

  const approveReviewedItem = async () => {
    if (!reviewing) return;
    const retail = Number(reviewRetailPrice);
    const wholesale = Number(reviewWholesalePrice);
    const rate = Number(reviewRate);
    if (!Number.isFinite(retail) || retail < 0 || !Number.isFinite(wholesale) || wholesale < 0) {
      toast({ title: "Set both selling prices", description: "Enter the receiving branch retail and wholesale prices before approving.", variant: "destructive" });
      return;
    }
    if (!Number.isFinite(rate) || rate <= 0) {
      toast({ title: "Enter a valid exchange rate", description: `The rate must convert ${reviewSourceCurrency} into ${reviewBranchCurrency}.`, variant: "destructive" });
      return;
    }
    setDecidingId(reviewing.item.id);
    try {
      const { error } = await supabase.rpc("review_stock_transfer_item" as any, {
        p_item_id: reviewing.item.id,
        p_decision: "approved",
        p_retail_price: retail,
        p_wholesale_price: wholesale,
        p_exchange_rate: rate,
        p_rate_source: reviewRateSource,
      });
      if (error) throw error;
      toast({ title: "Item approved", description: `${reviewing.item.product_name} was converted to ${reviewBranchCurrency} and added to inventory.` });
      setReviewing(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["inventory", reviewing.transfer.from_store_id] }),
        queryClient.invalidateQueries({ queryKey: ["inventory", reviewing.transfer.to_store_id] }),
      ]);
      await loadWorkspace();
    } catch (error) {
      toast({ title: "Approval failed", description: describeSupabaseError(error, "Refresh the transfer and try again."), variant: "destructive" });
    } finally {
      setDecidingId(null);
    }
  };

  const openRequestDialog = () => {
    if (!canManageTransfers) return;
    setDestinationId(eligibleDestinations[0]?.id || "");
    setSelectedQuantities({});
    setInventorySearch("");
    setReference("");
    setNotes("");
    setDialogOpen(true);
  };

  const addToRequest = (item: InventoryChoice) => {
    setSelectedQuantities((current) => current[item.id]
      ? current
      : { ...current, [item.id]: 1 });
  };

  const setRequestedQuantity = (item: InventoryChoice, rawQuantity: number) => {
    const quantity = Math.max(0, Math.min(stockSellable(item), Math.floor(rawQuantity || 0)));
    setSelectedQuantities((current) => {
      const next = { ...current };
      if (quantity > 0) next[item.id] = quantity;
      else delete next[item.id];
      return next;
    });
  };

  const sendRequest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentStoreId || !destinationId || !selectedItems.length) return;
    const invalid = selectedItems.find((item) =>
      !Number.isInteger(selectedQuantities[item.id])
      || selectedQuantities[item.id] < 1
      || selectedQuantities[item.id] > stockSellable(item),
    );
    if (invalid) {
      toast({
        title: "Check requested quantities",
        description: `${invalid.product_name} exceeds current sellable stock.`,
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.rpc("create_stock_transfer_request", {
        p_from_store_id: currentStoreId,
        p_to_store_id: destinationId,
        p_reference: reference.trim() || null,
        p_notes: notes.trim() || null,
        p_items: selectedItems.map((item) => ({ inventory_id: item.id, quantity: selectedQuantities[item.id] })),
      });
      if (error) throw error;
      setDialogOpen(false);
      toast({ title: "Transfer sent", description: "The receiving branch can now review each item. Source stock has not changed." });
      await loadWorkspace();
    } catch (error) {
      toast({
        title: "Could not send transfer",
        description: describeSupabaseError(error, "Please refresh and try again."),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const decideItem = async (transfer: TransferRecord, item: StockTransferItem, decision: "approved" | "rejected") => {
    if (decision === "approved") {
      openReview(transfer, item as TransferItem);
      return;
    }
    setDecidingId(item.id);
    try {
      const { error } = await supabase.rpc("decide_stock_transfer_item", {
        p_item_id: item.id,
        p_decision: decision,
      });
      if (error) throw error;
      toast({
        title: "Item rejected",
        description: "Rejected items do not change either branch's stock.",
      });
      await loadWorkspace();
    } catch (error) {
      toast({
        title: "Rejection failed",
        description: describeSupabaseError(error, "Refresh the transfer and try again."),
        variant: "destructive",
      });
    } finally {
      setDecidingId(null);
    }
  };

  const downloadReport = async () => {
    try {
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const period = reportStart || reportEnd
        ? `${reportStart || "Beginning"} to ${reportEnd || "Today"}`
        : "All available dates";
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(18);
      pdf.text("Branch stock transfer report", 14, 17);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.text(`Report range: ${period}`, 14, 24);
      pdf.text(`Generated: ${new Date().toLocaleString()}`, 14, 29);
      pdf.text("Inventory movement only — these transfers are not sales or revenue.", 14, 34);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9);
      pdf.text(`Requests: ${visibleTransfers.length}`, 14, 42);
      pdf.text(`Approved items: ${visibleApproved.length}`, 60, 42);
      pdf.text(`Approved quantity: ${visibleApproved.reduce((sum, item) => sum + Number(item.quantity), 0)}`, 115, 42);
      pdf.text(`Approved cost value: ${fmtCurrency(visibleApproved.reduce((sum, item) => sum + Number(item.quantity) * Number(item.cost_per_unit), 0))}`, 194, 42);

      let y = 51;
      const columns = [14, 47, 79, 117, 149, 182, 215, 254];
      const headings = ["Date", "Reference", "From → To", "Item", "Qty", "Status", "Unit cost", "Line cost"];
      pdf.setFillColor(238, 242, 244);
      pdf.rect(12, y - 5, pageWidth - 24, 8, "F");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8);
      headings.forEach((heading, index) => pdf.text(heading, columns[index], y));
      y += 8;
      pdf.setFont("helvetica", "normal");

      for (const transfer of visibleTransfers) {
        const route = `${branchById.get(transfer.from_store_id)?.store_name || "Sending branch"} → ${branchById.get(transfer.to_store_id)?.store_name || "Receiving branch"}`;
        const items = transfer.items.length ? transfer.items : [null];
        for (const item of items) {
          if (y > pageHeight - 12) {
            pdf.addPage();
            y = 17;
          }
          const status = item?.status || transfer.status;
          const quantity = item ? String(item.quantity) : "—";
          const unitCost = item ? fmtCurrency(Number(item.cost_per_unit)) : "—";
          const lineCost = item && item.status === "approved"
            ? fmtCurrency(Number(item.quantity) * Number(item.cost_per_unit))
            : item ? "Not approved" : "—";
          const row = [
            dateLabel(transfer.created_at),
            transfer.reference || `TR-${transfer.id.slice(-8).toUpperCase()}`,
            route,
            item?.product_name || "No line items",
            quantity,
            item ? status : statusLabel[transfer.status],
            unitCost,
            lineCost,
          ];
          row.forEach((value, index) => {
            const maxWidth = index === 2 ? 36 : index === 3 ? 35 : index === 7 ? 25 : index === 1 ? 30 : 27;
            const text = pdf.splitTextToSize(String(value), maxWidth);
            pdf.text(text[0] || "", columns[index], y);
          });
          y += 6;
          if (transfer.notes && item === items[0]) {
            pdf.setFontSize(7);
            pdf.text(`Notes: ${pdf.splitTextToSize(transfer.notes, pageWidth - 30)[0] || ""}`, 14, y);
            pdf.setFontSize(8);
            y += 5;
          }
        }
      }

      pdf.save(`branch-stock-transfer-report-${new Date().toISOString().slice(0, 10)}.pdf`);
      toast({ title: "Report downloaded", description: "The report is generated locally and contains inventory movement, not sales." });
    } catch (error) {
      toast({
        title: "Could not generate PDF",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  if (!currentStoreId) {
    return (
      <Card>
        <CardHeader><CardTitle>Stock transfers</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">Open a branch to view or send stock transfer requests.</CardContent>
      </Card>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-semibold tracking-tight">Stock transfers</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Request a branch-to-branch stock movement. Pending items do not reduce stock and nothing is recorded as a sale.
          </p>
          {/*
                                  </p>
                                  {item.status === "approved" && item.received_currency && item.branch_currency && item.received_currency !== item.branch_currency && <p className="mt-1 text-xs text-muted-foreground">Received {fmtCurrencyFor(Number(item.received_amount ?? item.cost_per_unit), item.received_currency)} · converted at {Number(item.exchange_rate || 0)} to {item.branch_currency} ({item.exchange_rate_source || "custom"})</p>}
                                </div>
          */}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => void loadWorkspace()} disabled={loading} aria-label="Refresh stock transfers">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
          <Button type="button" onClick={openRequestDialog} disabled={!canManageTransfers || !eligibleDestinations.length || !sellableInventory.length}>
            <Share2 className="mr-2 h-4 w-4" />Share stock
          </Button>
        </div>
      </header>

      <section aria-label="Transfer summary" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="relative flex items-center justify-between gap-4 overflow-hidden border border-amber-300 bg-amber-50/70 p-4 sm:col-span-3 sm:px-5 dark:bg-amber-950/20">
          <div className="flex min-w-0 items-center gap-4">
            <div className="grid h-14 w-14 shrink-0 place-items-center border border-amber-300 bg-background text-2xl font-bold tabular-nums text-amber-800 shadow-sm dark:text-amber-300">
              {loading ? "—" : pendingCount}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-900 dark:text-amber-300">Receiving branch · action needed</p>
              <h2 className="mt-0.5 text-lg font-semibold tracking-tight">Incoming approvals</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">Pending items sent to this branch. Approve or reject each line to decide the stock movement.</p>
            </div>
          </div>
          <Clock3 className="hidden h-7 w-7 shrink-0 text-amber-700 sm:block dark:text-amber-300" />
        </div>
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="flex items-center justify-between gap-3 p-4">
            <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Approved items</p><p className="mt-1 text-2xl font-semibold tabular-nums">{loading ? "—" : approvedItems.length}</p></div>
            <Check className="h-5 w-5 text-emerald-700" />
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-slate-400">
          <CardContent className="flex items-center justify-between gap-3 p-4">
            <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Approved inventory cost value</p><p className="mt-1 text-2xl font-semibold tabular-nums">{loading ? "—" : fmtCurrency(approvedValue)}</p></div>
            <Package className="h-5 w-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </section>

      <section className="rounded-lg border bg-card p-3" aria-label="Transfer report filters">
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative min-w-[190px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search branch, item, or reference" className="pl-9" aria-label="Search transfers" />
          </div>
          <div className="w-44">
            <Label className="mb-1 block text-xs">Request status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger aria-label="Filter transfer status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="partial">Partially reviewed</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label htmlFor="transfer-report-start" className="mb-1 block text-xs">From</Label><Input id="transfer-report-start" type="date" value={reportStart} onChange={(event) => setReportStart(event.target.value)} /></div>
          <div><Label htmlFor="transfer-report-end" className="mb-1 block text-xs">Through</Label><Input id="transfer-report-end" type="date" value={reportEnd} onChange={(event) => setReportEnd(event.target.value)} /></div>
          <Button type="button" variant="outline" onClick={() => void downloadReport()} disabled={loading || !visibleTransfers.length}>
            <Download className="mr-2 h-4 w-4" />Export PDF
          </Button>
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <FileBarChart2 className="h-3.5 w-3.5" />
          {visibleTransfers.length} request{visibleTransfers.length === 1 ? "" : "s"} · {visibleApproved.length} approved item{visibleApproved.length === 1 ? "" : "s"} · {fmtCurrency(visibleApproved.reduce((sum, item) => sum + Number(item.quantity) * Number(item.cost_per_unit), 0))} approved cost value
        </p>
      </section>

      <section className="min-h-0 flex-1 overflow-hidden" aria-label="Branch transfer history">
        <ScrollArea className="h-full pr-3">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-14 text-sm text-muted-foreground" role="status">
              <Loader2 className="h-4 w-4 animate-spin" />Loading branch transfers…
            </div>
          ) : errorMessage ? (
            <div className="border border-destructive/30 bg-destructive/5 p-5 text-sm">
              <p className="font-semibold text-destructive">Transfers could not be loaded</p>
              <p className="mt-1 text-muted-foreground">{errorMessage}</p>
              <Button className="mt-3" variant="outline" onClick={() => void loadWorkspace()}>Try again</Button>
            </div>
          ) : !visibleTransfers.length ? (
            <div className="border border-dashed bg-card px-5 py-14 text-center">
              <ArrowLeftRight className="mx-auto h-8 w-8 text-muted-foreground/60" />
              <p className="mt-3 font-medium">{transfers.length ? "No transfers match these filters" : "No branch transfers yet"}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {transfers.length ? "Adjust the search, status, or date range." : eligibleDestinations.length
                  ? "Send a request to a same-business branch. Source stock remains unchanged while it is pending."
                  : "No other branch under this business is currently available to pair with this branch."}
              </p>
              {!transfers.length && eligibleDestinations.length > 0 && canManageTransfers && (
                <Button className="mt-4" onClick={openRequestDialog} disabled={!sellableInventory.length}>
                  <Plus className="mr-2 h-4 w-4" />Create first transfer
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2 pb-4">
              {visibleTransfers.map((transfer) => {
                const sourceName = branchById.get(transfer.from_store_id)?.store_name || "Sending branch";
                const destinationName = branchById.get(transfer.to_store_id)?.store_name || "Receiving branch";
                const isDestination = transfer.to_store_id === currentStoreId;
                const expanded = expandedId === transfer.id;
                const approved = transfer.items.filter((item) => item.status === "approved");
                const approvedQuantity = approved.reduce((sum, item) => sum + Number(item.quantity), 0);
                return (
                  <article key={transfer.id} className={`overflow-hidden border bg-card ${transfer.status === "pending" && isDestination ? "border-l-4 border-l-amber-400" : ""}`}>
                    <button
                      type="button"
                      className="flex w-full flex-col gap-3 p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center sm:justify-between"
                      aria-expanded={expanded}
                      onClick={() => setExpandedId(expanded ? null : transfer.id)}
                    >
                      <span className="flex min-w-0 items-start gap-3">
                        <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center ${isDestination ? "bg-sky-50 text-sky-800" : "bg-emerald-50 text-emerald-800"}`}>
                          {isDestination ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                        </span>
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-semibold">{transfer.reference || `TR-${transfer.id.slice(-8).toUpperCase()}`}</span>
                            <Badge variant="outline" className={statusClass[transfer.status]}>{statusLabel[transfer.status]}</Badge>
                            <span className="text-xs text-muted-foreground">{isDestination ? "Receiving branch" : "Sending branch"}</span>
                          </span>
                          <span className="mt-2 flex flex-wrap items-center gap-1.5">
                            <span className="inline-flex min-w-0 items-center gap-2 border bg-muted/40 px-2 py-1">
                              <span className="text-[9px] font-bold tracking-wider text-muted-foreground">FROM</span>
                              <span className="max-w-[12rem] truncate text-sm font-medium">{sourceName}</span>
                            </span>
                            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="to" />
                            <span className="inline-flex min-w-0 items-center gap-2 border border-primary/20 bg-primary/5 px-2 py-1">
                              <span className="text-[9px] font-bold tracking-wider text-primary">TO</span>
                              <span className="max-w-[12rem] truncate text-sm font-semibold">{destinationName}</span>
                            </span>
                          </span>
                          <span className="mt-1 block text-xs text-muted-foreground">{dateLabel(transfer.created_at)} · {transfer.items.length} item{transfer.items.length === 1 ? "" : "s"} · {approvedQuantity} approved units</span>
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-3 self-end sm:self-auto">
                        <span className="text-right text-xs text-muted-foreground">{transfer.items.filter((item) => item.status === "pending").length} pending</span>
                        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </span>
                    </button>

                    {expanded && (
                      <div className="border-t bg-muted/15 px-4 py-3">
                        {transfer.notes && <p className="mb-3 whitespace-pre-wrap text-sm text-muted-foreground">{transfer.notes}</p>}
                        {!transfer.items.length ? (
                          <p className="text-sm text-muted-foreground">This request has no item rows.</p>
                        ) : (
                          <div className="space-y-2">
                            {transfer.items.map((item) => (
                              <div key={item.id} className="flex flex-col gap-3 border bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="truncate text-sm font-semibold">{item.product_name}</p>
                                    <Badge variant="outline" className={itemStatusClass[item.status]}>{item.status}</Badge>
                                  </div>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    Requested {item.quantity} · source sellable at send {item.available_quantity_at_request} · cost {fmtCurrency(Number(item.cost_per_unit))}
                                  </p>
                                  {item.status === "approved" && <p className="mt-1 text-xs font-medium text-emerald-800">Approved value: {fmtCurrency(Number(item.quantity) * Number(item.cost_per_unit))} · inventory movement only</p>}
                                </div>
                                {isDestination && item.status === "pending" && (
                                  <div className="flex shrink-0 gap-2">
                                    <Button type="button" size="sm" onClick={() => void decideItem(transfer, item, "approved")} disabled={decidingId === item.id}>
                                      {decidingId === item.id ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}Approve
                                    </Button>
                                    <Button type="button" size="sm" variant="outline" onClick={() => void decideItem(transfer, item, "rejected")} disabled={decidingId === item.id}>
                                      {decidingId === item.id ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <XCircle className="mr-1.5 h-4 w-4" />}Reject
                                    </Button>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </section>

      <Dialog open={Boolean(reviewing)} onOpenChange={(open) => !open && setReviewing(null)}>
        <DialogContent className="max-h-[calc(100dvh-1rem)] max-w-lg overflow-y-auto !pb-10">
          <DialogHeader>
            <DialogTitle>Review and complete item</DialogTitle>
            <DialogDescription>
              Set the receiving branch selling prices before this item is added to inventory. The original received currency stays on the transfer record.
            </DialogDescription>
          </DialogHeader>
          {reviewing && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="font-semibold">{reviewing.item.product_name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{reviewing.item.quantity} unit{Number(reviewing.item.quantity) === 1 ? "" : "s"} · {reviewSourceCurrency} received → {reviewBranchCurrency} branch currency</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-md border bg-background p-2.5"><p className="text-[11px] text-muted-foreground">Received cost / unit</p><p className="font-semibold tabular-nums">{fmtCurrencyFor(Number(reviewing.item.received_amount ?? reviewing.item.cost_per_unit), reviewSourceCurrency)}</p></div>
                  <div className="rounded-md border bg-background p-2.5"><p className="text-[11px] text-muted-foreground">Converted cost / unit</p><p className="font-semibold tabular-nums">{fmtCurrencyFor((Number(reviewing.item.received_amount ?? reviewing.item.cost_per_unit) || 0) * (Number(reviewRate) || 0), reviewBranchCurrency)}</p></div>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><Label htmlFor="transfer-retail-price">Retail price ({reviewBranchCurrency}) *</Label><Input id="transfer-retail-price" type="number" min="0" step="0.01" inputMode="decimal" value={reviewRetailPrice} onChange={(event) => setReviewRetailPrice(event.target.value)} placeholder="0.00" /></div>
                <div className="space-y-1.5"><Label htmlFor="transfer-wholesale-price">Wholesale price ({reviewBranchCurrency}) *</Label><Input id="transfer-wholesale-price" type="number" min="0" step="0.01" inputMode="decimal" value={reviewWholesalePrice} onChange={(event) => setReviewWholesalePrice(event.target.value)} placeholder="0.00" /></div>
              </div>
              <div className="space-y-2 rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2"><div><Label>Currency conversion</Label><p className="text-xs text-muted-foreground">1 {reviewSourceCurrency} equals how many {reviewBranchCurrency}?</p></div>{reviewSourceCurrency === reviewBranchCurrency && <Badge variant="secondary">Same currency</Badge>}</div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant={reviewRateSource === "custom" ? "default" : "outline"} onClick={() => setReviewRateSource("custom")}>Custom rate</Button>
                  <Button type="button" size="sm" variant={reviewRateSource === "online" ? "default" : "outline"} onClick={() => { setReviewRateSource("online"); void loadOnlineRate(); }} disabled={rateLoading || reviewSourceCurrency === reviewBranchCurrency}>{rateLoading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}Online rate</Button>
                </div>
                <div className="space-y-1.5"><Label htmlFor="transfer-exchange-rate">Exchange rate *</Label><Input id="transfer-exchange-rate" type="number" min="0.000001" step="0.000001" inputMode="decimal" value={reviewRate} onChange={(event) => { setReviewRate(event.target.value); setReviewRateSource("custom"); }} disabled={reviewSourceCurrency === reviewBranchCurrency} /><p className="text-xs text-muted-foreground">Rate source: {reviewRateSource === "online" ? "online reference" : "custom entered rate"}. You can replace an online rate.</p></div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReviewing(null)}>Cancel</Button>
            <Button type="button" onClick={() => void approveReviewedItem()} disabled={!reviewing || decidingId === reviewing?.item.id || rateLoading}>
              {decidingId === reviewing?.item.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}Approve and complete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Send className="h-5 w-5" />Send stock transfer request</DialogTitle>
            <DialogDescription>
              This persists a request for a same-business branch. Inventory changes only when each receiving-branch item is approved.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => void sendRequest(event)} className="flex min-h-0 flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Sending branch</Label>
                <Input value={branchById.get(currentStoreId)?.store_name || "Current branch"} readOnly aria-label="Sending branch" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="transfer-destination">Receiving branch *</Label>
                <Select value={destinationId} onValueChange={setDestinationId}>
                  <SelectTrigger id="transfer-destination"><SelectValue placeholder="Choose a same-business branch" /></SelectTrigger>
                  <SelectContent>
                    {eligibleDestinations.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.store_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="transfer-reference">Reference (optional)</Label><Input id="transfer-reference" value={reference} onChange={(event) => setReference(event.target.value)} maxLength={100} placeholder="e.g. BR-04 replenishment" /></div>
              <div className="space-y-1.5"><Label htmlFor="transfer-notes">Notes (optional)</Label><Input id="transfer-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} placeholder="Add hand-off instructions" /></div>
            </div>
            <div className="flex min-h-0 flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <div><Label>Items to send</Label><p className="text-xs text-muted-foreground">Available quantities exclude damaged stock; pending transfers do not reserve units.</p></div>
                <span className="text-xs font-medium text-muted-foreground">{selectedItems.length} selected</span>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={inventorySearch} onChange={(event) => setInventorySearch(event.target.value)} placeholder="Find source inventory" className="pl-9" aria-label="Search source inventory" />
              </div>
              <ScrollArea className="h-44 rounded-md border">
                <div className="divide-y">
                  {!availableInventory.length ? (
                    <p className="p-4 text-center text-sm text-muted-foreground">{inventory.length ? "No sellable stock matches this search." : "No positive stock is available at this branch."}</p>
                  ) : availableInventory.map((item) => {
                    const quantity = selectedQuantities[item.id] || 0;
                    return (
                      <div key={item.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{item.product_name}</p>
                          <p className="text-xs text-muted-foreground">{item.category}{item.size ? ` · ${item.size}` : ""} · {stockSellable(item)} sellable</p>
                        </div>
                        {quantity ? (
                          <div className="flex shrink-0 items-center gap-2">
                            <Input aria-label={`${item.product_name} quantity`} type="number" inputMode="numeric" min="1" max={stockSellable(item)} step="1" value={quantity} onChange={(event) => setRequestedQuantity(item, Number(event.target.value))} className="h-9 w-20" />
                            <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${item.product_name}`} onClick={() => setRequestedQuantity(item, 0)}><X className="h-4 w-4" /></Button>
                          </div>
                        ) : (
                          <Button type="button" size="sm" variant="outline" onClick={() => addToRequest(item)}><Plus className="mr-1 h-4 w-4" />Add</Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
              {selectedItems.length > 0 && (
                <div className="max-h-28 space-y-1 overflow-y-auto border-l-2 border-primary/40 pl-3">
                  {selectedItems.map((item) => (
                    <p key={item.id} className="text-xs text-muted-foreground">{selectedQuantities[item.id]} × {item.product_name} <span className="text-foreground/70">({stockSellable(item)} currently sellable)</span></p>
                  ))}
                </div>
              )}
            </div>
            <DialogFooter className="border-t pt-3">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={submitting || !destinationId || !selectedItems.length}>
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                {submitting ? "Sharing…" : "Share with branch"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BranchStockTransfers;
