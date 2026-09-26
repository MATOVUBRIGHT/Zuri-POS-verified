import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Camera, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { generateBarcode as generateBarcodeLib } from "@/lib/barcode";

interface BarcodeSectionProps {
  barcode: string;
  barcodeType: string;
  barcodeMode: string;
  unitName: string;
  setFormData: (updates: any) => void;
  setShowBarcodeScanner: (show: boolean) => void;
}

export const BarcodeSection = ({
  barcode,
  barcodeType,
  barcodeMode,
  unitName,
  setFormData,
  setShowBarcodeScanner
}: BarcodeSectionProps) => {
  const { toast } = useToast();

  const handleGenerateBarcode = () => {
    const newBarcode = generateBarcodeLib("BREC");
    setFormData({ barcode: newBarcode });
    toast({
      title: "Barcode Generated",
      description: `New barcode: ${newBarcode}`,
    });
  };

  return (
    <div className="space-y-4">
      {/* Barcode Field */}
      <div className="space-y-2">
        <Label htmlFor="barcode">Barcode</Label>
        <div className="flex gap-2">
          <Input
            id="barcode"
            placeholder="Scan, enter or generate barcode"
            value={barcode ?? ""}
            onChange={(e) => setFormData({ barcode: e.target.value })}
            className="flex-1"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setShowBarcodeScanner(true)}
            title="Scan Barcode"
          >
            <Camera className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            onClick={handleGenerateBarcode}
            title="Generate Barcode"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Scan existing barcode or generate a new one
        </p>
      </div>

      {/* Barcode Type and Mode */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="barcode_type">Barcode Type</Label>
          <Select
            value={barcodeType}
            onValueChange={(value) => setFormData({ barcode_type: value })}
          >
            <SelectTrigger id="barcode_type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CODE128">CODE128 (Recommended)</SelectItem>
              <SelectItem value="EAN13">EAN-13</SelectItem>
              <SelectItem value="EAN8">EAN-8</SelectItem>
              <SelectItem value="UPC">UPC-A</SelectItem>
              <SelectItem value="CODE39">CODE39</SelectItem>
              <SelectItem value="ITF14">ITF-14</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="barcode_mode">Barcode Mode</Label>
          <Select
            value={barcodeMode}
            onValueChange={(value) => setFormData({ barcode_mode: value })}
          >
            <SelectTrigger id="barcode_mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="standard">Standard (Packaged)</SelectItem>
              <SelectItem value="each_item">Each Item (Sachets)</SelectItem>
              <SelectItem value="loose">Loose Items (Rice, Beans, etc.)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {barcodeMode === 'standard' && 'One barcode per product package'}
            {barcodeMode === 'each_item' && 'Each unit can have its own barcode'}
            {barcodeMode === 'loose' && 'Price calculated by weight at POS'}
          </p>
        </div>
      </div>

      {/* Show unit field for loose items */}
      {barcodeMode === 'loose' && (
        <div className="space-y-2">
          <Label htmlFor="unitNameSelect">Unit of Measurement</Label>
          <Select
            value={unitName}
            onValueChange={(value) => setFormData({ unitName: value })}
          >
            <SelectTrigger id="unitNameSelect">
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
  );
};
