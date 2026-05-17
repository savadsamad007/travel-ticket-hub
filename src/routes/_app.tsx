import { createFileRoute, Outlet, Navigate, Link, useLocation } from "@tanstack/react-router";
import {
  LayoutDashboard, Ticket, Building2, Users, UserCheck,
  Wallet, RotateCcw, FileBarChart, BookText, LogOut, Plane, Menu,
  Settings, ShieldCheck, Banknote,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { user, loading, signOut, role, agencyName } = useAuth();
  const loc = useLocation();
  const [open, setOpen] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" />;

  const isAdmin = role === "admin";

  const nav = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, admin: false },
    { to: "/tickets", label: "Tickets", icon: Ticket, admin: false },
    { to: "/suppliers", label: "Suppliers", icon: Building2, admin: false },
    { to: "/sub-agents", label: "Sub-agents", icon: UserCheck, admin: false },
    { to: "/customers", label: "Customers", icon: Users, admin: false },
    { to: "/payments", label: "Payments", icon: Wallet, admin: false },
    { to: "/cash-book", label: "Cash in Hand", icon: Banknote, admin: false },
    { to: "/refunds", label: "Refunds", icon: RotateCcw, admin: false },
    { to: "/statements", label: "Statements", icon: BookText, admin: false },
    { to: "/reports", label: "Reports", icon: FileBarChart, admin: false },
    { to: "/staff", label: "Staff", icon: ShieldCheck, admin: true },
    { to: "/settings", label: "Settings", icon: Settings, admin: true },
  ] as const;

  return (
    <div className="flex min-h-screen">
      <aside className={cn(
        "fixed lg:static z-40 inset-y-0 left-0 w-64 bg-sidebar text-sidebar-foreground flex flex-col transform transition-transform",
        open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <div className="flex items-center gap-3 px-6 py-5 border-b border-sidebar-border">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-brand text-white shadow-glow">
            <Plane className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-lg font-bold truncate">{agencyName}</div>
            <div className="text-xs text-sidebar-foreground/60">Skybird · {role ?? "—"}</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {nav.filter((n) => !n.admin || isAdmin).map((item) => {
            const Icon = item.icon;
            const active = loc.pathname === item.to || loc.pathname.startsWith(item.to + "/");
            return (
              <Link key={item.to} to={item.to} onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-glow"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border p-3">
          <div className="px-3 py-2 text-xs text-sidebar-foreground/60 truncate">{user.email}</div>
          <Button variant="ghost" onClick={signOut}
            className="w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </div>
      </aside>

      {open && <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setOpen(false)} />}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b bg-background/80 backdrop-blur px-4 sm:px-6 py-3">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex-1" />
          <div className="text-sm text-muted-foreground">
            Currency: <span className="font-semibold text-foreground">SAR</span>
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
