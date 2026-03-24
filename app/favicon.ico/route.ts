import { NextResponse } from "next/server";

export function GET(request: Request) {
  const url = new URL(request.url);
  url.pathname = "/logo.png";
  url.search = "v=5";

  return NextResponse.redirect(url, { status: 307 });
}

