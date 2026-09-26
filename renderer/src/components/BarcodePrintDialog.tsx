import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Printer, QrCode, Tag, Loader2, X, Check, AlertCircle, Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import JsBarcode from "jsbarcode";
import { StockItem } from "@/types";
import { BarcodeType, LabelSize, BarcodeMode } from "@/types/barcode";
import { getLabelDimensions } from "@/lib/barcode";
import LabelPreview, { type PrintItem } from "@/components/LabelPreview";

interface BarcodePrintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: StockItem | null;
  stockData?: StockItem[];
  onPrintComplete?: () => void;
}

const BARCODE_TYPES: { value: BarcodeType; label: string }[] = [
  { value: 'CODE128', label: 'CODE128 (Recommended)' },
  { value: 'EAN13', label: 'EAN-13' },
  { value: 'EAN8', label: 'EAN-8' },
  { value: 'UPC', label: 'UPC-A' },
  { value: 'CODE39', label: 'CODE39' },
  { value: 'ITF14', label: 'ITF-14' },
];

const LABEL_SIZES: { value: LabelSize; label: string }[] = [
  { value: '30x20mm', label: '30 x 20 mm (Small - Barcode Only)' },
  { value: '40x25mm', label: '40 x 25 mm' },
  { value: '50x25mm', label: '50 x 25 mm (Standard)' },
  { value: '50x30mm', label: '50 x 30 mm' },
  { value: '60x40mm', label: '60 x 40 mm (Large)' },
  { value: '70x50mm', label: '70 x 50 mm (Extra Large)' },
  { value: '100x50mm', label: '100 x 50 mm (Wide)' },
];

export default function BarcodePrintDialog({
  open,
  onOpenChange,
  product,
  stockData = [],
  onPrintComplete
}: BarcodePrintDialogProps) {
  const { toast } = useToast();
  const barcodeRef = useRef<SVGSVGElement>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [labelSize, setLabelSize] = useState<LabelSize>('50x30mm');
  const [quantity, setQuantity] = useState(1);
  const [includePrice, setIncludePrice] = useState(true);
  const [includeProductName, setIncludeProductName] = useState(true);
  const [includeSKU, setIncludeSKU] = useState(true);
  const [columnsPerPage, setColumnsPerPage] = useState(1);
  const [selectedPrinter, setSelectedPrinter] = useState<string>('');
  const [printStatus, setPrintStatus] = useState<'idle' | 'printing' | 'success' | 'error'>('idle');
  const [availablePrinters, setAvailablePrinters] = useState<string[]>([]);
  const [labelSizeType, setLabelSizeType] = useState<'58mm' | '80mm' | 'custom'>('58mm');
  const [customWidth, setCustomWidth] = useState(58);
  const [customHeight, setCustomHeight] = useState(60);
  const [previewScale, setPreviewScale] = useState(100);
  
  // Multi-item support
  const [printItems, setPrintItems] = useState<PrintItem[]>([]);
  const [selectedProductForQueue, setSelectedProductForQueue] = useState<string>('');
  const [quantityForQueue, setQuantityForQueue] = useState(1);
  const [isMultiMode, setIsMultiMode] = useState(false);

  useEffect(() => {
    if (open && product) {
      // Detect available printers
      detectPrinters();
    }
  }, [open, product]);

  useEffect(() => {
    if (product?.barcode && barcodeRef.current) {
      // Note: Barcode rendering is now handled by LabelPreview component
      // This renderBarcode is kept for backward compatibility but not actively used
      // renderBarcode();
    }
  }, [product?.barcode, labelSizeType]);

  const detectPrinters = async () => {
    try {
      // Check for USB thermal printers via WebUSB API
      const nav = navigator as any;
      if ('usb' in nav && nav.usb) {
        const devices = await nav.usb.getDevices();
        const printerDevices = devices
          .filter((d: any) => d.vendorId && d.productId)
          .map((d: any) => `USB: ${d.productName || 'Unknown Printer'}`);
        setAvailablePrinters(prev => {
          const newPrinters = [...new Set([...prev, ...printerDevices])];
          if (!newPrinters.includes('Default Printer')) {
            return ['Default Printer', ...newPrinters];
          }
          return newPrinters;
        });
      } else {
        setAvailablePrinters(['Default Printer']);
      }
    } catch (error) {
      // ignore
      setAvailablePrinters(['Default Printer']);
    }
  };

  const connectUSBPrinter = async () => {
    try {
      const nav = navigator as any;
      if ('usb' in nav && nav.usb) {
        // Request device without restricting filters to allow all printers
        const device = await nav.usb.requestDevice({ filters: [] });
        if (device) {
          const printerName = `USB: ${device.productName || 'Unknown Printer'}`;
          setAvailablePrinters(prev => {
            const newList = [...new Set([...prev, printerName])];
            return newList;
          });
          setSelectedPrinter(printerName);
          toast({
            title: "Printer Connected",
            description: `Successfully connected to ${device.productName}`,
          });
        }
      } else {
        toast({
          title: "Not Supported",
          description: "WebUSB is not supported in this browser.",
          variant: "destructive"
        });
      }
    } catch (error: any) {
      console.error('Error connecting to USB printer:', error);
      toast({
        title: "Connection Failed",
        description: error.message || "Failed to connect to USB printer",
        variant: "destructive"
      });
    }
  };

  const renderBarcode = () => {
    if (!barcodeRef.current || !product?.barcode) return;

    const printHeight = parseInt(labelSize.split('x')[1]) > 30 ? 40 : 25;

    try {
      JsBarcode(barcodeRef.current, product.barcode, {
        format: 'CODE128',
        width: 1.5,
        height: printHeight,
        displayValue: true,
        text: product.productName,
        fontSize: 10,
        margin: 2,
        background: '#ffffff',
        lineColor: '#000000'
      });
    } catch (error) {
      console.error('Error rendering barcode:', error);
    }
  };

  const handlePrint = async () => {
    if (!product?.barcode) {
      toast({
        title: "Error",
        description: "No barcode to print",
        variant: "destructive"
      });
      return;
    }

    setIsPrinting(true);
    setPrintStatus('printing');

    try {
      // Try to use WebUSB for direct printing
      if ('usb' in navigator && selectedPrinter.startsWith('USB:')) {
        await printViaUSB();
      } else {
        // Fallback to window print
        await printViaWindow();
      }

      setPrintStatus('success');
      toast({
        title: "Print Complete",
        description: `${quantity} label(s) printed successfully`,
      });
      
      onPrintComplete?.();
      
      setTimeout(() => {
        onOpenChange(false);
        setPrintStatus('idle');
      }, 1500);
    } catch (error) {
      console.error('Print error:', error);
      setPrintStatus('error');
      toast({
        title: "Print Error",
        description: "Failed to print. Please check printer connection.",
        variant: "destructive"
      });
    } finally {
      setIsPrinting(false);
    }
  };

  const printViaUSB = async () => {
    try {
      const nav = navigator as any;
      const devices = await nav.usb.getDevices();
      const printer = devices.find((d: any) => `USB: ${d.productName}` === selectedPrinter);
      
      if (!printer) {
        throw new Error('Printer not found');
      }

      await printer.open();
      
      if (printer.configuration === null) {
        await printer.selectConfiguration(1);
      }

      await printer.claimInterface(0);

      // Generate ESC/POS commands for multiple labels
      const commands = generatePrintCommands();
      
      await printer.transferOut(1, new Uint8Array(commands));
      
      await printer.releaseInterface(0);
      await printer.close();
    } catch (error) {
      console.error('USB print error:', error);
      // Fall back to window print
      await printViaWindow();
    }
  };

  const generatePrintCommands = (): number[] => {
    const commands: number[] = [];

    // Extract dynamic fields generated by LabelPreview
    let dynamicFields: any[] = [];
    const labelContainer = document.querySelector('.label-container');
    if (labelContainer) {
      try {
        const parsed = JSON.parse(labelContainer.getAttribute('data-fields') || '[]');
        dynamicFields = parsed;
      } catch (e) {
        console.error('Failed to parse dynamic fields:', e);
      }
    }

    for (let i = 0; i < quantity; i++) {
      // Initialize printer
      commands.push(0x1B, 0x40); // ESC @ (Initialize)
      
      // Center alignment
      commands.push(0x1B, 0x61, 0x01); // ESC a 1 (Center)
      
      if (dynamicFields.length > 0) {
        // Dynamic printing using fields
        dynamicFields.forEach(field => {
          if (field.type === 'text') {
            const textBytes = stringToBytes(String(field.value).substring(0, 30));
            commands.push(...textBytes);
            commands.push(0x0A); // Line feed
          } else if (field.type === 'barcode') {
            commands.push(0x1D, 0x68, 0x50); // Barcode height
            commands.push(0x1D, 0x77, 0x02); // Barcode width
            commands.push(0x1D, 0x6B, 0x00); // CODE128
            
            const bcValue = String(field.value);
            for (let j = 0; j < bcValue.length; j++) {
              commands.push(bcValue.charCodeAt(j));
            }
            commands.push(0x00);
            commands.push(0x0A); // Line feed
          }
        });
      } else {
        // Fallback for when fields failed to parse
        if (includeProductName && product?.productName) {
          const nameBytes = stringToBytes(product.productName.substring(0, 20));
          commands.push(...nameBytes);
          commands.push(0x0A);
        }
        
        if (product?.barcode) {
          commands.push(0x1D, 0x68, 0x50); // Barcode height
          commands.push(0x1D, 0x77, 0x02); // Barcode width
          commands.push(0x1D, 0x6B, 0x00); // CODE128
          
          for (let j = 0; j < product.barcode.length; j++) {
            commands.push(product.barcode.charCodeAt(j));
          }
          commands.push(0x00);
          commands.push(0x0A);
        }
        
        if (includePrice && product?.retail_price) {
          const priceText = `UGX ${product.retail_price.toLocaleString()}`;
          const priceBytes = stringToBytes(priceText);
          commands.push(...priceBytes);
          commands.push(0x0A);
        }
      }
      
      // Cut paper (partial cut)
      commands.push(0x1D, 0x56, 0x01); // GS V 1 (Partial cut)
      commands.push(0x0A, 0x0A, 0x0A); // Extra line feeds
    }
    
    return commands;
  };

  const stringToBytes = (str: string): number[] => {
    const bytes: number[] = [];
    for (let i = 0; i < str.length; i++) {
      bytes.push(str.charCodeAt(i));
    }
    return bytes;
  };

  const getLabelDimensionsForType = () => {
    switch(labelSizeType) {
      case '58mm': return { width: 58, height: 60 };
      case '80mm': return { width: 80, height: 60 };
      case 'custom': return { width: customWidth, height: customHeight };
      default: return { width: 58, height: 60 };
    }
  };

  const printViaWindow = async () => {
    // PRINT EXACT PREVIEW (following senior engineer specifications)
    
    // STEP 1: Validate data
    if (!product?.barcode) {
      throw new Error('No product or barcode to print');
    }

    // STEP 2: Get label dimensions
    const dimensions = getLabelDimensionsForType();
    const LABEL_WIDTH = labelSizeType === '58mm' ? '58mm' : labelSizeType === '80mm' ? '80mm' : `${customWidth}mm`;
    const LABEL_HEIGHT = labelSizeType === '58mm' ? '60mm' : labelSizeType === '80mm' ? '60mm' : `${customHeight}mm`;

    // STEP 3: Extract preview element and its HTML
    const previewElement = document.getElementById('label-preview');
    if (!previewElement) {
      throw new Error('Preview element not found');
    }

    // STEP 4: Get exact preview HTML (scaled back to 100%)
    const previewHTML = previewElement.innerHTML;

    // STEP 5: Create print window
    const win = window.open('', '', 'width=300,height=400');
    if (!win) {
      throw new Error('Could not open print window');
    }

    // STEP 6: Build print document with EXACT matching styles
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Print Barcode Labels</title>
        <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }

          html, body {
            margin: 0;
            padding: 0;
            font-family: Arial, sans-serif;
            background: white;
          }

          body {
            display: flex;
            flex-direction: column;
            gap: 4px;
            padding: 0;
          }

          .label-container {
            width: ${LABEL_WIDTH};
            height: ${LABEL_HEIGHT};
            position: relative;
            box-sizing: border-box;
            overflow: hidden;
            font-family: Arial, sans-serif;
            page-break-inside: avoid;
            page-break-after: always;
            background: white;
            border: 1px solid #ccc;
          }

          .label-content {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 90%;
            text-align: center;
          }

          .field-text {
            font-size: 10px;
            font-weight: bold;
            max-width: 100%;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            width: 100%;
            color: black !important;
          }

          .field-barcode {
            display: flex;
            justify-content: center;
            align-items: center;
            width: 100%;
            min-height: 20px;
          }

          .field-barcode svg {
            max-width: 100%;
            height: auto;
          }

          @media print {
            @page {
              margin: 0;
            }

            body {
              margin: 0;
              padding: 0;
            }

            #label-preview {
              transform: none !important;
              width: 100% !important;
              margin: 0 !important;
              padding: 0 !important;
            }

            .label-container {
              width: ${LABEL_WIDTH} !important;
              height: ${LABEL_HEIGHT} !important;
              position: relative !important;
              overflow: hidden !important;
              margin: 0;
              padding: 0 !important;
              page-break-inside: avoid;
              page-break-after: always;
              border: none !important;
              box-shadow: none !important;
              print-color-adjust: exact;
              -webkit-print-color-adjust: exact;
            }

            .label-content {
              position: absolute !important;
              top: 55% !important; 
              left: 50% !important;
              transform: translate(-50%, -50%) !important;
              width: 90% !important;
              text-align: center !important;
            }
          }
        </style>
      </head>
      <body>
        ${previewHTML}
        <script>
          (function() {
            // Render all barcodes
            function renderBarcodes() {
              const svgs = document.querySelectorAll('svg.barcode');
              let rendered = 0;
              
              svgs.forEach((svg) => {
                try {
                  const val = svg.getAttribute('data-value');
                  if (!svg.children.length && val) {
                    JsBarcode(svg, val, {
                      format: 'CODE128',
                      width: 1,
                      height: 20,
                      displayValue: false,
                      fontSize: 8,
                      margin: 0
                    });
                    rendered++;
                  }
                } catch (err) {
                  console.error('Barcode error:', err);
                }
              });

              // Auto-print after rendering
              if (rendered > 0 || svgs.length === 0) {
                setTimeout(() => window.print(), 300);
              } else {
                setTimeout(() => window.print(), 500);
              }
            }

            if (document.readyState === 'loading') {
              document.addEventListener('DOMContentLoaded', renderBarcodes);
            } else {
              renderBarcodes();
            }
          })();
        </script>
      </body>
      </html>
    `;

    // STEP 7: Write and print
    win.document.write(html);
    win.document.close();

    // Wait for print dialog
    await new Promise(resolve => setTimeout(resolve, 1000));
  };

  const handleTestPrint = async () => {
    setIsPrinting(true);
    try {
      await printViaWindow();
      toast({
        title: "Test Print",
        description: "Test label sent to printer",
      });
    } catch (error) {
      toast({
        title: "Test Print Failed",
        description: "Could not print test label",
        variant: "destructive"
      });
    } finally {
      setIsPrinting(false);
    }
  };

  // Multi-item handlers
  const handleAddToQueue = () => {
    if (!selectedProductForQueue) {
      toast({
        title: "Please select a product",
        variant: "destructive"
      });
      return;
    }

    const selectedProd = stockData.find(p => p.id === selectedProductForQueue);
    if (!selectedProd) return;

    const existing = printItems.findIndex(item => item.product.id === selectedProductForQueue);
    if (existing >= 0) {
      const updated = [...printItems];
      updated[existing].quantity += quantityForQueue;
      setPrintItems(updated);
    } else {
      setPrintItems([...printItems, { product: selectedProd, quantity: quantityForQueue }]);
    }

    setSelectedProductForQueue('');
    setQuantityForQueue(1);
    toast({
      title: "Product added to queue",
      description: `${selectedProd.productName} × ${quantityForQueue}`
    });
  };

  const handleRemoveFromQueue = (index: number) => {
    const removed = printItems[index];
    setPrintItems(printItems.filter((_, i) => i !== index));
    toast({
      title: "Product removed",
      description: removed.product.productName
    });
  };

  const handleMoveQueueItemUp = (index: number) => {
    if (index === 0) return;
    const updated = [...printItems];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    setPrintItems(updated);
  };

  const handleMoveQueueItemDown = (index: number) => {
    if (index === printItems.length - 1) return;
    const updated = [...printItems];
    [updated[index + 1], updated[index]] = [updated[index], updated[index + 1]];
    setPrintItems(updated);
  };

  const handleUpdateQueueQuantity = (index: number, newQuantity: number) => {
    if (newQuantity < 1) return;
    const updated = [...printItems];
    updated[index].quantity = newQuantity;
    setPrintItems(updated);
  };

  const handleClearQueue = () => {
    setPrintItems([]);
    toast({
      title: "Queue cleared"
    });
  };

  if (!product && printItems.length === 0) return null;

  const dimensions = getLabelDimensions(labelSize);
  const totalLabelsToShow = isMultiMode 
    ? printItems.reduce((sum, item) => sum + item.quantity, 0)
    : quantity;
  const currentDisplay = isMultiMode && printItems.length > 0 ? printItems : (product ? [{ product, quantity }] : []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            Print Barcode Labels
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Multi-Mode Toggle */}
          {stockData && stockData.length > 0 && (
            <div className="flex gap-2">
              <Button
                variant={isMultiMode ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setIsMultiMode(false);
                  setPrintItems([]);
                }}
                className="flex-1"
              >
                Single Product
              </Button>
              <Button
                variant={isMultiMode ? "default" : "outline"}
                size="sm"
                onClick={() => setIsMultiMode(true)}
                className="flex-1"
              >
                Multiple Products
              </Button>
            </div>
          )}

          {/* Multi-Item Queue */}
          {isMultiMode && (
            <Card className="border-blue-200 bg-blue-50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Print Queue</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {/* Add Product Section */}
                <div className="space-y-2 pb-2 border-b">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <Label className="text-xs">Product</Label>
                      <Select value={selectedProductForQueue} onValueChange={setSelectedProductForQueue}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent className="max-h-40">
                          {stockData.map(p => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.productName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Qty</Label>
                      <Input
                        type="number"
                        min="1"
                        max="100"
                        value={quantityForQueue}
                        onChange={(e) => setQuantityForQueue(Math.max(1, parseInt(e.target.value) || 1))}
                        className="h-8 text-xs text-center"
                      />
                    </div>
                  </div>
                  <Button onClick={handleAddToQueue} size="sm" className="w-full h-7 text-xs">
                    <Plus className="h-3 w-3 mr-1" /> Add
                  </Button>
                </div>

                {/* Queue Items */}
                {printItems.length > 0 ? (
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {printItems.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-1 p-1 bg-white rounded border text-xs">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleMoveQueueItemUp(idx)}
                          disabled={idx === 0}
                        >
                          <ArrowUp className="h-2 w-2" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleMoveQueueItemDown(idx)}
                          disabled={idx === printItems.length - 1}
                        >
                          <ArrowDown className="h-2 w-2" />
                        </Button>
                        <span className="flex-1 truncate font-medium">{item.product.productName}</span>
                        <Input
                          type="number"
                          min="1"
                          max="100"
                          value={item.quantity}
                          onChange={(e) => handleUpdateQueueQuantity(idx, parseInt(e.target.value) || 1)}
                          className="h-6 w-12 text-center text-xs p-1"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-red-600"
                          onClick={() => handleRemoveFromQueue(idx)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center text-xs text-muted-foreground py-2">
                    No items in queue
                  </div>
                )}

                {/* Queue Summary */}
                {printItems.length > 0 && (
                  <div className="pt-2 border-t text-sm font-semibold text-blue-900">
                    Total: {printItems.reduce((sum, i) => sum + i.quantity, 0)} labels
                  </div>
                )}

                {printItems.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleClearQueue}
                    className="w-full h-7 text-xs"
                  >
                    <Trash2 className="h-3 w-3 mr-1" /> Clear Queue
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* Live Label Preview - Exactly matches print output */}
          {isMultiMode && printItems.length > 0 ? (
            <LabelPreview
              printItems={printItems}
              labelSizeType={labelSizeType}
              customWidthMm={customWidth}
              customHeightMm={customHeight}
              previewScale={previewScale}
              showFields={{
                productName: includeProductName,
                barcode: true,
                price: includePrice,
                sku: includeSKU
              }}
              onScaleChange={setPreviewScale}
            />
          ) : !isMultiMode && product ? (
            <LabelPreview
              printItems={[{ product, quantity }]}
              labelSizeType={labelSizeType}
              customWidthMm={customWidth}
              customHeightMm={customHeight}
              previewScale={previewScale}
              showFields={{
                productName: includeProductName,
                barcode: true,
                price: includePrice,
                sku: includeSKU
              }}
              onScaleChange={setPreviewScale}
            />
          ) : null}

          {/* Print Settings */}
          <div className="space-y-4">
            {/* Label Size Type */}
            <div className="space-y-2">
              <Label htmlFor="sizeType">Label Size Type</Label>
              <Select value={labelSizeType} onValueChange={(v) => setLabelSizeType(v as '58mm' | '80mm' | 'custom')}>
                <SelectTrigger id="sizeType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="58mm">58mm Thermal</SelectItem>
                  <SelectItem value="80mm">80mm Receipt</SelectItem>
                  <SelectItem value="custom">Custom Size</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Custom Dimensions */}
            {labelSizeType === 'custom' && (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label htmlFor="customWidth">Width (mm)</Label>
                  <Input
                    id="customWidth"
                    type="number"
                    min="20"
                    max="120"
                    value={customWidth}
                    onChange={(e) => setCustomWidth(Math.max(20, Math.min(120, parseInt(e.target.value) || 58)))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customHeight">Height (mm)</Label>
                  <Input
                    id="customHeight"
                    type="number"
                    min="20"
                    max="150"
                    value={customHeight}
                    onChange={(e) => setCustomHeight(Math.max(20, Math.min(150, parseInt(e.target.value) || 60)))}
                  />
                </div>
              </div>
            )}

            {/* Printer Selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="printer">Select Printer</Label>
                <Button variant="outline" size="sm" onClick={connectUSBPrinter}>
                  Connect USB
                </Button>
              </div>
              <Select value={selectedPrinter} onValueChange={setSelectedPrinter}>
                <SelectTrigger id="printer">
                  <SelectValue placeholder="Choose a printer" />
                </SelectTrigger>
                <SelectContent>
                  {availablePrinters.map((printer) => (
                    <SelectItem key={printer} value={printer}>
                      {printer}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Quantity */}
            {!isMultiMode ? (
              <div className="space-y-2">
                <Label htmlFor="quantity">Number of Labels</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  max="1000"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                />
              </div>
            ) : (
              <div className="space-y-2 p-3 bg-blue-100 rounded border border-blue-300">
                <Label className="text-sm font-semibold text-blue-900">Total Labels to Print</Label>
                <div className="text-2xl font-bold text-blue-900">
                  {printItems.reduce((sum, i) => sum + i.quantity, 0)} labels
                </div>
              </div>
            )}

            {/* Display Options */}
            <div className="space-y-2">
              <Label>Include on Label</Label>
              <div className="flex flex-col space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="includeName"
                    checked={includeProductName}
                    onCheckedChange={(checked) => setIncludeProductName(checked as boolean)}
                  />
                  <Label htmlFor="includeName" className="text-sm font-normal">
                    Product Name
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="includePrice"
                    checked={includePrice}
                    onCheckedChange={(checked) => setIncludePrice(checked as boolean)}
                  />
                  <Label htmlFor="includePrice" className="text-sm font-normal">
                    Price
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="includeSKU"
                    checked={includeSKU}
                    onCheckedChange={(checked) => setIncludeSKU(checked as boolean)}
                  />
                  <Label htmlFor="includeSKU" className="text-sm font-normal">
                    SKU
                  </Label>
                </div>
              </div>
            </div>

            {/* Columns Per Page */}
            <div className="space-y-2">
              <Label htmlFor="columns">Columns Per Page</Label>
              <div className="flex items-center space-x-2">
                <input
                  id="columns"
                  type="range"
                  min="1"
                  max="5"
                  value={columnsPerPage}
                  onChange={(e) => setColumnsPerPage(Math.max(1, Math.min(5, parseInt(e.target.value))))}
                  className="flex-1"
                />
                <span className="text-sm font-medium w-8">{columnsPerPage}</span>
              </div>
            </div>
          </div>

          {/* Status */}
          {printStatus !== 'idle' && (
            <div className={`flex items-center gap-2 p-3 rounded ${
              printStatus === 'success' ? 'bg-green-100 text-green-800' :
              printStatus === 'error' ? 'bg-red-100 text-red-800' :
              'bg-blue-100 text-blue-800'
            }`}>
              {printStatus === 'printing' && <Loader2 className="h-4 w-4 animate-spin" />}
              {printStatus === 'success' && <Check className="h-4 w-4" />}
              {printStatus === 'error' && <AlertCircle className="h-4 w-4" />}
              <span className="text-sm">
                {printStatus === 'printing' && 'Printing...'}
                {printStatus === 'success' && 'Print completed successfully!'}
                {printStatus === 'error' && 'Print failed. Please try again.'}
              </span>
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={handleTestPrint} disabled={isPrinting || (!isMultiMode && !product?.barcode)}>
            <QrCode className="h-4 w-4 mr-2" />
            Test Print
          </Button>
          <Button 
            onClick={handlePrint} 
            disabled={isPrinting || (!isMultiMode && !product?.barcode) || (isMultiMode && printItems.length === 0)}
          >
            {isPrinting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Printing...
              </>
            ) : (
              <>
                <Printer className="h-4 w-4 mr-2" />
                Print {totalLabelsToShow} Label{totalLabelsToShow > 1 ? 's' : ''}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
