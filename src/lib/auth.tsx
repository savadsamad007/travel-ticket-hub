import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type AppRole = "admin" | "salesman";
export type PermKey =
  | "tickets" | "refunds" | "payments" | "customers"
  | "suppliers" | "sub_agents" | "cash_book" | "reports" | "statements";

export type Permissions = Partial<Record<PermKey, boolean>>;

type AuthCtx = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  role: AppRole | null;
  permissions: Permissions;
  can: (k: PermKey) => boolean;
  agencyOwner: string | null;
  agencyName: string;
  agencyProfile: any | null;
  refreshAgency: () => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({
  user: null, session: null, loading: true,
  role: null, permissions: {}, can: () => false,
  agencyOwner: null, agencyName: "Skybird", agencyProfile: null,
  refreshAgency: async () => {}, signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<AppRole | null>(null);
  const [permissions, setPermissions] = useState<Permissions>({});
  const [agencyOwner, setAgencyOwner] = useState<string | null>(null);
  const [agencyName, setAgencyName] = useState("Skybird");
  const [agencyProfile, setAgencyProfile] = useState<any | null>(null);

  async function loadAgency(uid: string) {
    const { data: ua } = await supabase
      .from("user_agency")
      .select("agency_owner, role, permissions")
      .eq("user_id", uid)
      .maybeSingle();
    if (ua) {
      setRole(ua.role as AppRole);
      setAgencyOwner(ua.agency_owner);
      setPermissions((ua.permissions as Permissions) ?? {});
      const { data: ap } = await supabase
        .from("agency_profile").select("*").eq("agency_owner", ua.agency_owner).maybeSingle();
      setAgencyProfile(ap ?? null);
      if (ap?.agency_name) setAgencyName(ap.agency_name);
    } else {
      setRole("admin"); setAgencyOwner(uid); setPermissions({});
    }
  }

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, s) => {
      setSession(s);
      if (s?.user) await loadAgency(s.user.id);
      else { setRole(null); setAgencyOwner(null); setAgencyName("Skybird"); setAgencyProfile(null); setPermissions({}); }
      setLoading(false);
    });
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session?.user) await loadAgency(data.session.user.id);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const can = (k: PermKey) => role === "admin" ? true : !!permissions[k];

  return (
    <Ctx.Provider
      value={{
        user: session?.user ?? null,
        session, loading, role, permissions, can,
        agencyOwner, agencyName, agencyProfile,
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
export const useCan = (k: PermKey) => useContext(Ctx).can(k);
