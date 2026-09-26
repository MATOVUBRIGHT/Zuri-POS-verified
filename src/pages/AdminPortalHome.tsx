import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CreditCard, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";

const AdminPortalHome = () => {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin Portal</h1>
        <p className="text-muted-foreground">Payments, subscriptions, and user moderation.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              Payments
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">Verify payments, activate subscriptions, and update payment references.</p>
            <Button onClick={() => navigate("/admin-portal/payments")}>Open Payments</Button>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Moderation
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">Approve, suspend, or reject user accounts and review activity.</p>
            <Button variant="outline" onClick={() => navigate("/admin-portal/moderation")}>Open Moderation</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminPortalHome;

