import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import { getTalkStatus } from "@/lib/services/did";
import { uploadFromUrl } from "@/lib/supabase/storage";

export const avatarPolling = inngest.createFunction(
  { id: "avatar-polling" },
  { event: "avatar/polling.requested" },
  async ({ event, step }) => {
    const { sceneId, talkId, maxAttempts = 20, currentAttempt = 1 } = event.data;

    // 5초 대기
    await step.sleep("wait-before-check", "5s");

    // D-ID 상태 확인
    const talkStatus = await step.run("check-did-status", async () => {
      return await getTalkStatus(talkId);
    });

    // RenderJob 업데이트
    await step.run("update-render-job", async () => {
      await prisma.renderJob.updateMany({
        where: {
          sceneId,
          externalId: talkId,
        },
        data: {
          status: talkStatus.status === "done" ? "completed" : "processing",
          metadata: {
            lastCheckedAt: new Date().toISOString(),
            attempt: currentAttempt,
          },
        },
      });
    });

    if (talkStatus.status === "done" && talkStatus.resultUrl) {
      // 완료: 비디오 다운로드 및 저장
      const scene = await step.run("fetch-scene", async () => {
        return await prisma.scene.findUnique({
          where: { id: sceneId },
        });
      });

      if (!scene) {
        throw new Error(`Scene ${sceneId} not found`);
      }

      // Supabase Storage에 아바타 비디오 저장
      const videoUrl = await step.run("save-avatar-video", async () => {
        const fileName = `scene_${scene.sceneNumber}_avatar.mp4`;
        const storagePath = `projects/${scene.projectId}/avatars/${fileName}`;

        const { url } = await uploadFromUrl(talkStatus.resultUrl!, storagePath);
        return url;
      });

      // Asset 생성
      const asset = await step.run("create-avatar-asset", async () => {
        return await prisma.asset.create({
          data: {
            projectId: scene.projectId,
            kind: "avatar_video",
            type: "avatar_video",
            url: videoUrl,
            storagePath: `projects/${scene.projectId}/avatars/scene_${scene.sceneNumber}_avatar.mp4`,
            metadata: {
              sceneId: scene.id,
              sceneNumber: scene.sceneNumber,
              provider: "did",
              talkId,
              originalUrl: talkStatus.resultUrl,
            },
          },
        });
      });

      // 씬의 avatarAssetId 업데이트 및 아바타 상태 완료
      await step.run("update-scene-avatar-asset", async () => {
        await prisma.scene.update({
          where: { id: sceneId },
          data: {
            avatarAssetId: asset.id,
            avatarStatus: "completed",
          },
        });
      });

      return {
        success: true,
        sceneId,
        assetId: asset.id,
        videoUrl,
      };
    } else if (talkStatus.status === "error") {
      // 실패
      await step.run("mark-avatar-failed", async () => {
        await prisma.scene.update({
          where: { id: sceneId },
          data: { avatarStatus: "failed" },
        });
      });

      throw new Error(`D-ID Talk ${talkId} failed: ${talkStatus.error}`);
    } else if (currentAttempt < maxAttempts) {
      // 아직 처리 중: 재시도
      await step.sendEvent("retry-polling", {
        name: "avatar/polling.requested",
        data: {
          sceneId,
          talkId,
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
      await step.run("mark-avatar-timeout", async () => {
        await prisma.scene.update({
          where: { id: sceneId },
          data: { avatarStatus: "failed" },
        });
      });

      throw new Error(
        `D-ID Talk ${talkId} timeout after ${maxAttempts} attempts`
      );
    }
  }
);
