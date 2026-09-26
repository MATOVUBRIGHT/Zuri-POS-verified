import { Badge } from "@/components/ui/badge";
import { fmtCurrency, getCurrencySymbol } from "@/lib/currency";

interface EfrisTaxPreviewProps {
  retailPrice: string;
  wholesalePrice: string;
  overrideTaxes: boolean;
  taxRate: string;
  defaultTaxRate: number;
}

export const EfrisTaxPreview = ({ 
  retailPrice, 
  wholesalePrice, 
  overrideTaxes, 
  taxRate,
  defaultTaxRate
}: EfrisTaxPreviewProps) => {
  const retailBase = parseFloat(retailPrice);
  const wholesaleBase = parseFloat(wholesalePrice);
  
  if (isNaN(retailBase) && isNaN(wholesaleBase)) return null;
  if (retailBase <= 0 && wholesaleBase <= 0) return null;

  const fallbackRate = Number.isFinite(defaultTaxRate) && defaultTaxRate >= 0 ? defaultTaxRate : 18;
  const currentRate = overrideTaxes ? (parseFloat(taxRate) || fallbackRate) : fallbackRate;
  const rateDecimal = currentRate / 100;

  const calculateWithTax = (base: number) => {
    const tax = Math.round(base * rateDecimal);
    return Math.max(100, Math.round((base + tax) / 100) * 100);
  };

  return (
    <div className="p-4 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800 space-y-2">
      <h4 className="font-medium text-sm flex items-center gap-2 text-amber-700 dark:text-amber-400">
        📋 EFRIS Tax Preview ({currentRate}%)
      </h4>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        {retailBase > 0 && (
          <>
            <div>
              <p className="text-xs text-muted-foreground">Retail Base</p>
              <p className="font-semibold">{fmtCurrency(retailBase)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Retail + EFRIS</p>
              <p className="font-bold text-amber-700 dark:text-amber-400">
                {fmtCurrency(calculateWithTax(retailBase))}
              </p>
            </div>
          </>
        )}
        {wholesaleBase > 0 && (
          <>
            <div>
              <p className="text-xs text-muted-foreground">Wholesale Base</p>
              <p className="font-semibold">{fmtCurrency(wholesaleBase)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Wholesale + EFRIS</p>
              <p className="font-bold text-amber-700 dark:text-amber-400">
                {fmtCurrency(calculateWithTax(wholesaleBase))}
              </p>
            </div>
          </>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground">Prices rounded up to nearest 100, minimum {getCurrencySymbol()} 100</p>
    </div>
  );
};
