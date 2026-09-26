import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BarChart3, Check, Download, Mail, Palette, Printer, RefreshCw, Search, Send, Settings2, Upload, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fmtCurrency } from "@/lib/currency";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import StatCard from "@/components/StatCard";
import { PageLoader, useMinimumLoading } from "@/components/ui/loading-spinner";

type Supplier = { id: string; name: string; email: string | null; address?: string | null };
type InventoryRow = { supplier_id?: string | null; supplier?: string | null; supplier_name?: string | null; product_name?: string; productName?: string; cost_per_unit?: number; costPerUnit?: number; quantity?: number; min_stock_level?: number; reorder_quantity?: number };
type ReportRow = Supplier & { items: number; sales: number; cost: number; fee: number; sent: boolean; products: Array<{ name: string; quantity: number; sales: number; cost: number }>; restockProducts: string[] };
type ReportTemplate = {
  companyName: string;
  address: string;
  email: string;
  phone: string;
  rightBrand: string;
  rightCaption: string;
  title: string;
  subtitle: string;
  accent: string;
  navy: string;
  logoDataUrl: string;
  companyDetailsTitle: string;
  thankYou: string;
  footerText: string;
  signature: string;
};
type EmailProvider = "gmail" | "outlook" | "device";

const defaultEmailProviderLinks: Record<EmailProvider, string> = {
  gmail: "https://mail.google.com/mail/u/0/?view=cm&fs=1",
  outlook: "https://outlook.live.com/mail/0/deeplink/compose",
  device: "mailto:",
};

const defaultTemplate: ReportTemplate = {
  companyName: "Your Company Name",
  address: "Company address",
  email: "company@example.com",
  phone: "+256 700 000000",
  rightBrand: "Your Brand",
  rightCaption: "QUALITY · TRUST · SERVICE",
  title: "SUPPLIERS SALES REPORT",
  subtitle: "Track supplier performance and sales contribution",
  accent: "#d6a437",
  navy: "#0d3157",
  logoDataUrl: "",
  companyDetailsTitle: "Company Details",
  thankYou: "Thank you for your continued business.",
  footerText: "QUALITY PRODUCTS · LASTING IMPRESSIONS",
  signature: "Best Regards,",
};

const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const money = (value: unknown) => Number(value) || 0;
const getProducts = (sale: any): any[] => {
  const raw = sale.products ?? sale.items ?? sale.sale_items ?? [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") { try { const parsed = JSON.parse(raw); return Array.isArray(parsed) ? parsed : []; } catch { return []; } }
  return [];
};

interface SupplierReportsProps { currentStoreId?: string | null; onBack?: () => void; }

const EmailProviderLinkSettings = ({
  provider,
  link,
  onProviderChange,
  onLinkChange,
  onSave,
}: {
  provider: EmailProvider;
  link: string;
  onProviderChange: (provider: EmailProvider) => void;
  onLinkChange: (link: string) => void;
  onSave: () => void;
}) => {
  const [open, setOpen] = useState(false);
  return <>
    <Button variant="outline" size="sm" onClick={() => setOpen(true)}><Settings2 className="mr-2 h-4 w-4" />Email link</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Email provider link</DialogTitle></DialogHeader><div className="space-y-4"><p className="text-sm text-muted-foreground">Save the provider login or compose link used for future supplier emails. Zuri stores the link only; sign in on the provider page when it opens.</p><div className="space-y-2"><Label>Email provider</Label><Select value={provider} onValueChange={value => onProviderChange(value as EmailProvider)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="gmail">Gmail</SelectItem><SelectItem value="outlook">Outlook</SelectItem><SelectItem value="device">Installed/default mail app</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label htmlFor="supplier-email-provider-link">Provider link</Label><Input id="supplier-email-provider-link" type="url" value={link} onChange={event => onLinkChange(event.target.value)} /><p className="text-xs text-muted-foreground">Use the normal login or compose URL for this provider.</p></div><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={() => { onSave(); setOpen(false); }}>Save link</Button></div></div></DialogContent></Dialog>
  </>;
};

const SupplierReports = ({ currentStoreId, onBack }: SupplierReportsProps) => {
  const { toast } = useToast();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [month, setMonth] = useState("all");
  const [loading, setLoading] = useState(false);
  const [fees, setFees] = useState<Record<string, string>>({});
  const [sent, setSent] = useState<Record<string, boolean>>(() => { try { return JSON.parse(localStorage.getItem("zuri_supplier_reports_sent") || "{}"); } catch { return {}; } });
  const [emailOpen, setEmailOpen] = useState(false);
  const [message, setMessage] = useState("Hello {supplier},\n\nPlease find your supplier sales report attached. Thank you for working with us.");
  const [stockMessage, setStockMessage] = useState(() => localStorage.getItem("zuri_supplier_restock_message") || "Hello {supplier},\n\nPlease arrange restock for these brands that are at or below their minimum level:\n{restock}\n\nThank you.");
  const [selection, setSelection] = useState<Record<string, boolean>>({});
  const [restockSelection, setRestockSelection] = useState<Record<string, boolean>>({});
  const [restockEditorOpen, setRestockEditorOpen] = useState(false);
  const [template, setTemplate] = useState<ReportTemplate>(() => { try { return { ...defaultTemplate, ...JSON.parse(localStorage.getItem("zuri_supplier_report_template") || "{}") }; } catch { return defaultTemplate; } });
  const [templateOpen, setTemplateOpen] = useState(false);
  const [attachOnSend, setAttachOnSend] = useState(true);
  const [previewSupplierId, setPreviewSupplierId] = useState("");
  const [emailProvider, setEmailProvider] = useState<EmailProvider>("gmail");
  const [emailLinkOpen, setEmailLinkOpen] = useState(false);
  const [emailProviderLinks, setEmailProviderLinks] = useState<Record<EmailProvider, string>>(() => {
    try {
      return { ...defaultEmailProviderLinks, ...JSON.parse(localStorage.getItem("zuri_supplier_email_provider_links") || "{}") };
    } catch { return defaultEmailProviderLinks; }
  });
  const [supplierQuery, setSupplierQuery] = useState("");
  const [supplierSort, setSupplierSort] = useState<"name" | "location">("location");
  const [popupRequest, setPopupRequest] = useState<"print" | "combined" | "email" | null>(null);
  const [pendingPrintReports, setPendingPrintReports] = useState<ReportRow[]>([]);
  const [pendingEmailTargets, setPendingEmailTargets] = useState<ReportRow[]>([]);
  const showLoader = useMinimumLoading(loading, 350);

  useEffect(() => {
    const key = `zuri_supplier_email_provider_links_${currentStoreId || "default"}`;
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "{}");
      setEmailProviderLinks({ ...defaultEmailProviderLinks, ...saved });
    } catch { setEmailProviderLinks(defaultEmailProviderLinks); }
  }, [currentStoreId]);

  const saveEmailProviderLinks = () => {
    const key = `zuri_supplier_email_provider_links_${currentStoreId || "default"}`;
    localStorage.setItem(key, JSON.stringify(emailProviderLinks));
    toast({ title: "Email link saved", description: "This provider link will be used for future supplier email drafts on this device." });
  };

  const saveTemplate = () => {
    localStorage.setItem("zuri_supplier_report_template", JSON.stringify(template));
    setTemplateOpen(false);
    toast({ title: "Report template saved", description: "Your branding and wording will be used for future supplier reports." });
  };

  const updateTemplate = <K extends keyof ReportTemplate>(key: K, value: ReportTemplate[K]) => setTemplate(current => ({ ...current, [key]: value }));

  const handleLogo = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => updateTemplate("logoDataUrl", String(reader.result || ""));
    reader.readAsDataURL(file);
  };

  const load = async () => {
    if (!currentStoreId) return;
    setLoading(true);
    try {
      const [supplierResult, inventoryResult, salesResult, storeResult] = await Promise.all([
        supabase.from("suppliers").select("id, name, email, address").eq("store_id", currentStoreId).order("name"),
        supabase.from("inventory").select("*").eq("store_id", currentStoreId),
        supabase.from("sales").select("*").eq("store_id", currentStoreId).order("date_of_sale", { ascending: false }),
        supabase.from("stores").select("store_name").eq("id", currentStoreId).maybeSingle(),
      ]);
      if (supplierResult.error) throw supplierResult.error;
      if (inventoryResult.error) throw inventoryResult.error;
      if (salesResult.error) throw salesResult.error;
      setSuppliers((supplierResult.data || []) as Supplier[]);
      setInventory((inventoryResult.data || []) as InventoryRow[]);
      setSales(salesResult.data || []);
      if (storeResult.data?.store_name) setTemplate(current => current.companyName === defaultTemplate.companyName ? { ...current, companyName: storeResult.data.store_name, rightBrand: storeResult.data.store_name } : current);
    } catch (error: any) { toast({ title: "Could not load supplier reports", description: error.message, variant: "destructive" }); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [currentStoreId]);

  const months = useMemo(() => Array.from(new Set(sales.map(s => String(s.date_of_sale || s.created_at || "").slice(0, 7)).filter(Boolean))).sort().reverse(), [sales]);
  const reports = useMemo<ReportRow[]>(() => suppliers.map(supplier => {
    const owned = inventory.filter(item => item.supplier_id === supplier.id || String(item.supplier_name || item.supplier || "").toLowerCase() === supplier.name.toLowerCase());
    const byName = new Map(owned.map(item => [String(item.product_name || item.productName || "").toLowerCase(), item]));
    const products = new Map<string, { name: string; quantity: number; sales: number; cost: number }>();
    sales.filter(sale => month === "all" || String(sale.date_of_sale || sale.created_at || "").slice(0, 7) === month).forEach(sale => getProducts(sale).forEach(item => {
      const name = String(item.product_name || item.productName || item.name || "");
      const stock = byName.get(name.toLowerCase());
      if (!stock) return;
      const quantity = money(item.quantity || item.qty || 1);
      const salesAmount = money(item.total || item.total_amount || item.subtotal || item.price || item.sellingPrice) * (item.total || item.total_amount || item.subtotal ? 1 : quantity);
      const cost = quantity * money(stock.cost_per_unit ?? stock.costPerUnit);
      const current = products.get(name) || { name, quantity: 0, sales: 0, cost: 0 };
      products.set(name, { name, quantity: current.quantity + quantity, sales: current.sales + salesAmount, cost: current.cost + cost });
    }));
    const productRows = [...products.values()];
    const restockProducts = owned.filter(item => Number(item.quantity || 0) <= Number(item.min_stock_level || 0)).map(item => String(item.product_name || item.productName || "")).filter(Boolean);
    return { ...supplier, items: productRows.reduce((sum, p) => sum + p.quantity, 0), sales: productRows.reduce((sum, p) => sum + p.sales, 0), cost: productRows.reduce((sum, p) => sum + p.cost, 0), fee: money(fees[supplier.id]), sent: !!sent[supplier.id], products: productRows, restockProducts };
  }), [suppliers, inventory, sales, month, fees, sent]);

  const activeReports = reports.filter(r => r.items > 0);
  const visibleReports = reports.filter(r => {
    const q = supplierQuery.trim().toLowerCase();
    return !q || r.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q) || (r.email || "").toLowerCase().includes(q);
  }).sort((a, b) => supplierSort === "location"
    ? `${(suppliers.find(s => s.id === a.id)?.address || "ZZZ").toLowerCase()}-${a.name.toLowerCase()}`.localeCompare(`${(suppliers.find(s => s.id === b.id)?.address || "ZZZ").toLowerCase()}-${b.name.toLowerCase()}`)
    : a.name.localeCompare(b.name));
  const previewReport = reports.find(r => r.id === previewSupplierId) || reports[0];
  const updateSent = (ids: string[]) => { const next = { ...sent, ...Object.fromEntries(ids.map(id => [id, true])) }; setSent(next); localStorage.setItem("zuri_supplier_reports_sent", JSON.stringify(next)); };
  const reportHtml = (report: ReportRow) => {
    const rows = report.products.map((p, index) => `<tr><td>${index + 1}</td><td>${p.name}</td><td>${p.quantity}</td><td>${fmtCurrency(p.cost / Math.max(p.quantity, 1))}</td><td>${fmtCurrency(p.sales)}</td></tr>`).join("") || `<tr><td></td><td>No sales recorded for this period</td><td>0</td><td>${fmtCurrency(0)}</td><td>${fmtCurrency(0)}</td></tr>`;
    const logo = template.logoDataUrl ? `<img class="logo" src="${template.logoDataUrl}" alt="Company logo" />` : `<div class="logo-mark">✦</div>`;
    return `<div class="page" style="--navy:${template.navy};--accent:${template.accent}"><div class="top-band"></div><header class="header"><div class="brand">${logo}<div class="company"><h1>${template.companyName}</h1><p>${template.address}</p><div class="contact"><span>✉ ${template.email}</span><span>☎ ${template.phone}</span></div></div></div><div class="brand-right"><div class="script">${template.rightBrand}</div><small>${template.rightCaption}</small></div></header><section class="title-row"><div class="title"><h2>${template.title}</h2><p>${template.subtitle}</p></div><div class="date-box"><strong>📅 Report Period:</strong><span>${month === "all" ? "All months" : month}</span></div></section><section class="info-box"><div class="info-col"><div class="info-title">🏢 ${template.companyDetailsTitle}</div><p>${template.companyName}</p><p>Tel: <span class="blue">${template.phone}</span></p><p>Email: ${template.email}</p></div><div class="info-col"><div class="supplier-field"><span class="label">Supplier Name:</span><span class="line">${report.name}</span></div><div class="supplier-field"><span class="label">Supplier Report #:</span><span>SR-${report.id.slice(0, 8).toUpperCase()}</span></div><div class="supplier-field"><span class="label">Generated:</span><span>${new Date().toLocaleDateString()}</span></div></div></section><table><thead><tr><th>#</th><th>Description</th><th>Quantity</th><th>Unit Cost</th><th>Total Sales</th></tr></thead><tbody>${rows}</tbody></table><section class="totals"><div class="total-line"><strong>Items sold</strong><span>${report.items}</span></div><div class="total-line"><strong>Sales total</strong><span>${fmtCurrency(report.sales)}</span></div><div class="total-line"><strong>Cost price</strong><span>${fmtCurrency(report.cost)}</span></div><div class="total-line"><strong>Fee</strong><span>${fmtCurrency(report.fee)}</span></div><div class="grand"><span>Grand Total</span><span>${fmtCurrency(report.sales + report.fee)}</span></div></section><section class="bottom"><div class="thanks"><strong>${template.thankYou}</strong>We appreciate your continued partnership.</div><div class="signature"><div class="sign">${template.signature}</div><div class="rule">${template.companyName}</div></div></section><div class="footer-wave"></div><div class="footer-text">${template.footerText}</div></div>`;
  };

  const reportDocument = (report: ReportRow) => `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${report.name} - ${template.title}</title><style>@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;background:#e9edf2;font-family:"Segoe UI",Arial,sans-serif;color:#12345b}.page{width:210mm;min-height:297mm;margin:20px auto;background:#fff;position:relative;overflow:hidden;padding:10mm 10mm 13mm;box-shadow:0 8px 30px rgba(0,0,0,.12)}.top-band{position:absolute;top:-38mm;right:-18mm;width:105mm;height:58mm;background:var(--navy);border-radius:0 0 0 100%;border-bottom:3px solid var(--accent);transform:rotate(-3deg)}.top-band:after{content:"";position:absolute;left:-10mm;bottom:-3px;width:120mm;height:3px;background:var(--accent)}.header{display:flex;justify-content:space-between;align-items:flex-start;position:relative;z-index:2;min-height:34mm}.brand{display:flex;align-items:flex-start;gap:8px}.logo,.logo-mark{width:25mm;height:25mm;margin-top:1mm;object-fit:contain}.logo-mark{display:flex;align-items:center;justify-content:center;color:var(--accent);font-size:34px}.company h1{margin:0;font-size:23px;letter-spacing:.2px;color:var(--navy)}.company p{margin:3px 0;font-size:11px;color:#315070}.contact{display:flex;gap:18px;margin-top:5px;font-size:10px}.contact span{white-space:nowrap}.brand-right{color:white;text-align:right;padding:7mm 4mm 0 0;width:62mm;position:relative;z-index:3}.brand-right .script{font-family:"Brush Script MT","Segoe Script",cursive;font-size:17px}.brand-right small{display:block;margin-top:5px;font-size:7px;letter-spacing:2px}.title-row{display:flex;justify-content:space-between;align-items:center;margin-top:5mm;border-bottom:1px solid var(--accent);padding-bottom:5mm}.title h2{margin:0;font-size:27px;color:var(--navy);letter-spacing:.3px}.title p{margin:4px 0 0;font-size:11px;color:#536b83}.date-box{background:#fff6e3;border-radius:10px;padding:9px 14px;min-width:64mm;border:1px solid #f0dfb7}.date-box strong{display:block;font-size:10px;margin-bottom:4px}.date-box span{font-size:12px;font-weight:700}.info-box{margin-top:7mm;padding:7mm;background:linear-gradient(90deg,#f2f7fc,#fbfdff);border-radius:10px;display:grid;grid-template-columns:1fr 1fr;gap:10mm}.info-col+.info-col{border-left:1px solid #b9c9d8;padding-left:10mm}.info-title{font-weight:800;font-size:13px;margin-bottom:6px}.info-col p{margin:4px 0;font-size:11px}.label{font-weight:800;color:var(--navy)}.supplier-field{display:grid;grid-template-columns:36mm 1fr;margin:6px 0;font-size:11px}.line{border-bottom:1px solid #9eb1c3;min-height:16px}.blue{color:#1767c2}table{width:100%;border-collapse:collapse;margin-top:7mm;font-size:10.5px}thead th{background:var(--navy);color:#fff;padding:9px 8px;text-align:left;font-size:10px}thead th:first-child{width:10mm;text-align:center}tbody td{height:11mm;padding:7px 8px;border:1px solid #d5e0ea;color:#183a5c}tbody tr:nth-child(even) td{background:#f5f8fb}tbody td:first-child,tbody td:nth-child(3){text-align:center}tbody td:nth-child(4),tbody td:nth-child(5){text-align:right;white-space:nowrap}.totals{width:47%;margin-left:auto;margin-top:5mm;background:#f4f8fc;border-radius:9px;padding:4mm 5mm 0}.total-line{display:flex;justify-content:space-between;padding:6px 0;font-size:11px}.grand{margin:4px -5mm 0;padding:10px 5mm;background:#fff0c9;border-top:1px solid var(--accent);border-radius:8px;display:flex;justify-content:space-between;font-weight:900;font-size:17px;color:var(--navy)}.bottom{display:flex;justify-content:space-between;align-items:flex-end;margin-top:7mm}.thanks{max-width:105mm;border-left:2px solid var(--accent);padding-left:8px;font-size:11px;line-height:1.45;font-style:italic}.thanks strong{display:block;font-size:13px;margin-bottom:3px}.signature{text-align:right;min-width:55mm}.signature .sign{font-family:"Brush Script MT","Segoe Script",cursive;font-size:20px;margin-bottom:4px}.signature .rule{border-top:1px solid #60778d;padding-top:5px;font-weight:700;font-size:10px}.footer-wave{position:absolute;bottom:-28mm;left:-10mm;width:230mm;height:55mm;background:var(--navy);border-radius:50% 50% 0 0 / 45% 45% 0 0;border-top:4px solid var(--accent)}.footer-text{position:absolute;bottom:5mm;left:12mm;z-index:4;color:white;font-size:8px;letter-spacing:2px}@media print{body{background:white}.page{margin:0;box-shadow:none}}</style></head><body>${reportHtml(report)}</body></html>`;

  const performPrint = (rows: ReportRow[]) => {
    const win = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
    if (!win) { toast({ title: "Allow popups to generate the PDF", variant: "destructive" }); return; }
    win.document.write(rows.map(reportDocument).join("<div style='page-break-after:always'></div>")); win.document.close(); win.focus(); win.print();
  };
  const combinedReportDocument = (rows: ReportRow[]) => {
    const totalItems = rows.reduce((sum, row) => sum + row.items, 0);
    const totalSales = rows.reduce((sum, row) => sum + row.sales, 0);
    const totalCost = rows.reduce((sum, row) => sum + row.cost, 0);
    const totalFees = rows.reduce((sum, row) => sum + row.fee, 0);
    const body = rows.map((row, index) => `<tr><td>${index + 1}</td><td>${row.name}</td><td>${row.items.toLocaleString()}</td><td>${fmtCurrency(row.sales)}</td><td>${fmtCurrency(row.cost)}</td><td>${fmtCurrency(row.fee)}</td><td>${fmtCurrency(row.sales + row.fee)}</td></tr>`).join("") || `<tr><td colspan="7">No sales recorded for this period.</td></tr>`;
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${template.title} - All suppliers</title><style>@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;background:#e9edf2;font-family:"Segoe UI",Arial,sans-serif;color:#12345b}.page{width:210mm;min-height:297mm;margin:20px auto;background:#fff;padding:18mm;box-shadow:0 8px 30px rgba(0,0,0,.12)}header{display:flex;justify-content:space-between;border-bottom:3px solid ${template.accent};padding-bottom:12px}h1{margin:0;color:${template.navy};font-size:25px}h2{margin:24px 0 4px;color:${template.navy}}p{color:#536b83}table{width:100%;border-collapse:collapse;margin-top:24px;font-size:11px}th{background:${template.navy};color:#fff;text-align:left;padding:9px}td{padding:9px;border:1px solid #d5e0ea}tbody tr:nth-child(even){background:#f5f8fb}.right{text-align:right}.totals{margin:24px 0 0 auto;width:55%;background:#f4f8fc;padding:12px}.totals div{display:flex;justify-content:space-between;padding:6px 0}.grand{font-size:18px;font-weight:800;border-top:2px solid ${template.accent};color:${template.navy}}@media print{body{background:#fff}.page{margin:0;box-shadow:none}}</style></head><body><main class="page"><header><div><h1>${template.companyName}</h1><p>${template.address} · ${template.phone}</p></div><div><strong>${template.rightBrand}</strong><p>${template.title}</p></div></header><h2>Combined Supplier Sales Report</h2><p>All suppliers · ${month === "all" ? "All months" : month} · Generated ${new Date().toLocaleDateString()}</p><table><thead><tr><th>#</th><th>Supplier</th><th>Items sold</th><th>Sales</th><th>Cost</th><th>Fee</th><th>Total</th></tr></thead><tbody>${body}</tbody></table><section class="totals"><div><strong>Suppliers</strong><span>${rows.length}</span></div><div><strong>Items sold</strong><span>${totalItems.toLocaleString()}</span></div><div><strong>Sales total</strong><span>${fmtCurrency(totalSales)}</span></div><div><strong>Cost price</strong><span>${fmtCurrency(totalCost)}</span></div><div><strong>Fees</strong><span>${fmtCurrency(totalFees)}</span></div><div class="grand"><strong>Grand total</strong><span>${fmtCurrency(totalSales + totalFees)}</span></div></section></main></body></html>`;
  };
  const performCombinedPrint = (rows: ReportRow[]) => {
    const win = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
    if (!win) { toast({ title: "Allow popups to generate the report", variant: "destructive" }); return; }
    win.document.write(combinedReportDocument(rows)); win.document.close(); win.focus(); win.print();
  };
  const printCombinedReport = () => { const selected = reports.filter(r => selection[r.id]); setPendingPrintReports(selected.length ? selected : reports); setPopupRequest("combined"); };
  const printReport = (report?: ReportRow) => { if (!report) { printCombinedReport(); return; } setPendingPrintReports([report]); setPopupRequest("print"); };
  const openEmailDialog = (preset?: "made" | "none") => { setSelection(Object.fromEntries(reports.filter(r => preset === "made" ? r.items > 0 : preset === "none" ? r.items === 0 : !!r.email).map(r => [r.id, true]))); setRestockSelection(Object.fromEntries(reports.filter(r => r.restockProducts.length > 0 && r.email).map(r => [r.id, true]))); setEmailOpen(true); };
  const emailDraftUrl = (link: string, to: string, subject: string, body: string) => {
    if (link.trim().toLowerCase().startsWith("mailto:")) {
      const url = new URL(link.trim());
      url.pathname = to;
      url.searchParams.set("subject", subject);
      url.searchParams.set("body", body);
      return url.toString();
    }
    const url = new URL(link.trim());
    url.searchParams.set("to", to);
    url.searchParams.set(emailProvider === "gmail" ? "su" : "subject", subject);
    url.searchParams.set("body", body);
    return url.toString();
  };
  const sendEmails = () => {
    const targets = reports.filter(r => selection[r.id] && r.email);
    if (!targets.length) { toast({ title: "Select suppliers with email addresses", variant: "destructive" }); return; }
    setPendingEmailTargets(targets); setPopupRequest("email"); return;
  };

  const confirmPopupRequest = () => {
    if (popupRequest === "print") performPrint(pendingPrintReports);
    if (popupRequest === "combined") performCombinedPrint(pendingPrintReports);
    if (popupRequest === "email") {
      pendingEmailTargets.forEach(r => {
        if (attachOnSend) performPrint([r]);
        const subject = `Supplier sales report — ${month === "all" ? "All months" : month}`;
        const body = message.split("{supplier}").join(r.name) + `\n\nItems sold: ${r.items}\nSales: ${fmtCurrency(r.sales)}\nCost price: ${fmtCurrency(r.cost)}\nFee: ${fmtCurrency(r.fee)}\n\n${attachOnSend ? "The supplier report has been opened for Print / Save as PDF. Please attach that PDF to this draft." : "Please attach the supplier report if required."}`;
        const to = r.email || "";
        const url = emailDraftUrl(emailProviderLinks[emailProvider], to, subject, body);
        window.open(url, "_blank");
      });
      reports.filter(r => restockSelection[r.id] && r.email && r.restockProducts.length > 0).forEach(r => {
        const subject = `Restock request — ${r.name}`;
        const body = stockMessage.split("{supplier}").join(r.name).split("{restock}").join(r.restockProducts.join(", "));
        const to = r.email || "";
        const url = emailDraftUrl(emailProviderLinks[emailProvider], to, subject, body);
        window.open(url, "_blank");
      });
      updateSent(pendingEmailTargets.map(r => r.id)); setEmailOpen(false);
    }
    setPopupRequest(null);
  };

  if (showLoader) return <PageLoader text="Loading supplier reports..." />;

  return <div className="flex h-full flex-col space-y-6 animate-in fade-in duration-500"><EmailProviderLinkSettings provider={emailProvider} link={emailProviderLinks[emailProvider]} onProviderChange={setEmailProvider} onLinkChange={link => setEmailProviderLinks(current => ({ ...current, [emailProvider]: link }))} onSave={saveEmailProviderLinks} />
     <div className="flex justify-between items-center flex-wrap gap-3"><div className="flex items-start gap-3"><Button variant="ghost" size="icon" onClick={onBack} aria-label="Back"><ArrowLeft className="h-5 w-5" /></Button><div><h2 className="text-3xl font-bold flex items-center gap-3"><BarChart3 className="h-8 w-8 text-primary" />Supplier Reports</h2><p className="text-muted-foreground mt-1">Review supplier sales, item movement, cost price, fees, and email-ready reports.</p></div></div><div className="flex gap-2 flex-wrap"><Select value={month} onValueChange={setMonth}><SelectTrigger className="w-[150px]"><SelectValue placeholder="Period" /></SelectTrigger><SelectContent><SelectItem value="all">All months</SelectItem>{months.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select><Button variant="outline" size="sm" onClick={() => setTemplateOpen(true)}><Settings2 className="mr-2 h-4 w-4" />Edit template</Button><Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button><Button variant="outline" size="sm" onClick={() => printReport()}><Download className="mr-2 h-4 w-4" />Download all PDFs</Button><Button size="sm" onClick={() => openEmailDialog()}><Mail className="mr-2 h-4 w-4" />Draft all emails</Button></div></div>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><StatCard label="Suppliers" value={reports.length} sub="linked suppliers" icon={Users} color="text-primary" bg="bg-primary/10" /><StatCard label="Made sales" value={activeReports.length} sub={`of ${reports.length} suppliers`} icon={Check} color="text-emerald-600" bg="bg-emerald-50 dark:bg-emerald-950" /><StatCard label="Items sold" value={activeReports.reduce((s, r) => s + r.items, 0).toLocaleString()} sub="across active suppliers" icon={BarChart3} color="text-blue-600" bg="bg-blue-50 dark:bg-blue-950" /><StatCard label="Sales value" value={fmtCurrency(activeReports.reduce((s, r) => s + r.sales, 0))} sub="selected period" icon={Download} color="text-amber-600" bg="bg-amber-50 dark:bg-amber-950" /></div>
    <div className="flex gap-2 flex-wrap"><Button variant="outline" size="sm" onClick={() => openEmailDialog("made")}><Send className="mr-2 h-4 w-4" />Email made sales</Button><Button variant="outline" size="sm" onClick={() => openEmailDialog("none")}>Email no sales</Button><Button variant="outline" size="sm" onClick={() => setRestockEditorOpen(true)}>Edit restock message</Button><Badge variant="secondary" className="px-3 py-1">{month === "all" ? "All months" : month}</Badge></div>
    <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={supplierQuery} onChange={e => setSupplierQuery(e.target.value)} placeholder="Search suppliers by name, email, or supplier ID..." className="pl-9" /></div>
    <Card><CardHeader><CardTitle className="text-base">Supplier performance</CardTitle></CardHeader><CardContent className="overflow-x-auto"><table className="w-full min-w-[820px] text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="pb-3">Supplier</th><th className="pb-3 text-right">Items sold</th><th className="pb-3 text-right">Sales amount</th><th className="pb-3 text-right">Cost price</th><th className="pb-3 text-right">Fee</th><th className="pb-3 text-right">Status</th><th className="pb-3 text-right">Actions</th></tr></thead><tbody>{visibleReports.map(r => <tr key={r.id} className={`border-b last:border-0 ${previewSupplierId === r.id ? "bg-primary/5" : ""}`}><td className="py-3"><button className="text-left" onClick={() => setPreviewSupplierId(r.id)}><p className="font-medium hover:text-primary">{r.name}</p><p className="text-xs text-muted-foreground">{r.email || "No email"} · ID: {r.id.slice(0, 8)}</p></button></td><td className="text-right">{r.items.toLocaleString()}</td><td className="text-right font-medium">{fmtCurrency(r.sales)}</td><td className="text-right">{fmtCurrency(r.cost)}</td><td className="text-right"><Input className="ml-auto h-8 w-24 text-right" type="number" min="0" value={fees[r.id] ?? ""} placeholder="0" onChange={e => setFees(v => ({ ...v, [r.id]: e.target.value }))} /></td><td className="text-right">{r.sent ? <Badge className="bg-emerald-600"><Check className="mr-1 h-3 w-3" />Sent</Badge> : <Badge variant="outline">Not sent</Badge>}</td><td className="text-right"><Button variant="ghost" size="sm" onClick={() => { setPreviewSupplierId(r.id); setTemplateOpen(true); }}>Preview</Button><Button variant="ghost" size="sm" onClick={() => printReport(r)}><Download className="mr-1 h-4 w-4" />PDF</Button></td></tr>)}</tbody></table>{!visibleReports.length && <p className="py-10 text-center text-muted-foreground">No suppliers match this search.</p>}</CardContent></Card>
    <Dialog open={templateOpen} onOpenChange={setTemplateOpen}><DialogContent className="max-w-6xl max-h-[95vh] overflow-y-auto"><DialogHeader><DialogTitle className="flex items-center gap-2"><Palette className="h-5 w-5 text-primary" />Edit report template</DialogTitle></DialogHeader><div className="grid gap-5 lg:grid-cols-[380px_1fr]"><div className="space-y-4"><div className="space-y-2"><Label>Preview supplier</Label><Select value={previewSupplierId || previewReport?.id || ""} onValueChange={setPreviewSupplierId}><SelectTrigger><SelectValue placeholder="Choose supplier" /></SelectTrigger><SelectContent>{reports.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Company logo</Label><div className="flex items-center gap-3"><Input type="file" accept="image/*" onChange={handleLogo} /><Upload className="h-4 w-4 text-muted-foreground" />{template.logoDataUrl && <img src={template.logoDataUrl} alt="Logo preview" className="h-10 w-10 rounded object-contain" />}</div></div><div className="grid gap-3 sm:grid-cols-2">{([['companyName','Company name'],['address','Address'],['email','Email'],['phone','Phone'],['rightBrand','Top-right brand'],['rightCaption','Top-right caption'],['title','Report title'],['subtitle','Report subtitle'],['companyDetailsTitle','Company details heading'],['signature','Signature'],['footerText','Footer text'],['thankYou','Thank-you heading']] as const).map(([key,label]) => <div className="space-y-2" key={key}><Label>{label}</Label><Input value={template[key]} onChange={e => updateTemplate(key, e.target.value)} /></div>)}</div><div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label>Navy color</Label><Input type="color" value={template.navy} onChange={e => updateTemplate("navy", e.target.value)} className="h-10 p-1" /></div><div className="space-y-2"><Label>Accent color</Label><Input type="color" value={template.accent} onChange={e => updateTemplate("accent", e.target.value)} className="h-10 p-1" /></div></div><div className="flex justify-end gap-2 pt-2"><Button variant="outline" onClick={() => setTemplate(defaultTemplate)}>Reset</Button><Button onClick={saveTemplate}>Save template</Button></div></div><div className="min-h-[680px] rounded-xl border bg-muted/30 p-2"><p className="mb-2 px-2 text-xs font-medium text-muted-foreground">Live preview — edits appear here immediately</p>{previewReport ? <iframe title="Supplier report live preview" className="h-[640px] w-full rounded border bg-white" srcDoc={reportDocument(previewReport)} /> : <div className="flex h-[640px] items-center justify-center text-sm text-muted-foreground">Add suppliers to preview the report.</div>}</div></div></DialogContent></Dialog>
    <Dialog open={emailOpen} onOpenChange={setEmailOpen}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Draft supplier messages</DialogTitle></DialogHeader><div className="space-y-4"><p className="text-sm text-muted-foreground">Select vendors and choose where to draft their messages. Gmail or Outlook will open login/compose when needed; Device mail uses the computer’s default mail handler.</p><div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label>Email provider</Label><Select value={emailProvider} onValueChange={v => setEmailProvider(v as typeof emailProvider)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="gmail">Gmail</SelectItem><SelectItem value="outlook">Outlook</SelectItem><SelectItem value="device">Installed/default mail app</SelectItem></SelectContent></Select></div><div className="flex items-end"><Button variant="outline" className="w-full" onClick={() => openEmailDialog()}><Users className="mr-2 h-4 w-4" />Select all with email</Button></div></div><label className="flex items-start gap-3 rounded-lg border bg-muted/40 p-3"><Checkbox checked={attachOnSend} onCheckedChange={v => setAttachOnSend(v === true)} /><span><span className="block text-sm font-medium">Send with attachment</span><span className="block text-xs text-muted-foreground">Prepare the matching PDF before opening each draft.</span></span></label><div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border p-3">{reports.map(r => <label key={r.id} className="flex items-center gap-3 rounded-md p-2 hover:bg-muted"><Checkbox checked={!!selection[r.id]} onCheckedChange={v => setSelection(s => ({ ...s, [r.id]: v === true }))} disabled={!r.email} /><span className="flex-1 text-sm">{r.name}<span className="ml-2 text-xs text-muted-foreground">{r.email || "No email"}</span></span><Badge variant="outline">{r.items ? "Made sales" : "No sales"}</Badge></label>)}</div><div className="space-y-2"><Label>Message</Label><Textarea rows={6} value={message} onChange={e => setMessage(e.target.value)} /></div><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEmailOpen(false)}>Cancel</Button><Button onClick={sendEmails}><Mail className="mr-2 h-4 w-4" />Draft selected messages</Button></div></div></DialogContent></Dialog>
    <Dialog open={restockEditorOpen} onOpenChange={setRestockEditorOpen}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Edit restock request message</DialogTitle></DialogHeader><div className="space-y-4"><p className="text-sm text-muted-foreground">This second message is drafted for suppliers whose linked inventory is at or below its minimum level. Use <code>{"{supplier}"}</code> and <code>{"{restock}"}</code> as placeholders.</p><Textarea rows={9} value={stockMessage} onChange={e => setStockMessage(e.target.value)} /><div className="flex justify-end"><Button onClick={() => { localStorage.setItem("zuri_supplier_restock_message", stockMessage); setRestockEditorOpen(false); }}>Save restock message</Button></div></div></DialogContent></Dialog>
    <Dialog open={!!popupRequest} onOpenChange={open => !open && setPopupRequest(null)}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Allow report and email windows?</DialogTitle></DialogHeader><div className="space-y-4"><p className="text-sm text-muted-foreground">The next step opens report previews and email drafts in new windows. If your browser asks, choose <strong>Allow popups</strong> for this site.</p><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setPopupRequest(null)}>Cancel</Button><Button onClick={confirmPopupRequest}>Allow and continue</Button></div></div></DialogContent></Dialog>
  </div>;
};

export default SupplierReports;
