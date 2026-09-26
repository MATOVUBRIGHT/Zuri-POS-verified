# USB Printer Troubleshooting Guide

## Issue: "USB Access Denied" Error

When you see this error:
```
USB Access Denied: The OS or another app is using the printer. 
On Windows, you may need to use Zadig to install the WinUSB driver.
```

**This means:** Windows is blocking the app from directly accessing your USB thermal printer. The printer driver Windows installed is conflicting with the Web USB API used by the POS app.

---

## Solution: Install WinUSB Driver with Zadig

### What is Zadig?
Zadig is a free utility that replaces Windows drivers with WinUSB, allowing apps to communicate directly with USB devices without Windows interference.

### Step-by-Step Fix

#### 1. **Download Zadig**
   - Go to: **https://zadig.akeo.ie/**
   - Download the **portable .exe** (no installation needed)
   - Save it to your Desktop or Documents

#### 2. **Prepare Your Printer**
   - Connect your thermal printer via USB cable
   - Ensure it's powered on and recognized by Windows
   - Close all browser tabs (only keep this POS app open)

#### 3. **Run Zadig**
   - Double-click the Zadig.exe file
   - Click **Options → List All Devices** (if your printer doesn't appear initially)

#### 4. **Select Your Printer**
   - Look for your printer in the dropdown list
   - Common names:
     - "Thermal Printer"
     - "Serial Device"
     - "USB Device"
     - Manufacturer name (e.g., "Epson", "Star Micronics", etc.)
   - If unsure, check your printer's manual or packaging for the model name

#### 5. **Select WinUSB Driver**
   - In the driver dropdown (middle section), select **WinUSB**
   - Ensure it shows the correct driver to replace

#### 6. **Install Driver**
   - Click the large yellow button: **Replace Driver**
   - Wait for completion (may take 30 seconds - 1 minute)
   - You may see a Windows security warning - click **Install** or **Yes**
   - If prompted to restart, do so

#### 7. **Reconnect Printer**
   - Disconnect USB cable from printer
   - Wait 5 seconds
   - Reconnect USB cable
   - Return to the POS app

#### 8. **Connect USB Printer**
   - In BarcodeManager, click the **Connect USB Printer** button (top right)
   - Select your printer from the popup
   - You should see: ✓ Printer Connected

---

## Verification

Once connected, you should see:
- 🟢 **Green status indicator** on the printer button
- Printer name displayed (e.g., "Thermal Printer - USB")
- **Print via USB** button becomes enabled (blue)

### Test Print
1. Click **Print via USB** button
2. You should see: **✓ USB Print Job Sent!**
3. Printer should start printing the test label

---

## Troubleshooting

### Printer Still Not Found?
- **Check connection:** Unplug and replug USB cable
- **Check Windows Device Manager:** 
  - Right-click Start menu → Device Manager
  - Expand "Universal Serial Bus controllers"
  - Look for your printer
  - If it shows ⚠️ yellow warning, driver conflict exists

### Zadig Doesn't Show My Printer?
- **Enable Device Viewing:**
  - In Zadig: Options → List All Devices ✓
  - Try unplugging/replugging printer
  - Restart Zadig

- **Check Vendor ID:**
  - In Device Manager, find your printer
  - Right-click → Properties → Details tab
  - Select "Hardware Ids" from dropdown
  - Note the Vendor ID (e.g., `VID_04B8` for Epson)
  - Use this to identify in Zadig

### Multiple Devices in Zadig?
- Look at the **Vendor ID** column
- Compare with your printer's VID (from Device Manager)
- Select the matching device

### Print Job Sent But Nothing Prints?
1. Check printer is powered on and has paper/labels
2. Check USB cable is secure
3. Verify printer is selected in Zadig (not replaced with wrong driver)
4. Restart both printer and POS app

---

## If You Need to Restore Original Driver

If you want to revert to the original Windows driver:

1. Open Zadig again
2. Find your printer in the dropdown
3. In the driver dropdown, select the **original driver** (not WinUSB)
4. Click **Replace Driver**
5. Restart Windows when prompted

**Warning:** This will prevent the POS app from printing until you reinstall WinUSB.

---

## Common Printer Models

| Model | Typical Name in Zadig |
|-------|----------------------|
| Epson TM-Series | Epson TM- (model) |
| Star Micronics | Star Micronics Printer |
| Sunmi | Sunmi Printer |
| HPRT | HPRT Thermal Printer |
| Zebra | Zebra Printer |
| Brother | Brother Printer |

---

## Still Having Issues?

1. **Check error message in Printer Settings dialog** - note exact text
2. **Restart the POS app** - sometimes browser caches cause issues
3. **Try different USB port** - not all ports may work the same
4. **Update your printer firmware** - check manufacturer's website
5. **Disable USB power saving** (Windows):
   - Device Manager → USB controllers
   - Right-click each hub → Properties
   - Power Management tab
   - Uncheck "Allow computer to turn off this device"

---

## Related Errors

### "SecurityError"
- Same cause as USB Access Denied
- Solution: Follow the Zadig steps above

### "USB device already opened"
- Printer is being used by another app
- Close other apps, browsers, or print managers
- Reload the POS app

### "No USB endpoints found"
- Printer not recognized or wrong driver
- Reinstall WinUSB driver with Zadig

---

## For Support

Include when reporting issues:
- Printer model name
- Windows version (right-click Start → About)
- Error message (exact text)
- Steps you've already tried
