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
  labelSize: LabelSize;
  protocol?: 'escpos' | 'zpl' | 'tspl' | 'raw';
  dpi?: 203 | 300;
  rawCommand?: string; // For protocol='raw'
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
  return /tsc|tspl|gp-?|gprinter|hprt|xprinter|godex|argox/.test(n);
};

const guessProtocol = (printer: PrinterDevice): NonNullable<PrinterDevice["protocol"]> => {
  if (printer.protocol) return printer.protocol;
  if (isProbablyZplPrinter(printer.name)) return "zpl";
  if (isProbablyTsplPrinter(printer.name)) return "tspl";
  return "escpos";
};

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
    const protocol: NonNullable<PrinterDevice["protocol"]> =
      isProbablyZplPrinter(name) ? "zpl" : isProbablyTsplPrinter(name) ? "tspl" : "escpos";

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
    const protocol: NonNullable<PrinterDevice["protocol"]> =
      isProbablyZplPrinter(name) ? "zpl" : isProbablyTsplPrinter(name) ? "tspl" : "escpos";

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

// Convert image to ESC/POS commands for thermal printers
export const imageToESCPOS = async (imageDataUrl: string): Promise<Uint8Array> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      // Convert to monochrome bitmap
      const threshold = 128;
      const bitmap: number[] = [];
      
      for (let y = 0; y < imageData.height; y++) {
        for (let x = 0; x < imageData.width; x += 8) {
          let byte = 0;
          for (let bit = 0; bit < 8; bit++) {
            const px = (y * imageData.width + x + bit) * 4;
            const gray = (imageData.data[px] + imageData.data[px + 1] + imageData.data[px + 2]) / 3;
            if (gray < threshold) {
              byte |= (1 << (7 - bit));
            }
          }
          bitmap.push(byte);
        }
      }

      // ESC/POS commands
      const commands: number[] = [
        0x1B, 0x40, // Initialize printer
        0x1B, 0x61, 0x01, // Center align
        0x1D, 0x76, 0x30, 0x00, // Print raster bitmap
        (canvas.width / 8) & 0xFF, ((canvas.width / 8) >> 8) & 0xFF, // Width
        canvas.height & 0xFF, (canvas.height >> 8) & 0xFF, // Height
        ...bitmap,
        0x1B, 0x64, 0x03, // Feed 3 lines
        0x1D, 0x56, 0x41, 0x00, // Cut paper
      ];

      resolve(new Uint8Array(commands));
    };
    
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = imageDataUrl;
  });
};

const mmToDots = (mm: number, dpi: 203 | 300): number => Math.round((mm * dpi) / 25.4);

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
  const dims = getLabelDimensions(job.labelSize);
  const pw = mmToDots(dims.width, dpi);
  const ll = mmToDots(dims.height, dpi);

  const margin = mmToDots(2, dpi);
  const fontH = mmToDots(3, dpi);
  // Barcode area height (dots). We clamp later based on ZPL limits.
  const barcodeH = Math.max(mmToDots(10, dpi), ll - margin * 3 - fontH * 2);
  const barcodeHeightDots = Math.min(barcodeH, mmToDots(18, dpi));

  const productName = job.productName ? sanitizeZplFieldData(job.productName) : "";
  const price = job.price ? sanitizeZplFieldData(job.price) : "";
  const barcodeType: BarcodeType = job.barcodeType || "CODE128";

  const lines: string[] = [];
  lines.push("^XA");
  lines.push("^CI28");
  lines.push(`^PW${pw}`);
  lines.push(`^LL${ll}`);
  lines.push("^LH0,0");

  let y = margin;
  if (productName) {
    lines.push(`^FO${margin},${y}^A0N,${fontH},${fontH}^FD${productName}^FS`);
    y += fontH + mmToDots(1, dpi);
  }

  if (job.sku) {
    lines.push(`^FO${margin},${y}^A0N,${fontH},${fontH}^FD${sanitizeZplFieldData(job.sku)}^FS`);
    y += fontH + mmToDots(1, dpi);
  }

  if (job.batch) {
    lines.push(`^FO${margin},${y}^A0N,${fontH},${fontH}^FD${sanitizeZplFieldData(job.batch)}^FS`);
    y += fontH + mmToDots(1, dpi);
  }

  if (barcodeType === "QR") {
    const mag = 6;
    // ZPL QR: ^BQN and ^FDLA,<data>
    lines.push(`^FO${margin},${y}^BQN,2,${mag}^FDLA,${sanitizeZplFieldData(job.barcode)}^FS`);
  } else {
    // Keep output consistent with the HTML preview (no human-readable HRI under the barcode).
    // HRI text is often what makes labels look like the barcode is "duplicated" (top bars + bottom text).
    const barcodeField = getZplBarcodeField(barcodeType, barcodeHeightDots, "N");
    lines.push(`^FO${margin},${y}^BY2,2,${barcodeHeightDots}${barcodeField}^FD${job.barcode}^FS`);
  }

  if (price) {
    // Use the actual barcode height we rendered (not a fixed 18mm), and clamp inside the label bounds.
    const desiredPriceY = y + barcodeHeightDots + mmToDots(2, dpi);
    const minPriceY = margin;
    const maxPriceY = ll - margin - fontH;
    const priceY = Math.min(Math.max(desiredPriceY, minPriceY), maxPriceY);
    lines.push(`^FO${margin},${priceY}^A0N,${fontH},${fontH}^FD${price}^FS`);
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
  const dims = getLabelDimensions(job.labelSize);
  const wMm = dims.width;
  const hMm = dims.height;
  const wDots = mmToDots(wMm, dpi);
  const hDots = mmToDots(hMm, dpi);

  const margin = mmToDots(2, dpi);
  const fontYStep = mmToDots(4, dpi);
  const barcodeH = Math.min(mmToDots(18, dpi), hDots - margin * 3 - fontYStep * 2);

  const productName = job.productName ? sanitizeTsplText(job.productName) : "";
  const price = job.price ? sanitizeTsplText(job.price) : "";
  const barcodeType: BarcodeType = job.barcodeType || "CODE128";
  const barcodeCmdType = getTsplBarcodeType(barcodeType);

  const lines: string[] = [];
  lines.push(`SIZE ${wMm},${hMm}`);
  lines.push("GAP 2,0");
  lines.push("CLS");

  let y = margin;
  if (productName) {
    lines.push(`TEXT ${margin},${y},"0",0,1,1,"${productName}"`);
    y += fontYStep;
  }

  if (job.sku) {
    lines.push(`TEXT ${margin},${y},"0",0,1,1,"${sanitizeTsplText(job.sku)}"`);
    y += fontYStep;
  }

  if (job.batch) {
    lines.push(`TEXT ${margin},${y},"0",0,1,1,"${sanitizeTsplText(job.batch)}"`);
    y += fontYStep;
  }

  if (barcodeType === "QR") {
    lines.push(`QRCODE ${margin},${y},L,5,A,0,"${sanitizeTsplText(job.barcode)}"`);
  } else {
    // Disable human-readable text under/around the barcode to avoid "duplicate barcode" look.
    // TSPL uses a text-position parameter after height; `0` = no text.
    lines.push(`BARCODE ${margin},${y},"${barcodeCmdType}",${barcodeH},0,0,2,2,"${job.barcode}"`);
  }

  if (price) {
    const priceY = Math.max(y + barcodeH + mmToDots(2, dpi), hDots - margin - fontYStep);
    lines.push(`TEXT ${margin},${priceY},"0",0,1,1,"${price}"`);
  }

  const qty = Math.max(1, job.quantity || 1);
  lines.push(`PRINT ${qty}`);
  return lines.join("\n") + "\n";
};

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
      const rawBytes = new TextEncoder().encode(job.rawCommand);
      if (printer.type === 'usb') return await printToUSB(printer, rawBytes);
      if (printer.type === 'bluetooth') return await printToBluetooth(printer, rawBytes);
      throw new Error('Unsupported printer type');
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

    // ESC/POS fallback (receipt-style printing).
    // Generate barcode image
    const barcodeImage = generateBarcodeImage(job.barcode, job.barcodeType || 'CODE128');
    const escposData = await imageToESCPOS(barcodeImage);

    const commands: number[] = Array.from(escposData);
    if (job.productName) {
      const nameBytes = new TextEncoder().encode(job.productName + '\n');
      commands.unshift(...Array.from(nameBytes));
    }
    if (job.price) {
      const priceBytes = new TextEncoder().encode('Price: ' + job.price + '\n');
      commands.push(...Array.from(priceBytes));
    }

    const singleLabel = new Uint8Array(commands);
    const copies = Math.max(1, job.quantity || 1);

    let finalData = singleLabel;
    if (copies > 1) {
      finalData = new Uint8Array(singleLabel.length * copies);
      for (let i = 0; i < copies; i++) {
        finalData.set(singleLabel, i * singleLabel.length);
      }
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
