import type { NextAuthConfig } from "next-auth";

/**
 * Configuration Auth.js « edge-safe » : aucune dépendance Node
 * (ni Prisma, ni bcrypt). Utilisée par le middleware (Edge runtime)
 * et étendue côté Node dans auth.ts avec le provider Credentials.
 */
export const authConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  trustHost: true,
  providers: [], // ajoutés dans auth.ts (runtime Node)
  callbacks: {
    jwt({ token, user }) {
      if (user) token.role = (user as { role?: string }).role;
      return token;
    },
    session({ session, token }) {
      if (session.user) (session.user as { role?: string }).role = token.role as string;
      return session;
    },
  },
} satisfies NextAuthConfig;
