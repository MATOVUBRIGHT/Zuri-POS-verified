import { useEffect, useState, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Camera, Upload, Check } from "lucide-react";
import { PageLoader, InlineSpinner } from "@/components/ui/loading-spinner";

export default function MobileAction() {
  const [search] = useSearchParams();
  const token = search.get("token") || (search.get("action") !== "product_image" ? search.get("action") || "" : "");
  const productId = search.get("product_id") || "";
  const requestedRedirect = search.get("redirect") || "";
  const [action, setAction] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<any>({ description: "", category: "Other", amount: "", date: new Date().toISOString().split('T')[0], notes: "" });
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        if (!token) {
          // A plain mobile link is an app entry link. Send the user through the
          // normal login screen, then return to the requested app page.
          if (!productId && requestedRedirect === 'products') {
            try { localStorage.setItem('post_auth_redirect', '/?page=products'); } catch {}
            navigate('/auth', { replace: true });
            return;
          }
          // Keep supporting direct links with a product or store action.
          setAction(productId
            ? { type: 'product_image', product_id: productId, store_id: search.get('store_id') || null }
            : { type: 'expense_upload', store_id: search.get('store_id') || null });
          setLoading(false);
          return;
        }
        const { data, error } = await (supabase.from('mobile_actions' as any) as any).select('*').eq('token', token).maybeSingle();
        if (error || !data) {
          // not found or table missing — fallback to token-less experience
          setAction(productId
            ? { type: 'product_image', product_id: productId, store_id: search.get('store_id') || null }
            : { type: 'expense_upload', store_id: search.get('store_id') || null });
        } else {
          setAction(data);
        }
      } catch (e) {
        setAction({ type: 'expense_upload', store_id: search.get('store_id') || null });
      } finally { if (active) setLoading(false); }
    };
    void load();
    return () => { active = false; };
  }, [token, productId, requestedRedirect, search, navigate]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (!f) return; setFile(f); };

  const submit = async () => {
    if (!action) return;
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        // ask user to login and return here
        try { localStorage.setItem('post_auth_redirect', window.location.pathname + window.location.search); } catch {}
        navigate('/auth'); return;
      }
      const storeId = action.store_id || search.get('store_id');
      if (!storeId) throw new Error('No store specified');
      if (action.type === 'product_image') {
        if (!file) throw new Error('Choose or take a product image first');
        if (!action.product_id) throw new Error('This product image link has expired. Generate a new QR code from Products.');
        const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
        const path = `${storeId}/product-images/${action.product_id}-${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from('pos-files').upload(path, file, {
          upsert: false,
          contentType: file.type || 'image/jpeg',
        });
        if (uploadError) throw uploadError;
        const { data: publicData } = supabase.storage.from('pos-files').getPublicUrl(path);
        if (!publicData.publicUrl) throw new Error('The image uploaded, but no image URL was returned.');
        const { data: updatedProduct, error: updateError } = await supabase
          .from('inventory')
          .update({ product_image: publicData.publicUrl })
          .eq('id', action.product_id)
          .eq('store_id', storeId)
          .select('id, product_image')
          .maybeSingle();
        if (updateError) throw updateError;
        if (!updatedProduct?.product_image) {
          throw new Error('The image uploaded, but the product could not be updated. Check your access and try again.');
        }
        toast({ title: 'Product image saved', description: 'The image is now available on the POS computer.' });
        setLoading(false);
        return;
      }
      let receiptUrl: string | null = null;
      if (file) {
        const ext = file.name.split('.').pop();
        const path = `${storeId}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from('receipts').upload(path, file);
        if (!upErr) receiptUrl = path;
      }
      const payload = {
        store_id: storeId,
        user_id: user.id,
        description: form.description || (action?.payload?.description || 'Expense'),
        category: form.category || (action?.payload?.category || 'Other'),
        amount: Number(form.amount) || 0,
        payment_method: form.paymentMethod || 'Mobile',
        date_of_expense: form.date,
        receipt_url: receiptUrl,
      };
      const { error } = await supabase.from('expenses').insert(payload);
      if (error) throw error;
      // optionally mark action consumed
      if (token) { await (supabase.from('mobile_actions' as any) as any).update({ consumed: true }).eq('token', token); }
      toast({ title: 'Saved', description: 'Expense recorded.' });
      navigate('/tracker');
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || String(e), variant: 'destructive' });
    } finally { setLoading(false); }
  };

  if (loading) return <PageLoader text="Loading mobile action…" className="min-h-screen" />;
  if (!action) return <div className="p-6 text-center">No mobile action found. Ask the POS to generate a QR and try again.</div>;

  if (action.type === 'product_image') return (
    <div className="mx-auto max-w-md space-y-5 p-5">
      <div><h3 className="text-xl font-semibold">Product image</h3><p className="mt-1 text-sm text-muted-foreground">Take a photo or choose an image. It will sync to the POS computer after saving.</p></div>
      <div className="rounded-xl border border-dashed p-5 text-center">
        {file ? <p className="text-sm font-medium">{file.name}</p> : <p className="text-sm text-muted-foreground">No image selected yet</p>}
        <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handleFile} className="mt-4 block w-full text-sm" />
      </div>
      <Button onClick={submit} disabled={loading || !file} className="w-full gap-2">{loading ? <InlineSpinner /> : <><Check className="h-4 w-4" />Save product image</>}</Button>
    </div>
  );

  return (
    <div className="p-4 max-w-md mx-auto">
      <h3 className="text-lg font-semibold mb-2">Upload Expense</h3>
      <p className="text-sm text-muted-foreground mb-3">Open camera to take receipt photo and save to Tracker.</p>
      <div className="space-y-2">
        <div>
          <Label>Description</Label>
          <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="e.g., Fuel" />
        </div>
        <div>
          <Label>Amount</Label>
          <Input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
        </div>
        <div>
          <Label>Date</Label>
          <Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
        </div>
        <div>
          <Label>Receipt Photo</Label>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handleFile} className="block w-full" />
          <div className="mt-2 flex gap-2">
            <Button onClick={() => fileRef.current?.click()} className="gap-2"><Camera className="h-4 w-4" />Open Camera</Button>
            <Button onClick={submit} disabled={loading} className="gap-2">{loading ? <InlineSpinner /> : <><Upload className="h-4 w-4" />Save</>}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
