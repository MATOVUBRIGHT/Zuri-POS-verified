import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Store as StoreIcon, Mail, Lock, User, Shield, Eye, EyeOff } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { z } from "zod";
import authBg from "@/assets/auth-bg.jpg";
import { setRememberMePreference } from "@/lib/authStorage";
import { offlineServices } from "@/lib/offlineServices";

// Validation schemas
const loginSchema = z.object({
  email: z.string().trim().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

const signupSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name is too long"),
  email: z.string().trim().email("Please enter a valid email address"),
  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
});

const isElectron = typeof window !== 'undefined' && (window as any).api?.authLogin;

const Auth = () => {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);
  /** After sign-up with an immediate session, show securing step before entering the app */
  const [showSecuringAccount, setShowSecuringAccount] = useState(false);
  const blockPostSignupNavigateRef = useRef(false);
  /** Persist login across app restarts; off = session-only (cleared when browser/Electron session ends) */
  const [rememberMe, setRememberMe] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    let mounted = true;

    // Offline-first: check local session first (Electron)
    if (isElectron) {
      const token = offlineServices.session.get();
      if (token) {
        (window as any).api.authGetSession(token).then(({ user: u }: any) => {
          if (mounted && u) navigate("/");
        }).catch(() => {});
      }
    }

    // Set up auth state listener first
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === 'SIGNED_IN' && session) {
        if (blockPostSignupNavigateRef.current) return;
        navigate("/");
      }
    });

    // Then check for existing session
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (!mounted) return;
      if (error) {
        console.error("Auth session check error:", error);
        if (error.message.includes("refresh_token_not_found") || error.message.includes("Refresh Token Not Found")) {
          supabase.auth.signOut();
        }
        return;
      }
      if (session) {
        navigate("/");
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [navigate]);

  // Auto-enter app a few seconds after sign-up while "securing" screen is shown
  useEffect(() => {
    if (!showSecuringAccount) return;
    const t = window.setTimeout(() => {
      if (!blockPostSignupNavigateRef.current) return;
      blockPostSignupNavigateRef.current = false;
      setShowSecuringAccount(false);
      navigate("/", { replace: true });
    }, 2200);
    return () => clearTimeout(t);
  }, [showSecuringAccount, navigate]);

  const handleOfflineLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      toast({ variant: "destructive", title: "Error", description: "Enter username and password" });
      return;
    }
    setLoading(true);
    try {
      setRememberMePreference(rememberMe);
      const { success, user: u, sessionToken } = await (window as any).api.authLogin(username.trim(), password);
      if (success && u && sessionToken) {
        offlineServices.session.set(sessionToken);
        offlineServices.session.setUser(u);
        const stores = await (window as any).api.getAll('stores');
        const store = stores?.[0];
        if (store) offlineServices.session.setStore(store);
        window.dispatchEvent(new CustomEvent('offline-login-success'));
        toast({ title: "Welcome!", description: "Logged in successfully." });
        navigate("/");
      } else {
        toast({ variant: "destructive", title: "Login failed", description: "Invalid username or password" });
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Login failed", description: err?.message || "Unknown error" });
    }
    setLoading(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationErrors({});
    
    // Validate input
    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      const errors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) {
          errors[err.path[0] as string] = err.message;
        }
      });
      setValidationErrors(errors);
      return;
    }
    
    setLoading(true);
    setRememberMePreference(rememberMe);
    const { error } = await supabase.auth.signInWithPassword({
      email: result.data.email,
      password: result.data.password,
    });

    if (error) {
      toast({
        variant: "destructive",
        title: "Login failed",
        description: error.message,
      });
    } else {
      toast({
        title: "Welcome back!",
        description: "Successfully logged in.",
      });
    }
    setLoading(false);
  };


  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationErrors({});
    
    if (!acceptedTerms) {
      toast({
        variant: "destructive",
        title: "Terms Required",
        description: "Please accept the Terms & Conditions and Privacy Policy to continue.",
      });
      return;
    }

    // Validate input
    const result = signupSchema.safeParse({ name, email, password });
    if (!result.success) {
      const errors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) {
          errors[err.path[0] as string] = err.message;
        }
      });
      setValidationErrors(errors);
      return;
    }

    setLoading(true);
    const redirectUrl = `${window.location.origin}/`;

    const { data, error } = await supabase.auth.signUp({
      email: result.data.email,
      password: result.data.password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          name: result.data.name,
        }
      }
    });

    if (error) {
      toast({
        variant: "destructive",
        title: "Signup failed",
        description: error.message,
      });
    } else if (data.session) {
      blockPostSignupNavigateRef.current = true;
      setShowSecuringAccount(true);
      toast({
        title: "Account created!",
        description: "Almost there — securing your workspace.",
      });
    } else {
      toast({
        title: "Account created!",
        description: "Check your email to confirm, then sign in.",
      });
    }
    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setRememberMePreference(rememberMe);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/`,
      }
    });

    if (error) {
      toast({
        variant: "destructive",
        title: "Google login failed",
        description: error.message,
      });
      setLoading(false);
    }
  };

  const TermsContent = () => (
    <div className="space-y-4 text-sm text-muted-foreground">
      <h3 className="font-semibold text-foreground">Terms and Conditions</h3>
      <p>Last updated: {new Date().toLocaleDateString()}</p>
      
      <h4 className="font-medium text-foreground mt-4">1. Acceptance of Terms</h4>
      <p>By accessing and using brec Inventory Manager, you accept and agree to be bound by the terms and provisions of this agreement.</p>
      
      <h4 className="font-medium text-foreground mt-4">2. Use of Service</h4>
      <p>You agree to use this service only for lawful purposes and in accordance with these Terms. You are responsible for maintaining the confidentiality of your account credentials.</p>
      
      <h4 className="font-medium text-foreground mt-4">3. User Data</h4>
      <p>You retain all rights to your data. We provide tools to export your data at any time. You are responsible for backing up your own data.</p>
      
      <h4 className="font-medium text-foreground mt-4">4. Service Availability</h4>
      <p>We strive to maintain high availability but do not guarantee uninterrupted service. We may modify or discontinue features with reasonable notice.</p>
      
      <h4 className="font-medium text-foreground mt-4">5. Limitation of Liability</h4>
      <p>We are not liable for any indirect, incidental, or consequential damages arising from the use of our service.</p>
      
      <h4 className="font-medium text-foreground mt-4">6. Changes to Terms</h4>
      <p>We reserve the right to modify these terms at any time. Continued use of the service constitutes acceptance of modified terms.</p>
    </div>
  );

  const PrivacyContent = () => (
    <div className="space-y-4 text-sm text-muted-foreground">
      <h3 className="font-semibold text-foreground">Privacy Policy</h3>
      <p>Last updated: {new Date().toLocaleDateString()}</p>
      
      <div className="p-3 bg-primary/10 rounded-lg border border-primary/20">
        <div className="flex items-center gap-2 text-primary font-medium">
          <Shield className="h-4 w-4" />
          <span>We Do Not Collect Your Personal Data</span>
        </div>
        <p className="mt-2 text-foreground">Your inventory, sales, and business data stays with you. We do not sell, share, or analyze your business information for any purpose.</p>
      </div>
      
      <h4 className="font-medium text-foreground mt-4">1. Information We Store</h4>
      <p>We only store information necessary to provide the service:</p>
      <ul className="list-disc list-inside ml-2 space-y-1">
        <li>Email address (for authentication)</li>
        <li>Your business data (inventory, sales, expenses) - stored securely and only accessible by you</li>
        <li>Theme preferences</li>
      </ul>
      
      <h4 className="font-medium text-foreground mt-4">2. Data Security</h4>
      <p>Your data is encrypted in transit and at rest. We use industry-standard security practices to protect your information.</p>
      
      <h4 className="font-medium text-foreground mt-4">3. Data Access</h4>
      <p>Only you can access your business data. We do not access, read, or analyze your inventory, sales, or financial information.</p>
      
      <h4 className="font-medium text-foreground mt-4">4. Data Deletion</h4>
      <p>You can delete your account and all associated data at any time through the Settings page.</p>
      
      <h4 className="font-medium text-foreground mt-4">5. Third-Party Services</h4>
      <p>We use secure authentication services. No third parties have access to your business data.</p>
      
      <h4 className="font-medium text-foreground mt-4">6. Contact</h4>
      <p>For privacy concerns, please contact us through the app.</p>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-end p-4 md:p-12 relative overflow-hidden">
      {showSecuringAccount && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/85 backdrop-blur-md p-4">
          <Card className="w-full max-w-md shadow-xl border-primary/20">
            <CardHeader className="text-center space-y-2">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/15 flex items-center justify-center">
                <Shield className="w-7 h-7 text-primary" />
              </div>
              <CardTitle className="text-xl">Securing your POS account</CardTitle>
              <CardDescription>
                Encrypting your session and preparing your store. This only takes a moment — you can proceed as soon as you&apos;re ready.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div className="h-full w-2/3 rounded-full bg-primary animate-pulse" />
              </div>
              <Button
                className="w-full"
                onClick={() => {
                  blockPostSignupNavigateRef.current = false;
                  setShowSecuringAccount(false);
                  navigate("/", { replace: true });
                }}
              >
                Proceed to app
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                If you don&apos;t tap anything, we&apos;ll open the app automatically in a couple of seconds.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
      {/* Background Image - using img for faster loading with fetchpriority */}
      <img
        src={authBg}
        alt=""
        decoding="async"
        className="absolute inset-0 w-full h-full object-cover"
      />

      <Card className="w-full max-w-md shadow-xl border-border/20 bg-background/40 backdrop-blur-md relative z-10">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg">
            <StoreIcon className="w-8 h-8 text-primary-foreground" />
          </div>
          <CardTitle className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            brec
          </CardTitle>
          <CardDescription>
            Stock and Inventory Management
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login" className="space-y-6">
            <TabsList className={`grid w-full bg-muted/50 ${isElectron ? 'grid-cols-3' : 'grid-cols-2'}`}>
              <TabsTrigger value="login" className="data-[state=active]:bg-accent data-[state=active]:text-accent-foreground">Login</TabsTrigger>
              {isElectron && <TabsTrigger value="offline" className="data-[state=active]:bg-accent data-[state=active]:text-accent-foreground">Offline</TabsTrigger>}
              <TabsTrigger value="signup" className="data-[state=active]:bg-accent data-[state=active]:text-accent-foreground">Sign Up</TabsTrigger>
            </TabsList>

            {isElectron && (
              <TabsContent value="offline" className="space-y-4">
                <form onSubmit={handleOfflineLogin} className="space-y-4">
                  <p className="text-sm text-muted-foreground">Sign in with local account (no internet required). Default: admin / admin123</p>
                  <div className="space-y-2">
                    <Label htmlFor="offline-username">Username</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input id="offline-username" type="text" placeholder="admin" value={username} onChange={(e) => setUsername(e.target.value)} className="pl-10" required />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="offline-password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input id="offline-password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-10" required />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                    <Checkbox checked={rememberMe} onCheckedChange={(c) => setRememberMe(c === true)} />
                    Remember me on this device
                  </label>
                  <Button type="submit" className="w-full" disabled={loading}>{loading ? "Signing in..." : "Sign in"}</Button>
                </form>
              </TabsContent>
            )}

            <TabsContent value="login" className="space-y-4">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className={`pl-10 ${validationErrors.email ? 'border-destructive' : ''}`}
                    />
                  </div>
                  {validationErrors.email && (
                    <p className="text-xs text-destructive">{validationErrors.email}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="login-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className={`pl-10 pr-10 ${validationErrors.password ? 'border-destructive' : ''}`}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1 h-8 w-8"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  {validationErrors.password && (
                    <p className="text-xs text-destructive">{validationErrors.password}</p>
                  )}
                </div>
                <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                  <Checkbox checked={rememberMe} onCheckedChange={(c) => setRememberMe(c === true)} />
                  Remember me on this device
                </label>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading}
                >
                  {loading ? "Logging in..." : "Login"}
                </Button>
              </form>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">
                    Or continue with
                  </span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleGoogleLogin}
                disabled={loading}
              >
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                Continue with Google
              </Button>
            </TabsContent>

            <TabsContent value="signup" className="space-y-4">
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-name">Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="signup-name"
                      type="text"
                      placeholder="Enter your name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      className={`pl-10 ${validationErrors.name ? 'border-destructive' : ''}`}
                    />
                  </div>
                  {validationErrors.name && (
                    <p className="text-xs text-destructive">{validationErrors.name}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className={`pl-10 ${validationErrors.email ? 'border-destructive' : ''}`}
                    />
                  </div>
                  {validationErrors.email && (
                    <p className="text-xs text-destructive">{validationErrors.email}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="signup-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Create a password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className={`pl-10 pr-10 ${validationErrors.password ? 'border-destructive' : ''}`}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1 h-8 w-8"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  {validationErrors.password && (
                    <p className="text-xs text-destructive">{validationErrors.password}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Password must be at least 8 characters with uppercase, lowercase, and number
                  </p>
                </div>

                {/* Terms and Privacy Checkbox */}
                <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg">
                  <Checkbox
                    id="terms"
                    checked={acceptedTerms}
                    onCheckedChange={(checked) => setAcceptedTerms(checked === true)}
                    className="mt-0.5"
                  />
                  <div className="text-sm">
                    <label htmlFor="terms" className="cursor-pointer">
                      I agree to the{" "}
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="link" className="h-auto p-0 text-primary font-normal">Terms & Conditions</Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-lg max-h-[80vh]">
                          <DialogHeader>
                            <DialogTitle>Terms & Conditions</DialogTitle>
                          </DialogHeader>
                          <ScrollArea className="h-[60vh] pr-4">
                            <TermsContent />
                          </ScrollArea>
                        </DialogContent>
                      </Dialog>
                      {" "}and{" "}
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="link" className="h-auto p-0 text-primary font-normal">Privacy Policy</Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-lg max-h-[80vh]">
                          <DialogHeader>
                            <DialogTitle>Privacy Policy</DialogTitle>
                          </DialogHeader>
                          <ScrollArea className="h-[60vh] pr-4">
                            <PrivacyContent />
                          </ScrollArea>
                        </DialogContent>
                      </Dialog>
                    </label>
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <Shield className="h-3 w-3" />
                      We do not collect or sell your personal data
                    </p>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading}
                >
                  {loading ? "Creating account..." : "Create Account"}
                </Button>
              </form>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">
                    Or continue with
                  </span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleGoogleLogin}
                disabled={loading}
              >
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                Sign up with Google
              </Button>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
