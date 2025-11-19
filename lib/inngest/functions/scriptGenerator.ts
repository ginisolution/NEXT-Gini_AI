import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import { generateScript } from "@/lib/services/gemini";
import { createServiceClient } from "@/lib/supabase/server";

export const scriptGenerator = inngest.createFunction(
  { id: "script-generator", retries: 2 },
  { event: "script/generation.requested" },
  async ({ event, step }) => {
    const { projectId, documentId } = event.data;

    // 1. 프로젝트 및 문서 조회
    const result = await step.run("fetch-project-and-document", async () => {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          documents: {
            where: { id: documentId },
          },
        },
      });

      if (!project) {
        throw new Error(`Project ${projectId} not found`);
      }

      if (!project.documents[0]) {
        throw new Error(`Document ${documentId} not found`);
      }

      return { project, document: project.documents[0] };
    });

    const { project, document } = result;

    // 2. Supabase Storage에서 PDF 다운로드
    const pdfBuffer = await step.run("download-pdf", async () => {
      const supabase = createServiceClient();
      const { data, error } = await supabase.storage
        .from("documents")
        .download(document.storagePath);

      if (error) {
        throw new Error(`Failed to download PDF: ${error.message}`);
      }

      return Buffer.from(await data.arrayBuffer());
    });

    // 3. PDF를 Base64로 인코딩
    const pdfBase64 = await step.run("encode-pdf", async () => {
      // Supabase Storage download는 ArrayBuffer를 반환하므로 Buffer로 변환
      let buffer: Buffer;
      if (Buffer.isBuffer(pdfBuffer)) {
        buffer = pdfBuffer;
      } else if (typeof pdfBuffer === "object" && pdfBuffer !== null && "type" in pdfBuffer && pdfBuffer.type === "Buffer") {
        // JSON 직렬화된 Buffer: { type: "Buffer", data: number[] }
        buffer = Buffer.from((pdfBuffer as { type: string; data: number[] }).data);
      } else {
        // ArrayBuffer or other
        buffer = Buffer.from(pdfBuffer as ArrayBuffer);
      }
      return buffer.toString("base64");
    });

    // 4. Gemini로 대본 생성
    const script = await step.run("generate-script", async () => {
      return await generateScript(
        pdfBase64,
        project.duration as 30 | 60 | 180
      );
    });

    // 5. 씬 생성 (대본을 씬으로 분할)
    const scenes = await step.run("create-scenes", async () => {
      interface SceneScript {
        text: string;
        duration?: number;
        backgroundPriority?: string;
        emotion?: string;
        visualDescription?: string;
      }

      const createdScenes = await prisma.$transaction(
        script.scenes.map((scene: SceneScript, index: number) =>
          prisma.scene.create({
            data: {
              projectId,
              sceneNumber: index + 1,
              position: index + 1,
              script: scene.text,
              duration: scene.duration || 15,
              backgroundAnalysis: {
                priority: scene.backgroundPriority || "low",
                emotion: scene.emotion || "neutral",
                visualDescription: scene.visualDescription || "",
              },
              ttsStatus: "pending",
              avatarStatus: "pending",
              backgroundStatus: "pending",
            },
          })
        )
      );

      return createdScenes;
    });

    // 6. 프로젝트 상태 업데이트
    await step.run("update-project-status", async () => {
      await prisma.project.update({
        where: { id: projectId },
        data: {
          status: "script_generated",
          metadata: {
            scriptGeneratedAt: new Date().toISOString(),
            sceneCount: scenes.length,
          },
        },
      });
    });

    // 7. 씬 처리 시작 (첫 번째 씬)
    await step.sendEvent("trigger-scene-processing", {
      name: "scene/process.requested",
      data: {
        projectId,
        sceneId: scenes[0].id,
        sceneNumber: 1,
        totalScenes: scenes.length,
      },
    });

    return {
      success: true,
      projectId,
      scenesCreated: scenes.length,
    };
  }
);
