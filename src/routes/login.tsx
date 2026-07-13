import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { setUser } from "@/lib/store";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — CrowdVision AI" },
      { name: "description", content: "Sign in to access the CrowdVision dashboard." },
    ],
  }),
  component: Login,
});

function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@crowdvision.ai");
  const [password, setPassword] = useState("demo1234");
  const [role, setRole] = useState<"admin" | "user">("admin");
  const [err, setErr] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || password.length < 4) {
      setErr("Enter a valid email and a password of 4+ characters.");
      return;
    }
    setUser({ email, name: email.split("@")[0], role });
    router.navigate({ to: "/dashboard" });
  };

  return (
    <div className="min-h-screen grid md:grid-cols-2 bg-background">
      <div className="hidden md:flex flex-col justify-between p-10 text-primary-foreground" style={{ background: "var(--gradient-primary)" }}>
        <div className="flex items-center gap-2 font-semibold">
          <ShieldCheck className="size-5" /> CrowdVision AI
        </div>
        <div>
          <h2 className="text-3xl font-bold leading-tight">
            Predict crowd risk.<br />Act before it escalates.
          </h2>
          <p className="mt-4 text-primary-foreground/80 max-w-md">
            An intelligent decision support platform combining computer vision, data science, and
            machine learning for crowd safety.
          </p>
        </div>
        <div className="text-xs text-primary-foreground/70">© CrowdVision AI</div>
      </div>

      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <div>
            <h1 className="text-2xl font-semibold">Sign in</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Demo credentials are pre-filled. Any email + 4+ char password works.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Role</label>
            <div className="grid grid-cols-2 gap-2">
              {(["admin", "user"] as const).map((r) => (
                <button
                  type="button"
                  key={r}
                  onClick={() => setRole(r)}
                  className={`h-10 rounded-md border text-sm capitalize ${
                    role === r
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "border-input hover:bg-accent"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {err && <div className="text-sm text-destructive">{err}</div>}

          <button
            type="submit"
            className="w-full h-10 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
          >
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
