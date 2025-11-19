import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { check, NAMESPACES, RELATIONS } from "@/lib/permissions";
import { uploadFile } from "@/lib/supabase/storage";
import { inngest } from "@/lib/inngest/client";
import { NextResponse } from "next/server";

/**
 * POST /api/documents
 * 문서 업로드 및 처리 시작
 */
export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const projectId = formData.get("projectId") as string;

    if (!file || !projectId) {
      return NextResponse.json(
        { error: "Missing file or projectId" },
        { status: 400 }
      );
    }

    // 권한 확인 (editor 이상)
    const canEdit = await check(
      session.user.id,
      NAMESPACES.PROJECT,
      projectId,
      RELATIONS.EDITOR
    );

    if (!canEdit) {
      return new Response("Forbidden", { status: 403 });
    }

    // 파일 크기 제한 (10MB)
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File size exceeds 10MB limit" },
        { status: 400 }
      );
    }

    // PDF 파일만 허용
    if (file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "Only PDF files are allowed" },
        { status: 400 }
      );
    }

    // Supabase Storage에 업로드
    const storagePath = `projects/${projectId}/documents/${file.name}`;
    const { url, path } = await uploadFile(file, storagePath);

    // Document 레코드 생성
    const document = await prisma.document.create({
      data: {
        projectId,
        status: "pending",
        storagePath: path,
        fileUrl: url,
        metadata: {
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          uploadedBy: session.user.id,
        },
      },
    });

    // Inngest 이벤트 전송: 문서 검증 시작
    await inngest.send({
      name: "document/validate.requested",
      data: {
        documentId: document.id,
        projectId,
        userId: session.user.id,
      },
    });

    return NextResponse.json(document, { status: 201 });
  } catch (error) {
    console.error("Failed to upload document:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
