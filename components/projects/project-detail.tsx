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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Film, FileText, Upload, Play } from "lucide-react";
import { ProjectStatus } from "@/components/realtime/project-status";
import { SceneProgress } from "@/components/realtime/scene-progress";

interface Project {
  id: string;
  title: string;
  description: string | null;
  status: string;
  duration: number;
  avatarDesignMode: string;
  createdAt: string;
  updatedAt: string;
  _count?: {
    documents: number;
    scenes: number;
  };
}

interface ProjectDetailProps {
  projectId: string;
}

export function ProjectDetail({ projectId }: ProjectDetailProps) {
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadingDocument, setUploadingDocument] = useState(false);

  useEffect(() => {
    fetchProject();
  }, [projectId]);

  async function fetchProject() {
    try {
      const response = await fetch(`/api/projects/${projectId}`);
      if (!response.ok) {
        throw new Error("프로젝트를 불러오는데 실패했습니다.");
      }
      const data = await response.json();
      setProject(data.project);
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
    } finally {
      setLoading(false);
    }
  }

  async function handleDocumentUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      alert("PDF 파일만 업로드 가능합니다.");
      return;
    }

    setUploadingDocument(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("projectId", projectId);

      const response = await fetch("/api/documents", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "문서 업로드에 실패했습니다.");
      }

      // 프로젝트 정보 새로고침
      await fetchProject();
      alert("문서가 성공적으로 업로드되었습니다.");
    } catch (err) {
      alert(err instanceof Error ? err.message : "알 수 없는 오류");
    } finally {
      setUploadingDocument(false);
    }
  }

  async function handleStartRender() {
    if (!confirm("영상 렌더링을 시작하시겠습니까?")) return;

    try {
      const response = await fetch(`/api/projects/${projectId}/render`, {
        method: "POST",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "렌더링 시작에 실패했습니다.");
      }

      alert("렌더링이 시작되었습니다.");
      await fetchProject();
    } catch (err) {
      alert(err instanceof Error ? err.message : "알 수 없는 오류");
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
        className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${config.className}`}
      >
        {config.label}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Card className="animate-pulse">
          <CardHeader>
            <div className="h-6 bg-gray-200 rounded w-1/2"></div>
            <div className="h-4 bg-gray-200 rounded w-1/4 mt-2"></div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="h-4 bg-gray-200 rounded w-full"></div>
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !project) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardHeader>
          <CardTitle className="text-red-800">오류 발생</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-red-600">{error || "프로젝트를 찾을 수 없습니다."}</p>
        </CardContent>
        <CardFooter>
          <Button onClick={fetchProject} variant="outline">
            다시 시도
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* 프로젝트 헤더 */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-2xl">{project.title}</CardTitle>
              <CardDescription className="mt-2">
                {project.description || "설명 없음"}
              </CardDescription>
            </div>
            {getStatusBadge(project.status)}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground">영상 길이</div>
              <div className="font-medium mt-1">{project.duration}초</div>
            </div>
            <div>
              <div className="text-muted-foreground">아바타 모드</div>
              <div className="font-medium mt-1">
                {project.avatarDesignMode === "custom"
                  ? "커스텀"
                  : "프리셋"}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">문서</div>
              <div className="font-medium mt-1">
                {project._count?.documents || 0}개
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">씬</div>
              <div className="font-medium mt-1">
                {project._count?.scenes || 0}개
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex gap-2">
          {project.status === "rendered" && (
            <Button variant="default">
              <Film className="h-4 w-4 mr-2" />
              영상 다운로드
            </Button>
          )}
          {project.status !== "rendering" && project.status !== "rendered" && (
            <Button onClick={handleStartRender}>
              <Play className="h-4 w-4 mr-2" />
              렌더링 시작
            </Button>
          )}
        </CardFooter>
      </Card>

      {/* 실시간 상태 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ProjectStatus projectId={projectId} />
        <Card>
          <CardHeader>
            <CardTitle>문서 업로드</CardTitle>
            <CardDescription>
              PDF 파일을 업로드하면 AI가 자동으로 대본을 생성합니다
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Label
                htmlFor="document-upload"
                className="cursor-pointer inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2"
              >
                <Upload className="h-4 w-4" />
                {uploadingDocument ? "업로드 중..." : "PDF 선택"}
              </Label>
              <Input
                id="document-upload"
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={handleDocumentUpload}
                disabled={uploadingDocument}
              />
              <span className="text-sm text-muted-foreground">
                PDF 파일 (최대 10MB)
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 씬 진행 상황 */}
      <SceneProgress projectId={projectId} />
    </div>
  );
}
