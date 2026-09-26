import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Building2, Eye, EyeOff, KeyRound, Loader2, Lock, UserRound, Briefcase } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Branch = { id: string; store_name: string };

/** Loose UUID v4 shape check. */
const looksLikeUuid = (s: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.trim());

export default function BranchLogin() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const linkedBranchId = params.get("branch")?.trim() || "";

  const [businessId, setBusinessId] = useState("");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [directoryError, setDirectoryError] = useState("");
  const [error, setError] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingDirectory, setLoadingDirectory] = useState(false);

  const loadDirectory = async (idOverride?: string) => {
    const id = (idOverride ?? businessId).trim();
    if (!id && !linkedBranchId) {
      setDirectoryError("Please enter an Executive Business ID or Branch ID to find your branch.");
      return;
    }
    setLoadingDirectory(true);
    setDirectoryError("");
    setBranches([]);
    setBranchId("");

    const { data, error: invokeError } = await supabase.functions.invoke(
      "branch-login-directory",
      { body: { business_id: id } },
    );

    setLoadingDirectory(false);

    if (invokeError || data?.error) {
      return setDirectoryError(
        data?.error || "Branch sign-in is currently unavailable or invalid ID.",
      );
    }

    const items = (data?.branches || []) as Branch[];
    setBranches(items);

    if (items.length === 0) {
      setDirectoryError("No branch found for this ID. Check the ID and try again.");
      return;
    }

    if (linkedBranchId) {
      const linked = items.find((item) => item.id === linkedBranchId);
      setBranchId(linked?.id || "");
      if (!linked)
        setDirectoryError(
          "This branch sign-in link is invalid or the branch is no longer active.",
        );
    } else {
      setBranchId(items[0]?.id || "");
    }
  };

  // Auto-resolve when the input value looks like a branch UUID — saves the
  // extra "Find" click for staff who have been given a direct branch ID.
  useEffect(() => {
    if (looksLikeUuid(businessId)) {
      loadDirectory(businessId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  const branch = branches.find((item) => item.id === branchId);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!branchId) return;
    setError("");
    setLoading(true);

    const { data, error: invokeError } = await supabase.functions.invoke("branch-login", {
      body: { store_id: linkedBranchId || branchId, username, password },
    });

    if (invokeError || data?.error) {
      setError(data?.error || invokeError?.message || "Unable to sign in. Please try again.");
      setLoading(false);
      return;
    }

    const { error: sessionError } = await supabase.auth.setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    });

    if (sessionError) {
      setError("Your sign-in succeeded but the session could not be opened. Please try again.");
      setLoading(false);
      return;
    }

    navigate(`/pos/${data.store_id}`, { replace: true });
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-8">
      <Card className="w-full max-w-md border-slate-200 bg-white shadow-xl shadow-slate-900/5">
        <CardHeader className="space-y-3 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-700 text-white shadow-sm">
            <Building2 className="h-6 w-6" />
          </span>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">
              Zuri POS
            </p>
            <CardTitle className="mt-1 text-2xl text-slate-950">Branch POS sign in</CardTitle>
            <CardDescription className="mt-2">
              {linkedBranchId
                ? "This secure link is locked to its assigned branch."
                : "Enter your Executive Business ID or Branch ID."}
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          <div className="space-y-4">
            {!linkedBranchId && (
              <div className="space-y-2">
                <Label htmlFor="businessId">Executive Business ID or Branch ID</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Briefcase className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <Input
                      id="businessId"
                      className="pl-9"
                      value={businessId}
                      onChange={(e) => setBusinessId(e.target.value)}
                      placeholder="Business ID or paste Branch UUID"
                      onKeyDown={(e) => e.key === "Enter" && loadDirectory()}
                    />
                  </div>
                  {/* Hide the Find button while a UUID is being auto-resolved */}
                  {!looksLikeUuid(businessId) && (
                    <Button
                      type="button"
                      onClick={() => loadDirectory()}
                      disabled={loadingDirectory || !businessId.trim()}
                    >
                      {loadingDirectory ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Find"
                      )}
                    </Button>
                  )}
                  {looksLikeUuid(businessId) && loadingDirectory && (
                    <div className="flex items-center px-2">
                      <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                    </div>
                  )}
                </div>
              </div>
            )}

            {directoryError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                {directoryError}
              </div>
            )}

            {branches.length > 0 && !directoryError && (
              <form onSubmit={submit} className="space-y-4 border-t pt-2">
                <div className="space-y-2">
                  <Label>Assigned branch</Label>
                  {linkedBranchId || looksLikeUuid(businessId) ? (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3">
                      <p className="font-semibold text-emerald-950">
                        Signing in to {branch?.store_name}
                      </p>
                      {linkedBranchId && (
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-emerald-700">
                          <KeyRound className="h-3.5 w-3.5" />
                          This link cannot be changed to another branch.
                        </p>
                      )}
                    </div>
                  ) : (
                    <Select
                      value={branchId}
                      onValueChange={setBranchId}
                      disabled={!branches.length}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select your branch" />
                      </SelectTrigger>
                      <SelectContent>
                        {branches.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.store_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <div className="relative">
                    <UserRound className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <Input
                      id="username"
                      className="pl-9"
                      autoComplete="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Your assigned username"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <Input
                      id="password"
                      className="pl-9 pr-10"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1 h-8 w-8"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {error && (
                  <p
                    role="alert"
                    className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
                  >
                    {error}
                  </p>
                )}

                <Button
                  type="submit"
                  className="w-full bg-emerald-700 hover:bg-emerald-800"
                  disabled={loading || !branchId}
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {loading ? "Signing in…" : "Open branch POS"}
                </Button>
              </form>
            )}
          </div>

          <p className="mt-6 text-center text-sm text-slate-600">
            Executive or owner?{" "}
            <Link to="/auth" className="font-semibold text-emerald-700 hover:text-emerald-800">
              Sign in to Executive
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
