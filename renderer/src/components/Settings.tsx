import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { StockItem, SaleItem, ExpenseItem, TaxConfig, PaymentMethod } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Settings as SettingsIcon,
  Palette,
  Sun,
  Database,
  Download,
  Upload,
  Trash2,
  RefreshCw,
  LogOut,
  User,
  Shield,
  FileText,
  Camera,
  DollarSign,
  Store as StoreIcon,
  Plus,
  Percent,
  CreditCard,
  Crown
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import MembershipPlans from "./MembershipPlans";
import { logAudit } from "@/lib/audit";

interface SettingsProps {
  stockData: StockItem[];
  salesData: SaleItem[];
  expensesData: ExpenseItem[];
  currentStoreId: string | null;
  onDataImport: (data: { stock: StockItem[], sales: SaleItem[], expenses: ExpenseItem[] }) => void;
}

const Settings = ({ stockData, salesData, expensesData, currentStoreId, onDataImport }: SettingsProps) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [colorScheme, setColorScheme] = useState('default');
  const [currency, setCurrency] = useState('UGX');
  const [profile, setProfile] = useState({ full_name: '', email: '', avatar_url: '' });
  const [businessInfo, setBusinessInfo] = useState({
    store_name: '',
    address: '',
    phone: '',
    email: '',
    tin_number: '',
    logo_url: '',
    website: ''
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingBusiness, setIsSavingBusiness] = useState(false);
  const [taxes, setTaxes] = useState<TaxConfig[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [isSavingFinance, setIsSavingFinance] = useState(false);
  const [activeTab, setActiveTab] = useState("account");

  // Track initial values to prevent auto-save on load
  const initialValuesRef = useRef({ colorScheme: 'default', currency: 'UGX' });
  const hasLoadedRef = useRef(false);

  const currencies = [
    { code: 'UGX', name: 'Ugandan Shilling', symbol: 'UGX' },
    { code: 'USD', name: 'US Dollar', symbol: '$' },
    { code: 'EUR', name: 'Euro', symbol: '€' },
    { code: 'GBP', name: 'British Pound', symbol: '£' },
    { code: 'KES', name: 'Kenyan Shilling', symbol: 'KES' },
    { code: 'TZS', name: 'Tanzanian Shilling', symbol: 'TZS' },
    { code: 'RWF', name: 'Rwandan Franc', symbol: 'RWF' },
    { code: 'NGN', name: 'Nigerian Naira', symbol: '₦' },
    { code: 'ZAR', name: 'South African Rand', symbol: 'R' },
    { code: 'GHS', name: 'Ghanaian Cedi', symbol: 'GH₵' },
    { code: 'INR', name: 'Indian Rupee', symbol: '₹' },
    { code: 'CNY', name: 'Chinese Yuan', symbol: '¥' },
    { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
    { code: 'AED', name: 'UAE Dirham', symbol: 'AED' },
  ];

  useEffect(() => {
    fetchProfile();
    if (currentStoreId) {
      fetchStoreDetails();
      fetchFinanceSettings();
    }
  }, [currentStoreId]);

  const fetchFinanceSettings = async () => {
    try {
      const [taxRes, paymentRes] = await Promise.all([
        supabase.from("tax_configurations").select("*").eq("store_id", currentStoreId),
        supabase.from("payment_methods").select("*").eq("store_id", currentStoreId)
      ]);

      if (taxRes.data) setTaxes(taxRes.data);
      if (paymentRes.data) {
        const localKey = `payment_method_details_${currentStoreId}`;
        let localDetails: Record<string, any> = {};
        try {
          localDetails = JSON.parse(localStorage.getItem(localKey) || "{}");
        } catch {
          localDetails = {};
        }

        // Merge local fallback details if the DB column isn't available.
        setPaymentMethods(
          (paymentRes.data as PaymentMethod[]).map((pm) => ({
            ...pm,
            details: (pm as any).details ?? localDetails[pm.id] ?? null,
          }))
        );
      }
    } catch (error) {
      console.error("Error fetching finance settings:", error);
    }
  };

  const saveFinanceSettings = async () => {
    if (!currentStoreId) return;
    setIsSavingFinance(true);
    try {
      // 1. Save Tax Configurations
      // We'll use upsert for current taxes and then handle deletions
      const { data: existingTaxes } = await supabase
        .from("tax_configurations")
        .select("id")
        .eq("store_id", currentStoreId);
      
      const currentTaxIds = taxes.map(t => t.id);
      const taxIdsToDelete = existingTaxes 
        ? existingTaxes.filter(et => !currentTaxIds.includes(et.id)).map(et => et.id)
        : [];

      if (taxIdsToDelete.length > 0) {
        await supabase
          .from("tax_configurations")
          .delete()
          .in("id", taxIdsToDelete);
      }

      if (taxes.length > 0) {
        const { data: { user } } = await supabase.auth.getUser();
        const taxesWithStoreId = taxes.map(t => ({
          ...t,
          store_id: currentStoreId,
          user_id: user?.id || ''
        }));
        const { error: taxError } = await supabase
          .from("tax_configurations")
          .upsert(taxesWithStoreId);
        if (taxError) throw taxError;
      }

      // 2. Save Payment Methods
      const { data: existingMethods } = await supabase
        .from("payment_methods")
        .select("id")
        .eq("store_id", currentStoreId);
      
      const currentMethodIds = paymentMethods.map(pm => pm.id);
      const methodIdsToDelete = existingMethods 
        ? existingMethods.filter(em => !currentMethodIds.includes(em.id)).map(em => em.id)
        : [];

      if (methodIdsToDelete.length > 0) {
        await supabase
          .from("payment_methods")
          .delete()
          .in("id", methodIdsToDelete);
      }

      if (paymentMethods.length > 0) {
        const { data: { user } } = await supabase.auth.getUser();
        const methodsWithStoreId = paymentMethods.map(pm => ({
          id: pm.id,
          name: pm.name,
          is_active: pm.is_active !== false,
          store_id: currentStoreId,
          user_id: user?.id || ''
        }));

        const methodsWithDetails = methodsWithStoreId.map((pm) => ({
          ...pm,
          details: paymentMethods.find((x) => x.id === pm.id)?.details ?? null,
        }));

        // Prefer DB persistence when the column exists; fall back to localStorage when it doesn't.
        const { error: methodError } = await supabase
          .from("payment_methods")
          .upsert(methodsWithDetails as any);

        if (methodError) {
          const msg = (methodError as any)?.message?.toString?.()?.toLowerCase?.() || '';
          const looksLikeMissingColumn =
            msg.includes('details') && (msg.includes('column') || msg.includes('schema') || msg.includes('does not exist')) ||
            (methodError as any)?.code === 'PGRST204';

          if (!looksLikeMissingColumn) throw methodError;

          const retry = await supabase
            .from("payment_methods")
            .upsert(methodsWithStoreId as any);
          if (retry.error) throw retry.error;
        }

        const localKey = `payment_method_details_${currentStoreId}`;
        const detailsMap = Object.fromEntries(
          paymentMethods.map((pm) => [pm.id, pm.details ?? null])
        );
        localStorage.setItem(localKey, JSON.stringify(detailsMap));
      } else {
        const localKey = `payment_method_details_${currentStoreId}`;
        localStorage.removeItem(localKey);
      }

      // Audit log for finance settings
      await logAudit({
        action: 'update',
        tableName: 'payment_methods',
        newData: { taxes: taxes.length, paymentMethods: paymentMethods.length },
        storeId: currentStoreId,
      });

      toast({
        title: "Settings Saved",
        description: "Finance configurations updated successfully.",
        variant: "success",
      });
      
      // Refresh to ensure we have the latest data from DB
      fetchFinanceSettings();
    } catch (error) {
      console.error("Error saving finance settings:", error);
      toast({
        variant: "destructive",
        title: "Save Failed",
        description: "Could not save finance settings. Please try again.",
      });
    } finally {
      setIsSavingFinance(false);
    }
  };

  const fetchStoreDetails = async () => {
    try {
      const { data, error } = await supabase
        .from("stores")
        .select("*")
        .eq("id", currentStoreId)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        const storeData = data as unknown as {
          store_name: string;
          address: string;
          phone: string;
          email: string;
          tin_number: string;
          logo_url: string;
          website: string;
        };
        setBusinessInfo({
          store_name: storeData.store_name || '',
          address: storeData.address || '',
          phone: storeData.phone || '',
          email: storeData.email || '',
          tin_number: storeData.tin_number || '',
          logo_url: storeData.logo_url || '',
          website: storeData.website || ''
        });
      }
    } catch (error) {
      console.error("Error fetching store details:", error);
    }
  };

  const fetchProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      setProfile({
        full_name: data?.full_name || '',
        email: user.email || '',
        avatar_url: data?.avatar_url || ''
      });

      // Always use light theme - dark theme removed
      const dbColorScheme = data?.color_scheme || 'default';
      const savedCurrency = localStorage.getItem('app_currency') || 'UGX';

      setColorScheme(dbColorScheme);
      setCurrency(savedCurrency);

      // Store initial values
      initialValuesRef.current = { colorScheme: dbColorScheme, currency: savedCurrency };
      hasLoadedRef.current = true;

      // DO NOT apply theme here - only apply on explicit save to prevent theme change on settings open

    } catch (error: unknown) {
      console.error("Error fetching profile:", error);
    }
  };

  const applyTheme = (themeValue: string) => {
    const root = window.document.documentElement;
    // Always use light theme - dark theme removed
    root.classList.remove('dark');
  };

  const applyColorScheme = (scheme: string) => {
    const root = window.document.documentElement;
    root.classList.remove('theme-ocean', 'theme-purple', 'theme-forest', 'theme-sunset', 'theme-royal', 'theme-midnight', 'theme-rose', 'theme-teal');
    if (scheme !== 'default') {
      root.classList.add(`theme-${scheme}`);
    }
    // Force re-render of sidebar and navbar by triggering a CSS variable update
    document.documentElement.style.setProperty('--theme-updated', Date.now().toString());
  };

  const saveProfile = async () => {
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      // First check if profile exists
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      let error;
      if (existingProfile) {
        // Update existing profile
        const result = await supabase
          .from("profiles")
          .update({
            full_name: profile.full_name,
            avatar_url: profile.avatar_url,
            theme: 'light',
            color_scheme: colorScheme,
            updated_at: new Date().toISOString()
          })
          .eq("user_id", user.id);
        error = result.error;
      } else {
        // Insert new profile
        const result = await supabase
          .from("profiles")
          .insert({
            user_id: user.id,
            full_name: profile.full_name,
            avatar_url: profile.avatar_url,
            theme: 'light',
            color_scheme: colorScheme
          });
        error = result.error;
      }

      if (error) throw error;

      // Apply theme only when explicitly saved
      applyTheme('light');
      applyColorScheme(colorScheme);
      // Save currency to localStorage
      localStorage.setItem('app_currency', currency);

      // Update initial values after save
      initialValuesRef.current = { colorScheme, currency };

      toast({
        title: "Profile updated",
        description: "Your profile and preferences have been saved successfully.",
        variant: "success",
      });
    } catch (error: unknown) {
      const err = error as Error;
      toast({
        variant: "destructive",
        title: "Error saving profile",
        description: err.message,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const saveBusinessDetails = async () => {
    if (!currentStoreId) {
      toast({
        title: "No Store Selected",
        description: "Select a store before saving business details.",
        variant: "destructive",
      });
      return;
    }

    setIsSavingBusiness(true);
    try {
      const { error } = await supabase
        .from("stores")
        .update({
          store_name: businessInfo.store_name,
          address: businessInfo.address,
          phone: businessInfo.phone,
          email: businessInfo.email,
          tin_number: businessInfo.tin_number,
          logo_url: businessInfo.logo_url,
          website: businessInfo.website
        } as any)
        .eq("id", currentStoreId);

      if (error) throw error;
      toast({ title: "Business info saved", description: "Your receipt and store details are updated.", variant: "success" });
    } catch (error: unknown) {
      const err = error as Error;
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setIsSavingBusiness(false);
    }
  };

  const saveCurrentTab = async () => {
    if (activeTab === "account" || activeTab === "theme" || activeTab === "currency") {
      await saveProfile();
      return;
    }

    if (activeTab === "business") {
      await saveBusinessDetails();
      return;
    }

    if (activeTab === "finance") {
      await saveFinanceSettings();
      return;
    }

    toast({
      title: "Nothing to save",
      description: "This tab does not contain saveable settings.",
    });
  };

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({
        variant: "destructive",
        title: "Logout failed",
        description: error.message,
      });
    } else {
      toast({
        title: "Logged out",
        description: "Successfully logged out.",
      });
      navigate("/auth");
    }
  };

  // Handle color scheme change - apply preview immediately
  const handleColorSchemeChange = (newScheme: string) => {
    setColorScheme(newScheme);
    // Apply preview immediately so user can see the change
    applyColorScheme(newScheme);
  };

  // Data management functions
  const calculateDataSize = () => {
    const totalData = { stockData, salesData, expensesData };
    return JSON.stringify(totalData).length;
  };

  const exportAllData = () => {
    const allData = {
      stock: stockData,
      sales: salesData,
      expenses: expensesData,
      exportDate: new Date().toISOString()
    };

    const dataStr = JSON.stringify(allData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `brec-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({
    title: "Data Exported",
    description: "Your data has been successfully exported as a backup file.",
    variant: "success"
    });
  };

  const importData = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const importedData = JSON.parse(event.target?.result as string);
            if (importedData.stock && importedData.sales && importedData.expenses) {
              onDataImport({
                stock: importedData.stock,
                sales: importedData.sales,
                expenses: importedData.expenses
              });
              toast({
                title: "Data Imported",
                description: "Your data has been successfully imported from the backup file.",
                variant: "success"
              });
            } else {
              throw new Error("Invalid file format");
            }
          } catch (error) {
            toast({
              title: "Import Failed",
              description: "The file format is invalid or corrupted.",
              variant: "destructive"
            });
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  const clearAllData = () => {
    if (confirm("Are you sure you want to clear all data? This action cannot be undone.")) {
      onDataImport({
        stock: [],
        sales: [],
        expenses: []
      });

      localStorage.removeItem('productImages');

      toast({
        title: "Data Cleared",
        description: "All application data has been cleared.",
        variant: "success"
      });
    }
  };

  const refreshCache = () => {
    if ('caches' in window) {
      caches.keys().then(names => {
        names.forEach(name => {
          caches.delete(name);
        });
      });
    }

    sessionStorage.clear();

    toast({
      title: "Cache Refreshed",
      description: "Application cache has been cleared.",
      variant: "success"
    });
  };

  const getStorageUsage = () => {
    const productImages = localStorage.getItem('productImages') || '{}';
    const imagesSize = JSON.stringify(productImages).length;
    const dataSize = calculateDataSize();

    return {
      total: ((imagesSize + dataSize) / 1024).toFixed(2),
      images: (imagesSize / 1024).toFixed(2),
      data: (dataSize / 1024).toFixed(2)
    };
  };

  const storage = getStorageUsage();

  const TermsContent = () => (
    <div className="space-y-4 text-sm text-muted-foreground">
      <h3 className="font-semibold text-foreground">Terms and Conditions</h3>
      <p>Last updated: {new Date().toLocaleDateString()}</p>

      <h4 className="font-medium text-foreground mt-4">1. Acceptance of Terms</h4>
      <p>By accessing and using brec Inventory Manager, you accept and agree to be bound by the terms and provisions of this agreement.</p>

      <h4 className="font-medium text-foreground mt-4">2. Use of Service</h4>
      <p>You agree to use this service only for lawful purposes and in accordance with these Terms. You are responsible for maintaining the confidentiality of your account credentials.</p>

      <h4 className="font-medium text-foreground mt-4">3. User Data</h4>
      <p>You retain all rights to your data. We provide tools to export your data at any time. You are responsible for backing up your own data.</p>

      <h4 className="font-medium text-foreground mt-4">4. Service Availability</h4>
      <p>We strive to maintain high availability but do not guarantee uninterrupted service. We may modify or discontinue features with reasonable notice.</p>

      <h4 className="font-medium text-foreground mt-4">5. Limitation of Liability</h4>
      <p>We are not liable for any indirect, incidental, or consequential damages arising from the use of our service.</p>

      <h4 className="font-medium text-foreground mt-4">6. Changes to Terms</h4>
      <p>We reserve the right to modify these terms at any time. Continued use of the service constitutes acceptance of modified terms.</p>
    </div>
  );

  const PrivacyContent = () => (
    <div className="space-y-4 text-sm text-muted-foreground">
      <h3 className="font-semibold text-foreground">Privacy Policy</h3>
      <p>Last updated: {new Date().toLocaleDateString()}</p>

      <div className="p-3 bg-primary/10 rounded-lg">
        <div className="flex items-center gap-2 text-primary font-medium">
          <Shield className="h-4 w-4" />
          <span>We Do Not Collect Your Personal Data</span>
        </div>
        <p className="mt-2 text-foreground">Your inventory, sales, and business data stays with you. We do not sell, share, or analyze your business information for any purpose.</p>
      </div>

      <h4 className="font-medium text-foreground mt-4">1. Information We Store</h4>
      <p>We only store information necessary to provide the service:</p>
      <ul className="list-disc list-inside ml-2 space-y-1">
        <li>Email address (for authentication)</li>
        <li>Your business data (inventory, sales, expenses) - stored securely and only accessible by you</li>
        <li>Theme preferences</li>
      </ul>

      <h4 className="font-medium text-foreground mt-4">2. Data Security</h4>
      <p>Your data is encrypted in transit and at rest. We use industry-standard security practices to protect your information.</p>

      <h4 className="font-medium text-foreground mt-4">3. Data Access</h4>
      <p>Only you can access your business data. We do not access, read, or analyze your inventory, sales, or financial information.</p>

      <h4 className="font-medium text-foreground mt-4">4. Data Deletion</h4>
      <p>You can delete your account and all associated data at any time through the Settings page.</p>

      <h4 className="font-medium text-foreground mt-4">5. Third-Party Services</h4>
      <p>We use secure authentication services. No third parties have access to your business data.</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold text-foreground">Settings</h2>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-sm">
            <SettingsIcon className="h-3 w-3 mr-1" />
            Configuration
          </Badge>
          <Button
            size="sm"
            onClick={saveCurrentTab}
            disabled={isSaving || isSavingBusiness || isSavingFinance}
          >
            Save Current Tab
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="w-full flex flex-wrap md:grid md:grid-cols-10 gap-1">
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="business">Business</TabsTrigger>
          <TabsTrigger value="theme">Theme</TabsTrigger>
          <TabsTrigger value="currency">Currency</TabsTrigger>
          <TabsTrigger value="finance">Finance</TabsTrigger>
          <TabsTrigger value="data">Data</TabsTrigger>
          <TabsTrigger value="storage">Storage</TabsTrigger>
          <TabsTrigger value="membership" className="gap-1">
            <Crown className="h-3 w-3" />
            Plans
          </TabsTrigger>
          <TabsTrigger value="legal">Legal</TabsTrigger>
        </TabsList>

        {/* Account Settings */}
        <TabsContent value="account" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Profile Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-col md:flex-row items-center gap-6">
                {/* Avatar Section */}
                <div className="relative group">
                  <div className="h-28 w-28 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center overflow-hidden border-4 border-primary/30 shadow-lg">
                    {profile.avatar_url ? (
                      <img src={profile.avatar_url} alt="Profile" className="h-full w-full object-cover" />
                    ) : (
                      <User className="h-14 w-14 text-primary" />
                    )}
                  </div>
                  <label className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                    <Camera className="h-6 w-6 text-white" />
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (event) => {
                            setProfile({ ...profile, avatar_url: event.target?.result as string });
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                  </label>
                  <div className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground rounded-full p-1.5 shadow-md">
                    <Camera className="h-3 w-3" />
                  </div>
                </div>

                {/* Profile Info */}
                <div className="flex-1 space-y-4 w-full">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Full Name</label>
                      <input
                        type="text"
                        placeholder="Enter your name"
                        value={profile.full_name}
                        onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                        className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-foreground mt-1 focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Email Address</label>
                      <input
                        type="email"
                        disabled
                        value={profile.email}
                        className="w-full px-4 py-2.5 bg-muted/50 border border-border rounded-lg text-muted-foreground mt-1 cursor-not-allowed"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <Badge variant="outline" className="text-xs">
                      <Shield className="h-3 w-3 mr-1" />
                      Verified Account
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      Active
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t flex justify-end">
                <Button variant="default" onClick={saveProfile} disabled={isSaving} className="px-6">
                  {isSaving ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LogOut className="h-5 w-5" />
                Account Actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div>
                  <h4 className="font-medium mb-2">Sign Out</h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    Sign out from your account on this device.
                  </p>
                  <Button
                    variant="outline"
                    onClick={handleLogout}
                    className="w-full md:w-auto gap-2 border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign Out
                  </Button>
                </div>

                <div className="pt-6 border-t">
                  <h4 className="font-medium mb-2 text-destructive">Danger Zone</h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    Permanently delete your account and all associated data. This action cannot be undone.
                  </p>
                  <Button
                    variant="destructive"
                    onClick={async () => {
                      if (confirm("Are you sure you want to delete your account? This action cannot be undone and all your data will be permanently deleted.")) {
                        try {
                          const { data: { user } } = await supabase.auth.getUser();
                          if (!user) throw new Error("User not authenticated");

                          toast({
                            title: "Account Deletion Requested",
                            description: "Please contact support to complete account deletion.",
                          });
                          await supabase.auth.signOut();
                          navigate("/auth");
                        } catch (error: unknown) {
                          const err = error as Error;
                          toast({
                            variant: "destructive",
                            title: "Error",
                            description: err.message,
                          });
                        }
                      }
                    }}
                    className="w-full md:w-auto gap-2"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete Account
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Business Settings */}
        <TabsContent value="business" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <StoreIcon className="h-5 w-5" />
                Business Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Business Name</label>
                  <input
                    type="text"
                    value={businessInfo.store_name}
                    onChange={(e) => setBusinessInfo({ ...businessInfo, store_name: e.target.value })}
                    className="w-full px-3 py-2 bg-background border border-border rounded-md"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Phone Number</label>
                  <input
                    type="text"
                    value={businessInfo.phone}
                    onChange={(e) => setBusinessInfo({ ...businessInfo, phone: e.target.value })}
                    className="w-full px-3 py-2 bg-background border border-border rounded-md"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Business Email</label>
                  <input
                    type="email"
                    value={businessInfo.email}
                    onChange={(e) => setBusinessInfo({ ...businessInfo, email: e.target.value })}
                    className="w-full px-3 py-2 bg-background border border-border rounded-md"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Tax ID / TIN (Optional)</label>
                  <input
                    type="text"
                    value={businessInfo.tin_number}
                    onChange={(e) => setBusinessInfo({ ...businessInfo, tin_number: e.target.value })}
                    className="w-full px-3 py-2 bg-background border border-border rounded-md"
                  />
                </div>
                <div className="md:col-span-2 space-y-2">
                  <label className="text-sm font-medium">Physical Address</label>
                  <textarea
                    value={businessInfo.address}
                    onChange={(e) => setBusinessInfo({ ...businessInfo, address: e.target.value })}
                    className="w-full px-3 py-2 bg-background border border-border rounded-md min-h-[80px]"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Website (Optional)</label>
                  <input
                    type="text"
                    value={businessInfo.website}
                    onChange={(e) => setBusinessInfo({ ...businessInfo, website: e.target.value })}
                    className="w-full px-3 py-2 bg-background border border-border rounded-md"
                  />
                </div>
              </div>

              <div className="pt-4 border-t flex justify-end">
                <Button
                  disabled={isSavingBusiness}
                  onClick={saveBusinessDetails}
                >
                  {isSavingBusiness ? "Saving..." : "Save Business Details"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Theme Settings */}
        <TabsContent value="theme" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="h-5 w-5" />
                Appearance & Theme
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h4 className="font-medium mb-3">Theme</h4>
                <p className="text-sm text-muted-foreground mb-3">Light theme is enabled for optimal visibility.</p>
                <div className="flex items-center gap-2 p-4 bg-primary/10 rounded-lg border border-primary/20">
                  <Sun className="h-5 w-5 text-primary" />
                  <div className="text-left">
                    <div className="font-medium">Light Mode Active</div>
                    <div className="text-xs text-muted-foreground">The app uses light theme for best readability</div>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-3">Accent Color</h4>
                <p className="text-sm text-muted-foreground mb-3">Changes the primary button and accent colors only.</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Button
                    variant={colorScheme === 'default' ? 'default' : 'outline'}
                    className="h-auto p-3"
                    onClick={() => handleColorSchemeChange('default')}
                  >
                    <div className="text-left w-full">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-4 h-4 rounded-full bg-[hsl(217,78%,51%)]"></div>
                        <div className="font-medium text-sm">Blue</div>
                      </div>
                    </div>
                  </Button>

                  <Button
                    variant={colorScheme === 'ocean' ? 'default' : 'outline'}
                    className="h-auto p-3"
                    onClick={() => handleColorSchemeChange('ocean')}
                  >
                    <div className="text-left w-full">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-4 h-4 rounded-full bg-[hsl(199,89%,48%)]"></div>
                        <div className="font-medium text-sm">Ocean</div>
                      </div>
                    </div>
                  </Button>

                  <Button
                    variant={colorScheme === 'purple' ? 'default' : 'outline'}
                    className="h-auto p-3"
                    onClick={() => handleColorSchemeChange('purple')}
                  >
                    <div className="text-left w-full">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-4 h-4 rounded-full bg-[hsl(271,81%,56%)]"></div>
                        <div className="font-medium text-sm">Purple</div>
                      </div>
                    </div>
                  </Button>

                  <Button
                    variant={colorScheme === 'forest' ? 'default' : 'outline'}
                    className="h-auto p-3"
                    onClick={() => handleColorSchemeChange('forest')}
                  >
                    <div className="text-left w-full">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-4 h-4 rounded-full bg-[hsl(142,76%,36%)]"></div>
                        <div className="font-medium text-sm">Forest</div>
                      </div>
                    </div>
                  </Button>

                  <Button
                    variant={colorScheme === 'sunset' ? 'default' : 'outline'}
                    className="h-auto p-3"
                    onClick={() => handleColorSchemeChange('sunset')}
                  >
                    <div className="text-left w-full">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-4 h-4 rounded-full bg-[hsl(24,95%,53%)]"></div>
                        <div className="font-medium text-sm">Sunset</div>
                      </div>
                    </div>
                  </Button>

                  <Button
                    variant={colorScheme === 'royal' ? 'default' : 'outline'}
                    className="h-auto p-3"
                    onClick={() => handleColorSchemeChange('royal')}
                  >
                    <div className="text-left w-full">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-4 h-4 rounded-full bg-[hsl(348,83%,47%)]"></div>
                        <div className="font-medium text-sm">Royal</div>
                      </div>
                    </div>
                  </Button>

                  <Button
                    variant={colorScheme === 'teal' ? 'default' : 'outline'}
                    className="h-auto p-3"
                    onClick={() => handleColorSchemeChange('teal')}
                  >
                    <div className="text-left w-full">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-4 h-4 rounded-full bg-[hsl(174,72%,40%)]"></div>
                        <div className="font-medium text-sm">Teal</div>
                      </div>
                    </div>
                  </Button>

                  <Button
                    variant={colorScheme === 'rose' ? 'default' : 'outline'}
                    className="h-auto p-3"
                    onClick={() => handleColorSchemeChange('rose')}
                  >
                    <div className="text-left w-full">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-4 h-4 rounded-full bg-[hsl(350,70%,60%)]"></div>
                        <div className="font-medium text-sm">Rose</div>
                      </div>
                    </div>
                  </Button>
                </div>
              </div>

              <div className="pt-4 border-t">
                <p className="text-sm text-muted-foreground mb-3">Click "Save Changes" to apply your theme preferences.</p>
                <Button variant="default" onClick={saveProfile}>Save Changes</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Currency Settings */}
        <TabsContent value="currency" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Currency Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h4 className="font-medium mb-3">Select Currency</h4>
                <p className="text-sm text-muted-foreground mb-4">
                  Choose the currency to display throughout the application.
                </p>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger className="w-full md:w-80">
                    <SelectValue placeholder="Select currency" />
                  </SelectTrigger>
                  <SelectContent>
                    {currencies.map((curr) => (
                      <SelectItem key={curr.code} value={curr.code}>
                        <span className="flex items-center gap-2">
                          <span className="font-medium">{curr.symbol}</span>
                          <span>{curr.name} ({curr.code})</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="p-4 bg-muted rounded-lg">
                <h5 className="font-medium mb-2">Current Selection</h5>
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                    <span className="text-xl font-bold text-primary">
                      {currencies.find(c => c.code === currency)?.symbol || currency}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium">{currencies.find(c => c.code === currency)?.name}</p>
                    <p className="text-sm text-muted-foreground">Code: {currency}</p>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-info/10 border border-info/20 rounded-lg text-sm text-info">
                <p>💡 Currency changes will apply to all amounts displayed in the app. Existing data values won't be converted.</p>
              </div>

              <div className="pt-4 border-t">
                <Button variant="default" onClick={saveProfile}>Save Currency</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Finance Settings */}
        <TabsContent value="finance" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Percent className="h-5 w-5" />
                  Tax Configurations
                </CardTitle>
                <Button variant="outline" size="sm" onClick={() => setTaxes([...taxes, { id: crypto.randomUUID(), name: '', rate: 0, is_active: true }])}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Tax
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {taxes.map((tax, index) => (
                  <div key={tax.id} className="flex items-center gap-3 p-3 border rounded-lg">
                    <div className="flex-1">
                      <Input 
                        placeholder="Tax Name (e.g. VAT)" 
                        value={tax.name}
                        onChange={(e) => {
                          const newTaxes = [...taxes];
                          newTaxes[index].name = e.target.value;
                          setTaxes(newTaxes);
                        }}
                      />
                    </div>
                    <div className="w-24">
                      <Input 
                        type="number" 
                        placeholder="Rate %" 
                        value={tax.rate}
                        onChange={(e) => {
                          const newTaxes = [...taxes];
                          newTaxes[index].rate = parseFloat(e.target.value);
                          setTaxes(newTaxes);
                        }}
                      />
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setTaxes(taxes.filter((_, i) => i !== index))}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
                {taxes.length === 0 && (
                  <p className="text-center py-4 text-muted-foreground text-sm">No taxes configured.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Payment Methods
                </CardTitle>
                <Button variant="outline" size="sm" onClick={() => setPaymentMethods([...paymentMethods, { id: crypto.randomUUID(), name: '', is_active: true }])}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Method
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Quick Add Presets */}
                <div className="flex flex-wrap gap-2 p-3 bg-muted/50 rounded-lg border-dashed border">
                  <p className="text-xs text-muted-foreground w-full mb-1">Quick Add:</p>
                  {['Cash', 'MTN Mobile Money', 'Airtel Money', 'Bank Transfer', 'Credit Card'].map((preset) => (
                    <Button
                      key={preset}
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => {
                        if (!paymentMethods.find(pm => pm.name === preset)) {
                          setPaymentMethods([...paymentMethods, { id: crypto.randomUUID(), name: preset, is_active: true }]);
                        }
                      }}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      {preset}
                    </Button>
                  ))}
                </div>

                {paymentMethods.map((method, index) => (
                  <div key={method.id} className="p-3 border rounded-lg space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <Input
                          placeholder="Method Name (e.g. MTN Mobile Money)"
                          value={method.name}
                          onChange={(e) => {
                            const newMethods = [...paymentMethods];
                            newMethods[index].name = e.target.value;
                            setPaymentMethods(newMethods);
                          }}
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setPaymentMethods(paymentMethods.filter((_, i) => i !== index))}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <Input
                        placeholder="Mobile money number (paid to)"
                        value={method.details?.mobileMoneyNumber || ""}
                        onChange={(e) => {
                          const newMethods = [...paymentMethods];
                          newMethods[index].details = {
                            ...(newMethods[index].details || {}),
                            mobileMoneyNumber: e.target.value,
                          };
                          setPaymentMethods(newMethods);
                        }}
                      />
                      <Input
                        placeholder="Bank name"
                        value={method.details?.bankName || ""}
                        onChange={(e) => {
                          const newMethods = [...paymentMethods];
                          newMethods[index].details = {
                            ...(newMethods[index].details || {}),
                            bankName: e.target.value,
                          };
                          setPaymentMethods(newMethods);
                        }}
                      />
                      <Input
                        placeholder="Account name"
                        value={method.details?.accountName || ""}
                        onChange={(e) => {
                          const newMethods = [...paymentMethods];
                          newMethods[index].details = {
                            ...(newMethods[index].details || {}),
                            accountName: e.target.value,
                          };
                          setPaymentMethods(newMethods);
                        }}
                      />
                      <Input
                        placeholder="Account number"
                        value={method.details?.accountNumber || ""}
                        onChange={(e) => {
                          const newMethods = [...paymentMethods];
                          newMethods[index].details = {
                            ...(newMethods[index].details || {}),
                            accountNumber: e.target.value,
                          };
                          setPaymentMethods(newMethods);
                        }}
                      />
                      <Input
                        placeholder="Till number"
                        value={method.details?.tillNumber || ""}
                        onChange={(e) => {
                          const newMethods = [...paymentMethods];
                          newMethods[index].details = {
                            ...(newMethods[index].details || {}),
                            tillNumber: e.target.value,
                          };
                          setPaymentMethods(newMethods);
                        }}
                      />
                      <Input
                        placeholder="Paybill number"
                        value={method.details?.paybillNumber || ""}
                        onChange={(e) => {
                          const newMethods = [...paymentMethods];
                          newMethods[index].details = {
                            ...(newMethods[index].details || {}),
                            paybillNumber: e.target.value,
                          };
                          setPaymentMethods(newMethods);
                        }}
                      />
                      <Input
                        placeholder="Notes/instructions"
                        value={method.details?.notes || ""}
                        onChange={(e) => {
                          const newMethods = [...paymentMethods];
                          newMethods[index].details = {
                            ...(newMethods[index].details || {}),
                            notes: e.target.value,
                          };
                          setPaymentMethods(newMethods);
                        }}
                        className="md:col-span-2"
                      />
                    </div>
                  </div>
                ))}
                {paymentMethods.length === 0 && (
                  <p className="text-center py-4 text-muted-foreground text-sm">No payment methods configured. Use quick add buttons above to get started.</p>
                )}
              </CardContent>
            </Card>
          </div>
          <div className="flex justify-end">
            <Button onClick={saveFinanceSettings} disabled={isSavingFinance}>
              {isSavingFinance ? "Saving..." : "Save Finance Settings"}
            </Button>
          </div>
        </TabsContent>

        {/* Data Management */}
        <TabsContent value="data" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Data Backup & Restore
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={exportAllData}
                >
                  <Download className="h-4 w-4" />
                  Export All Data
                </Button>
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={importData}
                >
                  <Upload className="h-4 w-4" />
                  Import Data
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <Trash2 className="h-5 w-5" />
                Clear Data
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                This will permanently delete all your stock, sales, and expense data. This action cannot be undone.
              </p>
              <Button
                variant="destructive"
                className="w-full md:w-auto gap-2"
                onClick={clearAllData}
              >
                <Trash2 className="h-4 w-4" />
                Clear All Data
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Storage */}
        <TabsContent value="storage" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Storage Usage
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                  <span className="text-sm">Total Storage Used</span>
                  <span className="font-medium">{storage.total} KB</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                  <span className="text-sm">Product Images</span>
                  <span className="font-medium">{storage.images} KB</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                  <span className="text-sm">App Data</span>
                  <span className="font-medium">{storage.data} KB</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5" />
                Cache Management
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Clear cached data to free up storage and resolve potential display issues.
              </p>
              <Button
                variant="outline"
                className="w-full md:w-auto gap-2"
                onClick={refreshCache}
              >
                <RefreshCw className="h-4 w-4" />
                Clear Cache
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Membership Plans */}
        <TabsContent value="membership" className="space-y-6">
          <MembershipPlans />
        </TabsContent>

        {/* Legal - Terms & Privacy */}
        <TabsContent value="legal" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Terms and Conditions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[300px] pr-4">
                <TermsContent />
              </ScrollArea>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Privacy Policy
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[300px] pr-4">
                <PrivacyContent />
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Settings;
