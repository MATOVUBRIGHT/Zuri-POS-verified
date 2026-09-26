import { ipcMain } from 'electron'

export function setupPrinterIpc() {
  ipcMain.removeHandler('printer:printLabel')
  ipcMain.handle('printer:printLabel', async (_: any, data: any) => {
    try {
      console.log('Sending raw data to printer:', data)
      
      // For Windows, we can use 'node-printer' or shell commands for raw printing
      // Example of sending raw ESC/POS or ZPL commands to a USB printer
      
      /* 
      const printer = require('node-printer');
      const printerName = 'LabelPrinter'; // Get this from settings
      
      const rawData = `
        ^XA
        ^FO50,50^A0N,50,50^FD${data.productName}^FS
        ^FO50,120^B3N,N,100,Y,N^FD${data.barcode}^FS
        ^XZ
      `;
      
      printer.printDirect({
        data: rawData,
        printer: printerName,
        type: 'RAW',
        success: (jobID) => {
          console.log("Sent to printer with ID: " + jobID);
        },
        error: (err) => {
          console.log(err);
        }
      });
      */

      return { success: true }
    } catch (error) {
      console.error('Printing failed:', error)
      return { success: false, error }
    }
  })
}
