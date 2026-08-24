import { NextResponse } from "next/server";

// Root middleware — session refresh + auth redirects are wired in slice 0.4.
// For now it's a no-op passthrough with the matcher already scoped correctly.
export async function middleware() {
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Run on everything except Next.js internals, static files, images, favicon.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
