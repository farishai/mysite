import { NextResponse, type NextRequest } from "next/server";

// Cheap gate: redirect page visits without a session cookie to /login.
// Real validation happens in requireUser() / currentUser() against the database.
export function middleware(req: NextRequest) {
  if (!req.cookies.has("sp_session")) return NextResponse.redirect(new URL("/login", req.url));
  return NextResponse.next();
}

export const config = { matcher: ["/"] };
