import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

// Verrouille toute l'application : accès réservé à l'utilisateur unique.
export default auth((req) => {
  const isAuth = !!req.auth;
  const isLogin = req.nextUrl.pathname.startsWith("/login");
  const isApiAuth = req.nextUrl.pathname.startsWith("/api/auth");

  if (isApiAuth) return NextResponse.next();
  if (!isAuth && !isLogin) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }
  if (isAuth && isLogin) {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brand|.*\\.png$).*)"],
};
