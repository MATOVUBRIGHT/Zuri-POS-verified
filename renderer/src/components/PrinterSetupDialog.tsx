import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { cn } from "@/lib/utils";
import { AlertCircle, CheckCircle2, Cable, Printer, RefreshCw, Usb } from "lucide-react";
import { usePrinter } from "@/providers/PrinterProvider";
import USBDriverFixModal from "@/components/USBDriverFixModal";

export default function PrinterSetupDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const {
    status,
    printer,
    lastError,
    queue,
    authorizedUsbDevices,
    refreshAuthorizedUsbDevices,
    connectUSB,
    connectSerial,
    connectAuthorizedUsb,
    disconnect,
    testPrint,
    retryFailed,
    clearDone,
  } = usePrinter();

  const [baudRate, setBaudRate] = useState("9600");
  const [refreshing, setRefreshing] = useState(false);
  const [showDriverFixModal, setShowDriverFixModal] = useState(false);
  const [usbAccessDeniedCount, setUsbAccessDeniedCount] = useState(0);

  useEffect(() => {
    if (!open) return;
    setRefreshing(true);
    refreshAuthorizedUsbDevices().finally(() => setRefreshing(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Monitor for USB Access Denied errors and show driver fix modal
  useEffect(() => {
    if (lastError && lastError.includes("Access Denied") && status === "error") {
      setUsbAccessDeniedCount(prev => prev + 1);
      // Show modal automatically on first error, or after user retries
      setShowDriverFixModal(true);
    }
  }, [lastError, status]);

  const statusBadge = useMemo(() => {
    switch (status) {
      case "connected":
        return { label: "Connected", cls: "bg-success text-success-foreground", icon: CheckCircle2 };
      case "connecting":
        return { label: "Connecting", cls: "bg-muted text-foreground", icon: RefreshCw };
      case "printing":
        return { label: "Printing", cls: "bg-warning text-warning-foreground", icon: RefreshCw };
      case "error":
        return { label: "Error", cls: "bg-destructive text-destructive-foreground", icon: AlertCircle };
      default:
        return { label: "Disconnected", cls: "bg-muted text-foreground", icon: AlertCircle };
    }
  }, [status]);

  const dotClass = useMemo(() => {
    if (status === "connected") return "bg-emerald-500";
    if (status === "printing" || status === "connecting") return "bg-amber-500";
    if (status === "error") return "bg-red-500";
    return "bg-zinc-400";
  }, [status]);

  const failedCount = queue.filter((q) => q.state === "failed").length;
  const queuedCount = queue.filter((q) => q.state === "queued").length;
  const doneCount = queue.filter((q) => q.state === "done").length;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="h-5 w-5" />
              Printer Setup
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className={cn("h-2.5 w-2.5 rounded-full", dotClass)} />
                    Status
                  </span>
                  <Badge className={cn("gap-1", statusBadge.cls)} variant="secondary">
                    <statusBadge.icon className={cn("h-3.5 w-3.5", status === "connecting" || status === "printing" ? "animate-spin" : "")} />
                    {statusBadge.label}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-sm">
                  <div className="text-muted-foreground">Active printer</div>
                  <div className="font-medium">{printer ? printer.name : "None"}</div>
                  {printer ? (
                    <div className="text-xs text-muted-foreground mt-1">
                      Type: {printer.type.toUpperCase()} {printer.protocol ? `• ${printer.protocol.toUpperCase()}` : ""}
                    </div>
                  ) : null}
                </div>

                {lastError ? (
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm space-y-3">
                    <div>
                      <div className="font-semibold text-destructive">Last error</div>
                      <div className="text-destructive/90 mt-1 break-words italic">&quot;{lastError}&quot;</div>
                    </div>
                    
                    {lastError.includes("Access Denied") && (
                      <div className="mt-3 space-y-2 p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-900">
                        <p className="font-bold flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 flex-shrink-0" /> USB Driver Fix Required
                        </p>
                        <p className="text-amber-800">Windows is blocking direct access to your printer. You need to install the WinUSB driver using Zadig.</p>
                        
                        <div className="bg-white border border-amber-300 rounded p-2 space-y-1 text-amber-900 my-2">
                          <p className="font-semibold text-xs">Step-by-step fix:</p>
                          <ol className="list-decimal list-inside space-y-1 text-xs">
                            <li>Download <a href="https://zadig.akeo.ie/" target="_blank" rel="noreferrer" className="font-bold text-blue-600 hover:underline">Zadig</a> (portable exe)</li>
                            <li>Connect your thermal printer via USB</li>
                            <li>Run Zadig → Select your printer from the dropdown</li>
                            <li>Select <span className="font-bold">WinUSB</span> driver from the list</li>
                            <li>Click <span className="font-bold">Replace Driver</span></li>
                            <li>Wait for installation and restart if prompted</li>
                            <li>Return here and click <span className="font-bold">Connect USB</span> again</li>
                          </ol>
                        </div>
                        
                        <p className="text-xs italic">⚠️ Tip: Close all other browser tabs before attempting connection again.</p>
                      </div>
                    )}
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <Button onClick={connectUSB} disabled={status === "connecting" || status === "printing"} className="gap-2">
                    <Usb className="h-4 w-4" />
                    Connect USB
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => connectSerial(Number(baudRate) || 9600)}
                    disabled={status === "connecting" || status === "printing"}
                    className="gap-2"
                  >
                    <Cable className="h-4 w-4" />
                    Connect Serial
                  </Button>
                  <Button variant="outline" onClick={disconnect} disabled={!printer} className="gap-2">
                    Disconnect
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-2 items-center">
                  <Label className="text-xs text-muted-foreground">Serial baud</Label>
                  <Input value={baudRate} onChange={(e) => setBaudRate(e.target.value)} inputMode="numeric" />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={testPrint} disabled={!printer} className="gap-2">
                    Test Print
                  </Button>
                  <Button variant="outline" onClick={retryFailed} disabled={failedCount === 0}>
                    Retry Failed ({failedCount})
                  </Button>
                  <Button variant="outline" onClick={clearDone} disabled={doneCount === 0}>
                    Clear Done ({doneCount})
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={async () => {
                      setRefreshing(true);
                      await refreshAuthorizedUsbDevices();
                      setRefreshing(false);
                    }}
                    className="gap-2"
                  >
                    <RefreshCw className={cn("h-4 w-4", refreshing ? "animate-spin" : "")} />
                    Refresh
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  Authorized USB Devices
                  {refreshing ? <span className="text-xs text-muted-foreground">Scanning…</span> : null}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {refreshing ? (
                  <LoadingSpinner size="md" text="Loading devices..." />
                ) : authorizedUsbDevices.length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    No authorized USB printers yet. Click “Connect USB” to grant permission.
                  </div>
                ) : (
                  <ScrollArea className="h-[220px] pr-2">
                    <div className="space-y-2">
                      {authorizedUsbDevices.map((d) => (
                        <div key={d.key} className="flex items-center justify-between gap-3 rounded-md border p-2">
                          <div className="min-w-0">
                            <div className="font-medium truncate">{d.productName}</div>
                            <div className="text-[11px] text-muted-foreground font-mono truncate">
                              {d.vendorId ?? "?"}:{d.productId ?? "?"} {d.serialNumber ? `• ${d.serialNumber}` : ""}
                            </div>
                          </div>
                          <Button size="sm" variant="outline" onClick={() => connectAuthorizedUsb(d.key)} className="shrink-0">
                            Connect
                          </Button>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Print Queue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3 text-sm text-muted-foreground mb-2">
                <span>Queued: <span className="font-semibold text-foreground">{queuedCount}</span></span>
                <span>Done: <span className="font-semibold text-foreground">{doneCount}</span></span>
                <span>Failed: <span className="font-semibold text-foreground">{failedCount}</span></span>
              </div>
              {queue.length === 0 ? (
                <div className="text-sm text-muted-foreground">No print jobs yet.</div>
              ) : (
                <ScrollArea className="h-[220px] pr-2">
                  <div className="space-y-2">
                    {queue.slice().reverse().map((q) => (
                      <div key={q.id} className="rounded-md border p-2 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-medium truncate">
                              {(q.job.productName || "Label") + ` • ${q.job.barcode}`}
                            </div>
                            <div className="text-[11px] text-muted-foreground truncate">
                              {q.job.labelSize} • {q.job.barcodeType || "CODE128"} • Qty {q.job.quantity || 1}
                              {q.attempts > 0 ? ` • retries ${q.attempts}` : ""}
                            </div>
                          </div>
                          <Badge variant="outline" className="capitalize">
                            {q.state}
                          </Badge>
                        </div>
                        {q.lastError ? (
                          <div className="text-[11px] text-destructive mt-1 break-words">{q.lastError}</div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </DialogContent>
      </Dialog>

      <USBDriverFixModal
        open={showDriverFixModal}
        onOpenChange={setShowDriverFixModal}
        onRetryConnection={connectUSB}
        printerName={printer?.name || "Thermal Printer"}
        lastError={lastError || "USB Access Denied"}
        isConnecting={status === "connecting"}
      />
    </>
  );
}

