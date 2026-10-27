import { useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export function DeveloperBroadcastListener() {
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled || !user) return;
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      const isDeveloper = roles?.some((entry) => ["master_developer", "admin"].includes(String(entry.role))) ?? false;
      channel = supabase.channel("developer-broadcasts")
        .on("broadcast", { event: "information" }, ({ payload }) => {
          toast(payload?.title || "Information", { description: payload?.message || "", duration: 10000 });
        })
        .on("broadcast", { event: "subscription-pending" }, ({ payload }) => {
          if (isDeveloper) toast("Subscription pending verification", { description: `Transaction ID: ${payload?.transactionId || "Not provided"}`, duration: 12000 });
        })
        .on("broadcast", { event: "access-revoked" }, ({ payload }) => {
          if (payload?.userId === user.id) toast.error("Access revoked", { description: payload?.message || "Your business access has been revoked.", duration: 12000 });
        })
        .subscribe();
    })();
    return () => { cancelled = true; if (channel) void supabase.removeChannel(channel); };
  }, []);
  return null;
}
