import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import { generateTTS } from "@/lib/services/elevenlabs";
import { uploadFromBuffer } from "@/lib/supabase/storage";

export const ttsGenerator = inngest.createFunction(
  { id: "tts-generator", retries: 2, concurrency: [{ limit: 3 }] },
  { event: "tts/generation.requested" },
  async ({ event, step }) => {
    const { sceneId } = event.data;

    // 1. 씬 조회
    const scene = await step.run("fetch-scene", async () => {
      const scene = await prisma.scene.findUnique({
        where: { id: sceneId },
      });

      if (!scene) {
        throw new Error(`Scene ${sceneId} not found`);
      }

      return scene;
    });

    // 2. TTS 상태 업데이트 (generating)
    await step.run("update-tts-status-generating", async () => {
      await prisma.scene.update({
        where: { id: sceneId },
        data: { ttsStatus: "generating" },
      });
    });

    // 3. ElevenLabs TTS 생성
    const ttsResult = await step.run("generate-tts", async () => {
      return await generateTTS(scene.script);
    });

    // 4. Supabase Storage에 업로드
    const audioUrl = await step.run("upload-audio", async () => {
      const fileName = `scene_${scene.sceneNumber}_audio.mp3`;
      const storagePath = `projects/${scene.projectId}/audio/${fileName}`;

      // API 응답이 JSON 직렬화된 Buffer일 수 있으므로 변환
      const audioBuffer = Buffer.isBuffer(ttsResult.audioBuffer)
        ? ttsResult.audioBuffer
        : Buffer.from(ttsResult.audioBuffer as unknown as ArrayBuffer);

      const { url } = await uploadFromBuffer(
        audioBuffer,
        storagePath,
        "audio/mpeg"
      );
      return url;
    });

    // 5. Asset 생성
    const asset = await step.run("create-asset", async () => {
      return await prisma.asset.create({
        data: {
          projectId: scene.projectId,
          kind: "audio",
          type: "audio",
          url: audioUrl,
          storagePath: `projects/${scene.projectId}/audio/scene_${scene.sceneNumber}_audio.mp3`,
          metadata: {
            sceneId: scene.id,
            sceneNumber: scene.sceneNumber,
            duration: scene.duration,
            provider: "elevenlabs",
          },
        },
      });
    });

    // 6. 씬의 audioAssetId 업데이트 및 TTS 상태 완료
    await step.run("update-scene-audio-asset", async () => {
      await prisma.scene.update({
        where: { id: sceneId },
        data: {
          audioAssetId: asset.id,
          ttsStatus: "completed",
        },
      });
    });

    return {
      success: true,
      sceneId,
      assetId: asset.id,
      audioUrl,
    };
  }
);
