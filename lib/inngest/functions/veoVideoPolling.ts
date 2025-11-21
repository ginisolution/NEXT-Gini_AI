import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import { checkVeoOperation } from "@/lib/services/gemini";
import { uploadFromBuffer } from "@/lib/supabase/storage";

export const veoVideoPolling = inngest.createFunction(
  { id: "veo-video-polling" },
  { event: "veo/polling.requested" },
  async ({ event, step }) => {
    const { sceneId, operationName, maxAttempts = 120, currentAttempt = 1 } = event.data;

    // 첫 번째 시도: 더 긴 대기 (operation 생성 전파 대기)
    // 이후 시도: 5초 대기
    const waitTime = currentAttempt === 1 ? "30s" : "5s";
    console.log(`⏳ Attempt ${currentAttempt}/${maxAttempts}: Waiting ${waitTime} before polling...`);
    await step.sleep("wait-before-check", waitTime);

    // Veo LRO 상태 확인 (실제 API 호출)
    console.log(`🔍 Checking Veo operation status: ${operationName}`);
    const result = await step.run("check-veo-operation", async () => {
      return await checkVeoOperation(operationName);
    });

    console.log(`📊 Veo operation status: done=${result.done}, error=${result.error || "none"}`);

    // 작업이 아직 진행 중인 경우
    if (!result.done) {
      if (currentAttempt >= maxAttempts) {
        console.error(`❌ Veo polling timeout after ${maxAttempts} attempts`);

        // RenderJob 실패 처리
        await step.run("mark-render-job-failed", async () => {
          await prisma.renderJob.updateMany({
            where: {
              sceneId,
              externalId: operationName,
            },
            data: {
              status: "failed",
              errorMessage: `Polling timeout after ${maxAttempts} attempts`,
            },
          });
        });

        // 씬 배경 상태 실패 처리
        await step.run("mark-scene-background-failed", async () => {
          await prisma.scene.update({
            where: { id: sceneId },
            data: { backgroundStatus: "failed" },
          });
        });

        throw new Error(`Veo polling timeout after ${maxAttempts} attempts`);
      }

      // 다음 폴링 트리거
      console.log(`⏭️  Triggering next polling attempt ${currentAttempt + 1}/${maxAttempts}`);
      await step.sendEvent("trigger-next-polling", {
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
        retry: true,
        currentAttempt,
        maxAttempts,
      };
    }

    // 에러가 발생한 경우
    if (result.error) {
      console.error(`❌ Veo operation failed: ${result.error}`);

      // RenderJob 실패 처리
      await step.run("mark-render-job-error", async () => {
        await prisma.renderJob.updateMany({
          where: {
            sceneId,
            externalId: operationName,
          },
          data: {
            status: "failed",
            errorMessage: result.error,
          },
        });
      });

      // 씬 배경 상태 실패 처리
      await step.run("mark-scene-background-error", async () => {
        await prisma.scene.update({
          where: { id: sceneId },
          data: { backgroundStatus: "failed" },
        });
      });

      throw new Error(`Veo operation failed: ${result.error}`);
    }

    // 성공한 경우 - videoBuffer를 Supabase Storage에 업로드
    if (!result.videoBuffer) {
      throw new Error("Veo operation succeeded but no video buffer returned");
    }

    // Buffer 타입 보장 (Inngest 직렬화 과정에서 plain object로 변환될 수 있음)
    const videoBuffer = Buffer.isBuffer(result.videoBuffer)
      ? result.videoBuffer
      : Buffer.from(result.videoBuffer as any);

    console.log(`✅ Veo video generation completed: ${videoBuffer.length} bytes`);

    // Scene 조회 (projectId, sceneNumber 필요)
    const scene = await step.run("fetch-scene", async () => {
      return await prisma.scene.findUnique({
        where: { id: sceneId },
      });
    });

    if (!scene) {
      throw new Error(`Scene ${sceneId} not found`);
    }

    // Supabase Storage에 업로드
    const { url: videoUrl, path: storagePath } = await step.run(
      "upload-video-to-storage",
      async () => {
        const fileName = `projects/${scene.projectId}/backgrounds/scene_${scene.sceneNumber}_background.mp4`;
        return await uploadFromBuffer(videoBuffer, fileName, "video/mp4");
      }
    );

    console.log(`📤 Uploaded to Supabase Storage: ${storagePath}`);

    // Asset 생성
    const asset = await step.run("create-background-video-asset", async () => {
      return await prisma.asset.create({
        data: {
          projectId: scene.projectId,
          sceneId,
          kind: "background_video",
          type: "video",
          url: videoUrl,
          storagePath,
          metadata: {
            sceneId: scene.id,
            sceneNumber: scene.sceneNumber,
            provider: "veo",
            model: "veo-3.0-fast-generate-001",
            operationName,
            duration: scene.duration,
            cost: 1.5, // 예상 비용 (~$1.5/영상)
            pollingAttempts: currentAttempt,
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

    // RenderJob 업데이트
    await step.run("update-render-job-completed", async () => {
      await prisma.renderJob.updateMany({
        where: {
          sceneId,
          externalId: operationName,
        },
        data: {
          status: "completed",
          metadata: {
            lastCheckedAt: new Date().toISOString(),
            attempt: currentAttempt,
            videoUrl,
            assetId: asset.id,
          },
        },
      });
    });

    // 배경 완료 이벤트 발송
    await step.sendEvent("background-completed-video", {
      name: "background/completed",
      data: {
        sceneId,
        projectId: scene.projectId,
        assetId: asset.id,
        videoUrl,
      },
    });

    console.log(`✅ Veo video polling completed successfully for scene ${sceneId}`);
    console.log(`   Asset ID: ${asset.id}`);
    console.log(`   Video URL: ${videoUrl}`);
    console.log(`   Polling attempts: ${currentAttempt}/${maxAttempts}`);

    return {
      success: true,
      sceneId,
      assetId: asset.id,
      videoUrl,
      pollingAttempts: currentAttempt,
    };
  }
);
