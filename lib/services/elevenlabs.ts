import "server-only";

/**
 * ElevenLabs TTS 서비스
 *
 * 텍스트를 음성으로 변환
 */

const API_KEY = process.env.ELEVEN_API_KEY!;
const MODEL_ID = process.env.ELEVEN_MODEL_ID || "eleven_multilingual_v2";
const DEFAULT_VOICE_ID = process.env.ELEVEN_DEFAULT_VOICE_ID!;

/**
 * TTS 생성
 *
 * @param text - 변환할 텍스트
 * @param voiceId - 음성 ID (선택적, 기본값: Rachel)
 * @returns 오디오 파일 Buffer
 */
export async function generateTTS(
  text: string,
  voiceId?: string
): Promise<{ audioBuffer: Buffer; durationSeconds: number }> {
  const voice = voiceId || DEFAULT_VOICE_ID;

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voice}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": API_KEY,
      },
      body: JSON.stringify({
        text,
        model_id: MODEL_ID,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0,
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ElevenLabs API error: ${error}`);
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer());

  // 오디오 길이 계산 (MP3 파일 크기로 추정, 정확하지 않음)
  // 실제로는 FFprobe로 정확한 길이를 측정해야 함
  const estimatedDuration = Math.ceil(text.length / 15); // 대략 초당 15자

  return {
    audioBuffer,
    durationSeconds: estimatedDuration,
  };
}

/**
 * 사용 가능한 음성 목록 조회
 *
 * @returns 음성 ID 목록
 */
export async function listVoices(): Promise<
  Array<{ voice_id: string; name: string; language: string }>
> {
  const response = await fetch("https://api.elevenlabs.io/v1/voices", {
    headers: {
      "xi-api-key": API_KEY,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch voices");
  }

  interface Voice {
    voice_id: string;
    name: string;
    labels?: { language?: string };
  }

  const data = await response.json();
  return data.voices.map((v: Voice) => ({
    voice_id: v.voice_id,
    name: v.name,
    language: v.labels?.language || "en",
  }));
}
