const fs = require('fs');
let c = fs.readFileSync('src/components/Layout.tsx', 'utf8');

const regex = /const executiveNavigationItems = \[[\s\S]*?\];/;
const accountantItems = `
  const accountantNavigationItems = [
    { id: "accountant-dashboard", label: "Finance Overview", icon: HandCoins },
    { id: "executive-reports", label: "Reports", icon: FileText },
    { id: "executive-accounts", label: "Accounts", icon: Landmark },
    { id: "tracker", label: "Tracker", icon: FileText }
  ];
`;

c = c.replace(regex, match => match + accountantItems);

const filteredRegex = /const filteredNavItems = executiveMode \? executiveNavigationItems : navigationItems\.filter\(item => \{/;
c = c.replace(filteredRegex, 'const filteredNavItems = userRole === "accountant" && executiveMode ? accountantNavigationItems : executiveMode ? executiveNavigationItems : navigationItems.filter(item => {');

fs.writeFileSync('src/components/Layout.tsx', c);
console.log('Layout patched for accountant');
