import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Upload, BarChart3, FileText, Settings, LogOut, ShieldCheck } from "lucide-react";
import { setUser, useUser } from "@/lib/store";
import type { ReactNode } from "react";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/upload", label: "Upload", icon: Upload },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/reports", label: "Reports", icon: FileText },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const user = useUser();

  const logout = () => {
    setUser(null);
    router.navigate({ to: "/login" });
  };

  const isActive = (to: string) => pathname === to || pathname.startsWith(to + "/");

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="hidden md:flex w-64 flex-col border-r border-sidebar-border bg-sidebar">
        <div className="h-16 px-6 flex items-center gap-2 border-b border-sidebar-border">
          <div className="size-9 rounded-lg grid place-items-center text-primary-foreground" style={{ background: "var(--gradient-primary)" }}>
            <ShieldCheck className="size-5" />
          </div>
          <div>
            <div className="font-semibold text-sm leading-tight">CrowdVision AI</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Decision Support</div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {nav.map((n) => {
            const Icon = n.icon;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive(n.to)
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <Icon className="size-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-sidebar-border">
          <div className="px-3 py-2 mb-2">
            <div className="text-sm font-medium truncate">{user?.name ?? "Guest"}</div>
            <div className="text-xs text-muted-foreground truncate">{user?.email ?? ""}</div>
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <LogOut className="size-4" /> Logout
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 pb-20 md:pb-0">
        <header className="h-16 px-4 md:px-8 flex items-center justify-between border-b border-border bg-card/50 backdrop-blur sticky top-0 z-20">
          <div className="flex items-center gap-2 md:hidden">
            <ShieldCheck className="size-5 text-primary" />
            <span className="font-semibold">CrowdVision AI</span>
          </div>
          <div className="text-sm text-muted-foreground hidden md:block">
            {nav.find((n) => isActive(n.to))?.label ?? "Overview"}
          </div>
          <div className="flex items-center gap-3">
            <div className="text-xs text-muted-foreground hidden sm:block">
              {new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
            </div>
            <button
              onClick={logout}
              aria-label="Logout"
              className="md:hidden inline-flex items-center justify-center size-9 rounded-md border border-input text-muted-foreground hover:bg-accent"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </header>
        <div className="p-4 md:p-8">{children}</div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-border bg-card/95 backdrop-blur flex justify-around">
        {nav.map((n) => {
          const Icon = n.icon;
          const active = isActive(n.to);
          return (
            <Link
              key={n.to}
              to={n.to}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Icon className="size-5" />
              {n.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
