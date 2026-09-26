const fs = require('fs');
let content = fs.readFileSync('src/components/CashManagement.tsx', 'utf8');

// Update props interface
content = content.replace(
  'interface CashManagementProps {\n  availableCash: number;\n  onUpdateCash: (amount: number) => void;\n  onClose: () => void;\n}',
  'interface CashManagementProps {\n  availableCash: number;\n  storeId?: string;\n  onUpdateCash: (amount: number) => void;\n  onClose: () => void;\n}'
);

// Update component signature
content = content.replace(
  'const CashManagement = ({ availableCash, onUpdateCash, onClose }: CashManagementProps) => {',
  'const CashManagement = ({ availableCash, storeId, onUpdateCash, onClose }: CashManagementProps) => {'
);

// Update store fetch logic
content = content.replace(
        const { data: stores } = await supabase
        .from("stores")
        .select("id")
        .eq("user_id", user.id)
        .limit(1);

      if (!stores?.[0]) return;

      const { data, error } = await supabase
        .from("cash_transactions")
        .select("*")
        .eq("store_id", stores[0].id),
        const targetStoreId = storeId || (await supabase.from("stores").select("id").eq("user_id", user.id).limit(1)).data?.[0]?.id;
      if (!targetStoreId) return;

      const { data, error } = await supabase
        .from("cash_transactions")
        .select("*")
        .eq("store_id", targetStoreId)
);

// Update save logic
content = content.replace(
          .from("stores")
        .select("id")
        .eq("user_id", user.id)
        .limit(1);

      if (!stores?.[0]) {,
          .from("stores")
        .select("id")
        .eq("user_id", user.id)
        .limit(1);
      const targetStoreId = storeId || stores?.[0]?.id;
      if (!targetStoreId) {
);

content = content.replace(
          .insert({
          store_id: stores[0].id,,
          .insert({
          store_id: targetStoreId,
);

fs.writeFileSync('src/components/CashManagement.tsx', content);
console.log('CashManagement.tsx updated');
