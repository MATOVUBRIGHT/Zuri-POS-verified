import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Camera, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Drink } from "@/types";

interface ProductSearchInputProps {
  productName: string;
  setFormData: (updates: any) => void;
  setShowBarcodeScanner: (show: boolean) => void;
}

export const ProductSearchInput = ({
  productName,
  setFormData,
  setShowBarcodeScanner
}: ProductSearchInputProps) => {
  const [isSearchingOnline, setIsSearchingOnline] = useState(false);
  const [onlineDrinks, setOnlineDrinks] = useState<Drink[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const productInputRef = useRef<HTMLInputElement>(null);

  const mapOFFCategory = (product: any): string => {
    let category = 'Other';
    const categoriesText = (product.categories || '').toLowerCase();
    const categoriesTags = product.categories_tags || [];
    
    if (categoriesTags.some((c: string) => c.includes('beverage') || c.includes('drink')) || categoriesText.includes('drink') || categoriesText.includes('beverage')) {
      if (categoriesText.includes('beer') || categoriesText.includes('wine') || categoriesText.includes('alcohol')) {
        category = 'Alcoholic Drink';
      } else if (categoriesText.includes('soda') || categoriesText.includes('cola') || categoriesText.includes('soft')) {
        category = 'Soda';
      } else if (categoriesText.includes('juice')) {
        category = 'Juice';
      } else if (categoriesText.includes('water')) {
        category = 'Water';
      } else if (categoriesText.includes('energy')) {
        category = 'Energy Drink';
      } else {
        category = 'Beverages';
      }
    } else if (categoriesText.includes('snack') || categoriesText.includes('chip') || categoriesText.includes('biscuit')) {
      category = 'Snacks';
    } else if (categoriesText.includes('dairy') || categoriesText.includes('milk') || categoriesText.includes('cheese')) {
      category = 'Dairy';
    } else if (categoriesText.includes('fruit')) {
      category = 'Fruits';
    } else if (categoriesText.includes('vegetable')) {
      category = 'Vegetables';
    } else if (categoriesText.includes('medicine') || categoriesText.includes('pharma') || categoriesText.includes('health')) {
      category = 'Medicine';
    } else if (categoriesText.includes('bread') || categoriesText.includes('bakery')) {
      category = 'Bakery';
    } else if (categoriesText.includes('meat')) {
      category = 'Meat';
    } else if (categoriesText.includes('frozen')) {
      category = 'Frozen Foods';
    } else if (categoriesText.includes('canned')) {
      category = 'Canned Goods';
    } else if (categoriesText.includes('sauce') || categoriesText.includes('condiment')) {
      category = 'Condiments';
    } else if (categoriesText.includes('cleaning') || categoriesText.includes('household')) {
      category = 'Household';
    } else if (categoriesText.includes('personal') || categoriesText.includes('beauty') || categoriesText.includes('cosmetic')) {
      category = 'Personal Care';
    } else if (categoriesTags.some((c: string) => c.includes('food'))) {
      category = 'Food';
    }
    
    return category;
  };

  const searchOnlineDrinks = async (searchTerm: string) => {
    if (!searchTerm || searchTerm.length < 2) {
      setOnlineDrinks([]);
      setShowDropdown(false);
      return;
    }

    setIsSearchingOnline(true);
    try {
      // 1. Search local inventory first
      const { data: localProducts } = await supabase
        .from('inventory')
        .select('product_name, category, barcode')
        .or(`product_name.ilike.%${searchTerm}%,barcode.ilike.%${searchTerm}%`)
        .limit(5);

      const localResults: Drink[] = localProducts?.map(p => ({
        name: p.product_name,
        category: p.category,
        barcode: p.barcode || undefined
      })) || [];

      // 2. Search Open Food Facts API
      let offResults: Drink[] = [];
      try {
        const { data: offData, error: offError } = await supabase.functions.invoke('search-products', {
          body: { searchTerm }
        });
        if (!offError && offData?.products) {
          offResults = offData.products
            .filter((p: any) => p.product_name || p.product_name_en)
            .map((p: any) => ({
              name: p.product_name || p.product_name_en,
              category: mapOFFCategory(p),
              barcode: p.code,
              image: p.image_front_small_url || p.image_url
            }));
        }
      } catch (e) {
        console.warn("OFF search unavailable:", e);
      }

      const combined = [...localResults];
      offResults.forEach(offItem => {
        if (!combined.some(localItem => localItem.name.toLowerCase() === offItem.name.toLowerCase())) {
          combined.push(offItem);
        }
      });

      setOnlineDrinks(combined.slice(0, 20));
      setShowDropdown(combined.length > 0);
    } catch (error) {
      console.error("Error searching products:", error);
    } finally {
      setIsSearchingOnline(false);
    }
  };

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (navigator.onLine) {
        searchOnlineDrinks(productName);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [productName]);

  const selectOnlineDrink = (drink: Drink) => {
    setFormData({
      productName: drink.name,
      category: drink.category,
      barcode: drink.barcode || "",
      productImage: drink.image || ""
    });
    setShowDropdown(false);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement === productInputRef.current && showDropdown && onlineDrinks.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedIndex(prev => Math.min(prev + 1, onlineDrinks.length - 1));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedIndex(prev => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (onlineDrinks[selectedIndex]) {
            selectOnlineDrink(onlineDrinks[selectedIndex]);
          }
        } else if (e.key === 'Escape') {
          setShowDropdown(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showDropdown, onlineDrinks, selectedIndex]);

  return (
    <div className="space-y-2 relative">
      <Label htmlFor="productSearch">Product Search *</Label>
      <div className="relative flex gap-2">
        <div className="relative flex-1">
          <Input
            id="productSearch"
            ref={productInputRef}
            placeholder="Start typing to search (use ↑↓ to navigate)..."
            value={productName}
            onChange={(e) => setFormData({ productName: e.target.value })}
            autoComplete="off"
          />
          {isSearchingOnline && (
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            </div>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => setShowBarcodeScanner(true)}
          title="Scan Barcode"
        >
          <Camera className="h-4 w-4" />
        </Button>
      </div>

      {showDropdown && onlineDrinks.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-card border border-border rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
          {onlineDrinks.map((drink, index) => (
            <div
              key={`${drink.name}-${index}`}
              className={`p-3 cursor-pointer border-b last:border-b-0 transition-colors ${
                index === selectedIndex ? 'bg-primary/10 border-l-2 border-l-primary' : 'hover:bg-accent/20'
              }`}
              onClick={() => selectOnlineDrink(drink)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <div className="flex items-center gap-3">
                {drink.image ? (
                  <img src={drink.image} alt={drink.name} className="w-8 h-8 rounded object-cover flex-shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded bg-muted flex items-center justify-center flex-shrink-0">
                    <Package className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{drink.name}</div>
                  <div className="text-sm text-muted-foreground">{drink.category}</div>
                </div>
                {index === selectedIndex && (
                  <Badge variant="secondary" className="text-xs flex-shrink-0">Enter</Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
