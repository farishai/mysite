import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getUserBySession, SESSION_COOKIE, type SessionUser } from "./auth";

export async function currentUser(): Promise<SessionUser | null> {
  return getUserBySession((await cookies()).get(SESSION_COOKIE)?.value);
}

/** For API routes: returns the user, or a 401 response to return as-is. */
export async function requireUser(): Promise<SessionUser | NextResponse> {
  const u = await currentUser();
  return u ?? NextResponse.json({ error: "Not signed in" }, { status: 401 });
}

export function setSessionCookie(res: NextResponse, token: string, expires: Date) {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}
