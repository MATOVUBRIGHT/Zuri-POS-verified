import type { BarcodeType, BarcodeMode, LabelSize } from '@/types/barcode';

/**
 * Generate a unique barcode with configurable prefix
 */
export const generateBarcode = (prefix: string = 'BREC'): string => {
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}${timestamp}${random}`;
};

/**
 * Simple, human-readable barcode helper.
 * Kept separate from generateBarcode() so we can use a hyphenated format if desired.
 */
export const generateSimpleBarcode = (): string => {
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `BR-${Date.now()}-${random}`;
};

/**
 * Generate a barcode based on barcode type
 */
export const generateBarcodeByType = (type: BarcodeType): string => {
  switch (type) {
    case 'EAN13':
      return generateEAN13();
    case 'EAN8':
      return generateEAN8();
    case 'UPC':
      return generateUPC();
    case 'CODE39':
      return generateCODE39();
    case 'ITF14':
      return generateITF14();
    case 'QR':
      // QR can contain arbitrary text; generate a unique token by default.
      return generateBarcode();
    default:
      return generateBarcode();
  }
};

/**
 * Generate EAN-13 barcode (13 digits)
 */
const generateEAN13 = (): string => {
  let barcode = '';
  // First 12 digits random
  for (let i = 0; i < 12; i++) {
    barcode += Math.floor(Math.random() * 10).toString();
  }
  // Calculate check digit
  const checkDigit = calculateEANCheckDigit(barcode);
  return barcode + checkDigit;
};

/**
 * Generate EAN-8 barcode (8 digits)
 */
const generateEAN8 = (): string => {
  let barcode = '';
  for (let i = 0; i < 7; i++) {
    barcode += Math.floor(Math.random() * 10).toString();
  }
  const checkDigit = calculateEANCheckDigit(barcode);
  return barcode + checkDigit;
};

/**
 * Generate UPC-A barcode (12 digits)
 */
const generateUPC = (): string => {
  let barcode = '';
  for (let i = 0; i < 11; i++) {
    barcode += Math.floor(Math.random() * 10).toString();
  }
  const checkDigit = calculateUPCCheckDigit(barcode);
  return barcode + checkDigit;
};

/**
 * Generate CODE39 barcode (alphanumeric)
 */
const generateCODE39 = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-. $/+%*';
  let barcode = '';
  const length = 10 + Math.floor(Math.random() * 6);
  for (let i = 0; i < length; i++) {
    barcode += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return barcode;
};

/**
 * Generate ITF-14 barcode (14 digits)
 */
const generateITF14 = (): string => {
  let barcode = '';
  for (let i = 0; i < 14; i++) {
    barcode += Math.floor(Math.random() * 10).toString();
  }
  return barcode;
};

/**
 * Calculate EAN check digit
 */
const calculateEANCheckDigit = (barcode: string): number => {
  let sum = 0;
  for (let i = 0; i < barcode.length; i++) {
    const digit = parseInt(barcode[i], 10);
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  return (10 - (sum % 10)) % 10;
};

/**
 * Calculate UPC-A check digit
 */
const calculateUPCCheckDigit = (barcode: string): number => {
  let sum = 0;
  for (let i = 0; i < barcode.length; i++) {
    const digit = parseInt(barcode[i], 10);
    sum += i % 2 === 0 ? digit * 3 : digit;
  }
  return (10 - (sum % 10)) % 10;
};

/**
 * Validate barcode format based on type
 */
export const validateBarcode = (barcode: string, type: BarcodeType): boolean => {
  switch (type) {
    case 'EAN13':
      return /^\d{13}$/.test(barcode) && validateEAN13CheckDigit(barcode);
    case 'EAN8':
      return /^\d{8}$/.test(barcode) && validateEAN8CheckDigit(barcode);
    case 'UPC':
      return /^\d{12}$/.test(barcode) && validateUPCCheckDigit(barcode);
    case 'CODE39':
      return /^[A-Z0-9\-\.\ \$\/\+\%]+$/.test(barcode);
    case 'ITF14':
      return /^\d{14}$/.test(barcode);
    case 'QR':
      // QR supports a wide range of payloads; keep it bounded for label printing.
      return typeof barcode === "string" && barcode.trim().length >= 1 && barcode.length <= 512;
    default:
      return barcode.length >= 4 && barcode.length <= 50;
  }
};

/**
 * Validate EAN-13 check digit
 */
const validateEAN13CheckDigit = (barcode: string): boolean => {
  if (barcode.length !== 13) return false;
  const givenCheck = parseInt(barcode[12], 10);
  const calculatedCheck = calculateEANCheckDigit(barcode.slice(0, 12));
  return givenCheck === calculatedCheck;
};

/**
 * Validate EAN-8 check digit
 */
const validateEAN8CheckDigit = (barcode: string): boolean => {
  if (barcode.length !== 8) return false;
  const givenCheck = parseInt(barcode[7], 10);
  const calculatedCheck = calculateEANCheckDigit(barcode.slice(0, 7));
  return givenCheck === calculatedCheck;
};

/**
 * Validate UPC-A check digit
 */
const validateUPCCheckDigit = (barcode: string): boolean => {
  if (barcode.length !== 12) return false;
  const givenCheck = parseInt(barcode[11], 10);
  const calculatedCheck = calculateUPCCheckDigit(barcode.slice(0, 11));
  return givenCheck === calculatedCheck;
};

/**
 * Get label dimensions based on size
 */
export const getLabelDimensions = (size: LabelSize | string): { width: number; height: number } => {
  const dimensions: Record<string, { width: number; height: number }> = {
    '50x25mm': { width: 50, height: 25 },
    '50x30mm': { width: 50, height: 30 },
    '40x25mm': { width: 40, height: 25 },
    '30x20mm': { width: 30, height: 20 },
    '60x40mm': { width: 60, height: 40 },
    '70x50mm': { width: 70, height: 50 },
    '100x50mm': { width: 100, height: 50 },
    // Thermal roll widths — height is the feed length per label
    '58mm': { width: 58, height: 40 },
    '80mm': { width: 80, height: 60 },
  };
  if (dimensions[size]) return dimensions[size];
  // Parse arbitrary "WxHmm" or "WxH" strings for custom sizes
  const m = String(size).match(/^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)(?:mm)?$/i);
  if (m) return { width: parseFloat(m[1]), height: parseFloat(m[2]) };
  return { width: 50, height: 25 };
};;

/**
 * Generate ESC/POS commands for printing barcode
 */
export const generateESCPOSBarcode = (
  barcode: string,
  type: BarcodeType,
  height: number = 80
): number[] => {
  const commands: number[] = [];
  
  // Set barcode height
  commands.push(0x1D, 0x68, height);
  
  // Set barcode width (2-6)
  commands.push(0x1D, 0x77, 0x02);
  
  // Set HRI position (0 = none, 1 = above, 2 = below, 3 = both)
  commands.push(0x1D, 0x48, 0x02);
  
  // Print barcode based on type
  switch (type) {
    case 'CODE128':
      commands.push(0x1D, 0x6B, 0x00); // CODE128
      break;
    case 'EAN13':
      commands.push(0x1D, 0x6B, 0x02); // EAN-13
      break;
    case 'EAN8':
      commands.push(0x1D, 0x6B, 0x03); // EAN-8
      break;
    case 'UPC':
      commands.push(0x1D, 0x6B, 0x01); // UPC-A
      break;
    case 'CODE39':
      commands.push(0x1D, 0x6B, 0x04); // CODE39
      break;
    case 'ITF14':
      commands.push(0x1D, 0x6B, 0x05); // ITF14
      break;
    default:
      commands.push(0x1D, 0x6B, 0x00); // CODE128 default
  }
  
  // Add barcode data
  for (let i = 0; i < barcode.length; i++) {
    commands.push(barcode.charCodeAt(i));
  }
  commands.push(0x00); // NUL terminator
  
  return commands;
};

/**
 * Generate ZPL commands for printing barcode
 */
export const generateZPLBarcode = (
  barcode: string,
  type: BarcodeType,
  height: number = 50,
  showText: boolean = true
): string => {
  if (type === "QR") {
    // ZPL QR Code: ^BQN and ^FDLA,<data>
    // Use a moderate magnification so it fits common label sizes.
    return `^XA
^CI28
^FO20,20^BQN,2,6^FDLA,${barcode}^FS
^XZ`;
  }

  // Minimal, standards-friendly ZPL barcode field (no extra label text/layout).
  // Full label templates (name/price/size) are built in printer utilities where we know the label size/DPI.
  const hri = showText ? "Y" : "N";
  const barcodeField = getZPLBarcodeField(type, height, hri);

  return `^XA
^CI28
^BY2,2,${height}
^FO20,20${barcodeField}^FD${barcode}^FS
^XZ`;
};

/**
 * Get ZPL barcode field command (includes parameters).
 */
const getZPLBarcodeField = (type: BarcodeType, height: number, hri: "Y" | "N"): string => {
  switch (type) {
    case 'EAN13':
      // ^BEo,h,f,g  (orientation, height, print interpretation line, print above)
      return `^BEN,${height},${hri},N`;
    case 'EAN8':
      // ^B8o,h,f,g
      return `^B8N,${height},${hri},N`;
    case 'UPC':
      // ^BUo,h,f,g
      return `^BUN,${height},${hri},N`;
    case 'CODE39':
      // ^B3o,h,f,g,e
      return `^B3N,${height},${hri},N,N`;
    case 'ITF14':
      // Closest broadly-supported option is Interleaved 2 of 5.
      // ^B2o,h,f,g,e
      return `^B2N,${height},${hri},N,N`;
    default:
      // ^BCo,h,f,g,e
      return `^BCN,${height},${hri},N,N`;
  }
};

/**
 * Generate TSPL commands for printing barcode
 */
export const generateTSPLBarcode = (
  barcode: string,
  type: BarcodeType,
  height: number = 50,
  showText: boolean = true
): string => {
  if (type === "QR") {
    // TSPL QR Code: QRCODE x,y, ecc, cell, mode, rotation, model, mask, "data"
    return `SIZE 50,25
GAP 2
CLS
QRCODE 20,20,L,5,A,0,"${barcode}"
PRINT 1`;
  }

  const textPosition = showText ? '1' : '0';
  const barcodeType = getTSPLBarcodeType(type);
  
  return `SIZE 50,25
GAP 2
CLS
TEXT 50,30,"0",20,20,${barcode}
BARCODE 50,50,"${barcodeType}",${height},${textPosition},0,"${barcode}"
PRINT 1`;
};

/**
 * Get TSPL barcode type
 */
const getTSPLBarcodeType = (type: BarcodeType): string => {
  switch (type) {
    case 'EAN13':
      return 'EAN13';
    case 'EAN8':
      return 'EAN8';
    case 'UPC':
      return 'UPCA';
    case 'CODE39':
      return 'CODE39';
    case 'ITF14':
      return 'ITF14';
    default:
      return '128';
  }
};

/**
 * Get default barcode type for different product types
 */
export const getDefaultBarcodeType = (mode: BarcodeMode): BarcodeType => {
  switch (mode) {
    case 'standard':
      return 'CODE128'; // Most versatile
    case 'each_item':
      return 'CODE128'; // Good for individual items
    case 'loose':
      return 'EAN13'; // Often used for weighed items
  }
};

/**
 * Get barcode mode description
 */
export const getBarcodeModeDescription = (mode: BarcodeMode): string => {
  switch (mode) {
    case 'standard':
      return 'One barcode per product (normal packaged products)';
    case 'each_item':
      return 'Each unit can have its own barcode (sachets, individual items)';
    case 'loose':
      return 'Barcode represents product only, price calculated by weight (rice, beans, etc.)';
  }
};

/**
 * Format barcode for display
 */
export const formatBarcode = (barcode: string, type: BarcodeType): string => {
  switch (type) {
    case 'EAN13':
    case 'UPC':
      return barcode.replace(/(\d{6})(\d{6})(\d)/, '$1 $2 $3');
    case 'EAN8':
      return barcode.replace(/(\d{4})(\d{3})(\d)/, '$1 $2 $3');
    case 'ITF14':
      return barcode.replace(/(\d{5})(\d{5})(\d{4})/, '$1 $2 $3');
    default:
      return barcode;
  }
};

/**
 * Check if barcode is duplicate within store
 */
export const isBarcodeDuplicate = async (
  barcode: string,
  storeId: string,
  excludeProductId?: string
): Promise<boolean> => {
  const { supabase } = await import('@/integrations/supabase/client');
  
  let query = supabase
    .from('inventory')
    .select('id')
    .eq('store_id', storeId)
    .eq('barcode', barcode);
  
  if (excludeProductId) {
    query = query.neq('id', excludeProductId);
  }
  
  const { data, error } = await query;
  
  if (error) {
    console.error('Error checking barcode duplicate:', error);
    return false;
  }
  
  return (data?.length ?? 0) > 0;
};
