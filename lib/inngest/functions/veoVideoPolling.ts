import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import { checkVeoOperation } from "@/lib/services/gemini";
import { uploadFromBuffer } from "@/lib/supabase/storage";

export const veoVideoPolling = inngest.createFunction(
  { id: "veo-video-polling" },
  { event: "veo/polling.requested" },
  async ({ event, step }) => {
    const { sceneId, operationName, maxAttempts = 120, currentAttempt = 1 } = event.data;

    // 5초 대기
    await step.sleep("wait-before-check", "5s");

    // Veo LRO 상태 확인
    const operationStatus = await step.run("check-veo-status", async () => {
      return await checkVeoOperation(operationName);
    });

    // RenderJob 업데이트
    await step.run("update-render-job", async () => {
      await prisma.renderJob.updateMany({
        where: {
          sceneId,
          externalId: operationName,
        },
        data: {
          status: operationStatus.done ? "completed" : "processing",
          metadata: {
            lastCheckedAt: new Date().toISOString(),
            attempt: currentAttempt,
          },
        },
      });
    });

    if (operationStatus.done && operationStatus.videoBuffer) {
      // 완료: 비디오 저장
      const scene = await step.run("fetch-scene", async () => {
        return await prisma.scene.findUnique({
          where: { id: sceneId },
        });
      });

      if (!scene) {
        throw new Error(`Scene ${sceneId} not found`);
      }

      // Supabase Storage에 배경 비디오 저장
      const videoUrl = await step.run("save-background-video", async () => {
        const fileName = `scene_${scene.sceneNumber}_background.mp4`;
        const storagePath = `projects/${scene.projectId}/backgrounds/${fileName}`;

        // API 응답이 JSON 직렬화된 Buffer일 수 있으므로 변환
        const videoBuffer = Buffer.isBuffer(operationStatus.videoBuffer)
          ? operationStatus.videoBuffer!
          : Buffer.from(operationStatus.videoBuffer! as unknown as ArrayBuffer);

        const { url } = await uploadFromBuffer(
          videoBuffer,
          storagePath,
          "video/mp4"
        );
        return url;
      });

      // Asset 생성
      const asset = await step.run("create-background-video-asset", async () => {
        return await prisma.asset.create({
          data: {
            projectId: scene.projectId,
            kind: "background_video",
            type: "background_video",
            url: videoUrl,
            storagePath: `projects/${scene.projectId}/backgrounds/scene_${scene.sceneNumber}_background.mp4`,
            metadata: {
              sceneId: scene.id,
              sceneNumber: scene.sceneNumber,
              provider: "veo",
              operationName,
              duration: scene.duration,
              cost: 1.5, // 예상 비용
            },
          },
        });
      });

      // 씬의 backgroundAssetId 업데이트 및 배경 상태 완료
      await step.run("update-scene-background-video-asset", async () => {
        await prisma.scene.update({
          where: { id: sceneId },
          data: {
            backgroundAssetId: asset.id,
            backgroundStatus: "completed",
          },
        });
      });

      return {
        success: true,
        sceneId,
        assetId: asset.id,
        videoUrl,
      };
    } else if (operationStatus.error) {
      // 실패
      await step.run("mark-background-failed", async () => {
        await prisma.scene.update({
          where: { id: sceneId },
          data: { backgroundStatus: "failed" },
        });
      });

      throw new Error(
        `Veo operation ${operationName} failed: ${operationStatus.error}`
      );
    } else if (currentAttempt < maxAttempts) {
      // 아직 처리 중: 재시도
      await step.sendEvent("retry-veo-polling", {
        name: "veo/polling.requested",
        data: {
          sceneId,
          operationName,
          maxAttempts,
          currentAttempt: currentAttempt + 1,
        },
      });

      return {
        success: false,
        sceneId,
        status: "polling",
        attempt: currentAttempt,
      };
    } else {
      // 최대 시도 횟수 초과
      await step.run("mark-background-timeout", async () => {
        await prisma.scene.update({
          where: { id: sceneId },
          data: { backgroundStatus: "failed" },
        });
      });

      throw new Error(
        `Veo operation ${operationName} timeout after ${maxAttempts} attempts`
      );
    }
  }
);
