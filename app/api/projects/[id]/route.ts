import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { check, NAMESPACES, RELATIONS } from "@/lib/permissions";
import { NextResponse } from "next/server";
import { z } from "zod";

// Zod 스키마: 프로젝트 수정
const updateProjectSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  settings: z.record(z.any()).optional(),
});

type Params = Promise<{ id: string }>;

/**
 * GET /api/projects/[id]
 * 프로젝트 단일 조회
 */
export async function GET(request: Request, { params }: { params: Params }) {
  const session = await auth();
  const { id } = await params;

  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    // 권한 확인 (viewer 이상)
    const canView = await check(
      session.user.id,
      NAMESPACES.PROJECT,
      id,
      RELATIONS.VIEWER
    );

    if (!canView) {
      return new Response("Forbidden", { status: 403 });
    }

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        documents: {
          orderBy: { createdAt: "desc" },
        },
        scenes: {
          orderBy: { position: "asc" },
          include: {
            assets: {
              orderBy: { createdAt: "desc" },
            },
            audioAsset: true,
            avatarAsset: true,
            backgroundAsset: true,
          },
        },
        assets: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!project) {
      return new Response("Not Found", { status: 404 });
    }

    return NextResponse.json(project);
  } catch (error) {
    console.error("Failed to fetch project:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

/**
 * PATCH /api/projects/[id]
 * 프로젝트 수정
 */
export async function PATCH(request: Request, { params }: { params: Params }) {
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

    const body = await request.json();
    const validated = updateProjectSchema.parse(body);

    const project = await prisma.project.update({
      where: { id },
      data: validated,
    });

    return NextResponse.json(project);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.errors },
        { status: 400 }
      );
    }

    console.error("Failed to update project:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

/**
 * DELETE /api/projects/[id]
 * 프로젝트 삭제 (soft delete)
 */
export async function DELETE(request: Request, { params }: { params: Params }) {
  const session = await auth();
  const { id } = await params;

  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    // 권한 확인 (owner만 삭제 가능)
    const canDelete = await check(
      session.user.id,
      NAMESPACES.PROJECT,
      id,
      RELATIONS.OWNER
    );

    if (!canDelete) {
      return new Response("Forbidden", { status: 403 });
    }

    // Soft delete
    await prisma.project.update({
      where: { id },
      data: {
        deletedAt: new Date(),
      },
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Failed to delete project:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
