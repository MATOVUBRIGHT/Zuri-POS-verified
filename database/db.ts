import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  
  const isDev = !app.isPackaged
  const dbPath = isDev 
    ? path.join(app.getAppPath(), 'zuripos.db') 
    : path.join(app.getPath('userData'), 'zuripos.db')

  if (!fs.existsSync(path.dirname(dbPath))) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  }

  db = new Database(dbPath)
  db!.pragma('journal_mode = WAL')
  return db!;
}

export function initDb() {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS inventory (
      id TEXT PRIMARY KEY,
      barcode TEXT UNIQUE,
      category TEXT,
      cost_per_unit REAL DEFAULT 0,
      date_of_purchase DATETIME DEFAULT CURRENT_TIMESTAMP,
      items_per_sachet INTEGER DEFAULT 1,
      loose_items INTEGER DEFAULT 0,
      min_stock_level INTEGER DEFAULT 5,
      notes TEXT,
      opened_sachets INTEGER DEFAULT 0,
      packaging_type TEXT,
      product_name TEXT NOT NULL,
      quantity INTEGER DEFAULT 0,
      reorder_quantity INTEGER DEFAULT 10,
      retail_price REAL DEFAULT 0,
      sachets_count INTEGER DEFAULT 0,
      size TEXT,
      store_id TEXT,
      unit_name TEXT,
      wholesale_price REAL DEFAULT 0,
      product_image TEXT,
      supplier TEXT,
      barcode_type TEXT,
      barcode_mode TEXT,
      sync_status TEXT DEFAULT 'synced',
      last_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      customer_id TEXT,
      customer_name TEXT,
      date_of_sale DATETIME DEFAULT CURRENT_TIMESTAMP,
      total_amount REAL NOT NULL,
      paid_in_cash BOOLEAN DEFAULT 1,
      products TEXT NOT NULL, -- JSON string
      staff_id TEXT,
      store_id TEXT,
      payment_method_id TEXT,
      payment_details TEXT, -- JSON string
      sync_status TEXT DEFAULT 'synced',
      last_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      category TEXT,
      amount REAL DEFAULT 0,
      payment_method TEXT,
      date_of_expense DATETIME DEFAULT CURRENT_TIMESTAMP,
      receipt_url TEXT,
      notes TEXT,
      store_id TEXT,
      sync_status TEXT DEFAULT 'synced',
      last_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      address TEXT,
      notes TEXT,
      credit_limit REAL DEFAULT 0,
      loyalty_points INTEGER DEFAULT 0,
      total_spent REAL DEFAULT 0,
      unpaid_balance REAL DEFAULT 0,
      store_id TEXT,
      sync_status TEXT DEFAULT 'synced',
      last_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      company TEXT,
      email TEXT,
      phone TEXT,
      address TEXT,
      outstanding_balance REAL DEFAULT 0,
      store_id TEXT,
      sync_status TEXT DEFAULT 'synced',
      last_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS staff (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      employee_id TEXT,
      pin_code TEXT,
      role TEXT,
      status TEXT DEFAULT 'active',
      hourly_rate REAL DEFAULT 0,
      allowed_pages TEXT, -- JSON string
      contact_number TEXT,
      email TEXT,
      pin_hash TEXT,
      total_sales REAL DEFAULT 0,
      sales_count INTEGER DEFAULT 0,
      store_id TEXT,
      sync_status TEXT DEFAULT 'synced',
      last_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      store_id TEXT,
      sync_status TEXT DEFAULT 'synced',
      last_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS shifts (
      id TEXT PRIMARY KEY,
      staff_id TEXT,
      start_time DATETIME NOT NULL,
      end_time DATETIME,
      starting_cash REAL DEFAULT 0,
      ending_cash_expected REAL DEFAULT 0,
      ending_cash_actual REAL DEFAULT 0,
      status TEXT DEFAULT 'open',
      store_id TEXT,
      sync_status TEXT DEFAULT 'synced',
      last_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      table_name TEXT,
      record_id TEXT,
      action TEXT,
      old_data TEXT, -- JSON string
      new_data TEXT, -- JSON string
      staff_id TEXT,
      store_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS barcode_generations (
      id TEXT PRIMARY KEY,
      store_id TEXT,
      user_id TEXT,
      product_id TEXT,
      product_name TEXT,
      barcode_value TEXT,
      barcode_type TEXT,
      quantity_printed INTEGER DEFAULT 0,
      label_size TEXT,
      printer_name TEXT,
      batch_id TEXT,
      is_batch_print BOOLEAN DEFAULT 0,
      print_status TEXT DEFAULT 'pending',
      printed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS printer_configs (
      id TEXT PRIMARY KEY,
      printer_name TEXT NOT NULL,
      printer_type TEXT DEFAULT 'thermal',
      connection_type TEXT DEFAULT 'usb',
      vendor_id TEXT,
      product_id TEXT,
      serial_number TEXT,
      default_label_size TEXT DEFAULT '40x30mm',
      is_default BOOLEAN DEFAULT 0,
      is_active BOOLEAN DEFAULT 1,
      store_id TEXT,
      user_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS stores (
      id TEXT PRIMARY KEY,
      store_name TEXT NOT NULL,
      user_id TEXT,
      address TEXT,
      phone TEXT,
      email TEXT,
      tin_number TEXT,
      last_closing_balance REAL DEFAULT 0,
      sync_status TEXT DEFAULT 'synced',
      last_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS cash_transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      store_id TEXT,
      amount REAL NOT NULL,
      type TEXT, -- deposit, withdrawal, in, out
      description TEXT,
      account_type TEXT,
      sync_status TEXT DEFAULT 'synced',
      last_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Offline-first: local users for offline auth
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      email TEXT,
      display_name TEXT,
      store_id TEXT,
      role TEXT DEFAULT 'staff',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Offline-first: sync queue for background push when online
    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      table_name TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      retry_count INTEGER DEFAULT 0,
      last_error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Offline-first: local session for auto-restore
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- Performance: indexes for fast barcode and product lookup
    CREATE INDEX IF NOT EXISTS idx_inventory_barcode ON inventory(barcode);
    CREATE INDEX IF NOT EXISTS idx_inventory_product_name ON inventory(product_name);
    CREATE INDEX IF NOT EXISTS idx_inventory_store ON inventory(store_id);
    CREATE INDEX IF NOT EXISTS idx_sales_store_date ON sales(store_id, date_of_sale);
    CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
  `)

  // Seed default admin and store if none exist (offline-first bootstrap)
  try {
    const userCount = getDb().prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }
    if (userCount?.c === 0) {
      const { userService } = require('../services/userService')
      const user = userService.create('admin', 'admin123', { role: 'admin', display_name: 'Administrator' })
      const storeCount = getDb().prepare('SELECT COUNT(*) as c FROM stores').get() as { c: number }
      if (storeCount?.c === 0) {
        const { randomUUID } = require('crypto')
        const storeId = randomUUID()
        getDb().prepare(
          'INSERT INTO stores (id, store_name, user_id, sync_status, last_updated_at, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(storeId, 'Default Store', user.id, 'synced', new Date().toISOString(), new Date().toISOString())
        getDb().prepare('UPDATE users SET store_id = ?, updated_at = ? WHERE id = ?').run(storeId, new Date().toISOString(), user.id)
      }
    }
  } catch {
    // Ignore seed errors
  }

  // Robust column verification for existing tables
  const tables = [
    'inventory', 'sales', 'expenses', 'customers', 
    'suppliers', 'staff', 'categories', 'shifts', 
    'stores', 'cash_transactions'
  ];

  tables.forEach(table => {
    try {
      const columns = db.prepare(`PRAGMA table_info(${table})`).all() as any[];
      const columnNames = columns.map(c => c.name);

      if (!columnNames.includes('sync_status')) {
        db.prepare(`ALTER TABLE ${table} ADD COLUMN sync_status TEXT DEFAULT 'synced'`).run();
      }
      if (!columnNames.includes('last_updated_at')) {
        db.prepare(`ALTER TABLE ${table} ADD COLUMN last_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`).run();
      }
      if (!columnNames.includes('created_at')) {
        db.prepare(`ALTER TABLE ${table} ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP`).run();
      }

      // Specific column additions for Staff
      if (table === 'staff') {
        if (!columnNames.includes('pin_code')) {
          db.prepare('ALTER TABLE staff ADD COLUMN pin_code TEXT').run();
        }
        if (!columnNames.includes('pin_hash')) {
          db.prepare('ALTER TABLE staff ADD COLUMN pin_hash TEXT').run();
        }
        if (!columnNames.includes('contact_number')) {
          db.prepare('ALTER TABLE staff ADD COLUMN contact_number TEXT').run();
        }
        if (!columnNames.includes('email')) {
          db.prepare('ALTER TABLE staff ADD COLUMN email TEXT').run();
        }
        if (!columnNames.includes('total_sales')) {
          db.prepare('ALTER TABLE staff ADD COLUMN total_sales REAL DEFAULT 0').run();
        }
        if (!columnNames.includes('sales_count')) {
          db.prepare('ALTER TABLE staff ADD COLUMN sales_count INTEGER DEFAULT 0').run();
        }
      }

      // Specific column additions for Inventory
      if (table === 'inventory') {
        if (!columnNames.includes('product_image')) {
          db.prepare('ALTER TABLE inventory ADD COLUMN product_image TEXT').run();
        }
        if (!columnNames.includes('supplier')) {
          db.prepare('ALTER TABLE inventory ADD COLUMN supplier TEXT').run();
        }
        if (!columnNames.includes('barcode_type')) {
          db.prepare('ALTER TABLE inventory ADD COLUMN barcode_type TEXT').run();
        }
        if (!columnNames.includes('barcode_mode')) {
          db.prepare('ALTER TABLE inventory ADD COLUMN barcode_mode TEXT').run();
        }
      }
    } catch (e) {
      console.warn(`Could not verify columns for table ${table}:`, e);
    }
  });
}

const allowedTables = [
  'inventory', 'sales', 'expenses', 'customers', 
  'suppliers', 'staff', 'categories', 'shifts', 
  'audit_logs', 'stores', 'printer_configs', 
  'barcode_generations', 'cash_transactions',
  'users', 'sync_queue', 'sessions'
];

const columnCache: Record<string, string[]> = {}

function getValidColumns(table: string): string[] {
  if (!allowedTables.includes(table)) {
    throw new Error(`Unauthorized table access: ${table}`);
  }
  if (columnCache[table]) return columnCache[table]
  try {
    const columns = getDb().prepare(`PRAGMA table_info(${table})`).all() as any[]
    columnCache[table] = columns.map(c => c.name)
    return columnCache[table]
  } catch (e) {
    console.error(`Failed to get columns for ${table}`, e)
    return []
  }
}

function filterData(table: string, data: any) {
  const validColumns = getValidColumns(table)
  const filtered: any = {}
  Object.keys(data).forEach(k => {
    if (validColumns.includes(k)) {
      filtered[k] = data[k]
    }
  })
  return filtered
}

export const dbService = {
  getAll: (table: string) => {
    if (!allowedTables.includes(table)) {
      throw new Error(`Unauthorized table: ${table}`)
    }
    try {
      return getDb().prepare(`SELECT * FROM ${table} ORDER BY created_at DESC`).all()
    } catch (error) {
      console.error(`Error fetching all from ${table}:`, error)
      return []
    }
  },
  save: (table: string, data: any) => {
    try {
      const filteredData = filterData(table, data)
      const keys = Object.keys(filteredData)
      if (keys.length === 0) throw new Error(`No valid columns to save for ${table}`)

      const columns = keys.join(', ')
      const placeholders = keys.map(k => `@${k}`).join(', ')
      const updates = keys.map(k => `${k} = excluded.${k}`).join(', ')
      
      const stmt = getDb().prepare(`
        INSERT INTO ${table} (${columns})
        VALUES (${placeholders})
        ON CONFLICT(id) DO UPDATE SET ${updates}
      `)
      return stmt.run(filteredData)
    } catch (error) {
      console.error(`Error saving to ${table}:`, error)
      throw error
    }
  },
  delete: (table: string, id: string) => {
    try {
      return getDb().prepare(`DELETE FROM ${table} WHERE id = ?`).run(id)
    } catch (error) {
      console.error(`Error deleting from ${table}:`, error)
      throw error
    }
  },
  getProducts: () => {
    return getDb().prepare('SELECT * FROM inventory ORDER BY product_name ASC').all()
  },
  saveProduct: (product: any) => {
    return dbService.save('inventory', product)
  },
  deleteProduct: (id: string) => {
    return dbService.delete('inventory', id)
  },
  getSales: () => {
    return getDb().prepare('SELECT * FROM sales ORDER BY date_of_sale DESC').all()
  },
  saveSale: (sale: any) => {
    const formattedSale = {
      ...sale,
      products: typeof sale.products === 'string' ? sale.products : JSON.stringify(sale.products),
      payment_details: typeof sale.payment_details === 'string' ? sale.payment_details : JSON.stringify(sale.payment_details || (sale as any).paymentDetails)
    }
    delete (formattedSale as any).paymentDetails
    return dbService.save('sales', formattedSale)
  },
  batchInsert: (table: string, items: any[]) => {
    const db = getDb()
    const insert = db.transaction((rows: any[]) => {
      for (const row of rows) {
        const filteredData = filterData(table, row)
        const keys = Object.keys(filteredData)
        if (keys.length === 0) continue

        const columns = keys.join(', ')
        const placeholders = keys.map(k => `@${k}`).join(', ')
        const updates = keys.map(k => `${k} = excluded.${k}`).join(', ')
        
        db.prepare(`
          INSERT INTO ${table} (${columns})
          VALUES (${placeholders})
          ON CONFLICT(id) DO UPDATE SET ${updates}
        `).run(filteredData)
      }
    })
    return insert(items)
  }
}

