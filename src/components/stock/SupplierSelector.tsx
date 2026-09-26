import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface SupplierSelectorProps {
  supplier: string;
  suppliersList: { id: string; name: string; company: string | null }[];
  manualSupplierMode: boolean;
  setFormData: (updates: any) => void;
  setManualSupplierMode: (mode: boolean) => void;
}

export const SupplierSelector = ({
  supplier,
  suppliersList,
  manualSupplierMode,
  setFormData,
  setManualSupplierMode
}: SupplierSelectorProps) => {
  const { toast } = useToast();

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="supplierSelect">Supplier</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => {
            const name = (supplier || '').trim();
            if (!name) {
              toast({
                title: 'Supplier name required',
                description: 'Type/select a supplier name first, then click Add Supplier.',
                variant: 'destructive'
              });
              return;
            }
            const params = new URLSearchParams({ prefillSupplierName: name });
            window.location.hash = `#/suppliers?${params.toString()}`;
          }}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add Supplier
        </Button>
      </div>

      {suppliersList.length > 0 && !manualSupplierMode ? (
        <Select
          value={supplier || undefined}
          onValueChange={(value) => {
            if (value === "__other__") {
              setManualSupplierMode(true);
              setFormData({ supplier: "", supplier_id: null });
              return;
            }
            const found = suppliersList.find((s) => s.name === value);
            setFormData({ supplier: value, supplier_id: found?.id || null });
          }}
        >
          <SelectTrigger id="supplierSelect">
            <SelectValue placeholder="Select supplier" />
          </SelectTrigger>
          <SelectContent>
            {suppliersList.map((s) => (
              <SelectItem key={s.id} value={s.name}>{s.name} {s.company ? `(${s.company})` : ""}</SelectItem>
            ))}
            <SelectItem value="__other__">✏️ Type name manually...</SelectItem>
          </SelectContent>
        </Select>
      ) : (
        <div className="flex gap-2">
          <Input
            id="supplierInput"
            placeholder="Type supplier name..."
            value={supplier ?? ""}
            onChange={(e) => setFormData({ supplier: e.target.value, supplier_id: null })}
          />
          {suppliersList.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setManualSupplierMode(false)}
            >
              List
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
