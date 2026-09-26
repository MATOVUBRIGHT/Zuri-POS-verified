const fs = require('fs');
let c = fs.readFileSync('src/components/SalesEntry.tsx', 'utf8');

c = c.replace(/const \{ data: stores \} = await supabase\s*\n\s*\.from\('stores'\)\s*\n\s*\.select\('id'\)\s*\n\s*\.eq\('user_id', user\.id\)\s*\n\s*\.limit\(1\);/g, 'const targetStoreId = currentStoreId || (await supabase.from(\'stores\').select(\'id\').eq(\'user_id\', user.id).limit(1)).data?.[0]?.id;');

c = c.replace(/const \{ data: stores \} = await supabase\s*\n\s*\.from\("stores"\)\s*\n\s*\.select\("id"\)\s*\n\s*\.eq\("user_id", user\.id\)\s*\n\s*\.limit\(1\);/g, 'const targetStoreId = currentStoreId || (await supabase.from("stores").select("id").eq("user_id", user.id).limit(1)).data?.[0]?.id;');

fs.writeFileSync('src/components/SalesEntry.tsx', c);
console.log('Fixed');
