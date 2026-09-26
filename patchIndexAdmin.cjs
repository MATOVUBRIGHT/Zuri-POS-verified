const fs = require('fs');
let c = fs.readFileSync('src/pages/Index.tsx', 'utf8');

c = c.replace(
  'const isExecutiveUser = resolvedWorkspaceRole === "owner" || resolvedWorkspaceRole === "boss";',
  'const isExecutiveUser = resolvedWorkspaceRole === "owner" || resolvedWorkspaceRole === "boss" || resolvedWorkspaceRole === "admin" || isAdmin;'
);

fs.writeFileSync('src/pages/Index.tsx', c);
console.log('Admin added to executive view');
