import { NextResponse } from "next/server";
import { AuthError, createSession, login } from "../../../../lib/auth";
import { setSessionCookie } from "../../../../lib/session";

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  try {
    const user = await login(String(b.email ?? ""), String(b.password ?? ""));
    const { token, expires } = await createSession(user.userId);
    const res = NextResponse.json({ email: user.email });
    setSessionCookie(res, token, expires);
    return res;
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
