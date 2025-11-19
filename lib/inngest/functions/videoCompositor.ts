import { inngest } from "../client";
import { prisma } from "@/lib/prisma";

export const videoCompositor = inngest.createFunction(
  { id: "video-compositor" },
  { event: "video/composition.requested" },
  async ({ event, step }) => {
    const { projectId } = event.data;

    // 1. 프로젝트 및 모든 씬 조회
    const project = await step.run("fetch-project-scenes", async () => {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          scenes: {
            orderBy: { sceneNumber: "asc" },
            include: {
              audioAsset: true,
              avatarAsset: true,
              backgroundAsset: true,
            },
          },
        },
      });

      if (!project) {
        throw new Error(`Project ${projectId} not found`);
      }

      return project;
    });

    // 2. 모든 씬이 준비되었는지 확인
    await step.run("validate-scenes-ready", async () => {
      const incompleteScenes = project.scenes.filter(
        (scene) =>
          scene.ttsStatus !== "completed" ||
          scene.avatarStatus !== "completed" ||
          scene.backgroundStatus !== "completed"
      );

      if (incompleteScenes.length > 0) {
        throw new Error(
          `${incompleteScenes.length} scenes are not ready for composition`
        );
      }

      if (project.scenes.length === 0) {
        throw new Error("No scenes found for composition");
      }
    });

    // 3. 프로젝트 상태 업데이트 (rendering)
    await step.run("update-project-status-rendering", async () => {
      await prisma.project.update({
        where: { id: projectId },
        data: { status: "rendering" },
      });
    });

    // 4. 씬 데이터 준비
    const sceneData = await step.run("prepare-scene-data", async () => {
      return project.scenes.map((scene) => ({
        sceneNumber: scene.sceneNumber,
        duration: scene.duration,
        audioUrl: scene.audioAsset?.url || "",
        avatarUrl: scene.avatarAsset?.url || "",
        backgroundUrl: scene.backgroundAsset?.url || "",
        backgroundType: scene.backgroundAsset?.kind || "background_image",
      }));
    });

    // 5. 실제 비디오 합성은 AWS Lambda나 별도 서비스에서 처리
    // 여기서는 메타데이터만 준비하고 실제 FFmpeg 처리는 외부 서비스로 위임
    // (또는 Next.js에서 직접 처리할 경우 별도 구현 필요)

    // 임시: 메타데이터 저장
    await step.run("save-composition-metadata", async () => {
      await prisma.project.update({
        where: { id: projectId },
        data: {
          metadata: {
            compositionData: {
              scenes: sceneData,
              totalDuration: project.scenes.reduce(
                (sum, scene) => sum + scene.duration,
                0
              ),
              preparedAt: new Date().toISOString(),
            },
          },
        },
      });
    });

    // 6. 비디오 렌더링 트리거 (실제 FFmpeg 처리)
    await step.sendEvent("trigger-video-render", {
      name: "video/render.requested",
      data: {
        projectId,
        sceneData,
      },
    });

    return {
      success: true,
      projectId,
      sceneCount: sceneData.length,
    };
  }
);
