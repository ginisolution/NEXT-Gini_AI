"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Project {
  id: string;
  title: string;
  description: string | null;
  status: string;
  duration: number;
  createdAt: string;
  _count?: {
    scenes: number;
  };
}

export function ProjectList() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchProjects();
  }, []);

  async function fetchProjects() {
    try {
      const response = await fetch("/api/projects");
      if (!response.ok) {
        throw new Error("프로젝트 목록을 불러오는데 실패했습니다.");
      }
      const data = await response.json();
      setProjects(data.projects || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
    } finally {
      setLoading(false);
    }
  }

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<
      string,
      { label: string; className: string }
    > = {
      draft: { label: "초안", className: "bg-gray-100 text-gray-800" },
      document_uploaded: {
        label: "문서 업로드됨",
        className: "bg-blue-100 text-blue-800",
      },
      script_generating: {
        label: "대본 생성 중",
        className: "bg-yellow-100 text-yellow-800",
      },
      rendering: {
        label: "렌더링 중",
        className: "bg-purple-100 text-purple-800",
      },
      rendered: { label: "완료", className: "bg-green-100 text-green-800" },
    };

    const config = statusConfig[status] || {
      label: status,
      className: "bg-gray-100 text-gray-800",
    };

    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.className}`}
      >
        {config.label}
      </span>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader>
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2 mt-2"></div>
            </CardHeader>
            <CardContent>
              <div className="h-3 bg-gray-200 rounded w-full"></div>
              <div className="h-3 bg-gray-200 rounded w-5/6 mt-2"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardHeader>
          <CardTitle className="text-red-800">오류 발생</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-red-600">{error}</p>
        </CardContent>
        <CardFooter>
          <Button onClick={fetchProjects} variant="outline">
            다시 시도
          </Button>
        </CardFooter>
      </Card>
    );
  }

  if (projects.length === 0) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle>프로젝트가 없습니다</CardTitle>
          <CardDescription>
            첫 번째 프로젝트를 생성하여 AI 아바타 영상을 만들어보세요.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button onClick={() => router.push("/dashboard/projects/new")}>
            + 새 프로젝트 만들기
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {projects.map((project) => (
        <Card
          key={project.id}
          className="hover:shadow-lg transition-shadow cursor-pointer"
          onClick={() => router.push(`/dashboard/projects/${project.id}`)}
        >
          <CardHeader>
            <div className="flex justify-between items-start">
              <CardTitle className="text-lg">{project.title}</CardTitle>
              {getStatusBadge(project.status)}
            </div>
            <CardDescription>
              {project.description || "설명 없음"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="flex justify-between">
                <span>영상 길이:</span>
                <span className="font-medium">{project.duration}초</span>
              </div>
              <div className="flex justify-between">
                <span>씬 개수:</span>
                <span className="font-medium">
                  {project._count?.scenes || 0}개
                </span>
              </div>
              <div className="flex justify-between">
                <span>생성일:</span>
                <span className="font-medium">
                  {formatDate(project.createdAt)}
                </span>
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button variant="outline" className="w-full" size="sm">
              자세히 보기
            </Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}
