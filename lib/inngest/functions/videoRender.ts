import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import { uploadFromBuffer } from "@/lib/supabase/storage";

interface SceneData {
  sceneNumber: number;
  duration: number;
  audioUrl: string;
  avatarUrl: string;
  backgroundUrl: string;
  backgroundType: string;
}

export const videoRender = inngest.createFunction(
  { id: "video-render" },
  { event: "video/render.requested" },
  async ({ event, step }) => {
    const { projectId, sceneData } = event.data as {
      projectId: string;
      sceneData: SceneData[];
    };

    // NOTE: 실제 FFmpeg 처리는 AWS Lambda나 별도 서비스에서 수행
    // 여기서는 플레이스홀더 구현

    // 1. 씬별 비디오 다운로드 및 FFmpeg 준비 (실제 구현 필요)
    await step.run("download-scene-assets", async () => {
      // TODO: Supabase Storage에서 모든 자산 다운로드
      // - 각 씬의 오디오, 아바타, 배경 다운로드
      // - 로컬 임시 디렉토리에 저장
      return { downloaded: true };
    });

    // 2. FFmpeg 명령 실행 (실제 구현 필요)
    const finalVideoBuffer = await step.run("execute-ffmpeg", async () => {
      // TODO: FFmpeg 비디오 합성
      // 1. 씬별로 배경 + 아바타 합성
      // 2. 오디오 믹싱
      // 3. 씬 연결 (concat)
      // 4. 최종 인코딩

      // 플레이스홀더: 빈 버퍼 반환
      throw new Error(
        "FFmpeg video rendering not implemented - requires AWS Lambda or external service"
      );

      // return Buffer.from("");
    });

    // 3. 최종 비디오 업로드
    const videoUrl = await step.run("upload-final-video", async () => {
      const fileName = `final_video.mp4`;
      const storagePath = `projects/${projectId}/final/${fileName}`;

      const { url } = await uploadFromBuffer(finalVideoBuffer, storagePath, "video/mp4");
      return url;
    });

    // 4. Asset 생성
    const asset = await step.run("create-final-video-asset", async () => {
      return await prisma.asset.create({
        data: {
          projectId,
          kind: "final_video",
          type: "final_video",
          url: videoUrl,
          storagePath: `projects/${projectId}/final/final_video.mp4`,
          metadata: {
            sceneCount: sceneData.length,
            totalDuration: sceneData.reduce((sum, s) => sum + s.duration, 0),
            renderedAt: new Date().toISOString(),
          },
        },
      });
    });

    // 5. 프로젝트 상태 업데이트 (rendered)
    await step.run("update-project-status-rendered", async () => {
      await prisma.project.update({
        where: { id: projectId },
        data: {
          status: "rendered",
          finalVideoAssetId: asset.id,
        },
      });
    });

    return {
      success: true,
      projectId,
      assetId: asset.id,
      videoUrl,
    };
  }
);
