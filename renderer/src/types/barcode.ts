export interface PrinterConfig {
  id: string;
  name: string;
  type: 'usb' | 'thermal' | 'network' | 'bluetooth';
  protocol: 'esc_pos' | 'zpl' | 'tspl' | 'raw';
  label_size: string;
  is_default: boolean;
  store_id: string;
  paper_width?: number;
  paper_height?: number;
}

// Barcode Types for Enhanced Functionality
export type BarcodeMode = 'standard' | 'each_item' | 'loose';
export type BarcodeType = 'CODE128' | 'EAN13' | 'EAN8' | 'UPC' | 'CODE39' | 'ITF14' | 'MSI' | 'QR';
export type LabelSize = '50x25mm' | '50x30mm' | '40x25mm' | '30x20mm' | '60x40mm' | '70x50mm' | '100x50mm';
export type PrinterProtocol = 'ESC/POS' | 'ZPL' | 'TSPL' | 'RAW';

export interface BarcodePrintJob {
  id: string;
  user_id: string;
  store_id?: string;
  inventory_id?: string;
  barcode: string;
  barcode_type: BarcodeType;
  product_name: string;
  quantity: number;
  label_size: LabelSize;
  include_price: boolean;
  include_product_name: boolean;
  status: 'pending' | 'printing' | 'completed' | 'failed';
  created_at: string;
}

export interface PrinterSettings {
  id?: string;
  name: string;
  type: 'usb' | 'network' | 'bluetooth';
  protocol: PrinterProtocol;
  is_default: boolean;
  paper_width?: number;
  paper_height?: number;
}

export interface BarcodeProductInfo {
  id: string;
  productName: string;
  product_name: string;
  barcode: string;
  barcode_type: BarcodeType;
  barcode_mode: BarcodeMode;
  retail_price: number;
  quantity: number;
  category: string;
  unit_name: string;
  label_size: LabelSize;
}

export interface BarcodePrintOptions {
  printer?: string;
  labelSize: LabelSize;
  quantity: number;
  includePrice: boolean;
  includeProductName: boolean;
  includeSKU?: boolean;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: 'admin' | 'manager' | 'user';
  created_at: string;
}

// Print Settings Types
export interface PrintField {
  id: string;
  name: string;
  label: string;
  enabled: boolean;
  fontSize?: number;
  order: number;
}

export interface PageLayout {
  id: string;
  name: string;
  width: number;
  height: number;
  unit: 'mm' | 'inch';
  columns: number;
  rows: number;
  orientation: 'portrait' | 'landscape';
  fields: PrintField[];
  enabled: boolean;
  order: number;
}

export interface DataSource {
  id: string;
  name: string;
  type: 'excel' | 'csv' | 'database' | 'local';
  connection?: {
    host?: string;
    port?: number;
    database?: string;
    username?: string;
    table?: string;
  };
  filePath?: string;
  fieldMappings: Record<string, string>;
  lastUsed?: string;
}

export interface BarcodePrintConfig {
  dataSources: DataSource[];
  layouts: PageLayout[];
  defaultLayoutId?: string;
  printOrder: string[]; // Array of layout IDs in print order
}
