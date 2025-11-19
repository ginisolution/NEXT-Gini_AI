import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import { createTalk } from "@/lib/services/did";

export const avatarGenerator = inngest.createFunction(
  { id: "avatar-generator", retries: 2, concurrency: [{ limit: 2 }] },
  { event: "avatar/generation.requested" },
  async ({ event, step }) => {
    const { sceneId } = event.data;

    // 1. 씬 및 관련 데이터 조회
    const data = await step.run("fetch-scene-data", async () => {
      const scene = await prisma.scene.findUnique({
        where: { id: sceneId },
        include: {
          project: {
            include: {
              assets: {
                where: {
                  kind: "avatar_design",
                },
                take: 1,
              },
            },
          },
          audioAsset: true,
        },
      });

      if (!scene) {
        throw new Error(`Scene ${sceneId} not found`);
      }

      if (!scene.audioAsset) {
        throw new Error(`Audio asset not found for scene ${sceneId}`);
      }

      return scene;
    });

    const scene = data;
    const audioUrl = scene.audioAsset?.url;

    if (!audioUrl) {
      throw new Error(`Audio URL not found for scene ${sceneId}`);
    }

    // 2. 아바타 이미지 URL 결정 (커스텀 또는 프리셋)
    const avatarImageUrl = await step.run("determine-avatar-url", async () => {
      if (
        scene.project.avatarDesignMode === "custom" &&
        scene.project.assets.length > 0
      ) {
        return scene.project.assets[0].url;
      }

      // 프리셋 아바타 URL (환경 변수 또는 기본값)
      return (
        process.env.DID_AVATAR_URL ||
        "https://create-images-results.d-id.com/default_presenter_image_url.webp"
      );
    });

    // 3. 아바타 상태 업데이트 (generating)
    await step.run("update-avatar-status-generating", async () => {
      await prisma.scene.update({
        where: { id: sceneId },
        data: { avatarStatus: "generating" },
      });
    });

    // 4. D-ID Talk 생성
    const talkId = await step.run("create-did-talk", async () => {
      const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/did`;
      return await createTalk(avatarImageUrl, audioUrl, webhookUrl);
    });

    // 5. RenderJob 생성 (D-ID 작업 추적)
    await step.run("create-render-job", async () => {
      await prisma.renderJob.create({
        data: {
          sceneId: scene.id,
          projectId: scene.projectId,
          externalId: talkId,
          provider: "did",
          status: "processing",
          metadata: {
            talkId: talkId,
            avatarUrl: avatarImageUrl,
            audioUrl: audioUrl,
          },
        },
      });
    });

    // 6. 폴링 시작 (D-ID 상태 확인)
    await step.sendEvent("start-avatar-polling", {
      name: "avatar/polling.requested",
      data: {
        sceneId: scene.id,
        talkId: talkId,
        maxAttempts: 20, // 5초 간격 × 20회 = 100초
      },
    });

    return {
      success: true,
      sceneId,
      talkId: talkId,
    };
  }
);
