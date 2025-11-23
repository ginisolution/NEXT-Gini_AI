import { inngest } from "../client";
import { prisma } from "@/lib/prisma";

export const videoCompositor = inngest.createFunction(
  { id: "video-compositor" },
  { event: "video/compose.requested" },
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

    // 3. 프로젝트 상태 업데이트 (scenes_processed)
    await step.run("update-project-status-scenes-processed", async () => {
      await prisma.project.update({
        where: { id: projectId },
        data: { status: "scenes_processed" },
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

    // 5. 메타데이터 저장
    // 실제 렌더링은 사용자가 프론트엔드에서 "비디오 렌더링 및 다운로드" 버튼을 클릭하면
    // /api/projects/[id]/render-download API를 통해 즉시 처리됨
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

    return {
      success: true,
      projectId,
      sceneCount: sceneData.length,
    };
  }
);
