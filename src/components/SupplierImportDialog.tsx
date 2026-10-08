import React, { useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Upload, FileSpreadsheet, Eye, MapPin, Users, Plus, Check, AlertCircle, Loader2 } from "lucide-react";
import { logAudit } from "@/lib/audit";

// Excel support via CDN
declare global {
  interface Window {
    XLSX: any;
  }
}

const loadXLSX = async (): Promise<any> => {
  if (typeof window !== 'undefined' && window.XLSX) {
    return window.XLSX;
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js';
    script.onload = () => {
      if (window.XLSX) {
        resolve(window.XLSX);
      } else {
        reject(new Error('Failed to load XLSX library'));
      }
    };
    script.onerror = () => reject(new Error('Failed to load XLSX library'));
    document.head.appendChild(script);
  });
};

interface ColumnMapping {
  sourceColumn: string;
  targetField: string;
  isCustomField: boolean;
  dataType: 'text' | 'number' | 'email' | 'phone';
}

interface PreviewData {
  headers: string[];
  rows: any[][];
  totalRows: number;
}

interface ExistingSupplier {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
}

interface SupplierImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  storeId: string;
  onImportComplete: () => void;
}

const STANDARD_FIELDS = [
  { key: 'name', label: 'Supplier Name', required: true, type: 'text' },
  { key: 'phone', label: 'Phone Number', required: false, type: 'phone' },
  { key: 'email', label: 'Email Address', required: false, type: 'email' },
  { key: 'address', label: 'Address', required: false, type: 'text' },
  { key: 'company', label: 'Company Name', required: false, type: 'text' },
  { key: 'notes', label: 'Notes', required: false, type: 'text' },
  { key: 'total_supplied', label: 'Total Supplied Amount', required: false, type: 'number' },
  { key: 'outstanding_balance', label: 'Outstanding Balance', required: false, type: 'number' },
];

export default function SupplierImportDialog({ 
  isOpen, 
  onClose, 
  storeId, 
  onImportComplete 
}: SupplierImportDialogProps) {
  const [step, setStep] = useState<'upload' | 'preview' | 'mapping' | 'confirm' | 'importing'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);
  const [customFields, setCustomFields] = useState<{ name: string; type: 'text' | 'number' }[]>([]);
  const [existingSuppliers, setExistingSuppliers] = useState<ExistingSupplier[]>([]);
  const [duplicateStrategy, setDuplicateStrategy] = useState<'skip' | 'update' | 'create'>('update');
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  
  const { toast } = useToast();

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = event.target.files?.[0];
    if (!uploadedFile) return;

    if (!uploadedFile.name.match(/\.(xlsx|xls|csv)$/i)) {
      toast({
        title: "Invalid file format",
        description: "Please upload an Excel (.xlsx, .xls) or CSV file.",
        variant: "destructive",
      });
      return;
    }

    setFile(uploadedFile);
    processFile(uploadedFile);
  }, [toast]);

  const processFile = useCallback(async (file: File) => {
    try {
      setIsProcessing(true);
      
      let data: any[][] = [];
      
      if (file.name.toLowerCase().endsWith('.csv')) {
        // Handle CSV files
        const text = await file.text();
        const lines = text.split('\n').filter(line => line.trim());
        data = lines.map(line => {
          // Basic CSV parsing - handles quoted values
          const result: string[] = [];
          let current = '';
          let inQuotes = false;
          
          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
              inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
              result.push(current.trim());
              current = '';
            } else {
              current += char;
            }
          }
          result.push(current.trim());
          return result;
        });
      } else if (file.name.match(/\.(xlsx|xls)$/i)) {
        // Handle Excel files
        try {
          const XLSX = await loadXLSX();
          const buffer = await file.arrayBuffer();
          const workbook = XLSX.read(buffer, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        } catch (error) {
          console.error('Excel processing error:', error);
          toast({
            title: "Excel processing failed",
            description: "Could not process Excel file. Please try converting to CSV format or check your internet connection.",
            variant: "destructive",
          });
          return;
        }
      } else {
        toast({
          title: "Unsupported format",
          description: "Please upload a CSV or Excel (.xlsx, .xls) file.",
          variant: "destructive",
        });
        return;
      }

      if (data.length < 2) {
        toast({
          title: "Invalid file",
          description: "File must contain at least a header row and one data row.",
          variant: "destructive",
        });
        return;
      }

      const headers = data[0] as string[];
      const rows = data.slice(1) as any[][];

      setPreviewData({
        headers: headers.filter(h => h && h.trim()),
        rows: rows.filter(row => row.some(cell => cell != null && cell !== '')),
        totalRows: rows.length
      });

      // Initialize column mappings
      const initialMappings: ColumnMapping[] = headers
        .filter(h => h && h.trim())
        .map(header => {
          const standardField = STANDARD_FIELDS.find(field => 
            field.label.toLowerCase().includes(header.toLowerCase()) ||
            field.key.toLowerCase().includes(header.toLowerCase()) ||
            header.toLowerCase().includes(field.key.toLowerCase())
          );

          return {
            sourceColumn: header,
            targetField: standardField ? standardField.key : '',
            isCustomField: false,
            dataType: standardField ? standardField.type as any : 'text'
          };
        });

      setColumnMappings(initialMappings);
      setSelectedRows(new Set(Array.from({ length: rows.length }, (_, i) => i)));
      setStep('preview');

      // Load existing suppliers for duplicate detection
      const { data: suppliers } = await supabase
        .from('suppliers')
        .select('id, name, email, phone, company')
        .eq('store_id', storeId);

      if (suppliers) {
        setExistingSuppliers(suppliers);
      }

    } catch (error) {
      console.error('Error processing file:', error);
      toast({
        title: "Error processing file",
        description: error instanceof Error ? error.message : "Unable to read the uploaded file. Please check the format and try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  }, [storeId, toast]);

  const updateColumnMapping = (sourceColumn: string, targetField: string, isCustomField: boolean) => {
    setColumnMappings(prev => prev.map(mapping => 
      mapping.sourceColumn === sourceColumn 
        ? { ...mapping, targetField, isCustomField }
        : mapping
    ));
  };

  const addCustomField = () => {
    const fieldName = prompt("Enter custom field name:");
    if (fieldName && fieldName.trim()) {
      const fieldType = confirm("Is this a number field? Click OK for number, Cancel for text.") ? 'number' : 'text';
      setCustomFields(prev => [...prev, { name: fieldName.trim(), type: fieldType }]);
    }
  };

  const detectDuplicates = useMemo(() => {
    if (!previewData || !existingSuppliers.length) return [];

    const nameColumnIndex = previewData.headers.findIndex(h => 
      columnMappings.find(m => m.sourceColumn === h && m.targetField === 'name')
    );

    if (nameColumnIndex === -1) return [];

    return previewData.rows
      .map((row, index) => {
        const supplierName = row[nameColumnIndex]?.toString().trim();
        if (!supplierName) return null;

        const existing = existingSuppliers.find(s => 
          s.name.toLowerCase() === supplierName.toLowerCase()
        );

        return existing ? { rowIndex: index, existing, newName: supplierName } : null;
      })
      .filter(Boolean);
  }, [previewData, columnMappings, existingSuppliers]);

  const processImport = async () => {
    if (!previewData || !columnMappings.some(m => m.targetField === 'name')) {
      toast({
        title: "Mapping required",
        description: "You must map at least the 'name' field to proceed.",
        variant: "destructive",
      });
      return;
    }

    if (!storeId || storeId === '') {
      toast({
        title: "Store ID required",
        description: "No store ID provided. Please try again.",
        variant: "destructive",
      });
      return;
    }

    try {
      setStep('importing');
      setIsProcessing(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      // Process selected rows
      const rowsToProcess = Array.from(selectedRows)
        .map(rowIndex => previewData.rows[rowIndex])
        .filter(row => row && row.some(cell => cell != null && cell !== ''));

      const duplicates = detectDuplicates.filter(d => selectedRows.has(d.rowIndex));
      let processed = 0;
      let updated = 0;
      let created = 0;
      let skipped = 0;

      for (const row of rowsToProcess) {
        const rowIndex = previewData.rows.indexOf(row);
        const duplicate = duplicates.find(d => d.rowIndex === rowIndex);

        // Build supplier data from mappings
        const supplierData: any = {
          store_id: storeId,
          user_id: user.id,
          updated_at: new Date().toISOString()
        };

        // Map standard fields
        columnMappings.forEach(mapping => {
          if (mapping.targetField && !mapping.isCustomField) {
            const columnIndex = previewData.headers.indexOf(mapping.sourceColumn);
            if (columnIndex !== -1 && row[columnIndex] != null) {
              let value = row[columnIndex];
              
              if (mapping.dataType === 'number') {
                value = parseFloat(value) || 0;
              } else if (mapping.dataType === 'email') {
                value = value?.toString().trim().toLowerCase();
              } else if (mapping.dataType === 'phone') {
                value = value?.toString().replace(/\D/g, '');
              } else {
                value = value?.toString().trim();
              }
              
              supplierData[mapping.targetField] = value;
            }
          }
        });

        // Handle custom fields
        const customFieldData: any = {};
        columnMappings.forEach(mapping => {
          if (mapping.isCustomField && mapping.targetField) {
            const columnIndex = previewData.headers.indexOf(mapping.sourceColumn);
            if (columnIndex !== -1 && row[columnIndex] != null) {
              customFieldData[mapping.targetField] = row[columnIndex];
            }
          }
        });

        // Handle duplicates
        if (duplicate) {
          if (duplicateStrategy === 'skip') {
            skipped++;
            continue;
          } else if (duplicateStrategy === 'update') {
            // Standard update operation
            const updateData = { ...supplierData };
            
            // Merge custom fields with notes if they exist
            if (Object.keys(customFieldData).length > 0) {
              const existingNotes = updateData.notes || '';
              const customFieldsJson = JSON.stringify(customFieldData);
              updateData.notes = existingNotes + (existingNotes ? '\n' : '') + `Custom Fields: ${customFieldsJson}`;
            }
            
            const { error } = await supabase
              .from('suppliers')
              .update(updateData)
              .eq('id', duplicate.existing.id);

            if (error) throw error;
            updated++;
          } else { // create new
            supplierData.name = `${supplierData.name} (${Date.now()})`;
            
            // Add custom fields to notes
            if (Object.keys(customFieldData).length > 0) {
              const existingNotes = supplierData.notes || '';
              const customFieldsJson = JSON.stringify(customFieldData);
              supplierData.notes = existingNotes + (existingNotes ? '\n' : '') + `Custom Fields: ${customFieldsJson}`;
            }
            
            const { error } = await supabase
              .from('suppliers')
              .insert([supplierData]);

            if (error) throw error;
            created++;
          }
        } else {
          // Create new supplier
          supplierData.created_at = new Date().toISOString();
          
          // Add custom fields to notes
          if (Object.keys(customFieldData).length > 0) {
            const existingNotes = supplierData.notes || '';
            const customFieldsJson = JSON.stringify(customFieldData);
            supplierData.notes = existingNotes + (existingNotes ? '\n' : '') + `Custom Fields: ${customFieldsJson}`;
          }
          
          const { error } = await supabase
            .from('suppliers')
            .insert([supplierData]);

          if (error) throw error;
          created++;
        }

        processed++;
      }

      // Log audit
      await logAudit({
        action: 'import',
        tableName: 'suppliers',
        newData: { 
          total: processed, 
          created, 
          updated, 
          skipped,
          file: file?.name 
        },
        storeId
      });

      toast({
        title: "Import completed",
        description: `Successfully processed ${processed} suppliers. Created: ${created}, Updated: ${updated}, Skipped: ${skipped}`,
      });

      onImportComplete();
      onClose();

    } catch (error: any) {
      console.error('Import error:', error);
      toast({
        title: "Import failed",
        description: error.message || "An error occurred during import. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const resetDialog = () => {
    setStep('upload');
    setFile(null);
    setPreviewData(null);
    setColumnMappings([]);
    setCustomFields([]);
    setSelectedRows(new Set());
    setIsProcessing(false);
  };

  const handleClose = () => {
    if (!isProcessing) {
      resetDialog();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Import Suppliers
            {step !== 'upload' && (
              <Badge variant="outline" className="ml-2">
                Step {step === 'preview' ? '1' : step === 'mapping' ? '2' : step === 'confirm' ? '3' : '4'} of 4
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            Upload and import supplier data with advanced column mapping and duplicate handling
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {/* Step 1: File Upload */}
          {step === 'upload' && (
            <div className="space-y-6 p-6">
              <div className="text-center">
                <Upload className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Upload Supplier Data</h3>
                <p className="text-muted-foreground mb-6">
                  Upload an Excel or CSV file containing your supplier information
                </p>
              </div>

              <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8">
                <Input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileUpload}
                  className="max-w-md mx-auto"
                  disabled={isProcessing}
                />
                {isProcessing && (
                  <div className="flex items-center justify-center mt-4">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    Processing file...
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-green-500 mt-0.5" />
                  <div>
                    <p className="font-medium">Supported formats</p>
                    <p className="text-muted-foreground">Excel (.xlsx, .xls), CSV</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Eye className="h-4 w-4 text-blue-500 mt-0.5" />
                  <div>
                    <p className="font-medium">Preview & map columns</p>
                    <p className="text-muted-foreground">Review data before import</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Users className="h-4 w-4 text-purple-500 mt-0.5" />
                  <div>
                    <p className="font-medium">Duplicate handling</p>
                    <p className="text-muted-foreground">Update or skip existing suppliers</p>
                  </div>
                </div>
              </div>

              <div className="text-center">
                <div className="flex gap-2 justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const csvContent = `Name,Company,Phone,Email,Address,Notes,Total Supplied,Outstanding Balance
Jane Supplier,ABC Ltd,+256700000000,jane@abc.com,"Kampala, Uganda","Reliable supplier",50000,15000
John Wholesale,XYZ Company,+256701111111,john@xyz.com,"Entebbe, Uganda","Fast delivery",75000,0`;
                      
                      const blob = new Blob([csvContent], { type: 'text/csv' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = 'supplier_template.csv';
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    }}
                  >
                    Download CSV Template
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        const XLSX = await loadXLSX();
                        const data = [
                          ['Name', 'Company', 'Phone', 'Email', 'Address', 'Notes', 'Total Supplied', 'Outstanding Balance'],
                          ['Jane Supplier', 'ABC Ltd', '+256700000000', 'jane@abc.com', 'Kampala, Uganda', 'Reliable supplier', 50000, 15000],
                          ['John Wholesale', 'XYZ Company', '+256701111111', 'john@xyz.com', 'Entebbe, Uganda', 'Fast delivery', 75000, 0]
                        ];
                        
                        const ws = XLSX.utils.aoa_to_sheet(data);
                        const wb = XLSX.utils.book_new();
                        XLSX.utils.book_append_sheet(wb, ws, 'Suppliers');
                        XLSX.writeFile(wb, 'supplier_template.xlsx');
                      } catch (error) {
                        toast({
                          title: "Template generation failed",
                          description: "Could not generate Excel template. Please use CSV template instead.",
                          variant: "destructive",
                        });
                      }
                    }}
                  >
                    Download Excel Template
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Preview Data */}
          {step === 'preview' && previewData && (
            <div className="space-y-4 flex flex-col h-full">
              <div className="flex items-center justify-between px-6 pt-4">
                <div>
                  <h3 className="text-lg font-semibold">Preview Data</h3>
                  <p className="text-sm text-muted-foreground">
                    {previewData.totalRows} rows found in {file?.name}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-sm">Select all</Label>
                  <Checkbox
                    checked={selectedRows.size === previewData.rows.length}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedRows(new Set(Array.from({ length: previewData.rows.length }, (_, i) => i)));
                      } else {
                        setSelectedRows(new Set());
                      }
                    }}
                  />
                </div>
              </div>

              <ScrollArea className="flex-1 px-6">
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="p-2 text-left">Select</th>
                        {previewData.headers.map((header, index) => (
                          <th key={index} className="p-2 text-left font-medium">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.rows.slice(0, 100).map((row, rowIndex) => (
                        <tr key={rowIndex} className="border-t hover:bg-muted/20">
                          <td className="p-2">
                            <Checkbox
                              checked={selectedRows.has(rowIndex)}
                              onCheckedChange={(checked) => {
                                const newSelected = new Set(selectedRows);
                                if (checked) {
                                  newSelected.add(rowIndex);
                                } else {
                                  newSelected.delete(rowIndex);
                                }
                                setSelectedRows(newSelected);
                              }}
                            />
                          </td>
                          {row.map((cell, cellIndex) => (
                            <td key={cellIndex} className="p-2 max-w-[200px] truncate">
                              {cell?.toString() || ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {previewData.rows.length > 100 && (
                    <div className="p-4 text-center text-muted-foreground border-t">
                      Showing first 100 rows of {previewData.rows.length}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Step 3: Column Mapping */}
          {step === 'mapping' && (
            <div className="space-y-4 flex flex-col h-full">
              <div className="px-6 pt-4">
                <h3 className="text-lg font-semibold">Map Columns</h3>
                <p className="text-sm text-muted-foreground">
                  Map your file columns to supplier fields
                </p>
              </div>

              <ScrollArea className="flex-1 px-6">
                <div className="space-y-4">
                  {columnMappings.map((mapping, index) => (
                    <div key={index} className="flex items-center gap-4 p-4 border rounded-lg">
                      <div className="flex-1">
                        <Label className="text-sm font-medium">{mapping.sourceColumn}</Label>
                        <p className="text-xs text-muted-foreground mt-1">
                          Sample: {previewData?.rows[0]?.[previewData.headers.indexOf(mapping.sourceColumn)]?.toString() || 'N/A'}
                        </p>
                      </div>
                      
                      <div className="flex-1">
                        <Select
                          value={mapping.targetField || "__skip__"}
                          onValueChange={(value) => updateColumnMapping(mapping.sourceColumn, value === "__skip__" ? "" : value, false)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select field" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__skip__">Don't import</SelectItem>
                            {STANDARD_FIELDS.map(field => (
                              <SelectItem key={field.key} value={field.key}>
                                {field.label} {field.required && <span className="text-red-500">*</span>}
                              </SelectItem>
                            ))}
                            {customFields.map(field => (
                              <SelectItem key={field.name} value={field.name}>
                                {field.name} (Custom)
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => updateColumnMapping(mapping.sourceColumn, mapping.sourceColumn, true)}
                      >
                        Custom Field
                      </Button>
                    </div>
                  ))}

                  <div className="flex items-center gap-2 pt-4">
                    <Button type="button" variant="outline" onClick={addCustomField}>
                      <Plus className="h-4 w-4 mr-1" />
                      Add Custom Field
                    </Button>
                  </div>

                  {customFields.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Custom Fields</Label>
                      {customFields.map((field, index) => (
                        <Badge key={index} variant="secondary">
                          {field.name} ({field.type})
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Step 4: Confirmation */}
          {step === 'confirm' && (
            <div className="space-y-6 p-6">
              <div>
                <h3 className="text-lg font-semibold">Confirm Import</h3>
                <p className="text-sm text-muted-foreground">
                  Review settings before importing {selectedRows.size} suppliers
                </p>
              </div>

              {detectDuplicates.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-amber-500" />
                    <Label className="font-medium">
                      {detectDuplicates.length} duplicate(s) detected
                    </Label>
                  </div>

                  <Select value={duplicateStrategy} onValueChange={(value: any) => setDuplicateStrategy(value)}>
                    <SelectTrigger className="max-w-md">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="update">Update existing suppliers</SelectItem>
                      <SelectItem value="skip">Skip duplicates</SelectItem>
                      <SelectItem value="create">Create new with modified names</SelectItem>
                    </SelectContent>
                  </Select>

                  <div className="border rounded-lg p-4 bg-muted/20 max-h-32 overflow-y-auto">
                    {detectDuplicates.slice(0, 5).map((dup, index) => (
                      <div key={index} className="text-sm">
                        Row {dup.rowIndex + 1}: "{dup.newName}" matches existing supplier
                      </div>
                    ))}
                    {detectDuplicates.length > 5 && (
                      <div className="text-sm text-muted-foreground">
                        ... and {detectDuplicates.length - 5} more
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <Label className="font-medium">Mapped Fields</Label>
                  <div className="space-y-1 mt-2">
                    {columnMappings
                      .filter(m => m.targetField)
                      .map((mapping, index) => (
                        <div key={index} className="flex justify-between">
                          <span>{mapping.sourceColumn}</span>
                          <span className="text-muted-foreground">→ {mapping.targetField}</span>
                        </div>
                      ))}
                  </div>
                </div>
                <div>
                  <Label className="font-medium">Import Summary</Label>
                  <div className="space-y-1 mt-2">
                    <div>Total rows: {selectedRows.size}</div>
                    <div>Duplicates: {detectDuplicates.length}</div>
                    <div>Action: {duplicateStrategy}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Importing */}
          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
              <h3 className="text-lg font-semibold mb-2">Importing Suppliers</h3>
              <p className="text-muted-foreground">Please wait while we process your data...</p>
            </div>
          )}
        </div>

        <Separator />

        <DialogFooter>
          <div className="flex items-center justify-between w-full">
            <div className="flex gap-2">
              {step !== 'upload' && step !== 'importing' && (
                <Button
                  variant="outline"
                  onClick={() => {
                    if (step === 'preview') setStep('upload');
                    else if (step === 'mapping') setStep('preview');
                    else if (step === 'confirm') setStep('mapping');
                  }}
                  disabled={isProcessing}
                >
                  Back
                </Button>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={isProcessing}
              >
                Cancel
              </Button>

              {step === 'preview' && (
                <Button
                  onClick={() => setStep('mapping')}
                  disabled={selectedRows.size === 0}
                >
                  Map Columns
                </Button>
              )}

              {step === 'mapping' && (
                <Button
                  onClick={() => setStep('confirm')}
                  disabled={!columnMappings.some(m => m.targetField === 'name')}
                >
                  Review Import
                </Button>
              )}

              {step === 'confirm' && (
                <Button
                  onClick={processImport}
                  disabled={isProcessing}
                >
                  Import Suppliers
                </Button>
              )}
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}