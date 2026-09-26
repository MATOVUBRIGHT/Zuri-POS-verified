import { useEffect, useState } from 'react';
import { fmtCurrency, getCurrencySymbol } from "@/lib/currency";
import { Printer, X, ChevronDown, ChevronUp, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { StockItem } from '@/types';
import { BarcodeType, LabelSize } from '@/types/barcode';
import { usePrinter } from '@/providers/PrinterProvider';
import type { PrintJob } from '@/lib/printerUtils';
import BarcodePrinterProfileDialog from '@/components/BarcodePrinterProfileDialog';
import { loadPrinterProfile, type PrinterLabelProfile } from '@/lib/printerProfiles';
import LabelPreview, {
  type PrintItem, type ShowFields, type Orientation, type LabelSizeType, type FieldKey,
  type LabelStyle, DEFAULT_STYLE, generatePrintHTML,
} from '@/components/LabelPreview';

interface PrintPreviewEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: StockItem[];
  onPrint?: () => void;
  connectedPrinter?: any;
  onSettingsChange?: (settings: any) => void;
}

const LABEL_SIZES: { value: LabelSizeType; label: string }[] = [
  { value: '30x20mm',  label: '30×20 mm' },
  { value: '40x25mm',  label: '40×25 mm' },
  { value: '50x25mm',  label: '50×25 mm' },
  { value: '50x30mm',  label: '50×30 mm' },
  { value: '58mm',     label: '58 mm Thermal' },
  { value: '60x40mm',  label: '60×40 mm' },
  { value: '70x50mm',  label: '70×50 mm' },
  { value: '80mm',     label: '80 mm Receipt' },
  { value: '100x50mm', label: '100×50 mm' },
  { value: 'custom',   label: 'Custom…' },
];

export default function PrintPreviewEditor({
  open, onOpenChange, products, onSettingsChange,
}: PrintPreviewEditorProps) {
  const { toast } = useToast();
  const { printer, enqueue } = usePrinter();

  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(products.map(p => [p.id, 1]))
  );
  const [labelSizeType, setLabelSizeType] = useState<LabelSizeType>('50x30mm');
  const [customW, setCustomW] = useState(50);
  const [customH, setCustomH] = useState(30);
  const [orientation, setOrientation] = useState<Orientation>('portrait');
  const [showFields, setShowFields] = useState<ShowFields>({ productName: true, barcode: true, price: true, sku: false });
  const [fieldOrder, setFieldOrder] = useState<FieldKey[]>(['productName', 'barcode', 'price', 'sku']);
  const [labelStyle, setLabelStyle] = useState<LabelStyle>(DEFAULT_STYLE);
  const [previewScale, setPreviewScale] = useState(120);
  const [protocol, setProtocol] = useState<'auto'|'escpos'|'tspl'|'zpl'>('auto');
  const [productsExpanded, setProductsExpanded] = useState(true);
  const [profileOpen, setProfileOpen] = useState(false);
  const [printerProfile, setPrinterProfile] = useState<PrinterLabelProfile | null>(null);

  useEffect(() => {
    if (!printer) { setPrinterProfile(null); return; }
    const profile = loadPrinterProfile(printer);
    setPrinterProfile(profile);
    // Keep the physical stock dimensions unchanged. Both the preview and raw
    // printer renderer apply orientation exactly once from this same baseline.
    setCustomW(profile.widthMm);
    setCustomH(profile.heightMm);
    setOrientation(profile.orientation);
    setProtocol(profile.protocol);
    setLabelSizeType('custom');
  }, [printer]);

  if (!open) return null;

  const printItems: PrintItem[] = products.map(p => ({ product: p, quantity: quantities[p.id] ?? 1 }));
  const effectiveLabelStyle: LabelStyle = {
    ...labelStyle,
    barcodeHeightMm: printerProfile?.barcodeHeightMm === "auto" ? labelStyle.barcodeHeightMm : (printerProfile?.barcodeHeightMm ?? labelStyle.barcodeHeightMm),
    barcodeModuleWidth: printerProfile?.barcodeModuleWidth === "auto" ? labelStyle.barcodeModuleWidth : (printerProfile?.barcodeModuleWidth ?? labelStyle.barcodeModuleWidth),
  };
  const totalLabels = printItems.reduce((s, i) => s + i.quantity, 0);
  const setQty = (id: string, v: number) => setQuantities(prev => ({ ...prev, [id]: Math.max(1, v) }));

  const handleBrowserPrint = () => {
    const html = generatePrintHTML(printItems, labelSizeType, showFields, orientation, customW, customH, fieldOrder, effectiveLabelStyle);
    const win = window.open('', '_blank', 'width=500,height=600');
    if (!win) { toast({ title: 'Allow popups to print labels', variant: 'destructive' }); return; }
    win.document.write(html);
    win.document.close();
    onOpenChange(false);
  };

  const handleHardwarePrint = () => {
    if (!printer) { toast({ title: 'No printer connected', variant: 'destructive' }); return; }
    const jobs: PrintJob[] = [];
    for (const item of printItems) {
      const p = item.product;
      if (!p.barcode) continue;
      // `labelSize` is always the physical label stock. printerUtils applies
      // the selected orientation once, matching LabelPreview's calculation.
      const labelSize = `${printerProfile?.widthMm ?? customW}x${printerProfile?.heightMm ?? customH}mm`;
      jobs.push({
        barcode: p.barcode,
        barcodeType: (p.barcode_type as BarcodeType) || 'CODE128',
        productName: showFields.productName ? p.productName : undefined,
        price: showFields.price && p.retail_price ? `${getCurrencySymbol().replace(/^UGX$/,'Ugx')} ${Math.round(p.retail_price).toLocaleString()}` : undefined,
        sku: showFields.sku ? p.barcode : undefined,
        quantity: item.quantity,
        labelSize: labelSize as LabelSize,
        protocol: (printerProfile?.protocol ?? protocol) !== 'auto' ? (printerProfile?.protocol ?? protocol) as any : undefined,
        dpi: printerProfile?.dpi === 'auto' ? undefined : printerProfile?.dpi,
        offsetXmm: printerProfile?.offsetXmm ?? 0,
        offsetYmm: printerProfile?.offsetYmm ?? 0,
        orientation: printerProfile?.orientation ?? orientation,
        barcodeModuleWidth: printerProfile?.barcodeModuleWidth === "auto" ? undefined : printerProfile?.barcodeModuleWidth,
        barcodeHeightMm: printerProfile?.barcodeHeightMm === "auto" ? undefined : printerProfile?.barcodeHeightMm,
        fieldOrder: fieldOrder.filter(f => showFields[f as keyof typeof showFields]) as FieldKey[],
      });
    }
    if (jobs.length === 0) { toast({ title: 'No products with barcodes to print', variant: 'destructive' }); return; }
    enqueue(jobs, { dedupe: false });
    toast({ title: `Sent ${totalLabels} label${totalLabels !== 1 ? 's' : ''} to ${printer.name}` });
    onOpenChange(false);
  };

  const detectedProtocol = printer?.protocol ?? 'escpos';

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col" style={{ fontFamily: 'inherit' }}>
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-card shrink-0">
        <div className="flex items-center gap-2">
          <Printer className="h-5 w-5 text-primary" />
          <span className="font-semibold text-base">Label Editor &amp; Print</span>
          <span className="text-xs text-muted-foreground ml-2">{totalLabels} label{totalLabels !== 1 ? 's' : ''}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleBrowserPrint} disabled={totalLabels === 0}>
            🖨️ Browser Print
          </Button>
          {printer && (
            <Button variant="outline" size="sm" onClick={() => setProfileOpen(true)}>
              <SlidersHorizontal className="h-4 w-4 mr-1" /> Printer profile
            </Button>
          )}
          {printer && (
            <Button size="sm" onClick={handleHardwarePrint} disabled={totalLabels === 0}>
              <Printer className="h-4 w-4 mr-1" />
              Print to {printer.name}
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* ── Body: left sidebar + right preview ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Left sidebar — label size, protocol, products */}
        <div className="w-72 shrink-0 border-r bg-muted/20 flex flex-col overflow-y-auto">
          <div className="p-4 space-y-4 text-sm">

            {printerProfile && <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs"><p className="font-semibold text-foreground">Hardware profile active</p><p className="mt-1 text-muted-foreground">{printerProfile.widthMm} × {printerProfile.heightMm} mm · {printerProfile.dpi === 'auto' ? 'Auto DPI' : `${printerProfile.dpi} DPI`} · {printerProfile.orientation} · X/Y {printerProfile.offsetXmm}/{printerProfile.offsetYmm} mm</p><p className="mt-1 text-muted-foreground">Bars {printerProfile.barcodeModuleWidth === 'auto' ? 'auto' : `${printerProfile.barcodeModuleWidth} dots`} · Barcode height {printerProfile.barcodeHeightMm === 'auto' ? 'auto' : `${printerProfile.barcodeHeightMm} mm`}</p><Button variant="link" className="mt-1 h-auto p-0 text-xs" onClick={() => setProfileOpen(true)}>Calibrate or change profile</Button></div>}
            {/* Label size */}
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Label Size</Label>
              <Select value={labelSizeType} onValueChange={v => { setLabelSizeType(v as LabelSizeType); onSettingsChange?.({ currentLayout: { width: customW, height: customH } }); }}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LABEL_SIZES.map(s => <SelectItem key={s.value} value={s.value} className="text-sm">{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {labelSizeType === 'custom' && (
                <div className="flex gap-2 mt-1">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs text-muted-foreground">W (mm)</Label>
                    <Input type="number" min={20} max={200} value={customW}
                      onChange={e => setCustomW(Math.max(20, +e.target.value || 50))}
                      className="h-8 text-sm" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs text-muted-foreground">H (mm)</Label>
                    <Input type="number" min={10} max={200} value={customH}
                      onChange={e => setCustomH(Math.max(10, +e.target.value || 30))}
                      className="h-8 text-sm" />
                  </div>
                </div>
              )}
            </div>

            {/* Protocol */}
            {printer && (
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">Protocol <span className="font-normal text-muted-foreground text-xs">(auto: {detectedProtocol})</span></Label>
                <Select value={protocol} onValueChange={v => setProtocol(v as any)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto" className="text-sm">Auto</SelectItem>
                    <SelectItem value="escpos" className="text-sm">ESC/POS</SelectItem>
                    <SelectItem value="tspl" className="text-sm">TSPL</SelectItem>
                    <SelectItem value="zpl" className="text-sm">ZPL</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Products + copies */}
            <div className="space-y-2">
              <button
                className="flex items-center justify-between w-full text-sm font-semibold"
                onClick={() => setProductsExpanded(v => !v)}
              >
                <span>Products ({products.length})</span>
                {productsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {productsExpanded && (
                <div className="space-y-1.5">
                  {products.map(p => (
                    <div key={p.id} className="flex items-center gap-2 p-2 border rounded-lg bg-card text-sm">
                      <span className="flex-1 truncate font-medium" title={p.productName}>{p.productName}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="outline" size="icon" className="h-6 w-6"
                          onClick={() => setQty(p.id, (quantities[p.id] ?? 1) - 1)}
                          disabled={(quantities[p.id] ?? 1) <= 1}>−</Button>
                        <Input type="number" min={1} max={500} value={quantities[p.id] ?? 1}
                          onChange={e => setQty(p.id, +e.target.value || 1)}
                          className="h-6 w-10 text-center text-sm p-0" />
                        <Button variant="outline" size="icon" className="h-6 w-6"
                          onClick={() => setQty(p.id, (quantities[p.id] ?? 1) + 1)}>+</Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: full label editor (controls + live preview side by side) */}
        <div className="flex-1 min-w-0 overflow-auto p-4">
          <LabelPreview
            printItems={printItems}
            labelSizeType={labelSizeType}
            customWidthMm={customW}
            customHeightMm={customH}
            previewScale={previewScale}
            onScaleChange={setPreviewScale}
            orientation={orientation}
            onOrientationChange={setOrientation}
            showFields={showFields}
            onShowFieldsChange={setShowFields}
            fieldOrder={fieldOrder}
            onFieldOrderChange={setFieldOrder}
            labelStyle={effectiveLabelStyle}
            onLabelStyleChange={setLabelStyle}
          />
        </div>
      </div>
      <BarcodePrinterProfileDialog open={profileOpen} onOpenChange={setProfileOpen} onSave={(saved) => { setPrinterProfile(saved); setCustomW(saved.widthMm); setCustomH(saved.heightMm); setOrientation(saved.orientation); setProtocol(saved.protocol); setLabelSizeType('custom'); }} />
    </div>
  );
}
