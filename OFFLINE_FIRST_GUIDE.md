# Offline-First POS Guide

Your Zuri POS Desktop App is now a **fully offline-first** application. It works 100% without internet for core operations.

## Architecture

```
UI (React)
    ↓
Service Layer (IPC → Main Process)
    ↓
SQLite (Primary Source of Truth)
    ↓
Sync Engine (optional → Supabase when online)
```

## Features

### 1. Local Database (SQLite)

- **Location**: `zuripos.db` in app data folder (dev: project root)
- **Tables**: `inventory`, `sales`, `users`, `sync_queue`, `sessions`, `stores`, etc.
- **Indexes**: `barcode`, `product_name` for fast lookups

### 2. Offline Authentication

- **Default login**: `admin` / `admin123` (change after first login)
- Session stored in SQLite (`sessions` table) + localStorage
- Auto-restore on app startup
- No network required after first login

### 3. Data Services

| Service      | Location                | Methods                                      |
|-------------|-------------------------|----------------------------------------------|
| productService | `services/productService.ts` | getAll, getByBarcode, search, add, updateStock |
| salesService   | `services/salesService.ts`   | getAll, create, getUnsynced, markSynced       |
| userService    | `services/userService.ts`    | validate, create, createSession, validateSession |
| syncService    | `services/syncService.ts`    | enqueue, getPending, markSynced               |

### 4. Background Sync

- When **online**: pushes unsynced sales to Supabase every 30 seconds
- Does not block UI
- Sync status: Green = Online, Red = Offline

### 5. Example Queries (via IPC)

**Add product:**
```ts
await window.api.productAdd({ name: 'Widget', price: 10, stock: 100 }, storeId)
```

**Search by barcode:**
```ts
const product = await window.api.productGetByBarcode('1234567890', storeId)
```

**Create sale:**
```ts
await window.api.salesCreate({
  items: [{ product_id: 'x', product_name: 'Widget', quantity: 2, price: 10 }],
  total: 20
}, storeId)
```

**Mark synced:**
```ts
await window.api.salesMarkSynced(saleId)
```

### 6. React Hooks

```ts
import { useOfflineProducts, useOfflineSales, useCreateOfflineSale } from '@/hooks/useOfflineData'
```

### 7. Security

- Passwords hashed with PBKDF2-SHA512 (100k iterations)
- API keys not exposed in frontend (Supabase used only for optional sync)
- DB access via IPC only (main process)

## First Run

1. Start the app
2. Go to **Auth** → **Offline** tab
3. Login: `admin` / `admin123`
4. Create products, make sales — all saved locally
5. When online, sales sync to Supabase automatically

## Creating New Users

Use the `auth:createUser` IPC handler (e.g. from an admin settings page):

```ts
await window.api.authCreateUser('cashier1', 'securePassword', { role: 'staff', store_id: storeId })
```

## Printing

Label/barcode printing works offline via the existing printer IPC. No cloud dependency.
