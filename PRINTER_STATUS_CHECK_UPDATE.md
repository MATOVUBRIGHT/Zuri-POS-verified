# Printer Status Check & USB Device Fix

## Issues Fixed

### 1. USB Device Transfer Error
**Problem**: "The device must be opened first" error when attempting to print to USB devices.

**Solution**: Enhanced `printToUSB` function in `printerUtils.ts` to check if the device is opened before attempting transfer. If not opened, the function now:
- Opens the device
- Selects configuration
- Claims the interface
- Then performs the transfer

### 2. Check Printer Active Button
**Problem**: No way to verify printer connection status in the preview dialog.

**Solution**: Added a new "Check Printer Active" button in the barcode preview dialog that:
- Verifies USB device is opened and ready
- Checks Bluetooth connection status
- Shows device name and connection state
- Provides clear feedback via toast notifications

## New Features

### Check Printer Status Function
Added `checkPrinterStatus` function in `printerUtils.ts` that returns:
- `active`: Boolean indicating if printer is ready
- `message`: Descriptive status message

Supports both USB and Bluetooth printers with specific checks:
- **USB**: Verifies device is opened and gets product name
- **Bluetooth**: Checks GATT server connection status

### Preview Dialog Enhancement
Added "Check Printer Active" button between Cancel and System Print buttons:
- Shows Wifi icon for visual clarity
- Disabled when no printer is connected
- Displays toast with printer status when clicked
- Green checkmark for active printers
- Red error for connection issues

## Files Modified

1. `silo-sachet-sense/src/lib/printerUtils.ts`
   - Enhanced `printToUSB` with device opening logic
   - Added `checkPrinterStatus` function

2. `silo-sachet-sense/src/components/BarcodeManager.tsx`
   - Imported `checkPrinterStatus` as `checkPrinterActive`
   - Added `handleCheckPrinter` function
   - Added Wifi icon import
   - Added "Check Printer Active" button in preview dialog footer

## Usage

1. Open barcode preview dialog
2. Click "Check Printer Active" button
3. View printer status in toast notification
4. If printer is active, proceed with printing
5. If printer has issues, reconnect or troubleshoot

## Technical Details

- USB device state is checked via `device.opened` property
- Bluetooth connection verified via `server.connected` property
- Function handles errors gracefully with descriptive messages
- Renamed import to avoid conflict with existing local function
