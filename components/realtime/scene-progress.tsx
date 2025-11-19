"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";

interface SceneProgressProps {
  projectId: string;
}

interface SceneStatus {
  id: string;
  sceneNumber: number;
  text: string;
  ttsStatus: string;
  avatarStatus: string;
  backgroundStatus: string;
}

export function SceneProgress({ projectId }: SceneProgressProps) {
  const [scenes, setScenes] = useState<SceneStatus[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    // 초기 씬 목록 로드
    const loadScenes = async () => {
      const { data, error } = await supabase
        .from("Scene")
        .select("id, sceneNumber, text, ttsStatus, avatarStatus, backgroundStatus")
        .eq("projectId", projectId)
        .order("sceneNumber", { ascending: true });

      if (!error && data) {
        setScenes(data);
      }
    };

    loadScenes();

    // Realtime 구독
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

  const getStatusBadge = (status: string) => {
    const config: Record<
      string,
      { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
    > = {
      pending: { label: "대기", variant: "outline" },
      generating: { label: "진행 중", variant: "default" },
      completed: { label: "완료", variant: "secondary" },
      failed: { label: "실패", variant: "destructive" },
    };

    const { label, variant } = config[status] || config.pending;
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
                    {scene.text}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    {getStatusIcon(scene.ttsStatus)}
                    <span>TTS</span>
                  </div>
                  {getStatusBadge(scene.ttsStatus)}
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    {getStatusIcon(scene.avatarStatus)}
                    <span>아바타</span>
                  </div>
                  {getStatusBadge(scene.avatarStatus)}
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    {getStatusIcon(scene.backgroundStatus)}
                    <span>배경</span>
                  </div>
                  {getStatusBadge(scene.backgroundStatus)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
