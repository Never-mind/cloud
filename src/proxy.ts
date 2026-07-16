import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const embedded = request.nextUrl.searchParams.get("embed") === "1";
  const cookieName = "cloud-power-embedded";
  if (embedded && request.cookies.get(cookieName)?.value !== "1") {
    const response = NextResponse.redirect(request.nextUrl);
    response.cookies.set(cookieName, "1", {
      httpOnly: true,
      sameSite: "lax",
      path: request.nextUrl.pathname,
      maxAge: 60,
    });
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next|favicon.ico).*)"],
};
