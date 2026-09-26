const INVENTORY_ALLOWED_COLUMNS = [
  "store_id",
  "user_id",
  "product_name",
  "category",
  "quantity",
  "cost_per_unit",
  "total_value",
  "retail_price",
  "wholesale_price",
  "loose_item_price",
  "date_of_purchase",
  "supplier_id",
  "supplier_name",
  "barcode",
  "unit_name",
  "packaging_type",
  "items_per_sachet",
  "sachets_count",
  "loose_items",
  "size",
  "notes",
  "product_image",
  "min_stock_level",
  "reorder_quantity",
] as const;

type InventoryAllowedColumn = (typeof INVENTORY_ALLOWED_COLUMNS)[number];

export const sanitizeInventoryPayload = (row: Record<string, unknown>) => {
  const sanitized: Partial<Record<InventoryAllowedColumn, unknown>> & { id?: unknown } = {};

  // Preserve id if present (needed for update operations)
  if (row.id !== undefined) {
    sanitized.id = row.id;
  }

  for (const key of INVENTORY_ALLOWED_COLUMNS) {
    const value = row[key];
    if (value !== undefined) {
      sanitized[key] = value;
    }
  }

  return sanitized;
};
