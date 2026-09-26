# Multi-Label Printing Guide

## Overview
The barcode label printing system now supports both:
1. **Single Product Printing** - Print multiple copies of one product with customizable label fields
2. **Multiple Products Printing** - Print different products at the same time with individual quantities

## Components

### 1. LabelPreview (Enhanced)
**Location:** `src/components/LabelPreview.tsx`

#### Features:
- **Backward Compatible** - Still supports single product mode via the `product` prop
- **Multi-Product Support** - Now accepts `printItems` prop for printing multiple different items
- **Field Editing** - Available only in single product mode
- **Live Preview** - Real-time preview of label layout for all items

#### Single Product Mode (Original)
```tsx
<LabelPreview
  product={selectedProduct}
  quantity={5}
  labelSizeType="58mm"
  onPrint={handlePrint}
/>
```

#### Multi-Product Mode (New)
```tsx
<LabelPreview
  printItems={[
    { product: product1, quantity: 3 },
    { product: product2, quantity: 5 },
    { product: product3, quantity: 2 }
  ]}
  labelSizeType="58mm"
  onPrint={handlePrint}
/>
```

### Props

| Prop | Type | Description |
|------|------|-------------|
| `product` | `StockItem \| null` | Single product (backward compatible, optional) |
| `quantity` | `number` | Quantity for single product mode (default: 1) |
| `printItems` | `PrintItem[]` | Array of products with quantities (new) |
| `labelSizeType` | `'58mm' \| '80mm' \| 'custom'` | Label size preset |
| `customWidthMm` | `number` | Custom width in mm (for custom size) |
| `customHeightMm` | `number` | Custom height in mm (for custom size) |
| `previewScale` | `number` | Preview zoom level (default: 100) |
| `onScaleChange` | `(scale: number) => void` | Callback for scale changes |
| `onPrint` | `() => void` | Callback when print button clicked |

### 2. MultiLabelPrintDialog (New)
**Location:** `src/components/MultiLabelPrintDialog.tsx`

#### Purpose
Complete dialog for managing and previewing multiple products before printing.

#### Features:
- **Product Selection** - Add products from dropdown
- **Quantity Management** - Set individual quantities for each product
- **Queue Management** - Add, remove, reorder items
- **Label Settings** - Configure label size and dimensions
- **Live Preview** - See exactly what will print
- **Print Summary** - Shows total labels to be printed

#### Usage
```tsx
import MultiLabelPrintDialog from '@/components/MultiLabelPrintDialog';

function MyComponent() {
  const [showMultiPrintDialog, setShowMultiPrintDialog] = useState(false);
  const [stockData] = useState<StockItem[]>([...]);

  const handleMultiPrint = (items: PrintItem[]) => {
    console.log('Printing items:', items);
    // Call your print function here
    // Example: printToUSBPrinter(items);
  };

  return (
    <>
      <Button onClick={() => setShowMultiPrintDialog(true)}>
        Print Multiple Labels
      </Button>

      <MultiLabelPrintDialog
        open={showMultiPrintDialog}
        onOpenChange={setShowMultiPrintDialog}
        stockData={stockData}
        onPrint={handleMultiPrint}
      />
    </>
  );
}
```

## Printing Workflow

### Scenario 1: Print Multiple Units of One Product
1. Open BarcodePrintDialog (existing)
2. Select product
3. Set quantity to desired amount
4. Configure Label Designer fields
5. Click "Print X Labels"

### Scenario 2: Print Different Products (New)
1. Click "Print Multiple Labels" button
2. Add products from dropdown one by one:
   - Select Product A, set quantity 3 → Add to Queue
   - Select Product B, set quantity 5 → Add to Queue
   - Select Product C, set quantity 2 → Add to Queue
3. Reorder items if needed using ↑/↓ buttons
4. Adjust quantities in the queue
5. Configure label size and settings
6. Review preview
7. Click "Print 10 Labels"

## Data Structures

### PrintItem Interface
```typescript
interface PrintItem {
  product: StockItem;
  quantity: number;
}
```

### Usage in Print Functions
When implementing the `onPrint` callback, you'll receive an array of `PrintItem`:

```typescript
const handlePrint = (items: PrintItem[]) => {
  // Calculate total labels
  const totalLabels = items.reduce((sum, item) => sum + item.quantity, 0);
  
  // Iterate through items
  items.forEach(item => {
    const { product, quantity } = item;
    const barcode = product.barcode;
    const productName = product.productName;
    const price = product.retail_price;
    
    // Print `quantity` copies of this product
    for (let i = 0; i < quantity; i++) {
      printLabel(barcode, productName, price);
    }
  });
};
```

## Label Settings

### Available Sizes
- **58mm Thermal** - Compact thermal printer format (58mm wide × 60mm tall)
- **80mm Receipt** - Standard thermal receipt format (80mm wide × 60mm tall)
- **Custom** - Define your own width and height in mm

### Recommendations
| Use Case | Size | Format |
|----------|------|--------|
| Small product barcodes | 58mm | 30×20mm or 40×25mm |
| Standard labels | 58mm | 50×30mm |
| Large price tags | 80mm | 100×50mm or 80×60mm |
| Custom requirements | Custom | As needed |

## Integration Examples

### Example 1: Add button to BarcodeManager
```tsx
import MultiLabelPrintDialog from "@/components/MultiLabelPrintDialog";

export default function BarcodeManager({ stockData }) {
  const [showMultiPrint, setShowMultiPrint] = useState(false);

  return (
    <>
      <Button onClick={() => setShowMultiPrint(true)}>
        <Printer className="h-4 w-4 mr-2" />
        Print Multiple Items
      </Button>

      <MultiLabelPrintDialog
        open={showMultiPrint}
        onOpenChange={setShowMultiPrint}
        stockData={stockData}
        onPrint={(items) => {
          // Call your existing print logic
          console.log('Printing:', items);
        }}
      />
    </>
  );
}
```

### Example 2: Integration with USB Printer
```tsx
const handleMultiPrint = async (items: PrintItem[]) => {
  for (const item of items) {
    for (let i = 0; i < item.quantity; i++) {
      const printJob: PrintJob = {
        barcode: item.product.barcode,
        productName: item.product.productName,
        price: `UGX ${item.product.retail_price?.toLocaleString()}`,
        quantity: 1,
        labelSize: '50x30mm'
      };
      
      enqueuePrintJobs([printJob]); // Send to USB printer
    }
  }
};
```

## Tips & Best Practices

1. **Label Alignment** - Content now prints from the top of the label with proper spacing
2. **Data Visibility** - All label data is visible in preview before printing
3. **Queue Management** - Reorder items in the print queue to group similar products
4. **Field Customization** - Available only in single-product mode via Label Designer
5. **Preview Scaling** - Use the preview scale slider to verify readability

## Known Limitations

- Field editing (Label Designer) is only available in single-product mode
- Multi-product printing uses the same label template for all products
- For different templates per product, use single-product mode and repeat

## Troubleshooting

### Content Overflows Label
- Reduce font sizes in single-product Label Designer
- Use a larger label size from the dropdown
- Remove unnecessary fields from the label template

### Labels Print at Wrong Position
- Verify label size matches physical label size
- Check printer margin settings
- Preview should show content aligned to top with proper spacing

### Missing Data on Printed Labels
- Check that all required fields are visible in the preview
- Verify barcode value is not empty
- Ensure custom field values are properly set

## Future Enhancements

Potential improvements planned:
- [ ] Save print templates
- [ ] Per-product label customization in multi-print mode
- [ ] Batch import from CSV/Excel
- [ ] Print scheduling
- [ ] History and reprint from history
