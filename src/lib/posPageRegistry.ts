/**
 * The single source of truth for operational POS pages.  Add a branch-safe
 * page here when it is introduced and it will automatically become available
 * in Team & Access as a permission choice.
 */
export type PosPageDefinition = {
  id: string;
  label: string;
  roles: string[];
  /** Whether an executive may grant this operational page to a branch user. */
  branchAssignable: boolean;
};

export const POS_PAGE_REGISTRY: readonly PosPageDefinition[] = [
  { id: "dashboard", label: "Dashboard", roles: ["owner", "admin", "manager"], branchAssignable: true },
  { id: "products", label: "Products", roles: ["owner", "admin", "manager"], branchAssignable: true },
  { id: "suppliers", label: "Suppliers", roles: ["owner", "admin", "manager"], branchAssignable: true },
  { id: "supplier-reports", label: "Supplier reports", roles: ["owner", "admin", "manager", "accountant"], branchAssignable: true },
  { id: "stock-entry", label: "Stock entry", roles: ["owner", "admin", "manager"], branchAssignable: true },
  { id: "sales-entry", label: "Sales entry", roles: ["owner", "admin", "manager", "cashier"], branchAssignable: true },
  { id: "inventory", label: "Inventory", roles: ["owner", "admin", "manager"], branchAssignable: true },
  { id: "barcode-manager", label: "Barcode manager", roles: ["owner", "admin", "manager"], branchAssignable: true },
  { id: "customers", label: "Customers", roles: ["owner", "admin", "manager"], branchAssignable: true },
  { id: "expenses", label: "Expenses", roles: ["owner", "admin", "manager"], branchAssignable: true },
  { id: "accounts", label: "Accounts", roles: ["owner", "admin", "manager"], branchAssignable: true },
  { id: "banking", label: "Banking", roles: ["owner", "admin", "manager"], branchAssignable: true },
  { id: "scheduled-payments", label: "Scheduled payments", roles: ["owner", "admin", "manager", "accountant"], branchAssignable: true },
  { id: "tracker", label: "Tracker", roles: ["owner", "admin", "manager", "accountant"], branchAssignable: true },
  { id: "returns", label: "Returns & damaged", roles: ["owner", "admin", "manager"], branchAssignable: true },
  { id: "shifts", label: "Shifts", roles: ["owner", "admin", "manager", "cashier"], branchAssignable: true },
  { id: "reports", label: "Reports", roles: ["owner", "admin", "manager", "boss", "accountant"], branchAssignable: true },
  // Global/business-management pages deliberately remain unavailable to staff.
  { id: "stores", label: "Stores", roles: ["owner", "admin"], branchAssignable: false },
  { id: "security", label: "Security", roles: ["owner", "admin"], branchAssignable: false },
  { id: "settings", label: "Settings", roles: ["owner", "admin"], branchAssignable: false },
  { id: "admin", label: "Admin panel", roles: ["admin"], branchAssignable: false },
] as const;

export const BRANCH_ASSIGNABLE_POS_PAGES = POS_PAGE_REGISTRY.filter((page) => page.branchAssignable);
export const isBranchAssignablePosPage = (pageId: string) =>
  BRANCH_ASSIGNABLE_POS_PAGES.some((page) => page.id === pageId);
