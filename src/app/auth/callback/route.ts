import { NextResponse } from "next/server";

// Placeholder — magic-link code exchange lands in slice 0.5.
export async function GET(request: Request) {
  const { origin } = new URL(request.url);
  return NextResponse.redirect(origin);
}
