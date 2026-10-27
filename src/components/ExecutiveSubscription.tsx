import { useEffect, useState } from "react";
import { Building2, CalendarClock, CheckCircle2, CreditCard, RefreshCw, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "@/providers/SubscriptionProvider";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import Plans from "@/pages/Plans";

type Branch = { id: string; store_name: string; created_at: string };

const branchPalette = [
  { card: "border-slate-200 bg-white", icon: "bg-sky-100 text-sky-700", accent: "bg-sky-500", button: "border-sky-300 text-sky-700 hover:bg-sky-50" },
  { card: "border-slate-200 bg-white", icon: "bg-violet-100 text-violet-700", accent: "bg-violet-500", button: "border-violet-300 text-violet-700 hover:bg-violet-50" },
  { card: "border-slate-200 bg-white", icon: "bg-emerald-100 text-emerald-700", accent: "bg-emerald-500", button: "border-emerald-300 text-emerald-700 hover:bg-emerald-50" },
  { card: "border-slate-200 bg-white", icon: "bg-amber-100 text-amber-700", accent: "bg-amber-500", button: "border-amber-300 text-amber-700 hover:bg-amber-50" },
  { card: "border-slate-200 bg-white", icon: "bg-rose-100 text-rose-700", accent: "bg-rose-500", button: "border-rose-300 text-rose-700 hover:bg-rose-50" },
] as const;

const formatDate = (value: string | null | undefined) => {
  if (!value) return "No expiry date";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString() : "No expiry date";
};

export default function ExecutiveSubscription({ userId }: { userId: string | null }) {
  const { toast } = useToast();
  const { subscription, isTrialActive, daysRemaining, refreshSubscription } = useSubscription();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showPlans, setShowPlans] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    void (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("stores")
        .select("id, store_name, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });
      if (!active) return;
      if (error) {
        toast({ variant: "destructive", title: "Could not load branches", description: error.message });
      } else {
        setBranches((data || []) as Branch[]);
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, [toast, userId]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await refreshSubscription();
      toast({ title: "License status refreshed" });
    } finally {
      setRefreshing(false);
    }
  };

  const activeLicense = subscription?.status === "active";
  const licenseLabel = activeLicense ? (isTrialActive ? "Free trial" : "Paid license") : subscription?.status || "No license";
  const licenseTone = activeLicense ? "default" : "outline";
  const remainingText = activeLicense && daysRemaining !== null
    ? daysRemaining <= 60
      ? `${daysRemaining} day${daysRemaining === 1 ? "" : "s"} left`
      : `${Math.ceil(daysRemaining / 30)} month${Math.ceil(daysRemaining / 30) === 1 ? "" : "s"} left`
    : "License inactive";

  if (showPlans) {
    return <Plans embedded onClose={() => setShowPlans(false)} />;
  }

  return (
    <main className="h-full overflow-y-auto bg-background px-4 py-6 pb-20 md:px-8 md:py-8">
      <div className="mx-auto max-w-6xl space-y-6 pb-8">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Executive workspace</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">Subscriptions & branch licenses</h1>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Every branch uses your business license. Renew or upgrade once to keep all eligible branches trading.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void refresh()} disabled={refreshing}>
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button onClick={() => setShowPlans(true)}>
              <CreditCard className="mr-2 h-4 w-4" />
              {activeLicense && !isTrialActive ? "Renew license" : "Choose a plan"}
            </Button>
          </div>
        </header>

        <Card className="border-slate-200 bg-white shadow-none">
          <CardContent className="flex flex-col gap-4 border-l-2 border-primary p-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              {activeLicense ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" /> : <ShieldAlert className="mt-0.5 h-5 w-5 text-amber-600" />}
              <div>
                <p className="font-semibold">Business license: {licenseLabel}</p>
                <p className="text-sm text-muted-foreground">
                  {activeLicense
                    ? `Valid until ${formatDate(subscription?.expires_at)}${isTrialActive && daysRemaining !== null ? ` · ${daysRemaining} day${daysRemaining === 1 ? "" : "s"} remaining` : ""}.`
                    : "A paid plan is required before additional branches can be created or used for sales."}
                </p>
              </div>
            </div>
            <Badge variant={licenseTone}>{subscription?.status || "not configured"}</Badge>
          </CardContent>
        </Card>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Branch licenses</h2>
              <p className="text-sm text-muted-foreground">{branches.length} branch{branches.length === 1 ? "" : "es"} under this business.</p>
            </div>
          </div>
          {loading ? <Card className="min-h-[320px] border-slate-200 bg-white"><CardContent className="flex min-h-[320px] items-center justify-center"><LoadingSpinner size="lg" /></CardContent></Card> : branches.length === 0 ? (
            <Card className="min-h-[320px] border-slate-200 bg-white"><CardContent className="flex min-h-[320px] items-center justify-center p-8 text-center text-sm text-muted-foreground">No branches found.</CardContent></Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {branches.map((branch, index) => {
                const colors = branchPalette[index % branchPalette.length];
                return <Card key={branch.id} className={`relative overflow-hidden ${colors.card}`}>
                  <div className={`absolute inset-y-0 left-0 w-1 ${colors.accent}`} />
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className={`rounded-lg p-2 ${colors.icon}`}><Building2 className="h-5 w-5" /></div>
                        <div className="min-w-0"><CardTitle className="truncate text-base">{branch.store_name}</CardTitle><CardDescription>Branch license</CardDescription></div>
                      </div>
                      <Badge className={`border-0 ${colors.icon}`} variant={licenseTone}>{licenseLabel}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm">
                    <div className="flex items-center justify-between border-t pt-3">
                      <span className="flex items-center gap-2 text-muted-foreground"><CalendarClock className="h-4 w-4" />Expires</span>
                      <span className="font-medium">{formatDate(subscription?.expires_at)}</span>
                    </div>
                    <p className="text-xs font-semibold text-muted-foreground">{remainingText}</p>
                      <Button className={`w-full ${colors.button}`} variant="outline" onClick={() => setShowPlans(true)}>
                      <CreditCard className="mr-2 h-4 w-4" />
                      {activeLicense && !isTrialActive ? "Renew business license" : "Upgrade to enable sales"}
                    </Button>
                  </CardContent>
                </Card>;
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
