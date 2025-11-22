"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";

interface SceneProgressProps {
  projectId: string;
}

interface Asset {
  id: string;
  kind: string;
  type: string;
  url: string;
}

interface SceneStatus {
  id: string;
  sceneNumber: number;
  script: string;
  ttsStatus: string;
  avatarStatus: string;
  backgroundStatus: string;
  audioAsset?: Asset | null;
  avatarAsset?: Asset | null;
  backgroundAsset?: Asset | null;
}

export function SceneProgress({ projectId }: SceneProgressProps) {
  const [scenes, setScenes] = useState<SceneStatus[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    // 초기 씬 목록 로드 (API 호출로 Asset 포함)
    const loadScenes = async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}/scenes`);
        if (response.ok) {
          const { scenes: scenesData } = await response.json();
          setScenes(scenesData);
        }
      } catch (error) {
        console.error("Failed to load scenes:", error);
      }
    };

    loadScenes();

    // Realtime 구독 - Scene 업데이트
    const channel = supabase
      .channel(`scenes:${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "Scene",
          filter: `projectId=eq.${projectId}`,
        },
        (payload) => {
          console.log("Scene update:", payload);

          if (payload.eventType === "UPDATE") {
            setScenes((prev) =>
              prev.map((scene) =>
                scene.id === payload.new.id
                  ? { ...scene, ...payload.new }
                  : scene
              )
            );
          } else if (payload.eventType === "INSERT") {
            // 새 씬 추가
            setScenes((prev) => [...prev, payload.new as SceneStatus]);
          }
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setIsConnected(true);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId]);

  const getStatusIcon = (status: string) => {
    if (status === "completed") {
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    }
    if (status === "generating") {
      return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
    }
    if (status === "failed") {
      return <Circle className="h-4 w-4 text-red-500" />;
    }
    return <Circle className="h-4 w-4 text-gray-300" />;
  };

  const getStatusBadge = (status: string, type: "tts" | "avatar" | "background") => {
    // 타입별로 더 상세한 상태 메시지 표시
    const detailedLabels: Record<string, Record<string, string>> = {
      tts: {
        pending: "대기 중",
        processing: "음성 생성 중...",
        completed: "완료",
        failed: "실패",
      },
      avatar: {
        pending: "대기 중",
        processing: "아바타 렌더링 중...",
        polling: "영상 처리 중...",
        completed: "완료",
        failed: "실패",
      },
      background: {
        pending: "대기 중",
        processing: "이미지 생성 중...",
        generating: "Veo 영상 생성 중...",
        polling: "영상 폴링 중...",
        completed: "완료",
        failed: "실패",
      },
    };

    const variantMap: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      pending: "outline",
      processing: "default",
      generating: "default",
      polling: "default",
      completed: "secondary",
      failed: "destructive",
    };

    const label = detailedLabels[type][status] || status;
    const variant = variantMap[status] || "outline";

    return <Badge variant={variant} className="text-xs">{label}</Badge>;
  };

  if (!isConnected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>씬 진행 상황</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            연결 중...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (scenes.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>씬 진행 상황</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            아직 생성된 씬이 없습니다
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span>씬 진행 상황</span>
          <Badge variant="outline">{scenes.length}개</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {scenes.map((scene) => (
            <div
              key={scene.id}
              className="border rounded-lg p-3 space-y-2 hover:border-primary/50 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h4 className="font-medium text-sm">
                    씬 {scene.sceneNumber}
                  </h4>
                  <p className="text-xs text-muted-foreground line-clamp-1 mt-1">
                    {scene.script}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    {getStatusIcon(scene.ttsStatus)}
                    <span>TTS</span>
                  </div>
                  {getStatusBadge(scene.ttsStatus, "tts")}
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    {getStatusIcon(scene.avatarStatus)}
                    <span>아바타</span>
                  </div>
                  {getStatusBadge(scene.avatarStatus, "avatar")}
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    {getStatusIcon(scene.backgroundStatus)}
                    <span>배경</span>
                  </div>
                  {getStatusBadge(scene.backgroundStatus, "background")}
                </div>
              </div>

              {/* 완료된 자산 미리보기 */}
              {(scene.audioAsset || scene.avatarAsset || scene.backgroundAsset) && (
                <div className="mt-3 pt-3 border-t space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">완료된 결과물</p>
                  <div className="grid grid-cols-3 gap-2">
                    {/* TTS 오디오 */}
                    {scene.audioAsset && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">오디오</p>
                        <audio
                          controls
                          className="w-full h-8"
                          src={scene.audioAsset.url}
                        />
                      </div>
                    )}

                    {/* 아바타 영상 */}
                    {scene.avatarAsset && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">아바타</p>
                        <video
                          controls
                          className="w-full h-20 rounded object-cover bg-black"
                          src={scene.avatarAsset.url}
                        />
                      </div>
                    )}

                    {/* 배경 이미지/영상 */}
                    {scene.backgroundAsset && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">배경</p>
                        {scene.backgroundAsset.type === "background_video" ? (
                          <video
                            controls
                            className="w-full h-20 rounded object-cover bg-black"
                            src={scene.backgroundAsset.url}
                          />
                        ) : (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              alt="배경 이미지"
                              className="w-full h-20 rounded object-cover"
                              src={scene.backgroundAsset.url}
                            />
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
