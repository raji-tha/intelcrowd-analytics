import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getUser, setUser, getTheme, setTheme } from "@/lib/store";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({ meta: [{ title: "Settings — CrowdVision AI" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [theme, setThemeState] = useState<"light" | "dark">("light");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const u = getUser();
    if (u) {
      setName(u.name);
      setEmail(u.email);
    }
    setThemeState(getTheme());
  }, []);

  const save = () => {
    const u = getUser();
    if (u) setUser({ ...u, name, email });
    setTheme(theme);
    setPassword("");
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your profile and preferences.</p>
      </div>

      <section className="rounded-xl border border-border bg-card p-6 space-y-4">
        <h2 className="font-semibold">Profile</h2>
        <div className="grid gap-3">
          <div>
            <label className="text-sm font-medium">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-6 space-y-4">
        <h2 className="font-semibold">Change password</h2>
        <input
          type="password"
          value={password}
          placeholder="New password"
          onChange={(e) => setPassword(e.target.value)}
          className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <p className="text-xs text-muted-foreground">
          Demo mode — password changes are not persisted.
        </p>
      </section>

      <section className="rounded-xl border border-border bg-card p-6 space-y-4">
        <h2 className="font-semibold">Theme</h2>
        <div className="grid grid-cols-2 gap-2 max-w-xs">
          {(["light", "dark"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setThemeState(t)}
              className={`h-10 rounded-md border text-sm capitalize ${
                theme === t
                  ? "border-primary bg-primary/10 text-primary font-medium"
                  : "border-input hover:bg-accent"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          className="px-5 h-10 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
        >
          Save changes
        </button>
        {saved && <span className="text-sm text-success">Saved.</span>}
      </div>
    </div>
  );
}
