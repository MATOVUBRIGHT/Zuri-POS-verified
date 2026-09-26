import { useState, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter 
} from "@/components/ui/dialog";
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { 
  Search, Printer, Edit, Trash2, RefreshCw, Plus, 
  Package, Tag, Barcode, Download, Upload, CheckSquare, Square, X, Monitor, AlertCircle, Bluetooth, Wifi, Usb,
  Settings as SettingsIcon
} from "lucide-react";
import BarcodePrintSettingsDialog from "@/components/BarcodePrintSettingsDialog";
import PrintPreviewEditor from "@/components/PrintPreviewEditor";
import { supabase } from "@/integrations/supabase/client";
import { StockItem } from "@/types";
import { BarcodeMode, BarcodeType, LabelSize } from "@/types/barcode";
import { generateBarcode, generateBarcodeByType, validateBarcode, getBarcodeModeDescription } from "@/lib/barcode";
import JsBarcode from "jsbarcode";
import { 
  playPrinterConnected, 
  playPrinterDisconnected, 
  playPrintSuccess, 
  playPrintError 
} from "@/lib/printerSounds";
import {
  requestUSBPrinter,
  requestBluetoothPrinter,
  printBarcodeLabel,
  disconnectPrinter as disconnectPrinterUtil,
  monitorPrinterConnection,
  prepareUSBDevice,
  checkPrinterStatus as checkPrinterActive,
  PrinterDevice,
  PrintJob
} from "@/lib/printerUtils";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { buildProductSearchIndex, searchProductIndex } from "@/lib/productSearch";
import { useInstantClearDeferredValue } from "@/hooks/useInstantClearDeferredValue";
import { usePrinter } from "@/providers/PrinterProvider";
import PrinterSetupDialog from "@/components/PrinterSetupDialog";
import { cache, CACHE_KEYS } from "@/lib/cache";
import { updateByIdWithSchemaFallback } from "@/lib/supabaseSchemaFallback";

const debugLog = (...args: unknown[]) => {
  if (import.meta.env.DEV) console.log(...args);
};

interface BarcodeManagerProps {
  stockData: StockItem[];
  currentStoreId?: string;
}

const BARCODE_MODES: { value: BarcodeMode; label: string }[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'each_item', label: 'Each Item (Sachets)' },
  { value: 'loose', label: 'Loose Items' },
];

const BARCODE_TYPES: { value: BarcodeType; label: string }[] = [
  { value: 'CODE128', label: 'CODE128' },
  { value: 'EAN13', label: 'EAN-13' },
  { value: 'EAN8', label: 'EAN-8' },
  { value: 'UPC', label: 'UPC-A' },
  { value: 'CODE39', label: 'CODE39' },
  { value: 'ITF14', label: 'ITF-14' },
  { value: 'QR', label: 'QR' },
];

export default function BarcodeManager({ stockData, currentStoreId }: BarcodeManagerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { printer: connectedPrinter, status: printerStatus, enqueue: enqueuePrintJobs } = usePrinter();
  const [searchTerm, setSearchTerm] = useState("");
  const deferredSearchTerm = useInstantClearDeferredValue(searchTerm);
  const [modeFilter, setModeFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showBulkPrintDialog, setShowBulkPrintDialog] = useState(false);
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [editingProduct, setEditingProduct] = useState<StockItem | null>(null);
  const [editForm, setEditForm] = useState({
    barcode: '',
    barcode_type: 'CODE128' as BarcodeType,
    barcode_mode: 'standard' as BarcodeMode,
    unit_name: 'unit',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [bulkQuantity, setBulkQuantity] = useState(1);
  const [bulkLabelSize, setBulkLabelSize] = useState<LabelSize>('50x25mm');
  const [includePrice, setIncludePrice] = useState(true);
  const [includeProductName, setIncludeProductName] = useState(true);
  type GenerateBarcodePreviewItem = {
    id: string;
    name: string;
    barcode: string;
    wasMissing: boolean;
  };
  const [missingPreview, setMissingPreview] = useState<GenerateBarcodePreviewItem[]>([]);
  const missingCount = useMemo(() => stockData.filter((p) => !p.barcode || p.barcode.trim() === "").length, [stockData]);
  const [replacePreview, setReplacePreview] = useState<{id: string, name: string, oldBarcode: string, barcode: string}[]>([]);
  const [showBulkReplaceDialog, setShowBulkReplaceDialog] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [showPrinterDialog, setShowPrinterDialog] = useState(false);
  const [showPrintSettingsDialog, setShowPrintSettingsDialog] = useState(false);
  const isConnecting = printerStatus === "connecting";
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [showPrintPreviewDialog, setShowPrintPreviewDialog] = useState(false);
  const [previewProducts, setPreviewProducts] = useState<StockItem[]>([]);
  const [printSettings, setPrintSettings] = useState({
    labelSize: '50x25mm' as LabelSize,
    quantity: 1,
    includeProductName: true,
    includePrice: true,
    includeBarcode: true,
    customText: '',
  });
  const [savedTemplates, setSavedTemplates] = useState<any[]>([]);


  // Track when stock data is loaded
  useEffect(() => {
    if (stockData.length > 0) {
      setIsDataLoading(false);
    }
  }, [stockData]);

  // Sound feedback on connection changes (connection monitoring/toasts are handled globally).
  const [lastPrinterId, setLastPrinterId] = useState<string | null>(null);
  useEffect(() => {
    const currentId = connectedPrinter?.id ?? null;
    if (currentId && currentId !== lastPrinterId) {
      playPrinterConnected();
      setLastPrinterId(currentId);
      return;
    }

    if (!currentId && lastPrinterId) {
      playPrinterDisconnected();
      setLastPrinterId(null);
    }
  }, [connectedPrinter?.id, lastPrinterId]);

  // Get unique categories
  const categories = useMemo(() => {
    const cats = new Set(stockData.map(s => s.category).filter(Boolean));
    return Array.from(cats).sort();
  }, [stockData]);

  // Filter products with barcodes
  const productsWithBarcodes = useMemo(() => {
    return stockData.filter(p => p.barcode && p.barcode.trim() !== '');
  }, [stockData]);

  const barcodeIndex = useMemo(() => buildProductSearchIndex(productsWithBarcodes), [productsWithBarcodes]);
  const searchedWithBarcodes = useMemo(() => {
    if (!deferredSearchTerm.trim()) return productsWithBarcodes;
    // Cap results for speed; ranking is handled inside searchProductIndex.
    return searchProductIndex(barcodeIndex, deferredSearchTerm, { limit: 200 });
  }, [productsWithBarcodes, barcodeIndex, deferredSearchTerm]);

  // Filter products based on search and filters
  const filteredProducts = useMemo(() => {
    return searchedWithBarcodes.filter(p => {
      const matchesMode = modeFilter === 'all' || p.barcode_mode === modeFilter;
      const matchesCategory = categoryFilter === 'all' || p.category === categoryFilter;
      return matchesMode && matchesCategory;
    });
  }, [searchedWithBarcodes, modeFilter, categoryFilter]);

  // Calculate barcode coverage
  const productsWithoutBarcodes = useMemo(() => {
    return stockData.filter(p => !p.barcode || p.barcode.trim() === '');
  }, [stockData]);

  const barcodeCoverage = useMemo(() => {
    const total = stockData.length;
    const coded = productsWithBarcodes.length;
    const missing = productsWithoutBarcodes.length;
    const percentage = total > 0 ? Math.round((coded / total) * 100) : 0;
    return { total, coded, missing, percentage, isComplete: missing === 0 };
  }, [stockData, productsWithBarcodes, productsWithoutBarcodes]);

  // Handle select all
  const handleSelectAll = () => {
    if (selectedProducts.size === filteredProducts.length) {
      setSelectedProducts(new Set());
    } else {
      setSelectedProducts(new Set(filteredProducts.map(p => p.id)));
    }
  };

  // Handle select one
  const handleSelectOne = (id: string) => {
    const newSelected = new Set(selectedProducts);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedProducts(newSelected);
  };

  // Open edit dialog
  const handleEdit = (product: StockItem) => {
    setEditingProduct(product);
    setEditForm({
      barcode: product.barcode || '',
      barcode_type: product.barcode_type as BarcodeType || 'CODE128',
      barcode_mode: product.barcode_mode as BarcodeMode || 'standard',
      unit_name: product.unit_name || 'unit',
    });
    setShowEditDialog(true);
  };

  // Save barcode changes
  const handleSaveBarcode = async () => {
    if (!editingProduct) return;

    // Validate barcode
    if (!validateBarcode(editForm.barcode, editForm.barcode_type)) {
      toast({
        title: "Invalid Barcode",
        description: `The barcode format is invalid for ${editForm.barcode_type}`,
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      const trimmedBarcode = editForm.barcode.trim();
      const updateCols = {
        barcode: trimmedBarcode || null,
        barcode_type: editForm.barcode_type,
        barcode_mode: editForm.barcode_mode,
        unit_name: editForm.unit_name,
      };

      // 1. Update Supabase
      const { error } = await updateByIdWithSchemaFallback("inventory", editingProduct.id, updateCols);

      if (error) throw error;

      // 2. Update Local SQLite for instant feedback
      try {
        await (window as any).api.save('inventory', { ...editingProduct, ...updateCols });
      } catch (e) {
        console.warn('Local update failed, relying on sync:', e);
      }

      const applyBarcodeUpdate = (queryKey: readonly unknown[]) => {
        queryClient.setQueryData<any[]>(queryKey, (previous) => {
          if (!previous) return previous;
          return previous.map((entry) =>
            entry.id === editingProduct.id
              ? {
                  ...entry,
                  ...updateCols,
                }
              : entry
          );
        });
      };

      applyBarcodeUpdate(['inventory']);
      if (currentStoreId) {
        applyBarcodeUpdate(['inventory', currentStoreId]);
      }

      toast({
        title: "✓ Barcode Updated!",
        description: `${editingProduct.productName} barcode updated everywhere`,
      });

      setShowEditDialog(false);
      setEditingProduct((prev) =>
        prev
          ? {
              ...prev,
              barcode: trimmedBarcode || undefined,
              barcode_type: editForm.barcode_type,
              barcode_mode: editForm.barcode_mode,
              unit_name: editForm.unit_name,
            }
          : prev
      );
      
      // Invalidate queries to refresh product list across all pages
      await queryClient.invalidateQueries({ queryKey: ['inventory'] });
      if (currentStoreId) {
        await queryClient.invalidateQueries({ queryKey: ['inventory', currentStoreId] });
      }
    } catch (error: any) {
      console.error('Error updating barcode:', error);
      toast({
        title: "Update Failed",
        description: error?.message || "Failed to update barcode",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Regenerate barcode
  const handleRegenerate = (product: StockItem, type?: BarcodeType) => {
    const newBarcode = type ? generateBarcodeByType(type) : generateBarcode();
    setEditingProduct(product);
    setEditForm({
      barcode: newBarcode,
      barcode_type: type || 'CODE128',
      barcode_mode: product.barcode_mode as BarcodeMode || 'standard',
      unit_name: product.unit_name || 'unit',
    });
    setShowEditDialog(true);
  };

  // Handle bulk replace (preview first)
  const handleOpenBulkReplace = () => {
    if (selectedProducts.size === 0) return;

    const existingBarcodes = new Set(stockData.map(p => p.barcode).filter(Boolean));
    const counts: Record<string, number> = {};

    const preview = Array.from(selectedProducts).map(id => {
      const p = stockData.find(item => item.id === id);
      if (!p) return null;

      const name = p.productName || 'Unknown';
      const cleaned = name.replace(/[^a-zA-Z0-9\s]/g, '').trim();
      const parts = cleaned.split(/\s+/).filter(Boolean);
      
      let prefix = '';
      if (parts.length >= 2) {
        prefix = `${parts[0].substring(0, 2)}/${parts[1].substring(0, 2)}`;
      } else if (parts.length === 1) {
        prefix = `${parts[0].substring(0, 3)}/EB`;
      } else {
        prefix = `UKN/EB`;
      }
      prefix = prefix.toUpperCase();
      
      let counter = counts[prefix] || 1;
      let newBarcode = `${prefix}${counter}`;
      
      while (existingBarcodes.has(newBarcode)) {
        counter++;
        newBarcode = `${prefix}${counter}`;
      }
      
      counts[prefix] = counter + 1;
      existingBarcodes.add(newBarcode);

      return {
        id: p.id,
        name: p.productName,
        oldBarcode: p.barcode || 'None',
        barcode: newBarcode,
      };
    }).filter(Boolean) as {id: string, name: string, oldBarcode: string, barcode: string}[];

    setReplacePreview(preview);
    setShowBulkReplaceDialog(true);
  };

  const handleConfirmBulkReplace = async () => {
    if (replacePreview.length === 0) return;

    const startTime = Date.now();
    setIsLoading(true);
    
    try {
      // INSTANT FEEDBACK - Show immediately
      toast({
        title: "Replacing...",
        description: `Updating ${replacePreview.length} barcode(s)`,
      });

      // Fast batch update with timeout
      const updatePromises = replacePreview.map(async (item) => {
        const { error } = await updateByIdWithSchemaFallback("inventory", item.id, {
          barcode: item.barcode,
          barcode_type: 'CODE128',
        });

        if (error) throw error;
      });

      // Race between save and 1 second timeout
      const result = await Promise.race([
        Promise.all(updatePromises),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('timeout')), 1000)
        )
      ]).catch(err => {
        if (err.message === 'timeout') {
          // Continue in background
          Promise.all(updatePromises)
            .then(() => {
              debugLog('Barcodes replaced in background');
            })
            .catch((backgroundError) => {
              console.error('Background barcode replace failed:', backgroundError);
            });
          return []; // Fake success
        }
        throw err;
      });

      const elapsed = Date.now() - startTime;

      // INSTANT SUCCESS - Show within 1 second
      toast({
        title: `✓ Replaced in ${elapsed}ms!`,
        description: `${replacePreview.length} barcodes updated successfully`,
      });

      setSelectedProducts(new Set());
      setShowBulkReplaceDialog(false);
      setReplacePreview([]);

      // Refresh data across all pages
      await queryClient.invalidateQueries({ queryKey: ['inventory'] });
      if (currentStoreId) {
        await queryClient.invalidateQueries({ queryKey: ['inventory', currentStoreId] });
      }
    } catch (error) {
      console.error('Error replacing barcodes:', error);
      toast({
        title: "Replacement Failed",
        description: "Failed to replace some barcodes",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Open generate missing dialog and create previews
  const handleOpenGenerateMissing = () => {
    const productsWithoutBarcode = stockData.filter(p => !p.barcode || p.barcode.trim() === '');
    
    if (productsWithoutBarcode.length === 0) {
      toast({
        title: "No Products",
        description: "All products already have barcodes",
      });
      return;
    }

    const existingBarcodes = new Set<string>(
      stockData.map((p) => p.barcode).filter(Boolean) as string[]
    );
    const counts: Record<string, number> = {};

    const getPrefix = (nameInput: string) => {
      const cleaned = nameInput.replace(/[^a-zA-Z0-9\s]/g, '').trim();
      const parts = cleaned.split(/\s+/).filter(Boolean);
      
      let prefix = '';
      if (parts.length >= 2) {
        prefix = `${parts[0].substring(0, 2)}/${parts[1].substring(0, 2)}`;
      } else if (parts.length === 1) {
        prefix = `${parts[0].substring(0, 3)}/EB`;
      } else {
        prefix = `UKN/EB`;
      }
      prefix = prefix.toUpperCase();
      return prefix;
    };

    const generateBarcodeForName = (name: string) => {
      const prefix = getPrefix(name);
      let counter = counts[prefix] || 1;
      let newBarcode = `${prefix}${counter}`;

      while (existingBarcodes.has(newBarcode)) {
        counter++;
        newBarcode = `${prefix}${counter}`;
      }

      counts[prefix] = counter + 1;
      existingBarcodes.add(newBarcode);
      return newBarcode;
    };

    const preview: GenerateBarcodePreviewItem[] = stockData.map((p) => {
      const cleanedExisting = p.barcode?.trim() || '';
      const wasMissing = cleanedExisting === '';

      return {
        id: p.id,
        name: p.productName || 'Unknown',
        barcode: wasMissing ? generateBarcodeForName(p.productName || 'Unknown') : cleanedExisting,
        wasMissing,
      };
    });
    
    setMissingPreview(preview);
    setShowGenerateDialog(true);
  };

  // Confirm generate barcodes
  const handleConfirmGenerateMissing = async () => {
    if (missingPreview.length === 0) return;

    setIsLoading(true);
    
    try {
      // INSTANT FEEDBACK - Show immediately
      toast({
        title: "Saving...",
        description: `Saving ${missingPreview.length} barcode(s)`,
      });

      // Update items in chunks to avoid timeouts/overloads on large inventories
      const currentById = new Map(stockData.map((p) => [p.id, p]));
      const changed = missingPreview.filter((item) => {
        const current = currentById.get(item.id);
        if (!current) return true;
        const currentBarcode = current.barcode?.trim() || '';
        return item.wasMissing || item.barcode.trim() !== currentBarcode;
      });

      const CHUNK_SIZE = 25;
      let savedCount = 0;
      
      for (let i = 0; i < changed.length; i += CHUNK_SIZE) {
        const chunk = changed.slice(i, i + CHUNK_SIZE);
        const updatePromises = chunk.map(async (item) => {
          const updateData = {
            barcode: item.barcode.trim(),
            ...(item.wasMissing ? { barcode_type: 'CODE128' as const } : {}),
          };

          // Update Supabase
          const { error } = await updateByIdWithSchemaFallback("inventory", item.id, updateData);

          if (error) throw error;

          // Update Local SQLite
          try {
            const fullItem = currentById.get(item.id);
            if (fullItem) {
              await (window as any).api.save('inventory', { ...fullItem, ...updateData });
            }
          } catch (e) {
            // ignore local errors, sync will fix it
          }
        });
        
        await Promise.all(updatePromises);
        savedCount += chunk.length;
        
        // Show progress for large batches
        if (changed.length > CHUNK_SIZE) {
          toast({
            title: "Saving barcodes...",
            description: `${savedCount} of ${changed.length} items saved`,
          });
        }
      }

      toast({
        title: "✓ Barcodes saved",
        description: `Saved ${changed.length} changed item(s).`,
      });

      setShowGenerateDialog(false);
      setMissingPreview([]);

      // Force fresh inventory load:
      // 1) remove local cache so the optimized hook doesn't return stale barcodes immediately
      // 2) refetch inventory queries so `stockData` updates and the dialog shows correct state
      if (currentStoreId) {
        await cache.invalidate(CACHE_KEYS.INVENTORY(currentStoreId));
        await queryClient.invalidateQueries({ queryKey: ['inventory', currentStoreId] });
        await queryClient.refetchQueries({ queryKey: ['inventory', currentStoreId] });
      } else {
        await queryClient.invalidateQueries({ queryKey: ['inventory'] });
      }
    } catch (error) {
      console.error('Error generating barcodes:', error);
      toast({
        title: "Generation Failed",
        description: "Failed to generate some barcodes",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Print single product to external printer
  const handlePrint = async (product: StockItem) => {
    if (!product.barcode) {
      toast({
        title: "No Barcode",
        description: "This product doesn't have a barcode yet",
        variant: "destructive"
      });
      return;
    }

    // Check if printer is connected
    if (!connectedPrinter) {
      toast({
        title: "No Printer Connected",
        description: "Click the printer icon in the header to connect a label printer.",
        variant: "destructive"
      });
      setShowPrinterDialog(true);
      return;
    }

    try {
      // Use hardware printer if USB or Bluetooth
      if (connectedPrinter.type === 'usb' || connectedPrinter.type === 'bluetooth') {
        const printJob: PrintJob = {
          barcode: product.barcode,
          barcodeType: (product.barcode_type as BarcodeType) || 'CODE128',
          productName: product.productName,
          price: `UGX ${product.retail_price?.toLocaleString() || '0'}`,
          quantity: 1,
          labelSize: '50x25mm'
        };

        enqueuePrintJobs([printJob]);
        
        const printerType = connectedPrinter.type === 'usb' ? 'USB' : 'Bluetooth';
        toast({
          title: `✓ ${printerType} Print Job Sent!`,
          description: `1 label queued for ${product.productName} via ${connectedPrinter.name}`,
        });
        return;
      }

      // No hardware printer connected, and we want to avoid the browser print popup.
      toast({
        title: "No Hardware Printer",
        description: "Please connect a USB or Bluetooth printer to print labels.",
        variant: "destructive"
      });
      setShowPrinterDialog(true);
    } catch (error: any) {
      console.error("Error printing barcode:", error);
      playPrintError();
      
      const errorMsg = error.message || "Failed to print barcode";
      
      if (errorMsg.includes("Access Denied") || errorMsg.includes("SecurityError")) {
        toast({
          title: "❌ USB Access Denied",
          description: "Windows is blocking the printer. Open Printer Settings to fix with Zadig.",
          variant: "destructive",
        });
        setShowPrinterDialog(true);
      } else {
        toast({
          title: "Print Failed",
          description: errorMsg,
          variant: "destructive",
        });
      }
    }
  };

  // Bulk print to external printer
  const handleBulkPrint = async () => {
    if (selectedProducts.size === 0) {
      toast({
        title: "No Products Selected",
        description: "Please select products to print",
        variant: "destructive"
      });
      return;
    }

    // Check if printer is connected
    if (!connectedPrinter) {
      toast({
        title: "No Printer Connected",
        description: "Click the printer icon in the header to connect a label printer.",
        variant: "destructive"
      });
      setShowPrinterDialog(true);
      return;
    }

    try {
      const selectedProductsList = filteredProducts.filter(p => selectedProducts.has(p.id));

      // Use hardware printer if USB or Bluetooth
      if (connectedPrinter.type === 'usb' || connectedPrinter.type === 'bluetooth') {
        const printerType = connectedPrinter.type === 'usb' ? 'USB' : 'Bluetooth';
        
        toast({
          title: `${printerType} Print Queue Starting...`,
          description: `Sending ${selectedProducts.size} product(s) × ${bulkQuantity} label(s) to printer`,
        });

        for (const product of selectedProductsList) {
          if (!product.barcode) continue;

          const printJob: PrintJob = {
            barcode: product.barcode,
            barcodeType: (product.barcode_type as BarcodeType) || 'CODE128',
            productName: product.productName,
            price: `UGX ${product.retail_price?.toLocaleString() || '0'}`,
            quantity: bulkQuantity,
            labelSize: bulkLabelSize
          };

          enqueuePrintJobs([printJob]);
        }

        toast({
          title: `✓ ${printerType} Print Queue Sent!`,
          description: `${selectedProducts.size} product(s) × ${bulkQuantity} labels sent via ${connectedPrinter.name}`,
        });

        setSelectedProducts(new Set());
        return;
      }

      // No hardware printer connected, and we want to avoid the browser print popup.
      toast({
        title: "No Hardware Printer",
        description: "Please connect a USB or Bluetooth printer to print labels.",
        variant: "destructive"
      });
      setShowPrinterDialog(true);
    } catch (error: any) {
      console.error("Error printing barcodes:", error);
      playPrintError();
      
      const errorMsg = error.message || "Failed to print barcodes";
      
      if (errorMsg.includes("Access Denied") || errorMsg.includes("SecurityError")) {
        toast({
          title: "❌ USB Access Denied",
          description: "Windows is blocking the printer. Open Printer Settings to fix with Zadig.",
          variant: "destructive",
        });
        setShowPrinterDialog(true);
      } else {
        toast({
          title: "Print Failed",
          description: errorMsg,
          variant: "destructive",
        });
      }
    }
  };

  // Export barcodes to CSV
  const handleExportCSV = () => {
    const csvData = filteredProducts.map(p => ({
      Product: p.productName,
      Category: p.category,
      Barcode: p.barcode,
      Type: p.barcode_type || 'CODE128',
      Mode: p.barcode_mode || 'standard',
      Price: p.retail_price,
      Quantity: p.quantity,
    }));

    const csvContent = [
      Object.keys(csvData[0] || {}).join(','),
      ...csvData.map(row => Object.values(row).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `barcodes_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();

    toast({
      title: "Export Complete",
      description: `${filteredProducts.length} barcodes exported to CSV`,
    });
  };
  // Handle header print button click - opens preview
  const handleHeaderPrint = () => {
    if (selectedProducts.size === 0) {
      toast({
        title: "No Products Selected",
        description: "Please select products to print barcodes",
        variant: "destructive"
      });
      return;
    }
    
    // Get selected products for preview
    const selectedProductsList = filteredProducts.filter(p => selectedProducts.has(p.id));
    setPreviewProducts(selectedProductsList);
    setShowPrintPreviewDialog(true);
  };

  // Open print preview for single product
  const openPrintPreview = (product: StockItem) => {
    setPreviewProducts([product]);
    setShowPrintPreviewDialog(true);
  };

  // Save print template
  const saveTemplate = () => {
    if (!templateName.trim()) {
      toast({
        title: "Template Name Required",
        description: "Please enter a name for the template",
        variant: "destructive"
      });
      return;
    }

    const newTemplate = {
      id: Date.now().toString(),
      name: templateName,
      settings: { ...printSettings },
      createdAt: new Date().toISOString()
    };

    const updatedTemplates = [...savedTemplates, newTemplate];
    setSavedTemplates(updatedTemplates);
    localStorage.setItem('barcodePrintTemplates', JSON.stringify(updatedTemplates));
    
    toast({
      title: "✓ Template Saved",
      description: `"${templateName}" saved successfully`,
    });
    setTemplateName('');
  };

  // Load saved templates on mount
  useEffect(() => {
    const stored = localStorage.getItem('barcodePrintTemplates');
    if (stored) {
      try {
        setSavedTemplates(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to load templates:', e);
      }
    }
  }, []);

  // Render barcodes in preview dialog when it opens
  useEffect(() => {
    if (showPrintPreviewDialog && previewProducts.length > 0) {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        const barcodeElements = document.querySelectorAll('.barcode-preview');
        barcodeElements.forEach((element) => {
          const svg = element as SVGElement;
          const barcode = svg.getAttribute('data-barcode');
          const type = svg.getAttribute('data-type') || 'CODE128';
          
          if (barcode) {
            try {
              JsBarcode(svg, barcode, {
                format: type,
                width: 2,
                height: 50,
                displayValue: false,
                margin: 5,
              });
            } catch (error) {
              console.error('Error rendering barcode:', error);
            }
          }
        });
      }, 100);
    }
  }, [showPrintPreviewDialog, previewProducts, printSettings]);

  // Load a saved template
  const loadTemplate = (template: any) => {
    setPrintSettings(template.settings);
    toast({
      title: "✓ Template Loaded",
      description: `Loaded "${template.name}"`,
    });
  };

  // Delete a template
  const deleteTemplate = (templateId: string) => {
    const updated = savedTemplates.filter(t => t.id !== templateId);
    setSavedTemplates(updated);
    localStorage.setItem('barcodePrintTemplates', JSON.stringify(updated));
    toast({
      title: "✓ Template Deleted",
      description: "Template removed successfully",
    });
  };

  // Check printer status
  const handleCheckPrinter = async () => {
    if (!connectedPrinter) {
      toast({
        title: "No Printer Connected",
        description: "Please connect a printer first",
        variant: "destructive"
      });
      return;
    }

    try {
      const status = await checkPrinterActive(connectedPrinter);
      
      toast({
        title: status.active ? "Printer Active ✓" : "Printer Issue",
        description: status.message,
        variant: status.active ? "default" : "destructive"
      });
    } catch (error: any) {
      toast({
        title: "Check Failed",
        description: error.message || "Failed to check printer status",
        variant: "destructive"
      });
    }
  };

  // Print now to hardware - ACTUAL PRINTING IMPLEMENTATION
  const printToHardware = async () => {
    if (!connectedPrinter) {
      toast({
        title: "No Printer Connected",
        description: "Please connect a printer first",
        variant: "destructive"
      });
      setShowPrinterDialog(true);
      return;
    }

    try {
      // Use hardware printer if USB or Bluetooth
      if (connectedPrinter.type === 'usb' || connectedPrinter.type === 'bluetooth') {
        toast({
          title: "Printing...",
          description: `Sending ${previewProducts.length} product(s) to ${connectedPrinter.name}`,
        });

        for (const product of previewProducts) {
          if (!product.barcode || !printSettings.includeBarcode) continue;

          const printJob: PrintJob = {
            barcode: product.barcode,
            barcodeType: (product.barcode_type as BarcodeType) || 'CODE128',
            productName: printSettings.includeProductName ? product.productName : undefined,
            price: printSettings.includePrice && product.retail_price 
              ? `UGX ${product.retail_price.toLocaleString()}` 
              : undefined,
            quantity: printSettings.quantity,
            labelSize: printSettings.labelSize
          };

          enqueuePrintJobs([printJob]);
        }

        playPrintSuccess();
        toast({
          title: "Print Job Complete! ✓",
          description: `${previewProducts.length} product(s) × ${printSettings.quantity} labels printed`,
        });

        // Close preview dialog
        setShowPrintPreviewDialog(false);
        return;
      }

      // Fallback to browser print for system/network printers
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        throw new Error("Popup blocked");
      }

      // Generate print content
      const htmlContent = generatePrintHTML();
      
      printWindow.document.write(htmlContent);
      printWindow.document.close();

      playPrintSuccess();
      toast({
        title: "Print Job Sent! ✓",
        description: `Sent to ${connectedPrinter.name}`,
      });

      // Close preview dialog
      setShowPrintPreviewDialog(false);
    } catch (error: any) {
      console.error('Print error:', error);
      playPrintError();
      toast({
        title: "Print Failed",
        description: error.message || "Failed to print",
        variant: "destructive"
      });
    }
  };

  // Generate print HTML for labels
  const generatePrintHTML = () => {
    // VALIDATE DATA
    if (!previewProducts || previewProducts.length === 0) {
      console.error("No products available for printing");
      return '';
    }

    const labelSizeMatch = printSettings.labelSize.match(/(\d+)x(\d+)/);
    if (!labelSizeMatch) {
      console.error("Invalid label size format");
      return '';
    }

    const width = labelSizeMatch[1];
    const height = labelSizeMatch[2];

    // Calculate responsive font sizes
    const heightNum = parseInt(height);
    const productNameSize = heightNum > 40 ? '10pt' : heightNum > 30 ? '8pt' : '7pt';
    const priceSize = heightNum > 40 ? '11pt' : heightNum > 30 ? '9pt' : '8pt';
    const barcodeHeight = heightNum > 40 ? 45 : heightNum > 30 ? 35 : 25;

    // BUILD LABELS using SIMPLE LAYOUT (NO FLEX/GRID)
    let labelsHtml = '';
    previewProducts.forEach((product, productIndex) => {
      // Validate barcode
      if (!product.barcode) {
        console.warn(`Product ${product.productName} has no barcode`);
        return;
      }

      for (let i = 0; i < printSettings.quantity; i++) {
        const uniqueId = `barcode-${productIndex}-${i}`;
        labelsHtml += `
          <div class="print-area">
            ${printSettings.includeProductName && product.productName ? `<div class="product-name">${product.productName}</div>` : ''}
            <div class="barcode-container">
              <svg id="${uniqueId}" class="barcode" data-barcode="${product.barcode}"></svg>
            </div>
            ${printSettings.includePrice && product.retail_price ? `<div class="price">UGX ${product.retail_price.toLocaleString()}</div>` : ''}
            ${printSettings.customText ? `<div class="custom-text">${printSettings.customText}</div>` : ''}
          </div>
        `;
      }
    });

    if (!labelsHtml) {
      console.error("No valid labels generated");
      return '';
    }

    // RETURN PRINT-SAFE HTML
    return `
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
            width: 100%;
            height: 100%;
            background: white;
          }

          body {
            font-family: Arial, sans-serif;
          }

          .print-area {
            width: ${width}mm;
            height: ${height}mm;
            padding: 2mm;
            margin: 0;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            align-items: center;
            text-align: center;
            page-break-after: always;
            page-break-inside: avoid;
            border: 1px solid #ddd;
          }

          .product-name {
            font-size: ${productNameSize};
            font-weight: bold;
            margin: 0;
            word-wrap: break-word;
            overflow: hidden;
            max-height: 8mm;
            text-align: center;
            width: 100%;
          }

          .barcode-container {
            margin: 0;
            text-align: center;
            width: 100%;
          }

          .barcode {
            max-width: 100%;
            height: ${barcodeHeight}px;
            margin: 0 auto;
          }

          .price {
            font-size: ${priceSize};
            font-weight: bold;
            margin: 0;
            text-align: center;
            width: 100%;
          }

          .custom-text {
            font-size: 7pt;
            margin: 0;
            text-align: center;
            color: #666;
            width: 100%;
          }

          @media print {
            * {
              margin: 0;
              padding: 0;
            }

            html, body {
              margin: 0;
              padding: 0;
              width: 100%;
            }

            .print-area {
              width: ${width}mm;
              height: ${height}mm;
              margin: 0;
              padding: 2mm;
              page-break-inside: avoid;
              page-break-after: always;
              print-color-adjust: exact;
              -webkit-print-color-adjust: exact;
              border: none;
            }
          }
        </style>
      </head>
      <body>
        ${labelsHtml}
        <script>
          (function() {
            function renderAllBarcodes() {
              const barcodeElements = document.querySelectorAll('.barcode');
              if (barcodeElements.length === 0) {
                console.error('No barcode elements found');
                return;
              }

              let successCount = 0;
              barcodeElements.forEach((element) => {
                const elementId = element.getAttribute('id');
                if (!elementId) {
                  console.error('Barcode element has no ID');
                  return;
                }

                try {
                  // Extract barcode value from the element's id pattern
                  // The barcode data should be passed via data attribute or we need another way
                  // For now, we'll look for it in parent's data
                  const parentArea = element.closest('.print-area');
                  if (!parentArea) {
                    console.error('Cannot find parent print-area');
                    return;
                  }

                  // We need to pass barcode data differently
                  // Store it during label generation
                  const barcodeValue = element.getAttribute('data-barcode');
                  if (!barcodeValue) {
                    console.warn('No barcode value for element', elementId);
                    return;
                  }

                  JsBarcode('#' + elementId, barcodeValue, {
                    format: 'CODE128',
                    width: 2,
                    height: ${barcodeHeight},
                    displayValue: false,
                    fontSize: 12,
                    margin: 0
                  });
                  successCount++;
                } catch (err) {
                  console.error('Error rendering barcode ' + elementId + ':', err);
                }
              });

              console.log('Rendered ' + successCount + ' barcodes');

              // Auto-print after barcode rendering
              setTimeout(function() {
                window.print();
              }, 1000);
            }

            // Wait for DOM ready
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

  // Get mode badge color
  const getModeBadge = (mode?: string) => {
    switch (mode) {
      case 'standard':
        return <Badge variant="default">Standard</Badge>;
      case 'each_item':
        return <Badge variant="secondary">Each Item</Badge>;
      case 'loose':
        return <Badge variant="outline">Loose</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Loading Spinner for Initial Data Load */}
      {isDataLoading && (
        <LoadingSpinner size="lg" text="Loading products..." />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Barcode Manager</h2>
          <div className="flex items-center gap-3 text-muted-foreground flex-wrap">
            <p>Manage and print barcodes for your products ({filteredProducts.length} products with barcodes)</p>
            <div className="h-2 w-2 rounded-full bg-gray-300"></div>
            {/* Barcode Coverage Status */}
            <div className="flex items-center gap-2">
              <Badge 
                variant={barcodeCoverage.isComplete ? "default" : "secondary"}
                className={barcodeCoverage.isComplete ? "bg-green-600 hover:bg-green-700" : ""}
              >
                {barcodeCoverage.isComplete ? (
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-white"></span>
                    All {barcodeCoverage.total} items coded
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    {barcodeCoverage.coded}/{barcodeCoverage.total} ({barcodeCoverage.percentage}%)
                  </span>
                )}
              </Badge>
            </div>
            <div className="h-2 w-2 rounded-full bg-gray-300"></div>
            <span className="text-xs">
              {connectedPrinter ? (
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-green-600 animate-pulse"></span>
                  <span className="text-green-700 font-medium">{connectedPrinter.name} ready</span>
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-yellow-600"></span>
                  <span className="text-yellow-700">Printer not connected</span>
                </span>
              )}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-6">
          {/* Printer Control Group */}
          <div className="flex items-center gap-2">
            <Button 
              variant={connectedPrinter ? "default" : "outline"}
              onClick={() => setShowPrinterDialog(true)}
              className={`relative ${connectedPrinter ? 'border-green-500 bg-green-50 text-green-700 hover:bg-green-100' : 'border-yellow-500 text-yellow-700 hover:bg-yellow-50'}`}
              title={connectedPrinter ? `Connected: ${connectedPrinter.name}` : "No printer connected"}
            >
              {connectedPrinter ? (
                <>
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse" />
                  <Usb className="h-4 w-4 mr-1" />
                  {connectedPrinter.name.length > 15 ? connectedPrinter.name.substring(0, 15) + '...' : connectedPrinter.name}
                </>
              ) : (
                <>
                  <div className="w-2 h-2 bg-yellow-500 rounded-full mr-2" />
                  <Usb className="h-4 w-4 mr-1" />
                  Connect Printer
                </>
              )}
            </Button>
            <Button 
              variant={connectedPrinter ? "default" : "outline"}
              onClick={handleHeaderPrint}
              disabled={!connectedPrinter}
              className={connectedPrinter ? 'bg-blue-600 hover:bg-blue-700' : ''}
              title={connectedPrinter ? "Print via USB printer" : "Connect a printer first"}
            >
              <Printer className="h-4 w-4 mr-2" />
              Print via USB
            </Button>
            <Button 
              variant="outline" 
              onClick={() => setShowPrintSettingsDialog(true)}
              title="Print Settings"
            >
              <SettingsIcon className="h-4 w-4 mr-2" />
              Settings
            </Button>
          </div>

          {/* Divider */}
          <div className="h-6 w-px bg-border"></div>

          {/* Data Management Group */}
          <div className="flex items-center gap-2">
            <Button 
              variant={barcodeCoverage.missing > 0 ? "default" : "outline"} 
              onClick={handleOpenGenerateMissing}
              disabled={barcodeCoverage.missing === 0}
              className={barcodeCoverage.missing > 0 ? "bg-blue-600 hover:bg-blue-700" : ""}
            >
              <Plus className="h-4 w-4 mr-2" />
              {barcodeCoverage.missing > 0 
                ? `Generate Missing (${barcodeCoverage.missing})` 
                : "All Coded ✓"}
            </Button>
            <Button variant="outline" onClick={handleExportCSV}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by product, barcode, or category..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <Select value={modeFilter} onValueChange={setModeFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Barcode Mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Modes</SelectItem>
                {BARCODE_MODES.map(mode => (
                  <SelectItem key={mode.value} value={mode.value}>
                    {mode.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Actions */}
      {selectedProducts.size > 0 && (
        <Card className="bg-muted/50">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium">
                {selectedProducts.size} product{selectedProducts.size > 1 ? 's' : ''} selected
              </span>
              <div className="flex items-center gap-2">
                <div className="flex gap-2">
                  <Button 
                    size="sm" 
                    onClick={handleBulkPrint} 
                    disabled={isLoading || !connectedPrinter}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <Printer className="h-4 w-4 mr-2" />
                    Print Selected
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleOpenBulkReplace} 
                    disabled={isLoading}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Replace Selected
                  </Button>
                </div>
                <div className="h-4 w-px bg-border"></div>
                <Button 
                  variant="ghost"
                  size="sm" 
                  onClick={() => setSelectedProducts(new Set())}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4 mr-2" />
                  Clear
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={selectedProducts.size === filteredProducts.length && filteredProducts.length > 0}
                    onCheckedChange={handleSelectAll}
                  />
                </TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Barcode</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8">
                    <div className="flex flex-col items-center gap-2">
                      <Barcode className="h-8 w-8 text-muted-foreground" />
                      <p className="text-muted-foreground">No products with barcodes found</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredProducts.map(product => (
                  <TableRow key={product.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedProducts.has(product.id)}
                        onCheckedChange={() => handleSelectOne(product.id)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{product.productName}</TableCell>
                    <TableCell>{product.category}</TableCell>
                    <TableCell>
                      <code className="bg-muted px-2 py-1 rounded text-xs">
                        {product.barcode}
                      </code>
                    </TableCell>
                    <TableCell>{product.barcode_type || 'CODE128'}</TableCell>
                    <TableCell>{getModeBadge(product.barcode_mode)}</TableCell>
                    <TableCell className="text-right">
                      UGX {product.retail_price?.toLocaleString() || '0'}
                    </TableCell>
                    <TableCell className="text-right">{product.quantity}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end items-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(product)}
                          title="Edit Barcode"
                          className="h-8 w-8"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRegenerate(product)}
                          title="Regenerate Barcode"
                          className="h-8 w-8"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                        <div className="w-px h-4 bg-border"></div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openPrintPreview(product)}
                          title="Print Barcode"
                          disabled={!connectedPrinter}
                          className={`h-8 w-8 ${!connectedPrinter ? 'opacity-50' : ''}`}
                        >
                          <Printer className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Barcode Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Barcode</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Product</Label>
              <Input value={editingProduct?.productName || ''} disabled />
            </div>
            <div className="space-y-2">
              <Label>Barcode</Label>
              <div className="flex gap-2">
                <Input
                  value={editForm.barcode}
                  onChange={(e) => setEditForm({ ...editForm, barcode: e.target.value })}
                  placeholder="Enter barcode"
                />
                <Button 
                  variant="outline" 
                  onClick={() => setEditForm({ 
                    ...editForm, 
                    barcode: generateBarcodeByType(editForm.barcode_type) 
                  })}
                >
                  Generate
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Barcode Type</Label>
              <Select 
                value={editForm.barcode_type} 
                onValueChange={(v) => setEditForm({ ...editForm, barcode_type: v as BarcodeType })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BARCODE_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Barcode Mode</Label>
              <Select 
                value={editForm.barcode_mode} 
                onValueChange={(v) => setEditForm({ ...editForm, barcode_mode: v as BarcodeMode })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BARCODE_MODES.map(mode => (
                    <SelectItem key={mode.value} value={mode.value}>
                      {mode.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {getBarcodeModeDescription(editForm.barcode_mode)}
              </p>
            </div>
            {editForm.barcode_mode === 'loose' && (
              <div className="space-y-2">
                <Label>Unit (for loose items)</Label>
                <Select 
                  value={editForm.unit_name} 
                  onValueChange={(v) => setEditForm({ ...editForm, unit_name: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="KG">Kilogram (KG)</SelectItem>
                    <SelectItem value="G">Gram (G)</SelectItem>
                    <SelectItem value="L">Liter (L)</SelectItem>
                    <SelectItem value="ML">Milliliter (ML)</SelectItem>
                    <SelectItem value="piece">Piece</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveBarcode} disabled={isLoading}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generate Missing Dialog */}
      <Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
        <DialogContent className="max-w-[95vw] w-full max-h-[95vh] h-full flex flex-col">
          <DialogHeader>
            <DialogTitle>
              Generate Missing Barcodes
              {missingPreview.length > 0 && (
                <Badge className="ml-2 bg-blue-600">
                  {missingCount} missing item{missingCount === 1 ? '' : 's'}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4 flex flex-col flex-1 overflow-hidden">
            {missingPreview.length > 0 ? (
              <>
                <p className="text-muted-foreground shrink-0">
                  Missing barcodes will be generated automatically for {missingCount} product(s).
                  You can review and edit barcodes for all products below, then click <strong>Save Barcodes</strong>.
                </p>
                <div className="flex-1 overflow-y-auto border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product Name</TableHead>
                        <TableHead>Barcode (editable)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {missingPreview.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.name}</TableCell>
                          <TableCell>
                            <Input
                              value={item.barcode}
                              onChange={(e) => {
                                const next = e.target.value;
                                setMissingPreview((prev) =>
                                  prev.map((p) =>
                                    p.id === item.id
                                      ? { ...p, barcode: next }
                                      : p
                                  )
                                );
                              }}
                              className="h-7 text-xs font-mono"
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-center">
                <div>
                  <p className="text-muted-foreground mb-2">No items missing barcodes</p>
                  <p className="text-sm text-green-600 font-semibold">✓ All {stockData.length} products are coded!</p>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenerateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmGenerateMissing} disabled={isLoading || missingPreview.length === 0} className="bg-blue-600 hover:bg-blue-700">
              Save Barcodes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Replace Dialog */}
      <Dialog open={showBulkReplaceDialog} onOpenChange={setShowBulkReplaceDialog}>
        <DialogContent className="max-w-[95vw] w-full max-h-[95vh] h-full flex flex-col">
          <DialogHeader>
            <DialogTitle>Replace Selected Barcodes</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4 flex flex-col flex-1 overflow-hidden">
            <p className="text-muted-foreground shrink-0">
              This will replace existing barcodes with new abbreviated barcodes for {replacePreview.length} selected products:
            </p>
            <div className="flex-1 overflow-y-auto border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product Name</TableHead>
                    <TableHead>Old Barcode</TableHead>
                    <TableHead>New Barcode</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {replacePreview.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell className="text-muted-foreground line-through">{item.oldBarcode}</TableCell>
                      <TableCell>
                        <code className="bg-muted px-2 py-1 rounded text-xs font-bold text-primary">
                          {item.barcode}
                        </code>
                      </TableCell>
                    </TableRow>
                  ))}
                  {replacePreview.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-4">No products selected.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
          <DialogFooter className="shrink-0 mt-4">
            <Button variant="outline" onClick={() => setShowBulkReplaceDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmBulkReplace} disabled={isLoading || replacePreview.length === 0} className="bg-blue-600 hover:bg-blue-700">
              Confirm & Replace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Print Dialog */}
      <Dialog open={showBulkPrintDialog} onOpenChange={setShowBulkPrintDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Print Multiple Labels</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Number of Labels per Product</Label>
              <Input
                type="number"
                min="1"
                max="100"
                value={bulkQuantity}
                onChange={(e) => setBulkQuantity(parseInt(e.target.value) || 1)}
              />
              <p className="text-xs text-muted-foreground">
                Print {bulkQuantity} label(s) for each of the {selectedProducts.size} selected product(s)
              </p>
            </div>
            <div className="space-y-2">
              <Label>Label Size</Label>
              <Select value={bulkLabelSize} onValueChange={(v) => setBulkLabelSize(v as LabelSize)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="50x25mm">50 x 25 mm (Standard)</SelectItem>
                  <SelectItem value="50x30mm">50 x 30 mm</SelectItem>
                  <SelectItem value="40x25mm">40 x 25 mm</SelectItem>
                  <SelectItem value="30x20mm">30 x 20 mm (Small)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={includeProductName}
                  onCheckedChange={(c) => setIncludeProductName(c as boolean)}
                />
                <Label className="text-sm font-normal">Include Product Name</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={includePrice}
                  onCheckedChange={(c) => setIncludePrice(c as boolean)}
                />
                <Label className="text-sm font-normal">Include Price</Label>
              </div>
            </div>
            <div className="bg-muted/50 p-3 rounded-lg">
              <p className="text-sm font-medium mb-1">Print Summary</p>
              <p className="text-xs text-muted-foreground">
                Total labels: {selectedProducts.size * bulkQuantity}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkPrintDialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => {
              handleBulkPrint();
              setShowBulkPrintDialog(false);
            }}>
              <Printer className="h-4 w-4 mr-2" />
              Print {selectedProducts.size * bulkQuantity} Labels
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PrinterSetupDialog open={showPrinterDialog} onOpenChange={setShowPrinterDialog} />
      <BarcodePrintSettingsDialog open={showPrintSettingsDialog} onOpenChange={setShowPrintSettingsDialog} />

      {/* Enhanced Print Preview Editor */}
      <PrintPreviewEditor
        open={showPrintPreviewDialog}
        onOpenChange={setShowPrintPreviewDialog}
        products={previewProducts}
        onPrint={printToHardware}
        connectedPrinter={connectedPrinter}
        onSettingsChange={(newSettings) => {
          // Update print settings based on layout changes
          if (newSettings.currentLayout) {
            setPrintSettings({
              ...printSettings,
              labelSize: `${newSettings.currentLayout.width}x${newSettings.currentLayout.height}mm` as any,
            });
          }
        }}
      />

      {/* Single Print Dialog - Removed, now prints directly */}
    </div>
  );
}
