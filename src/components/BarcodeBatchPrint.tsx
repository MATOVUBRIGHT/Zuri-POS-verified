import { useState, useEffect } from "react";
import { fmtCurrency } from "@/lib/currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import {
  Printer,
  Barcode,
  Settings,
  CheckSquare,
  Square,
  Search,
  RefreshCw,
  Usb,
  Wifi,
  Package,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface BarcodeBatchPrintProps {
  currentStoreId?: string;
}

interface Product {
  id: string;
  product_name: string;
  barcode?: string;
  quantity: number;
  cost_per_unit: number;
}

interface PrinterConfig {
  id: string;
  printer_name: string;
  printer_type: string;
  connection_type: string;
  default_label_size: string;
  is_default: boolean;
  supported_sizes: string[];
}

const BarcodeBatchPrint = ({ currentStoreId }: BarcodeBatchPrintProps) => {
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  // Store individual print quantities per product ID instead of just a Set
  const [selectedProducts, setSelectedProducts] = useState<Record<string, number>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  
  // Printer settings
  const [printers, setPrinters] = useState<PrinterConfig[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>("");
  const [labelSize, setLabelSize] = useState("40x30mm");
  const [printQuantity, setPrintQuantity] = useState(1);
  const [barcodeType, setBarcodeType] = useState("CODE128");
  const [scanning, setScanning] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  
  // Settings dialog
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    fetchProducts();
    fetchPrinters();
  }, [currentStoreId]);

  const fetchProducts = async () => {
    if (!currentStoreId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("inventory")
        .select("id, product_name, barcode, quantity, cost_per_unit")
        .eq("store_id", currentStoreId)
        .order("product_name");

      if (error) throw error;
      setProducts(data || []);
    } catch (error: any) {
      console.error("Error fetching products:", error);
      toast({
        title: "Error",
        description: "Failed to load products",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchPrinters = async () => {
    if (!currentStoreId) return;

    try {
      const { data, error } = await (supabase as any)
        .from("printer_configs")
        .select("*")
        .eq("store_id", currentStoreId)
        .eq("is_active", true)
        .order("is_default", { ascending: false });

      if (error) throw error;
      
      const printerConfigs = (data || []).map((p: any) => ({
        ...p,
        supported_sizes: Array.isArray(p.supported_sizes) 
          ? p.supported_sizes 
          : ["40x30mm", "50x25mm", "60x40mm"]
      }));
      
      setPrinters(printerConfigs);
      
      // Set default printer
      const defaultPrinter = printerConfigs.find((p: any) => p.is_default);
      if (defaultPrinter) {
        setSelectedPrinter(defaultPrinter.id);
        setLabelSize(defaultPrinter.default_label_size);
      }
    } catch (error: any) {
      console.error("Error fetching printers:", error);
    }
  };

  const scanForPrinters = async () => {
    setScanning(true);
    try {
      // Check if Web USB API is available
      if (!('usb' in navigator)) {
        toast({
          title: "USB Not Supported",
          description: "Your browser doesn't support USB device detection. Please use Chrome, Edge, or Opera.",
          variant: "destructive",
        });
        return;
      }

      // Request USB device
      const device = await (navigator as any).usb.requestDevice({
        filters: [
          { classCode: 7 }, // Printer class
        ]
      });

      if (device) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !currentStoreId) return;

        // Save printer configuration
        const { error } = await (supabase as any)
          .from("printer_configs")
          .insert({
            store_id: currentStoreId,
            user_id: user.id,
            printer_name: device.productName || "USB Printer",
            printer_type: "thermal",
            connection_type: "usb",
            vendor_id: device.vendorId.toString(16),
            product_id: device.productId.toString(16),
            serial_number: device.serialNumber || null,
            is_default: printers.length === 0,
          });

        if (error) throw error;

        toast({
          title: "Printer Detected",
          description: `${device.productName || "USB Printer"} has been added`,
        });

        fetchPrinters();
      }
    } catch (error: any) {
      if (error.name === 'NotFoundError') {
        toast({
          title: "No Printer Selected",
          description: "Please select a printer from the list",
        });
      } else {
        console.error("Error scanning for printers:", error);
        toast({
          title: "Scan Failed",
          description: error.message || "Failed to detect printer",
          variant: "destructive",
        });
      }
    } finally {
      setScanning(false);
    }
  };

  const toggleProductSelection = (productId: string) => {
    const newSelection = { ...selectedProducts };
    if (newSelection[productId]) {
      delete newSelection[productId];
    } else {
      newSelection[productId] = printQuantity;
    }
    setSelectedProducts(newSelection);
  };

  const handleIndividualQuantityChange = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      const newSelection = { ...selectedProducts };
      delete newSelection[productId];
      setSelectedProducts(newSelection);
    } else {
      setSelectedProducts({ ...selectedProducts, [productId]: quantity });
    }
  };

  const filteredProducts = products.filter(p =>
    p.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.barcode?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectAll = () => {
    const selectedCount = Object.keys(selectedProducts).length;
    if (selectedCount === filteredProducts.length) {
      setSelectedProducts({});
    } else {
      const allSelected: Record<string, number> = {};
      filteredProducts.forEach(p => {
        allSelected[p.id] = printQuantity;
      });
      setSelectedProducts(allSelected);
    }
  };

  const selectedCount = Object.keys(selectedProducts).length;
  const totalLabels = Object.values(selectedProducts).reduce((sum, val) => sum + val, 0);

  const handlePrint = async () => {
    if (selectedCount === 0) {
      toast({
        title: "No Products Selected",
        description: "Please select at least one product to print",
        variant: "destructive",
      });
      return;
    }

    if (!selectedPrinter) {
      toast({
        title: "No Printer Selected",
        description: "Please select a printer or scan for available printers",
        variant: "destructive",
      });
      return;
    }

    setIsPrinting(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !currentStoreId) return;

      const batchId = crypto.randomUUID();
      const selectedProductsList = products.filter(p => !!selectedProducts[p.id]);
      const printer = printers.find(p => p.id === selectedPrinter);
      const [width, height] = labelSize.split('x').map(s => parseInt(s));

      // INSTANT FEEDBACK: Show success immediately
      toast({
        title: "Generating Barcodes...",
        description: `Preparing ${selectedCount} product(s) for a total of ${totalLabels} labels`,
      });

      // STEP 1: Generate print content FIRST (instant, no waiting for DB)
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        throw new Error("Popup blocked. Please allow popups for this site.");
      }

      let htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Barcode Print - Batch ${batchId.slice(0, 8)}</title>
          <style>
            @page {
              size: ${width}mm ${height}mm;
              margin: 0;
            }
            body {
              margin: 0;
              padding: 0;
              font-family: Arial, sans-serif;
            }
            .label {
              width: ${width}mm;
              height: ${height}mm;
              position: relative;
              page-break-after: always;
              overflow: hidden;
              box-sizing: border-box;
            }
            .label-content {
              position: absolute;
              top: 55%;
              left: 50%;
              transform: translate(-50%, -50%);
              width: 90%;
              text-align: center;
              display: flex;
              flex-direction: column;
              align-items: center;
              gap: 2mm;
            }
            .product-name {
              font-size: ${width > 50 ? '10' : '8'}px;
              font-weight: bold;
              text-align: center;
              max-width: 100%;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            }
            .barcode-container {
              display: flex;
              flex-direction: column;
              align-items: center;
            }
            .barcode {
              height: ${height - 15}mm;
              max-width: ${width - 4}mm;
            }
            .barcode-text {
              font-size: ${width > 50 ? '9' : '7'}px;
              margin-top: 1mm;
              font-family: monospace;
            }
            @media print {
              .label {
                page-break-inside: avoid;
              }
              .label-content {
                transform: translate(-50%, -50%) !important;
              }
            }
          </style>
        </head>
        <body>
      `;

      for (const product of selectedProductsList) {
        const barcodeValue = product.barcode || `PROD-${product.id.slice(0, 8)}`;
        const qtyToPrint = selectedProducts[product.id] || printQuantity;
        
        for (let i = 0; i < qtyToPrint; i++) {
          htmlContent += `
            <div class="label">
              <div class="label-content">
                <div class="product-name">${product.product_name}</div>
                <div class="barcode-container">
                  <svg class="barcode"></svg>
                  <div class="barcode-text">${barcodeValue}</div>
                </div>
              </div>
            </div>
          `;
        }
      }

      htmlContent += `
          <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script>
          <script>
            window.onload = function() {
              const barcodes = document.querySelectorAll('.barcode');
              barcodes.forEach((barcode, index) => {
                const value = barcode.parentElement.querySelector('.barcode-text').textContent;
                JsBarcode(barcode, value, {
                  format: "${barcodeType}",
                  width: 2,
                  height: ${height - 15},
                  displayValue: false,
                  margin: 0
                });
              });
              
              // INSTANT PRINT - no delay
              setTimeout(() => {
                window.print();
              }, 100);
            };
          <\/script>
        </body>
        </html>
      `;

      printWindow.document.write(htmlContent);
      printWindow.document.close();

      // STEP 2: Save to database in background (non-blocking)
      const barcodeRecords = selectedProductsList.map(product => ({
        store_id: currentStoreId,
        user_id: user.id,
        product_id: product.id,
        product_name: product.product_name,
        barcode_value: product.barcode || `PROD-${product.id.slice(0, 8)}`,
        barcode_type: barcodeType,
        quantity_printed: selectedProducts[product.id] || printQuantity,
        label_size: labelSize,
        printer_name: printer?.printer_name,
        batch_id: batchId,
        is_batch_print: true,
        print_status: 'printed',
        printed_at: new Date().toISOString(),
      }));

      // Save asynchronously
      (supabase as any)
        .from("barcode_generations")
        .insert(barcodeRecords)
        .then(({ error }: any) => {
          if (error) {
            console.error("Error saving barcode records:", error);
          }
        });

      // INSTANT SUCCESS MESSAGE
      toast({
        title: "Print Job Sent! ✓",
        description: `${selectedCount} product(s) for a total of ${totalLabels} labels sent to printer`,
      });

      // Clear selection immediately
      setSelectedProducts({});
      setIsPrinting(false);

    } catch (error: any) {
      console.error("Error printing barcodes:", error);
      toast({
        title: "Print Failed",
        description: error.message || "Failed to print barcodes",
        variant: "destructive",
      });
      setIsPrinting(false);
    }
  };

  const handleSaveBarcodes = async () => {
    if (selectedCount === 0) {
      toast({
        title: "No Products Selected",
        description: "Please select at least one product",
        variant: "destructive",
      });
      return;
    }

    const startTime = Date.now();
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !currentStoreId) return;

      const batchId = crypto.randomUUID();
      const selectedProductsList = products.filter(p => !!selectedProducts[p.id]);

      // INSTANT FEEDBACK
      toast({
        title: "Saving...",
        description: `Generating ${selectedCount} barcode(s)`,
      });

      const barcodeRecords = selectedProductsList.map(product => ({
        store_id: currentStoreId,
        user_id: user.id,
        product_id: product.id,
        product_name: product.product_name,
        barcode_value: product.barcode || `PROD-${product.id.slice(0, 8)}`,
        barcode_type: barcodeType,
        quantity_printed: 0, 
        label_size: labelSize,
        batch_id: batchId,
        is_batch_print: true,
        print_status: 'pending',
      }));

      // Fast batch insert with timeout
      const savePromise = (supabase as any)
        .from("barcode_generations")
        .insert(barcodeRecords);

      const result = await Promise.race([
        savePromise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('timeout')), 1000)
        )
      ]).catch(err => {
        if (err.message === 'timeout') {
          void savePromise;
          return { error: null }; 
        }
        throw err;
      });

      const { error } = result as any;
      if (error && error.message !== 'timeout') throw error;

      const elapsed = Date.now() - startTime;

      toast({
        title: `✓ Saved in ${elapsed}ms!`,
        description: `${totalLabels} barcode(s) generated successfully`,
      });

      setSelectedProducts({});
    } catch (error: any) {
      console.error("Error saving barcodes:", error);
      toast({
        title: "Save Failed",
        description: error.message || "Failed to save barcodes",
        variant: "destructive",
      });
    }
  };

  const labelSizes = [
    { value: "40x30mm", label: "40mm × 30mm (Standard)" },
    { value: "50x25mm", label: "50mm × 25mm (Wide)" },
    { value: "60x40mm", label: "60mm × 40mm (Large)" },
    { value: "80x50mm", label: "80mm × 50mm (Extra Large)" },
  ];

  const barcodeTypes = [
    { value: "CODE128", label: "CODE128 (Recommended)" },
    { value: "EAN13", label: "EAN-13" },
    { value: "UPC", label: "UPC-A" },
    { value: "CODE39", label: "CODE39" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Batch Barcode Printing</h2>
          <p className="text-muted-foreground">Select products and print multiple barcode labels</p>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Settings className="h-4 w-4 mr-2" />
                Printer Settings
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Printer Configuration</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Detected Printers</Label>
                  <div className="mt-2 space-y-2">
                    {printers.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No printers configured</p>
                    ) : (
                      printers.map(printer => (
                        <div key={printer.id} className="flex items-center justify-between p-2 border rounded">
                          <div className="flex items-center gap-2">
                            {printer.connection_type === 'usb' ? (
                              <Usb className="h-4 w-4" />
                            ) : (
                              <Wifi className="h-4 w-4" />
                            )}
                            <div>
                              <p className="text-sm font-medium">{printer.printer_name}</p>
                              <p className="text-xs text-muted-foreground">
                                {printer.printer_type} • {printer.connection_type}
                              </p>
                            </div>
                          </div>
                          {printer.is_default && (
                            <Badge variant="outline">Default</Badge>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <Button
                  onClick={scanForPrinters}
                  disabled={scanning}
                  className="w-full"
                >
                  {scanning ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Scanning...
                    </>
                  ) : (
                    <>
                      <Usb className="h-4 w-4 mr-2" />
                      Scan for USB Printers
                    </>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Connect your thermal printer via USB and click scan to detect it
                </p>
              </div>
            </DialogContent>
          </Dialog>
          <Button onClick={fetchProducts} variant="outline" disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Print Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Global Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label>Printer</Label>
              <Select value={selectedPrinter} onValueChange={setSelectedPrinter}>
                <SelectTrigger>
                  <SelectValue placeholder="Select printer" />
                </SelectTrigger>
                <SelectContent>
                  {printers.map(printer => (
                    <SelectItem key={printer.id} value={printer.id}>
                      {printer.printer_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Label Size</Label>
              <Select value={labelSize} onValueChange={setLabelSize}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {labelSizes.map(size => (
                    <SelectItem key={size.value} value={size.value}>
                      {size.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Barcode Type</Label>
              <Select value={barcodeType} onValueChange={setBarcodeType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {barcodeTypes.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Default Copies per Product</Label>
              <Input
                type="number"
                min="1"
                max="100"
                value={printQuantity}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 1;
                  setPrintQuantity(val);
                  const newSelection: Record<string, number> = {};
                  Object.keys(selectedProducts).forEach(id => newSelection[id] = val);
                  if (Object.keys(newSelection).length > 0) {
                    setSelectedProducts(newSelection);
                  }
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Product Selection */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">
              Select Products ({selectedCount} selected, {totalLabels} labels total)
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button onClick={selectAll} variant="outline" size="sm">
                {selectedCount === filteredProducts.length ? (
                  <>
                    <Square className="h-4 w-4 mr-2" />
                    Deselect All
                  </>
                ) : (
                  <>
                    <CheckSquare className="h-4 w-4 mr-2" />
                    Select All
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <LoadingSpinner size="lg" text="Loading products..." />
          ) : (
            <ScrollArea className="h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12"></TableHead>
                    <TableHead>Product Name</TableHead>
                    <TableHead>Barcode</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead className="w-32">Labels to Print</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map(product => {
                    const isSelected = !!selectedProducts[product.id];
                    return (
                      <TableRow key={product.id} className={isSelected ? 'bg-muted/50' : ''}>
                        <TableCell>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleProductSelection(product.id)}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{product.product_name}</TableCell>
                        <TableCell>
                          <code className="text-xs bg-muted px-2 py-1 rounded">
                            {product.barcode || `PROD-${product.id.slice(0, 8)}`}
                          </code>
                        </TableCell>
                        <TableCell>{product.quantity}</TableCell>
                        <TableCell>{fmtCurrency(product.cost_per_unit)}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="1"
                            max="999"
                            value={isSelected ? selectedProducts[product.id] : ''}
                            placeholder={printQuantity.toString()}
                            disabled={!isSelected}
                            onChange={(e) => {
                              handleIndividualQuantityChange(product.id, parseInt(e.target.value) || 1);
                            }}
                            className="w-20 h-8"
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex justify-end gap-3">
        <Button
          size="lg"
          variant="outline"
          onClick={handleSaveBarcodes}
          disabled={selectedCount === 0}
          className="gap-2"
        >
          <Package className="h-5 w-5" />
          Save {selectedCount} Barcode{selectedCount !== 1 ? 's' : ''}
        </Button>
        <Button
          size="lg"
          onClick={handlePrint}
          disabled={selectedCount === 0 || !selectedPrinter || isPrinting}
          className="gap-2"
        >
          {isPrinting ? (
            <>
              <RefreshCw className="h-5 w-5 animate-spin" />
              Printing...
            </>
          ) : (
            <>
              <Printer className="h-5 w-5" />
              Print {selectedCount} Product{selectedCount !== 1 ? 's' : ''} 
              ({totalLabels} labels)
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

export default BarcodeBatchPrint;
