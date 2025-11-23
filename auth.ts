import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { AdapterUser } from "@auth/core/adapters";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/auth.config";
import type { User, Account, Profile } from "next-auth";
import type { JWT } from "next-auth/jwt";
import type { Session } from "next-auth";

export const config = {
  ...authConfig,
  adapter: PrismaAdapter(prisma) as any,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    GitHub({
      clientId: process.env.GITHUB_ID!,
      clientSecret: process.env.GITHUB_SECRET!,
    }),
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "이메일", type: "email" },
        password: { label: "비밀번호", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("이메일과 비밀번호를 입력해주세요");
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
          include: { organization: true },
        });

        if (!user || !user.password) {
          throw new Error("이메일 또는 비밀번호가 올바르지 않습니다");
        }

        const isPasswordValid = await compare(
          credentials.password as string,
          user.password
        );

        if (!isPasswordValid) {
          throw new Error("이메일 또는 비밀번호가 올바르지 않습니다");
        }

        // 마지막 로그인 시간 업데이트
        await prisma.user.update({
          where: { id: user.id },
          data: { lastSignInAt: new Date() },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role,
          organizationId: user.organizationId,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({
      user,
      account,
      profile,
    }: {
      user: User | AdapterUser;
      account?: Account | null;
      profile?: Profile;
    }) {
      // 이메일 인증 확인 (선택적)
      if (!user.email) {
        return false;
      }

      // Credentials provider는 별도 처리 불필요 (authorize에서 처리됨)
      if (account?.provider === "credentials") {
        return true;
      }

      // OAuth: 조직이 없는 사용자의 경우 기본 조직 생성 또는 할당
      const existingUser = await prisma.user.findUnique({
        where: { email: user.email },
        include: { organization: true },
      });

      if (!existingUser) {
        // 신규 사용자: 개인 조직 자동 생성
        const slug = user.email?.split("@")[0] || `user-${Date.now()}`;
        await prisma.organization.create({
          data: {
            name: `${user.name || user.email}'s Organization`,
            slug: slug,
            users: {
              create: {
                email: user.email!,
                name: user.name,
                image: user.image,
                role: "admin",
                emailVerified: new Date(),
              },
            },
          },
        });
      }

      return true;
    },
    async jwt({ token, user }: { token: JWT; user?: User }) {
      // 초기 로그인 시 사용자 정보를 토큰에 추가
      if (user) {
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          include: { organization: true },
        });

        if (dbUser) {
          token.id = dbUser.id;
          token.role = dbUser.role;
          token.organizationId = dbUser.organizationId;
          token.organizationSlug = dbUser.organization.slug;
        }
      }
      return token;
    },
    async session({ session, token }: { session: Session; token: JWT }) {
      // 토큰에서 세션으로 사용자 정보 전달
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.organizationId = token.organizationId as string;
        session.user.organizationSlug = token.organizationSlug as string;
      }
      return session;
    },
  },
  session: {
    strategy: "jwt" as const, // Credentials provider requires JWT
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  debug: false, // 개발 환경에서도 debug 로그 비활성화
};

export const { handlers, auth, signIn, signOut } = NextAuth(config);
