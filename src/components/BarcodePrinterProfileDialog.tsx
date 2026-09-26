import { useEffect, useState } from "react";
import { Barcode, Crosshair, Info, Printer, RotateCcw, Ruler, Save } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { usePrinter } from "@/providers/PrinterProvider";
import { buildCalibrationLabel, type PrintJob } from "@/lib/printerUtils";
import { createDefaultPrinterProfile, loadPrinterProfile, savePrinterProfile, type PrinterLabelProfile } from "@/lib/printerProfiles";

type Props = { open: boolean; onOpenChange: (open: boolean) => void; onSave?: (profile: PrinterLabelProfile) => void };

export default function BarcodePrinterProfileDialog({ open, onOpenChange, onSave }: Props) {
  const { printer, enqueue } = usePrinter();
  const { toast } = useToast();
  const [profile, setProfile] = useState<PrinterLabelProfile | null>(null);

  useEffect(() => { if (open && printer) setProfile(loadPrinterProfile(printer)); }, [open, printer]);
  if (!printer || !profile) return null;
  const effectiveProtocol = profile.protocol === "auto" ? (printer.protocol || "escpos") : profile.protocol;
  const calibrationSupported = effectiveProtocol === "zpl" || effectiveProtocol === "tspl";
  const fmtUsb = (value?: number) => value == null ? "" : `0x${value.toString(16).padStart(4, "0").toUpperCase()}`;
  const patch = (next: Partial<PrinterLabelProfile>) => setProfile(current => current ? { ...current, ...next } : current);
  const dimensions = `${profile.widthMm} × ${profile.heightMm} mm`;
  const isEscPos = effectiveProtocol === "escpos";
  const save = () => { savePrinterProfile(profile); onSave?.(profile); toast({ title: "Printer profile saved", description: `${printer.name} will use ${dimensions}.` }); };
  const calibration = () => {
    if (!calibrationSupported) {
      toast({ title: "Calibration is unavailable for ESC/POS", description: "ESC/POS does not define a reliable label-size or origin command. Select a ZPL or TSPL label-printer protocol first.", variant: "destructive" });
      return;
    }
    const job: PrintJob = {
      barcode: "CALIBRATION", quantity: 1, labelSize: `${profile.widthMm}x${profile.heightMm}mm`,
      protocol: "raw", dpi: profile.dpi === "auto" ? undefined : profile.dpi,
      offsetXmm: profile.offsetXmm, offsetYmm: profile.offsetYmm, orientation: profile.orientation,
      rawCommand: buildCalibrationLabel({ widthMm: profile.widthMm, heightMm: profile.heightMm, protocol: profile.protocol === "auto" ? (printer.protocol || "tspl") : profile.protocol, dpi: profile.dpi === "auto" ? 203 : profile.dpi, offsetXmm: profile.offsetXmm, offsetYmm: profile.offsetYmm, orientation: profile.orientation }),
    };
    enqueue([job], { dedupe: false });
    toast({ title: "Calibration label queued", description: "Measure the border, then adjust X/Y offsets if it is displaced." });
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle className="flex items-center gap-2"><Ruler className="h-5 w-5 text-primary" /> Barcode printer profile</DialogTitle><DialogDescription>Physical-print settings for {printer.name}. Browser preview is separate; this profile is authoritative for raw printer labels.</DialogDescription></DialogHeader>
    <div className="grid gap-4 md:grid-cols-[1.2fr_.8fr]"><Card className="border-primary/20 bg-muted/20"><CardContent className="space-y-4 pt-5"><div className="grid grid-cols-2 gap-3"><div><Label>Label width (mm)</Label><Input type="number" min="10" max="300" step="0.1" value={profile.widthMm} onChange={e => patch({ widthMm: Math.max(10, Number(e.target.value) || 10) })} /></div><div><Label>Label height (mm)</Label><Input type="number" min="10" max="300" step="0.1" value={profile.heightMm} onChange={e => patch({ heightMm: Math.max(10, Number(e.target.value) || 10) })} /></div></div>
        <div className="grid grid-cols-2 gap-3"><div><Label>Protocol</Label><Select value={profile.protocol} onValueChange={v => patch({ protocol: v as PrinterLabelProfile["protocol"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="auto">Auto (inferred)</SelectItem><SelectItem value="zpl">ZPL</SelectItem><SelectItem value="tspl">TSPL</SelectItem><SelectItem value="escpos">ESC/POS</SelectItem></SelectContent></Select></div><div><Label>Print DPI</Label><Select value={String(profile.dpi)} onValueChange={v => patch({ dpi: v === "auto" ? "auto" : Number(v) as 203 | 300 })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="auto">Auto / default (203)</SelectItem><SelectItem value="203">203 DPI</SelectItem><SelectItem value="300">300 DPI</SelectItem></SelectContent></Select></div></div>
        <div className="grid grid-cols-3 gap-3"><div><Label>Orientation</Label><Select value={profile.orientation} onValueChange={v => patch({ orientation: v as PrinterLabelProfile["orientation"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="portrait">Portrait</SelectItem><SelectItem value="landscape">Landscape</SelectItem></SelectContent></Select></div><div><Label>X offset (mm)</Label><Input type="number" step="0.1" value={profile.offsetXmm} onChange={e => patch({ offsetXmm: Number(e.target.value) || 0 })} /></div><div><Label>Y offset (mm)</Label><Input type="number" step="0.1" value={profile.offsetYmm} onChange={e => patch({ offsetYmm: Number(e.target.value) || 0 })} /></div></div>
        <div className="rounded-lg border border-primary/15 bg-background p-3"><div className="mb-3 flex items-center gap-2"><Barcode className="h-4 w-4 text-primary" /><div><Label className="font-semibold">Barcode fit</Label><p className="text-xs text-muted-foreground">Thinner bars fit more content. Wider bars scan more easily, but need more label width.</p></div></div><div className="grid grid-cols-2 gap-3"><div><Label>Bar width ({isEscPos ? "2-6 dots" : "1-10 dots"})</Label><Select value={String(profile.barcodeModuleWidth)} onValueChange={v => patch({ barcodeModuleWidth: v === "auto" ? "auto" : Number(v) })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="auto">Auto (recommended)</SelectItem>{Array.from({ length: isEscPos ? 5 : 10 }, (_, i) => (isEscPos ? i + 2 : i + 1)).map(value => <SelectItem key={value} value={String(value)}>{value} dot{value === 1 ? "" : "s"}</SelectItem>)}</SelectContent></Select></div><div><Label>Barcode height (mm)</Label><Select value={String(profile.barcodeHeightMm)} onValueChange={v => patch({ barcodeHeightMm: v === "auto" ? "auto" : Number(v) })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="auto">Auto (safe fit)</SelectItem>{[4, 5, 6, 8, 10, 12, 15, 18, 20].map(value => <SelectItem key={value} value={String(value)}>{value} mm</SelectItem>)}</SelectContent></Select></div></div><p className="mt-2 text-[11px] text-muted-foreground">{isEscPos ? "ESC/POS supports bar widths from 2 to 6 dots." : "ZPL and TSPL use the selected narrow-bar width."} Physical dots are rounded by printer DPI, so output can vary slightly.</p></div>
      </CardContent></Card><aside className="space-y-3"><Card className="border-amber-200 bg-amber-50/60"><CardContent className="pt-4 text-sm"><p className="flex items-center gap-2 font-semibold"><Info className="h-4 w-4 text-amber-700" /> Connected printer</p><p className="mt-2 font-medium">{printer.name}</p><div className="mt-2 space-y-1 border-t border-amber-200 pt-2 font-mono text-[11px] text-muted-foreground"><p>Connection: {printer.type.toUpperCase()}</p><p>Protocol: inferred {printer.protocol || "unknown"}</p>{profile.serialNumber && <p>Serial: {profile.serialNumber}</p>}{(profile.vendorId != null || profile.productId != null) && <p>USB: {fmtUsb(profile.vendorId)}:{fmtUsb(profile.productId)}</p>}</div><p className="mt-3 text-xs text-muted-foreground">A browser cannot read the roll size. Measure one label once and enter its physical dimensions here.</p></CardContent></Card><Card><CardContent className="pt-4"><p className="font-mono text-lg font-semibold">{dimensions}</p><p className="mt-1 text-xs text-muted-foreground">{calibrationSupported ? "Calibration prints a border and corner marks using these exact dimensions and offsets." : "ESC/POS does not reliably set label dimensions or origin; calibration is disabled until ZPL or TSPL is selected."}</p><div className="mt-3 rounded-md border bg-background p-2 text-[11px] text-muted-foreground"><div className="flex items-center gap-2 font-mono text-foreground"><span className="grid h-8 w-8 place-items-center border border-dashed">0,0</span><span>+X → right<br />+Y ↓ down</span></div><p className="mt-2">1. Print border · 2. Measure shift · 3. Enter X/Y and print again.</p></div></CardContent></Card></aside></div>
    <DialogFooter className="gap-2 sm:justify-between"><Button variant="ghost" onClick={() => setProfile(createDefaultPrinterProfile(printer))}><RotateCcw className="mr-2 h-4 w-4" /> Reset defaults</Button><div className="flex gap-2"><Button variant="outline" onClick={calibration} disabled={!calibrationSupported} title={!calibrationSupported ? "Choose ZPL or TSPL to calibrate physical label placement" : undefined}><Crosshair className="mr-2 h-4 w-4" /> Print calibration label</Button><Button onClick={save}><Save className="mr-2 h-4 w-4" /> Save profile</Button></div></DialogFooter>
  </DialogContent></Dialog>;
}
