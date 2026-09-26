import { useState, useEffect } from "react";
import { getCurrencySymbol } from "@/lib/currency";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, Clock, Phone, User, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

const MembershipPlans = () => {
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [transactionId, setTransactionId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [activePlan, setActivePlan] = useState<string | null>(null);

  const plans = [
    {
      name: "Basic",
      price: "Free",
      description: "Perfect for getting started with your small shop.",
      features: ["Up to 50 products", "Basic reporting", "1 store location", "Email support"],
    },
    {
      name: "Pro",
      price: `${getCurrencySymbol()} 100,000`,
      description: "Everything you need to grow your business.",
      features: ["Unlimited products", "Advanced analytics", "Up to 3 store locations", "Priority support"],
      popular: true,
    },
    {
      name: "Enterprise",
      price: `${getCurrencySymbol()} 350,000`,
      description: "Advanced features for large scale operations.",
      features: ["Unlimited everything", "Custom reporting", "Unlimited locations", "Dedicated account manager"],
    },
  ];

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      setUser(user);
      if (user) {
        // First try fetching real-time status from DB
        try {
          const { data: subs, error } = await supabase
            .from("user_subscriptions")
            .select(`*, subscription_plans (name)`)
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(1);

          if (!error && subs && subs.length > 0) {
            const sub = subs[0];
            const planName = (sub.subscription_plans as any)?.name || null;
            
            if (sub.status === 'active') {
              setActivePlan(planName);
              setIsPending(false);
              // Clear stale local flags
              localStorage.removeItem(`payment_pending_${user.id}`);
              if (planName) localStorage.setItem("selected_plan_name", planName);
            } else if (sub.status === 'pending') {
              setIsPending(true);
              setActivePlan(null);
            } else {
              setIsPending(false);
            }
            return;
          }
        } catch (e) {
          console.error("Error loading subscription:", e);
        }

        // Fallback to localStorage if DB check fails or no records found
        const pending = localStorage.getItem(`payment_pending_${user.id}`);
        if (pending === "true") {
          setIsPending(true);
        }
        const currentPlan = localStorage.getItem("selected_plan_name");
        setActivePlan(currentPlan);
      }
    });
  }, []);

  const handleSelectPlan = (planName: string) => {
    if (planName === "Basic") {
      localStorage.setItem("plan_selected", "true");
      localStorage.setItem("selected_plan_name", "Basic");
      setActivePlan("Basic");
      toast.success("Basic Plan Activated");
    } else {
      setSelectedPlan(planName);
    }
  };

  const handleSubmitTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transactionId.trim()) {
      toast.error("Please enter your Transaction ID.");
      return;
    }

    setIsSubmitting(true);

    try {
      if (user) {
        localStorage.setItem(`payment_pending_${user.id}`, "true");
        localStorage.setItem(`pending_plan_${user.id}`, selectedPlan || "");
        localStorage.setItem(`pending_txid_${user.id}`, transactionId);
        
        setIsPending(true);
        setSelectedPlan(null);
        toast.success("Payment submitted for verification.");
      }
    } catch (error) {
      toast.error("Submission failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isPending) {
    return (
      <Card className="bg-warning/5">
        <CardHeader className="text-center">
          <div className="mx-auto bg-warning/10 w-12 h-12 rounded-full flex items-center justify-center mb-2">
            <Clock className="h-6 w-6 text-warning" />
          </div>
          <CardTitle>Verification Pending</CardTitle>
          <CardDescription>
            Your payment is currently being reviewed by our admin team.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-card p-4 rounded-lg text-sm space-y-2">
            <p><strong>Status:</strong> Awaiting Verification</p>
            <p><strong>Admin:</strong> MATOVU BRIGHT</p>
            <p className="text-xs text-muted-foreground italic">This usually takes between 1 to 24 hours.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (selectedPlan) {
    const plan = plans.find(p => p.name === selectedPlan);
    return (
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Complete Payment</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setSelectedPlan(null)}>Cancel</Button>
          </div>
          <CardDescription>
            Plan: {selectedPlan} ({plan?.price})
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-3 bg-destructive/10 rounded-lg">
              <p className="text-[10px] text-destructive font-bold uppercase">Airtel Money</p>
              <p className="font-bold">0756162969</p>
            </div>
            <div className="p-3 bg-warning/10 rounded-lg">
              <p className="text-[10px] text-warning font-bold uppercase">MTN Money</p>
              <p className="font-bold">0775011029</p>
            </div>
            <div className="md:col-span-2 p-3 bg-muted rounded-lg flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-[10px] text-muted-foreground font-bold uppercase">Account Name</p>
                <p className="font-bold">MATOVU BRIGHT</p>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmitTransaction} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="txid">Transaction ID</Label>
              <Input 
                id="txid" 
                placeholder="Enter ID from SMS" 
                value={transactionId}
                onChange={(e) => setTransactionId(e.target.value)}
                required
              />
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <ShieldCheck className="h-3 w-3" />
                Payments are manually verified.
              </p>
            </div>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Submitting..." : "Submit Verification"}
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {activePlan && (
        <Card className="bg-primary/5 border-primary">
          <CardContent className="pt-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="default">Active Plan: {activePlan}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">Manage your subscription below</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((plan) => (
          <Card key={plan.name} className={`relative ${plan.popular ? 'border-primary shadow-sm' : ''}`}>
            {plan.popular && (
              <Badge className="absolute -top-2 right-2 bg-primary">Popular</Badge>
            )}
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">{plan.name}</CardTitle>
              <CardDescription className="text-xs">{plan.description}</CardDescription>
            </CardHeader>
            <CardContent className="pb-2">
              <div className="mb-4">
                <span className="text-2xl font-bold">{plan.price}</span>
                {plan.name !== "Basic" && <span className="text-muted-foreground text-xs">/mo</span>}
              </div>
              <ul className="space-y-1">
                {plan.features.slice(0, 3).map((feature) => (
                  <li key={feature} className="flex items-start text-xs">
                    <Check className="h-3 w-3 text-success mr-1 mt-0.5" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Button 
                size="sm"
                className="w-full" 
                variant={activePlan === plan.name ? "secondary" : plan.popular ? "default" : "outline"}
                disabled={activePlan === plan.name}
                onClick={() => handleSelectPlan(plan.name)}
              >
                {activePlan === plan.name ? "Current Plan" : plan.name === "Basic" ? "Switch to Free" : `Choose ${plan.name}`}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default MembershipPlans;
