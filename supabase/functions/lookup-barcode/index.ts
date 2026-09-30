import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { barcode } = await req.json();

    // Input validation: barcodes can include digits, letters, hyphens and dashes
    // (EAN-13, UPC-A are numeric; GS1-128, Code-39 allow alphanumeric + hyphens).
    // Max 50 chars covers all standard barcode symbologies.
    if (!barcode || typeof barcode !== 'string' || barcode.length > 50 || !/^[a-zA-Z0-9\-]+$/.test(barcode)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid barcode format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Try Open Food Facts API (free, no key needed)
    const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json`, {
      headers: {
        'User-Agent': 'BrePOS/1.0 - Contact: support@brepos.app'
      }
    });

    const data = await response.json();

    if (data.status === 1 && data.product) {
      const product = data.product;
      
      let category = 'Other';
      const categories = product.categories_tags || [];
      const categoriesText = (product.categories || '').toLowerCase();
      
      if (categories.some((c: string) => c.includes('beverage') || c.includes('drink')) || categoriesText.includes('drink') || categoriesText.includes('beverage')) {
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
      } else if (categories.some((c: string) => c.includes('food'))) {
        category = 'Food';
      }
      
      return new Response(
        JSON.stringify({
          success: true,
          product: {
            name: product.product_name || product.product_name_en || 'Unknown Product',
            brand: product.brands || '',
            category: category,
            image: product.image_front_small_url || product.image_url || null,
            barcode: barcode,
            quantity: product.quantity || '',
            origin: 'openfoodfacts'
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Product not found in database' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: 'Failed to lookup barcode' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
