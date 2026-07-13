import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { getUser } from "@/lib/store";

export const Route = createFileRoute("/_app")({
  beforeLoad: () => {
    // Client-only auth check (localStorage). SSR passes through and the
    // real gate happens once hydrated — acceptable for this demo scaffold.
    if (typeof window !== "undefined" && !getUser()) {
      throw redirect({ to: "/login" });
    }
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
