import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { check, NAMESPACES, RELATIONS } from "@/lib/permissions";
import { uploadFile } from "@/lib/supabase/storage";
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
    // 파일명 안전화: 한글 및 특수문자 제거, 공백을 언더스코어로 변환
    const timestamp = Date.now();
    const safeFileName = file.name
      .replace(/[^a-zA-Z0-9.]/g, "_") // 영문, 숫자, 마침표만 허용
      .replace(/_+/g, "_") // 연속 언더스코어 제거
      .replace(/^_|_$/g, ""); // 앞뒤 언더스코어 제거

    const storagePath = `projects/${projectId}/documents/${timestamp}_${safeFileName}`;
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

    // 참고: 스크립트 생성은 사용자가 수동으로 [스크립트 생성] 버튼을 클릭하여 시작
    // POST /api/projects/[id]/generate-script

    return NextResponse.json(document, { status: 201 });
  } catch (error) {
    console.error("Failed to upload document:", error);

    // 에러 타입별 메시지
    let errorMessage = "문서 업로드에 실패했습니다.";

    if (error instanceof Error) {
      if (error.message.includes("Bucket not found")) {
        errorMessage =
          "Storage 버킷이 설정되지 않았습니다. 'npm run storage:setup'을 실행하세요.";
      } else if (error.message.includes("Invalid key")) {
        errorMessage = "파일 경로가 올바르지 않습니다. 다시 시도해주세요.";
      } else {
        errorMessage = error.message;
      }
    }

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
