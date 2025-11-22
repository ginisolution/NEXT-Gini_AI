import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { check, NAMESPACES, RELATIONS } from "@/lib/permissions";
import { downloadFile } from "@/lib/supabase/storage";
import { FFmpegService } from "@/lib/services/ffmpeg";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

type Params = Promise<{ id: string }>;

/**
 * 즉시 렌더링 + 다운로드 API
 *
 * POST /api/projects/{id}/render-download
 *
 * 워크플로우:
 * 1. 권한 체크 (viewer 이상)
 * 2. 씬별 자산 다운로드 (Supabase)
 * 3. FFmpeg concat 실행 (Vercel /tmp)
 * 4. 스트리밍 응답 (브라우저 자동 다운로드)
 * 5. 임시 파일 정리
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Params }
) {
  const { id: projectId } = await params;
  let tempDir: string | null = null;

  try {
    // 1. 인증 확인
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. 권한 확인 (viewer 이상)
    const canView = await check(
      session.user.id,
      NAMESPACES.PROJECT,
      projectId,
      RELATIONS.VIEWER
    );

    if (!canView) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 3. 프로젝트 조회
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        scenes: {
          orderBy: { sceneNumber: "asc" },
        },
      },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (project.status !== "scenes_processed") {
      return NextResponse.json(
        { error: "Scenes not processed yet. Current status: " + project.status },
        { status: 400 }
      );
    }

    // 4. FFmpeg 설치 확인
    const ffmpegAvailable = await FFmpegService.isFFmpegAvailable();
    if (!ffmpegAvailable) {
      return NextResponse.json(
        { error: "FFmpeg is not installed on the server" },
        { status: 500 }
      );
    }

    const ffmpeg = new FFmpegService();

    // 5. 임시 디렉토리 생성
    tempDir = path.join(os.tmpdir(), `render_${projectId}_${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    // 6. 씬별 합성 비디오 다운로드
    console.log(`[Render] Starting download for ${project.scenes.length} scenes`);

    const composedScenePaths: string[] = [];

    for (const scene of project.scenes) {
      // 씬별 합성 비디오 자산 조회
      const composedAsset = await prisma.asset.findFirst({
        where: {
          projectId,
          kind: "composed_scene",
          metadata: {
            path: ["sceneNumber"],
            equals: scene.sceneNumber,
          },
        },
      });

      if (!composedAsset) {
        throw new Error(
          `Composed video not found for scene ${scene.sceneNumber}`
        );
      }

      // Supabase에서 합성 비디오 다운로드
      const blob = await downloadFile(composedAsset.storagePath);
      const buffer = Buffer.from(await blob.arrayBuffer());

      // 로컬 임시 파일로 저장
      const localPath = path.join(tempDir, `scene_${scene.sceneNumber}.mp4`);
      await fs.writeFile(localPath, buffer);

      composedScenePaths.push(localPath);

      console.log(
        `[Render] Downloaded scene ${scene.sceneNumber} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`
      );
    }

    // 7. FFmpeg concat 실행
    console.log("[Render] Starting FFmpeg concatenation");

    const finalVideoPath = path.join(tempDir, "final_video.mp4");

    if (composedScenePaths.length === 1) {
      // 씬이 1개면 concat 불필요
      await fs.copyFile(composedScenePaths[0], finalVideoPath);
    } else {
      // concat 파일 생성
      const concatFilePath = path.join(tempDir, "concat.txt");
      await ffmpeg.createConcatFile(composedScenePaths, concatFilePath);

      // concat 명령 실행 (-c copy: 고품질 유지)
      const command = ffmpeg.buildConcatenationCommand(
        concatFilePath,
        finalVideoPath
      );

      await ffmpeg.executeCommand(command, "Scene concatenation");
    }

    console.log("[Render] FFmpeg concatenation completed");

    // 8. 최종 비디오 읽기
    const videoBuffer = await fs.readFile(finalVideoPath);
    const fileSizeMB = (videoBuffer.length / 1024 / 1024).toFixed(2);

    console.log(`[Render] Final video size: ${fileSizeMB} MB`);

    // 9. 프로젝트 상태 업데이트 (rendered)
    await prisma.project.update({
      where: { id: projectId },
      data: { status: "rendered" },
    });

    // 10. 스트리밍 응답 (다운로드)
    const fileName = `${project.title || "video"}.mp4`;

    return new NextResponse(videoBuffer, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": videoBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error("[Render] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to render video",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  } finally {
    // 11. 임시 파일 정리
    if (tempDir) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
        console.log("[Render] Temporary files cleaned up");
      } catch (error) {
        console.error("[Render] Failed to cleanup temp directory:", error);
      }
    }
  }
}
