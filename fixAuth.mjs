import fs from 'fs';
const file = 'c:/Users/dell/Desktop/POS/silo-sachet-sense/src/pages/Auth.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/(?<!\/\/\s*)setLoading\(true\);(?!\s*setTimeout)/g, 'setLoading(true);\n    setTimeout(() => setLoading(false), 1000);');
content = content.replace(/\s*fetchPriority="high"/i, '');

fs.writeFileSync(file, content, 'utf8');
console.log('Fixed Auth.tsx properly');
