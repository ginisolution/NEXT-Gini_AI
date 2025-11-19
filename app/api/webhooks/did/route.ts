import { prisma } from "@/lib/prisma";
import { inngest } from "@/lib/inngest/client";
import { NextResponse } from "next/server";
import crypto from "crypto";

/**
 * POST /api/webhooks/did
 * D-ID 웹훅 수신
 *
 * D-ID에서 아바타 영상 생성 완료 시 호출됨
 */
export async function POST(request: Request) {
  try {
    // 웹훅 보안 토큰 검증
    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    const expectedToken = process.env.WEBHOOK_SHARED_TOKEN;

    if (!token || token !== expectedToken) {
      console.error("Invalid webhook token");
      return new Response("Unauthorized", { status: 401 });
    }

    const body = await request.json();
    const { id: didTalkId, status, result_url, error } = body;

    console.log("D-ID webhook received:", {
      didTalkId,
      status,
      hasResultUrl: !!result_url,
      hasError: !!error,
    });

    // RenderJob 조회 (traceId = D-ID Talk ID)
    const renderJob = await prisma.renderJob.findUnique({
      where: { traceId: didTalkId },
      include: {
        project: {
          include: {
            scenes: true,
          },
        },
      },
    });

    if (!renderJob) {
      console.error("RenderJob not found for D-ID Talk ID:", didTalkId);
      return NextResponse.json(
        { error: "RenderJob not found" },
        { status: 404 }
      );
    }

    // 상태 업데이트
    if (status === "done") {
      // 성공
      await prisma.renderJob.update({
        where: { id: renderJob.id },
        data: {
          status: "completed",
          params: {
            ...(renderJob.params as object),
            resultUrl: result_url,
          },
          completedAt: new Date(),
        },
      });

      // Scene 상태 업데이트 (avatarStatus)
      const params = renderJob.params as { sceneId?: string } | null;
      const sceneId = params?.sceneId;
      if (sceneId) {
        await prisma.scene.update({
          where: { id: sceneId },
          data: {
            avatarStatus: "completed",
          },
        });

        // Asset 생성 (avatar_video)
        await prisma.asset.create({
          data: {
            projectId: renderJob.projectId,
            sceneId,
            kind: "avatar_video",
            type: "avatar_video",
            url: result_url,
            storageProvider: "supabase",
            storageBucket: "assets",
            storagePath: `projects/${renderJob.projectId}/scenes/${sceneId}/avatar.mp4`,
            metadata: {
              didTalkId,
              durationSeconds: body.duration || null,
            },
          },
        });

        // Inngest 이벤트 전송: 아바타 완료
        await inngest.send({
          name: "avatar/completed",
          data: {
            sceneId,
            projectId: renderJob.projectId,
            resultUrl: result_url,
          },
        });
      }
    } else if (status === "error" || status === "rejected") {
      // 실패
      await prisma.renderJob.update({
        where: { id: renderJob.id },
        data: {
          status: "failed",
          errorMessage: error?.description || "D-ID processing failed",
        },
      });

      // Scene 상태 업데이트
      const failParams = renderJob.params as { sceneId?: string } | null;
      const sceneId = failParams?.sceneId;
      if (sceneId) {
        await prisma.scene.update({
          where: { id: sceneId },
          data: {
            avatarStatus: "failed",
          },
        });

        // Inngest 이벤트 전송: 아바타 실패
        await inngest.send({
          name: "avatar/failed",
          data: {
            sceneId,
            projectId: renderJob.projectId,
            error: error?.description || "D-ID processing failed",
          },
        });
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Failed to process D-ID webhook:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
