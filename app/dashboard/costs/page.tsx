import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, TrendingUp, Calendar, Film } from "lucide-react";
import { DashboardNavbar } from "@/components/dashboard/navbar";

export default async function CostsPage() {
  const session = await auth();
  if (!session?.user) redirect("/auth/signin");

  // 조직의 모든 프로젝트와 자산 조회
  const projects = await prisma.project.findMany({
    where: { organizationId: session.user.organizationId },
    include: {
      assets: {
        select: {
          id: true,
          kind: true,
          metadata: true,
          createdAt: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // 생성자 정보 조회
  const creatorIds = [...new Set(projects.map((p) => p.createdById))];
  const creators = await prisma.user.findMany({
    where: { id: { in: creatorIds } },
    select: { id: true, name: true, email: true },
  });
  const creatorMap = new Map(creators.map((c) => [c.id, c]));

  // 비용 계산
  interface CostMetadata {
    cost?: number;
  }

  const totalCost = projects.reduce((sum, project) => {
    return sum + project.assets.reduce((assetSum, asset) => {
      const metadata = asset.metadata as CostMetadata | null;
      return assetSum + (metadata?.cost || 0);
    }, 0);
  }, 0);

  const projectCosts = projects.map((project) => {
    const cost = project.assets.reduce((sum: number, asset) => {
      const metadata = asset.metadata as CostMetadata | null;
      return sum + (metadata?.cost || 0);
    }, 0);

    const assetTypeCosts = project.assets.reduce(
      (acc: Record<string, number>, asset) => {
        const metadata = asset.metadata as CostMetadata | null;
        const assetCost = metadata?.cost || 0;
        acc[asset.kind] = (acc[asset.kind] || 0) + assetCost;
        return acc;
      },
      {} as Record<string, number>
    );

    const creator = creatorMap.get(project.createdById);

    return {
      id: project.id,
      title: project.title,
      createdAt: project.createdAt,
      createdBy: creator || { name: "알 수 없음", email: "" },
      totalCost: cost,
      assetTypeCosts,
      assetCount: project.assets.length,
    };
  });

  // 월별 비용 계산 (최근 6개월)
  const monthlyCosts = Array.from({ length: 6 }, (_, i) => {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    const month = date.toLocaleString("ko-KR", { year: "numeric", month: "long" });

    const cost = projects.reduce((sum, project) => {
      return sum + project.assets.reduce((assetSum: number, asset) => {
        const assetDate = new Date(asset.createdAt);
        if (
          assetDate.getFullYear() === date.getFullYear() &&
          assetDate.getMonth() === date.getMonth()
        ) {
          const metadata = asset.metadata as CostMetadata | null;
          return assetSum + (metadata?.cost || 0);
        }
        return assetSum;
      }, 0);
    }, 0);

    return { month, cost };
  }).reverse();

  // 자산 타입별 총 비용
  const assetTypeTotalCosts = projects.reduce(
    (acc, project) => {
      project.assets.forEach((asset) => {
        const metadata = asset.metadata as CostMetadata | null;
        const assetCost = metadata?.cost || 0;
        acc[asset.kind] = (acc[asset.kind] || 0) + assetCost;
      });
      return acc;
    },
    {} as Record<string, number>
  );

  const assetTypeLabels: Record<string, string> = {
    avatar_design: "커스텀 아바타",
    audio: "TTS 음성",
    avatar_video: "아바타 영상",
    background_image: "배경 이미지",
    background_video: "배경 영상",
    final_video: "최종 영상",
  };

  return (
    <div className="min-h-screen bg-background">
      <DashboardNavbar userEmail={session.user.email || ""} userRole={session.user.role || "member"} />

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">비용 대시보드</h1>
              <p className="text-muted-foreground mt-1">
                API 사용 비용을 추적하고 분석합니다
              </p>
            </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">총 비용</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalCost.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              전체 기간
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">이번 달</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${monthlyCosts[monthlyCosts.length - 1]?.cost.toFixed(2) || "0.00"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {new Date().toLocaleString("ko-KR", { month: "long" })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">프로젝트 수</CardTitle>
            <Film className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{projects.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              총 {projects.length}개 프로젝트
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">평균 비용</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${projects.length > 0 ? (totalCost / projects.length).toFixed(2) : "0.00"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              프로젝트당 평균
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 월별 비용 추이 */}
      <Card>
        <CardHeader>
          <CardTitle>월별 비용 추이</CardTitle>
          <CardDescription>최근 6개월간 API 사용 비용</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {monthlyCosts.map((item) => (
              <div key={item.month} className="flex items-center justify-between">
                <div className="flex items-center gap-4 flex-1">
                  <span className="text-sm font-medium w-32">{item.month}</span>
                  <div className="flex-1 bg-secondary rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full transition-all"
                      style={{
                        width: `${totalCost > 0 ? (item.cost / totalCost) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
                <span className="text-sm font-semibold ml-4 w-20 text-right">
                  ${item.cost.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 자산 타입별 비용 */}
      <Card>
        <CardHeader>
          <CardTitle>자산 타입별 비용</CardTitle>
          <CardDescription>API 서비스별 비용 분석</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Object.entries(assetTypeTotalCosts)
              .sort(([, a], [, b]) => (b as number) - (a as number))
              .map(([type, cost]) => (
                <div key={type} className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1">
                    <span className="text-sm font-medium w-32">
                      {assetTypeLabels[type] || type}
                    </span>
                    <div className="flex-1 bg-secondary rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full transition-all"
                        style={{
                          width: `${totalCost > 0 ? (cost / totalCost) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                  <span className="text-sm font-semibold ml-4 w-20 text-right">
                    ${cost.toFixed(2)}
                  </span>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>

      {/* 프로젝트별 비용 */}
      <Card>
        <CardHeader>
          <CardTitle>프로젝트별 비용</CardTitle>
          <CardDescription>각 프로젝트의 API 사용 비용 상세</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {projectCosts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                프로젝트가 없습니다
              </div>
            ) : (
              projectCosts.map((project) => (
                <div key={project.id} className="border-b pb-4 last:border-0">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold">{project.title}</h3>
                      <p className="text-sm text-muted-foreground">
                        생성자: {project.createdBy.name || project.createdBy.email} ·{" "}
                        {new Date(project.createdAt).toLocaleDateString("ko-KR")}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold">
                        ${project.totalCost.toFixed(2)}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {project.assetCount}개 자산
                      </p>
                    </div>
                  </div>

                  {/* 자산별 비용 상세 */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-3">
                    {Object.entries(project.assetTypeCosts).map(([type, assetCost]) => (
                      <div
                        key={type}
                        className="bg-secondary/50 rounded-md px-3 py-2 text-sm"
                      >
                        <div className="text-muted-foreground text-xs">
                          {assetTypeLabels[type] || type}
                        </div>
                        <div className="font-semibold">${(assetCost as number).toFixed(2)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
