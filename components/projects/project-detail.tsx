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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Film, FileText, Upload, Play, Trash2, Pencil, Save, X } from "lucide-react";
import { ProjectStatus } from "@/components/realtime/project-status";
import { SceneProgress } from "@/components/realtime/scene-progress";

interface Document {
  id: string;
  projectId: string;
  status: string;
  metadata: {
    fileName: string;
    fileSize: number;
    mimeType: string;
    uploadedBy?: string;
  };
  storagePath: string;
  fileUrl: string;
  createdAt: string;
  updatedAt: string;
}

interface Scene {
  id: string;
  projectId: string;
  sceneNumber: number;
  position: number;
  script: string;
  duration: number;
  visualDescription: string;
  imagePrompt: string | null;
  videoPrompt: string | null;
  ttsStatus: string;
  avatarStatus: string;
  backgroundStatus: string;
  backgroundAnalysis?: {
    priority?: "high" | "medium" | "low";
    emotion?: string;
    visualDescription?: string;
  };
  assets?: Asset[];
  audioAsset?: Asset | null;
  avatarAsset?: Asset | null;
  backgroundAsset?: Asset | null;
  createdAt: string;
  updatedAt: string;
}

interface Asset {
  id: string;
  projectId: string;
  kind: string;
  type: string;
  url: string;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
}

interface AvatarDesignSettings {
  gender?: string;
  ageRange?: string;
  style?: string;
  expression?: string;
  background?: string;
}

interface Project {
  id: string;
  title: string;
  description: string | null;
  status: string;
  duration: number;
  avatarDesignMode: string;
  avatarDesignSettings: unknown;
  createdAt: string;
  updatedAt: string;
  documents?: Document[];
  scenes?: Scene[];
  assets?: Asset[];
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
  const [generatingScript, setGeneratingScript] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
  const [editedScript, setEditedScript] = useState("");
  const [editedVisualDescription, setEditedVisualDescription] = useState("");
  const [editedBackgroundPriority, setEditedBackgroundPriority] = useState<"low" | "medium" | "high">("low");
  const [saving, setSaving] = useState(false);
  const [processingScenes, setProcessingScenes] = useState(false);

  useEffect(() => {
    fetchProject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function fetchProject() {
    try {
      const response = await fetch(`/api/projects/${projectId}`);
      if (!response.ok) {
        throw new Error("프로젝트를 불러오는데 실패했습니다.");
      }
      const data = await response.json();
      setProject(data);
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

      // 자동으로 스크립트 생성 시작
      try {
        const scriptResponse = await fetch(`/api/projects/${projectId}/generate-script`, {
          method: "POST",
        });

        if (!scriptResponse.ok) {
          const data = await scriptResponse.json();
          throw new Error(data.error || "스크립트 생성에 실패했습니다.");
        }

        alert("문서가 업로드되었고 스크립트 생성이 완료되었습니다.");
        await fetchProject(); // 스크립트 생성 결과 반영
      } catch (scriptErr) {
        alert(
          `문서 업로드는 성공했으나 스크립트 생성 실패: ${
            scriptErr instanceof Error ? scriptErr.message : "알 수 없는 오류"
          }`
        );
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "알 수 없는 오류");
    } finally {
      setUploadingDocument(false);
    }
  }

  async function handleRenderAndDownload() {
    if (!confirm("영상 렌더링을 시작하고 다운로드하시겠습니까?\n(렌더링은 약 20-60초 소요됩니다)")) return;

    setGeneratingScript(true); // 렌더링 중 표시용 (임시)
    try {
      const response = await fetch(`/api/projects/${projectId}/render-download`, {
        method: "POST",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "렌더링에 실패했습니다.");
      }

      // Blob으로 응답 받기
      const blob = await response.blob();

      // 다운로드 트리거
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${project?.title || "video"}.mp4`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      alert("렌더링이 완료되어 다운로드가 시작되었습니다.");
      await fetchProject();
    } catch (err) {
      alert(err instanceof Error ? err.message : "알 수 없는 오류");
    } finally {
      setGeneratingScript(false);
    }
  }

  async function handleProcessScenes() {
    if (!confirm("씬 처리를 시작하시겠습니까? (TTS → 아바타 → 배경)")) return;

    setProcessingScenes(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/process-scenes`, {
        method: "POST",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "씬 처리 시작에 실패했습니다.");
      }

      alert("씬 처리가 시작되었습니다.");
      await fetchProject();
    } catch (err) {
      alert(err instanceof Error ? err.message : "알 수 없는 오류");
    } finally {
      setProcessingScenes(false);
    }
  }

  async function handleGenerateScript() {
    if (!confirm("스크립트를 생성하시겠습니까?")) return;

    setGeneratingScript(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/generate-script`, {
        method: "POST",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "스크립트 생성에 실패했습니다.");
      }

      alert("스크립트 생성이 완료되었습니다.");
      await fetchProject();
    } catch (err) {
      alert(err instanceof Error ? err.message : "알 수 없는 오류");
    } finally {
      setGeneratingScript(false);
    }
  }

  async function handleDeleteProject() {
    setDeleting(true);
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "프로젝트 삭제에 실패했습니다.");
      }

      alert("프로젝트가 삭제되었습니다.");
      router.push("/dashboard/projects");
    } catch (err) {
      alert(err instanceof Error ? err.message : "알 수 없는 오류");
    } finally {
      setDeleting(false);
    }
  }

  function handleStartEdit(scene: Scene) {
    setEditingSceneId(scene.id);
    setEditedScript(scene.script);
    setEditedVisualDescription(scene.visualDescription || "");
    const analysis = scene.backgroundAnalysis as { priority?: "high" | "medium" | "low" } | null;
    setEditedBackgroundPriority(analysis?.priority || "low");
  }

  function handleCancelEdit() {
    setEditingSceneId(null);
    setEditedScript("");
    setEditedVisualDescription("");
    setEditedBackgroundPriority("low");
  }

  async function handleSaveEdit(sceneId: string) {
    setSaving(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/scenes/${sceneId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          script: editedScript,
          visualDescription: editedVisualDescription,
          backgroundPriority: editedBackgroundPriority,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Scene 업데이트에 실패했습니다.");
      }

      alert("스크립트가 수정되었습니다.");
      setEditingSceneId(null);
      setEditedScript("");
      setEditedVisualDescription("");
      await fetchProject(); // 변경사항 반영
    } catch (err) {
      alert(err instanceof Error ? err.message : "알 수 없는 오류");
    } finally {
      setSaving(false);
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
                {project.documents?.length || 0}개
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">씬</div>
              <div className="font-medium mt-1">
                {project.scenes?.length || 0}개
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-between gap-2">
          <div className="flex gap-2">
            {(project.documents?.length ?? 0) > 0 && (project.scenes?.length ?? 0) === 0 && (
              <Button
                onClick={handleGenerateScript}
                disabled={generatingScript}
                variant="secondary"
              >
                <FileText className="h-4 w-4 mr-2" />
                {generatingScript ? "스크립트 생성 중..." : "스크립트 생성"}
              </Button>
            )}
            {(project.scenes?.length ?? 0) > 0 && project.status === "script_generated" && (
              <Button
                onClick={handleProcessScenes}
                disabled={processingScenes}
                variant="secondary"
              >
                <Film className="h-4 w-4 mr-2" />
                {processingScenes ? "씬 처리 중..." : "씬 처리 시작"}
              </Button>
            )}
            {project.status === "scenes_processed" && (
              <Button onClick={handleRenderAndDownload} disabled={generatingScript}>
                <Play className="h-4 w-4 mr-2" />
                {generatingScript ? "렌더링 중..." : "비디오 렌더링 및 다운로드"}
              </Button>
            )}
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={deleting}>
                <Trash2 className="h-4 w-4 mr-2" />
                {deleting ? "삭제 중..." : "프로젝트 삭제"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>정말로 삭제하시겠습니까?</AlertDialogTitle>
                <AlertDialogDescription>
                  이 작업은 되돌릴 수 없습니다. 프로젝트와 관련된 모든 데이터(문서, 스크립트, 생성된 자산)가 영구적으로 삭제됩니다.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>취소</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteProject}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  삭제
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardFooter>
      </Card>

      {/* 렌더링 완료 안내 */}
      {project.status === "rendered" && (
        <Card>
          <CardHeader>
            <CardTitle>렌더링 완료</CardTitle>
            <CardDescription>
              영상이 성공적으로 렌더링되었습니다
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">
                영상을 다시 다운로드하려면 아래 버튼을 클릭하세요.
              </p>
              <Button onClick={handleRenderAndDownload} disabled={generatingScript}>
                <Play className="h-4 w-4 mr-2" />
                {generatingScript ? "렌더링 중..." : "비디오 다시 다운로드"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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

      {/* 업로드된 문서 목록 */}
      {project.documents && project.documents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>업로드된 문서</CardTitle>
            <CardDescription>
              프로젝트에 업로드된 PDF 문서 목록
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {project.documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">
                        {doc.metadata?.fileName || "문서"}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {doc.metadata?.fileSize
                          ? `${(doc.metadata.fileSize / 1024 / 1024).toFixed(2)} MB`
                          : ""}{" "}
                        · {new Date(doc.createdAt).toLocaleDateString("ko-KR")}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        doc.status === "completed"
                          ? "bg-green-100 text-green-800"
                          : doc.status === "processing"
                          ? "bg-blue-100 text-blue-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {doc.status === "completed"
                        ? "완료"
                        : doc.status === "processing"
                        ? "처리 중"
                        : "대기"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 아바타 미리보기 */}
      {project.avatarDesignMode === "custom" && project.assets && (
        <Card>
          <CardHeader>
            <CardTitle>커스텀 아바타</CardTitle>
            <CardDescription>
              AI가 생성한 커스텀 아바타 디자인
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(() => {
              const avatarAsset = project.assets.find(
                (asset) => asset.kind === "avatar_design"
              );

              if (!avatarAsset) {
                return (
                  <div className="text-center py-8 text-muted-foreground">
                    아바타 디자인이 아직 생성되지 않았습니다.
                  </div>
                );
              }

              const settings = project.avatarDesignSettings as AvatarDesignSettings | null;

              return (
                <div className="flex flex-col items-center gap-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={avatarAsset.url}
                    alt="Custom Avatar"
                    className="w-64 h-64 rounded-lg object-cover border-2 border-border"
                  />
                  {settings && (
                    <div className="grid grid-cols-2 gap-4 w-full max-w-md text-sm">
                      {settings.gender && (
                        <div>
                          <span className="text-muted-foreground">성별:</span>{" "}
                          <span className="font-medium">
                            {settings.gender === "male" ? "남성" : "여성"}
                          </span>
                        </div>
                      )}
                      {settings.ageRange && (
                        <div>
                          <span className="text-muted-foreground">나이:</span>{" "}
                          <span className="font-medium">
                            {settings.ageRange}
                          </span>
                        </div>
                      )}
                      {settings.style && (
                        <div>
                          <span className="text-muted-foreground">스타일:</span>{" "}
                          <span className="font-medium">
                            {settings.style}
                          </span>
                        </div>
                      )}
                      {settings.expression && (
                        <div>
                          <span className="text-muted-foreground">표정:</span>{" "}
                          <span className="font-medium">
                            {settings.expression}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* 생성된 스크립트 */}
      {project.scenes && project.scenes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>생성된 스크립트</CardTitle>
            <CardDescription>
              AI가 생성한 {project.scenes.length}개 씬의 발표 대본
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {project.scenes.map((scene) => {
                const isEditing = editingSceneId === scene.id;

                return (
                  <div
                    key={scene.id}
                    className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-semibold">
                          {scene.sceneNumber}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          씬 {scene.sceneNumber} ({scene.duration}초)
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <span
                          className={`text-xs px-2 py-1 rounded-full ${
                            scene.ttsStatus === "completed"
                              ? "bg-green-100 text-green-800"
                              : scene.ttsStatus === "processing"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          TTS: {scene.ttsStatus === "completed" ? "완료" : scene.ttsStatus === "processing" ? "진행중" : "대기"}
                        </span>
                        <span
                          className={`text-xs px-2 py-1 rounded-full ${
                            scene.avatarStatus === "completed"
                              ? "bg-green-100 text-green-800"
                              : scene.avatarStatus === "processing"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          아바타: {scene.avatarStatus === "completed" ? "완료" : scene.avatarStatus === "processing" ? "진행중" : "대기"}
                        </span>
                        <span
                          className={`text-xs px-2 py-1 rounded-full ${
                            (scene.backgroundAnalysis as { priority?: string })?.priority === "high"
                              ? "bg-purple-100 text-purple-800"
                              : (scene.backgroundAnalysis as { priority?: string })?.priority === "medium"
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          배경: {(scene.backgroundAnalysis as { priority?: string })?.priority === "high" ? "High" : (scene.backgroundAnalysis as { priority?: string })?.priority === "medium" ? "Medium" : "Low"}
                        </span>
                        {!isEditing && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleStartEdit(scene)}
                            className="h-6 px-2"
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {isEditing ? (
                      <div className="space-y-3">
                        <div>
                          <Label htmlFor="edit-script" className="text-xs text-muted-foreground mb-1">
                            스크립트
                          </Label>
                          <Textarea
                            id="edit-script"
                            value={editedScript}
                            onChange={(e) => setEditedScript(e.target.value)}
                            className="min-h-[100px] text-sm"
                            placeholder="스크립트를 입력하세요..."
                          />
                        </div>
                        <div>
                          <Label htmlFor="edit-visual" className="text-xs text-muted-foreground mb-1">
                            배경 설명
                          </Label>
                          <Textarea
                            id="edit-visual"
                            value={editedVisualDescription}
                            onChange={(e) => setEditedVisualDescription(e.target.value)}
                            className="min-h-[60px] text-sm"
                            placeholder="배경 설명을 입력하세요..."
                          />
                        </div>
                        <div>
                          <Label htmlFor="edit-priority" className="text-xs text-muted-foreground mb-1">
                            배경 우선순위
                          </Label>
                          <Select
                            value={editedBackgroundPriority}
                            onValueChange={(value: "low" | "medium" | "high") => setEditedBackgroundPriority(value)}
                          >
                            <SelectTrigger id="edit-priority" className="text-sm">
                              <SelectValue placeholder="우선순위 선택" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="low">Low (그라데이션)</SelectItem>
                              <SelectItem value="medium">Medium (이미지)</SelectItem>
                              <SelectItem value="high">High (영상)</SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground mt-1">
                            Low: FFmpeg 그라데이션 | Medium: Nano Banana 이미지 | High: Veo 3.1 영상
                          </p>
                        </div>
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleCancelEdit}
                            disabled={saving}
                          >
                            <X className="h-4 w-4 mr-1" />
                            취소
                          </Button>
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handleSaveEdit(scene.id)}
                            disabled={saving}
                          >
                            <Save className="h-4 w-4 mr-1" />
                            {saving ? "저장 중..." : "저장"}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm leading-relaxed">{scene.script}</p>

                        {/* 프롬프트 표시 */}
                        <div className="mt-4 space-y-3">
                          {scene.imagePrompt && (
                            <div>
                              <h4 className="font-medium text-xs text-muted-foreground mb-1.5">
                                이미지 프롬프트 (Nano Banana)
                              </h4>
                              <p className="text-xs text-gray-600 font-mono bg-gray-50 p-2 rounded border border-gray-200">
                                {scene.imagePrompt}
                              </p>
                            </div>
                          )}

                          {scene.videoPrompt && (
                            <div>
                              <h4 className="font-medium text-xs text-muted-foreground mb-1.5">
                                영상 프롬프트 (Veo 3.1)
                              </h4>
                              <p className="text-xs text-gray-600 font-mono bg-gray-50 p-2 rounded border border-gray-200">
                                {scene.videoPrompt}
                              </p>
                            </div>
                          )}

                          {scene.visualDescription && (
                            <div>
                              <h4 className="font-medium text-xs text-muted-foreground mb-1.5">
                                배경 설명 (하위 호환성)
                              </h4>
                              <p className="text-xs text-gray-500 font-mono bg-gray-50 p-2 rounded border border-gray-200">
                                {scene.visualDescription}
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Asset 미리보기/재생 */}
                        {scene.assets && scene.assets.length > 0 && (
                          <div className="mt-4 space-y-3 border-t pt-4">
                            <h4 className="font-medium text-sm text-muted-foreground">
                              생성된 자산
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {/* 배경 영상 */}
                              {(() => {
                                const bgVideoAsset = scene.assets.find((a) => a.kind === "background_video");
                                if (!bgVideoAsset) return null;

                                return (
                                  <div className="border rounded-lg p-3 bg-muted/30">
                                    <div className="flex items-center gap-2 mb-2">
                                      <Film className="h-4 w-4 text-orange-600" />
                                      <span className="text-xs font-medium">배경 영상</span>
                                    </div>
                                    <video
                                      controls
                                      className="w-full rounded border border-border"
                                      src={bgVideoAsset.url}
                                    >
                                      브라우저가 비디오를 지원하지 않습니다.
                                    </video>
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 씬 진행 상황 */}
      <SceneProgress projectId={projectId} />
    </div>
  );
}
