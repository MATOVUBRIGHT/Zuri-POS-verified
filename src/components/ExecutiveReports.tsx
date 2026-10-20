import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import Reports from "@/components/Reports";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ExpenseItem, SaleItem, StockItem } from "@/types";

type Branch = { id: string; store_name: string };

interface ExecutiveReportsProps {
  userId: string | null;
  currentStoreId: string | null;
  onStoreChange: (storeId: string) => void;
  stockData: StockItem[];
  salesData: SaleItem[];
  expensesData: ExpenseItem[];
  onPageChange: (page: string, params?: unknown) => void;
}

export default function ExecutiveReports({
  userId,
  currentStoreId,
  onStoreChange,
  stockData,
  salesData,
  expensesData,
  onPageChange,
}: ExecutiveReportsProps) {
  const [branches, setBranches] = useState<Branch[]>([]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    void (async () => {
      const [owned, access] = await Promise.all([
        supabase.from("stores").select("id, store_name").eq("user_id", userId),
        supabase.from("store_access").select("store_id").eq("user_id", userId),
      ]);
      const ids = [...new Set([
        ...(owned.data || []).map((branch) => branch.id),
        ...(access.data || []).map((branch) => branch.store_id),
      ])];
      if (cancelled || !ids.length) {
        if (!cancelled) setBranches([]);
        return;
      }

      const { data } = await supabase
        .from("stores")
        .select("id, store_name")
        .in("id", ids)
        .order("store_name");
      if (cancelled) return;
      const rows = (data || []) as Branch[];
      setBranches(rows);
      if (!currentStoreId || !rows.some((branch) => branch.id === currentStoreId)) {
        const first = rows[0];
        if (first) onStoreChange(first.id);
      }
    })();

    return () => { cancelled = true; };
  }, [currentStoreId, onStoreChange, userId]);

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-[220px] space-y-2">
            <Label htmlFor="executive-report-branch">Reporting branch</Label>
            <Select value={currentStoreId || ""} onValueChange={onStoreChange} disabled={!branches.length}>
              <SelectTrigger id="executive-report-branch">
                <SelectValue placeholder={branches.length ? "Select branch" : "No branches available"} />
              </SelectTrigger>
              <SelectContent>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id}>{branch.store_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-sm text-muted-foreground">Reports use the same data and tabs as the branch POS.</p>
        </CardContent>
      </Card>

      {currentStoreId ? (
        <Reports
          stockData={stockData}
          salesData={salesData}
          expensesData={expensesData}
          currentStoreId={currentStoreId}
          onPageChange={onPageChange}
        />
      ) : (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Select a branch to view its reports.</CardContent></Card>
      )}
    </div>
  );
}
