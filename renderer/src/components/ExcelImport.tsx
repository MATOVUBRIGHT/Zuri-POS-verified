import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Loader2, Maximize2, Minimize2, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";

export interface ColumnMapping {
  excelColumn: string;
  dbField: string;
  label: string;
  required?: boolean;
  type?: "string" | "number" | "date";
  defaultValue?: string | number;
}

export interface ImportConfig {
  title: string;
  description?: string;
  fields: {
    key: string;
    label: string;
    required?: boolean;
    type?: "string" | "number" | "date";
    defaultValue?: string | number;
  }[];
  onImport: (rows: Record<string, any>[]) => Promise<{ success: number; errors: string[] }>;
  templateData?: Record<string, any>[];
}

interface ExcelImportProps {
  config: ImportConfig;
  trigger?: React.ReactNode;
}

const ExcelImport = ({ config, trigger }: ExcelImportProps) => {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"upload" | "mapping" | "preview" | "result">("upload");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [excelData, setExcelData] = useState<Record<string, any>[]>([]);
  const [excelColumns, setExcelColumns] = useState<string[]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [editedRows, setEditedRows] = useState<Record<string, any>[]>([]);
  const [showAllPreviewRows, setShowAllPreviewRows] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ success: number; errors: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const reset = () => {
    setStep("upload");
    setIsFullscreen(false);
    setExcelData([]);
    setExcelColumns([]);
    setMappings({});
    setEditedRows([]);
    setShowAllPreviewRows(false);
    setResult(null);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });

        if (json.length === 0) {
          toast({ title: "Empty file", description: "The Excel file has no data rows.", variant: "destructive" });
          return;
        }

        const cols = Object.keys(json[0]);
        setExcelColumns(cols);
        setExcelData(json);

        // Auto-map columns by matching names
        const autoMap: Record<string, string> = {};
        config.fields.forEach((field) => {
          const match = cols.find(
            (c) =>
              c.toLowerCase().replace(/[_\s-]/g, "") ===
              field.label.toLowerCase().replace(/[_\s-]/g, "") ||
              c.toLowerCase().replace(/[_\s-]/g, "") ===
              field.key.toLowerCase().replace(/[_\s-]/g, "")
          );
          if (match) autoMap[field.key] = match;
        });
        setMappings(autoMap);
        setStep("mapping");
      } catch {
        toast({ title: "Error reading file", description: "Could not parse the Excel file.", variant: "destructive" });
      }
    };
    reader.readAsArrayBuffer(file);
    if (fileRef.current) fileRef.current.value = "";
  };

  const getMappedRows = (): Record<string, any>[] => {
    return excelData.map((row) => {
      const mapped: Record<string, any> = {};
      config.fields.forEach((field) => {
        const excelCol = mappings[field.key];
        let value = excelCol ? row[excelCol] : field.defaultValue ?? "";
        if (field.type === "number" && typeof value === "string") {
          value = parseFloat(value.replace(/[^0-9.-]/g, "")) || 0;
        }
        mapped[field.key] = value;
      });
      return mapped;
    });
  };

  const coerceValue = (field: ImportConfig["fields"][number], value: any) => {
    if (value === undefined || value === null || value === "") {
      return field.defaultValue ?? (field.type === "number" ? 0 : "");
    }
    if (field.type === "number") {
      if (typeof value === "number") return value;
      if (typeof value === "string") return parseFloat(value.replace(/[^0-9.-]/g, "")) || 0;
      return Number(value) || 0;
    }
    return value;
  };

  const coerceRows = (rows: Record<string, any>[]) => {
    return rows.map((row) => {
      const out: Record<string, any> = {};
      config.fields.forEach((field) => {
        out[field.key] = coerceValue(field, row?.[field.key]);
      });
      return out;
    });
  };

  const validateMappings = () => {
    const missing = config.fields
      .filter((f) => f.required && !mappings[f.key] && !f.defaultValue)
      .map((f) => f.label);
    if (missing.length > 0) {
      toast({
        title: "Missing required mappings",
        description: `Some required fields are not mapped: ${missing.join(", ")}. They will use default values or empty strings.`,
        variant: "default",
      });
    }
    return true;
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const baseRows = editedRows.length > 0 ? editedRows : getMappedRows();
      const rows = coerceRows(baseRows);
      const res = await config.onImport(rows);
      setResult(res);
      setStep("result");
      if (res.success > 0) {
        toast({ title: "Import complete", description: `${res.success} rows imported successfully.` });
      }
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const templateRows = config.templateData || [
      config.fields.reduce((acc, f) => {
        acc[f.label] = f.type === "number" ? 0 : f.type === "date" ? new Date().toISOString().split("T")[0] : "";
        return acc;
      }, {} as Record<string, any>),
    ];
    const ws = XLSX.utils.json_to_sheet(templateRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, `${config.title.replace(/\s+/g, "_")}_template.xlsx`);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-1.5">
            <FileSpreadsheet className="h-4 w-4" />
            Import Excel
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        className={`${isFullscreen ? "w-[95vw] h-[95vh] max-w-none max-h-none" : "max-w-2xl max-h-[85vh]"} overflow-hidden flex flex-col`}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 min-w-0">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              <span className="truncate">{config.title}</span>
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => setIsFullscreen((v) => !v)}
              aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
          </DialogTitle>
          {config.description && (
            <p className="text-xs text-muted-foreground">{config.description}</p>
          )}
        </DialogHeader>

        {step === "upload" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div
              className="border-2 border-dashed border-muted-foreground/30 rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 transition-colors w-full"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm font-medium">Click to upload Excel file</p>
              <p className="text-xs text-muted-foreground mt-1">.xlsx, .xls, or .csv</p>
            </div>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={downloadTemplate}>
              <Download className="h-3.5 w-3.5" />
              Download template
            </Button>
          </div>
        )}

        {step === "mapping" && (
          <div className="flex flex-col gap-3 flex-1 min-h-0">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{excelData.length} rows found. Map columns below:</p>
              <Badge variant="secondary" className="text-[10px]">{excelColumns.length} columns</Badge>
            </div>
            <ScrollArea className="flex-1 min-h-0">
              <div className="space-y-2 pr-3">
                {config.fields.map((field) => (
                  <div key={field.key} className="flex items-center gap-2">
                    <span className="text-xs w-32 shrink-0 truncate">
                      {field.label}
                      {field.required && <span className="text-destructive ml-0.5">*</span>}
                    </span>
                    <Select
                      value={mappings[field.key] || "__none__"}
                      onValueChange={(v) => setMappings((m) => ({ ...m, [field.key]: v === "__none__" ? "" : v }))}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">-- Skip --</SelectItem>
                        {excelColumns.map((col) => (
                          <SelectItem key={col} value={col}>{col}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </ScrollArea>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" size="sm" onClick={() => setStep("upload")}>Back</Button>
              <Button
                size="sm"
                onClick={() => {
                  if (!validateMappings()) return;
                  setEditedRows(getMappedRows());
                  setShowAllPreviewRows(false);
                  setStep("preview");
                }}
              >
                Preview
              </Button>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="flex flex-col gap-3 flex-1 min-h-0">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Preview ({showAllPreviewRows ? `${excelData.length} rows` : `first ${Math.min(25, excelData.length)} rows`} of {excelData.length}):
              </p>
              {excelData.length > 25 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setShowAllPreviewRows((v) => !v)}
                >
                  {showAllPreviewRows ? "Show less" : "Show all"}
                </Button>
              )}
            </div>
            <ScrollArea className="flex-1 min-h-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    {config.fields.filter((f) => mappings[f.key]).map((f) => (
                      <TableHead key={f.key} className="text-[10px] whitespace-nowrap">{f.label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(showAllPreviewRows ? editedRows : editedRows.slice(0, 25)).map((row, i) => (
                    <TableRow key={i}>
                      {config.fields.filter((f) => mappings[f.key]).map((f) => (
                        <TableCell key={f.key} className="text-[11px] py-1">
                          <Input
                            value={row?.[f.key] ?? ""}
                            onChange={(e) => {
                              const nextVal = e.target.value;
                              setEditedRows((rows) => {
                                const next = rows.slice();
                                next[i] = { ...(next[i] || {}), [f.key]: nextVal };
                                return next;
                              });
                            }}
                            className="h-7 text-xs"
                            type={f.type === "number" ? "number" : "text"}
                            inputMode={f.type === "number" ? "decimal" : undefined}
                          />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" size="sm" onClick={() => setStep("mapping")}>Back</Button>
              <Button size="sm" onClick={handleImport} disabled={importing}>
                {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                Import {excelData.length} rows
              </Button>
            </div>
          </div>
        )}

        {step === "result" && result && (
          <div className="flex flex-col gap-4 py-6">
            <div className="text-center">
              {result.success > 0 ? (
                <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-2" />
              ) : (
                <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-2" />
              )}
              <p className="font-semibold">{result.success} rows imported</p>
              {result.errors.length > 0 && (
                <div className="mt-3 text-left">
                  <p className="text-xs font-medium text-destructive mb-1">{result.errors.length} errors:</p>
                  <ScrollArea className="max-h-32">
                    {result.errors.slice(0, 20).map((err, i) => (
                      <p key={i} className="text-[10px] text-muted-foreground">- {err}</p>
                    ))}
                  </ScrollArea>
                </div>
              )}
            </div>
            <Button size="sm" onClick={() => { setOpen(false); reset(); }} className="mx-auto">Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ExcelImport;
