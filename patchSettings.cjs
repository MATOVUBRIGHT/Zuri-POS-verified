const fs = require('fs');
let c = fs.readFileSync('src/components/Settings.tsx', 'utf8');

c = c.replace(/const \[activeTab, setActiveTab\] = useState\("account"\);/, 'const [activeTab, setActiveTab] = useState(executive ? "account" : "business");');

c = c.replace(/<TabsTrigger value="account">Account<\/TabsTrigger>/, '{executive && <TabsTrigger value="account">Account</TabsTrigger>}');

c = c.replace(/\{\/\* Account Settings \*\/\}\n\s*<TabsContent value="account" className="space-y-6">/, '{executive && (\n        <TabsContent value="account" className="space-y-6">');

let idx = c.indexOf('{executive && (\n        <TabsContent value="account" className="space-y-6">');
if (idx > -1) {
  let nextTabIdx = c.indexOf('{/* Business Settings */}');
  let beforeNextTab = c.substring(0, nextTabIdx);
  c = beforeNextTab + ')}\n\n        ' + c.substring(nextTabIdx);
}

fs.writeFileSync('src/components/Settings.tsx', c);
console.log('Settings updated successfully');
