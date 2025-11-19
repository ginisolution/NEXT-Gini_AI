"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";

interface ProjectStatusProps {
  projectId: string;
}

interface StatusUpdate {
  projectId: string;
  status: string;
  progress?: number;
  message?: string;
  timestamp: string;
}

export function ProjectStatus({ projectId }: ProjectStatusProps) {
  const [status, setStatus] = useState<StatusUpdate | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    // Realtime 채널 구독
    const channel = supabase
      .channel(`project:${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "Project",
          filter: `id=eq.${projectId}`,
        },
        (payload) => {
          console.log("Project update:", payload);
          setStatus({
            projectId,
            status: payload.new.status,
            message: `프로젝트 상태: ${getStatusLabel(payload.new.status)}`,
            timestamp: new Date().toISOString(),
          });
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setIsConnected(true);
          console.log("Subscribed to project updates");
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId]);

  const getStatusLabel = (status: string): string => {
    const labels: Record<string, string> = {
      draft: "초안",
      document_uploaded: "문서 업로드됨",
      script_generating: "대본 생성 중",
      script_generated: "대본 생성 완료",
      rendering: "렌더링 중",
      rendered: "렌더링 완료",
    };
    return labels[status] || status;
  };

  const getStatusIcon = (status: string) => {
    if (
      status === "script_generating" ||
      status === "rendering"
    ) {
      return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
    }
    if (status === "rendered") {
      return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    }
    if (status === "failed") {
      return <XCircle className="h-5 w-5 text-red-500" />;
    }
    return <Clock className="h-5 w-5 text-gray-400" />;
  };

  if (!isConnected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">실시간 업데이트</CardTitle>
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
          실시간 업데이트
        </CardTitle>
      </CardHeader>
      <CardContent>
        {status ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              {getStatusIcon(status.status)}
              <span className="text-sm font-medium">
                {status.message || getStatusLabel(status.status)}
              </span>
            </div>
            {status.progress !== undefined && (
              <div className="space-y-1">
                <Progress value={status.progress} className="h-2" />
                <p className="text-xs text-muted-foreground text-right">
                  {status.progress}%
                </p>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {new Date(status.timestamp).toLocaleTimeString("ko-KR")}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            업데이트 대기 중...
          </p>
        )}
      </CardContent>
    </Card>
  );
}
