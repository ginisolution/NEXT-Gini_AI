import { inngest } from "../client";
import { prisma } from "@/lib/prisma";

/**
 * DocumentValidator
 *
 * PDF 파일 검증 (Rails의 DocumentParserJob 역할 축소)
 * - 파일 크기 체크
 * - PDF 형식 확인
 */
export const documentValidator = inngest.createFunction(
  {
    id: "document-validator",
    name: "Document Validator",
  },
  { event: "document/validate.requested" },
  async ({ event, step }) => {
    const { documentId, projectId, userId } = event.data;

    // Document 조회
    const document = await step.run("fetch-document", async () => {
      return prisma.document.findUnique({
        where: { id: documentId },
      });
    });

    if (!document) {
      throw new Error(`Document not found: ${documentId}`);
    }

    // 검증 (현재는 간단한 체크만)
    await step.run("validate-pdf", async () => {
      const metadata = document.metadata as Record<string, unknown>;
      const fileSize = typeof metadata.fileSize === "number" ? metadata.fileSize : 0;
      const mimeType = typeof metadata.mimeType === "string" ? metadata.mimeType : "";

      if (fileSize > 10 * 1024 * 1024) {
        throw new Error("File size exceeds 10MB limit");
      }

      if (mimeType !== "application/pdf") {
        throw new Error("File must be PDF");
      }

      return true;
    });

    // Document 상태 업데이트
    await step.run("update-document-status", async () => {
      return prisma.document.update({
        where: { id: documentId },
        data: { status: "processed" },
      });
    });

    // 다음 단계: 대본 생성 트리거
    await step.sendEvent("trigger-script-generation", {
      name: "script/generation.requested",  // ✅ 수정: scriptGenerator와 일치하도록 변경
      data: {
        documentId,
        projectId,
        userId,
      },
    });

    return { success: true };
  }
);
