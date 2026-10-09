import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "alfred_session";

/** Reachable without a session. */
const PUBLIC_PATHS = ["/login", "/setup", "/invite"];

/**
 * An optimistic redirect only.
 *
 * This reads the cookie's presence and nothing else — it does not validate the
 * session, because proxy runs on every request including prefetches and a
 * database round trip there would be wasteful. The real check is `requireUser`
 * in each page and route handler, next to the data it protects. A forged
 * cookie gets past this and straight into a 401.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  ) {
    return NextResponse.next();
  }

  if (!request.cookies.get(SESSION_COOKIE)?.value) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  /*
   * Everything except static assets and the icons Next serves itself.
   *
   * `fonts/` and the font extensions are listed because files under public/ do
   * NOT bypass this proxy — only `_next/*` does. Without them a signed-out
   * request for a woff2 is answered with a redirect to /login, so the login
   * page is the one page in the app guaranteed to render in a fallback face.
   * That reads as a styling choice rather than a bug, which is what makes it
   * worth a line of comment.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|fonts/|.*\\.(?:svg|png|jpg|gif|mp4|webm|woff2?|ttf|otf)$).*)",
  ],
};
