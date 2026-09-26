import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Pending = { id: string; store_id: string | null };

/** Recipient-scoped reminder. RLS limits the query before it reaches this UI. */
export default function ScheduledPaymentPrompt({ onView }: { onView: () => void }) {
  const [item, setItem] = useState<Pending | null>(null);
  const [name, setName] = useState("there");
  const [branchName, setBranchName] = useState("A branch");
  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [{ data: profile }, { data: pending, error }] = await Promise.all([
      supabase.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle(),
      (supabase as any).from("scheduled_payments").select("id, store_id").eq("status", "pending").order("created_at", { ascending: true }).limit(20),
    ]);
    if (error) return; // Optional table may not yet exist during a staged deployment.
    setName(profile?.full_name?.trim() || "there");
    const next = (pending || []).find((payment: Pending) => {
      try { return !sessionStorage.getItem(`zuri_pending_payment_prompt_${payment.id}`); } catch { return true; }
    }) as Pending | undefined;
    if (!next) return setItem(null);
    if (next.store_id) {
      const { data: store } = await supabase.from("stores").select("store_name").eq("id", next.store_id).maybeSingle();
      setBranchName(store?.store_name || "A branch");
    }
    setItem(next);
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const channel = supabase.channel("scheduled-payment-prompts").on("postgres_changes", { event: "*", schema: "public", table: "scheduled_payments" }, () => void load()).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);
  const dismiss = () => { if (item) try { sessionStorage.setItem(`zuri_pending_payment_prompt_${item.id}`, "1"); } catch {} setItem(null); };
  return <Dialog open={Boolean(item)} onOpenChange={(open) => { if (!open) dismiss(); }}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Scheduled payment pending</DialogTitle><DialogDescription>Hi {name}, <strong>{branchName}</strong> has a pending scheduled payment that needs attention.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={dismiss}>Later</Button><Button onClick={() => { dismiss(); onView(); }}>View</Button></DialogFooter></DialogContent></Dialog>;
}
