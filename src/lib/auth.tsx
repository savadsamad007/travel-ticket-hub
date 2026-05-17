import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type AppRole = "admin" | "salesman";

type AuthCtx = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  role: AppRole | null;
  agencyOwner: string | null;
  agencyName: string;
  refreshAgency: () => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({
  user: null, session: null, loading: true,
  role: null, agencyOwner: null, agencyName: "Skybird",
  refreshAgency: async () => {}, signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<AppRole | null>(null);
  const [agencyOwner, setAgencyOwner] = useState<string | null>(null);
  const [agencyName, setAgencyName] = useState("Skybird");

  async function loadAgency(uid: string) {
    const { data: ua } = await supabase
      .from("user_agency")
      .select("agency_owner, role")
      .eq("user_id", uid)
      .maybeSingle();
    if (ua) {
      setRole(ua.role as AppRole);
      setAgencyOwner(ua.agency_owner);
      const { data: ap } = await supabase
        .from("agency_profile")
        .select("agency_name")
        .eq("agency_owner", ua.agency_owner)
        .maybeSingle();
      if (ap?.agency_name) setAgencyName(ap.agency_name);
    } else {
      // Fallback: self as admin (in case trigger didn't fire)
      setRole("admin");
      setAgencyOwner(uid);
    }
  }

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, s) => {
      setSession(s);
      if (s?.user) await loadAgency(s.user.id);
      else { setRole(null); setAgencyOwner(null); setAgencyName("Skybird"); }
      setLoading(false);
    });
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session?.user) await loadAgency(data.session.user.id);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <Ctx.Provider
      value={{
        user: session?.user ?? null,
        session, loading, role, agencyOwner, agencyName,
        refreshAgency: async () => { if (session?.user) await loadAgency(session.user.id); },
        signOut: async () => { await supabase.auth.signOut(); },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
export const useIsAdmin = () => useContext(Ctx).role === "admin";
