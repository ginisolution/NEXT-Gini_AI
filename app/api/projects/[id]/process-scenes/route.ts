import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { check, NAMESPACES, RELATIONS } from "@/lib/permissions";
import { inngest } from "@/lib/inngest/client";
import { NextResponse } from "next/server";

type Params = Promise<{ id: string }>;

/**
 * POST /api/projects/[id]/process-scenes
 * 씬 처리 시작 (TTS → 아바타 → 배경)
 */
export async function POST(request: Request, { params }: { params: Params }) {
  const session = await auth();
  const { id } = await params;

  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    // 권한 확인 (editor 이상)
    const canEdit = await check(
      session.user.id,
      NAMESPACES.PROJECT,
      id,
      RELATIONS.EDITOR
    );

    if (!canEdit) {
      return new Response("Forbidden", { status: 403 });
    }

    // 프로젝트 상태 확인
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        scenes: {
          orderBy: { position: "asc" },
        },
      },
    });

    if (!project) {
      return new Response("Not Found", { status: 404 });
    }

    if (project.scenes.length === 0) {
      return NextResponse.json(
        { error: "씬이 없습니다. 먼저 스크립트를 생성해주세요." },
        { status: 400 }
      );
    }

    // 커스텀 아바타 모드면 아바타 디자인 생성 이벤트 먼저 전송
    if (project.avatarDesignMode === "custom" && project.avatarDesignStatus !== "completed") {
      await inngest.send({
        name: "avatar-design/generation.requested",
        data: {
          projectId: id,
        },
      });
    }

    // Inngest 이벤트 전송: 첫 번째 씬 처리 시작
    await inngest.send({
      name: "scene/process.requested",
      data: {
        projectId: id,
        sceneId: project.scenes[0].id,
        userId: session.user.id,
      },
    });

    return NextResponse.json({
      message: "씬 처리가 시작되었습니다",
      projectId: id,
      scenesCount: project.scenes.length,
    });
  } catch (error) {
    console.error("Failed to start scene processing:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
