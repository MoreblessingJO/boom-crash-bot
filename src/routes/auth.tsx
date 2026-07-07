import { createFileRoute, useNavigate, useSearch, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const searchSchema = z.object({
  redirect: z.string().optional(),
  deriv_error: z.string().optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Sign in · NexxTrade" },
      { name: "description", content: "Sign in to NexxTrade to deploy AI agents on your Deriv account." },
      { property: "og:title", content: "Sign in · NexxTrade" },
      { property: "og:description", content: "Autonomous AI trading agents — sign in to connect your Deriv account." },
    ],
  }),
  component: AuthPage,
});

function sanitizeRedirect(r?: string): string {
  if (!r) return "/dashboard";
  if (!r.startsWith("/") || r.startsWith("//")) return "/dashboard";
  return r;
}

function AuthPage() {
  const search = useSearch({ from: "/auth" });
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const redirectTo = sanitizeRedirect(search.redirect);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: redirectTo, replace: true });
    });
  }, [navigate, redirectTo]);

  useEffect(() => {
    if (search.deriv_error) toast.error(`Deriv connection failed: ${search.deriv_error}`);
  }, [search.deriv_error]);

  async function handleGoogle() {
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}/auth`,
      });
      if (result.error) {
        toast.error(result.error.message ?? "Google sign-in failed");
        setBusy(false);
        return;
      }
      if (result.redirected) return; // browser navigates away
      navigate({ to: redirectTo, replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Google sign-in failed");
      setBusy(false);
    }
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return toast.error(error.message);
    navigate({ to: redirectTo, replace: true });
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth`,
        data: { display_name: displayName || email.split("@")[0] },
      },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Account created — you can sign in now.");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Back home</Link>
          <h1 className="font-display mt-4 text-4xl font-black tracking-tight">NexxTrade</h1>
          <p className="mt-2 text-sm text-muted-foreground">Sign in to deploy your AI agent.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Continue</CardTitle>
            <CardDescription>Use email or Google.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={handleGoogle} disabled={busy} variant="outline" className="w-full">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Continue with Google
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">or email</span>
              </div>
            </div>

            <Tabs defaultValue="signin">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Sign up</TabsTrigger>
              </TabsList>
              <TabsContent value="signin" className="space-y-3 pt-4">
                <form onSubmit={handleSignIn} className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="password">Password</Label>
                    <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
                  </div>
                  <Button type="submit" disabled={busy} className="w-full">
                    {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Sign in
                  </Button>
                </form>
              </TabsContent>
              <TabsContent value="signup" className="space-y-3 pt-4">
                <form onSubmit={handleSignUp} className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="name">Display name</Label>
                    <Input id="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="name" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="email2">Email</Label>
                    <Input id="email2" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="password2">Password</Label>
                    <Input id="password2" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete="new-password" />
                  </div>
                  <Button type="submit" disabled={busy} className="w-full">
                    {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Create account
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          By continuing you agree that trading involves risk. NexxTrade is not financial advice.
        </p>
      </div>
    </main>
  );
}
