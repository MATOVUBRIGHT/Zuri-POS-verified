import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowUpRight,
  Brain,
  Lightbulb,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";
import { LoadingMark } from "@/components/ui/loading-spinner";
import { supabase } from "@/integrations/supabase/client";
import { fmtCurrencyFor } from "@/lib/currency";
import { saleDateToLocalKey, toLocalDateKey } from "@/lib/date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type ManagedBranch = {
  id: string;
  store_name: string;
  currency: string;
  sales: number;
  expenses: number;
  transactions: number;
};

type SaleLine = {
  productName?: string;
  quantity?: number;
  sellingPrice?: number;
  price?: number;
  sellType?: string;
};

type SaleRow = {
  date_of_sale: string | null;
  total_amount: number | null;
  products: unknown;
};

type CatalogEntry = {
  category: string;
  costPerUnit: number;
  itemsPerSachet: number;
  stock: number;
};

type BrandRow = {
  name: string;
  revenue: number;
  quantity: number;
  cost: number;
  profit: number;
  margin: number;
};

const WINDOW_DAYS = 30;
const normalize = (value: unknown) =>
  String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");

// Axis ticks stay short so long currency strings cannot spill out of the chart.
const compactAmount = (value: number) => {
  const magnitude = Math.abs(value);
  if (magnitude >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (magnitude >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (magnitude >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return String(Math.round(value));
};

export default function BranchManageDialog({
  branch,
  open,
  onOpenChange,
  onOpenPos,
}: {
  branch: ManagedBranch | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenPos?: (id: string) => void;
}) {
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [catalog, setCatalog] = useState<Map<string, CatalogEntry>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !branch) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    const load = async () => {
      const [salesResult, stockResult] = await Promise.all([
        supabase
          .from("sales")
          .select("date_of_sale, total_amount, products")
          .eq("store_id", branch.id)
          .order("date_of_sale", { ascending: true })
          .limit(5000),
        supabase
          .from("inventory")
          .select(
            "product_name, category, cost_per_unit, quantity, items_per_sachet",
          )
          .eq("store_id", branch.id),
      ]);

      if (cancelled) return;
      if (salesResult.error) {
        setError(salesResult.error.message);
        setLoading(false);
        return;
      }

      const nextCatalog = new Map<string, CatalogEntry>();
      (stockResult.data || []).forEach((row: any) => {
        const key = normalize(row.product_name);
        if (!key) return;
        nextCatalog.set(key, {
          category: row.category || "Uncategorised",
          costPerUnit: Number(row.cost_per_unit) || 0,
          itemsPerSachet: Math.max(1, Number(row.items_per_sachet) || 1),
          stock: Number(row.quantity) || 0,
        });
      });

      setSales((salesResult.data || []) as SaleRow[]);
      setCatalog(nextCatalog);
      setLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [open, branch]);

  const money = useCallback(
    (amount: number) => fmtCurrencyFor(amount, branch?.currency || "UGX"),
    [branch?.currency],
  );

  // Performance curve, grouped by the business date the cashier actually used
  // so the shape matches the branch POS dashboard rather than insert time.
  const curve = useMemo(() => {
    const byDate = new Map<string, number>();
    sales.forEach((sale) => {
      const key = saleDateToLocalKey(sale.date_of_sale);
      if (!key) return;
      byDate.set(key, (byDate.get(key) || 0) + (Number(sale.total_amount) || 0));
    });

    const points: { date: string; sales: number; full: string }[] = [];
    const today = new Date();
    for (let offset = WINDOW_DAYS - 1; offset >= 0; offset -= 1) {
      const day = new Date(today);
      day.setDate(day.getDate() - offset);
      const key = toLocalDateKey(day);
      points.push({
        date: day.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        full: key,
        sales: byDate.get(key) || 0,
      });
    }
    return points;
  }, [sales]);

  const brands = useMemo(() => {
    const grouped = new Map<string, BrandRow>();
    sales.forEach((sale) => {
      const lines = Array.isArray(sale.products) ? (sale.products as SaleLine[]) : [];
      lines.forEach((line) => {
        const name = String(line.productName || "").trim();
        const key = normalize(name);
        if (!key) return;
        const profile = catalog.get(key);
        const quantity = Number(line.quantity) || 0;
        const unitPrice = Number(line.sellingPrice ?? line.price) || 0;
        const brand = profile?.category || "Uncategorised";
        const unitCost =
          line.sellType === "sachet"
            ? (profile?.costPerUnit || 0) * (profile?.itemsPerSachet || 1)
            : profile?.costPerUnit || 0;

        const row =
          grouped.get(brand) ||
          ({ name: brand, revenue: 0, quantity: 0, cost: 0, profit: 0, margin: 0 } as BrandRow);
        row.revenue += quantity * unitPrice;
        row.quantity += quantity;
        row.cost += quantity * unitCost;
        grouped.set(brand, row);
      });
    });

    return Array.from(grouped.values())
      .filter((row) => row.revenue > 0)
      .map((row) => {
        const profit = row.revenue - row.cost;
        return {
          ...row,
          profit,
          margin: row.revenue > 0 ? (profit / row.revenue) * 100 : 0,
        };
      })
      .sort((a, b) => b.revenue - a.revenue);
  }, [sales, catalog]);

  const best = brands.slice(0, 5);
  const worst = brands.slice(-5).reverse();

  const review = useMemo(() => buildReview(curve, brands, branch), [curve, brands, branch]);
  const lowStock = useMemo(
    () =>
      Array.from(catalog.entries())
        .filter(([, entry]) => entry.stock <= 0)
        .map(([key, entry]) => ({ name: key, category: entry.category })),
    [catalog],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[94vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b px-6 py-4 pr-14">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="truncate">{branch?.store_name}</span>
              <Badge variant="outline" className="shrink-0">
                {branch?.currency || "UGX"}
              </Badge>
            </DialogTitle>
            <DialogDescription>
              Branch performance, brand mix, and an automated review drawn from this
              branch's own POS records.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5">
          {loading ? (
            <div className="flex min-h-64 items-center justify-center">
              <LoadingMark size="sm" />
            </div>
          ) : error ? (
            <div className="flex min-h-64 flex-col items-center justify-center text-center">
              <TriangleAlert className="mb-3 text-destructive" />
              <p className="font-medium">Branch records could not be loaded</p>
              <p className="mt-1 text-sm text-muted-foreground">{error}</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Sales" value={money(branch?.sales || 0)} />
                <Stat label="Expenses" value={money(branch?.expenses || 0)} />
                <Stat
                  label="Net"
                  value={money((branch?.sales || 0) - (branch?.expenses || 0))}
                  tone={
                    (branch?.sales || 0) - (branch?.expenses || 0) < 0
                      ? "negative"
                      : "positive"
                  }
                />
                <Stat label="Transactions" value={String(branch?.transactions || 0)} />
              </div>

              <div className="grid gap-4 lg:grid-cols-5">
                <Card className="lg:col-span-3">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Performance curve</CardTitle>
                    <CardDescription>
                      Daily sales for the last {WINDOW_DAYS} days, from the branch POS
                      dashboard.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={curve}
                          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                        >
                          <defs>
                            <linearGradient id="branchCurve" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.3} vertical={false} />
                          <XAxis
                            dataKey="date"
                            fontSize={11}
                            tickLine={false}
                            axisLine={false}
                            interval={4}
                            minTickGap={8}
                          />
                          <YAxis
                            fontSize={11}
                            tickLine={false}
                            axisLine={false}
                            width={52}
                            tickFormatter={compactAmount}
                          />
                          <Tooltip
                            formatter={(value: number) => [money(value), "Sales"]}
                            contentStyle={{ borderRadius: 8, fontSize: 12 }}
                          />
                          <Area
                            type="monotone"
                            dataKey="sales"
                            stroke="hsl(var(--primary))"
                            strokeWidth={2.5}
                            fill="url(#branchCurve)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <div className="space-y-4 lg:col-span-2">
                  <BrandList
                    title="Most selling brands"
                    description="Grouped by the category recorded against each product."
                    rows={best}
                    money={money}
                    tone="positive"
                  />
                  <BrandList
                    title="Worst performing brands"
                    description="Lowest revenue in the period. Worth reviewing pricing or stock."
                    rows={worst}
                    money={money}
                    tone="negative"
                  />
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <Card className="lg:col-span-2">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Brain className="h-4 w-4 text-primary" />
                      AI review
                    </CardTitle>
                    <CardDescription>
                      Generated from this branch's figures. No external model is called.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {review.findings.map((line, index) => (
                      <p key={index} className="flex items-start gap-2 text-sm">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                        <span className="min-w-0 break-words">{line}</span>
                      </p>
                    ))}
                  </CardContent>
                </Card>

                <Card className="border-primary/30 bg-primary/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Lightbulb className="h-4 w-4 text-primary" />
                      Suggestion
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="break-words text-sm leading-6">{review.suggestion}</p>
                    {lowStock.length > 0 && (
                      <p className="mt-2 break-words text-xs text-muted-foreground">
                        {lowStock.length} product{lowStock.length === 1 ? " is" : "s are"} at
                        zero stock: {lowStock.slice(0, 6).map((item) => item.name).join(", ")}
                        {lowStock.length > 6 ? "…" : ""}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {onOpenPos && branch && (
                <div className="flex justify-end">
                  <Button variant="outline" size="sm" onClick={() => onOpenPos(branch.id)}>
                    Open branch POS
                    <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-1 truncate text-lg font-bold ${
          tone === "positive"
            ? "text-emerald-600"
            : tone === "negative"
              ? "text-rose-600"
              : ""
        }`}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}

function BrandList({
  title,
  description,
  rows,
  money,
  tone,
}: {
  title: string;
  description: string;
  rows: BrandRow[];
  money: (amount: number) => string;
  tone: "positive" | "negative";
}) {
  const Icon = tone === "positive" ? TrendingUp : TrendingDown;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4 text-primary" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length ? (
          <div className="space-y-2.5">
            {rows.map((row) => (
              <div key={row.name} className="flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{row.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.quantity.toLocaleString()} units · {row.margin.toFixed(1)}% margin
                  </p>
                </div>
                <p className="shrink-0 font-semibold tabular-nums">{money(row.revenue)}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-4 text-sm text-muted-foreground">No brand sales recorded yet.</p>
        )}
      </CardContent>
    </Card>
  );
}

type Review = { findings: string[]; suggestion: string };

/**
 * Rule-based review. There is no model provider wired into this project, so
 * the text is derived deterministically from the same figures shown above
 * rather than generated. Swap this for a model call when one is available.
 */
function buildReview(
  curve: { sales: number }[],
  brands: BrandRow[],
  branch: ManagedBranch | null,
): Review {
  const findings: string[] = [];
  const sales = branch?.sales || 0;
  const expenses = branch?.expenses || 0;
  const net = sales - expenses;
  const expenseRatio = sales > 0 ? (expenses / sales) * 100 : 0;

  const activeDays = curve.filter((point) => point.sales > 0);
  const half = Math.floor(curve.length / 2);
  const recent = curve.slice(half).reduce((sum, point) => sum + point.sales, 0);
  const prior = curve.slice(0, half).reduce((sum, point) => sum + point.sales, 0);
  const trend = prior > 0 ? ((recent - prior) / prior) * 100 : 0;
  const averageDay = activeDays.length
    ? activeDays.reduce((sum, point) => sum + point.sales, 0) / activeDays.length
    : 0;

  if (!curve.some((point) => point.sales > 0)) {
    findings.push(
      "No sales have been recorded against this branch in the last 30 days, so there is no trend to judge.",
    );
  } else {
    const direction = trend >= 0 ? "up" : "down";
    findings.push(
      `Sales in the last 15 days are ${Math.abs(trend).toFixed(1)}% ${direction} against the previous 15 days.`,
    );
    findings.push(
      `${activeDays.length} of the last ${curve.length} days recorded a sale, averaging ${averageDay.toFixed(0)} per trading day.`,
    );
  }

  findings.push(
    expenses > sales
      ? `Expenses exceed sales, so the branch is running at a loss of ${Math.abs(net).toFixed(0)}.`
      : `Expenses absorb ${expenseRatio.toFixed(1)}% of sales, leaving a net of ${net.toFixed(0)}.`,
  );

  if (brands.length) {
    const leader = brands[0];
    const share = sales > 0 ? (leader.revenue / sales) * 100 : 0;
    findings.push(
      `${leader.name} leads with ${share.toFixed(1)}% of recorded sales revenue.`,
    );
    const losing = brands.filter((row) => row.margin < 0);
    if (losing.length) {
      findings.push(
        `${losing.length} brand${losing.length === 1 ? "" : "s"} sold below cost: ${losing
          .slice(0, 3)
          .map((row) => row.name)
          .join(", ")}.`,
      );
    }
  }

  let suggestion: string;
  if (!curve.some((point) => point.sales > 0)) {
    suggestion =
      "Confirm the branch is trading. If it is, check that cashiers are completing sales on the POS rather than recording them elsewhere.";
  } else if (expenses > sales) {
    suggestion =
      "Cut or defer spending before taking on more stock. Review the expense list for anything that can be paused this month, then re-check the net figure.";
  } else if (trend < -10) {
    suggestion = `Sales are falling ${Math.abs(trend).toFixed(0)}%. Put the top performing brands on promotion at the counter and check whether the drop lines up with a stock-out on ${brands[brands.length - 1]?.name || "a slow brand"}.`;
  } else if (expenseRatio > 40) {
    suggestion =
      "Spending is high relative to sales. Cap expenses nearer a third of revenue to protect the margin, and review the largest line first.";
  } else if (brands.length && brands[0].revenue / Math.max(sales, 1) > 0.5) {
    suggestion = `Revenue is concentrated in ${brands[0].name}. Grow the second and third brands so a single supplier change cannot wipe out the month.`;
  } else {
    suggestion =
      "Performance is steady with a healthy margin. Keep the current range and push the top brands harder rather than adding new stock.";
  }

  return { findings, suggestion };
}
