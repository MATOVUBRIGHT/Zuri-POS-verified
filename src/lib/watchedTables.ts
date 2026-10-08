// Real database tables subscribed to via Supabase Realtime `postgres_changes`.
// Realtime only fires for tables published in the supabase_realtime
// publication, so every entry here needs a matching publication migration.
//
// This must contain table names only. Query keys backed by an RPC (for example
// "payment_account_balances") belong in the query hooks, not here, or the
// polling fallback below would invoke that RPC on every tick.
export const WATCHED_TABLES = [
  "inventory",
  "sales",
  "expenses",
  "cash_transactions",
  "customers",
  "suppliers",
  "staff",
  "shifts",
  "branch_payment_accounts",
  "payment_account_ledger",
] as const;

// High-churn tables worth re-reading on a timer when Realtime is unavailable.
// Deliberately a small subset: this runs per logged-in user, so polling a long
// list burns free-tier request quota continuously. Low-churn tables (accounts,
// suppliers, staff, shifts) rely on Realtime plus window-focus refetch instead.
export const POLLED_TABLES = [
  "sales",
  "cash_transactions",
  "inventory",
] as const;