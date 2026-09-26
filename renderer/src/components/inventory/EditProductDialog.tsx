import { useState, useRef, useCallback } from 'react';
import { StockItem } from '@/types';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Upload, X, Image as ImageIcon, Edit, DollarSign, Barcode, Tag, Info, Package, Camera } from 'lucide-react';
import { isBarcodeDuplicate } from '@/lib/barcode';
import BarcodeScanner from '../BarcodeScanner';

interface EditProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: StockItem | null;
  categories?: string[];
  onSave?: (updated: StockItem) => void;
}

export const EditProductDialog = ({
  open,
  onOpenChange,
  product,
  categories = [],
  onSave
}: EditProductDialogProps) => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [imageFile, setImageFile] = useState<File | null>(null);

  const [formData, setFormData] = useState<Partial<StockItem>>({});
  const [showScanner, setShowScanner] = useState(false);

  // Initialize form when product changes
  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (newOpen && product) {
      setFormData({
        productName: product.productName,
        category: product.category,
        costPerUnit: product.costPerUnit || product.cost_per_unit || 0,
        retailPrice: product.retailPrice || product.retail_price || 0,
        wholesalePrice: product.wholesalePrice || product.wholesale_price || 0,
        barcode: product.barcode || '',
        size: product.size || '',
        notes: product.notes || '',
        packaging_type: product.packaging_type || '',
        unit_name: product.unit_name || '',
        min_stock_level: product.min_stock_level || 5,
        reorder_quantity: product.reorder_quantity || 10,
        quantity: product.quantity || 0,
        sachets_count: product.sachets_count || 0,
        loose_items: product.loose_items || 0,
        items_per_sachet: product.items_per_sachet || 1,
        supplier: (product as any).supplier || '',
      });
      setImagePreview(product.productImage || '');
      setImageFile(null);
    } else {
      setFormData({});
      setImagePreview('');
      setImageFile(null);
    }
    onOpenChange(newOpen);
  }, [product, onOpenChange]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        setImagePreview(result);
        setImageFile(file);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadImage = async (): Promise<string | null> => {
    if (!imageFile || !product) return imagePreview || null;

    try {
      const fileExt = imageFile.name.split('.').pop();
      const fileName = `product-${product.id}-${Date.now()}.${fileExt}`;
      const filePath = `inventory/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('pos-files')
        .upload(filePath, imageFile, { upsert: true });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('pos-files')
        .getPublicUrl(filePath);

      return data.publicUrl;
    } catch (error) {
      console.error('Image upload error:', error);
      toast({
        title: 'Image Upload Failed',
        description: 'Could not upload product image',
        variant: 'destructive'
      });
      return null;
    }
  };

  const handleSave = async () => {
    if (!product) return;

    setIsLoading(true);
    try {
      // Upload image if changed
      let imageUrl = imagePreview;
      if (imageFile) {
        const url = await uploadImage();
        imageUrl = url || imagePreview;
      }

      // Prepare update data
      const updateData: any = {
        product_name: formData.productName || product.productName,
        category: formData.category || product.category,
        cost_per_unit: Number(formData.costPerUnit) || 0,
        retail_price: Number(formData.retailPrice) || 0,
        wholesale_price: Number(formData.wholesalePrice) || 0,
        barcode: formData.barcode || null,
        size: formData.size || null,
        notes: formData.notes || null,
        packaging_type: formData.packaging_type || null,
        unit_name: formData.unit_name || null,
        min_stock_level: Number(formData.min_stock_level) || 5,
        reorder_quantity: Number(formData.reorder_quantity) || 10,
        quantity: Number(formData.quantity) || 0,
        sachets_count: Number(formData.sachets_count) || 0,
        loose_items: Number(formData.loose_items) || 0,
        items_per_sachet: Number(formData.items_per_sachet) || 1,
        supplier: formData.supplier || null,
      };

      if (imageUrl) {
        updateData.product_image = imageUrl;
      }

      // Check for duplicate barcode if it was changed
      if (formData.barcode && formData.barcode !== product.barcode) {
        const isDuplicate = await isBarcodeDuplicate(formData.barcode, product.store_id!, product.id);
        if (isDuplicate) {
          toast({
            title: 'Duplicate Barcode',
            description: 'This barcode is already assigned to another product in your store.',
            variant: 'destructive'
          });
          setIsLoading(false);
          return;
        }
      }

      const { error } = await supabase
        .from('inventory')
        .update(updateData)
        .eq('id', product.id);

      if (error) throw error;

      // Update local state
      const updated: StockItem = {
        ...product,
        ...formData,
        productImage: imageUrl || product.productImage,
        cost_per_unit: updateData.cost_per_unit,
        costPerUnit: updateData.cost_per_unit,
        retail_price: updateData.retail_price,
        retailPrice: updateData.retail_price,
        wholesale_price: updateData.wholesale_price,
        wholesalePrice: updateData.wholesale_price,
        quantity: updateData.quantity,
        sachets_count: updateData.sachets_count,
        loose_items: updateData.loose_items,
        items_per_sachet: updateData.items_per_sachet,
        supplier: updateData.supplier,
      };

      onSave?.(updated);
      toast({
        title: 'Product Updated',
        description: `${formData.productName || product.productName} has been updated successfully`
      });
      handleOpenChange(false);
    } catch (error: any) {
      toast({
        title: 'Update Failed',
        description: error.message || 'Could not update product',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!product) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <Edit className="h-6 w-6 text-primary" />
            Edit Product: {formData.productName || product.productName}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="basic" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="basic">Basic Info</TabsTrigger>
            <TabsTrigger value="stock">Stock</TabsTrigger>
            <TabsTrigger value="pricing">Pricing</TabsTrigger>
            <TabsTrigger value="barcode">Barcode</TabsTrigger>
            <TabsTrigger value="image">Image</TabsTrigger>
          </TabsList>

          {/* Basic Info Tab */}
          <TabsContent value="basic" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Info className="h-5 w-5" />
                  Product Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="productName" className="font-semibold">Product Name *</Label>
                  <Input
                    id="productName"
                    value={formData.productName || ''}
                    onChange={(e) => setFormData({ ...formData, productName: e.target.value })}
                    placeholder="Enter product name"
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="category" className="font-semibold">Category *</Label>
                  {categories.length > 0 ? (
                    <Select value={formData.category || ''} onValueChange={(value) => setFormData({ ...formData, category: value })}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map(cat => (
                          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={formData.category || ''}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      placeholder="Enter category"
                      className="mt-1"
                    />
                  )}
                </div>

                <div>
                  <Label htmlFor="supplier" className="font-semibold">Supplier</Label>
                  <Input
                    id="supplier"
                    value={(formData as any).supplier || ''}
                    onChange={(e) => setFormData({ ...formData, supplier: e.target.value } as any)}
                    placeholder="Enter supplier name"
                    className="mt-1"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="size" className="font-semibold">Size</Label>
                    <Input
                      id="size"
                      value={formData.size || ''}
                      onChange={(e) => setFormData({ ...formData, size: e.target.value })}
                      placeholder="e.g., 500ml, 1kg"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="unitName" className="font-semibold">Unit Name</Label>
                    <Input
                      id="unitName"
                      value={formData.unit_name || ''}
                      onChange={(e) => setFormData({ ...formData, unit_name: e.target.value })}
                      placeholder="e.g., piece, kg"
                      className="mt-1"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="packagingType" className="font-semibold">Packaging Type</Label>
                  <Select value={formData.packaging_type || ''} onValueChange={(value) => setFormData({ ...formData, packaging_type: value })}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select packaging type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sachet">Sachet</SelectItem>
                      <SelectItem value="bottle">Bottle</SelectItem>
                      <SelectItem value="can">Can</SelectItem>
                      <SelectItem value="box">Box</SelectItem>
                      <SelectItem value="bag">Bag</SelectItem>
                      <SelectItem value="loose">Loose</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="notes" className="font-semibold">Notes</Label>
                  <textarea
                    id="notes"
                    value={formData.notes || ''}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Additional notes about the product"
                    className="w-full mt-1 p-2 border rounded-md text-sm"
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                  <div>
                    <Label htmlFor="minStock" className="font-semibold">Min Stock Level</Label>
                    <Input
                      id="minStock"
                      type="number"
                      min="0"
                      value={formData.min_stock_level || 5}
                      onChange={(e) => setFormData({ ...formData, min_stock_level: Number(e.target.value) })}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="reorderQty" className="font-semibold">Reorder Quantity</Label>
                    <Input
                      id="reorderQty"
                      type="number"
                      min="0"
                      value={formData.reorder_quantity || 10}
                      onChange={(e) => setFormData({ ...formData, reorder_quantity: Number(e.target.value) })}
                      className="mt-1"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Stock Tab */}
          <TabsContent value="stock" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Package className="h-5 w-5" />
                  Stock & Quantity
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Product Information Table */}
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <tbody>
                      <tr className="border-b bg-muted/30">
                        <td className="px-4 py-3 font-semibold text-muted-foreground">Product Name</td>
                        <td className="px-4 py-3 font-bold">{product.productName}</td>
                        <td className="px-4 py-3 font-semibold text-muted-foreground">Category</td>
                        <td className="px-4 py-3 font-bold">{product.category}</td>
                      </tr>
                      <tr className="border-b bg-muted/30">
                        <td className="px-4 py-3 font-semibold text-muted-foreground">Barcode</td>
                        <td className="px-4 py-3 font-mono text-xs">{product.barcode || 'N/A'}</td>
                        <td className="px-4 py-3 font-semibold text-muted-foreground">Size</td>
                        <td className="px-4 py-3">{product.size || 'N/A'}</td>
                      </tr>
                      <tr className="bg-muted/30">
                        <td className="px-4 py-3 font-semibold text-muted-foreground">Unit Name</td>
                        <td className="px-4 py-3">{product.unit_name || 'N/A'}</td>
                        <td className="px-4 py-3 font-semibold text-muted-foreground">Packaging Type</td>
                        <td className="px-4 py-3">{product.packaging_type || 'N/A'}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <p className="text-sm text-blue-900">
                    <strong>Current Stock:</strong> {product.quantity.toLocaleString()} {product.unit_name || 'units'}
                  </p>
                </div>

                <div>
                  <Label htmlFor="quantity" className="font-semibold">Update Quantity Available *</Label>
                  <p className="text-xs text-muted-foreground mb-1">Set the new total quantity in stock</p>
                  <Input
                    id="quantity"
                    type="number"
                    min="0"
                    value={formData.quantity || 0}
                    onChange={(e) => setFormData({ ...formData, quantity: Number(e.target.value) })}
                    className="mt-1 text-lg font-semibold"
                  />
                </div>

                <div className="border-t pt-4">
                  <h4 className="font-semibold mb-4">Packaging Breakdown</h4>
                  
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="sachets" className="font-semibold text-sm">Sachets/Packs</Label>
                      <Input
                        id="sachets"
                        type="number"
                        min="0"
                        value={formData.sachets_count || 0}
                        onChange={(e) => setFormData({ ...formData, sachets_count: Number(e.target.value) })}
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <Label htmlFor="itemsPerSachet" className="font-semibold text-sm">Items Per Sachet</Label>
                      <Input
                        id="itemsPerSachet"
                        type="number"
                        min="1"
                        value={formData.items_per_sachet || 1}
                        onChange={(e) => setFormData({ ...formData, items_per_sachet: Number(e.target.value) })}
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <Label htmlFor="looseItems" className="font-semibold text-sm">Loose Items</Label>
                      <Input
                        id="looseItems"
                        type="number"
                        min="0"
                        value={formData.loose_items || 0}
                        onChange={(e) => setFormData({ ...formData, loose_items: Number(e.target.value) })}
                        className="mt-1"
                      />
                    </div>
                  </div>

                  {(formData.sachets_count || formData.loose_items) && (
                    <div className="bg-green-50 p-4 rounded-lg border border-green-200 mt-4">
                      <p className="text-sm text-green-900">
                        <strong>Total Calculated:</strong> {(((formData.sachets_count || 0) * (formData.items_per_sachet || 1)) + (formData.loose_items || 0)).toLocaleString()} units
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Pricing Tab */}
          <TabsContent value="pricing" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <DollarSign className="h-5 w-5" />
                  Pricing & Costs
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <p className="text-sm text-blue-900">
                    <strong>Pricing Hierarchy:</strong> Cost Per Unit → Wholesale → Retail. Set these prices based on your margin requirements.
                  </p>
                </div>

                <div>
                  <Label htmlFor="costPerUnit" className="font-semibold">Cost Per Unit (UGX) *</Label>
                  <p className="text-xs text-muted-foreground mb-1">What you pay to acquire one unit</p>
                  <Input
                    id="costPerUnit"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.costPerUnit || 0}
                    onChange={(e) => setFormData({ ...formData, costPerUnit: Number(e.target.value) })}
                    placeholder="0"
                    className="mt-1 text-lg font-semibold"
                  />
                </div>

                <div>
                  <Label htmlFor="wholesalePrice" className="font-semibold">Wholesale Price (UGX)</Label>
                  <p className="text-xs text-muted-foreground mb-1">Discounted price for bulk purchases</p>
                  <Input
                    id="wholesalePrice"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.wholesalePrice || 0}
                    onChange={(e) => setFormData({ ...formData, wholesalePrice: Number(e.target.value) })}
                    placeholder="0"
                    className="mt-1 text-lg font-semibold"
                  />
                </div>

                <div className="border-t pt-4">
                  <Label htmlFor="retailPrice" className="font-semibold text-lg">Retail Price (UGX) *</Label>
                  <p className="text-xs text-muted-foreground mb-1">Customer facing price</p>
                  <Input
                    id="retailPrice"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.retailPrice || 0}
                    onChange={(e) => setFormData({ ...formData, retailPrice: Number(e.target.value) })}
                    placeholder="0"
                    className="mt-1 text-lg font-semibold border-primary border-2"
                  />
                </div>

                {/* Margin calculator */}
                {formData.costPerUnit && formData.retailPrice && (
                  <div className="bg-green-50 p-4 rounded-lg border border-green-200 space-y-2">
                    <p className="text-sm font-semibold text-green-900">Profit Margin Analysis</p>
                    <div className="text-xs text-green-800 space-y-1">
                      <p>Gross Profit: UGX {((formData.retailPrice - formData.costPerUnit) || 0).toLocaleString()}</p>
                      <p>Margin %: {((((formData.retailPrice - formData.costPerUnit) / formData.costPerUnit) * 100) || 0).toFixed(1)}%</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Barcode Tab */}
          <TabsContent value="barcode" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Barcode className="h-5 w-5" />
                  Barcode Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="barcode" className="font-semibold">Product Barcode</Label>
                  <div className="flex gap-2">
                    <Input
                      id="barcode"
                      value={formData.barcode || ''}
                      onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                      placeholder="Enter barcode number"
                      className="font-mono text-sm"
                    />
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="icon" 
                      onClick={() => setShowScanner(true)}
                      title="Scan Barcode"
                    >
                      <Camera className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Leave empty to generate automatically when printing</p>
                </div>

                <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
                  <p className="text-sm text-amber-900">
                    <strong>Note:</strong> You can manage barcode generation, printing, and regeneration in the Barcode Manager. This field is for manual barcode entry only.
                  </p>
                </div>
              </CardContent>
            </Card>
            <BarcodeScanner 
              isOpen={showScanner} 
              onClose={() => setShowScanner(false)} 
              onScan={(code) => {
                setFormData({ ...formData, barcode: code });
                setShowScanner(false);
              }} 
            />
          </TabsContent>

          {/* Image Tab */}
          <TabsContent value="image" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ImageIcon className="h-5 w-5" />
                  Product Image
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Image Preview */}
                <div className="flex justify-center">
                  {imagePreview ? (
                    <div className="relative">
                      <img
                        src={imagePreview}
                        alt={formData.productName}
                        className="h-64 w-64 object-cover rounded-lg border-2 shadow-lg"
                      />
                      <button
                        onClick={() => {
                          setImagePreview('');
                          setImageFile(null);
                        }}
                        className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white p-2 rounded-full"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="h-64 w-64 bg-muted rounded-lg border-2 border-dashed flex items-center justify-center">
                      <div className="text-center">
                        <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground opacity-50 mb-2" />
                        <p className="text-sm text-muted-foreground">No image</p>
                      </div>
                    </div>
                  )}
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="hidden"
                />

                <Button
                  onClick={() => fileInputRef.current?.click()}
                  variant="outline"
                  className="w-full"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {imagePreview ? 'Change Image' : 'Upload Image'}
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                  JPG, PNG or WebP. Max 5MB.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-6 pt-4 border-t flex gap-2">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isLoading}
            className="gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Edit className="h-4 w-4" />
                Save Changes
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
