const fs = require('fs');
let content = fs.readFileSync('src/components/Layout.tsx', 'utf8');

// Replace Header title
content = content.replace(
  '<h1 className="text-xl font-bold text-foreground">{executiveMode ? "Zuri Executive" : branchName || store?.store_name || \'Business\'}</h1>',
  '<h1 className="text-xl font-bold text-foreground">{executiveMode ? (userRole === "accountant" ? "Finance Space" : "Zuri Executive") : branchName || store?.store_name || \'Business\'}</h1>'
);
content = content.replace(
  '<p className="text-xs text-muted-foreground">{executiveMode ? "Portfolio control room" : branchName ? "Branch POS" : "Powered by Zuri POS"}</p>',
  '<p className="text-xs text-muted-foreground">{executiveMode ? (userRole === "accountant" ? "Finance control room" : "Portfolio control room") : branchName ? "Branch POS" : "Powered by Zuri POS"}</p>'
);

// Wrap branch items in {!executiveMode && ... }
const syncButtonStart = content.indexOf('{/* Sync Button */}');
const notificationCenterStart = content.indexOf('<NotificationCenter onPageChange={onPageChange} currentStoreId={currentStoreId} />');

if (syncButtonStart !== -1 && notificationCenterStart !== -1) {
  const before = content.substring(0, syncButtonStart);
  const toWrap = content.substring(syncButtonStart, notificationCenterStart);
  const after = content.substring(notificationCenterStart);

  content = before + '{!executiveMode && (\n<>\n' + toWrap + '\n</>\n)}\n' + after;
  
  fs.writeFileSync('src/components/Layout.tsx', content);
  console.log('Successfully updated Layout.tsx');
} else {
  console.log('Could not find markers');
}
