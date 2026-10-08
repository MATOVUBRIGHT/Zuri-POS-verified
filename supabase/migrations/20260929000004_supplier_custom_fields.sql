-- Add custom fields support for suppliers
-- Custom fields will be stored as JSON in a new column

-- Add custom_fields column to suppliers table
ALTER TABLE suppliers 
ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}';

-- Create index on custom fields for faster queries
CREATE INDEX IF NOT EXISTS idx_suppliers_custom_fields ON suppliers USING gin (custom_fields);

-- Function to safely update supplier with custom fields
CREATE OR REPLACE FUNCTION update_supplier_with_custom_fields(
  supplier_id UUID,
  supplier_data JSONB,
  custom_data JSONB DEFAULT '{}'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update supplier with both standard fields and custom fields
  UPDATE suppliers 
  SET 
    name = COALESCE((supplier_data->>'name')::text, name),
    phone = COALESCE((supplier_data->>'phone')::text, phone),
    email = COALESCE((supplier_data->>'email')::text, email),
    address = COALESCE((supplier_data->>'address')::text, address),
    company = COALESCE((supplier_data->>'company')::text, company),
    notes = COALESCE((supplier_data->>'notes')::text, notes),
    total_supplied = COALESCE((supplier_data->>'total_supplied')::numeric, total_supplied),
    outstanding_balance = COALESCE((supplier_data->>'outstanding_balance')::numeric, outstanding_balance),
    custom_fields = custom_fields || custom_data,
    updated_at = NOW()
  WHERE id = supplier_id;
  
  RETURN FOUND;
END;
$$;

-- Function to create supplier with custom fields
CREATE OR REPLACE FUNCTION create_supplier_with_custom_fields(
  supplier_data JSONB,
  custom_data JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_id UUID;
BEGIN
  INSERT INTO suppliers (
    store_id,
    user_id,
    name,
    phone,
    email,
    address,
    company,
    notes,
    total_supplied,
    outstanding_balance,
    custom_fields
  ) VALUES (
    (supplier_data->>'store_id')::uuid,
    (supplier_data->>'user_id')::uuid,
    (supplier_data->>'name')::text,
    (supplier_data->>'phone')::text,
    (supplier_data->>'email')::text,
    (supplier_data->>'address')::text,
    (supplier_data->>'company')::text,
    (supplier_data->>'notes')::text,
    COALESCE((supplier_data->>'total_supplied')::numeric, 0),
    COALESCE((supplier_data->>'outstanding_balance')::numeric, 0),
    custom_data
  )
  RETURNING id INTO new_id;
  
  RETURN new_id;
END;
$$;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION update_supplier_with_custom_fields(UUID, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION create_supplier_with_custom_fields(JSONB, JSONB) TO authenticated;

-- Add comment
COMMENT ON COLUMN suppliers.custom_fields IS 'JSON object containing custom fields defined by the user during import or manual entry';