-- Create suppliers table
CREATE TABLE IF NOT EXISTS suppliers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    contact_person TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    payment_details JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their store suppliers" ON suppliers
    FOR SELECT USING (
        store_id IN (
            SELECT id FROM stores WHERE user_id = auth.uid()
            UNION
            SELECT store_id FROM store_access WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert suppliers for their store" ON suppliers
    FOR INSERT WITH CHECK (
        store_id IN (
            SELECT id FROM stores WHERE user_id = auth.uid()
            UNION
            SELECT store_id FROM store_access WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update their store suppliers" ON suppliers
    FOR UPDATE USING (
        store_id IN (
            SELECT id FROM stores WHERE user_id = auth.uid()
            UNION
            SELECT store_id FROM store_access WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete their store suppliers" ON suppliers
    FOR DELETE USING (
        store_id IN (
            SELECT id FROM stores WHERE user_id = auth.uid()
            UNION
            SELECT store_id FROM store_access WHERE user_id = auth.uid()
        )
    );

-- Add supplier_id to inventory table
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_suppliers_store_id ON suppliers(store_id);
CREATE INDEX IF NOT EXISTS idx_inventory_supplier_id ON inventory(supplier_id);
