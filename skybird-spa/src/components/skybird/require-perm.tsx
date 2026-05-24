import { Navigate } from "@tanstack/react-router";
import { useAuth, type PermKey } from "@/lib/auth";
import type { ReactNode } from "react";

export function RequirePerm({ perm, children }: { perm: PermKey; children: ReactNode }) {
  const { loading, can, role } = useAuth();
  if (loading) return null;
  if (role === "admin" || role === "super_admin") return <>{children}</>;
  if (!can(perm)) return <Navigate to="/dashboard" />;
  return <>{children}</>;
}
