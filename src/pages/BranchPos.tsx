import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Index from "./Index";
import { PageLoader } from "@/components/ui/loading-spinner";

type AccessState = "loading" | "allowed" | "denied";

/**
 * A deliberately separate operational entry point for executive users.
 * Root remains the executive workspace; this route is the only way an
 * executive opens a branch POS.
 */
export default function BranchPos() {
  const { storeId } = useParams<{ storeId: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<AccessState>("loading");
  const [branchName, setBranchName] = useState("this branch");

  useEffect(() => {
    let active = true;

    const validateAccess = async () => {
      if (!storeId) {
        if (active) setState("denied");
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) {
        // Keep the requested branch so direct POS links guide staff through
        // their branch-specific login rather than the executive sign-in.
        navigate(`/branch-login?branch=${encodeURIComponent(storeId)}`, { replace: true });
        return;
      }

      const [{ data: branch, error: branchError }, { data: access, error: accessError }] = await Promise.all([
        supabase.from("stores").select("id, store_name, user_id").eq("id", storeId).maybeSingle(),
        supabase.from("store_access").select("role").eq("store_id", storeId).eq("user_id", user.id).maybeSingle(),
      ]);

      if (!active) return;
      if (branchError || accessError || !branch) {
        setState("denied");
        return;
      }

      const isOwner = branch.user_id === user.id;
      const hasAssignedBranchAccess = Boolean(access);
      if (!isOwner && !hasAssignedBranchAccess) {
        setState("denied");
        return;
      }

      setBranchName(branch.store_name);
      setState("allowed");
    };

    void validateAccess();
    return () => { active = false; };
  }, [navigate, storeId]);

  if (state === "allowed" && storeId) {
    return <Index posStoreId={storeId} branchName={branchName} />;
  }

  if (state === "loading") {
    return <PageLoader text="Checking branch access…" className="min-h-screen" />;
  }

  return <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6"><Card className="w-full max-w-lg border-amber-200 shadow-sm"><CardHeader><div className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-amber-50 text-amber-700"><ShieldAlert className="h-5 w-5" /></div><CardTitle>Branch POS access unavailable</CardTitle><CardDescription>This account is not assigned to this branch.</CardDescription></CardHeader><CardContent><Button onClick={() => navigate(`/branch-login${storeId ? `?branch=${encodeURIComponent(storeId)}` : ""}`)} className="w-full"><ArrowLeft className="mr-2 h-4 w-4" />Back to branch sign in</Button></CardContent></Card></div>;
}
