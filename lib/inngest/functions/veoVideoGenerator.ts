import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import { generateVeoVideo } from "@/lib/services/gemini";

export const veoVideoGenerator = inngest.createFunction(
  { id: "veo-video-generator", retries: 2, concurrency: [{ limit: 2 }] },
  { event: "veo/generation.requested" },
  async ({ event, step }) => {
    const { sceneId, imageAssetId, imageUrl } = event.data;

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

    const analysis = scene.backgroundAnalysis as {
      visualDescription?: string;
      emotion?: string;
    };

    // 2. Veo 영상 생성 시작
    const operation = await step.run("start-veo-generation", async () => {
      const prompt =
        analysis?.visualDescription ||
        `Professional presentation background with ${analysis?.emotion || "neutral"} atmosphere`;

      return await generateVeoVideo(imageUrl, prompt);
    });

    // 3. RenderJob 생성 (Veo LRO 추적)
    await step.run("create-veo-render-job", async () => {
      await prisma.renderJob.create({
        data: {
          sceneId: scene.id,
          projectId: scene.projectId,
          externalId: operation.name,
          provider: "veo",
          status: "processing",
          metadata: {
            operationName: operation.name,
            imageAssetId,
            imageUrl,
            startedAt: new Date().toISOString(),
          },
        },
      });
    });

    // 4. 폴링 시작 (Veo LRO 상태 확인)
    await step.sendEvent("start-veo-polling", {
      name: "veo/polling.requested",
      data: {
        sceneId: scene.id,
        operationName: operation.name,
        maxAttempts: 120, // 5초 간격 × 120회 = 600초 (10분)
      },
    });

    return {
      success: true,
      sceneId,
      operationName: operation.name,
    };
  }
);
