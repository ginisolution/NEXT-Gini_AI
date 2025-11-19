import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { check, NAMESPACES, RELATIONS } from "@/lib/permissions";
import { downloadFile } from "@/lib/supabase/storage";
import { inngest } from "@/lib/inngest/client";
import { NextResponse } from "next/server";
import { VertexAI } from "@google-cloud/vertexai";

type Params = Promise<{ id: string }>;

/**
 * POST /api/projects/[id]/generate-script
 * PDF로부터 스크립트 생성
 */
export async function POST(request: Request, { params }: { params: Params }) {
  const session = await auth();
  const { id: projectId } = await params;

  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
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

    // 프로젝트 조회
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        documents: {
          orderBy: { createdAt: "desc" },
          take: 1, // 가장 최근 문서 1개만
        },
      },
    });

    if (!project) {
      return NextResponse.json(
        { error: "프로젝트를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    if (!project.documents || project.documents.length === 0) {
      return NextResponse.json(
        { error: "업로드된 문서가 없습니다." },
        { status: 400 }
      );
    }

    const document = project.documents[0];

    // Supabase Storage에서 PDF 다운로드
    const blob = await downloadFile(document.storagePath);
    const arrayBuffer = await blob.arrayBuffer();
    const pdfBase64 = Buffer.from(arrayBuffer).toString("base64");

    // Google Vertex AI로 스크립트 생성
    const vertexAI = new VertexAI({
      project: process.env.GOOGLE_CLOUD_PROJECT!,
      location: process.env.GOOGLE_CLOUD_LOCATION || "us-central1",
    });

    const model = vertexAI.getGenerativeModel({
      model: "gemini-2.0-flash-exp",
    });

    // 씬 개수 계산 (영상 길이 / 8초)
    const sceneCount = Math.ceil(project.duration / 8);

    const prompt = `
PDF 문서를 분석하여 ${project.duration}초 분량의 발표 대본을 생성하세요.
총 ${sceneCount}개의 씬으로 나누고, 각 씬은 약 8초 분량입니다.

출력 형식 (JSON):
{
  "scenes": [
    {
      "sceneNumber": 1,
      "script": "씬 1 대본 내용",
      "duration": 8,
      "visualDescription": "화면에 표시될 내용 설명"
    },
    ...
  ]
}

규칙:
- 각 씬의 대본은 자연스럽고 발표하기 적합해야 합니다
- 각 씬은 정확히 8초 분량의 대본이어야 합니다 (Veo 3.1 영상 길이에 맞춤)
- visualDescription은 배경 이미지 및 영상 생성에 사용됩니다
- 한국어로 작성하세요
`.trim();

    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: "application/pdf",
                data: pdfBase64,
              },
            },
          ],
        },
      ],
    });

    const response = result.response.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!response) {
      throw new Error("Gemini API로부터 응답을 받지 못했습니다.");
    }

    // JSON 파싱
    const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/) || response.match(/{[\s\S]*}/);
    if (!jsonMatch) {
      throw new Error("스크립트 JSON 파싱 실패");
    }

    const scriptData = JSON.parse(jsonMatch[1] || jsonMatch[0]);

    // Scene 레코드 생성
    const scenes = await Promise.all(
      scriptData.scenes.map(async (scene: { sceneNumber?: number; script?: string; text?: string; duration?: number; visualDescription?: string; priority?: string; emotion?: string }, index: number) => {
        return prisma.scene.create({
          data: {
            projectId,
            sceneNumber: scene.sceneNumber || index + 1,
            position: index,
            script: scene.script || scene.text || "",
            duration: scene.duration || 8,
            durationSeconds: scene.duration || 8,
            visualDescription: scene.visualDescription || "",
            ttsStatus: "pending",
            avatarStatus: "pending",
            backgroundStatus: "pending",
            backgroundAnalysis: {},
            metadata: {},
          },
        });
      })
    );

    // 프로젝트 상태 업데이트
    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: "script_generated",
        scriptGeneratedAt: new Date(),
      },
    });

    // Document 상태 업데이트
    await prisma.document.update({
      where: { id: document.id },
      data: {
        status: "completed",
      },
    });

    // 워크플로우 자동 실행: 커스텀 아바타 생성 + 씬 처리
    // 1. 커스텀 아바타 모드면 아바타 디자인 생성 이벤트
    if (project.avatarDesignMode === "custom") {
      await inngest.send({
        name: "avatar-design/generation.requested",
        data: {
          projectId,
        },
      });
    }

    // 2. 첫 번째 씬부터 순차 처리 시작 (TTS → 아바타 → 배경)
    if (scenes.length > 0) {
      await inngest.send({
        name: "scene/process.requested",
        data: {
          projectId,
          sceneId: scenes[0].id,
          userId: session.user.id,
        },
      });
    }

    return NextResponse.json({
      message: "스크립트 생성 및 워크플로우 시작 완료",
      scenesCount: scenes.length,
      scenes,
    });
  } catch (error) {
    console.error("Failed to generate script:", error);

    let errorMessage = "스크립트 생성에 실패했습니다.";
    if (error instanceof Error) {
      errorMessage = error.message;
    }

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
