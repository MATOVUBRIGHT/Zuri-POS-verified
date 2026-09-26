// Currency utility — reads from localStorage (set in Settings)
const CURRENCIES: Record<string, string> = {
  UGX: "UGX", KES: "KSh", TZS: "TSh", RWF: "RWF", ETB: "ETB",
  NGN: "₦", GHS: "GH₵", ZAR: "R", USD: "$", EUR: "€", GBP: "£",
};

/** Format an amount for a known branch currency without depending on the active POS store. */
export function fmtCurrencyFor(amount: number, currency?: string | null): string {
  const code = (currency || "UGX").toUpperCase();
  try {
    const digits = getCurrencyFractionDigits(code);
    const nf = new Intl.NumberFormat(undefined, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    return `${CURRENCIES[code] ?? code} ${nf.format(Number(amount) || 0)}`;
  } catch {
    return `${CURRENCIES[code] ?? code} ${(Number(amount) || 0).toFixed(2)}`;
  }
}

export function getCurrencySymbol(): string {
  try {
    const storeId = localStorage.getItem('brec_current_store');
    const key = storeId ? `app_currency_${storeId}` : 'app_currency';
    const code = localStorage.getItem(key) || localStorage.getItem('app_currency') || "UGX";
    return CURRENCIES[code] ?? code;
  } catch {
    return CURRENCIES['UGX'];
  }
}

export function getCurrencyCode(): string {
  try {
    const storeId = localStorage.getItem('brec_current_store');
    const key = storeId ? `app_currency_${storeId}` : 'app_currency';
    return localStorage.getItem(key) || localStorage.getItem('app_currency') || "UGX";
  } catch {
    return "UGX";
  }
}

/** Format a number with the current currency symbol */
export function fmtCurrency(amount: number): string {
  return fmtCurrencyFor(amount, getCurrencyCode());
}

/** Return the number of fraction digits commonly used for a currency code (e.g. UGX -> 0, USD -> 2) */
export function getCurrencyFractionDigits(code?: string): number {
  try {
    const currency = code || getCurrencyCode();
    // resolvedOptions().maximumFractionDigits gives the typical fraction digits
    const opts = new Intl.NumberFormat(undefined, { style: 'currency', currency }).resolvedOptions();
    return opts.maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

/** Convert & round an amount by a factor according to target currency fraction digits */
export function convertAndRound(amount: number, factor: number, targetCurrency?: string): number {
  const digits = getCurrencyFractionDigits(targetCurrency);
  const mult = Math.pow(10, digits);
  return Math.round((amount * factor) * mult) / mult;
}
