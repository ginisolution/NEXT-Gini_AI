import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Users, Lock } from "lucide-react";
import { PermissionManager } from "@/components/permissions/permission-manager";
import { DashboardNavbar } from "@/components/dashboard/navbar";

export default async function PermissionsPage() {
  const session = await auth();
  if (!session?.user) redirect("/auth/signin");

  // Admin만 접근 가능
  if (session.user.role !== "admin") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              접근 권한 없음
            </CardTitle>
            <CardDescription>
              이 페이지는 관리자만 접근할 수 있습니다.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // 조직의 모든 사용자 조회
  const users = await prisma.user.findMany({
    where: { organizationId: session.user.organizationId },
    orderBy: { createdAt: "desc" },
  });

  // 사용자별 권한 튜플 조회
  const relationTuples = await prisma.relationTuple.findMany({
    where: {
      subjectId: { in: users.map((u) => u.id) },
      namespace: "project",
    },
  });

  // 프로젝트 ID 수집
  const projectIds = [...new Set(relationTuples.map((rt) => rt.objectId))];
  const relationProjects = await prisma.project.findMany({
    where: { id: { in: projectIds } },
    select: { id: true, title: true },
  });
  const projectMap = new Map(relationProjects.map((p) => [p.id, p]));

  // 조직의 모든 프로젝트 조회
  const projects = await prisma.project.findMany({
    where: { organizationId: session.user.organizationId },
    orderBy: { createdAt: "desc" },
  });

  // 생성자 정보 조회
  const creatorIds = [...new Set(projects.map((p) => p.createdById))];
  const creators = await prisma.user.findMany({
    where: { id: { in: creatorIds } },
    select: { id: true, name: true, email: true },
  });
  const creatorMap = new Map(creators.map((c) => [c.id, c]));

  // 프로젝트별 권한 튜플 조회
  const projectRelationTuples = await prisma.relationTuple.findMany({
    where: {
      objectId: { in: projects.map((p) => p.id) },
      namespace: "project",
    },
  });

  // 사용자 정보 Map
  const userMap = new Map(users.map((u) => [u.id, u]));

  // 권한 정의 조회
  const relationDefinitions = await prisma.relationDefinition.findMany({
    where: { namespace: "project" },
    orderBy: { relation: "asc" },
  });

  // 통계 계산
  const totalUsers = users.length;
  const totalProjects = projects.length;
  const totalPermissions = relationTuples.length + projectRelationTuples.length;

  return (
    <div className="min-h-screen bg-background">
      <DashboardNavbar userEmail={session.user.email || ""} userRole={session.user.role || "member"} />

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">권한 관리</h1>
              <p className="text-muted-foreground mt-1">
                프로젝트별 사용자 권한을 관리합니다
              </p>
            </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">총 사용자</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalUsers}</div>
            <p className="text-xs text-muted-foreground mt-1">
              조직 구성원
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">총 프로젝트</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalProjects}</div>
            <p className="text-xs text-muted-foreground mt-1">
              권한 관리 대상
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">총 권한</CardTitle>
            <Lock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalPermissions}</div>
            <p className="text-xs text-muted-foreground mt-1">
              부여된 권한 수
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 권한 정의 */}
      <Card>
        <CardHeader>
          <CardTitle>권한 정의</CardTitle>
          <CardDescription>프로젝트 권한 계층 구조</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {relationDefinitions.map((def) => (
              <div
                key={def.id}
                className="flex items-center justify-between border rounded-lg p-4"
              >
                <div>
                  <div className="font-semibold capitalize">{def.relation}</div>
                  <div className="text-sm text-muted-foreground">
                    {def.relation === "owner" && "프로젝트 소유자 (모든 권한)"}
                    {def.relation === "editor" && "편집자 (편집 + 조회)"}
                    {def.relation === "viewer" && "조회자 (조회만 가능)"}
                  </div>
                </div>
                {def.inherits.length > 0 && (
                  <div className="text-sm text-muted-foreground">
                    상속: {def.inherits.join(", ")}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 권한 관리 컴포넌트 */}
      <PermissionManager
        users={users.map((u) => ({
          id: u.id,
          name: u.name || u.email,
          email: u.email,
          role: u.role,
          permissions: relationTuples
            .filter((rt) => rt.subjectId === u.id)
            .map((rt) => {
              const project = projectMap.get(rt.objectId);
              return {
                projectId: rt.objectId,
                projectTitle: project?.title || "알 수 없음",
                relation: rt.relation,
              };
            }),
        }))}
        projects={projects.map((p) => {
          const creator = creatorMap.get(p.createdById);
          return {
            id: p.id,
            title: p.title,
            createdBy: creator || { id: p.createdById, name: null, email: "알 수 없음" },
            permissions: projectRelationTuples
              .filter((rt) => rt.objectId === p.id)
              .map((rt) => {
                const user = userMap.get(rt.subjectId);
                return {
                  userId: rt.subjectId,
                  userName: user?.name || user?.email || "알 수 없음",
                  userEmail: user?.email || "알 수 없음",
                  relation: rt.relation,
                };
              }),
          };
        })}
      />
          </div>
        </div>
      </main>
    </div>
  );
}
