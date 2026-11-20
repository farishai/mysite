"use client";
import { useEffect, useState } from "react";
import type { StoredDoc } from "../lib/types";

const COLORS: Record<string, string> = { compliant: "#16a34a", warning: "#d97706", non_compliant: "#dc2626" };

export default function Dashboard() {
  const [docs, setDocs] = useState<StoredDoc[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch("/api/documents");
    if (res.status === 401) {
      window.location.href = "/login";
      return;
    }
    setDocs(await res.json());
  }
  const [address, setAddress] = useState<string | null>(null);
  useEffect(() => {
    load();
    fetch("/api/inbound-address")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setAddress(j?.address ?? null));
  }, []);

  async function upload(file: File) {
    setBusy(true);
    setError("");
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/documents", { method: "POST", body: fd });
    if (!res.ok) setError((await res.json()).error ?? "Upload failed");
    await load();
    setBusy(false);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <main style={{ maxWidth: 860, margin: "0 auto", padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>SubPaper</h1>
        <button onClick={logout}>Sign out</button>
      </div>
      <p>Upload a certificate of insurance. We extract it and check it against your requirements.</p>
      {address && (
        <p>
          Or forward certificates to <code>{address}</code>{" "}
          <button onClick={() => navigator.clipboard.writeText(address)}>Copy</button>
        </p>
      )}
      <input
        type="file"
        accept="application/pdf,image/png,image/jpeg"
        disabled={busy}
        onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
      />
      {busy && <p>Checking…</p>}
      {error && <p style={{ color: "#dc2626" }}>{error}</p>}
      {docs.map((d) => (
        <section
          key={d.id}
          style={{ background: "#fff", padding: 16, margin: "16px 0", borderRadius: 8, borderLeft: `6px solid ${COLORS[d.status]}` }}
        >
          <strong>{d.filename}</strong> · {d.extraction.holderName ?? "Unknown holder"} · expires{" "}
          {d.extraction.expirationDate ?? "?"}
          {d.source === "email" && <span style={{ color: "#666" }}> · via email from {d.sender}</span>}
          <div style={{ color: COLORS[d.status], fontWeight: 600 }}>{d.status.replace("_", " ")}</div>
          <ul>
            {d.issues.map((i) => (
              <li key={i.code}>{i.message}</li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
