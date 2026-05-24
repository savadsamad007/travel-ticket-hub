import { createFileRoute, Link, useNavigate, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { Plane } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
});

function SignupPage() {
  const nav = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [fullName, setFullName] = useState("");
  const [agencyName, setAgencyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  if (!authLoading && user) return <Navigate to="/dashboard" />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
          data: { full_name: fullName, agency_name: agencyName },
        },
      });
      if (error) throw error;

      // If the trigger created the agency row, name it now.
      if (data.session && agencyName.trim()) {
        await supabase
          .from("agency_profile")
          .upsert(
            { agency_owner: data.user!.id, agency_name: agencyName.trim() },
            { onConflict: "agency_owner" },
          );
      }

      if (!data.session) {
        toast.success("Check your email to confirm, then sign in.");
        nav({ to: "/login" });
      } else {
        toast.success("Account created!");
        nav({ to: "/dashboard" });
      }
    } catch (e: any) {
      toast.error(e.message || "Sign up failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-brand">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, white 1px, transparent 1px), radial-gradient(circle at 80% 60%, white 1px, transparent 1px)",
            backgroundSize: "60px 60px, 90px 90px",
          }}
        />
        <div className="relative z-10 flex flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
              <Plane className="h-7 w-7" />
            </div>
            <span className="text-2xl font-bold tracking-tight">Skybird</span>
          </div>
          <div>
            <h1 className="text-5xl font-extrabold leading-tight">
              Create your<br />agency account.
            </h1>
            <p className="mt-4 text-lg text-white/85 max-w-md">
              You'll be the admin. Add salesmen and set their permissions from the Staff page.
            </p>
          </div>
          <div className="text-sm text-white/70">© Skybird Billing · SAR</div>
        </div>
      </div>

      <div className="flex w-full lg:w-1/2 items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8 flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-brand text-white">
              <Plane className="h-5 w-5" />
            </div>
            <span className="text-xl font-bold">Skybird</span>
          </div>
          <h2 className="text-3xl font-bold">Create account</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            One owner per agency. Already have one? <Link to="/login" className="text-primary font-medium hover:underline">Sign in</Link>.
          </p>
          <form onSubmit={submit} className="mt-8 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Your name</Label>
              <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} required maxLength={100} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agencyName">Agency name</Label>
              <Input id="agencyName" value={agencyName} onChange={(e) => setAgencyName(e.target.value)} required maxLength={120} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={255} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} maxLength={72} />
            </div>
            <Button type="submit" disabled={loading} className="w-full bg-gradient-brand hover:opacity-90 text-white shadow-glow">
              {loading ? "Creating…" : "Create account"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
