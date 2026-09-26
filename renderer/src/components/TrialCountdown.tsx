import { useSubscription } from "@/providers/SubscriptionProvider";
import { useNavigate } from "react-router-dom";
import { AlertCircle, Clock, Zap, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useState } from "react";

export const TrialCountdown = () => {
  const { isTrialActive, daysRemaining, isTrialExpiring, subscription } = useSubscription();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);

  const isExpired = subscription?.status === 'expired' || (daysRemaining !== null && daysRemaining === 0);

  if (isExpired && !dismissed) {
    return (
      <Alert className="bg-destructive/10 border-destructive/30 text-destructive dark:bg-destructive/20 dark:border-destructive/40 dark:text-red-300 mb-4">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle className="flex items-center justify-between">
          <span>Plan Expired</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 hover:bg-destructive/20"
            onClick={() => setDismissed(true)}
          >
            <XCircle className="h-4 w-4" />
          </Button>
        </AlertTitle>
        <AlertDescription className="mt-2">
          <p className="text-sm">
            Your plan has expired. Upgrade now to continue using all features.
          </p>
          <Button
            size="sm"
            className="mt-3 bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            onClick={() => navigate("/plans")}
          >
            <Zap className="h-3 w-3 mr-1" />
            Choose a Plan
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (!isTrialActive || daysRemaining === null) {
    return null;
  }

  if (isTrialExpiring && daysRemaining > 0) {
    return (
      <Alert className="bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/20 dark:border-amber-800 dark:text-amber-300 mb-4">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Free Trial Ending Soon!</AlertTitle>
        <AlertDescription className="mt-2">
          <p className="font-semibold">
            {daysRemaining} day{daysRemaining !== 1 ? "s" : ""} remaining
          </p>
          <p className="text-sm opacity-90 mt-1">
            Upgrade to a paid plan to keep your data and continue using all features.
          </p>
          <Button
            size="sm"
            className="mt-3 bg-amber-600 hover:bg-amber-700 text-white"
            onClick={() => navigate("/plans")}
          >
            <Zap className="h-3 w-3 mr-1" />
            Upgrade Now
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        <div>
          <p className="font-semibold text-blue-900 dark:text-blue-100 text-sm">
            Free Trial: {daysRemaining} day{daysRemaining !== 1 ? "s" : ""} remaining
          </p>
          <p className="text-xs text-blue-700 dark:text-blue-300">
            Upgrade anytime to unlock all features
          </p>
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="border-blue-200 text-blue-600 hover:bg-blue-100 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-900/50"
        onClick={() => navigate("/plans")}
      >
        Upgrade
      </Button>
    </div>
  );
};
