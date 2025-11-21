import "server-only";
import { VertexAI, HarmBlockThreshold, HarmCategory } from "@google-cloud/vertexai";
import {
  getGoogleCredentials,
  getGoogleProjectId,
  getGoogleLocation,
} from "@/lib/google/credentials";

/**
 * Google Vertex AI 서비스
 *
 * - Gemini 2.5 Pro: 대본 생성 + PDF 분석
 * - Nano Banana: 커스텀 아바타 + 씬 배경 이미지
 * - Veo 3.1: 씬 배경 영상 (image-to-video)
 */

const PROJECT_ID = getGoogleProjectId();
const LOCATION = getGoogleLocation();
const credentials = getGoogleCredentials();

const vertexAI = new VertexAI({
  project: PROJECT_ID,
  location: LOCATION,
  ...(credentials && {
    googleAuthOptions: {
      credentials,
    },
  }),
});

/**
 * Gemini 2.5 Pro - 대본 생성
 *
 * @param pdfBase64 - PDF 파일 Base64 인코딩
 * @param duration - 영상 길이 (30/60/180초)
 * @returns 생성된 대본 (씬 배열)
 */
export async function generateScript(
  pdfBase64: string,
  duration: 30 | 60 | 180
) {
  const model = vertexAI.getGenerativeModel({
    model: "gemini-2.0-flash-exp",
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 8192,
    },
    safetySettings: [
      {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
    ],
  });

  const prompt = `
당신은 발표 자료를 분석하여 아바타가 발표할 대본을 생성하는 AI입니다.

첨부된 PDF 발표 자료를 분석하여 ${duration}초 길이의 영상 대본을 생성하세요.

요구사항:
1. 전체 영상 길이: 정확히 ${duration}초
2. 씬 구성: 8초씩 나눠서 총 ${duration / 8}개 씬 (Veo 3.1 영상 길이에 맞춤)
3. 각 씬마다 다음 정보를 포함:
   - 대본 (script): 아바타가 말할 내용 (정확히 8초 분량)
   - 시각적 설명 (visualDescription): 배경에 표시할 내용 설명 (하위 호환성용)
   - 이미지 프롬프트 (imagePrompt): Nano Banana 이미지 생성 모델용 프롬프트
     * 16:9 비율, 포토리얼리스틱 스타일
     * 구체적인 조명, 색상, 구도, 질감 포함
     * 예: "Modern office interior with large windows, soft natural daylight, minimalist wooden desk, potted plants, 16:9 composition, photorealistic, 8k quality, cinematic lighting, professional photography"
   - 영상 프롬프트 (videoPrompt): Veo 3.1 영상 생성 모델용 프롬프트
     * 카메라 움직임 (slow pan, gentle zoom, static shot)
     * 동적 요소 (subtle movement, light changes)
     * 8초 길이에 적합한 변화
     * 예: "Slow camera pan from left to right across the office space, subtle light movement through windows, smooth transition, 8 seconds duration, cinematic motion"
   - 우선순위 (priority): "high" (중요), "medium" (보통), "low" (덜 중요)

응답 형식 (JSON):
{
  "scenes": [
    {
      "sceneNumber": 1,
      "script": "안녕하세요...",
      "visualDescription": "현대적인 사무실 배경",
      "imagePrompt": "Modern office interior with large windows, soft natural daylight, minimalist wooden desk, potted plants, 16:9 composition, photorealistic, 8k quality, cinematic lighting",
      "videoPrompt": "Slow camera pan across the office space, subtle light movement through windows, smooth transition, 8 seconds duration",
      "priority": "high"
    }
  ]
}
`;

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

  const response = result.response;
  const text = response.candidates?.[0].content.parts[0].text || "";

  // 디버깅: Gemini 원시 응답 확인
  console.log("🤖 Gemini Raw Response:");
  console.log("=".repeat(80));
  console.log(text);
  console.log("=".repeat(80));

  // JSON 파싱
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error("❌ Failed to find JSON in Gemini response");
    throw new Error("Failed to parse Gemini response");
  }

  const parsedJson = JSON.parse(jsonMatch[0]);

  // 디버깅: 파싱된 JSON 확인
  console.log("📦 Parsed JSON:");
  console.log(JSON.stringify(parsedJson, null, 2));

  return parsedJson;
}

/**
 * Nano Banana - 커스텀 아바타 이미지 생성
 *
 * @param settings - 아바타 디자인 설정
 * @returns 생성된 이미지 Buffer
 */
export async function generateAvatarDesign(settings: {
  gender: string;
  ageRange: string;
  style: string;
  expression: string;
  background: string;
  nationality?: string;
}): Promise<Buffer> {
  // 프롬프트 생성
  const prompt = buildAvatarPrompt(settings);

  // Gemini 2.5 Flash Image 모델 사용 (커스텀 아바타 이미지 생성)
  // 참고: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/2-5-flash-image
  const model = vertexAI.getGenerativeModel({
    model: "gemini-2.5-flash-image", // Gemini 2.5 Flash Image 모델
  });

  const result = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      temperature: 0.4,
      candidateCount: 1,
    },
  });

  // 이미지 데이터 추출
  const imageData = result.response.candidates?.[0]?.content?.parts?.[0];
  if (!imageData || !("inlineData" in imageData)) {
    throw new Error("No image data in Nano Banana response");
  }

  // Base64 디코딩하여 Buffer 반환
  const base64Data = imageData.inlineData?.data || "";
  return Buffer.from(base64Data, "base64");
}

/**
 * 아바타 프롬프트 생성
 */
function buildAvatarPrompt(settings: {
  gender: string;
  ageRange: string;
  style: string;
  expression: string;
  background: string;
  nationality?: string;
}): string {
  const { gender, ageRange, style, expression, background, nationality } = settings;

  // 국적에 따른 ethnicity 설명 추가
  const ethnicityMap: Record<string, string> = {
    korean: "East Asian, Korean ethnicity",
    japanese: "East Asian, Japanese ethnicity",
    american: "Caucasian, American ethnicity",
  };

  const ethnicityDescription = nationality
    ? ethnicityMap[nationality.toLowerCase()] || "diverse ethnicity"
    : "diverse ethnicity";

  return `
A photorealistic portrait of a ${gender} person in their ${ageRange},
${ethnicityDescription}, ${style} style, with a ${expression} expression.
Background: ${background}.
Professional headshot, centered composition, 1:1 aspect ratio,
8k resolution, raw photo, hyper-realistic, detailed skin texture, cinematic lighting, depth of field,
high quality, studio lighting, sharp focus.
Front-facing view, suitable for video avatar animation.
`.trim();
}

/**
 * Nano Banana - 씬 배경 이미지 생성
 *
 * @param visualDescription - 시각적 설명
 * @returns 생성된 이미지 Buffer
 */
export async function generateBackgroundImage(
  visualDescription: string
): Promise<Buffer> {
  // TODO: Vertex AI Imagen API 구현
  // 현재는 placeholder - 1x1 투명 PNG 반환

  // 1x1 투명 PNG (89 bytes)
  const pngData = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
    0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
    0x42, 0x60, 0x82
  ]);

  console.warn(`Using placeholder image for: ${visualDescription}`);
  return pngData;
}

/**
 * Veo 3.1 - 배경 영상 생성 (image-to-video)
 *
 * @param imageUrl - 기준 이미지 URL
 * @param prompt - 영상 설명
 * @returns Operation 정보
 */
export async function generateVeoVideo(
  imageUrl: string,
  prompt: string
): Promise<{ name: string }> {
  const { GoogleAuth } = await import("google-auth-library");

  // Google Auth 클라이언트 생성
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    ...(credentials && { credentials }),
  });

  const client = await auth.getClient();
  const accessTokenResponse = await client.getAccessToken();

  if (!accessTokenResponse.token) {
    throw new Error("Failed to obtain access token");
  }

  console.log(`📸 Downloading image from: ${imageUrl}`);

  // 이미지 다운로드 및 Base64 인코딩
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    console.error(`❌ Failed to fetch image: ${imageResponse.status} ${imageResponse.statusText}`);
    console.error(`   Image URL: ${imageUrl}`);
    throw new Error(`Failed to fetch image: ${imageResponse.statusText}`);
  }

  const imageBuffer = await imageResponse.arrayBuffer();
  const imageBase64 = Buffer.from(imageBuffer).toString("base64");
  console.log(`✅ Image downloaded: ${imageBuffer.byteLength} bytes → ${imageBase64.length} base64 chars`);

  // Veo 3.0 Fast API 엔드포인트 (predictLongRunning 사용)
  const endpoint = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/veo-3.0-fast-generate-001:predictLongRunning`;

  // 영화 품질 프롬프트 강화
  const cinematicPrompt = enhanceCinematicPrompt(prompt);

  console.log(`🎬 Calling Veo 3.1 API:`);
  console.log(`   Endpoint: ${endpoint}`);
  console.log(`   Prompt: ${cinematicPrompt.substring(0, 200)}...`);

  // API 요청 (Veo 형식)
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessTokenResponse.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      instances: [
        {
          prompt: cinematicPrompt,
          image: {
            bytesBase64Encoded: imageBase64,
            mimeType: "image/png",
          },
        },
      ],
      parameters: {
        aspectRatio: "16:9",
        resolution: "720p",
        sampleCount: 1,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("❌ Veo API request failed:");
    console.error(`   Status: ${response.status} ${response.statusText}`);
    console.error(`   Endpoint: ${endpoint}`);
    console.error(`   Response:`, errorText.substring(0, 1000));
    throw new Error(`Veo API request failed: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();

  // 디버깅: Veo API 전체 응답 확인
  console.log(`✅ Veo video generation API response:`);
  console.log(JSON.stringify(result, null, 2));

  // LRO operation name 추출
  const operationName = result.name;
  if (!operationName) {
    console.error("❌ No operation name in Veo API response");
    console.error("   Full response:", JSON.stringify(result, null, 2));
    throw new Error("No operation name in Veo API response");
  }

  console.log(`✅ Veo video generation started`);
  console.log(`   Operation name: ${operationName}`);
  console.log(`   Full response:`, JSON.stringify(result, null, 2).substring(0, 500));

  return { name: operationName };
}

/**
 * 영화 품질 프롬프트 강화
 */
function enhanceCinematicPrompt(prompt: string): string {
  // 이미 cinematic 키워드가 있으면 그대로 반환
  if (prompt.toLowerCase().includes("cinematic")) {
    return prompt;
  }

  // 영화 품질 향상 키워드 추가
  const cinematicEnhancements = [
    "cinematic quality",
    "professional cinematography",
    "smooth camera movement",
    "dramatic lighting",
    "film-grade color grading",
    "8-second duration",
  ];

  return `${prompt}, ${cinematicEnhancements.join(", ")}`;
}

/**
 * Veo LRO (Long Running Operation) 상태 확인
 *
 * @param operationName - Operation name
 * @returns 상태 및 결과
 */
export async function checkVeoOperation(operationName: string): Promise<{
  done: boolean;
  videoBuffer?: Buffer;
  error?: string;
}> {
  const { GoogleAuth } = await import("google-auth-library");
  const { Storage } = await import("@google-cloud/storage");

  // Google Auth 클라이언트 생성
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    ...(credentials && { credentials }),
  });

  const client = await auth.getClient();
  const accessTokenResponse = await client.getAccessToken();

  if (!accessTokenResponse.token) {
    throw new Error("Failed to obtain access token");
  }

  // operationName에서 location 동적 추출
  // 예: "projects/.../locations/us-central1/..." → "us-central1"
  const locationMatch = operationName.match(/\/locations\/([^\/]+)\//);
  const operationLocation = locationMatch ? locationMatch[1] : LOCATION;

  // LRO 상태 확인 엔드포인트 (공식 문서 준수: fetchPredictOperation 사용)
  // POST 방식으로 operationName을 body에 포함하여 전송
  const endpoint = `https://${operationLocation}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${operationLocation}/publishers/google/models/veo-3.0-fast-generate-001:fetchPredictOperation`;

  console.log(`🔍 Veo LRO polling (fetchPredictOperation):`);
  console.log(`   Operation location: ${operationLocation}`);
  console.log(`   Operation name: ${operationName}`);
  console.log(`   Endpoint: ${endpoint}`);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessTokenResponse.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      operationName,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("❌ Veo LRO polling failed:");
    console.error(`   Status: ${response.status} ${response.statusText}`);
    console.error(`   Operation: ${operationName}`);
    console.error(`   Extracted location: ${operationLocation}`);
    console.error(`   Default location (env): ${LOCATION}`);
    console.error(`   Endpoint: ${endpoint}`);
    console.error(`   Response:`, errorText.substring(0, 500));

    // 404 에러는 eventual consistency - 재시도 계속
    if (response.status === 404) {
      console.log("⏳ 404 - Operation not yet available (eventual consistency)");
      console.log(`   Operation will be retried by polling function`);
      console.log(`   Location: ${operationLocation}`);
      return {
        done: false,  // ← FIXED: 재시도 계속
      };
    }

    // 다른 HTTP 에러 (권한, 할당량 등)는 실패로 처리
    console.error("🚨 Non-404 error - marking as failed");
    return {
      done: true,
      error: `LRO polling failed: ${response.status} ${response.statusText}`,
    };
  }

  const operation = await response.json();

  // 작업이 아직 진행 중인 경우
  if (!operation.done) {
    console.log(`⏳ Veo operation in progress: ${operationName}`);
    return {
      done: false,
    };
  }

  // 에러가 발생한 경우
  if (operation.error) {
    console.error("Veo operation failed:", operation.error);
    return {
      done: true,
      error: operation.error.message || "Veo operation failed",
    };
  }

  // 성공한 경우 - 비디오 파일 다운로드
  try {
    // 🔍 전체 operation response 로깅 (디버깅용)
    console.log(`📋 Full operation response:`, JSON.stringify(operation, null, 2));

    // Veo API 응답 형식: operation.response.videos[]
    const videos = operation.response?.videos;
    if (!videos || videos.length === 0) {
      console.error(`❌ No videos in operation response!`);
      console.error(`   Operation name: ${operationName}`);
      console.error(`   Response structure:`, JSON.stringify(operation.response, null, 2));
      throw new Error("No generated videos in operation response");
    }

    const videoFile = videos[0];
    let videoBuffer: Buffer;

    // Case 1: GCS URI로 반환된 경우 (outputGcsUri 지정 시)
    if (videoFile.gcsUri) {
      const gcsUri = videoFile.gcsUri;
      console.log(`📹 Downloading Veo video from GCS: ${gcsUri}`);

      // GCS URI 파싱: gs://bucket-name/path/to/file.mp4
      const match = gcsUri.match(/^gs:\/\/([^\/]+)\/(.+)$/);
      if (!match) {
        console.error(`❌ Invalid GCS URI format: ${gcsUri}`);
        throw new Error(`Invalid GCS URI format: ${gcsUri}`);
      }

      const [, bucketName, filePath] = match;

      console.log(`📦 GCS download details:`);
      console.log(`   Bucket: ${bucketName}`);
      console.log(`   File path: ${filePath}`);

      // Cloud Storage 클라이언트로 파일 다운로드
      const storage = new Storage({
        ...(credentials && { credentials }),
      });

      const bucket = storage.bucket(bucketName);
      const file = bucket.file(filePath);

      const [downloadedBuffer] = await file.download();
      videoBuffer = downloadedBuffer;

      console.log(`✅ Veo video downloaded from GCS: ${videoBuffer.length} bytes`);
    }
    // Case 2: Base64로 반환된 경우 (outputGcsUri 미지정 시 - 기본값)
    else if (videoFile.bytesBase64Encoded) {
      console.log(`📹 Veo video returned as Base64 (no GCS bucket specified)`);
      videoBuffer = Buffer.from(videoFile.bytesBase64Encoded, "base64");
      console.log(`✅ Veo video decoded from Base64: ${videoBuffer.length} bytes`);
    }
    // Case 3: 둘 다 없는 경우 - 에러
    else {
      console.error(`❌ No video data in response!`);
      console.error(`   Video file structure:`, JSON.stringify(videoFile, null, 2));
      throw new Error("No gcsUri or bytesBase64Encoded in operation response");
    }

    return {
      done: true,
      videoBuffer,
    };
  } catch (error) {
    console.error("❌ Failed to download Veo video:");
    console.error(`   Operation: ${operationName}`);
    console.error(`   Error type: ${error instanceof Error ? error.constructor.name : typeof error}`);
    console.error(`   Error message: ${error instanceof Error ? error.message : String(error)}`);

    if (error instanceof Error && error.stack) {
      console.error(`   Stack trace:`, error.stack);
    }

    return {
      done: true,
      error: error instanceof Error ? error.message : "Failed to download video",
    };
  }
}
