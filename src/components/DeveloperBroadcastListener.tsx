import { useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export function DeveloperBroadcastListener() {
  useEffect(() => {
    const channel = supabase.channel("developer-broadcasts").on("broadcast", { event: "information" }, ({ payload }) => {
      toast(payload?.title || "Information", { description: payload?.message || "", duration: 10000 });
    }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, []);
  return null;
}
