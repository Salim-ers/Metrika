import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { NextResponse } from "next/server";

// Instance edge-safe (sans Prisma ni bcrypt) : le middleware tourne
// en Edge runtime et ne lit que le JWT de session.
const { auth } = NextAuth(authConfig);

// Verrouille toute l'application : accès réservé à l'utilisateur unique.
export default auth((req) => {
  const isAuth = !!req.auth;
  const isLogin = req.nextUrl.pathname.startsWith("/login");
  const isApiAuth = req.nextUrl.pathname.startsWith("/api/auth");
  const isDiag = req.nextUrl.pathname.startsWith("/api/diag");

  if (isApiAuth || isDiag) return NextResponse.next();
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
