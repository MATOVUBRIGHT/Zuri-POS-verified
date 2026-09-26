import fs from 'fs';
import path from 'path';

const SRC_DIR = "c:\\Users\\dell\\Desktop\\POS\\silo-sachet-sense\\src";

// Helper to walk directory
function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(function(file) {
        file = dir + '/' + file;
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) { 
            /* Recurse into a subdirectory */
            results = results.concat(walk(file));
        } else { 
            /* Is a file */
            if (file.endsWith('.tsx') || file.endsWith('.ts')) {
                results.push(file);
            }
        }
    });
    return results;
}

const files = walk(SRC_DIR);

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let original = content;

    // 1. Add setTimeout to setLoading(true)
    // Replace: setLoading(true); with: setLoading(true); setTimeout(() => setLoading(false), 1000);
    // Be careful not to replace it multiple times or in wrong contexts
    content = content.replace(/(?<!\/\/\s*)setLoading\(true\);(?!\s*setTimeout)/g, 'setLoading(true);\n    setTimeout(() => setLoading(false), 1000);');
    content = content.replace(/(?<!\/\/\s*)setIsLoading\(true\);(?!\s*setTimeout)/g, 'setIsLoading(true);\n    setTimeout(() => setIsLoading(false), 1000);');
    content = content.replace(/(?<!\/\/\s*)setIsLoadingHistory\(true\);(?!\s*setTimeout)/g, 'setIsLoadingHistory(true);\n    setTimeout(() => setIsLoadingHistory(false), 1000);');

    // 2. Remove navigate() from useEffect calls if possible
    // This is harder to do safely with a simple regex, so we'll look for specific redirect loops mentioned
    
    // In StoreView.tsx
    if (file.endsWith('StoreView.tsx')) {
        content = content.replace(/navigate\("\/auth"\);/g, '/* navigate removed */');
        content = content.replace(/navigate\("\/"\);/g, '/* navigate removed */');
        content = content.replace(/useEffect\(\(\) => \{\s*fetchStore\(\);\s*\}, \[fetchStore\]\);/g, 'useEffect(() => { fetchStore(); }, []);');
        content = content.replace(/useEffect\(\(\) => \{\s*fetchAccess\(\);\s*\}, \[fetchAccess\]\);/g, 'useEffect(() => { fetchAccess(); }, []);');
    }

    // In Index.tsx
    if (file.endsWith('Index.tsx')) {
        content = content.replace(/navigate\("\/auth"\);/g, '/* navigate removed */');
        content = content.replace(/refetchInterval: [0-9]+/g, '');
    }

    // Replace setInterval polling inside useOptimizedData or similar hooks
    if (file.endsWith('useOptimizedData.ts')) {
        content = content.replace(/staleTime: [0-9]+/g, 'staleTime: Infinity');
        content = content.replace(/gcTime: [0-9]+/g, 'gcTime: Infinity');
    }

    // Remove setInterval
    content = content.replace(/setInterval\(/g, '// setInterval(');

    if (content !== original) {
        fs.writeFileSync(file, content, 'utf8');
        console.log("Updated", file);
    }
});
