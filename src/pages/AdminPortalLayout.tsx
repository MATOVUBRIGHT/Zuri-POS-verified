import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Shield, CreditCard, Users, LogOut } from "lucide-react";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

const AdminPortalLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [adminId, setAdminId] = useState<string | null>(null);

  useEffect(() => {
    const guard = async () => {
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          navigate("/admin-login", { replace: true, state: { from: location.pathname } });
          return;
        }

        const { data: isAdmin } = await supabase.rpc("has_role", {
          _user_id: session.user.id,
          _role: "admin",
        });

        if (!isAdmin) {
          navigate("/admin-login", { replace: true, state: { from: location.pathname } });
          return;
        }

        setAdminId(session.user.id);
      } finally {
        setLoading(false);
      }
    };
    guard();
  }, [navigate, location.pathname]);

  const navItems = useMemo(() => ([
    { to: "/admin-portal/payments", label: "Payments", icon: CreditCard },
    { to: "/admin-portal/moderation", label: "Moderation", icon: Users },
  ]), []);

  const logout = async () => {
    await supabase.auth.signOut();
    navigate("/admin-login", { replace: true });
  };

  if (loading) {
    return (
      <LoadingSpinner size="lg" text="Loading admin portal..." fullScreen />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <div className="font-semibold">Admin Portal</div>
            {adminId ? (
              <div className="text-xs text-muted-foreground font-mono hidden sm:block">{adminId.slice(0, 8)}...</div>
            ) : null}
          </div>
          <Button variant="outline" size="sm" onClick={logout} className="gap-2">
            <LogOut className="h-4 w-4" />
            Logout
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
        <aside className="lg:sticky lg:top-[72px] h-fit">
          <Card className="p-2">
            <nav className="flex flex-col">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      [
                        "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                        isActive ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                      ].join(" ")
                    }
                    end={false}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </NavLink>
                );
              })}
            </nav>
          </Card>
        </aside>

        <main className="min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminPortalLayout;
