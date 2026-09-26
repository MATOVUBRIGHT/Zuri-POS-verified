import fs from 'fs';
import path from 'path';

function traverse(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      traverse(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      
      // Strip artificial spinners
      const regex1 = /[ \t]*setTimeout\(\(\) => (setLoading|setIsLoading|setIsLoadingHistory|setIsSyncing)\(false\), \d+\);[\r\n]*/g;
      
      let changed = false;
      if (regex1.test(content)) {
        content = content.replace(regex1, '');
        changed = true;
      }
      
      // Specific ShiftProvider change
      if (fullPath.includes('ShiftProvider.tsx')) {
        const replaceUser = `const { data: { user } } = await supabase.auth.getUser();`;
        const sessionUser = `const { data: { session } } = await supabase.auth.getSession();\n      const user = session?.user || null;`;
        if (content.includes(replaceUser)) {
          content = content.replace(replaceUser, sessionUser);
          changed = true;
        }
      }

      if (changed) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`Updated ${fullPath}`);
      }
    }
  }
}

traverse('c:/Users/dell/Desktop/POS/silo-sachet-sense/src');
console.log('Done stripping artificial spinners.');
