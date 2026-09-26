import type { PrinterDevice } from "@/lib/printerUtils";

export type BarcodePrinterProtocol = "auto" | "escpos" | "zpl" | "tspl";
export type PrinterDpi = "auto" | 203 | 300;
export type LabelOrientation = "portrait" | "landscape";

export interface PrinterLabelProfile {
  printerId: string;
  printerName: string;
  connectionType: PrinterDevice["type"];
  vendorId?: number;
  productId?: number;
  serialNumber?: string;
  protocol: BarcodePrinterProtocol;
  dpi: PrinterDpi;
  widthMm: number;
  heightMm: number;
  orientation: LabelOrientation;
  offsetXmm: number;
  offsetYmm: number;
  /** Printer dots per narrow barcode bar. "auto" keeps the protocol-safe default. */
  barcodeModuleWidth: "auto" | number;
  /** Physical barcode height in mm. "auto" allocates remaining safe label space. */
  barcodeHeightMm: "auto" | number;
  updatedAt: string;
}

function STORAGE_KEY() {
  try {
    const storeId = localStorage.getItem('brec_current_store');
    return storeId ? `brec_barcode_printer_profiles_v1_${storeId}` : 'brec_barcode_printer_profiles_v1';
  } catch { return 'brec_barcode_printer_profiles_v1'; }
}

export function getPrinterProfileId(printer: PrinterDevice): string {
  const device = printer.type === "bluetooth" ? printer.device?.device : printer.device;
  const serial = device?.serialNumber;
  if (serial) return `${printer.type}:serial:${serial}`;
  const vendorId = device?.vendorId ?? device?.usbVendorId;
  const productId = device?.productId ?? device?.usbProductId;
  if (vendorId != null || productId != null) return `${printer.type}:usb:${vendorId ?? "?"}:${productId ?? "?"}:${printer.name}`;
  // Bluetooth IDs are browser-provided stable identifiers. Serial names are the
  // best available fallback when the browser does not expose USB identity.
  if (printer.id && !printer.id.startsWith("usb-")) return `${printer.type}:id:${printer.id}`;
  return `${printer.type}:name:${printer.name}`;
}

export function createDefaultPrinterProfile(printer: PrinterDevice): PrinterLabelProfile {
  const device = printer.type === "bluetooth" ? printer.device?.device : printer.device;
  return {
    printerId: getPrinterProfileId(printer),
    printerName: printer.name,
    connectionType: printer.type,
    vendorId: device?.vendorId ?? device?.usbVendorId,
    productId: device?.productId ?? device?.usbProductId,
    serialNumber: device?.serialNumber,
    protocol: printer.protocol === "zpl" || printer.protocol === "tspl" || printer.protocol === "escpos" ? printer.protocol : "auto",
    dpi: "auto",
    widthMm: 50,
    heightMm: 30,
    orientation: "portrait",
    offsetXmm: 0,
    offsetYmm: 0,
    barcodeModuleWidth: "auto",
    barcodeHeightMm: "auto",
    updatedAt: new Date().toISOString(),
  };
}

function readProfiles(): Record<string, PrinterLabelProfile> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY()) || "{}") as Record<string, PrinterLabelProfile>; } catch { return {}; }
}

export function loadPrinterProfile(printer: PrinterDevice): PrinterLabelProfile {
  const saved = readProfiles()[getPrinterProfileId(printer)];
  return saved
    ? { ...createDefaultPrinterProfile(printer), ...saved, barcodeModuleWidth: saved.barcodeModuleWidth ?? "auto", barcodeHeightMm: saved.barcodeHeightMm ?? "auto" }
    : createDefaultPrinterProfile(printer);
}

export function savePrinterProfile(profile: PrinterLabelProfile): void {
  const profiles = readProfiles();
  profiles[profile.printerId] = { ...profile, updatedAt: new Date().toISOString() };
  localStorage.setItem(STORAGE_KEY(), JSON.stringify(profiles));
}
