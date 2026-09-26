import { useState, useMemo, useCallback } from "react";
import { fmtCurrency } from "@/lib/currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Search, Plus, Trash2, Clock, User,
  CheckCircle2, XCircle, ShoppingCart
} from "lucide-react";
import { StockItem, Product } from "@/types";
import { useToast } from "@/hooks/use-toast";

export interface PendingSale {
  id: string;
  customerName: string;
  customerPhone: string;
  products: Product[];
  total: number;
  createdAt: string;
  storeId: string;
}

const STORAGE_KEY = (storeId: string) => `zuripos_pending_sales_${storeId}`;

export function loadPending(storeId: string): PendingSale[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY(storeId)) || "[]"); } catch { return []; }
}

function savePending(storeId: string, list: PendingSale[]) {
  try { localStorage.setItem(STORAGE_KEY(storeId), JSON.stringify(list)); } catch {}
}

interface PendingSalesProps {
  stockData: StockItem[];
  currentStoreId: string | null;
  salesHistory: any[];
  isLoadingHistory: boolean;
  onComplete: (sale: PendingSale) => void;
}

export default function PendingSales({ stockData, currentStoreId, salesHistory, isLoadingHistory, onComplete }: PendingSalesProps) {
  const { toast } = useToast();
  const storeId = currentStoreId || "default";

  const [pendingList, setPendingList] = useState<PendingSale[]>(() => loadPending(storeId));
  const [view, setView] = useState<"list" | "create">("list");

  // Create form state
  const [custName, setCustName] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [cart, setCart] = useState<Product[]>([]);

  const filteredStock = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return [];
    return stockData.filter(s =>
      s.productName.toLowerCase().includes(q) ||
      (s.barcode && s.barcode.toLowerCase().includes(q))
    ).slice(0, 8);
  }, [stockData, searchTerm]);

  const cartTotal = cart.reduce((s, p) => s + p.quantity * p.sellingPrice, 0);

  const addToCart = useCallback((item: StockItem) => {
    setCart(prev => {
      const existing = prev.find(p => p.productName === item.productName && p.sellType === "item");
      if (existing) {
        return prev.map(p => p.productName === item.productName && p.sellType === "item"
          ? { ...p, quantity: p.quantity + 1 } : p);
      }
      return [...prev, {
        id: item.id,
        productName: item.productName,
        quantity: 1,
        sellingPrice: item.retail_price || 0,
        sellType: "item" as const,
        itemsPerSachet: item.items_per_sachet || 1,
        price: item.retail_price || 0,
      }];
    });
    setSearchTerm("");
  }, []);

  const removeFromCart = (name: string) => setCart(prev => prev.filter(p => p.productName !== name));
  const updateQty = (name: string, qty: number) => setCart(prev => prev.map(p => p.productName === name ? { ...p, quantity: Math.max(1, qty) } : p));

  const savePendingSale = () => {
    if (!custName.trim()) { toast({ title: "Customer name required", variant: "destructive" }); return; }
    if (cart.length === 0) { toast({ title: "Add at least one product", variant: "destructive" }); return; }
    const newSale: PendingSale = {
      id: Math.random().toString(36).slice(2, 10).toUpperCase(),
      customerName: custName.trim(),
      customerPhone: custPhone.trim(),
      products: cart,
      total: cartTotal,
      createdAt: new Date().toISOString(),
      storeId,
    };
    const updated = [...pendingList, newSale];
    setPendingList(updated);
    savePending(storeId, updated);
    setCustName(""); setCustPhone(""); setCart([]); setSearchTerm("");
    setView("list");
    toast({ title: "✓ Pending sale saved", description: `${cart.length} items for ${newSale.customerName}` });
  };

  const cancelPending = (id: string) => {
    const updated = pendingList.filter(s => s.id !== id);
    setPendingList(updated);
    savePending(storeId, updated);
    toast({ title: "Pending sale cancelled" });
  };

  const completePending = (sale: PendingSale) => {
    const updated = pendingList.filter(s => s.id !== sale.id);
    setPendingList(updated);
    savePending(storeId, updated);
    onComplete(sale);
    toast({ title: "✓ Pending sale moved to checkout", description: `${sale.customerName}'s sale is ready to complete` });
  };

  const fmtTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " +
      d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="flex h-full min-h-0 flex-col space-y-4">
      {/* Sub-nav */}
      <div className="flex items-center gap-2 border-b pb-3">
        {[
          { key: "list", label: `Pending (${pendingList.length})`, icon: Clock },
          { key: "create", label: "Create Pending", icon: Plus },
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setView(key as any)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${view === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>

      {/* LIST VIEW */}
      {view === "list" && (
        <div className="space-y-3">
          {pendingList.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p className="font-medium">No pending sales</p>
              <p className="text-sm mt-1">Create one for customers who want to pay later</p>
              <Button className="mt-4" onClick={() => setView("create")}><Plus className="h-4 w-4 mr-2" />Create Pending Sale</Button>
            </div>
          ) : (
            <ScrollArea className="min-h-0 flex-1" type="auto">
              <div className="space-y-3 pr-2">
                {pendingList.map(sale => (
                  <Card key={sale.id} className="overflow-hidden hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between px-4 py-2 bg-amber-50 border-b border-amber-100">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono text-xs border-amber-300 text-amber-700">#{sale.id}</Badge>
                        <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />{fmtTime(sale.createdAt)}</span>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700 gap-1" onClick={() => completePending(sale)}>
                          <CheckCircle2 className="h-3.5 w-3.5" />Complete
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive gap-1" onClick={() => cancelPending(sale.id)}>
                          <XCircle className="h-3.5 w-3.5" />Cancel
                        </Button>
                      </div>
                    </div>
                    <CardContent className="py-3 px-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="font-semibold">{sale.customerName}</span>
                          {sale.customerPhone && <span className="text-xs text-muted-foreground">{sale.customerPhone}</span>}
                        </div>
                        <div className="text-right">
                          <p className="text-base font-bold text-primary">{fmtCurrency(sale.total)}</p>
                          <p className="text-xs text-muted-foreground">{sale.products.length} product{sale.products.length !== 1 ? "s" : ""}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {sale.products.map((p, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {p.quantity}× {p.productName}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      )}

      {/* CREATE VIEW */}
      {view === "create" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left — customer + search */}
          <div className="space-y-3">
            <Card>
              <CardHeader className="pb-2 pt-3"><CardTitle className="text-base flex items-center gap-2"><User className="h-4 w-4" />Customer</CardTitle></CardHeader>
              <CardContent className="space-y-2 pt-0">
                <div>
                  <Label className="text-xs">Name *</Label>
                  <Input value={custName} onChange={e => setCustName(e.target.value)} placeholder="Customer name" className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Phone (optional)</Label>
                  <Input value={custPhone} onChange={e => setCustPhone(e.target.value)} placeholder="Phone number" className="mt-1" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2 pt-3"><CardTitle className="text-base flex items-center gap-2"><Search className="h-4 w-4" />Search Products</CardTitle></CardHeader>
              <CardContent className="pt-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search by name or barcode..." className="pl-9" />
                </div>
                {filteredStock.length > 0 && (
                  <div className="mt-2 border rounded-lg overflow-hidden">
                    {filteredStock.map(item => (
                      <div key={item.id} className="flex items-center justify-between p-2.5 hover:bg-muted/50 cursor-pointer border-b last:border-b-0" onClick={() => addToCart(item)}>
                        <div>
                          <p className="text-sm font-medium">{item.productName}</p>
                          <p className="text-xs text-muted-foreground">{item.quantity} in stock · {fmtCurrency((item.retail_price || 0))}</p>
                        </div>
                        <Plus className="h-4 w-4 text-primary shrink-0" />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right — cart */}
          <div className="space-y-3">
            <Card className="flex flex-col" style={{ minHeight: 300 }}>
              <CardHeader className="pb-2 pt-3 shrink-0">
                <CardTitle className="text-base flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4" />Cart ({cart.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 pt-0">
                {cart.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-20" />
                    Search and add products
                  </div>
                ) : (
                  <div className="space-y-2">
                    {cart.map(p => (
                      <div key={p.productName} className="flex items-center gap-2 p-2 border rounded-lg text-sm">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{p.productName}</p>
                          <p className="text-xs text-muted-foreground">{fmtCurrency(p.sellingPrice)} each</p>
                        </div>
                        <Input type="number" min="1" value={p.quantity} onChange={e => updateQty(p.productName, +e.target.value)} className="w-14 h-7 text-xs text-center" />
                        <p className="text-xs font-semibold w-24 text-right whitespace-nowrap">{fmtCurrency((p.quantity * p.sellingPrice))}</p>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" onClick={() => removeFromCart(p.productName)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {cart.length > 0 && (
              <div className="flex items-center justify-between px-3 py-2 bg-primary/5 rounded-xl border">
                <div>
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="text-xl font-bold text-primary">{fmtCurrency(cartTotal)}</p>
                </div>
                <p className="text-xs text-muted-foreground">{cart.reduce((s, p) => s + p.quantity, 0)} items</p>
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { setCustName(""); setCustPhone(""); setCart([]); setView("list"); }}>Cancel</Button>
              <Button className="flex-1 bg-amber-500 hover:bg-amber-600" onClick={savePendingSale}>
                <Clock className="h-4 w-4 mr-2" />Save Pending
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* HISTORY VIEW removed — use the History tab instead */}
    </div>
  );
}
