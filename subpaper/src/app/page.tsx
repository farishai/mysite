"use client";
import { useEffect, useState } from "react";
import type { StoredDoc } from "../lib/store";

const COLORS: Record<string, string> = { compliant: "#16a34a", warning: "#d97706", non_compliant: "#dc2626" };

export default function Dashboard() {
  const [docs, setDocs] = useState<StoredDoc[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = () => fetch("/api/documents").then((r) => r.json()).then(setDocs);
  useEffect(() => { load(); }, []);

  async function upload(file: File) {
    setBusy(true); setError("");
    const fd = new FormData(); fd.append("file", file);
    const res = await fetch("/api/documents", { method: "POST", body: fd });
    if (!res.ok) setError((await res.json()).error ?? "Upload failed");
    await load(); setBusy(false);
  }

  return (
    <main style={{ maxWidth: 860, margin: "0 auto", padding: 24 }}>
      <h1>SubPaper</h1>
      <p>Upload a certificate of insurance. We extract it and check it against your requirements.</p>
      <input type="file" accept="application/pdf,image/png,image/jpeg" disabled={busy}
        onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      {busy && <p>Checking…</p>}
      {error && <p style={{ color: "#dc2626" }}>{error}</p>}
      {docs.map((d) => (
        <section key={d.id} style={{ background: "#fff", padding: 16, margin: "16px 0", borderRadius: 8, borderLeft: `6px solid ${COLORS[d.status]}` }}>
          <strong>{d.filename}</strong> · {d.extraction.holderName ?? "Unknown holder"} · expires {d.extraction.expirationDate ?? "?"}
          <div style={{ color: COLORS[d.status], fontWeight: 600 }}>{d.status.replace("_", " ")}</div>
          <ul>{d.issues.map((i) => <li key={i.code}>{i.message}</li>)}</ul>
        </section>
      ))}
    </main>
  );
}
