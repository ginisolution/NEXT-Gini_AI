import type { NextAuthConfig } from "next-auth";

/**
 * Edge Runtime 호환 NextAuth 설정
 * - Prisma 없음 (middleware에서 사용)
 * - JWT 기반 인증만 처리
 */
export const authConfig = {
  pages: {
    signIn: "/auth/signin",
    signOut: "/auth/signout",
    error: "/auth/error",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnDashboard = nextUrl.pathname.startsWith("/dashboard");
      const isOnApi = nextUrl.pathname.startsWith("/api");

      if (isOnDashboard || isOnApi) {
        if (isLoggedIn) return true;
        return false; // 로그인 페이지로 리디렉션
      } else if (isLoggedIn) {
        // 로그인한 상태에서 public 페이지 접근 시 대시보드로 리디렉션
        if (
          nextUrl.pathname === "/auth/signin" ||
          nextUrl.pathname === "/auth/signup"
        ) {
          return Response.redirect(new URL("/dashboard", nextUrl));
        }
      }
      return true;
    },
  },
  providers: [], // Provider 설정은 auth.ts에서
} satisfies NextAuthConfig;
