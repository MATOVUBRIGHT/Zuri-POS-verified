const fs = require('fs');
let c = fs.readFileSync('src/components/CashManagement.tsx', 'utf8');

c = c.replace(/opening_balance__/g, 'opening_balance_${storeId}_${today}');
c = c.replace(/closing_balance__/g, 'closing_balance_${storeId}_${today}');

fs.writeFileSync('src/components/CashManagement.tsx', c);
console.log('Fixed');
