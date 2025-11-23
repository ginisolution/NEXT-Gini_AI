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
    const statusCheck = await step.run("check-veo-operation", async () => {
      const result = await checkVeoOperation(operationName);

      // ⚠️ IMPORTANT: videoBuffer는 Step Output 크기 제한(512KB)을 초과하므로 반환하지 않음
      // 대신 done, error 상태만 반환
      return {
        done: result.done,
        error: result.error,
        // videoBuffer는 제외 (대용량 데이터)
      };
    });

    console.log(`📊 Veo operation status: done=${statusCheck.done}, error=${statusCheck.error || "none"}`);

    // 작업이 아직 진행 중인 경우
    if (!statusCheck.done) {
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
    if (statusCheck.error) {
      console.error(`❌ Veo operation failed: ${statusCheck.error}`);

      // Responsible AI 정책 위반 에러 확인
      const isResponsibleAIError = statusCheck.error.includes("Responsible AI") ||
                                   statusCheck.error.includes("sensitive words") ||
                                   statusCheck.error.includes("violate") ||
                                   statusCheck.error.includes("58061214");

      let userFriendlyError = statusCheck.error;
      if (isResponsibleAIError) {
        userFriendlyError = "프롬프트가 Google Responsible AI 정책에 위배되어 차단되었습니다. Gemini가 생성한 프롬프트에서 민감한 단어가 감지되었습니다. 대본을 더 보수적으로 수정하거나 다시 시도해주세요.";
        console.error(`⚠️ Responsible AI policy violation detected`);
        console.error(`   This indicates the video prompt contains sensitive content`);
        console.error(`   Consider regenerating the script with more conservative language`);
      }

      // RenderJob 실패 처리
      await step.run("mark-render-job-error", async () => {
        await prisma.renderJob.updateMany({
          where: {
            sceneId,
            externalId: operationName,
          },
          data: {
            status: "failed",
            errorMessage: userFriendlyError,
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

      throw new Error(`Veo operation failed: ${userFriendlyError}`);
    }

    // 성공한 경우 - videoBuffer를 다시 가져와서 Supabase Storage에 업로드
    // ⚠️ checkVeoOperation을 다시 호출하여 videoBuffer 획득
    // (Step Output 크기 제한을 피하기 위해 분리)
    const uploadResult = await step.run("fetch-video-and-upload", async () => {
      // 1. Scene 조회 (projectId, sceneNumber 필요)
      const scene = await prisma.scene.findUnique({
        where: { id: sceneId },
      });

      if (!scene) {
        throw new Error(`Scene ${sceneId} not found`);
      }

      // 2. videoBuffer 다시 가져오기
      const fullResult = await checkVeoOperation(operationName);
      if (!fullResult.videoBuffer) {
        throw new Error("Veo operation succeeded but no video buffer returned");
      }

      // Buffer 타입 보장
      const videoBuffer = Buffer.isBuffer(fullResult.videoBuffer)
        ? fullResult.videoBuffer
        : Buffer.from(fullResult.videoBuffer as unknown as ArrayBuffer);

      console.log(`✅ Veo video fetched: ${videoBuffer.length} bytes`);

      // 3. Supabase Storage에 업로드
      const fileName = `projects/${scene.projectId}/backgrounds/scene_${scene.sceneNumber}_background.mp4`;
      const { url, path } = await uploadFromBuffer(videoBuffer, fileName, "video/mp4");

      console.log(`📤 Uploaded to Supabase Storage: ${path}`);

      return {
        videoUrl: url,
        storagePath: path,
        projectId: scene.projectId,
        sceneNumber: scene.sceneNumber,
      };
    });

    const { videoUrl, storagePath } = uploadResult;

    // Asset 생성
    const asset = await step.run("create-background-video-asset", async () => {
      return await prisma.asset.create({
        data: {
          projectId: uploadResult.projectId,
          sceneId,
          kind: "background_video",
          type: "video",
          url: videoUrl,
          storagePath,
          metadata: {
            sceneId,
            sceneNumber: uploadResult.sceneNumber,
            provider: "veo",
            model: "veo-3.0-fast-generate-001",
            operationName,
            duration: 8, // Veo 3.0 Fast 기본 길이
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
        projectId: uploadResult.projectId,
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
