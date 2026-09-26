import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Printer, Plus, X, Trash2, ArrowUp, ArrowDown, Search, CheckCircle } from 'lucide-react';
import { StockItem } from '@/types';
import LabelPreview, { type PrintItem, type Orientation, type ShowFields } from './LabelPreview';

type LabelSizeType =
  | '58mm'
  | '80mm'
  | '30x20mm'
  | '40x25mm'
  | '50x25mm'
  | '50x30mm'
  | '60x40mm'
  | '70x50mm'
  | '100x50mm'
  | 'custom';

interface MultiLabelPrintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stockData: StockItem[];
  onPrint?: (items: PrintItem[]) => void;
  onPrintComplete?: () => void;
}

export default function MultiLabelPrintDialog({
  open,
  onOpenChange,
  stockData,
  onPrint,
  onPrintComplete
}: MultiLabelPrintDialogProps) {
  const { toast } = useToast();
  const [printItems, setPrintItems] = useState<PrintItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [quantity, setQuantity] = useState(1);
  const [labelSizeType, setLabelSizeType] = useState<LabelSizeType>('58mm');
  const [customWidth, setCustomWidth] = useState(58);
  const [customHeight, setCustomHeight] = useState(60);
  const [previewScale, setPreviewScale] = useState(100);

  // Preview/print layout options (must match what the printer HTML generates).
  const [orientation, setOrientation] = useState<Orientation>('portrait');
  const [columnsPerPage, setColumnsPerPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(1);

  const [showFields, setShowFields] = useState<ShowFields>({
    productName: true,
    barcode: true,
    price: true,
    sku: true,
  });

  // Filter products based on search query
  const filteredProducts = searchQuery.trim()
    ? stockData.filter(p =>
        p.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.barcode && p.barcode.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : [];

  // Reset active index when search query changes
  useEffect(() => {
    setActiveSearchIndex(0);
  }, [searchQuery]);

  // Handle keyboard navigation in search results
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSearchResults || filteredProducts.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveSearchIndex(prev => (prev + 1) % filteredProducts.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveSearchIndex(prev => (prev - 1 + filteredProducts.length) % filteredProducts.length);
        break;
      case 'Enter':
        e.preventDefault();
        const selected = filteredProducts[activeSearchIndex];
        if (selected) {
          selectProduct(selected.id);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setShowSearchResults(false);
        break;
    }
  };

  const selectProduct = (productId: string) => {
    setSelectedProductId(productId);
    setSearchQuery('');
    setShowSearchResults(false);
    setActiveSearchIndex(0);
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setShowSearchResults(value.trim().length > 0);
  };

  const handleAddProduct = () => {
    if (!selectedProductId) {
      toast({
        title: "Please select a product",
        variant: "destructive"
      });
      return;
    }

    const product = stockData.find(p => p.id === selectedProductId);
    if (!product) return;

    // Check if product already in list
    const existing = printItems.findIndex(item => item.product.id === selectedProductId);
    if (existing >= 0) {
      const updated = [...printItems];
      updated[existing].quantity += quantity;
      setPrintItems(updated);
    } else {
      setPrintItems([...printItems, { product, quantity }]);
    }

    setSelectedProductId('');
    setQuantity(1);
    toast({
      title: "Product added",
      description: `${product.productName} × ${quantity} added to queue`
    });
  };

  const handleRemoveProduct = (index: number) => {
    const removed = printItems[index];
    setPrintItems(printItems.filter((_, i) => i !== index));
    toast({
      title: "Product removed",
      description: `${removed.product.productName} removed from queue`
    });
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const updated = [...printItems];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    setPrintItems(updated);
  };

  const handleMoveDown = (index: number) => {
    if (index === printItems.length - 1) return;
    const updated = [...printItems];
    [updated[index + 1], updated[index]] = [updated[index], updated[index + 1]];
    setPrintItems(updated);
  };

  const handleUpdateQuantity = (index: number, newQuantity: number) => {
    if (newQuantity < 1) return;
    const updated = [...printItems];
    updated[index].quantity = newQuantity;
    setPrintItems(updated);
  };

  const handleClear = () => {
    setPrintItems([]);
    toast({
      title: "Queue cleared",
      description: "All items removed from print queue"
    });
  };

  const getLabelDimensions = () => {
    let base: { width: number; height: number };

    switch (labelSizeType) {
      case '58mm':
        base = { width: 58, height: 60 };
        break;
      case '80mm':
        base = { width: 80, height: 60 };
        break;
      case '30x20mm':
        base = { width: 30, height: 20 };
        break;
      case '40x25mm':
        base = { width: 40, height: 25 };
        break;
      case '50x25mm':
        base = { width: 50, height: 25 };
        break;
      case '50x30mm':
        base = { width: 50, height: 30 };
        break;
      case '60x40mm':
        base = { width: 60, height: 40 };
        break;
      case '70x50mm':
        base = { width: 70, height: 50 };
        break;
      case '100x50mm':
        base = { width: 100, height: 50 };
        break;
      case 'custom':
        base = { width: customWidth, height: customHeight };
        break;
      default:
        base = { width: 58, height: 60 };
    }

    if (orientation === 'landscape') {
      return { width: base.height, height: base.width };
    }
    return base;
  };

  const generatePrintHTML = () => {
    const { width, height } = getLabelDimensions();
    const maxBarcodeHeightMm = Math.max(10, Math.min(25, Math.round(height * 0.7)));
    const jsBarcodeHeightPx = Math.max(12, Math.min(30, Math.round(height * 0.55)));
    
    const safeColumnsPerPage = Math.max(1, Math.floor(columnsPerPage));
    const safeRowsPerPage = Math.max(1, Math.floor(rowsPerPage));
    const labelsPerPage = safeColumnsPerPage * safeRowsPerPage;

    const sheetWidthMm = width * safeColumnsPerPage;
    const sheetHeightMm = height * safeRowsPerPage;

    const escapeHtml = (s: unknown) =>
      String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    const escapeAttr = (s: unknown) => escapeHtml(s);

    const allLabelInstances: Array<{ globalIdx: number; product: StockItem }> = [];
    let globalIdx = 0;

    printItems.forEach((item) => {
      for (let i = 0; i < item.quantity; i++) {
        allLabelInstances.push({ globalIdx, product: item.product });
        globalIdx++;
      }
    });

    const pageCount = Math.max(1, Math.ceil(allLabelInstances.length / labelsPerPage));
    let pagesHtml = '';

    for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
      const pageStart = pageIndex * labelsPerPage;
      const pageLabels = allLabelInstances.slice(pageStart, pageStart + labelsPerPage);

      const cellsHtml = pageLabels
        .map((inst) => {
          const barcode = inst.product.barcode || '';
          const price = inst.product.retail_price
            ? `UGX ${inst.product.retail_price.toLocaleString()}`
            : 'N/A';

          return `
            <div class="label-container">
              <div class="label-content">
                ${
                  showFields.productName
                    ? `<div class="label-product-name">${escapeHtml(inst.product.productName)}</div>`
                    : ''
                }
                ${
                  showFields.barcode && barcode
                    ? `<svg id="barcode-${inst.globalIdx}" class="label-barcode" data-barcode="${escapeAttr(barcode)}"></svg>`
                    : ''
                }
                ${showFields.price ? `<div class="label-price">${escapeHtml(price)}</div>` : ''}
                ${showFields.sku ? `<div class="label-sku">${escapeHtml(barcode)}</div>` : ''}
              </div>
            </div>
          `;
        })
        .join('');

      pagesHtml += `
        <div class="print-page">
          <div class="page-grid">
            ${cellsHtml}
          </div>
        </div>
      `;
    }

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Print Labels</title>
        <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }

          html, body {
            width: 100%;
            height: 100%;
            margin: 0;
            padding: 0;
            background: white;
            font-family: 'Arial', sans-serif;
          }

          @media print {
            body {
              margin: 0;
              padding: 0;
              background: white;
            }
            * {
              margin: 0;
              padding: 0;
            }
          }

          body {
            margin: 0;
            padding: 0;
          }

          .print-page {
            width: ${sheetWidthMm}mm;
            height: ${sheetHeightMm}mm;
            page-break-after: always;
            overflow: hidden;
          }

          .print-page:last-of-type {
            page-break-after: auto;
          }

          .page-grid {
            width: 100%;
            height: 100%;
            display: grid;
            grid-template-columns: repeat(${safeColumnsPerPage}, ${width}mm);
            grid-template-rows: repeat(${safeRowsPerPage}, ${height}mm);
          }

          .label-container {
            width: ${width}mm;
            height: ${height}mm;
            padding: 0;
            margin: 0;
            border: none;
            position: relative;
            break-inside: avoid;
            page-break-inside: avoid;
            overflow: hidden;
            background: white;
          }

          .label-content {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 90%;
            text-align: center;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 1mm;
          }

          @media print {
            @page {
              size: ${sheetWidthMm}mm ${sheetHeightMm}mm;
              margin: 0;
            }

            .label-container {
              width: ${width}mm;
              height: ${height}mm;
              padding: 0;
              margin: 0;
              border: none;
              break-inside: avoid;
              page-break-inside: avoid;
              page-break-after: auto;
              print-color-adjust: exact;
              -webkit-print-color-adjust: exact;
            }

            body {
              display: block;
            }
          }

          .label-product-name {
            font-size: 9px;
            font-weight: bold;
            width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            text-transform: uppercase;
          }

          .label-barcode {
            width: 100%;
            height: auto;
            max-height: ${maxBarcodeHeightMm}mm;
            margin: 0;
            display: block;
          }

          .label-price {
            font-size: 8px;
            font-weight: bold;
            width: 100%;
            text-align: center;
          }

          .label-sku {
            font-size: 6px;
            color: #666;
            width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            margin: 0;
          }
        </style>
      </head>
      <body>
        ${pagesHtml}
        <script>
          (function() {
            function renderAllBarcodes() {
              const barcodeElements = document.querySelectorAll('.label-barcode');
              let rendered = 0;
              
              barcodeElements.forEach((element) => {
                const elementId = element.getAttribute('id');
                const barcodeValue = element.getAttribute('data-barcode');
                
                if (!barcodeValue) {
                  console.warn('No barcode value for', elementId);
                  return;
                }
                
                try {
                  JsBarcode('#' + elementId, barcodeValue, {
                    format: 'CODE128',
                    width: 1.5,
                    height: ${jsBarcodeHeightPx},
                    displayValue: false,
                    // Keep barcode inside the label bounds (no extra whitespace)
                    margin: 0
                  });
                  rendered++;
                } catch (err) {
                  console.error('Error rendering barcode:', err);
                }
              });
              
              console.log('Rendered ' + rendered + '/' + barcodeElements.length + ' barcodes');
              
              // Wait for rendering to complete then print
              setTimeout(() => {
                window.print();
              }, 500);
            }
            
            if (document.readyState === 'loading') {
              document.addEventListener('DOMContentLoaded', renderAllBarcodes);
            } else {
              renderAllBarcodes();
            }
          })();
        </script>
      </body>
      </html>
    `;
  };

  const handlePrint = () => {
    if (printItems.length === 0) {
      toast({
        title: "No items to print",
        variant: "destructive"
      });
      return;
    }

    try {
      const printWindow = window.open('', 'print_labels', 'width=1000,height=600');
      if (!printWindow) {
        toast({
          title: "Error",
          description: "Please allow popups to print labels",
          variant: "destructive"
        });
        return;
      }

      const html = generatePrintHTML();
      printWindow.document.write(html);
      printWindow.document.close();

      toast({
        title: "Printing",
        description: `${totalLabels} label(s) sent to printer`
      });
    } catch (err: any) {
      toast({
        title: "Print Error",
        description: err.message,
        variant: "destructive"
      });
    }

    onPrint?.(printItems);
    onPrintComplete?.();
  };

  const totalLabels = printItems.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[95vh] overflow-hidden flex flex-col">
        {/* Enhanced Header with Printer Status */}
        <DialogHeader className="space-y-2 border-b pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              {printItems.length === 0 ? (
                <>
                  <DialogTitle className="text-xl font-bold">Print Labels - Select Copies</DialogTitle>
                  <p className="text-sm text-muted-foreground mt-1">Choose how many copies to print for each product</p>
                </>
              ) : (
                <>
                  <DialogTitle className="text-xl font-bold">Label Designer</DialogTitle>
                  <p className="text-sm text-muted-foreground mt-1">Adjust fields & layout, then print</p>
                </>
              )}
            </div>
            <Badge className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-1 h-fit">
              <CheckCircle className="h-3 w-3" />
              LabelPrinter Connected
            </Badge>
          </div>
        </DialogHeader>

        {/* Main Content: Two Column Layout */}
        <div className="flex-1 overflow-hidden flex gap-4">
          {/* LEFT COLUMN: Queue Management */}
          <div className="flex-1 flex flex-col min-w-0 overflow-y-auto pr-2">
            {/* Add Product Section */}
            <Card className="border-0 shadow-sm bg-blue-50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Add Products to Queue</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <Label className="text-xs font-medium">Search Product</Label>
                    <div className="relative">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                        <Input
                          ref={searchInputRef}
                          type="text"
                          placeholder="Name or barcode..."
                          value={selectedProductId ? stockData.find(p => p.id === selectedProductId)?.productName || '' : searchQuery}
                          onChange={(e) => handleSearchChange(e.target.value)}
                          onFocus={() => searchQuery && setShowSearchResults(true)}
                          onBlur={() => setTimeout(() => setShowSearchResults(false), 200)}
                          onKeyDown={handleSearchKeyDown}
                          className="h-8 text-xs pl-8"
                        />
                      </div>

                      {/* Search Results Dropdown */}
                      {showSearchResults && filteredProducts.length > 0 && (
                        <div className="absolute top-9 left-0 right-0 z-50 border border-input rounded-md bg-background shadow-md max-h-48 overflow-y-auto">
                          {filteredProducts.map((product, index) => (
                            <div
                              key={product.id}
                              onClick={() => selectProduct(product.id)}
                              onMouseEnter={() => setActiveSearchIndex(index)}
                              className={`px-2 py-1.5 cursor-pointer text-xs transition-colors ${
                                index === activeSearchIndex
                                  ? 'bg-blue-500 text-white'
                                  : 'hover:bg-gray-100'
                              }`}
                            >
                              <div className="font-medium">{product.productName}</div>
                              <div className={`text-[10px] ${index === activeSearchIndex ? 'text-blue-100' : 'text-muted-foreground'}`}>
                                {product.barcode && `${product.barcode}`}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {showSearchResults && filteredProducts.length === 0 && searchQuery.trim() && (
                        <div className="absolute top-9 left-0 right-0 z-50 border border-input rounded-md bg-background shadow-md p-2">
                          <p className="text-xs text-muted-foreground text-center">No products found</p>
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs font-medium">Copies</Label>
                    <Input
                      type="number"
                      min="1"
                      max="100"
                      value={quantity}
                      onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                      className="h-8 text-xs text-center"
                    />
                  </div>
                </div>
                <Button onClick={handleAddProduct} className="w-full h-8 text-xs bg-blue-600 hover:bg-blue-700">
                  <Plus className="h-3 w-3 mr-1" />
                  Add to Queue
                </Button>
              </CardContent>
            </Card>

            {/* Queue Summary */}
            {printItems.length > 0 && (
              <div className="mt-4 flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold">Products to Print</h3>
                  <Badge variant="outline" className="text-xs">
                    {totalLabels} total label{totalLabels !== 1 ? 's' : ''}
                  </Badge>
                </div>
                <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
                  {printItems.map((item, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-2 bg-white rounded border hover:border-blue-300 hover:bg-blue-50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{item.product.productName}</p>
                        <p className="text-xs text-muted-foreground">SKU: {item.product.barcode}</p>
                        <p className="text-xs font-medium text-blue-600">UGX {item.product.retail_price?.toLocaleString() || 'N/A'}</p>
                      </div>

                      <div className="flex items-center gap-0.5 ml-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleMoveUp(index)}
                          disabled={index === 0}
                          title="Move up"
                        >
                          <ArrowUp className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleMoveDown(index)}
                          disabled={index === printItems.length - 1}
                          title="Move down"
                        >
                          <ArrowDown className="h-3 w-3" />
                        </Button>
                      </div>

                      <div className="w-12 ml-1">
                        <Input
                          type="number"
                          min="1"
                          max="100"
                          value={item.quantity}
                          onChange={(e) => handleUpdateQuantity(index, parseInt(e.target.value) || 1)}
                          className="h-6 text-center text-xs"
                        />
                      </div>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive ml-1"
                        onClick={() => handleRemoveProduct(index)}
                        title="Remove"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Label Settings */}
            <Card className="mt-4 border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Label Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div>
                  <Label className="text-xs font-medium">Size</Label>
                  <div className="flex gap-1 flex-wrap">
                    {(
                      [
                        '58mm',
                        '80mm',
                        '30x20mm',
                        '40x25mm',
                        '50x25mm',
                        '50x30mm',
                        '60x40mm',
                        '70x50mm',
                        '100x50mm',
                        'custom',
                      ] as const
                    ).map((size) => (
                      <Button
                        key={size}
                        variant={labelSizeType === size ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setLabelSizeType(size)}
                        className="text-xs h-7"
                      >
                        {size === 'custom' ? 'Custom' : size}
                      </Button>
                    ))}
                  </div>
                </div>

                {labelSizeType === 'custom' && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px]">Width (mm)</Label>
                      <Input
                        type="number"
                        min="20"
                        max="120"
                        value={customWidth}
                        // Use parseFloat so sizes like 39.5mm are not truncated to 39mm.
                        onChange={(e) => {
                          const v = Number.parseFloat(e.target.value);
                          if (Number.isNaN(v)) return;
                          setCustomWidth(Math.max(20, Math.min(120, v)));
                        }}
                        className="h-7 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px]">Height (mm)</Label>
                      <Input
                        type="number"
                        min="20"
                        max="150"
                        value={customHeight}
                        onChange={(e) => {
                          const v = Number.parseFloat(e.target.value);
                          if (Number.isNaN(v)) return;
                          setCustomHeight(Math.max(20, Math.min(150, v)));
                        }}
                        className="h-7 text-xs"
                      />
                    </div>
                  </div>
                )}

                <div className="pt-2 border-t">
                  <Label className="text-xs font-medium">Layout on page</Label>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div>
                      <Label className="text-[10px]">Columns</Label>
                      <Input
                        type="number"
                        min="1"
                        max="5"
                        step="1"
                        value={columnsPerPage}
                        onChange={(e) =>
                          setColumnsPerPage(Math.max(1, Math.min(5, parseInt(e.target.value) || 1)))
                        }
                        className="h-7 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px]">Rows</Label>
                      <Input
                        type="number"
                        min="1"
                        max="10"
                        step="1"
                        value={rowsPerPage}
                        onChange={(e) =>
                          setRowsPerPage(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))
                        }
                        className="h-7 text-xs"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* RIGHT COLUMN: Live Preview (Prominent) */}
          {printItems.length > 0 && (
            <div className="w-80 flex flex-col min-w-0 border-l pl-4">
              <div className="flex-1 flex flex-col min-h-0 bg-slate-100 rounded-lg p-3 overflow-hidden">
                <h3 className="text-sm font-semibold mb-2">Live Label Preview</h3>
                <div className="flex-1 overflow-auto">
                  <LabelPreview
                    printItems={printItems}
                    labelSizeType={labelSizeType}
                    customWidthMm={customWidth}
                    customHeightMm={customHeight}
                    previewScale={previewScale}
                    onScaleChange={setPreviewScale}
                    orientation={orientation}
                    onOrientationChange={setOrientation}
                    showFields={showFields}
                    onShowFieldsChange={setShowFields}
                    columnsPerPage={columnsPerPage}
                    rowsPerPage={rowsPerPage}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="border-t pt-3 flex gap-2 justify-between">
          <div className="text-xs text-muted-foreground">
            {printItems.length > 0 && (
              <span className="font-medium">
                Ready to print <Badge className="ml-2 bg-green-100 text-green-800 font-bold">{totalLabels} labels</Badge>
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClear} disabled={printItems.length === 0} className="h-8 text-xs">
              <Trash2 className="h-3 w-3 mr-1" />
              Clear
            </Button>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-8 text-xs"
            >
              Cancel
            </Button>
            <Button
              onClick={handlePrint}
              disabled={printItems.length === 0}
              className="bg-blue-600 hover:bg-blue-700 h-8 text-xs"
            >
              <Printer className="h-3 w-3 mr-1" />
              Print {totalLabels} Labels
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
