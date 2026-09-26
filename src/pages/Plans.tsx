import { useState, useEffect } from "react";
import { getCurrencySymbol } from "@/lib/currency";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, Phone, User, ShieldCheck, Clock, LogOut, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useSubscription } from "@/providers/SubscriptionProvider";

const Plans = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [transactionId, setTransactionId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [user, setUser] = useState<import("@supabase/supabase-js").User | null>(null);
  const { subscription, refreshSubscription } = useSubscription();

  useEffect(() => {
    if (subscription?.status === 'active') {
      navigate("/", { replace: true });
    }
  }, [subscription, navigate]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      if (user) {
        // Check if user already has a pending transaction
        checkPendingStatus(user.id);
      }
    });
  }, []);

  const checkPendingStatus = async (userId: string) => {
    const { data } = await supabase
      .from('user_subscriptions')
      .select('id, status')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .maybeSingle();
    if (data) {
      setIsPending(true);
    }
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
      navigate("/auth", { replace: true });
    }
  };

  const handleSelectPlan = async (planName: string) => {
    if (planName === "Basic" && user) {
      // Create a 7-day free trial subscription
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days trial
      
      const { error } = await supabase.from('user_subscriptions').insert({
        user_id: user.id,
        status: 'active',
        expires_at: expiresAt.toISOString(),
        amount_paid: 0,
        payment_reference: 'free_trial_7days',
      });

      if (error) {
        toast({ variant: "destructive", title: "Error", description: "Could not activate plan. Please try again." });
        return;
      }

      toast({
        title: "7-Day Free Trial Activated!",
        description: "You now have 7 days of premium access. Upgrade to a paid plan before the trial ends.",
      });
      
      // Refresh subscription to ensure it's available before navigating
      await refreshSubscription();
      navigate("/", { replace: true });
    } else {
      setSelectedPlan(planName);
    }
  };

  const handleSubmitTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transactionId.trim()) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please enter your Transaction ID.",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      if (user) {
        // Create a pending subscription record server-side
        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + 1); // Default 1 month, admin adjusts
        
        const { error } = await supabase.from('user_subscriptions').insert({
          user_id: user.id,
          status: 'pending',
          expires_at: expiresAt.toISOString(),
          amount_paid: 0,
          payment_reference: transactionId.trim(),
        });

        if (error) {
          toast({ variant: "destructive", title: "Error", description: "Could not submit payment. Please try again." });
          return;
        }
        
        setIsPending(true);
        toast({
          title: "Payment Submitted",
          description: "Your transaction ID has been sent for verification. Please wait for admin review.",
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Submission failed",
        description: "There was an error submitting your transaction. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

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

  if (isPending) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full space-y-4">
          <Card className="text-center shadow-md">
            <CardHeader>
              <div className="mx-auto bg-warning/10 w-16 h-16 rounded-full flex items-center justify-center mb-4">
                <Clock className="h-8 w-8 text-warning" />
              </div>
              <CardTitle className="text-2xl">Verification Pending</CardTitle>
              <CardDescription>
                We've received your transaction details.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                Your payment is currently being reviewed by our admin team. This usually takes between 1 to 24 hours.
              </p>
              <div className="bg-muted p-4 rounded-lg text-left text-sm space-y-2">
                <p><strong>Status:</strong> Awaiting Verification</p>
                <p><strong>Admin:</strong> MATOVU BRIGHT</p>
              </div>
              <div className="bg-green-50/50 border border-green-200/50 dark:bg-green-950/20 dark:border-green-800/50 p-4 rounded-lg text-left text-sm">
                <p className="font-medium text-green-700 dark:text-green-300">✅ Auto-Activation</p>
                <p className="text-green-600 dark:text-green-400 text-xs mt-1">
                  Your account will be automatically activated with full access as soon as the admin approves your payment. You'll receive a notification.
                </p>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-2">
              <Button variant="outline" className="w-full" onClick={() => checkPendingStatus(user?.id || '')}>
                ↻ Check Status
              </Button>
            </CardFooter>
          </Card>
          
          <div className="flex flex-col gap-2">
            <Button variant="ghost" className="w-full text-muted-foreground" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              Login in another account
            </Button>
            <Button variant="link" className="w-full text-muted-foreground/60 text-xs" onClick={() => navigate("/auth")}>
              <ArrowLeft className="h-3 w-3 mr-1" />
              Back to login
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (selectedPlan) {
    return (
      <div className="min-h-screen bg-background py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md mx-auto">
          <Button variant="ghost" className="mb-6" onClick={() => setSelectedPlan(null)}>
            ← Back to Plans
          </Button>
          <Card className="border-primary shadow-lg">
            <CardHeader className="text-center bg-sidebar-dark text-sidebar-dark-foreground rounded-t-lg">
              <CardTitle className="text-2xl">Complete Payment</CardTitle>
              <CardDescription className="text-sidebar-dark-foreground/70">
                Plan: {selectedPlan} ({plans.find(p => p.name === selectedPlan)?.price})
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div className="space-y-4">
                <div className="flex items-center p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <Phone className="h-5 w-5 text-destructive mr-3" />
                  <div>
                    <p className="text-xs text-destructive font-semibold uppercase">Airtel Money</p>
                    <p className="font-bold text-lg">0756162969</p>
                  </div>
                </div>
                
                <div className="flex items-center p-3 bg-warning/10 border border-warning/20 rounded-lg">
                  <Phone className="h-5 w-5 text-warning mr-3" />
                  <div>
                    <p className="text-xs text-warning font-semibold uppercase">MTN Mobile Money</p>
                    <p className="font-bold text-lg">0775011029</p>
                  </div>
                </div>

                <div className="flex items-center p-3 bg-muted border border-border rounded-lg">
                  <User className="h-5 w-5 text-muted-foreground mr-3" />
                  <div>
                    <p className="text-xs text-muted-foreground font-semibold uppercase">Account Name</p>
                    <p className="font-bold">MATOVU BRIGHT</p>
                  </div>
                </div>
              </div>

              <form onSubmit={handleSubmitTransaction} className="space-y-4 pt-4 border-t">
                <div className="space-y-2">
                  <Label htmlFor="txid">Transaction ID</Label>
                  <Input 
                    id="txid" 
                    placeholder="Enter the ID from your SMS" 
                    value={transactionId}
                    onChange={(e) => setTransactionId(e.target.value)}
                    required
                  />
                  <p className="text-[10px] text-muted-foreground italic flex items-center">
                    <ShieldCheck className="h-3 w-3 mr-1" />
                    Payments are manually verified by our team.
                  </p>
                </div>
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? "Submitting..." : "Submit for Verification"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-end mb-4">
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" />
            Login in another account
          </Button>
        </div>
        
        <div className="text-center mb-12">
          <h1 className="text-4xl font-extrabold text-foreground sm:text-5xl sm:tracking-tight lg:text-6xl">
            Choose Your Plan
          </h1>
          <p className="mt-5 text-xl text-muted-foreground">
            Select the best plan for your business needs to get started.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {plans.map((plan) => (
            <Card key={plan.name} className={`relative flex flex-col ${plan.popular ? 'border-primary shadow-lg scale-105 z-10' : 'border-border'}`}>
              {plan.popular && (
                <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 bg-primary text-primary-foreground px-3 py-1 rounded-full text-sm font-semibold">
                  Most Popular
                </div>
              )}
              <CardHeader>
                <CardTitle className="text-2xl">{plan.name}</CardTitle>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex-grow">
                <div className="mb-6">
                  <span className="text-3xl font-bold">{plan.price}</span>
                  {plan.name !== "Basic" && <span className="text-muted-foreground">/month</span>}
                </div>
                <ul className="space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start">
                      <Check className="h-5 w-5 text-success mr-2 flex-shrink-0" />
                      <span className="text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Button 
                  className="w-full" 
                  variant={plan.popular ? "default" : "outline"}
                  onClick={() => handleSelectPlan(plan.name)}
                >
                  {plan.name === "Basic" ? "Get Started (Free)" : `Choose ${plan.name}`}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
        
        <div className="mt-12 text-center">
          <Button variant="link" className="text-muted-foreground/60" onClick={() => navigate("/auth")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to login
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Plans;
