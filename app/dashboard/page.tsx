import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ProjectList } from "@/components/projects/project-list";
import { DashboardNavbar } from "@/components/dashboard/navbar";

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/signin");
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardNavbar userEmail={session.user.email || ""} userRole={session.user.role || "member"} />

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">프로젝트</h2>
              <p className="text-muted-foreground mt-1">
                AI 아바타 영상 프로젝트를 관리하세요
              </p>
            </div>
            <Button asChild>
              <Link href="/dashboard/projects/new">+ 새 프로젝트</Link>
            </Button>
          </div>

          <ProjectList />
        </div>
      </main>
    </div>
  );
}
