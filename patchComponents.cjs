const fs = require('fs');

function patchFile(file, componentName) {
  let c = fs.readFileSync(file, 'utf8');
  
  if (!c.includes(`interface ${componentName}Props`)) {
    c = c.replace(`const ${componentName} = () => {`, `interface ${componentName}Props { currentStoreId?: string | null; }\nconst ${componentName} = ({ currentStoreId }: ${componentName}Props) => {`);
  } else {
    if (!c.includes('currentStoreId?: string | null')) {
       c = c.replace(`interface ${componentName}Props {`, `interface ${componentName}Props {\n  currentStoreId?: string | null;`);
       c = c.replace(new RegExp(`const ${componentName} = \\(\\{ (.*?) \\}: ${componentName}Props\\) => \\{`), `const ${componentName} = ({ currentStoreId, $1 }: ${componentName}Props) => {`);
    }
  }

  // Common replacements
  const regex = /const \{ data: stores \} = await supabase\.from\("stores"\)\.select\("id"\)\.eq\("user_id", .*?\)\.limit\(1\);/g;
  
  c = c.replace(regex, (match) => {
    const userIdMatch = match.match(/eq\("user_id", (.*?)\)/);
    const userIdStr = userIdMatch ? userIdMatch[1] : 'user.id';
    return `const targetStoreId = currentStoreId || (await supabase.from("stores").select("id").eq("user_id", ${userIdStr}).limit(1)).data?.[0]?.id;`;
  });

  c = c.replace(/const \{ data: access \} = await supabase\.from\("store_access"\)\.select\("store_id"\)\.eq\("user_id", .*?\)\.limit\(1\);\n\s*return \{ storeId: stores\?\.\[0\]\?\.id \|\| access\?\.\[0\]\?\.store_id, userId: .*? \};/g, 
  `return { storeId: targetStoreId, userId: user.id };`);

  c = c.replace(/store_id: stores\[0\]\.id/g, 'store_id: targetStoreId');
  c = c.replace(/store_id: stores\?\.\[0\]\?\.id/g, 'store_id: targetStoreId');

  fs.writeFileSync(file, c);
  console.log(file + ' patched');
}

patchFile('src/components/Customers.tsx', 'Customers');
patchFile('src/components/Expenses.tsx', 'Expenses');
patchFile('src/components/Products.tsx', 'Products');
patchFile('src/components/ScheduledPayments.tsx', 'ScheduledPayments');
patchFile('src/components/StaffManagement.tsx', 'StaffManagement');
patchFile('src/components/Suppliers.tsx', 'Suppliers');

console.log('All done');
