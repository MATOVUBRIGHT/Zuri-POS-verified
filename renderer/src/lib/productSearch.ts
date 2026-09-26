import type { StockItem } from "@/types";

export type ProductSearchEntry = {
  id: string;
  haystack: string;
  product: StockItem;
  barcode?: string;
  nameNorm: string;
};

const normalize = (value: string): string =>
  (value || "")
    .toLowerCase()
    .replace(/[_/.,()-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const safe = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  return String(value);
};

export const buildProductSearchIndex = (products: StockItem[]): ProductSearchEntry[] => {
  return products.map((p) => {
    const name = safe(p.productName || p.product_name);
    const category = safe(p.category);
    const supplier = safe(p.supplier);
    const size = safe(p.size);
    const notes = safe(p.notes);
    const barcode = safe(p.barcode);

    const parts = [
      name,
      barcode,
      category,
      supplier,
      size,
      notes,
    ]
      .filter(Boolean)
      .map(normalize);

    return {
      id: safe(p.id) || name,
      haystack: parts.join(" "),
      product: p,
      barcode: barcode || undefined,
      nameNorm: normalize(name),
    };
  });
};

type SearchOptions = {
  limit?: number;
};

export const searchProductIndex = (
  index: ProductSearchEntry[],
  rawQuery: string,
  options: SearchOptions = {}
): StockItem[] => {
  const limit = options.limit ?? index.length;
  const query = normalize(rawQuery);

  if (!query) {
    return index.slice(0, limit).map((e) => e.product);
  }

  const tokens = query.split(" ").filter(Boolean);
  const isLikelyBarcode = /^\d{2,}$/.test(query);

  // Keep only the best `limit` results while scanning.
  // This avoids sorting potentially thousands of matched entries.
  const best: Array<{ score: number; product: StockItem }> = [];

  for (const entry of index) {
    const h = entry.haystack;

    // Require all tokens to match somewhere (substring match is "related" enough and fast).
    let ok = true;
    let score = 0;
    for (const t of tokens) {
      const pos = h.indexOf(t);
      if (pos === -1) {
        ok = false;
        break;
      }
      score += pos;
    }
    if (!ok) continue;

    // Prefer barcode prefix matches when the query looks like a barcode.
    if (isLikelyBarcode && entry.barcode) {
      if (entry.barcode.startsWith(rawQuery.trim())) score -= 10_000;
      else if (normalize(entry.barcode).startsWith(query)) score -= 7_000;
      else score -= 500;
    }

    // Prefer product name prefix matches.
    if (entry.nameNorm.startsWith(query)) score -= 5_000;

    if (best.length < limit) {
      best.push({ score, product: entry.product });
      best.sort((a, b) => a.score - b.score);
      continue;
    }

    // best is sorted ascending by score, so worst = last element.
    if (score < best[best.length - 1].score) {
      best[best.length - 1] = { score, product: entry.product };
      best.sort((a, b) => a.score - b.score);
    }
  }

  return best.slice(0, limit).map((s) => s.product);
};

