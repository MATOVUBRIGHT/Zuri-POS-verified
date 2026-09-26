import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Trash2, Lock, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";

/** Each entry maps to a page in the POS and to a scope in clear_branch_data(). */
type ScopeKey =
  | "all" | "sales" | "inventory" | "expenses"
  | "customers" | "suppliers" | "tracker" | "shifts" | "banking";

const SCOPES: {
  key: ScopeKey; label: string; page: string; detail: string; destructiveOnly?: boolean;
}[] = [
  { key: "all", label: "Everything", page: "All pages", detail: "Sales, stock, expenses, customers, suppliers, shifts, tracker and deposits. Accounts and staff are kept." },
  { key: "sales", label: "Sales", page: "Sales & Reports", detail: "Sales, returns, cash movements and customer transaction history." },
  { key: "inventory", label: "Stock", page: "Inventory & Products", detail: "Products, stock transfers and stock loans." },
  { key: "expenses", label: "Expenses", page: "Expenses", detail: "Every expense record for this branch." },
  { key: "customers", label: "Customers", page: "Customers", detail: "Customer records and their balance history." },
  { key: "suppliers", label: "Suppliers", page: "Suppliers", detail: "Supplier records and amounts owed." },
  { key: "tracker", label: "Documents", page: "Tracker", detail: "Receipts, invoices and account statements." },
  { key: "shifts", label: "Shifts", page: "Shifts", detail: "Shift records for this branch." },
  { key: "banking", label: "Deposits", page: "Cash & Banking", detail: "Bank deposit history. Ledger accounts are kept." },
];

const CONFIRM_WORD = "DELETE";

/**
 * Kills the offline mirror so a wipe cannot be undone by the sync queue
 * re-pushing local rows on the next flush.
 */
const purgeLocalMirror = async () => {
  try {
    localStorage.removeItem("zuripos_sync_queue_v1");
    localStorage.removeItem("zuripos_core_store_v1");
    localStorage.removeItem("zuripos-query-cache");
    localStorage.removeItem("zuripos-app-state");
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith("zuripos_local_table_v1:")) localStorage.removeItem(k);
    }
  } catch { /* storage unavailable */ }

  try {
    if (typeof indexedDB !== "undefined" && indexedDB.deleteDatabase) {
      await new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase("zuripos-offline");
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
      });
    }
  } catch { /* ignore */ }

  try {
    if (typeof caches !== "undefined") {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
    }
  } catch { /* ignore */ }
};

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  currentStoreId: string | null;
  onCleared: () => void | Promise<void>;
};

const ClearDataDialog = ({ open, onOpenChange, currentStoreId, onCleared }: Props) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selected, setSelected] = useState<Set<ScopeKey>>(new Set<ScopeKey>(["all"]));
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<{ deleted: Record<string, number>; skipped: string[] } | null>(null);

  // Never carry a half-entered password or a stale report into the next open.
  useEffect(() => {
    if (!open) {
      setPassword(""); setConfirmText(""); setError(null);
      setReport(null); setBusy(false); setShowPw(false);
      setSelected(new Set<ScopeKey>(["all"]));
    }
  }, [open]);

  const chosen = useMemo(() => SCOPES.filter((s) => selected.has(s.key)), [selected]);

  const toggle = (key: ScopeKey) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (key === "all") return next.has("all") ? new Set() : new Set<ScopeKey>(["all"]);
      next.delete("all");
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const confirmOk = confirmText.trim().toUpperCase() === CONFIRM_WORD;
  const ready = selected.size > 0 && password.length > 0 && confirmOk && !busy && !!currentStoreId;

  const run = async () => {
    if (!currentStoreId || !ready) return;
    setBusy(true);
    setError(null);

    // "all" is sent as its own scope; a multi-selection is deleted one scope at
    // a time so a failure part-way through still reports exactly what went.
    const scopes: ScopeKey[] = selected.has("all")
      ? ["all"]
      : SCOPES.filter((s) => selected.has(s.key)).map((s) => s.key);

    const deleted: Record<string, number> = {};
    const skipped: string[] = [];

    try {
      for (const scope of scopes) {
        const { data, error: rpcErr } = await supabase.rpc("clear_branch_data", {
          p_store_id: currentStoreId,
          p_password: password,
          p_scope: scope,
          p_confirm: CONFIRM_WORD,
        } as any);

        if (rpcErr) throw rpcErr;

        const res = data as unknown as {
          deleted?: Record<string, number>; skipped?: string[];
        } | null;
        Object.entries(res?.deleted || {}).forEach(([t, n]) => {
          deleted[t] = (deleted[t] || 0) + Number(n || 0);
        });
        (res?.skipped || []).forEach((s) => skipped.push(s));
      }

      // Stop the offline mirror and every cached query from restoring the rows.
      await purgeLocalMirror();
      await queryClient.invalidateQueries();

      const total = Object.values(deleted).reduce((a, b) => a + b, 0);
      setReport({ deleted, skipped });
      toast({
        title: "Data deleted",
        description: `${total} row${total === 1 ? "" : "s"} removed from this branch.`,
        variant: "success",
      });
      await onCleared();
    } catch (e: any) {
      // The RPC raises plain messages on every gate, so show them verbatim.
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const totalRows = Object.values(report?.deleted || {}).reduce((a, b) => a + b, 0);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="max-w-xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-5 w-5" />Delete Data
          </DialogTitle>
          <DialogDescription>
            This permanently deletes records from the database for this branch. It cannot be undone.
          </DialogDescription>
        </DialogHeader>

        {report ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-green-300 bg-green-50 p-4">
              <p className="font-semibold text-green-800">
                {totalRows} row{totalRows === 1 ? "" : "s"} deleted
              </p>
              <ul className="mt-2 space-y-0.5 text-sm text-green-800">
                {Object.entries(report.deleted).map(([t, n]) => (
                  <li key={t} className="flex justify-between gap-4">
                    <span>{t.replace(/_/g, " ")}</span>
                    <span className="font-mono">{n}</span>
                  </li>
                ))}
              </ul>
              {report.skipped.length > 0 && (
                <p className="mt-2 text-xs text-amber-700">
                  Skipped: {report.skipped.join(", ")}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Close</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Scope picker */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                Choose what to delete
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SCOPES.map((s) => {
                  const on = selected.has(s.key);
                  return (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => toggle(s.key)}
                      className={`text-left rounded-lg border p-3 transition-colors ${
                        on ? "border-destructive bg-destructive/5 ring-1 ring-destructive" : "hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Checkbox checked={on} tabIndex={-1} className="pointer-events-none" />
                        <span className="font-semibold text-sm">{s.label}</span>
                        <span className="text-[10px] text-muted-foreground ml-auto">{s.page}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{s.detail}</p>
                    </button>
                  );
                })}
              </div>
              {chosen.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Will delete: {chosen.map((c) => c.label).join(", ")}
                </p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-2">
                <Lock className="h-4 w-4" />Store password
              </Label>
              <div className="relative">
                <Input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your store access password"
                  autoComplete="current-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                  aria-label={showPw ? "Hide password" : "Show password"}
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Verified on the server. Staff PINs are not accepted.
              </p>
            </div>

            {/* Typed confirmation */}
            <div className="space-y-1.5">
              <Label htmlFor="confirm-word">
                Type <span className="font-mono font-bold">{CONFIRM_WORD}</span> to confirm
              </Label>
              <Input
                id="confirm-word"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={CONFIRM_WORD}
              />
            </div>

            {error && (
              <div className="rounded-lg border border-destructive bg-destructive/5 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={run} disabled={!ready} className="gap-2">
                <Trash2 className="h-4 w-4" />
                {busy ? "Deleting..." : `Delete ${chosen.length > 1 ? `${chosen.length} groups` : chosen[0]?.label || "data"}`}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ClearDataDialog;
