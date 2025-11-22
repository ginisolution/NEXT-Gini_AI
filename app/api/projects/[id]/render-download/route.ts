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

    // scenes_processed 또는 rendered 상태만 렌더링 가능
    if (project.status !== "scenes_processed" && project.status !== "rendered") {
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

    // 6. 씬별 자산 다운로드 및 합성
    console.log(`[Render] Starting composition for ${project.scenes.length} scenes`);

    const composedScenePaths: string[] = [];

    for (const scene of project.scenes) {
      console.log(`[Render] Processing scene ${scene.sceneNumber}...`);

      // 6-1. 씬별 자산 조회
      const assets = await prisma.asset.findMany({
        where: {
          projectId,
          metadata: {
            path: ["sceneNumber"],
            equals: scene.sceneNumber,
          },
        },
      });

      const audioAsset = assets.find((a) => a.kind === "audio");
      const avatarAsset = assets.find((a) => a.kind === "avatar_video");
      // background_video를 우선 선택, 없으면 background_image 사용
      const backgroundAsset =
        assets.find((a) => a.kind === "background_video") ||
        assets.find((a) => a.kind === "background_image");

      if (!audioAsset || !avatarAsset || !backgroundAsset) {
        throw new Error(
          `Missing assets for scene ${scene.sceneNumber}. ` +
            `Audio: ${!!audioAsset}, Avatar: ${!!avatarAsset}, Background: ${!!backgroundAsset}`
        );
      }

      // 6-2. 배경 다운로드
      const backgroundExt =
        backgroundAsset.kind === "background_video" ? ".mp4" : ".png";
      const backgroundPath = path.join(
        tempDir,
        `bg_${scene.sceneNumber}${backgroundExt}`
      );

      const bgBlob = await downloadFile(backgroundAsset.storagePath);
      const bgBuffer = Buffer.from(await bgBlob.arrayBuffer());
      await fs.writeFile(backgroundPath, bgBuffer);

      // 6-3. 아바타 비디오 다운로드
      const avatarPath = path.join(tempDir, `avatar_${scene.sceneNumber}.mp4`);

      const avatarBlob = await downloadFile(avatarAsset.storagePath);
      const avatarBuffer = Buffer.from(await avatarBlob.arrayBuffer());
      await fs.writeFile(avatarPath, avatarBuffer);

      // 6-4. FFmpeg로 배경 + 아바타 합성
      const composedPath = path.join(tempDir, `composed_${scene.sceneNumber}.mp4`);

      const command = ffmpeg.buildCompositionCommand(
        backgroundPath,
        avatarPath,
        composedPath
      );

      await ffmpeg.executeCommand(
        command,
        `Scene ${scene.sceneNumber} composition`
      );

      composedScenePaths.push(composedPath);

      console.log(`[Render] Scene ${scene.sceneNumber} composed successfully`);
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
    // RFC 5987: 한글 파일명 지원
    const fileName = `${project.title || "video"}.mp4`;
    const encodedFileName = encodeURIComponent(fileName);

    return new NextResponse(videoBuffer, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="video.mp4"; filename*=UTF-8''${encodedFileName}`,
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
