import fs from 'fs';
const file = 'c:/Users/dell/Desktop/POS/silo-sachet-sense/src/pages/Index.tsx';
let content = fs.readFileSync(file, 'utf8');

const regex = /switch \(\w+\) \{\s*case "dashboard":[\s\S]*?default:\s*return \([\s\S]*?<\/[^>]+>\s*\);\s*\}\s*;/;

// Build the persistent tab structure
const persistentRender = `
    const isPage = (page: string) => currentPage === page ? 'block' : 'hidden';
    
    return (
      <div className="w-full h-full relative">
        <div className={isPage("dashboard")}>
          {<Dashboard
            stockData={stockData}
            salesData={salesData}
            expensesData={expensesData}
            financialData={financialData}
            onUpdateCash={handleUpdateCash}
            onUpdateSale={handleUpdateSale}
            onDeleteSale={handleDeleteSale}
            onPageChange={handlePageChange}
            onOpenCashManagement={() => setShowCashPopup(true)}
          />}
        </div>
        <div className={isPage("stores")}>
          <Stores currentStoreId={currentStoreId} onStoreChange={setCurrentStoreId} />
        </div>
        <div className={isPage("products")}>
          <Products stockData={stockData} onUpdateStock={(updated) => setStockData(stockData.map(s => s.id === updated.id ? updated : s))} />
        </div>
        <div className={isPage("suppliers")}>
          <Suppliers />
        </div>
        <div className={isPage("stock-entry")}>
          <StockEntry />
        </div>
        <div className={isPage("sales-entry")}>
          <SalesEntry stockData={stockData} onAddSale={handleAddSale} currentStoreId={currentStoreId} />
        </div>
        <div className={isPage("inventory")}>
          <InventoryManagement
            stockData={stockData}
            setStockData={setStockData}
            categories={categories}
          />
        </div>
        <div className={isPage("barcode-manager")}>
          <BarcodeManager stockData={stockData} />
        </div>
        <div className={isPage("reports")}>
          <Reports stockData={stockData} salesData={salesData} expensesData={expensesData} currentStoreId={currentStoreId || undefined} />
        </div>
        <div className={isPage("expenses")}>
          <Expenses expensesData={expensesData} onAddExpense={handleAddExpense} onDeleteExpense={handleDeleteExpense} />
        </div>
        <div className={isPage("customers")}>
          <Customers />
        </div>
        <div className={isPage("shifts")}>
          <Shifts onUpdateCash={handleUpdateCash} onRefresh={refreshData} onStaffLogin={handleStaffLogin} onStaffLogout={handleStaffLogout} />
        </div>
        <div className={isPage("staff")}>
          <StaffManagement />
        </div>
        <div className={isPage("security")}>
          <AuditLogs />
        </div>
        <div className={isPage("settings")}>
          <Settings stockData={stockData} salesData={salesData} expensesData={expensesData} currentStoreId={currentStoreId} onDataImport={handleDataImport} />
        </div>
      </div>
    );
`;

content = content.replace(/switch\s*\(\w+\)\s*\{[\s\S]*?default:\s*return\s*\([\s\S]*?<\/[a-zA-Z0-9_]+>\s*\);\s*\}/, persistentRender);

fs.writeFileSync(file, content, 'utf8');
console.log('Done mapping components to keep alive');
