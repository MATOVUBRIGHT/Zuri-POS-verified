import { fmtCurrency } from "@/lib/currency";

export interface CartItem {
  id?: string;
  productName?: string;
  quantity: number;
  sellingPrice: number;
}

export interface CalculationResult {
  subtotal: number;
  discountAmount: number;
  taxableAmount: number;
  taxAmount: number;
  total: number;
}

/**
 * Financial-grade POS calculation engine.
 * Uses integer cents to avoid floating point errors.
 * 
 * Canonical Calculation Order:
 * 1. Item total = price * quantity
 * 2. Subtotal = sum(item_totals)
 * 3. Discount = subtotal * discount_rate (or fixed value)
 * 4. Taxable amount = subtotal - discount
 * 5. Tax = taxable * tax_rate
 * 6. Final total = taxable + tax
 */
export const calculateTransaction = (
  cartItems: CartItem[],
  discount: { value: number; type: "fixed" | "percentage" } = { value: 0, type: "fixed" },
  taxRate: number = 0
): CalculationResult => {
  // Step 1 & 2: Item totals and Subtotal
  // Convert all to cents (multiply by 100)
  const subtotalCents = cartItems.reduce((sum, item) => {
    const priceCents = Math.round(item.sellingPrice * 100);
    return sum + (item.quantity * priceCents);
  }, 0);

  // Step 3: Discount
  let discountCents = 0;
  if (discount.type === "percentage") {
    // Use Math.round for currency precision
    discountCents = Math.round(subtotalCents * (discount.value / 100));
  } else {
    discountCents = Math.round(discount.value * 100);
  }
  
  // Ensure discount doesn't exceed subtotal and is not negative
  discountCents = Math.max(0, Math.min(discountCents, subtotalCents));

  // Step 4: Taxable amount
  const taxableCents = subtotalCents - discountCents;

  // Step 5: Tax
  // Tax is applied to the discounted taxable amount
  const taxCents = Math.round(taxableCents * (taxRate / 100));

  // Step 6: Final total
  const totalCents = taxableCents + taxCents;

  // Return values as decimal for UI, but derived from integer math
  return {
    subtotal: subtotalCents / 100,
    discountAmount: discountCents / 100,
    taxableAmount: taxableCents / 100,
    taxAmount: taxCents / 100,
    total: totalCents / 100,
  };
};

/**
 * Formats a number as UGX currency (rounded to whole number)
 */
export const formatCurrency = (amount: number): string => {
  const roundedAmount = Math.round(amount);
  return `${fmtCurrency(roundedAmount)}`;
};
