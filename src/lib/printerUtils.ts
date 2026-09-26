// Printer utilities for barcode printing

import JsBarcode from 'jsbarcode';
import { getLabelDimensions } from "@/lib/barcode";
import type { BarcodeType, LabelSize } from "@/types/barcode";

// Extend Navigator interface for Web USB and Web Bluetooth
declare global {
  interface Navigator {
    usb?: {
      requestDevice(options?: any): Promise<any>;
      getDevices(): Promise<any[]>;
      addEventListener(type: string, listener: (event: any) => void): void;
      removeEventListener(type: string, listener: (event: any) => void): void;
    };
    bluetooth?: {
      requestDevice(options?: any): Promise<any>;
      getDevices(): Promise<any[]>;
    };
    serial?: {
      requestPort(options?: any): Promise<any>;
      getPorts(): Promise<any[]>;
    };
  }
}

export interface PrinterDevice {
  id: string;
  name: string;
  type: 'usb' | 'bluetooth' | 'network' | 'serial';
  device?: any;
  connected: boolean;
  address?: string;
  manufacturer?: string;
  // Hint for command language selection (optional).
  protocol?: 'escpos' | 'zpl' | 'tspl' | 'raw';
  // Cached USB endpoint details (optional; re-derived as needed).
  usbEndpoint?: {
    interfaceNumber: number;
    endpointNumber: number;
    packetSize?: number;
    alternateSetting?: number;
  };
}

export interface PrintJob {
  barcode: string;
  barcodeType?: BarcodeType;
  productName?: string;
  price?: string;
  sku?: string;
  batch?: string;
  quantity: number;
  labelSize: LabelSize | string;
  protocol?: 'escpos' | 'zpl' | 'tspl' | 'raw';
  dpi?: 203 | 300;
  /** Hardware origin compensation in physical millimetres. */
  offsetXmm?: number;
  offsetYmm?: number;
  orientation?: 'portrait' | 'landscape';
  barcodeModuleWidth?: number;
  barcodeHeightMm?: number;
  rawCommand?: string;
  /** Field render order — matches the preview. e.g. ['productName','barcode','price','sku'] */
  fieldOrder?: Array<'productName' | 'barcode' | 'price' | 'sku'>;
}

// Check if Web USB is supported
export const isWebUSBSupported = (): boolean => {
  return 'usb' in navigator;
};

// Check if Web Bluetooth is supported
export const isWebBluetoothSupported = (): boolean => {
  return 'bluetooth' in navigator;
};

// Check if Web Serial is supported
export const isWebSerialSupported = (): boolean => {
  return 'serial' in navigator;
};

const isProbablyZplPrinter = (name?: string): boolean => {
  const n = (name || "").toLowerCase();
  return /zebra|zdesigner|zt\d+|gk\d+|gc\d+|gx\d+|zm\d+|zq\d+/.test(n);
};

const isProbablyTsplPrinter = (name?: string): boolean => {
  const n = (name || "").toLowerCase();
  // Explicit brand matches
  if (/tsc|tspl|gp-?|gprinter|hprt|xprinter|godex|argox|citizen|bixolon/.test(n)) return true;
  // Generic thermal label printers that default to TSPL
  if (/label|barcode|thermal.*label|lp-?\d|lp\d/.test(n)) return true;
  return false;
};

export const inferPrinterProtocol = (name?: string, device?: any): NonNullable<PrinterDevice["protocol"]> => {
  if (isProbablyZplPrinter(name)) return "zpl";
  if (isProbablyTsplPrinter(name)) return "tspl";
  // USB vendor IDs for common label printer manufacturers
  // 0x0FE6 = ICS / Xprinter, 0x154F = POSTEK, 0x1CBE = Luminary (GP), 0x28E9 = GD32
  const vid = device?.vendorId ?? device?.usbVendorId ?? 0;
  if ([0x0FE6, 0x154F, 0x1CBE, 0x28E9, 0x0483].includes(vid)) return "tspl";
  return "escpos";
};

const guessProtocol = (printer: PrinterDevice): NonNullable<PrinterDevice["protocol"]> =>
  printer.protocol || inferPrinterProtocol(printer.name, printer.device);

const sameUsbDevice = (a: any, b: any): boolean => {
  if (!a || !b) return false;
  if (a === b) return true;
  // Prefer stable identifiers when available.
  const aKey = `${a.vendorId ?? ""}:${a.productId ?? ""}:${a.serialNumber ?? ""}`;
  const bKey = `${b.vendorId ?? ""}:${b.productId ?? ""}:${b.serialNumber ?? ""}`;
  if (aKey !== "::" && bKey !== "::" && aKey === bKey) return true;
  return false;
};

export const prepareUSBDevice = async (device: any): Promise<NonNullable<PrinterDevice["usbEndpoint"]>> => {
  if (!device) throw new Error("Missing USB device");

  if (!device.opened) {
    try {
      await device.open();
    } catch (err: any) {
      if (err.name === 'SecurityError' || err.message.includes('Access Denied')) {
        throw new Error("USB Access Denied: The OS or another app is using the printer. On Windows, you may need to use Zadig to install the WinUSB driver.");
      }
      throw err;
    }
  }

  if (device.configuration === null) {
    // Most printers expose configuration 1.
    try {
      await device.selectConfiguration(1);
    } catch {
      const fallbackValue = device.configurations?.[0]?.configurationValue;
      if (fallbackValue) {
        await device.selectConfiguration(fallbackValue);
      } else {
        throw new Error("USB device has no selectable configuration");
      }
    }
  }

  const config = device.configuration;
  if (!config || !config.interfaces) {
    throw new Error("USB device has no configuration interfaces");
  }

  // Find the first OUT endpoint (prefer bulk transfers).
  let chosen: { interfaceNumber: number; endpointNumber: number; packetSize?: number; alternateSetting?: number } | null = null;

  for (const iface of config.interfaces) {
    for (const alt of iface.alternates || []) {
      const outEndpoints = (alt.endpoints || []).filter((e: any) => e.direction === "out");
      if (outEndpoints.length === 0) continue;
      const bulk = outEndpoints.find((e: any) => e.type === "bulk") || outEndpoints[0];
      chosen = {
        interfaceNumber: iface.interfaceNumber,
        endpointNumber: bulk.endpointNumber,
        packetSize: bulk.packetSize,
        alternateSetting: alt.alternateSetting,
      };
      break;
    }
    if (chosen) break;
  }

  if (!chosen) {
    throw new Error("Could not find a USB OUT endpoint for this printer");
  }

  // Claim interface (ignore already-claimed errors).
  try {
    await device.claimInterface(chosen.interfaceNumber);
  } catch (error: any) {
    const msg = (error?.message || "").toLowerCase();
    const name = (error?.name || "").toLowerCase();
    if (!msg.includes("already") && !name.includes("invalidstate")) {
      throw error;
    }
  }

  // Select alternate setting when needed.
  if (typeof chosen.alternateSetting === "number") {
    try {
      await device.selectAlternateInterface(chosen.interfaceNumber, chosen.alternateSetting);
    } catch {
      // Optional; some devices don't require or support alternate selection.
    }
  }

  return chosen;
};

// Request USB printer
export const requestUSBPrinter = async (): Promise<PrinterDevice | null> => {
  if (!isWebUSBSupported()) {
    throw new Error('Web USB is not supported in this browser');
  }

  try {
    const device = await (navigator as any).usb.requestDevice({
      // Do not over-restrict filters: many label printers expose vendor-specific interfaces.
      filters: []
    });

    const usbEndpoint = await prepareUSBDevice(device);
    const name = device.productName || 'USB Printer';
    const protocol = inferPrinterProtocol(name, device);

    return {
      id: device.serialNumber || `usb-${Date.now()}`,
      name,
      type: 'usb',
      device,
      connected: true,
      usbEndpoint,
      protocol,
    };
  } catch (error: any) {
    if (error?.name === "NotFoundError") return null;
    console.error('Error requesting USB printer:', error);
    throw error;
  }
};

// Request Bluetooth printer
export const requestBluetoothPrinter = async (): Promise<PrinterDevice | null> => {
  if (!isWebBluetoothSupported()) {
    throw new Error('Web Bluetooth is not supported in this browser');
  }

  try {
    const device = await (navigator as any).bluetooth.requestDevice({
      filters: [
        { services: ['000018f0-0000-1000-8000-00805f9b34fb'] }, // Printer service
      ],
      optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb']
    });

    const server = await device.gatt.connect();
    const name = device.name || 'Bluetooth Printer';
    const protocol = inferPrinterProtocol(name, device);

    return {
      id: device.id,
      name,
      type: 'bluetooth',
      device: { device, server },
      connected: true,
      protocol,
    };
  } catch (error) {
    console.error('Error requesting Bluetooth printer:', error);
    return null;
  }
};

// Request Serial printer (Web Serial API) - useful as a fallback on some systems.
export const requestSerialPrinter = async (baudRate: number = 9600): Promise<PrinterDevice | null> => {
  if (!isWebSerialSupported()) {
    throw new Error("Web Serial is not supported in this browser");
  }

  try {
    const port = await (navigator as any).serial.requestPort({});
    if (!port) return null;

    try {
      await port.open({ baudRate });
    } catch (error: any) {
      // Ignore already-open errors.
      const msg = String(error?.message || "").toLowerCase();
      const name = String(error?.name || "").toLowerCase();
      if (!msg.includes("open") && !name.includes("invalidstate")) throw error;
    }

    const info = typeof port.getInfo === "function" ? port.getInfo() : null;
    const suffix = info?.usbVendorId ? ` (${info.usbVendorId}:${info.usbProductId})` : "";

    return {
      id: `serial-${Date.now()}`,
      name: `Serial Printer${suffix}`,
      type: "serial",
      device: port,
      connected: true,
      // Most serial label printers accept raw/ZPL/TSPL, but we default to raw and let jobs override.
      protocol: "raw",
    };
  } catch (error) {
    if ((error as any)?.name === "NotFoundError") return null;
    console.error("Error requesting Serial printer:", error);
    return null;
  }
};

// Generate barcode as image data
export const generateBarcodeImage = (
  barcode: string,
  barcodeType: string = 'CODE128',
  width: number = 2,
  height: number = 50
): string => {
  const canvas = document.createElement('canvas');
  
  try {
    JsBarcode(canvas, barcode, {
      format: barcodeType,
      width,
      height,
      displayValue: true,
      fontSize: 14,
      margin: 10,
    });
    
    return canvas.toDataURL('image/png');
  } catch (error) {
    console.error('Error generating barcode:', error);
    throw error;
  }
};

// Convert image to ESC/POS raster bitmap commands.
// Width MUST be padded to a multiple of 8 — otherwise every row is offset
// and the printer outputs garbage lines.
export const imageToESCPOS = async (imageDataUrl: string): Promise<Uint8Array> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // Pad canvas width to nearest multiple of 8
      const paddedWidth = Math.ceil(img.width / 8) * 8;
      const bytesPerRow = paddedWidth / 8;

      const canvas = document.createElement('canvas');
      canvas.width = paddedWidth;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');

      if (!ctx) { reject(new Error('Could not get canvas context')); return; }

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, paddedWidth, img.height);
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, paddedWidth, img.height);
      const threshold = 128;
      const bitmap: number[] = [];

      for (let y = 0; y < img.height; y++) {
        for (let col = 0; col < bytesPerRow; col++) {
          let byte = 0;
          for (let bit = 0; bit < 8; bit++) {
            const x = col * 8 + bit;
            const px = (y * paddedWidth + x) * 4;
            const r = imageData.data[px] ?? 255;
            const g = imageData.data[px + 1] ?? 255;
            const b = imageData.data[px + 2] ?? 255;
            const gray = (r + g + b) / 3;
            if (gray < threshold) byte |= (1 << (7 - bit));
          }
          bitmap.push(byte);
        }
      }

      const commands: number[] = [
        0x1B, 0x40,             // ESC @ — initialize
        0x1B, 0x61, 0x01,       // ESC a 1 — center align
        // GS v 0 — raster bitmap (m=0 normal density)
        0x1D, 0x76, 0x30, 0x00,
        bytesPerRow & 0xFF, (bytesPerRow >> 8) & 0xFF,   // xL, xH
        img.height & 0xFF, (img.height >> 8) & 0xFF,     // yL, yH
        ...bitmap,
        0x1B, 0x64, 0x04,       // ESC d 4 — feed 4 lines
        0x1D, 0x56, 0x41, 0x00, // GS V A 0 — partial cut
      ];

      resolve(new Uint8Array(commands));
    };
    img.onerror = () => reject(new Error('Failed to load barcode image'));
    img.src = imageDataUrl;
  });
};

const mmToDots = (mm: number, dpi: 203 | 300): number => Math.round((mm * dpi) / 25.4);

const getJobDimensions = (job: PrintJob) => {
  const dims = getLabelDimensions(job.labelSize);
  return job.orientation === "landscape" ? { width: dims.height, height: dims.width } : dims;
};

/**
 * Keep linear codes deliberately landscape-shaped.  The printer draws bars
 * natively, so this only chooses its module width and bar height; it never
 * scales an already generated barcode image (which could make it unscannable).
 */
const getLinearBarcodeLayout = ({
  value,
  contentWidth,
  availableHeight,
  dpi,
  requestedModuleWidth,
  requestedHeightMm,
}: {
  value: string;
  contentWidth: number;
  availableHeight: number;
  dpi: 203 | 300;
  requestedModuleWidth?: number;
  requestedHeightMm?: number;
}) => {
  // CODE128 is the widest common case. The estimate gives a safe centering
  // box without claiming to alter the printer's symbology.
  const estimatedModules = Math.max(35, value.length * 11 + 35);
  const autoModuleWidth = Math.max(1, Math.min(10, Math.floor((contentWidth * 0.86) / estimatedModules) || 1));
  const moduleWidth = Math.max(1, Math.min(10, Math.round(requestedModuleWidth ?? autoModuleWidth)));
  const width = Math.min(contentWidth, estimatedModules * moduleWidth);
  const requestedHeight = requestedHeightMm ? mmToDots(requestedHeightMm, dpi) : Math.round(width / 3);
  // 2.5:1 is the hard floor. It prevents manual height from producing a
  // square label while still allowing short labels to use their available room.
  const maxLandscapeHeight = Math.max(1, Math.floor(width / 2.5));
  const height = Math.max(1, Math.min(availableHeight, maxLandscapeHeight, requestedHeight));
  return { moduleWidth, width, height };
};

const sanitizeZplFieldData = (text: string): string => {
  // Avoid accidental ZPL control sequences in field data.
  return text.replace(/[\^~]/g, " ").trim();
};

const getZplBarcodeField = (type: BarcodeType, heightDots: number, hri: "Y" | "N"): string => {
  switch (type) {
    case "QR":
      // QR uses a different command sequence; handled in buildZplLabel.
      return "^BQN,2,6";
    case "EAN13":
      return `^BEN,${heightDots},${hri},N`;
    case "EAN8":
      return `^B8N,${heightDots},${hri},N`;
    case "UPC":
      return `^BUN,${heightDots},${hri},N`;
    case "CODE39":
      return `^B3N,${heightDots},${hri},N,N`;
    case "ITF14":
      return `^B2N,${heightDots},${hri},N,N`;
    default:
      return `^BCN,${heightDots},${hri},N,N`;
  }
};

const buildZplLabel = (job: PrintJob): string => {
  const dpi: 203 | 300 = job.dpi || 203;
  const dims = getJobDimensions(job);
  const wMm = dims.width;
  const hMm = dims.height;
  const pw = mmToDots(wMm, dpi);
  const ll = mmToDots(hMm, dpi);

  const marginMm = hMm <= 25 ? 1 : 2;
  const margin = mmToDots(marginMm, dpi);
  const contentW = pw - margin * 2;

  // Physical labels were reading too large. Use a text face five points
  // smaller (5 pt ≈ 1.76 mm) while retaining a safe minimum for scanners and
  // adding separation between each printed element.
  const fontMm = Math.max(1.5, Math.min(5, Math.max(3, hMm * 0.10)) - 1.76);
  const fontH = mmToDots(fontMm, dpi);
  const lineGap = mmToDots(1.5, dpi);
  const rowStep = fontH + lineGap;

  const productName = job.productName ? sanitizeZplFieldData(job.productName) : "";
  const price       = job.price       ? sanitizeZplFieldData(job.price)       : "";
  const sku         = job.sku         ? sanitizeZplFieldData(job.sku)         : "";
  const barcodeType: BarcodeType = job.barcodeType || "CODE128";

  // Use fieldOrder from job (matches preview) or fall back to default
  const order = job.fieldOrder ?? ['productName', 'barcode', 'price', 'sku'];
  const activeFields = order.filter(f =>
    (f === 'productName' && productName) ||
    (f === 'barcode') ||
    (f === 'price' && price) ||
    (f === 'sku' && sku)
  );

  const textFieldCount = activeFields.filter(f => f !== 'barcode').length;
  // Reserve the lower-field gaps as well as text so a short label never
  // clips its price or SKU. Linear code height is then constrained by width.
  const textUsed = textFieldCount * rowStep + margin * 2 + lineGap * (textFieldCount + 1);
  const availableBarcodeH = Math.max(1, ll - textUsed);
  const linearLayout = getLinearBarcodeLayout({
    value: job.barcode,
    contentWidth: contentW,
    availableHeight: availableBarcodeH,
    dpi,
    requestedModuleWidth: job.barcodeModuleWidth,
    requestedHeightMm: job.barcodeHeightMm,
  });
  const barcodeH = barcodeType === "QR"
    ? Math.min(availableBarcodeH, Math.max(mmToDots(4, dpi), job.barcodeHeightMm ? mmToDots(job.barcodeHeightMm, dpi) : availableBarcodeH))
    : linearLayout.height;
  const moduleW = linearLayout.moduleWidth;
  const barcodeWDots = linearLayout.width;
  const barcodeX = margin + Math.max(0, Math.round((contentW - barcodeWDots) / 2));

  const centeredText = (text: string, y: number) =>
    `^FO${margin},${y}^A0N,${fontH},${fontH}^FB${contentW},1,0,C,0^FD${text}^FS`;

  const lines: string[] = [];
  lines.push("^XA");
  lines.push("^CI28");
  lines.push(`^PW${pw}`);
  lines.push(`^LL${ll}`);
  lines.push(`^LH${mmToDots(job.offsetXmm || 0, dpi)},${mmToDots(job.offsetYmm || 0, dpi)}`);
  lines.push("^MMT");

  let y = margin;

  for (const field of activeFields) {
    if (field === 'productName' && productName) {
      lines.push(centeredText(productName, y));
      y += rowStep;
    } else if (field === 'barcode') {
      if (barcodeType === "QR") {
        const mag = Math.max(2, Math.floor(barcodeH / 25));
        const qrSize = mag * 25;
        const qrX = margin + Math.max(0, Math.round((contentW - qrSize) / 2));
        lines.push(`^FO${qrX},${y}^BQN,2,${mag}^FDLA,${sanitizeZplFieldData(job.barcode)}^FS`);
        y += qrSize + lineGap;
      } else {
        const barcodeField = getZplBarcodeField(barcodeType, barcodeH, "Y");
        lines.push(`^FO${barcodeX},${y}^BY${moduleW},2,${barcodeH}${barcodeField}^FD${job.barcode}^FS`);
        y += barcodeH + lineGap;
      }
    } else if (field === 'price' && price) {
      // Keep the lower text fields visually separate without moving the top
      // product/barcode area that has already been calibrated.
      y += lineGap;
      const py = Math.min(y, ll - margin - fontH);
      lines.push(centeredText(price, py));
      y += rowStep;
    } else if (field === 'sku' && sku) {
      y += lineGap;
      const sy = Math.min(y, ll - margin - fontH);
      lines.push(centeredText(sku, sy));
      y += rowStep;
    }
  }

  const qty = Math.max(1, job.quantity || 1);
  lines.push(`^PQ${qty},0,1,N`);
  lines.push("^XZ");
  return lines.join("\n");
};

const sanitizeTsplText = (text: string): string => {
  // TSPL uses quotes around text; strip problematic characters.
  return text.replace(/[\r\n"]/g, " ").trim();
};

const getTsplBarcodeType = (type: BarcodeType): string => {
  switch (type) {
    case "QR":
      // QR is handled separately in buildTsplLabel.
      return "QRCODE";
    case "EAN13":
      return "EAN13";
    case "EAN8":
      return "EAN8";
    case "UPC":
      return "UPCA";
    case "CODE39":
      return "CODE39";
    case "ITF14":
      return "ITF14";
    default:
      return "128";
  }
};

const buildTsplLabel = (job: PrintJob): string => {
  const dpi: 203 | 300 = job.dpi || 203;
  const dims = getJobDimensions(job);
  const wMm = dims.width;
  const hMm = dims.height;
  const wDots = mmToDots(wMm, dpi);
  const hDots = mmToDots(hMm, dpi);

  const marginMm = hMm <= 25 ? 1 : 2;
  const margin = mmToDots(marginMm, dpi);

  const productName = job.productName ? sanitizeTsplText(job.productName) : "";
  const price       = job.price       ? sanitizeTsplText(job.price)       : "";
  const sku         = job.sku         ? sanitizeTsplText(job.sku)         : "";
  const barcodeType: BarcodeType = job.barcodeType || "CODE128";
  const barcodeCmdType = getTsplBarcodeType(barcodeType);

  // TSPL font 2 is the compact built-in face. It replaces the former larger
  // font 3, reducing physical text by about five points on 203-DPI labels.
  const textFont = "2";
  const fontScale = 1;
  const fontH = 16;
  const lineGap = mmToDots(1.5, dpi);
  const rowStep = fontH + lineGap;

  const order = job.fieldOrder ?? ['productName', 'barcode', 'price', 'sku'];
  const activeFields = order.filter(f =>
    (f === 'productName' && productName) ||
    (f === 'barcode') ||
    (f === 'price' && price) ||
    (f === 'sku' && sku)
  );

  const textFieldCount = activeFields.filter(f => f !== 'barcode').length;
  const textUsed = textFieldCount * rowStep + margin * 2 + lineGap * (textFieldCount + 1);
  const availableBarcodeH = Math.max(1, hDots - textUsed);
  const linearLayout = getLinearBarcodeLayout({
    value: job.barcode,
    contentWidth: wDots - margin * 2,
    availableHeight: availableBarcodeH,
    dpi,
    requestedModuleWidth: job.barcodeModuleWidth,
    requestedHeightMm: job.barcodeHeightMm,
  });
  const barcodeH = barcodeType === "QR"
    ? Math.min(availableBarcodeH, Math.max(mmToDots(4, dpi), job.barcodeHeightMm ? mmToDots(job.barcodeHeightMm, dpi) : availableBarcodeH))
    : linearLayout.height;
  const narrowBar = linearLayout.moduleWidth;
  const barcodeWDots = linearLayout.width;

  const centerText = (charCount: number) => {
    const textW = charCount * 12 * fontScale;
    return Math.max(margin, Math.round((wDots - Math.min(textW, wDots - margin * 2)) / 2));
  };
  const barcodeX = Math.max(margin, Math.round((wDots - barcodeWDots) / 2));

  const lines: string[] = [];
  lines.push(`SIZE ${wMm} mm,${hMm} mm`);
  lines.push("GAP 2 mm,0 mm");
  lines.push("DIRECTION 0,0");
  lines.push(`REFERENCE ${mmToDots(job.offsetXmm || 0, dpi)},${mmToDots(job.offsetYmm || 0, dpi)}`);
  lines.push("OFFSET 0 mm");
  lines.push("SET PEEL OFF");
  lines.push("SET CUTTER OFF");
  lines.push("CLS");

  let y = margin;

  for (const field of activeFields) {
    if (field === 'productName' && productName) {
      const x = centerText(productName.length);
      lines.push(`TEXT ${x},${y},"${textFont}",0,${fontScale},${fontScale},"${productName}"`);
      y += rowStep;
    } else if (field === 'barcode') {
      if (barcodeType === "QR") {
        const qrSize = Math.min(barcodeH, wDots - margin * 2);
        const cellMm = Math.max(3, Math.floor(qrSize / 25));
        const qrX = Math.max(margin, Math.round((wDots - qrSize) / 2));
        lines.push(`QRCODE ${qrX},${y},L,${cellMm},A,0,"${sanitizeTsplText(job.barcode)}"`);
        y += qrSize + lineGap;
      } else {
        lines.push(`BARCODE ${barcodeX},${y},"${barcodeCmdType}",${barcodeH},1,0,${narrowBar},${Math.min(10, narrowBar * 2)},"${job.barcode}"`);
        y += barcodeH + lineGap;
      }
    } else if (field === 'price' && price) {
      // Extra lower-field spacing only: keep the already-correct top layout.
      y += lineGap;
      const py = Math.min(y, hDots - margin - fontH);
      const x = centerText(price.length);
      lines.push(`TEXT ${x},${py},"${textFont}",0,${fontScale},${fontScale},"${price}"`);
      y += rowStep;
    } else if (field === 'sku' && sku) {
      y += lineGap;
      const sy = Math.min(y, hDots - margin - fontH);
      const x = centerText(sku.length);
      lines.push(`TEXT ${x},${sy},"${textFont}",0,${fontScale},${fontScale},"${sku}"`);
      y += rowStep;
    }
  }

  const qty = Math.max(1, job.quantity || 1);
  lines.push(`PRINT ${qty},1`);
  return lines.join("\r\n") + "\r\n";
};

export function buildCalibrationLabel(profile: {
  widthMm: number;
  heightMm: number;
  protocol: 'escpos' | 'zpl' | 'tspl' | 'raw';
  dpi: 203 | 300;
  offsetXmm?: number;
  offsetYmm?: number;
  orientation?: 'portrait' | 'landscape';
}): string {
  const dims = profile.orientation === 'landscape'
    ? { width: profile.heightMm, height: profile.widthMm }
    : { width: profile.widthMm, height: profile.heightMm };
  const x = mmToDots(profile.offsetXmm || 0, profile.dpi);
  const y = mmToDots(profile.offsetYmm || 0, profile.dpi);
  const widthDots = mmToDots(dims.width, profile.dpi);
  const heightDots = mmToDots(dims.height, profile.dpi);
  const caption = `${dims.width} x ${dims.height} mm`;
  if (profile.protocol === 'zpl') {
    const marker = Math.max(8, mmToDots(2, profile.dpi));
    return ["^XA", "^CI28", `^PW${widthDots}`, `^LL${heightDots}`, `^LH${x},${y}`, "^FO0,0^GB" + widthDots + "," + heightDots + ",2^FS",
      `^FO0,0^GB${marker},${marker},2^FS`, `^FO${widthDots - marker},0^GB${marker},${marker},2^FS`, `^FO0,${heightDots - marker}^GB${marker},${marker},2^FS`, `^FO${widthDots - marker},${heightDots - marker}^GB${marker},${marker},2^FS`,
      `^FO${Math.max(10, Math.round(widthDots / 2) - 100)},${Math.max(20, Math.round(heightDots / 2) - 20)}^A0N,30,30^FD${caption}^FS`, "^PQ1,0,1,N", "^XZ"].join("\n");
  }
  if (profile.protocol === 'tspl' || profile.protocol === 'raw') {
    return [`SIZE ${dims.width} mm,${dims.height} mm`, "GAP 2 mm,0 mm", "DIRECTION 0,0", `REFERENCE ${x},${y}`, "CLS",
      `BOX 0,0,${widthDots - 1},${heightDots - 1},2`, `BAR 0,0,${Math.max(8, mmToDots(2, profile.dpi))},${Math.max(8, mmToDots(2, profile.dpi))}`,
      `BAR ${widthDots - Math.max(8, mmToDots(2, profile.dpi))},0,${Math.max(8, mmToDots(2, profile.dpi))},${Math.max(8, mmToDots(2, profile.dpi))}`,
      `TEXT ${Math.max(10, Math.round(widthDots / 2) - 70)},${Math.max(20, Math.round(heightDots / 2) - 12)},"3",0,1,1,"${caption}"`, "PRINT 1,1", ""].join("\r\n");
  }
  return `\x1B@\x1Ba\x01\x1BE\x01CALIBRATION ${caption}\n\x1BE\x00+--------------------+\n|  MEASURE THIS BOX  |\n+--------------------+\n\n\n`;
}

// Print to USB printer
export const printToUSB = async (printer: PrinterDevice, data: Uint8Array): Promise<void> => {
  if (!printer.device || printer.type !== 'usb') {
    throw new Error('Invalid USB printer');
  }

  try {
    const device = printer.device;

    const usbEndpoint = printer.usbEndpoint || await prepareUSBDevice(device);
    printer.usbEndpoint = usbEndpoint;

    // Chunk writes for better compatibility with printer USB stacks.
    const packetSize = usbEndpoint.packetSize || 64;
    const chunkSize = Math.max(1024, packetSize * 16);

    for (let offset = 0; offset < data.length; offset += chunkSize) {
      const chunk = data.slice(offset, Math.min(offset + chunkSize, data.length));
      await device.transferOut(usbEndpoint.endpointNumber, chunk);
    }
  } catch (error: any) {
    console.error('Error printing to USB:', error);
    
    // Provide more helpful error messages
    const msg = (error?.message || "").toLowerCase();
    if (msg.includes('not opened') || msg.includes("disconnected") || msg.includes("device") && msg.includes("unavailable")) {
      throw new Error('USB device is not accessible. Please reconnect the printer.');
    } else if (msg.includes('no device selected') || msg.includes("notfounderror")) {
      throw new Error('No USB device selected. Please connect a printer.');
    } else {
      throw new Error(`USB print failed: ${error.message}`);
    }
  }
};

// Print to Bluetooth printer
export const printToBluetooth = async (printer: PrinterDevice, data: Uint8Array): Promise<void> => {
  if (!printer.device || printer.type !== 'bluetooth') {
    throw new Error('Invalid Bluetooth printer');
  }

  try {
    const { server } = printer.device;
    const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
    const characteristic = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb');
    
    // Send data in chunks (Bluetooth has size limits)
    const chunkSize = 512;
    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.slice(i, Math.min(i + chunkSize, data.length));
      await characteristic.writeValue(chunk);
      await new Promise(resolve => setTimeout(resolve, 50)); // Small delay between chunks
    }
  } catch (error) {
    console.error('Error printing to Bluetooth:', error);
    throw error;
  }
};

// Send raw commands to a printer (ZPL/TSPL/ESC-POS/RAW bytes).
export const sendPrinterCommand = async (
  printer: PrinterDevice,
  command: string | Uint8Array
): Promise<void> => {
  const bytes = typeof command === "string" ? new TextEncoder().encode(command) : command;

  if (printer.type === "usb") return await printToUSB(printer, bytes);
  if (printer.type === "bluetooth") return await printToBluetooth(printer, bytes);
  if (printer.type === "serial" && printer.device?.writable) {
    const writer = printer.device.writable.getWriter();
    try {
      await writer.write(bytes);
    } finally {
      writer.releaseLock();
    }
    return;
  }

  throw new Error("Unsupported printer type");
};

// Print barcode label
export const printBarcodeLabel = async (
  printer: PrinterDevice,
  job: PrintJob
): Promise<void> => {
  try {
    const protocol = job.protocol || printer.protocol || guessProtocol(printer);

    if (protocol === "raw") {
      if (!job.rawCommand) throw new Error("Missing rawCommand for raw printing");
      return await sendPrinterCommand(printer, job.rawCommand);
    }

    if (protocol === "zpl") {
      const zpl = buildZplLabel(job);
      const zplBytes = new TextEncoder().encode(zpl);
      if (printer.type === 'usb') return await printToUSB(printer, zplBytes);
      if (printer.type === 'bluetooth') return await printToBluetooth(printer, zplBytes);
      throw new Error('Unsupported printer type');
    }

    if (protocol === "tspl") {
      const tspl = buildTsplLabel(job);
      const tsplBytes = new TextEncoder().encode(tspl);
      if (printer.type === 'usb') return await printToUSB(printer, tsplBytes);
      if (printer.type === 'bluetooth') return await printToBluetooth(printer, tsplBytes);
      throw new Error('Unsupported printer type');
    }

    // ESC/POS — use native barcode commands (GS k) instead of bitmap conversion.
    const enc = new TextEncoder();
    const dims = getJobDimensions(job);
    const escDpi: 203 | 300 = job.dpi || 203;
    const escMargin = mmToDots(dims.height <= 25 ? 1 : 2, escDpi);
    const escContentWidth = Math.max(1, mmToDots(dims.width, escDpi) - escMargin * 2);
    // ESC/POS cannot position a barcode at an exact X coordinate, but centered
    // alignment plus native bar-height/width commands still preserve the same
    // wide landscape barcode geometry as ZPL and TSPL.
    const escLayout = getLinearBarcodeLayout({
      value: job.barcode,
      contentWidth: escContentWidth,
      availableHeight: Math.max(1, mmToDots(dims.height, escDpi) - mmToDots(10, escDpi)),
      dpi: escDpi,
      requestedModuleWidth: job.barcodeModuleWidth,
      requestedHeightMm: job.barcodeHeightMm,
    });
    const escBarcodeH = Math.min(255, escLayout.height);
    const CENTER = [0x1B, 0x61, 0x01]; // ESC a 1 — center align (re-apply before each element)

    const commands: number[] = [
      0x1B, 0x40,       // ESC @ — initialize
      ...CENTER,
    ];

    if (job.productName) {
      commands.push(...CENTER);
      commands.push(0x1B, 0x45, 0x01); // bold on
      commands.push(...Array.from(enc.encode(job.productName.substring(0, 32) + '\n')));
      commands.push(0x1B, 0x45, 0x00); // bold off
    }

    if (job.sku) {
      commands.push(...CENTER);
      commands.push(...Array.from(enc.encode(job.sku.substring(0, 32) + '\n')));
    }

    // Re-center before barcode (some printers reset alignment after text)
    commands.push(...CENTER);
    // GS h — barcode height (dots, 1-255)
    commands.push(0x1D, 0x68, escBarcodeH);
    // GS w — barcode module width: 2 for narrow labels, 3 for wider
    const escModuleWidth = Math.max(2, Math.min(6, escLayout.moduleWidth));
    commands.push(0x1D, 0x77, escModuleWidth);
    // GS H — HRI position: 2=below
    commands.push(0x1D, 0x48, 2);
    // GS f — HRI font: 0=font A (small)
    commands.push(0x1D, 0x66, 0);
    // GS k — CODE128 (type 73), length-prefixed
    const barcodeBytes = Array.from(enc.encode(job.barcode));
    commands.push(0x1D, 0x6B, 73, barcodeBytes.length, ...barcodeBytes);
    commands.push(0x0A);

    if (job.price) {
      commands.push(...CENTER);
      commands.push(...Array.from(enc.encode(job.price + '\n')));
    }

    commands.push(0x1B, 0x64, 0x03); // ESC d 3 — feed 3 lines
    commands.push(0x1D, 0x56, 0x41, 0x00); // GS V A — partial cut

    const copies = Math.max(1, job.quantity || 1);
    const single = new Uint8Array(commands);
    let finalData = single;
    if (copies > 1) {
      finalData = new Uint8Array(single.length * copies);
      for (let i = 0; i < copies; i++) finalData.set(single, i * single.length);
    }

    if (printer.type === 'usb') return await printToUSB(printer, finalData);
    if (printer.type === 'bluetooth') return await printToBluetooth(printer, finalData);
    throw new Error('Unsupported printer type');
  } catch (error) {
    console.error('Error printing barcode label:', error);
    throw error;
  }
};

// Disconnect printer
export const disconnectPrinter = async (printer: PrinterDevice): Promise<void> => {
  try {
    if (printer.type === 'usb' && printer.device) {
      await printer.device.close();
    } else if (printer.type === 'bluetooth' && printer.device) {
      await printer.device.server.disconnect();
    } else if (printer.type === "serial" && printer.device) {
      try {
        await printer.device.close();
      } catch {
        // ignore
      }
    }
  } catch (error) {
    console.error('Error disconnecting printer:', error);
    throw error;
  }
};

// Monitor printer connection status
export const monitorPrinterConnection = (
  printer: PrinterDevice,
  onDisconnect: () => void
): (() => void) => {
  if (printer.type === 'usb' && printer.device) {
    const handler = (event: any) => {
      if (sameUsbDevice(event?.device, printer.device)) onDisconnect();
    };
    navigator.usb?.addEventListener('disconnect', handler);
    return () => navigator.usb?.removeEventListener('disconnect', handler);
  }

  if (printer.type === 'bluetooth' && printer.device) {
    const btDevice = printer.device?.device || printer.device;
    const handler = () => onDisconnect();
    btDevice?.addEventListener?.('gattserverdisconnected', handler);
    return () => btDevice?.removeEventListener?.('gattserverdisconnected', handler);
  }

  return () => undefined;
};

// Check if printer is active and ready
export const checkPrinterStatus = async (printer: PrinterDevice): Promise<{
  active: boolean;
  message: string;
}> => {
  try {
    if (printer.type === 'usb' && printer.device) {
      const device = printer.device;
      
      // Check if device is opened
      if (!device.opened) {
        return {
          active: false,
          message: 'USB device is not opened. Attempting to open...'
        };
      }
      
      // Try to get device info to verify connection
      if (device.productName) {
        return {
          active: true,
          message: `✓ ${device.productName} is active and ready`
        };
      }
      
      return {
        active: true,
        message: '✓ USB printer is connected and ready'
      };
    } else if (printer.type === 'bluetooth' && printer.device) {
      const { device, server } = printer.device;
      
      if (!server.connected) {
        return {
          active: false,
          message: 'Bluetooth device is disconnected'
        };
      }
      
      return {
        active: true,
        message: `✓ ${device.name || 'Bluetooth printer'} is active and ready`
      };
    } else if (printer.type === "serial" && printer.device) {
      const ok = !!printer.device?.writable;
      return {
        active: ok,
        message: ok ? "Serial printer is ready" : "Serial printer is not writable",
      };
    } else {
      return {
        active: false,
        message: 'Unknown printer type'
      };
    }
  } catch (error: any) {
    return {
      active: false,
      message: `Error: ${error.message}`
    };
  }
};
