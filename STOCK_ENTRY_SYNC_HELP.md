# Stock Entry Sync - Troubleshooting Guide

## The Problem
Stock entries appear to submit successfully but aren't showing up in the system. This happens when:
1. **Sync fails silently** - The sync queue encounters an error and stops
2. **Offline mode** - Items are queued but not syncing
3. **Permission issues** - Supabase doesn't allow the insert
4. **Duplicate barcode** - Barcode constraint violation blocks the entire batch

## Solutions

### Quick Diagnostic (Open Browser Console - F12)

```javascript
// Check sync queue status
window.checkSyncQueue()

// Expected output:
{
  queueLength: 0,      // Number of pending items
  isSyncing: false,    // Is sync running?
  lastError: null,     // Last error message
  isOnline: true       // Network status
}
```

### Solution 1: Manual Sync Retry
If queue length > 0, try manual sync:
```javascript
await window.dataSyncService.attemptSync()
```
Watch the console for:
- ✅ Green messages = Success
- ❌ Red messages = Failures with details

### Solution 2: Check for Errors in Console

**Look for messages like:**
```
❌ FAILED PERMANENTLY - insert inventory:
error: "Duplicate string value violates unique constraint"
```

**Common Errors:**
1. **"barcode" Unique Constraint** → Barcode already exists
   - Solution: Use different barcode or edit existing product
   
2. **"Not Found" Error** → Store or user not found
   - Solution: Refresh page, check you're logged in

3. **Network Timeout** → Connection issues
   - Solution: Check internet, retry sync when online

### Solution 3: Check Network Status

```javascript
// In console:
navigator.onLine  // true = online, false = offline

// If offline (false):
// 1. Check WiFi/Network connection
// 2. Wait for online indicator to disappear (bottom-left)
// 3. Manually retry sync: window.dataSyncService.attemptSync()
```

### Solution 4: Data Entry Checklist

Before submitting stock, verify:
- ✅ **Barcode** - Not used before (unique per store)
- ✅ **Product Name** - Not empty
- ✅ **Quantity** - Greater than 0
- ✅ **Cost Per Unit** - Positive number
- ✅ **Store Selected** - Active shift exists
- ✅ **Cash Available** - If paying cash

### Solution 5: Force Refresh Data

```javascript
// Clear React Query cache and refetch
await window.queryClient.refetchQueries()

// Or in StockEntry page - click "Refresh" button
```

### Solution 6: Clear Stuck Sync Queue (Last Resort)

⚠️ **Only do this if sync keeps failing with same items:**

```javascript
// In browser console:
// WARNING: This will discard unsync'd items!
localStorage.removeItem('sync-queue')
location.reload()
```

## What Changed

### Improvements Made:
1. ✅ **Retry Logic** - Failed items retry 3 times with exponential backoff
2. ✅ **Better Errors** - Console shows details of what failed
3. ✅ **Dont Stop** - Sync continues even if one item fails
4. ✅ **Debug Tools** - Manual sync and queue checking in console
5. ✅ **Better UI Feedback** - Shows "queued" vs "synced" status

### Key Files Modified:
- **data-sync.ts** - Retry logic, fallback handling, error logging
- **StockEntry.tsx** - Better error messages to user
- **sync-status.ts** - Debug tools for console
- **App.tsx** - Auto-enable sync debug on load

## Debug Workflow

1. **Submit stock batch**
   ```
   "✅ Stock Batch Queued" - Items added
   "📡 Syncing to Server..." - Syncing started
   ```

2. **Check console (F12 → Console tab)**
   ```
   Look for sync output:
   - ✅ Sync complete: 5 succeeded, 0 failed
   - OR shows which items failed
   ```

3. **If items failed:**
   ```javascript
   // See full error
   window.checkSyncQueue()
   
   // Retry
   await window.dataSyncService.attemptSync()
   ```

4. **Verify in Inventory:**
   - Go to Inventory page
   - Should see new items if sync succeeded
   - If not, see "Debug Workflow" step 3

## Still Broken?

**Send error details from console:**
1. Open F12 → Console tab
2. Take screenshot of any red error messages
3. Run: `JSON.stringify(await window.checkSyncQueue(), null, 2)`
4. Copy the output and provide to support

**Include:**
- Error message from console
- Queue status
- Network status (`navigator.onLine`)
- Product details you tried to enter
