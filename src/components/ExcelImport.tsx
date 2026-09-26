import { useRef, useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Maximize2, Minimize2, Upload, Play } from "lucide-react";
import { LoadingMark } from "@/components/ui/loading-spinner";
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
    aliases?: string[];
  }[];
  onImport: (rows: Record<string, any>[]) => Promise<{ success: number; errors: string[] }>;
  templateData?: Record<string, any>[];
}

interface ExcelImportProps {
  config: ImportConfig;
  trigger?: React.ReactNode;
}

const CHUNK_SIZE = 200;
const PREVIEW_LIMIT = 50; // only render this many editable rows

const ExcelImport = ({ config, trigger }: ExcelImportProps) => {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"upload" | "mapping" | "preview" | "importing" | "result">("upload");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [excelData, setExcelData] = useState<Record<string, any>[]>([]);
  const [excelColumns, setExcelColumns] = useState<string[]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  // editedRows only holds overrides for the preview slice — full data stays in excelData
  const [editedRows, setEditedRows] = useState<Record<string, any>[]>([]);
  const [result, setResult] = useState<{ success: number; errors: string[] } | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const mountedRef = useRef(true);
  const abortRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const safeSet = <T,>(setter: React.Dispatch<React.SetStateAction<T>>, value: T) => {
    if (mountedRef.current) setter(value);
  };

  const reset = () => {
    setStep("upload");
    setIsFullscreen(false);
    setExcelData([]);
    setExcelColumns([]);
    setMappings({});
    setEditedRows([]);
    setResult(null);
    setProgress(0);
    setProgressLabel("");
    abortRef.current = false;
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
        if (json.length === 0) {
          toast({ title: "Empty file", description: "No data rows found.", variant: "destructive" });
          return;
        }
        const cols = Object.keys(json[0]);
        setExcelColumns(cols);
        setExcelData(json);

        // Auto-map columns
        const autoMap: Record<string, string> = {};
        const norm = (s: string) => s.toLowerCase().replace(/[_\s-]/g, "");
        config.fields.forEach((field) => {
          const candidates = [field.label, field.key, ...(field.aliases || [])].map(norm);
          const match = cols.find((c) => candidates.includes(norm(c)));
          if (match) autoMap[field.key] = match;
        });
        setMappings(autoMap);
        setStep("mapping");
      } catch {
        toast({ title: "Error reading file", description: "Could not parse the file.", variant: "destructive" });
      }
    };
    reader.readAsArrayBuffer(file);
    if (fileRef.current) fileRef.current.value = "";
  };

  const getMappedRow = useCallback((raw: Record<string, any>): Record<string, any> => {
    const mapped: Record<string, any> = {};
    config.fields.forEach((field) => {
      const col = mappings[field.key];
      let value = col ? raw[col] : (field.defaultValue ?? "");
      if (field.type === "number") {
        if (typeof value === "number") {
          // fine
        } else if (typeof value === "string" && value.trim()) {
          value = parseFloat(value.replace(/[^0-9.-]/g, "")) || 0;
        } else {
          value = field.defaultValue ?? 0;
        }
      }
      mapped[field.key] = value;
    });
    return mapped;
  }, [mappings, config.fields]);

  const coerceRow = useCallback((row: Record<string, any>): Record<string, any> => {
    const out: Record<string, any> = {};
    config.fields.forEach((field) => {
      const v = row?.[field.key];
      if (v === undefined || v === null || v === "") {
        out[field.key] = field.defaultValue ?? (field.type === "number" ? 0 : "");
      } else if (field.type === "number") {
        out[field.key] = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.-]/g, "")) || 0;
      } else {
        out[field.key] = v;
      }
    });
    return out;
  }, [config.fields]);

  const validateMappings = () => {
    const missing = config.fields
      .filter((f) => f.required && !mappings[f.key] && f.defaultValue === undefined)
      .map((f) => f.label);
    if (missing.length > 0) {
      toast({ title: "Missing mappings", description: `${missing.join(", ")} not mapped — defaults will be used.` });
    }
    return true;
  };

  /** Chunked import — yields between batches so UI stays responsive */
  const runChunkedImport = async (allRows: Record<string, any>[], background: boolean) => {
    abortRef.current = false;
    if (!background) safeSet(setStep, "importing");
    safeSet(setProgress, 0);

    let totalSuccess = 0;
    const allErrors: string[] = [];
    const total = allRows.length;

    for (let i = 0; i < total; i += CHUNK_SIZE) {
      if (abortRef.current) break;
      const chunk = allRows.slice(i, i + CHUNK_SIZE);
      const end = Math.min(i + CHUNK_SIZE, total);

      if (!background) {
        safeSet(setProgressLabel, `Rows ${i + 1}–${end} of ${total}…`);
      }

      try {
        const res = await config.onImport(chunk);
        totalSuccess += res.success;
        allErrors.push(...res.errors);
      } catch (err: any) {
        allErrors.push(err.message);
      }

      safeSet(setProgress, Math.round((end / total) * 100));
      // Yield to event loop
      await new Promise<void>((r) => setTimeout(r, 0));
    }

    const finalResult = { success: totalSuccess, errors: allErrors };
    safeSet(setResult, finalResult);
    if (!background) safeSet(setStep, "result");

    toast({
      title: background ? "Background import complete" : "Import complete",
      description: `${totalSuccess} of ${total} rows imported.`,
    });
  };

  const handleImport = async (background = false) => {
    // Build full coerced rows: use editedRows for preview slice, raw mapping for the rest
    const previewMapped = editedRows.map(coerceRow);
    const restMapped = excelData.slice(PREVIEW_LIMIT).map((raw) => coerceRow(getMappedRow(raw)));
    const allRows = [...previewMapped, ...restMapped];

    if (background) {
      setOpen(false);
      toast({ title: "Import started in background", description: `Importing ${allRows.length} rows…` });
      await new Promise<void>((r) => setTimeout(r, 150));
      await runChunkedImport(allRows, true);
    } else {
      await runChunkedImport(allRows, false);
    }
  };

  const downloadTemplate = () => {
    const rows = config.templateData || [
      config.fields.reduce((acc, f) => {
        acc[f.label] = f.type === "number" ? 0 : f.type === "date" ? new Date().toISOString().split("T")[0] : "";
        return acc;
      }, {} as Record<string, any>),
    ];
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, `${config.title.replace(/\s+/g, "_")}_template.xlsx`);
  };

  const visibleFields = config.fields.filter((f) => mappings[f.key]);

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
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0"
              onClick={() => setIsFullscreen((v) => !v)}>
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
          </DialogTitle>
          <DialogDescription className="text-xs">
            {config.description || "Import inventory from Excel or CSV and map columns before saving."}
          </DialogDescription>
        </DialogHeader>

        {/* ── UPLOAD ── */}
        {step === "upload" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="border-2 border-dashed border-muted-foreground/30 rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 transition-colors w-full"
              onClick={() => fileRef.current?.click()}>
              <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm font-medium">Click to upload Excel / CSV</p>
              <p className="text-xs text-muted-foreground mt-1">.xlsx, .xls, .csv</p>
            </div>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={downloadTemplate}>
              <Download className="h-3.5 w-3.5" /> Download template
            </Button>
          </div>
        )}

        {/* ── MAPPING ── */}
        {step === "mapping" && (
          <div className="flex flex-col gap-3 flex-1 min-h-0">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{excelData.length} rows · map columns:</p>
              <Badge variant="secondary" className="text-[10px]">{excelColumns.length} cols</Badge>
            </div>
            <ScrollArea className="flex-1 min-h-0">
              <div className="space-y-2 pr-3">
                {config.fields.map((field) => (
                  <div key={field.key} className="flex items-center gap-2">
                    <span className="text-xs w-36 shrink-0 truncate">
                      {field.label}{field.required && <span className="text-destructive ml-0.5">*</span>}
                    </span>
                    <Select value={mappings[field.key] || "__none__"}
                      onValueChange={(v) => setMappings((m) => ({ ...m, [field.key]: v === "__none__" ? "" : v }))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select column" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">-- Skip --</SelectItem>
                        {excelColumns.map((col) => <SelectItem key={col} value={col}>{col}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </ScrollArea>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" size="sm" onClick={() => setStep("upload")}>Back</Button>
              <Button size="sm" onClick={() => {
                if (!validateMappings()) return;
                // Only map the preview slice into editedRows
                setEditedRows(excelData.slice(0, PREVIEW_LIMIT).map(getMappedRow));
                setStep("preview");
              }}>Preview</Button>
            </div>
          </div>
        )}

        {/* ── PREVIEW ── */}
        {step === "preview" && (
          <div className="flex flex-col gap-3 flex-1 min-h-0">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Editing first {Math.min(PREVIEW_LIMIT, excelData.length)} of {excelData.length} rows
                {excelData.length > PREVIEW_LIMIT && ` · remaining ${excelData.length - PREVIEW_LIMIT} imported as-is`}
              </p>
            </div>
            <ScrollArea className="flex-1 min-h-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    {visibleFields.map((f) => (
                      <TableHead key={f.key} className="text-[10px] whitespace-nowrap">{f.label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {editedRows.map((row, i) => (
                    <TableRow key={i}>
                      {visibleFields.map((f) => (
                        <TableCell key={f.key} className="text-[11px] py-1">
                          <Input
                            value={row?.[f.key] ?? ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              setEditedRows((prev) => {
                                const next = prev.slice();
                                next[i] = { ...next[i], [f.key]: v };
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
              <Button variant="outline" size="sm" className="gap-1.5 text-muted-foreground"
                onClick={() => handleImport(true)} title="Close and import in background">
                <Play className="h-3.5 w-3.5" /> Continue in background
              </Button>
              <Button size="sm" onClick={() => handleImport(false)}>
                Import {excelData.length} rows
              </Button>
            </div>
          </div>
        )}

        {/* ── IMPORTING ── */}
        {step === "importing" && (
          <div className="flex flex-col items-center gap-5 py-10">
            <LoadingMark size="lg" />
            <div className="w-full space-y-2">
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-center text-muted-foreground">{progressLabel}</p>
            </div>
            <p className="text-sm font-medium">{progress}% complete</p>
          </div>
        )}

        {/* ── RESULT ── */}
        {step === "result" && result && (
          <div className="flex flex-col gap-4 py-6">
            <div className="text-center">
              {result.success > 0
                ? <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-2" />
                : <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-2" />}
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
            <div className="flex gap-2 justify-center">
              <Button size="sm" variant="outline" onClick={() => setStep("preview")}>Edit Rows</Button>
              <Button size="sm" variant="ghost" onClick={() => setStep("mapping")}>Back to Mapping</Button>
              <Button size="sm" onClick={() => { setOpen(false); reset(); }}>Done</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ExcelImport;
