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
  const token = search.get("token") || search.get("action") || "";
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
          // fallback: allow direct links with only store_id (no token/table present)
          setAction({ type: 'expense_upload', store_id: search.get('store_id') || null });
          setLoading(false);
          return;
        }
        const { data, error } = await (supabase.from('mobile_actions' as any) as any).select('*').eq('token', token).maybeSingle();
        if (error || !data) {
          // not found or table missing — fallback to token-less experience
          setAction({ type: 'expense_upload', store_id: search.get('store_id') || null });
        } else {
          setAction(data);
        }
      } catch (e) {
        setAction({ type: 'expense_upload', store_id: search.get('store_id') || null });
      } finally { if (active) setLoading(false); }
    };
    void load();
    return () => { active = false; };
  }, [token, search]);

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
