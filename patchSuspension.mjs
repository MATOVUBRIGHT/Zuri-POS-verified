import fs from 'fs';

// Fix AdminDashboard.tsx
const dashFile = 'c:/Users/dell/Desktop/POS/silo-sachet-sense/src/components/AdminDashboard.tsx';
let dash = fs.readFileSync(dashFile, 'utf8');

// Replace the fetch block that queries user_access_suspension
dash = dash.replace(
  /\/\/ Fetch active suspensions[\s\S]*?\/\/ Silent catch for table-not-found\s*\}\s*\}/,
  `// user_access_suspension table does not exist \u2014 skip network call\n      let suspensionData: any[] = [];`
);

// Replace insert in handleSuspendUser
dash = dash.replace(
  /\/\/ Create suspension record[\s\S]*?\.insert\(\{[\s\S]*?is_active: true\s*\}\);?\s*\}\s*catch[^}]*\}/,
  `// user_access_suspension table does not exist \u2014 skip insert`
);

// Replace update in handleReactivateUser
dash = dash.replace(
  /\/\/ Deactivate suspension[\s\S]*?\.eq\('is_active', true\);?\s*\}\s*catch[^}]*\}/,
  `// user_access_suspension table does not exist \u2014 skip update`
);

fs.writeFileSync(dashFile, dash, 'utf8');
console.log('AdminDashboard patched');

// Fix AdminVerification.tsx
const verFile = 'c:/Users/dell/Desktop/POS/silo-sachet-sense/src/pages/AdminVerification.tsx';
let ver = fs.readFileSync(verFile, 'utf8');

ver = ver.replace(
  /\/\/ If suspended, also create a suspension row[\s\S]*?\.insert\(\{[\s\S]*?is_active: true,[\s\S]*?\}\);\s*\}\s*catch[^}]*\}/,
  `// user_access_suspension table does not exist \u2014 skip insert`
);

fs.writeFileSync(verFile, ver, 'utf8');
console.log('AdminVerification patched');
