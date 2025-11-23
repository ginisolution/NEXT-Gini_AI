import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

export default NextAuth(authConfig).auth;

export const config = {
  matcher: [
    /*
     * NextAuth가 보호해야 할 경로만 매칭 (Edge Runtime 크기 최적화)
     * - /dashboard/* (인증 필요)
     * - /api/* (NextAuth API 제외)
     */
    "/dashboard/:path*",
    "/api/((?!auth).*)",
  ],
};
