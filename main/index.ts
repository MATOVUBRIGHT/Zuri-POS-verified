const { app, shell, BrowserWindow, ipcMain, dialog } = require('electron')
import { join } from 'path'
import { autoUpdater } from 'electron-updater'
import { initDb, dbService } from '../database/db'
import { setupPrinterIpc } from '../printing/printer'
import { productService } from '../services/productService'
import { salesService } from '../services/salesService'
import { userService } from '../services/userService'
import { syncService } from '../services/syncService'
import fs from 'fs'



// Simple logging for diagnosis - safe even if userData isn't ready
function log(msg: string) {
  try {
    const userData = app.getPath('userData')
    const logPath = join(userData, 'zuripos_startup.log')
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`)
    console.log(msg)
  } catch (e) {
    console.log(`[EARLY LOG] ${msg}`)
  }
}

// Global process exception handling
process.on('uncaughtException', (err) => {
  log(`CRITICAL CRASH: ${err.message}`)
  log(err.stack || '')
})

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    title: 'Zuri POS Desktop App',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // Ctrl+R / Cmd+R: reload window if UI is stuck (session persists in localStorage)
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.type !== 'keyDown') return
    if ((input.control || input.meta) && input.key.toLowerCase() === 'r') {
      mainWindow.reload()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details: { url: string }) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Load the remote URL for development or the local html file for production.
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    const localPath = join(__dirname, '../renderer/index.html')
    log(`Loading local renderer: ${localPath}`)
    if (!fs.existsSync(localPath)) {
      dialog.showErrorBox('Startup Error', `Renderer not found at: ${localPath}`)
    }
    mainWindow.loadFile(localPath)
  }
}

function setupAutoUpdater() {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => log('Checking for update...'))

  autoUpdater.on('update-available', (info) => {
    log(`Update available: v${info.version}`)
    BrowserWindow.getAllWindows().forEach(win =>
      win.webContents.send('app:update-available', info)
    )
  })

  autoUpdater.on('update-not-available', (info) => {
    log(`App is up to date: v${info.version}`)
  })

  autoUpdater.on('download-progress', (progress) => {
    log(`Downloading update: ${Math.round(progress.percent)}%`)
    BrowserWindow.getAllWindows().forEach(win =>
      win.webContents.send('app:update-progress', progress)
    )
  })

  autoUpdater.on('update-downloaded', (info) => {
    log(`Update downloaded: v${info.version}`)
    BrowserWindow.getAllWindows().forEach(win =>
      win.webContents.send('app:update-downloaded', info)
    )
    // Ask user to restart via native dialog
    dialog.showMessageBox({
      type: 'info',
      title: 'Update Ready — Zuri POS',
      message: `Version ${info.version} is ready to install.`,
      detail: 'The app will restart to apply the update.',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
      cancelId: 1,
    }).then(result => {
      if (result.response === 0) autoUpdater.quitAndInstall(false, true)
    })
  })

  autoUpdater.on('error', (err) => log(`Auto-updater error: ${err.message}`))

  // Check on startup, then every 4 hours
  autoUpdater.checkForUpdatesAndNotify().catch(err =>
    log(`Initial update check failed: ${err.message}`)
  )
  setInterval(() => {
    autoUpdater.checkForUpdatesAndNotify().catch(err =>
      log(`Periodic update check failed: ${err.message}`)
    )
  }, 4 * 60 * 60 * 1000)
}

function setupIpcHandlers() {

  const allowedTables = [
    'inventory', 'sales', 'expenses', 'customers', 
    'suppliers', 'staff', 'categories', 'shifts', 
    'audit_logs', 'stores', 'printer_configs', 
    'barcode_generations', 'cash_transactions'
  ];

  const validateTable = (table: string) => {
    if (!allowedTables.includes(table)) {
      throw new Error(`Unauthorized table access: ${table}`);
    }
  };

  const handlers = [
    'db:getAll', 'db:save', 'db:delete', 'db:batchInsert', 
    'db:getProducts', 'db:saveProduct', 'db:deleteProduct',
    'db:getSales', 'db:saveSale', 'app:getOfflineStatus',
    'app:close', 'app:install-update', 'app:check-update'
  ];

  handlers.forEach(h => ipcMain.removeHandler(h));

  ipcMain.handle('db:getAll', async (_: any, table: string) => {
    validateTable(table);
    return dbService.getAll(table);
  })

  ipcMain.handle('db:save', async (_: any, { table, data }: any) => {
    validateTable(table);
    return dbService.save(table, data);
  })

  ipcMain.handle('db:delete', async (_: any, { table, id }: any) => {
    validateTable(table);
    return dbService.delete(table, id);
  })

  ipcMain.handle('db:batchInsert', async (_: any, { table, data }: any) => {
    validateTable(table);
    return dbService.batchInsert(table, data);
  })


  ipcMain.handle('db:getProducts', async () => {
    return dbService.getProducts();
  })

  ipcMain.handle('db:saveProduct', async (_: any, product: any) => {
    return dbService.saveProduct(product);
  })

  ipcMain.handle('db:deleteProduct', async (_: any, id: string) => {
    return dbService.deleteProduct(id);
  })

  ipcMain.handle('db:getSales', async () => {
    return dbService.getSales();
  })

  ipcMain.handle('db:saveSale', async (_: any, sale: any) => {
    return dbService.saveSale(sale);
  })

  // ---- Offline-first service layer (SQLite only) ----
  ipcMain.handle('product:getByBarcode', async (_: any, barcode: string, storeId?: string) => {
    return productService.getByBarcode(barcode, storeId);
  })
  ipcMain.handle('product:search', async (_: any, query: string, storeId?: string, limit?: number) => {
    return productService.search(query, storeId, limit);
  })
  ipcMain.handle('product:add', async (_: any, product: any, storeId?: string) => {
    return productService.add(product, storeId);
  })
  ipcMain.handle('product:updateStock', async (_: any, id: string, delta: number) => {
    return productService.updateStock(id, delta);
  })
  ipcMain.handle('product:getAll', async (_: any, storeId?: string) => {
    return productService.getAll(storeId);
  })

  ipcMain.handle('sales:create', async (_: any, sale: any, storeId?: string) => {
    return salesService.create(sale, storeId);
  })
  ipcMain.handle('sales:getUnsynced', async (_: any, storeId?: string) => {
    return salesService.getUnsynced(storeId);
  })
  ipcMain.handle('sales:markSynced', async (_: any, id: string) => {
    return salesService.markSynced(id);
  })
  ipcMain.handle('sales:getAll', async (_: any, storeId?: string) => {
    return salesService.getAll(storeId);
  })

  ipcMain.handle('auth:login', async (_: any, username: string, password: string) => {
    const user = userService.validate(username, password);
    if (!user) return { success: false, user: null, sessionToken: null };
    const sessionToken = userService.createSession(user.id);
    return { success: true, user, sessionToken };
  })
  ipcMain.handle('auth:logout', async (_: any, sessionToken: string) => {
    if (sessionToken) userService.destroySession(sessionToken);
    return { success: true };
  })
  ipcMain.handle('auth:getSession', async (_: any, sessionToken: string) => {
    if (!sessionToken) return { user: null };
    const user = userService.validateSession(sessionToken);
    return { user };
  })
  ipcMain.handle('auth:createUser', async (_: any, username: string, password: string, opts?: any) => {
    const user = userService.create(username, password, opts);
    return { success: true, user };
  })
  ipcMain.handle('auth:listUsers', async (_: any, storeId?: string) => {
    return userService.listUsers(storeId);
  })

  ipcMain.handle('sync:getUnsyncedSales', async (_: any, storeId?: string) => {
    return syncService.getUnsyncedSales(storeId);
  })
  ipcMain.handle('sync:markSaleSynced', async (_: any, saleId: string) => {
    return syncService.markSaleSynced(saleId);
  })
  ipcMain.handle('sync:getPendingCount', async () => {
    return syncService.getPendingCount();
  })

  ipcMain.handle('app:getOfflineStatus', () => false)

  ipcMain.handle('app:close', () => {
    app.quit()
  })

  // Update IPC handlers
  ipcMain.handle('app:install-update', () => {
    autoUpdater.quitAndInstall(false, true)
  })

  ipcMain.handle('app:check-update', async () => {
    if (app.isPackaged) {
      return autoUpdater.checkForUpdatesAndNotify()
    }
  })
}

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.zuripos.app');
  }

  log('App ready handler starting...');

  try {
    log('Initializing Database...');
    initDb()
    log('Database Initialized.');
  } catch (err: any) {
    log(`DATABASE ERROR: ${err?.message || err}`);
    if (err?.stack) log(err.stack);
  }

  try {
    log('Setting up IPC handlers...');
    setupIpcHandlers()
    setupPrinterIpc()
    log('IPC Handlers set up.');
  } catch (err: any) {
    log(`IPC ERROR: ${err?.message || err}`);
  }

  // GitHub Auto-Updates
  if (app.isPackaged) {
    setupAutoUpdater()
  }

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
