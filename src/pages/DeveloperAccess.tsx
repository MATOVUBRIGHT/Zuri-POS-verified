import { FormEvent, useState } from "react";
import { Navigate } from "react-router-dom";
import { ArrowRight, KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import MasterDeveloper from "./MasterDeveloper";
import { DeveloperBroadcastComposer } from "@/components/DeveloperBroadcastComposer";

// The UX gate is intentionally represented by a digest, never by a plaintext credential.
const ACCESS_CODE_DIGEST = "17756315ebd47b7110359fc7b168179bf6f2df3646fcc888bc8aa05c78b38ac1";

async function digest(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export default function DeveloperAccess() {
  const [stage, setStage] = useState<"code" | "login">("code");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  const checkCode = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    if ((await digest(code)) !== ACCESS_CODE_DIGEST) {
      setError("The security code is not valid.");
      setBusy(false);
      return;
    }
    setStage("login");
    setBusy(false);
  };

  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (signInError) setError(signInError.message);
    else { if (signInData.user?.id) void (supabase.from("profiles") as any).update({ last_login: new Date().toISOString() }).eq("user_id", signInData.user.id); setAuthenticated(true); }
    setBusy(false);
  };

  if (authenticated) return <><MasterDeveloper /><div className="fixed bottom-4 right-4 z-50 w-[min(92vw,24rem)]"><DeveloperBroadcastComposer /></div></>;

  return <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-8"><Card className="w-full max-w-md border-slate-800 bg-white shadow-2xl"><CardHeader className="space-y-3"><div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700"><ShieldCheck className="h-6 w-6" /></div><CardTitle className="text-2xl">Developer access</CardTitle><CardDescription>{stage === "code" ? "Enter the private security code to continue." : "Sign in with the authorized Supabase developer account."}</CardDescription></CardHeader><CardContent>{stage === "code" ? <form className="space-y-4" onSubmit={(event) => void checkCode(event)}><div className="space-y-2"><Label htmlFor="developer-code">Security code</Label><div className="relative"><KeyRound className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input id="developer-code" type="password" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} className="pl-9" required /></div></div><Button className="w-full" disabled={busy}>{busy ? "Checking..." : <>Continue <ArrowRight className="ml-2 h-4 w-4" /></>}</Button></form> : <form className="space-y-4" onSubmit={(event) => void signIn(event)}><div className="space-y-2"><Label htmlFor="developer-email">Email</Label><Input id="developer-email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></div><div className="space-y-2"><Label htmlFor="developer-password">Password</Label><div className="relative"><LockKeyhole className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input id="developer-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="pl-9" required /></div></div><Button className="w-full" disabled={busy}>{busy ? "Signing in..." : "Open developer portal"}</Button></form>}{error && <p className="mt-4 text-sm text-destructive" role="alert">{error}</p>}</CardContent></Card></main>;
}
