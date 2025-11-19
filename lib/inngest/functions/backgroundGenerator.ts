import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import { generateBackgroundImage } from "@/lib/services/gemini";
import { uploadFromBuffer } from "@/lib/supabase/storage";

export const backgroundGenerator = inngest.createFunction(
  { id: "background-generator", retries: 2, concurrency: [{ limit: 3 }] },
  { event: "background/generation.requested" },
  async ({ event, step }) => {
    const { sceneId } = event.data;

    // 1. 씬 조회
    const scene = await step.run("fetch-scene", async () => {
      const scene = await prisma.scene.findUnique({
        where: { id: sceneId },
      });

      if (!scene) {
        throw new Error(`Scene ${sceneId} not found`);
      }

      return scene;
    });

    // 2. 배경 상태 업데이트 (generating)
    await step.run("update-background-status-generating", async () => {
      await prisma.scene.update({
        where: { id: sceneId },
        data: { backgroundStatus: "generating" },
      });
    });

    const analysis = scene.backgroundAnalysis as {
      priority: "high" | "medium" | "low";
      emotion?: string;
      visualDescription?: string;
    };

    const priority = analysis?.priority || "low";

    if (priority === "low") {
      // Low priority: FFmpeg 그라데이션 (클라이언트 처리 또는 간단한 이미지)
      await step.run("create-gradient-background", async () => {
        // 간단한 그라데이션 메타데이터만 저장
        await prisma.scene.update({
          where: { id: sceneId },
          data: {
            backgroundStatus: "completed",
            metadata: {
              backgroundType: "gradient",
              priority: "low",
            },
          },
        });
      });

      return {
        success: true,
        sceneId,
        backgroundType: "gradient",
      };
    }

    // Medium/High priority: Nano Banana 이미지 생성
    const description =
      analysis?.visualDescription ||
      `A professional presentation background with ${analysis?.emotion || "neutral"} atmosphere`;

    const imageBuffer = await step.run("generate-nano-image", async () => {
      return await generateBackgroundImage(description);
    });

    // 4. Supabase Storage에 업로드
    const imageUrl = await step.run("upload-background-image", async () => {
      const fileName = `scene_${scene.sceneNumber}_background.png`;
      const storagePath = `projects/${scene.projectId}/backgrounds/${fileName}`;

      // API 응답이 JSON 직렬화된 Buffer일 수 있으므로 변환
      const buffer = Buffer.isBuffer(imageBuffer)
        ? imageBuffer
        : Buffer.from(imageBuffer as unknown as ArrayBuffer);

      const { url } = await uploadFromBuffer(buffer, storagePath, "image/png");
      return url;
    });

    // 5. Asset 생성
    const asset = await step.run("create-background-asset", async () => {
      return await prisma.asset.create({
        data: {
          projectId: scene.projectId,
          kind: "background_image",
          type: "background_image",
          url: imageUrl,
          storagePath: `projects/${scene.projectId}/backgrounds/scene_${scene.sceneNumber}_background.png`,
          metadata: {
            sceneId: scene.id,
            sceneNumber: scene.sceneNumber,
            priority,
            provider: "nano_banana",
            description,
            cost: 0.039,
          },
        },
      });
    });

    // 6. 씬의 backgroundAssetId 업데이트
    await step.run("update-scene-background-asset", async () => {
      await prisma.scene.update({
        where: { id: sceneId },
        data: {
          backgroundAssetId: asset.id,
          backgroundStatus: priority === "high" ? "generating" : "completed",
        },
      });
    });

    // 7. High priority: Veo 영상 생성 트리거
    if (priority === "high") {
      await step.sendEvent("trigger-veo-generation", {
        name: "veo/generation.requested",
        data: {
          sceneId: scene.id,
          imageAssetId: asset.id,
          imageUrl,
        },
      });
    }

    return {
      success: true,
      sceneId,
      assetId: asset.id,
      imageUrl,
      priority,
    };
  }
);
