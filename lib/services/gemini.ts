import "server-only";
import { VertexAI, HarmBlockThreshold, HarmCategory, SchemaType } from "@google-cloud/vertexai";
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
    model: "gemini-2.5-pro",
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 16384, // 증가: 8192 → 16384 (180초 23개 씬 생성 위해)
      responseMimeType: "application/json", // JSON 응답 강제
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          scenes: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                sceneNumber: { type: SchemaType.INTEGER },
                script: { type: SchemaType.STRING },
                duration: { type: SchemaType.NUMBER },
                visualDescription: { type: SchemaType.STRING },
                imagePrompt: { type: SchemaType.STRING },
                videoPrompt: { type: SchemaType.STRING },
                emotion: { type: SchemaType.STRING }
              },
              required: ["sceneNumber", "script", "duration", "visualDescription"]
            }
          }
        },
        required: ["scenes"]
      }
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
   - 대본 (script): 아바타가 말할 내용
     * 🚨 **ABSOLUTE LIMIT: 최대 60자 (공백 제외)**
     * 🚨 **60자 초과 시 즉시 거부됩니다**
     * **목표 시간: 정확히 6-7초 분량**
     * **문장 스타일: 자연스럽고 친근한 톤 (딱딱한 설명체 금지)**
     * **필수 원칙**:
       - 인사말/자기소개 절대 금지 ("안녕하세요", "여러분" 등)
       - 괄호 표현 절대 금지 ("(잠시 뜸들임)", "(예시)" 등)
       - 설명문 금지 ("~에 대해 이야기하겠습니다", "~를 소개합니다" 등)
       - 핵심 메시지를 충분히 설명하되 간결하게 (40~60자 권장)
       - 자연스러운 구어체 사용 (~죠, ~네요, ~거든요, ~잖아요)
       - 영어는 꼭 필요할 때만 (한글로 대체 가능하면 대체)
       - 구체적인 수치나 예시로 설득력 높이기
     * ✅ 좋은 예시들 (자연스럽고 적절한 길이):
       - "클로드 코드는 정말 강력하지만, 무제한 요금제가 없어져서 비용 관리가 필수가 됐어요." (43자) ← 완벽
       - "MCP 서버들을 전부 연결하면 기능은 좋지만, 오히려 토큰 낭비가 심해질 수 있거든요." (46자) ← 완벽
       - "코드 분석 에이전트를 활용하면 토큰을 30%나 절약하면서도 더 정확한 분석이 가능해요." (49자) ← 완벽
       - "컨텍스트 7을 쓰면 AI가 실시간으로 최신 기술 문서를 읽고 코드를 짜줘서 개발이 훨씬 빨라져요." (52자) ← 완벽
     * ❌ 나쁜 예시들 (절대 금지):
       - "안녕하세요. 오늘은 MCP 서버 활용법을 소개합니다." (인사말 + 설명문)
       - "정말 놀랍죠? (잠시 뜸들임) 이제 자세히 알아볼까요?" (괄호 표현)
       - "클로드 코드 짱" (너무 짧음, 20자 미만)
       - "본 발표에서는 AI 코딩 도구의 효율적 활용 방안에 대하여 상세히 설명드리고자 합니다." (딱딱한 설명체)
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

응답 형식 (JSON):
{
  "scenes": [
    {
      "sceneNumber": 1,
      "script": "v1.0은 코드 중심 협업 시대를 열었습니다.",
      "visualDescription": "현대적인 사무실 배경",
      "imagePrompt": "Modern office interior with large windows, soft natural daylight, minimalist wooden desk, potted plants, 16:9 composition, photorealistic, 8k quality, cinematic lighting",
      "videoPrompt": "Slow camera pan across the office space, subtle light movement through windows, smooth transition, 8 seconds duration"
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
  console.log("🤖 Gemini Raw Response (first 1000 chars):");
  console.log("=".repeat(80));
  console.log(text.substring(0, 1000));
  console.log("=".repeat(80));

  // JSON Schema 적용으로 응답이 항상 유효한 JSON이므로 직접 파싱
  let parsedJson;
  try {
    parsedJson = JSON.parse(text);
  } catch {
    // JSON Schema가 있어도 드물게 실패할 수 있으므로 fallback
    console.warn("⚠️ Direct parse failed, trying regex extraction...");
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("❌ Failed to find JSON in Gemini response");
      console.error("Response text:", text);
      throw new Error("Failed to parse Gemini response - no valid JSON found");
    }
    parsedJson = JSON.parse(jsonMatch[0]);
  }

  // 디버깅: 파싱된 JSON 확인
  console.log("📦 Parsed JSON - scenes count:", parsedJson.scenes?.length || 0);
  if (parsedJson.scenes && parsedJson.scenes.length > 0) {
    console.log("First scene:", JSON.stringify(parsedJson.scenes[0], null, 2));
    console.log("Last scene:", JSON.stringify(parsedJson.scenes[parsedJson.scenes.length - 1], null, 2));
  }

  // 🚨 Gemini 2.5 Flash를 사용한 스크립트 검증 및 요약
  console.log("\n🔍 스크립트 검증 및 요약 시작...");
  const invalidScenes: string[] = [];

  for (let i = 0; i < parsedJson.scenes.length; i++) {
    const scene = parsedJson.scenes[i];
    const sceneNum = i + 1;
    const originalScript = scene.script;

    console.log(`\n📝 씬 ${sceneNum} 처리 중...`);
    console.log(`   원본: "${originalScript}" (${originalScript.replace(/\s/g, "").length}자)`);

    // 1. 괄호 자동 제거 (TTS가 괄호 안 단어를 중복 읽는 문제 방지)
    let processedScript = originalScript;
    if (originalScript.includes("(") || originalScript.includes(")")) {
      console.warn(`   ⚠️ 괄호 발견 - 자동 제거 중...`);
      // 괄호와 괄호 안의 내용 제거: "커서(Cursor)" → "커서"
      processedScript = originalScript.replace(/\([^)]*\)/g, '').trim();
      // 연속 공백 정리
      processedScript = processedScript.replace(/\s+/g, ' ');
      console.log(`   🔧 괄호 제거 후: "${processedScript}" (${processedScript.replace(/\s/g, "").length}자)`);
    }

    // 2. 인사말 검증
    const greetings = ["안녕하세요", "안녕", "여러분", "반갑습니다"];
    if (greetings.some((greeting) => processedScript.includes(greeting))) {
      invalidScenes.push(`씬 ${sceneNum}: 인사말 포함 금지 - "${processedScript}"`);
    }

    // 3. 설명문 검증
    const explanations = [
      "이야기하겠습니다",
      "소개합니다",
      "설명하겠습니다",
      "말씀드리겠습니다",
      "에 대해",
    ];
    if (explanations.some((exp) => processedScript.includes(exp))) {
      invalidScenes.push(`씬 ${sceneNum}: 설명문 포함 금지 - "${processedScript}"`);
    }

    // 4. 길이 검증 및 AI 요약
    try {
      const summarized = await validateAndSummarizeScript(processedScript);
      parsedJson.scenes[i].script = summarized;
      console.log(`   ✅ 최종: "${summarized}" (${summarized.replace(/\s/g, "").length}자)`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      invalidScenes.push(`씬 ${sceneNum}: 요약 실패 - ${errorMsg}`);
      console.error(`   ❌ 요약 실패: ${errorMsg}`);
    }
  }

  // 검증 실패 시 에러 발생
  if (invalidScenes.length > 0) {
    console.error("\n❌ 스크립트 검증 실패:");
    invalidScenes.forEach((error) => console.error(`   - ${error}`));
    throw new Error(
      `스크립트 검증 실패 (${invalidScenes.length}개 씬):\n${invalidScenes.join("\n")}`
    );
  }

  console.log("\n✅ 모든 씬 스크립트 검증 및 요약 완료");

  return parsedJson;
}

/**
 * Gemini 2.5 Flash - 스크립트 길이 검증 및 요약
 *
 * @param script - 원본 스크립트
 * @returns 60자 이내로 요약된 스크립트
 */
async function validateAndSummarizeScript(script: string): Promise<string> {
  const scriptLength = script.replace(/\s/g, "").length;

  // 이미 60자 이내면 그대로 반환
  if (scriptLength <= 60) {
    console.log(`✅ 스크립트 길이 OK: ${scriptLength}자`);
    return script;
  }

  console.log(`⚠️ 스크립트 길이 초과: ${scriptLength}자 → 요약 필요`);

  // Gemini 2.5 Flash 모델 사용 (빠르고 저렴)
  const model = vertexAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      temperature: 0.3, // 일관성 있는 요약
      maxOutputTokens: 100,
    },
  });

  const prompt = `
다음 스크립트를 **정확히 60자 이내 (공백 제외)**로 요약하세요.

원본 스크립트:
"${script}"

요구사항:
1. 🚨 **절대 제한: 60자 이내 (공백 제외)**
2. 핵심 메시지를 충분히 설명하되 간결하게 (40~60자 권장)
3. 자연스러운 구어체 (~죠, ~네요, ~거든요, ~잖아요)
4. 인사말/설명문 절대 금지
5. 괄호 표현 절대 금지
6. 영어는 꼭 필요할 때만
7. 구체적인 수치나 예시로 설득력 높이기

✅ 좋은 예시:
- "클로드 코드는 정말 강력하지만, 무제한 요금제가 없어져서 비용 관리가 필수가 됐어요." (43자)
- "MCP 서버들을 전부 연결하면 기능은 좋지만, 오히려 토큰 낭비가 심해질 수 있거든요." (46자)

**요약된 스크립트만 출력하세요 (설명 없이):**
`.trim();

  const result = await model.generateContent(prompt);

  // 안전한 응답 추출 (optional chaining 완전 적용)
  const summarized = result.response.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

  // Gemini 응답 실패 시 fallback: 강제 자르기
  if (!summarized) {
    console.warn(`⚠️ Gemini 요약 실패 → 강제 자르기`);
    console.warn(`   Response structure:`, JSON.stringify(result.response, null, 2).substring(0, 500));
    const trimmed = script.replace(/\s/g, "").slice(0, 60);
    console.warn(`   강제 절단: "${trimmed}" (60자)`);
    return trimmed;
  }

  const summarizedLength = summarized.replace(/\s/g, "").length;
  console.log(`✅ 요약 완료: ${scriptLength}자 → ${summarizedLength}자`);

  // 요약 후에도 60자 초과 시 강제 자르기
  if (summarizedLength > 60) {
    const trimmed = summarized.replace(/\s/g, "").slice(0, 60);
    console.warn(`⚠️ 요약 후에도 초과 → 강제 자르기: ${trimmed}`);
    return trimmed;
  }

  return summarized;
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
 * 이미지 프롬프트 향상
 *
 * Google 공식 가이드라인에 따라 간단한 프롬프트를 상세한 서술형 문단으로 확장
 * https://ai.google.dev/gemini-api/docs/image-generation?hl=ko#image-generation-prompts
 *
 * @param rawPrompt - 원본 프롬프트
 * @param emotion - 감정/분위기 (조명과 색상 결정)
 * @returns 향상된 프롬프트
 */
function enhanceImagePrompt(
  rawPrompt: string,
  emotion: string = "professional"
): string {
  // 이미 상세한 프롬프트인 경우 (100자 이상, 조명/카메라 용어 포함)
  const hasLightingTerms = /light|lighting|illuminat|glow|shadow|bright/i.test(rawPrompt);
  const hasCameraTerms = /composition|angle|shot|focus|depth|lens|frame/i.test(rawPrompt);
  const hasQualityTerms = /8k|4k|photorealistic|cinematic|detailed|quality/i.test(rawPrompt);

  if (
    rawPrompt.length > 100 &&
    hasLightingTerms &&
    hasCameraTerms &&
    hasQualityTerms
  ) {
    console.log("   ✓ Prompt already detailed, using as-is");
    return rawPrompt;
  }

  // 감정에 따른 조명 및 색상 팔레트 설정
  const lightingAndColors = {
    professional: {
      lighting: "soft natural daylight streaming through large windows, balanced studio lighting with subtle shadows",
      colors: "cool neutral tones with hints of blue and gray, professional color grading",
      mood: "clean, focused, and sophisticated"
    },
    energetic: {
      lighting: "bright studio lighting with dynamic highlights, vibrant illumination creating energy",
      colors: "warm vibrant colors with pops of orange and yellow, saturated color palette",
      mood: "dynamic, engaging, and lively"
    },
    calm: {
      lighting: "gentle ambient light with soft diffusion, minimal shadows creating tranquility",
      colors: "cool blues and soft greens with pastel accents, serene color harmony",
      mood: "peaceful, relaxing, and contemplative"
    },
    innovative: {
      lighting: "modern LED accent lighting, sleek illumination with gradient effects",
      colors: "tech-inspired blues and purples, futuristic color scheme",
      mood: "cutting-edge, modern, and forward-thinking"
    },
    neutral: {
      lighting: "balanced natural and artificial lighting, even illumination across the scene",
      colors: "natural color palette with harmonious tones, realistic color reproduction",
      mood: "clear, straightforward, and authentic"
    }
  };

  const style = lightingAndColors[emotion.toLowerCase() as keyof typeof lightingAndColors]
    || lightingAndColors.neutral;

  // 공식 가이드라인에 따른 서술형 프롬프트 구성
  const enhancedPrompt = `
${rawPrompt.trim()}.
The scene is photographed with professional camera equipment, utilizing a wide-angle lens for comprehensive framing in 16:9 aspect ratio composition.
${style.lighting}, creating a ${style.mood} atmosphere throughout the environment.
The setting features ${style.colors}, with meticulous attention to material textures and surface qualities.
Rich environmental details include smooth polished surfaces, natural material textures, and carefully considered spatial depth.
The composition employs centered framing with strategic use of depth of field, ensuring sharp focus on key elements while maintaining contextual background clarity.
Rendered in 8k resolution with photorealistic quality, featuring cinematic color grading, high dynamic range, and professional post-processing for maximum visual impact and realism.
  `.trim();

  console.log(`   ✓ Enhanced prompt from ${rawPrompt.length} to ${enhancedPrompt.length} characters`);
  return enhancedPrompt;
}

/**
 * Nano Banana - 씬 배경 이미지 생성
 *
 * @param imagePrompt - 이미지 생성 프롬프트 (16:9, photorealistic)
 * @param emotion - 감정/분위기 (선택사항, 프롬프트 향상에 사용)
 * @returns 생성된 이미지 Buffer
 */
export async function generateBackgroundImage(
  imagePrompt: string,
  emotion?: string
): Promise<Buffer> {
  console.log(`🎨 Generating background image with Gemini 2.5 Flash Image`);
  console.log(`   Original prompt: ${imagePrompt.substring(0, 100)}...`);

  // 프롬프트 향상 (공식 가이드라인 적용)
  const enhancedPrompt = enhanceImagePrompt(imagePrompt, emotion);
  console.log(`   Enhanced prompt: ${enhancedPrompt.substring(0, 150)}...`);

  // Gemini 2.5 Flash Image 모델 사용
  const model = vertexAI.getGenerativeModel({
    model: "gemini-2.5-flash-image",
    // Safety Settings 추가 (Safety Filter 차단 방지)
    safetySettings: [
      {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
      },
      {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
      },
      {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
      },
      {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
      },
    ],
  });

  const result = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [{ text: enhancedPrompt }],
      },
    ],
    generationConfig: {
      temperature: 0.4,
      candidateCount: 1,
    },
  });

  // 응답을 에러 발생 전에 로깅 (디버깅용)
  console.log("🔍 ===== Gemini API Response =====");
  console.log(`   Candidates count: ${result.response.candidates?.length || 0}`);
  if (result.response.promptFeedback) {
    console.log("   PromptFeedback:", JSON.stringify(result.response.promptFeedback, null, 2));
  }
  console.log("==================================");

  // 상세한 응답 검증
  const response = result.response;

  // 1. candidates 배열 확인
  if (!response.candidates || response.candidates.length === 0) {
    console.error("❌ No candidates in Gemini response");
    console.error("   PromptFeedback:", JSON.stringify(response.promptFeedback, null, 2));

    if (response.promptFeedback?.blockReason) {
      throw new Error(`Gemini blocked by safety filter: ${response.promptFeedback.blockReason}`);
    }

    throw new Error("No candidates in Gemini response");
  }

  const candidate = response.candidates[0];

  // 2. finishReason 확인
  if (candidate.finishReason && candidate.finishReason !== "STOP") {
    console.error("❌ Generation did not complete normally");
    console.error("   Finish reason:", candidate.finishReason);
    throw new Error(`Gemini generation failed: ${candidate.finishReason}`);
  }

  // 3. 이미지 데이터 확인 (직접 속성 접근)
  const imageData = candidate.content?.parts?.[0];
  const inlineData = (imageData as unknown as { inlineData?: { data?: string; mimeType?: string } })?.inlineData;

  if (!inlineData || !inlineData.data) {
    console.error("❌ No image data in candidate");
    console.error("   Candidate structure:", JSON.stringify(candidate, null, 2));
    console.error("   imageData:", JSON.stringify(imageData, null, 2));
    throw new Error("No image data in Gemini response");
  }

  // Base64 디코딩하여 Buffer 반환
  const base64Data = inlineData.data;
  const buffer = Buffer.from(base64Data, "base64");

  console.log(`✅ Background image generated: ${buffer.length} bytes`);
  return buffer;
}

/**
 * Veo 3.1 - 배경 영상 생성 (image-to-video)
 *
 * @param imageUrl - 기준 이미지 URL
 * @param prompt - 영상 설명
 * @param emotion - 감정/분위기 (선택사항, 카메라 움직임 최적화)
 * @returns Operation 정보
 */
export async function generateVeoVideo(
  imageUrl: string,
  prompt: string,
  emotion?: string
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

  // 프롬프트 향상 (공식 가이드라인 적용)
  const enhancedPrompt = enhanceVideoPrompt(prompt, emotion);

  console.log(`🎬 Calling Veo 3.1 API:`);
  console.log(`   Endpoint: ${endpoint}`);
  console.log(`   Original prompt: ${prompt.substring(0, 100)}...`);
  console.log(`   Enhanced prompt: ${enhancedPrompt.substring(0, 150)}...`);

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
          prompt: enhancedPrompt,
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
 * Veo 동영상 프롬프트 향상
 *
 * Google 공식 가이드라인에 따라 간단한 프롬프트를 영화적 표현으로 강화
 * https://ai.google.dev/gemini-api/docs/video?hl=ko#prompt-guide
 *
 * @param rawPrompt - 원본 프롬프트
 * @param emotion - 감정/분위기 (카메라 움직임과 조명 결정)
 * @returns 향상된 동영상 프롬프트
 */
function enhanceVideoPrompt(
  rawPrompt: string,
  emotion: string = "professional"
): string {
  // 이미 상세한 프롬프트인 경우 (80자 이상, 카메라/조명 용어 포함)
  const hasCameraTerms = /shot|camera|tracking|drone|pan|tilt|dolly|zoom|pov|angle/i.test(rawPrompt);
  const hasLightingTerms = /light|lighting|shadow|glow|bright|dark|golden|atmosphere/i.test(rawPrompt);
  const hasMotionTerms = /slow|smooth|gentle|dynamic|subtle|movement|motion|drift/i.test(rawPrompt);

  if (
    rawPrompt.length > 80 &&
    hasCameraTerms &&
    hasLightingTerms &&
    hasMotionTerms
  ) {
    console.log("   ✓ Video prompt already detailed, using as-is");
    return rawPrompt;
  }

  // 감정에 따른 카메라 움직임 및 분위기 설정
  const cinematicStyles = {
    professional: {
      camera: "Steady tracking shot with subtle horizontal pan, maintaining professional composition throughout",
      motion: "Smooth, measured camera movement with gentle transitions",
      lighting: "Balanced ambient lighting with soft natural tones",
      atmosphere: "clean, focused, and authoritative visual narrative",
      pacing: "deliberate and purposeful progression"
    },
    energetic: {
      camera: "Dynamic drone shot with sweeping movement, incorporating quick pans and varied perspectives",
      motion: "Energetic camera work with fluid transitions and active framing",
      lighting: "Vibrant illumination with warm highlights and dynamic contrast",
      atmosphere: "lively, engaging, and momentum-driven visual story",
      pacing: "brisk and exciting progression with rapid visual interest"
    },
    calm: {
      camera: "Slow dolly movement with gentle drift, peaceful and contemplative camera flow",
      motion: "Serene, unhurried camera motion with graceful transitions",
      lighting: "Soft ambient glow with tranquil color temperature",
      atmosphere: "peaceful, meditative, and soothing visual experience",
      pacing: "leisurely and calming progression"
    },
    innovative: {
      camera: "Creative camera angles with experimental movement, modern cinematographic approach",
      motion: "Unconventional camera paths with artistic transitions",
      lighting: "Contemporary lighting design with sleek modern aesthetics",
      atmosphere: "cutting-edge, visually striking, and thought-provoking narrative",
      pacing: "progressive and forward-thinking visual development"
    },
    neutral: {
      camera: "Standard cinematic camera work with natural movement patterns",
      motion: "Balanced camera motion with organic transitions",
      lighting: "Natural lighting conditions with realistic illumination",
      atmosphere: "straightforward, authentic, and clear visual presentation",
      pacing: "steady and natural progression"
    }
  };

  const style = cinematicStyles[emotion.toLowerCase() as keyof typeof cinematicStyles]
    || cinematicStyles.neutral;

  // 공식 가이드라인에 따른 서술형 프롬프트 구성
  const enhancedPrompt = `
${rawPrompt.trim()}.
${style.camera}, creating a ${style.atmosphere}.
${style.motion}, with ${style.lighting} establishing the mood and visual tone.
The sequence unfolds over 8 seconds with ${style.pacing}, featuring smooth temporal continuity and cinematic color grading.
Professional cinematography with film-grade quality, incorporating subtle environmental changes and atmospheric depth throughout the duration.
  `.trim();

  console.log(`   ✓ Enhanced video prompt from ${rawPrompt.length} to ${enhancedPrompt.length} characters`);
  return enhancedPrompt;
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
