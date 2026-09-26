import { useState, useEffect, useCallback } from "react";
import { RefreshCw, TrendingUp, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

// Currencies supported in the app
const CURRENCY_PAIRS: { base: string; quote: string; label: string }[] = [
  { base: "USD", quote: "UGX", label: "US Dollar → Ugandan Shilling" },
  { base: "USD", quote: "KES", label: "US Dollar → Kenyan Shilling" },
  { base: "USD", quote: "TZS", label: "US Dollar → Tanzanian Shilling" },
  { base: "USD", quote: "RWF", label: "US Dollar → Rwandan Franc" },
  { base: "USD", quote: "NGN", label: "US Dollar → Nigerian Naira" },
  { base: "USD", quote: "GHS", label: "US Dollar → Ghanaian Cedi" },
  { base: "USD", quote: "ZAR", label: "US Dollar → South African Rand" },
  { base: "EUR", quote: "UGX", label: "Euro → Ugandan Shilling" },
  { base: "GBP", quote: "UGX", label: "British Pound → Ugandan Shilling" },
  { base: "AED", quote: "UGX", label: "UAE Dirham → Ugandan Shilling" },
  { base: "CNY", quote: "UGX", label: "Chinese Yuan → Ugandan Shilling" },
  { base: "INR", quote: "UGX", label: "Indian Rupee → Ugandan Shilling" },
];

interface Rate {
  base: string;
  quote: string;
  rate: number;
  label: string;
}

interface CurrencyRatesProps {
  selectedCurrency: string;
}

const fmt = (n: number) => {
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
};

export default function CurrencyRates({ selectedCurrency }: CurrencyRatesProps) {
  const [rates, setRates] = useState<Rate[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState("1");
  const [fromCurrency, setFromCurrency] = useState("USD");
  const [toCurrency, setToCurrency] = useState(selectedCurrency || "UGX");
  const [convertedAmount, setConvertedAmount] = useState<number | null>(null);
  const [allRates, setAllRates] = useState<Record<string, number>>({});

  const fetchRates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Free API — no key required, updated every 24h
      const res = await fetch("https://open.er-api.com/v6/latest/USD");
      if (!res.ok) throw new Error("Failed to fetch rates");
      const data = await res.json();
      if (data.result !== "success") throw new Error(data["error-type"] || "API error");

      const usdRates: Record<string, number> = data.rates;
      setAllRates(usdRates);

      // Build the display pairs — convert via USD as base
      const built: Rate[] = CURRENCY_PAIRS.map(({ base, quote, label }) => {
        // rate = how many `quote` per 1 `base`
        // usdRates[X] = how many X per 1 USD
        // base per USD = usdRates[base], quote per USD = usdRates[quote]
        // so 1 base = usdRates[quote] / usdRates[base] quote
        const baseRate = usdRates[base] ?? 1;
        const quoteRate = usdRates[quote] ?? 1;
        const rate = quoteRate / baseRate;
        return { base, quote, rate, label };
      });

      setRates(built);
      setLastUpdated(new Date());
    } catch (e: any) {
      setError(e.message || "Could not load exchange rates");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRates();
  }, [fetchRates]);

  // Update toCurrency when selectedCurrency changes
  useEffect(() => {
    if (selectedCurrency) setToCurrency(selectedCurrency);
  }, [selectedCurrency]);

  // Live converter
  useEffect(() => {
    if (!Object.keys(allRates).length) return;
    const from = allRates[fromCurrency] ?? 1;
    const to = allRates[toCurrency] ?? 1;
    const result = (parseFloat(amount) || 0) * (to / from);
    setConvertedAmount(result);
  }, [amount, fromCurrency, toCurrency, allRates]);

  const allCurrencyCodes = Array.from(new Set(CURRENCY_PAIRS.flatMap((p) => [p.base, p.quote]))).sort();

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">Live Exchange Rates</span>
          {lastUpdated && (
            <Badge variant="secondary" className="text-[10px]">
              Updated {lastUpdated.toLocaleTimeString()}
            </Badge>
          )}
        </div>
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={fetchRates} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-xs text-destructive">
          {error} — rates may be unavailable offline.
        </div>
      )}

      {/* Rate grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {loading && rates.length === 0
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
            ))
          : rates.map(({ base, quote, rate, label }) => (
              <div key={`${base}-${quote}`} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/40 transition-colors">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-xs font-bold text-muted-foreground shrink-0">{base}</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="font-mono text-xs font-bold text-muted-foreground shrink-0">{quote}</span>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold tabular-nums">
                    1 {base} = {fmt(rate)} {quote}
                  </p>
                </div>
              </div>
            ))}
      </div>

      {/* Live converter */}
      <div className="p-4 rounded-xl border bg-primary/5 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Quick Converter</p>
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="h-9 w-28 text-center font-bold"
            min="0"
          />
          <select
            value={fromCurrency}
            onChange={(e) => setFromCurrency(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm font-medium"
          >
            {allCurrencyCodes.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
          <select
            value={toCurrency}
            onChange={(e) => setToCurrency(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm font-medium"
          >
            {allCurrencyCodes.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {convertedAmount !== null && (
          <p className="text-lg font-bold text-primary tabular-nums">
            {fmt(parseFloat(amount) || 0)} {fromCurrency} = {fmt(convertedAmount)} {toCurrency}
          </p>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground">
        Rates from open.er-api.com · Updated daily · For reference only
      </p>
    </div>
  );
}
