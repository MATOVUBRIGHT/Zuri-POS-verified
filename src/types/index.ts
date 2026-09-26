export * from './barcode';

export interface StockTransfer {
  id: string;
  from_store_id: string;
  to_store_id: string;
  from_user_id: string;
  to_user_id: string;
  product_name: string;
  quantity: number;
  cost_per_unit: number;
  status: 'pending' | 'completed' | 'cancelled';
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  store_id: string;
}

export interface Product {
  id: string;
  productName: string;
  quantity: number;
  sellingPrice: number;
  sellType: 'item' | 'sachet';
  itemsPerSachet?: number;
  price?: number;
  cost_per_unit?: number;
  items_per_sachet?: number;
}

export interface StockItem {
  id: string;
  productName: string;
  category: string;
  quantity: number;
  costPerUnit: number;
  totalValue: number;
  dateOfPurchase?: string;
  sachets_count: number;
  loose_items: number;
  opened_sachets: number;
  items_per_sachet: number;
  retail_price: number;
  wholesale_price: number;
  product_name: string;
  store_id: string;
  size?: string;
  min_stock_level: number;
  reorder_quantity: number;
  supplier?: string;
  supplier_id?: string;
  supplier_name?: string;
  barcode?: string;
  barcode_type?: string;
  barcode_mode?: 'standard' | 'each_item' | 'loose';
  productImage?: string;
  sachetsCount?: number;
  looseItems?: number;
  dateOfEntry?: string;
  wholesalePrice?: number;
  retailPrice?: number;
  openedSachets?: number;
  showImageModal?: boolean;
  cost_per_unit?: number;
  notes?: string;
  packaging_type?: string;
  unit_name?: string;
}

export interface Loan {
  id: string;
  user_id: string;
  product_name: string;
  total_amount: number;
  amount_paid: number;
  balance: number;
  status: 'unpaid' | 'partial' | 'paid';
  created_at: string;
  quantity: number;
  cost_per_unit: number;
  supplier?: string;
  date_of_purchase: string;
}

export interface SaleItem {
  id: string;
  receiptNumber?: string | null;
  customerName: string;
  dateOfSale: string;
  totalAmount: number;
  paidInCash: boolean;
  products: Product[];
  created_at?: string;
  staff_id?: string | null;
  paymentMethodId?: string | null;
  paymentDetails?: {
    mobileMoneyNumber?: string | null;
    bankName?: string | null;
    accountNumber?: string | null;
    accountName?: string | null;
    tillNumber?: string | null;
    paybillNumber?: string | null;
    transactionReference?: string | null;
    payerName?: string | null;
    notes?: string | null;
    amountReceived?: number | null;
    paymentMethod?: string | null;
    paymentAccountId?: string | null;
    paymentProviderType?: string | null;
    splitPayments?: Array<{ accountId: string; amount: number; providerType?: string }> | null;
  } | null;
}

export interface ExpenseItem {
  id: string;
  description: string;
  amount: number;
  category: string;
  date: string;
  paymentMethod: string;
  notes?: string;
  createdAt?: string;
}

export interface ProductVariant {
  id: string;
  inventory_id: string;
  variant_name: string;
  quantity: number;
}

export interface Customer {
  id: string;
  full_name: string;
  email?: string;
  phone?: string;
  address?: string;
  loyalty_points: number;
  total_spent: number;
  notes?: string;
  created_at: string;
  unpaid_balance: number;
  credit_limit: number;
}

export interface Shift {
  id: string;
  start_time: string;
  end_time?: string;
  starting_cash: number;
  ending_cash_actual?: number;
  ending_cash_expected?: number;
  status: 'open' | 'closed';
  store_id: string;
  staff_id?: string;
  user_id: string;
}

export interface LoanPayment {
  id: string;
  loan_id: string;
  user_id: string;
  amount_paid: number;
  payment_date: string;
}

export interface Staff {
  id: string;
  full_name: string;
  role: string;
  pin_code?: string;
  status: 'active' | 'inactive';
  store_id: string;
  employee_id?: string;
  hourly_rate?: number;
  total_sales?: number;
  sales_count?: number;
  created_at?: string;
  allowed_pages?: string[];
}

export interface Store {
  id: string;
  store_name: string;
  user_id: string;
  created_at?: string;
  address?: string;
  phone?: string;
  last_closing_balance?: number;
  tin_number?: string;
  email?: string;
}

export interface AuditLog {
  id: string;
  action: string;
  table_name: string;
  record_id: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  user_id: string;
  created_at: string;
  staff_id?: string;
  staff_name?: string;
  profiles?: {
    full_name: string | null;
  } | null;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  data: Record<string, unknown> | null;
  read: boolean;
  created_at: string;
  user_id: string;
  sender_email?: string;
  sender_name?: string;
  sender?: {
    email?: string;
    full_name?: string;
  };
}

export interface TaxConfig {
  id: string;
  name: string;
  rate: number;
  is_active?: boolean;
}

export interface PaymentMethodDetails {
  bankName?: string;
  accountName?: string;
  accountNumber?: string;
  mobileMoneyNumber?: string;
  tillNumber?: string;
  paybillNumber?: string;
  notes?: string;
}

export interface PaymentMethod {
  id: string;
  name: string;
  is_active?: boolean;
  details?: PaymentMethodDetails | null;
}

export interface CashTransaction {
  id?: string;
  user_id?: string;
  store_id?: string;
  amount: number;
  type: 'deposit' | 'withdrawal' | 'in' | 'out';
  description: string;
  account_type: string;
  created_at?: string;
}

export interface PairedStore {
  id: string;
  store_name: string;
  owner_id: string;
}

export interface ChatMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  store_id: string;
  message: string;
  read: boolean | null;
  created_at: string | null;
}

export interface Drink {
  name: string;
  category: string;
  barcode?: string;
  image?: string;
  _local?: {
    retail_price?: number;
    wholesale_price?: number;
    cost_per_unit?: number;
    supplier?: string;
    unit_name?: string;
    packaging_type?: string;
    items_per_sachet?: number;
    min_stock_level?: number;
    reorder_quantity?: number;
    size?: string;
    notes?: string;
  };
}

export interface BatchItem {
  id: string;
  productName: string;
  category: string;
  quantity: number;
  costPerUnit: number;
  retailPrice: number;
  wholesalePrice: number;
  looseItemPrice: number;
  supplier: string;
  supplier_id?: string | null;
  dateOfEntry: string;
  date_of_purchase?: string;
  productImage: string;
  product_image?: string;
  onCredit: boolean;
  totalCost: number;
  itemsPerUnit: number;
  sachetsCount: number;
  looseItems: number;
  barcode: string;
  barcode_type?: string;
  barcode_mode?: string;
  size: string;
  notes?: string;
  packagingType?: string;
  packaging_type?: string;
  unitName?: string;
  unit_name?: string;
  credit_paid_now: number;
  credit_due_date?: string;
  credit_reference?: string;
  credit_details?: string;
  min_stock_level?: number;
  reorder_quantity?: number;
}

export interface BatchTransactionItem {
  id: string;
  productName: string;
  quantity: number;
  price: number;
  category?: string;
}

export interface UserProfile {
  id: string;
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  role?: string;
  created_at?: string;
  updated_at?: string;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  duration_days: number;
  bonus_days: number;
  is_trial: boolean;
  features: string[];
  is_active: boolean;
  created_at: string;
}

export interface UserSubscription {
  id: string;
  user_id: string;
  plan_id: string;
  status: 'active' | 'cancelled' | 'expired';
  starts_at: string;
  expires_at: string;
  payment_reference?: string;
  amount_paid: number;
  created_at: string;
  updated_at: string;
}

export interface PrinterConfig {
  id: string;
  name: string;
  type: 'usb' | 'thermal' | 'network';
  protocol: 'esc_pos' | 'zpl' | 'tspl';
  label_size: string;
  is_default: boolean;
  store_id: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: 'admin' | 'manager' | 'user';
  created_at: string;
}
