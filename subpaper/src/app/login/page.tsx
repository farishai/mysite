"use client";
import { useState } from "react";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    const res = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.fromEntries(f)),
    });
    if (res.ok) {
      window.location.href = "/";
      return;
    }
    setError((await res.json().catch(() => ({}))).error ?? "Something went wrong");
    setBusy(false);
  }

  const input = { display: "block", width: "100%", padding: 8, margin: "4px 0 12px", boxSizing: "border-box" } as const;
  return (
    <main style={{ maxWidth: 360, margin: "80px auto", padding: 24, background: "#fff", borderRadius: 8 }}>
      <h1>SubPaper</h1>
      <form onSubmit={submit}>
        {mode === "signup" && (
          <label>
            Company
            <input name="company" required style={input} />
          </label>
        )}
        <label>
          Email
          <input name="email" type="email" required autoComplete="email" style={input} />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            required
            minLength={10}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            style={input}
          />
        </label>
        {error && <p style={{ color: "#dc2626" }}>{error}</p>}
        <button disabled={busy} style={{ padding: "8px 16px" }}>
          {mode === "login" ? "Sign in" : "Create account"}
        </button>
      </form>
      <p>
        <button
          type="button"
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
          style={{ background: "none", border: 0, color: "#2563eb", cursor: "pointer", padding: 0 }}
        >
          {mode === "login" ? "New here? Create an account" : "Have an account? Sign in"}
        </button>
      </p>
    </main>
  );
}
