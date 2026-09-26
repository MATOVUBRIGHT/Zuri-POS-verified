const fs = require('fs');
let c = fs.readFileSync('src/components/SalesEntry.tsx', 'utf8');

const regex = /const \{ data: stores \} = await supabase\.from\("stores"\)\.select\("id"\)\.eq\("user_id", (.*?)\)\.limit\(1\);/g;

c = c.replace(regex, (match, userIdStr) => {
  return 'const targetStoreId = currentStoreId || (await supabase.from("stores").select("id").eq("user_id", ' + userIdStr + ').limit(1)).data?.[0]?.id;';
});

c = c.replace(/store_id: stores\[0\]\.id/g, 'store_id: targetStoreId');
c = c.replace(/store_id: stores\?\.\[0\]\?\.id/g, 'store_id: targetStoreId');
c = c.replace(/stores\[0\]\.id/g, 'targetStoreId');
c = c.replace(/stores\?\.\[0\]\?\.id/g, 'targetStoreId');

fs.writeFileSync('src/components/SalesEntry.tsx', c);
console.log('SalesEntry patched');
