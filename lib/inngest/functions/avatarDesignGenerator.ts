import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import { generateAvatarDesign } from "@/lib/services/gemini";
import { uploadFromBuffer } from "@/lib/supabase/storage";

export const avatarDesignGenerator = inngest.createFunction(
  {
    id: "avatar-design-generator",
    retries: 2,
    onFailure: async ({ error, event }) => {
      const { projectId } = event.data.event.data;

      // Quota 초과 에러는 재시도하지 않음
      if (
        error.message?.includes("Quota exceeded") ||
        error.message?.includes("RESOURCE_EXHAUSTED")
      ) {
        console.warn(
          `Avatar design generation permanently failed for project ${projectId} due to quota exceeded. Project will use preset avatar.`
        );
        return;
      }

      // 다른 에러는 로그만 남김
      console.error(
        `Avatar design generation failed for project ${projectId}:`,
        error
      );
    },
  },
  { event: "avatar-design/generation.requested" },
  async ({ event, step }) => {
    const { projectId } = event.data;

    // 1. 프로젝트 조회
    const project = await step.run("fetch-project", async () => {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
      });

      if (!project) {
        throw new Error(`Project ${projectId} not found`);
      }

      // avatarDesignMode가 "custom"인지 확인
      if (project.avatarDesignMode !== "custom") {
        throw new Error(`Project ${projectId} is not in custom avatar mode`);
      }

      if (!project.avatarDesignSettings) {
        throw new Error(`Project ${projectId} has no avatar design settings`);
      }

      return project;
    });

    // 2. 아바타 디자인 상태 업데이트 (generating)
    await step.run("update-avatar-design-status-generating", async () => {
      await prisma.project.update({
        where: { id: projectId },
        data: { avatarDesignStatus: "generating" },
      });
    });

    const settings = project.avatarDesignSettings as {
      gender: string;
      ageRange: string;
      style: string;
      expression: string;
      background: string;
      nationality?: string;
    };

    // 3. Imagen API로 아바타 이미지 생성 및 업로드 (Inngest output size 제한 회피)
    const imageUrl = await step.run("generate-and-upload-avatar-image", async () => {
      try {
        // 이미지 생성
        const imageBuffer = await generateAvatarDesign(settings);

        // 즉시 Supabase Storage에 업로드 (Buffer를 step output으로 반환하지 않음)
        const fileName = `avatar_design.png`;
        const storagePath = `projects/${projectId}/avatars/${fileName}`;

        // API 응답이 JSON 직렬화된 Buffer일 수 있으므로 변환
        const buffer = Buffer.isBuffer(imageBuffer)
          ? imageBuffer
          : Buffer.from(imageBuffer as unknown as ArrayBuffer);

        const { url } = await uploadFromBuffer(buffer, storagePath, "image/png");
        return url; // URL만 반환 (크기 작음)
      } catch (error: unknown) {
        console.error("Avatar design generation failed:", error);

        // 타입 가드: Error 객체인지 확인
        const isError = error instanceof Error;
        const errorMessage = isError ? error.message : String(error);
        const errorCode = (error as { code?: number })?.code;
        const errorStatus = (error as { status?: string })?.status;

        // 폴백 대상 에러 판단
        const shouldFallback =
          errorMessage.includes("Quota exceeded") ||
          errorMessage.includes("RESOURCE_EXHAUSTED") ||
          errorMessage.includes("not found") ||
          errorMessage.includes("NOT_FOUND") ||
          errorCode === 404 ||
          errorCode === 429 ||
          errorStatus === "NOT_FOUND";

        if (shouldFallback) {
          const errorReason =
            errorCode === 404 || errorStatus === "NOT_FOUND"
              ? "Model not found"
              : errorCode === 429
              ? "Quota exceeded"
              : "API error";

          console.warn(
            `${errorReason}, falling back to preset avatar for project ${projectId}`
          );

          // 프로젝트 상태를 failed로 업데이트하고 에러 정보 저장
          await prisma.project.update({
            where: { id: projectId },
            data: {
              avatarDesignStatus: "failed",
              metadata: {
                avatarDesignError: errorReason,
                avatarDesignErrorDetails: errorMessage,
                fallbackToPreset: true,
                errorTimestamp: new Date().toISOString(),
              },
            },
          });

          // 워크플로우를 중단하지 않고 프리셋 아바타 사용하도록 설정
          // 나머지 씬 처리는 프리셋 아바타로 진행됨
          throw new Error(
            `Avatar design generation failed: ${errorReason}. Project will use preset avatar.`
          );
        }

        // 일시적 네트워크 에러 등은 재시도 가능하도록 다시 throw
        throw error;
      }
    });

    // 5. Asset 생성
    const asset = await step.run("create-avatar-design-asset", async () => {
      return await prisma.asset.create({
        data: {
          projectId,
          kind: "avatar_design",
          type: "avatar_design",
          url: imageUrl,
          storagePath: `projects/${projectId}/avatars/avatar_design.png`,
          metadata: {
            provider: "imagen",
            settings,
            cost: 0.039, // Imagen 예상 비용
          },
        },
      });
    });

    // 6. 프로젝트 상태 업데이트 (completed)
    await step.run("update-avatar-design-status-completed", async () => {
      await prisma.project.update({
        where: { id: projectId },
        data: {
          avatarDesignStatus: "completed",
          metadata: {
            avatarDesignAssetId: asset.id,
            avatarDesignCompletedAt: new Date().toISOString(),
          },
        },
      });
    });

    // 7. 완료 이벤트 전송 (씬 처리가 대기 중일 수 있음)
    await step.sendEvent("notify-avatar-design-completed", {
      name: "avatar-design/completed",
      data: {
        projectId,
        assetId: asset.id,
        imageUrl,
      },
    });

    return {
      success: true,
      projectId,
      assetId: asset.id,
      imageUrl,
    };
  }
);
