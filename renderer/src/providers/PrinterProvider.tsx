import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { toast } from "sonner";
import type { BarcodeType, LabelSize } from "@/types/barcode";
import {
  type PrinterDevice,
  type PrintJob,
  requestUSBPrinter,
  requestBluetoothPrinter,
  requestSerialPrinter,
  disconnectPrinter,
  monitorPrinterConnection,
  checkPrinterStatus,
  printBarcodeLabel,
  prepareUSBDevice,
} from "@/lib/printerUtils";

export type PrinterConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "printing"
  | "error";

export type QueuedPrintState = "queued" | "printing" | "done" | "failed";

export type QueuedPrintJob = {
  id: string;
  state: QueuedPrintState;
  createdAt: string;
  attempts: number;
  lastError?: string;
  job: PrintJob;
};

type AuthorizedUsbDevice = {
  key: string;
  productName: string;
  vendorId?: number;
  productId?: number;
  serialNumber?: string;
  device: { vendorId: number; productId: number; serialNumber?: string; productName?: string };
};

type PrinterContextValue = {
  status: PrinterConnectionStatus;
  printer: PrinterDevice | null;
  lastError: string | null;
  queue: QueuedPrintJob[];
  authorizedUsbDevices: AuthorizedUsbDevice[];
  refreshAuthorizedUsbDevices: () => Promise<void>;
  connectUSB: () => Promise<void>;
  connectBluetooth: () => Promise<void>;
  connectSerial: (baudRate?: number) => Promise<void>;
  connectAuthorizedUsb: (key: string) => Promise<void>;
  disconnect: () => Promise<void>;
  enqueue: (jobs: PrintJob[], opts?: { dedupe?: boolean }) => void;
  testPrint: () => void;
  retryFailed: () => void;
  clearDone: () => void;
};

const PrinterContext = createContext<PrinterContextValue | null>(null);

const LAST_PRINTER_KEY = "brec_last_printer";
const JOB_LOG_KEY = "brec_printer_job_log";

function jobDedupeKey(job: PrintJob): string {
  return [
    job.barcodeType || "CODE128",
    job.barcode,
    job.productName || "",
    job.price || "",
    job.labelSize,
    String(job.quantity || 1),
    job.sku || "",
    job.batch || "",
    job.protocol || "",
  ].join("|");
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function looksLikeDisconnect(err: unknown): boolean {
  const msg = String((err as Error)?.message || err || "").toLowerCase();
  return (
    msg.includes("disconnected") ||
    msg.includes("not accessible") ||
    msg.includes("device is not accessible") ||
    msg.includes("not opened") ||
    msg.includes("notfounderror") ||
    msg.includes("transfer") && msg.includes("failed")
  );
}

function safeJsonParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function persistLastPrinter(printer: PrinterDevice) {
  try {
    if (printer.type === "usb" && printer.device) {
      const d = printer.device;
      localStorage.setItem(
        LAST_PRINTER_KEY,
        JSON.stringify({
          kind: "usb",
          vendorId: d.vendorId ?? null,
          productId: d.productId ?? null,
          serialNumber: d.serialNumber ?? null,
          productName: d.productName ?? printer.name ?? null,
          protocol: printer.protocol ?? null,
        })
      );
      return;
    }

    if (printer.type === "serial") {
      localStorage.setItem(
        LAST_PRINTER_KEY,
        JSON.stringify({
          kind: "serial",
          name: printer.name,
          protocol: printer.protocol ?? null,
        })
      );
      return;
    }

    if (printer.type === "bluetooth" && printer.device?.device) {
      localStorage.setItem(
        LAST_PRINTER_KEY,
        JSON.stringify({
          kind: "bluetooth",
          name: printer.name,
          protocol: printer.protocol ?? null,
        })
      );
    }
  } catch {
    // ignore
  }
}

function appendJobLog(entry: { id: string; at: string; printer: string; ok: boolean; error?: string; job: PrintJob }) {
  try {
    const prev = safeJsonParse<Array<{ id: string; at: string; printer: string; ok: boolean; error?: string; job: PrintJob }>>(localStorage.getItem(JOB_LOG_KEY)) || [];
    const next = [entry, ...prev].slice(0, 200);
    localStorage.setItem(JOB_LOG_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

async function tryRestoreUsbPrinter(): Promise<PrinterDevice | null> {
  const last = safeJsonParse<{ kind: string; serialNumber?: string; vendorId?: number; productId?: number; protocol?: string }>(localStorage.getItem(LAST_PRINTER_KEY));
  if (!last || last.kind !== "usb") return null;
  if (!("usb" in navigator) || !(navigator.usb as unknown as { getDevices?: () => Promise<unknown[]> }).getDevices) return null;

  try {
    const devices = await (navigator.usb as unknown as { getDevices: () => Promise<Array<{ vendorId: number; productId: number; serialNumber?: string; productName?: string }>> }).getDevices();
    const match = (devices || []).find((d: { vendorId: number; productId: number; serialNumber?: string; productName?: string }) => {
      if (last.serialNumber && d.serialNumber) return String(d.serialNumber) === String(last.serialNumber);
      if (last.vendorId && last.productId) return d.vendorId === last.vendorId && d.productId === last.productId;
      return false;
    });
    if (!match) return null;

    const usbEndpoint = await prepareUSBDevice(match);
    const name = match.productName || "USB Printer";
    return {
      id: match.serialNumber || `usb-${Date.now()}`,
      name,
      type: "usb",
      device: match,
      connected: true,
      usbEndpoint,
      protocol: (last.protocol as PrinterDevice["protocol"]) || undefined,
    };
  } catch {
    return null;
  }
}

export function PrinterProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<PrinterConnectionStatus>("disconnected");
  const [printer, setPrinter] = useState<PrinterDevice | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueuedPrintJob[]>([]);
  const [authorizedUsbDevices, setAuthorizedUsbDevices] = useState<AuthorizedUsbDevice[]>([]);

  const printerRef = useRef<PrinterDevice | null>(null);
  useEffect(() => {
    printerRef.current = printer;
  }, [printer]);

  const processingRef = useRef(false);
  const queueRef = useRef<QueuedPrintJob[]>([]);
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  const refreshAuthorizedUsbDevices = async () => {
    if (!("usb" in navigator) || !(navigator.usb as unknown as { getDevices?: () => Promise<unknown[]> }).getDevices) {
      setAuthorizedUsbDevices([]);
      return;
    }

    try {
      const devices = await (navigator.usb as unknown as { getDevices: () => Promise<Array<{ vendorId: number; productId: number; serialNumber?: string; productName?: string }>> }).getDevices();
      const list: AuthorizedUsbDevice[] = (devices || []).map((d: { vendorId: number; productId: number; serialNumber?: string; productName?: string }) => ({
        key: `${d.vendorId ?? ""}:${d.productId ?? ""}:${d.serialNumber ?? ""}:${d.productName ?? ""}`,
        productName: d.productName || "USB Printer",
        vendorId: d.vendorId,
        productId: d.productId,
        serialNumber: d.serialNumber,
        device: d,
      }));
      setAuthorizedUsbDevices(list);
    } catch {
      setAuthorizedUsbDevices([]);
    }
  };

  const connectUSB = useCallback(async () => {
    setLastError(null);
    setStatus("connecting");
    try {
      const p = await requestUSBPrinter();
      if (!p) {
        setStatus("disconnected");
        toast.error("No printer selected", { description: "USB connection was cancelled." });
        return;
      }

      // Prepare device is expected to have opened/claimed already,
      // but we validate before marking connected.
      const statusInfo = await checkPrinterStatus(p);
      if (!statusInfo.active) {
        setLastError(statusInfo.message);
        setStatus("error");
        toast.error("Printer not ready", { description: statusInfo.message });
        return;
      }

      setPrinter(p);
      setStatus("connected");
      persistLastPrinter(p);
      toast.success("Printer connected", { description: p.name });
      void refreshAuthorizedUsbDevices();
    } catch (e: unknown) {
      const msg = (e as Error)?.message || "Failed to connect USB printer";

      // Fallback when WebUSB is not exposed by the browser/runtime.
      if (msg.includes("Web USB is not supported")) {
        toast.error("USB not available", { description: "Trying Serial/Bluetooth instead…" });
        // Try Serial (default baud), then Bluetooth.
        try {
          const serial = await requestSerialPrinter(9600);
          if (serial) {
            const statusInfo = await checkPrinterStatus(serial);
            if (statusInfo.active) {
              setPrinter(serial);
              setStatus("connected");
              persistLastPrinter(serial);
              toast.success("Printer connected (Serial)", { description: serial.name });
              return;
            }
          }
        } catch {
          // ignore and try bluetooth
        }

        try {
          const bt = await requestBluetoothPrinter();
          if (bt) {
            const statusInfo = await checkPrinterStatus(bt);
            if (statusInfo.active) {
              setPrinter(bt);
              setStatus("connected");
              persistLastPrinter(bt);
              toast.success("Printer connected (Bluetooth)", { description: bt.name });
              return;
            }
          }
        } catch {
          // ignore
        }
      }

      setLastError(msg);
      setStatus("error");
      toast.error("Printer connection failed", { description: msg });
    }
  }, []);

  const connectBluetooth = async () => {
    setLastError(null);
    setStatus("connecting");
    try {
      const p = await requestBluetoothPrinter();
      if (!p) {
        setStatus("disconnected");
        return;
      }
      setPrinter(p);
      setStatus("connected");
      persistLastPrinter(p);
      toast.success("Printer connected", { description: p.name });
    } catch (e: unknown) {
      const msg = (e as Error)?.message || "Failed to connect Bluetooth printer";
      setLastError(msg);
      setStatus("error");
      toast.error("Printer connection failed", { description: msg });
    }
  };

  const connectSerial = async (baudRate: number = 9600) => {
    setLastError(null);
    setStatus("connecting");
    try {
      const p = await requestSerialPrinter(baudRate);
      if (!p) {
        setStatus("disconnected");
        return;
      }
      setPrinter(p);
      setStatus("connected");
      persistLastPrinter(p);
      toast.success("Printer connected", { description: p.name });
    } catch (e: unknown) {
      const msg = (e as Error)?.message || "Failed to connect Serial printer";
      setLastError(msg);
      setStatus("error");
      toast.error("Printer connection failed", { description: msg });
    }
  };

  const connectAuthorizedUsb = useCallback(async (key: string) => {
    setLastError(null);
    setStatus("connecting");
    try {
      let item = authorizedUsbDevices.find((d) => d.key === key);
      if (!item) {
        // Refresh list if it went stale.
        await refreshAuthorizedUsbDevices();
        item = authorizedUsbDevices.find((d) => d.key === key);
      }

      if (!item) throw new Error("USB device not found (permission list may have changed).");

      const usbEndpoint = await prepareUSBDevice(item.device);
      const p: PrinterDevice = {
        id: item.serialNumber || `usb-${Date.now()}`,
        name: item.productName || "USB Printer",
        type: "usb",
        device: item.device,
        connected: true,
        usbEndpoint,
      };

      const statusInfo = await checkPrinterStatus(p);
      if (!statusInfo.active) {
        setLastError(statusInfo.message);
        setStatus("error");
        toast.error("Printer not ready", { description: statusInfo.message });
        return;
      }

      setPrinter(p);
      setStatus("connected");
      persistLastPrinter(p);
      toast.success("Printer connected", { description: p.name });
    } catch (e: unknown) {
      const msg = (e as Error)?.message || "Failed to connect USB printer";
      setLastError(msg);
      setStatus("error");
      toast.error("Printer connection failed", { description: msg });
    }
  }, [authorizedUsbDevices]);

  const disconnect = async () => {
    const current = printerRef.current;
    if (!current) return;
    try {
      await disconnectPrinter(current);
    } catch {
      // ignore
    } finally {
      setPrinter(null);
      setStatus("disconnected");
      toast("Printer disconnected", { description: current.name });
    }
  };

  const enqueue = (jobs: PrintJob[], opts?: { dedupe?: boolean }) => {
    const dedupe = opts?.dedupe ?? true;
    const now = new Date().toISOString();

    setQueue((prev) => {
      // Prevent duplicates only while a job is still in flight (queued/printing).
      // Users should still be able to reprint after a job completes.
      const existingKeys = new Set(
        prev
          .filter((q) => q.state === "queued" || q.state === "printing")
          .map((q) => jobDedupeKey(q.job))
      );
      const nextItems: QueuedPrintJob[] = [];
      for (const job of jobs) {
        const key = jobDedupeKey(job);
        if (dedupe && existingKeys.has(key)) continue;
        existingKeys.add(key);
        nextItems.push({
          id: `pj_${Math.random().toString(36).slice(2)}_${Date.now()}`,
          state: "queued",
          createdAt: now,
          attempts: 0,
          job,
        });
      }
      return [...prev, ...nextItems];
    });
  };

  const retryFailed = () => {
    setQueue((prev) =>
      prev.map((q) => (q.state === "failed" ? { ...q, state: "queued", lastError: undefined } : q))
    );
  };

  const clearDone = () => {
    setQueue((prev) => prev.filter((q) => q.state !== "done"));
  };

  const testPrint = useCallback(() => {
    const sample: PrintJob = {
      barcode: "BREPOS-TEST-1234",
      barcodeType: "CODE128" as BarcodeType,
      productName: "Test Label",
      price: "UGX 1,000",
      quantity: 1,
      labelSize: "50x25mm" as LabelSize,
    };
    enqueue([sample], { dedupe: false });
    toast("Test print queued", { description: "A sample label will print next." });
  }, []);

  // Process print queue (FIFO).
  useEffect(() => {
    const run = async () => {
      if (processingRef.current) return;
      if (!printerRef.current) return;
      if (!queueRef.current.some((q) => q.state === "queued")) return;

      processingRef.current = true;
      try {
        while (true) {
          const p = printerRef.current;
          if (!p) break;

          const next = queueRef.current.find((q) => q.state === "queued");
          if (!next) break;

          setStatus("printing");
          setQueue((prev) => prev.map((q) => (q.id === next.id ? { ...q, state: "printing" } : q)));
          await sleep(30);

          try {
            await printBarcodeLabel(p, next.job);
            appendJobLog({ id: next.id, at: new Date().toISOString(), printer: p.name, ok: true, job: next.job });
            setQueue((prev) => prev.map((q) => (q.id === next.id ? { ...q, state: "done" } : q)));
          } catch (e: unknown) {
            const msg = (e as Error)?.message || "Print failed";
            appendJobLog({ id: next.id, at: new Date().toISOString(), printer: p.name, ok: false, error: msg, job: next.job });

            const maxRetries = 2;
            const nextAttempts = next.attempts + 1;

            if (looksLikeDisconnect(e)) {
              setLastError(msg);
              setPrinter(null);
              setStatus("disconnected");
              toast.error("Printer disconnected", { description: msg });
              break;
            }

            if (nextAttempts <= maxRetries) {
              setQueue((prev) =>
                prev.map((q) =>
                  q.id === next.id ? { ...q, state: "queued", attempts: nextAttempts, lastError: msg } : q
                )
              );
              // Backoff before retry so we don't spam the printer.
              await sleep(500 * nextAttempts);
              continue;
            }

            setLastError(msg);
            setStatus("error");
            setQueue((prev) =>
              prev.map((q) => (q.id === next.id ? { ...q, state: "failed", attempts: nextAttempts, lastError: msg } : q))
            );
            toast.error("Print failed", { description: msg });
          }
        }
      } finally {
        processingRef.current = false;
        if (printerRef.current && status !== "error") setStatus("connected");
      }
    };

    void run();
  }, [queue, printer, status]);

  // Auto restore last authorized USB printer (if browser allows).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const restored = await tryRestoreUsbPrinter();
      if (!cancelled && restored) {
        setPrinter(restored);
        setStatus("connected");
        toast("Printer restored", { description: restored.name });
      }
      void refreshAuthorizedUsbDevices();
    })();
    return () => {
      cancelled = true;
    };
     
  }, []);

  // Live disconnect detection for USB/Bluetooth.
  useEffect(() => {
    if (!printer) return;
    const stop = monitorPrinterConnection(printer, () => {
      setPrinter(null);
      setStatus("disconnected");
      toast.error("Printer disconnected", { description: `${printer.name} was unplugged.` });
    });
    return () => stop?.();
  }, [printer]);

  // Background status checks (helps serial / flaky stacks).
  useEffect(() => {
    if (!printer) return;
    return () => {};
  }, [printer]);

  const value = useMemo<PrinterContextValue>(
    () => ({
      status,
      printer,
      lastError,
      queue,
      authorizedUsbDevices,
      refreshAuthorizedUsbDevices,
      connectUSB,
      connectBluetooth,
      connectSerial,
      connectAuthorizedUsb,
      disconnect,
      enqueue,
      testPrint,
      retryFailed,
      clearDone,
    }),
    [
      status, 
      printer, 
      lastError, 
      queue, 
      authorizedUsbDevices, 
      connectAuthorizedUsb, 
      connectUSB, 
      testPrint
    ]
  );

  return <PrinterContext.Provider value={value}>{children}</PrinterContext.Provider>;
}

export function usePrinter() {
  const ctx = useContext(PrinterContext);
  if (!ctx) throw new Error("usePrinter must be used within PrinterProvider");
  return ctx;
}
