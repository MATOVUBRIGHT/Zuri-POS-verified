const fs = require('fs');
let data = fs.readFileSync('src/pages/Index.tsx', 'utf8');

// 1. Add import for ExecutiveLayout
if (!data.includes('import ExecutiveLayout from "@/components/ExecutiveLayout";')) {
  data = data.replace(
    'import ExecutiveWorkspace from "@/components/ExecutiveWorkspace";',
    'import ExecutiveWorkspace from "@/components/ExecutiveWorkspace";\nimport ExecutiveLayout from "@/components/ExecutiveLayout";'
  );
}

// 2. Modify the return to use ExecutiveLayout if isExecutiveRoot
const searchString = `  return (
    <Layout
      currentPage={isExecutiveRoot ? executivePage : effectivePage}`;
      
const replacementString = `  if (isExecutiveRoot) {
    return (
      <ExecutiveLayout
        currentPage={executivePage}
        onPageChange={(page) => {
          if (!executivePages.has(page)) {
            setCurrentPage("boss-dashboard");
            setPageParams(null);
            return;
          }
          handlePageChange(page);
        }}
        userRole={userRole}
      >
        {renderPage()}
      </ExecutiveLayout>
    );
  }

  return (
    <Layout
      currentPage={effectivePage}`;

if (data.includes(searchString)) {
  data = data.replace(searchString, replacementString);
} else {
  console.log("Could not find the Layout return block in Index.tsx!");
}

// 3. Remove `executiveMode={isExecutiveRoot}` from Layout properties
data = data.replace(/executiveMode=\{isExecutiveRoot\}\s*/, '');

fs.writeFileSync('src/pages/Index.tsx', data);
console.log("Done patching Index.tsx");
