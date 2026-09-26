const fs = require('fs');

function patchFile(file, regexStr, componentName) {
  let c = fs.readFileSync(file, 'utf8');
  
  // 1. Add currentStoreId to props (or create Props interface)
  if (!c.includes(\interface \Props\)) {
    c = c.replace(\const \ = () => {\, \interface \Props { currentStoreId?: string | null; }\nconst \ = ({ currentStoreId }: \Props) => {\);
  } else {
    // If it has props but missing currentStoreId
    if (!c.includes('currentStoreId?: string | null')) {
       c = c.replace(\interface \Props {\, \interface \Props {\n  currentStoreId?: string | null;\);
       c = c.replace(new RegExp(\const \ = \\\\(\\\\{ (.*?) \\\\}: \Props\\\\) => \\\\{\), \const \ = ({ currentStoreId,  }: \Props) => {\);
    }
  }

  // 2. Fix the getStoreId or direct calls
  if (componentName === 'Customers') {
    c = c.replace(/const \{ data: stores \} = await supabase\.from\("stores"\)\.select\("id"\)\.eq\("user_id", user\.id\)\.limit\(1\);/, 
    \const targetStoreId = currentStoreId || (await supabase.from("stores").select("id").eq("user_id", user.id).limit(1)).data?.[0]?.id;
    return { storeId: targetStoreId, userId: user.id };\);
    // Remove the access check because it's replaced by targetStoreId
    c = c.replace(/const \{ data: access \} = await supabase\.from\("store_access"\)\.select\("store_id"\)\.eq\("user_id", user\.id\)\.limit\(1\);\n\s*return \{ storeId: stores\?\.\[0\]\?\.id \|\| access\?\.\[0\]\?\.store_id, userId: user\.id \};/, '');
  }

  fs.writeFileSync(file, c);
  console.log(file + ' patched');
}

patchFile('src/components/Customers.tsx', '', 'Customers');
