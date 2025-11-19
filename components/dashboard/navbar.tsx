import Link from "next/link";
import { Button } from "@/components/ui/button";

interface NavbarProps {
  userEmail: string;
  userRole: string;
}

export function DashboardNavbar({ userEmail, userRole }: NavbarProps) {
  return (
    <nav className="border-b bg-card">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center gap-8">
            <h1 className="text-xl font-bold">Gini AI Dashboard</h1>
            <div className="flex gap-4">
              <Button variant="ghost" size="sm" asChild>
                <Link href="/dashboard">프로젝트</Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/dashboard/costs">비용 대시보드</Link>
              </Button>
              {userRole === "admin" && (
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/dashboard/permissions">권한 관리</Link>
                </Button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              {userEmail}
            </span>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/auth/signout">로그아웃</Link>
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}
