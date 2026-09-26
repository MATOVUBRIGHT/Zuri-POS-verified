# Changes dropped by consolidating into src/

Files present in BOTH trees where the renderer copy will be DISCARDED.
Generated 2026-09-26 14:24.

Totals: 89 files differ, 7615 renderer-only lines, 1002 matching significance keywords.

| File | src | renderer | renderer-only | significant |
|---|---|---|---|---|
| `components\Shifts.tsx` | 535 | 869 | 659 | 127 |
| `lib\data-sync.ts` | 654 | 361 | 249 | 93 |
| `components\AdminDashboard.tsx` | 430 | 809 | 661 | 81 |
| `components\StoreChat.tsx` | 724 | 458 | 324 | 70 |
| `providers\ShiftProvider.tsx` | 219 | 314 | 155 | 65 |
| `pages\Index.tsx` | 1229 | 960 | 272 | 54 |
| `components\Customers.tsx` | 362 | 472 | 341 | 44 |
| `pages\Auth.tsx` | 568 | 631 | 122 | 43 |
| `hooks\useOptimizedData.ts` | 854 | 552 | 136 | 39 |
| `components\Expenses.tsx` | 454 | 465 | 325 | 31 |
| `components\Products.tsx` | 536 | 905 | 711 | 30 |
| `components\Layout.tsx` | 967 | 769 | 102 | 29 |
| `components\BarcodeManager.tsx` | 1755 | 1715 | 75 | 25 |
| `components\Reports.tsx` | 1002 | 1448 | 815 | 19 |
| `App.tsx` | 295 | 180 | 63 | 18 |
| `integrations\supabase\client.ts` | 28 | 36 | 29 | 18 |
| `components\SalesEntry.tsx` | 2684 | 2667 | 241 | 16 |
| `lib\transaction-optimizer.ts` | 288 | 249 | 71 | 16 |
| `components\Stores.tsx` | 805 | 607 | 168 | 14 |
| `components\Settings.tsx` | 1700 | 1366 | 45 | 14 |
| `components\ExcelImport.tsx` | 389 | 364 | 124 | 12 |
| `components\StaffManagement.tsx` | 652 | 609 | 30 | 12 |
| `components\InventoryManagement.tsx` | 455 | 322 | 101 | 11 |
| `components\NavigationOptimizer.tsx` | 147 | 172 | 30 | 11 |
| `components\StockEntry.tsx` | 630 | 302 | 65 | 10 |
| `components\CashManagement.tsx` | 508 | 447 | 37 | 10 |
| `components\BarcodePrintDialog.tsx` | 727 | 919 | 225 | 9 |
| `components\Suppliers.tsx` | 731 | 685 | 85 | 7 |
| `lib\sounds.ts` | 74 | 36 | 26 | 7 |
| `main.tsx` | 22 | 22 | 17 | 7 |
| `components\BarcodePrintSettingsDialog.tsx` | 722 | 719 | 13 | 7 |
| `components\LabelPreview.tsx` | 479 | 444 | 370 | 6 |
| `lib\printerUtils.ts` | 901 | 691 | 110 | 6 |
| `providers\SubscriptionProvider.tsx` | 176 | 169 | 46 | 6 |
| `components\NotificationCenter.tsx` | 481 | 418 | 39 | 5 |
| `components\inventory\EditProductDialog.tsx` | 610 | 637 | 89 | 4 |
| `lib\printerSounds.ts` | 127 | 81 | 52 | 4 |
| `components\UserProfile.tsx` | 202 | 194 | 8 | 4 |
| `components\SachetManagement.tsx` | 486 | 475 | 13 | 3 |
| `components\stock\ProductSearchInput.tsx` | 271 | 224 | 11 | 2 |
| `components\SalesReturns.tsx` | 456 | 454 | 10 | 2 |
| `components\sales\SalesHistoryTab.tsx` | 272 | 271 | 4 | 2 |
| `components\DailyCashReconciliation.tsx` | 585 | 585 | 38 | 1 |
| `components\DebtManagement.tsx` | 437 | 432 | 15 | 1 |
| `components\BarcodeScanner.tsx` | 122 | 128 | 13 | 1 |
| `components\sales\PaymentSummary.tsx` | 424 | 373 | 9 | 1 |
| `components\MembershipPlans.tsx` | 242 | 212 | 3 | 1 |
| `pages\AdminVerification.tsx` | 600 | 600 | 2 | 1 |
| `lib\performance.ts` | 106 | 106 | 1 | 1 |
| `hooks\use-debounce.ts` | 51 | 51 | 1 | 1 |
| `hooks\use-toast.ts` | 172 | 161 | 1 | 1 |
| `components\PrintPreviewEditor.tsx` | 251 | 171 | 136 | 0 |
| `components\Dashboard.tsx` | 940 | 718 | 111 | 0 |
| `components\inventory\InventoryStats.tsx` | 333 | 248 | 41 | 0 |
| `components\stock\StockForm.tsx` | 379 | 338 | 28 | 0 |
| `integrations\supabase\types.ts` | 1570 | 1490 | 25 | 0 |
| `hooks\useRealtimeSync.ts` | 138 | 85 | 13 | 0 |
| `components\inventory\InventoryTable.tsx` | 174 | 117 | 13 | 0 |
| `components\stock\BatchTable.tsx` | 140 | 139 | 12 | 0 |
| `hooks\useInventoryOptimized.ts` | 106 | 106 | 8 | 0 |
| `components\MultiLabelPrintDialog.tsx` | 813 | 812 | 8 | 0 |
| `pages\Plans.tsx` | 326 | 316 | 7 | 0 |
| `components\NonCashReconciliation.tsx` | 365 | 364 | 7 | 0 |
| `components\DailyProfitModal.tsx` | 334 | 333 | 7 | 0 |
| `components\sales\CartList.tsx` | 125 | 125 | 5 | 0 |
| `components\stock\EfrisTaxPreview.tsx` | 66 | 65 | 5 | 0 |
| `services\posCalculator.ts` | 70 | 69 | 4 | 0 |
| `components\sales\ProductSearch.tsx` | 153 | 152 | 4 | 0 |
| `components\dashboard\DashboardKPICards.tsx` | 105 | 104 | 4 | 0 |
| `lib\barcode.ts` | 398 | 383 | 4 | 0 |
| `providers\PrinterProvider.tsx` | 559 | 534 | 3 | 0 |
| `components\BatchTransactionPanel.tsx` | 118 | 117 | 3 | 0 |
| `components\reports\ReportSummaryCards.tsx` | 85 | 84 | 3 | 0 |
| `components\TransactionManager.tsx` | 197 | 196 | 2 | 0 |
| `components\stock\SupplierSelector.tsx` | 94 | 94 | 2 | 0 |
| `components\ui\toaster.tsx` | 31 | 31 | 2 | 0 |
| `components\reports\ReportShareSection.tsx` | 168 | 167 | 1 | 0 |
| `components\ui\toast.tsx` | 117 | 117 | 1 | 0 |
| `components\inventory\InventoryFilters.tsx` | 147 | 147 | 1 | 0 |
| `components\stock\BarcodeSection.tsx` | 135 | 135 | 1 | 0 |
| `components\BarcodeBatchPrint.tsx` | 778 | 777 | 1 | 0 |
| `components\reports\SalesTransactionsList.tsx` | 66 | 65 | 1 | 0 |
| `types\index.ts` | 365 | 352 | 0 | 0 |
| `components\TrialCountdown.tsx` | 96 | 93 | 0 | 0 |
| `index.css` | 383 | 375 | 0 | 0 |
| `components\ui\loading-spinner.tsx` | 84 | 43 | 0 | 0 |
| `lib\supabaseSchemaFallback.ts` | 103 | 77 | 0 | 0 |
| `test\setup.ts` | 8 | 7 | 0 | 0 |
| `store\usePosStore.ts` | 212 | 192 | 0 | 0 |

## Highest-risk files (most significant renderer-only lines first)

### `components\Shifts.tsx`  (127 significant / 659 total)

- `import { Clock, Play, Square, History, DollarSign, Wallet, Lock, CheckCircle, XCircle, AlertCircle, LogOut, LogIn } from "lucide-react";`
- `const { data: { user } } = await supabase.auth.getUser();`
- `const { data: stores } = await supabase.from('stores').select('id').eq('user_id', user.id).limit(1);`
- `const { data: accessData } = await supabase.from('store_access').select('store_id').eq('user_id', user.id).limit(1);`

### `lib\data-sync.ts`  (93 significant / 249 total)

- `// Data synchronization service for offline-first capabilities`
- `private dbName = "brepos-offline-db";`
- `private syncQueue: Array<{ operation: string; table: TableName; data: unknown }> = [];`
- `private isSyncing = false;`

### `components\AdminDashboard.tsx`  (81 significant / 661 total)

- `// Delete confirmation`
- `const { data: profiles, error: profilesError } = await supabase`
- `if (profilesError) throw profilesError;`
- `const { data: subs, error: subsError } = await supabase`

### `components\StoreChat.tsx`  (70 significant / 324 total)

- `const [deletedMessages, setDeletedMessages] = useState<string[]>([]);`
- `// Load deleted messages from localStorage for "Delete for me" feature`
- `const deleted = localStorage.getItem("brec_deleted_messages");`
- `if (deleted) setDeletedMessages(JSON.parse(deleted));`

### `providers\ShiftProvider.tsx`  (65 significant / 155 total)

- `import { offlineServices } from '@/lib/offlineServices';`
- `const [user, setUser] = useState<import('@supabase/supabase-js').User | null>(null);`
- `// Offline-first: when in Electron, try local SQLite auth first`
- `if (typeof window !== 'undefined' && (window as any).api?.authGetSession) {`

### `pages\Index.tsx`  (54 significant / 272 total)

- `import { dataSyncService } from "@/lib/data-sync";`
- `const [isLoading, setIsLoading] = useState(false); // full screen blocking spinner`
- `// Check localStorage for onboarding completion to persist across refresh`
- `return localStorage.getItem('brec_onboarding_complete') !== 'true';`

### `components\Customers.tsx`  (44 significant / 341 total)

- `import { Search, Users, UserPlus, Phone, Mail, MapPin, History, Edit2, Trash2 } from "lucide-react";`
- `const params = new URLSearchParams(hash.slice(qIndex + 1));`
- `} catch {`
- `const { data: stores } = await supabase.from('stores').select('id').eq('user_id', user.id).limit(1);`

### `pages\Auth.tsx`  (43 significant / 122 total)

- `import { setRememberMePreference } from "@/lib/authStorage";`
- `import { offlineServices } from "@/lib/offlineServices";`
- `const isElectron = typeof window !== 'undefined' && (window as any).api?.authLogin;`
- `/** After sign-up with an immediate session, show securing step before entering the app */`

### `hooks\useOptimizedData.ts`  (39 significant / 136 total)

- `async function fetchWithSWRCache<T>(table: string, fetcher: () => Promise<T>, storeId?: string | null) {`
- `// Offline-first: when in Electron, always read from local SQLite first`
- `let localData = await dataSyncService.getLocalData(table);`
- `} catch (_) {}`

### `components\Expenses.tsx`  (31 significant / 325 total)

- `const Expenses = ({ expensesData, onAddExpense, onDeleteExpense }: ExpensesProps) => {`
- `toast({ title: "Error", description: "Receipt image must be under 5MB", variant: "destructive" });`
- `const uploadReceipt = async (userId: string, storeId: string): Promise<string | null> => {`
- `const { error } = await supabase.storage.from('receipts').upload(path, receiptFile);`

### `components\Products.tsx`  (30 significant / 711 total)

- `import { Search, Package, Edit2, Box, Boxes, RotateCw, DollarSign, Plus, Trash2, Eye, ChevronRight, Barcode } from "lucide-react";`
- `import { LoadingSpinner } from "@/components/ui/loading-spinner";`
- `const getUser = async () => {`
- `const fetchAppliedTaxRate = async () => {`

### `components\Layout.tsx`  (29 significant / 102 total)

- `import { dataSyncService } from "@/lib/data-sync";`
- `const Layout = ({ children, currentPage, onPageChange, stockData, currentStoreId, onRefresh, onOpenCashManagement, userRole = "owner", allowedPages, dataLoading`
- `await dataSyncService.syncAllData(currentStoreId, user.id);`
- `toast({ title: "Sync Complete", description: "All data has been synced successfully." });`

### `components\BarcodeManager.tsx`  (25 significant / 75 total)

- `import { LoadingSpinner } from "@/components/ui/loading-spinner";`
- `if (!validateBarcode(editForm.barcode, editForm.barcode_type)) {`
- `// 1. Update Supabase`
- `const { error } = await updateByIdWithSchemaFallback("inventory", editingProduct.id, updateCols);`

### `components\Reports.tsx`  (19 significant / 815 total)

- `import { FileText, Download, Filter, DollarSign, Package, AlertCircle, BarChart3, TrendingUp, Share2, Calculator, User } from "lucide-react";`
- `const handleAutoShare = async (enabled: boolean) => {`
- `const { data: { user } } = await supabase.auth.getUser();`
- `const { data: accessList } = await supabase`

### `App.tsx`  (18 significant / 63 total)

- `import { MissingSupabaseConfig } from "@/components/MissingSupabaseConfig";`
- `import { isSupabaseConfigured } from "@/integrations/supabase/client";`
- `import { startBackgroundSync } from "@/lib/backgroundSync";`
- `retry: 1,`

### `integrations\supabase\client.ts`  (18 significant / 29 total)

- `import { dualAuthStorage } from '@/lib/authStorage';`
- `const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.trim();`
- `/** Anon JWT first (widest @supabase/supabase-js support); then publishable key (sb_publishable_â€¦). Both are client-safe with RLS. */`
- `const SUPABASE_KEY =`

### `components\SalesEntry.tsx`  (16 significant / 241 total)

- `import { insertRowsWithSchemaFallback } from "@/lib/supabaseSchemaFallback";`
- `const { data: stores } = await supabase`
- `const { data: stores } = await supabase`
- `const { data: stores } = await supabase.from("stores").select("id").eq("user_id", user.id).limit(1);`

### `lib\transaction-optimizer.ts`  (16 significant / 71 total)

- `import { dataSyncService, TableName } from "@/lib/data-sync";`
- `private async processQueue() {`
- `await transaction();`
- `await this.processQueue();`

### `components\Stores.tsx`  (14 significant / 168 total)

- `const fetchStores = useCallback(async () => {`
- `const fetchLinkedStores = useCallback(async () => {`
- `title: "Error",`
- `title: "Error creating store",`

### `components\Settings.tsx`  (14 significant / 45 total)

- `// Prefer DB persistence when the column exists; fall back to localStorage when it doesn't.`
- `const { error: methodError } = await supabase`
- `if (methodError) {`
- `const msg = (methodError as any)?.message?.toString?.()?.toLowerCase?.() || '';`

### `components\ExcelImport.tsx`  (12 significant / 124 total)

- `const [step, setStep] = useState<"upload" | "mapping" | "preview" | "result">("upload");`
- `toast({ title: "Error reading file", description: "Could not parse the Excel file.", variant: "destructive" });`
- `const excelCol = mappings[field.key];`
- `.filter((f) => f.required && !mappings[f.key] && !f.defaultValue)`

### `components\StaffManagement.tsx`  (12 significant / 30 total)

- `DollarSign`
- `const { data: stores } = await supabase.from("stores").select("id").eq("user_id", userId).limit(1);`
- `const hashPin = async (pin: string): Promise<string | null> => {`
- `// Server-side bcrypt via pgcrypto. Uses `public.hash_pin` to generate a hash.`

### `components\InventoryManagement.tsx`  (11 significant / 101 total)

- `import { supabase } from "@/integrations/supabase/client";`
- `import { Loader2, ArrowLeft, LayoutDashboard, Plus, Package, Edit, ShoppingBag } from "lucide-react";`
- `// Load from localStorage or defaults`
- `const [lowStockThreshold] = useState(() => Number(localStorage.getItem('lowStockThreshold') || 100));`

### `components\NavigationOptimizer.tsx`  (11 significant / 30 total)

- `import { dataSyncService } from "@/lib/data-sync";`
- `queryFn: async () => {`
- `const localData = await dataSyncService.getLocalData("inventory");`
- `queryFn: async () => {`

### `components\StockEntry.tsx`  (10 significant / 65 total)

- `const addToBatch = useCallback(async (item: Omit<BatchItem, "id">) => {`
- `const isDuplicateInDb = await isBarcodeDuplicate(item.barcode, activeShift.store_id);`
- `const handleSubmitBatch = async () => {`
- `throw new Error("Duplicate barcodes found within the batch. Please remove duplicates.");`

### `components\CashManagement.tsx`  (10 significant / 37 total)

- `import { DollarSign, Plus, Minus, Send, History, ArrowUpCircle, ArrowDownCircle, TrendingUp, TrendingDown, Edit2, Check, X } from "lucide-react";`
- `const savedOpening = localStorage.getItem(`opening_balance_${today}`);`
- `const savedClosing = localStorage.getItem(`closing_balance_${today}`);`
- `localStorage.setItem(`opening_balance_${today}`, manualOpening);`

### `components\BarcodePrintDialog.tsx`  (9 significant / 225 total)

- `// STEP 1: Validate data`
- `throw new Error('No product or barcode to print');`
- `throw new Error('Preview element not found');`
- `throw new Error('Could not open print window');`

### `components\Suppliers.tsx`  (7 significant / 85 total)

- `import { LoadingSpinner } from "@/components/ui/loading-spinner";`
- `import { Plus, Search, Pencil, Trash2, Truck, Phone, Mail, MapPin, Building2, DollarSign, Package } from "lucide-react";`
- `// import { LoadingSpinner } from "@/components/ui/loading-spinner";`
- `const { data: stores } = await supabase.from("stores").select("id").eq("user_id", userId).limit(1);`

### `lib\sounds.ts`  (7 significant / 26 total)

- `// Sound utility for success/error feedback using Web Audio API`
- `// Resume context if suspended (autoplay policy)`
- `setTimeout(() => playTone(659.25, 0.2, 'sine', 0.12), 120); // E5`
- `setTimeout(() => playTone(783.99, 0.3, 'sine', 0.1), 240); // G5`

### `main.tsx`  (7 significant / 17 total)

- `import { ErrorBoundary } from '@/components/ErrorBoundary';`
- `// Global error handlers for renderer process (Electron)`
- `window.addEventListener('error', (event) => {`
- `console.error("Renderer runtime error:", event.error || event.message);`

