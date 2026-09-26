const fs = require('fs');
let c = fs.readFileSync('src/components/CashManagement.tsx', 'utf8');

c = c.replace(/interface CashManagementProps \{[\s\S]*?\}/, 'interface CashManagementProps {\n  availableCash: number;\n  storeId?: string;\n  onUpdateCash: (amount: number) => void;\n  onClose: () => void;\n}');

c = c.replace(/const CashManagement = \(\{ availableCash, onUpdateCash, onClose \}: CashManagementProps\) => \{/, 'const CashManagement = ({ availableCash, storeId, onUpdateCash, onClose }: CashManagementProps) => {');

// We will use substring replacement because regex with multiline code is failing to match
let idx = c.indexOf('const { data: stores } = await supabase');
if (idx > -1) {
  let endIdx = c.indexOf('.limit(100);', idx);
  if (endIdx > -1) {
    let blockToReplace = c.substring(idx, endIdx);
    let newBlock = `const targetStoreId = storeId || (await supabase.from("stores").select("id").eq("user_id", user.id).limit(1)).data?.[0]?.id;
      if (!targetStoreId) return;

      const { data, error } = await supabase
        .from("cash_transactions")
        .select("*")
        .eq("store_id", targetStoreId)
        .order("created_at", { ascending: false })`;
    c = c.replace(blockToReplace, newBlock);
  }
}

let idx2 = c.indexOf('const { data: stores } = await supabase', idx + 100);
if (idx2 > -1) {
  let endIdx2 = c.indexOf('if (!stores?.[0]) {', idx2);
  if (endIdx2 > -1) {
    let blockToReplace2 = c.substring(idx2, endIdx2 + 'if (!stores?.[0]) {'.length);
    let newBlock2 = `const { data: stores } = await supabase.from("stores").select("id").eq("user_id", user.id).limit(1);
      const targetStoreId = storeId || stores?.[0]?.id;
      if (!targetStoreId) {`;
    c = c.replace(blockToReplace2, newBlock2);
  }
}

c = c.replace(/store_id: stores\[0\]\.id,/g, 'store_id: targetStoreId,');

fs.writeFileSync('src/components/CashManagement.tsx', c);
console.log('CashManagement.tsx patched successfully');
