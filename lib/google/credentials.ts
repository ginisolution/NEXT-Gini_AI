/**
 * Google Cloud 인증 자격증명 헬퍼
 *
 * 로컬: GOOGLE_APPLICATION_CREDENTIALS 파일 경로 사용
 * Vercel: GOOGLE_APPLICATION_CREDENTIALS_BASE64 Base64 디코딩 사용
 */

export interface GoogleCredentials {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
  universe_domain: string;
}

/**
 * Google Cloud 자격증명을 환경에 맞게 반환
 *
 * @returns Google Cloud Service Account JSON 객체 또는 undefined
 */
export function getGoogleCredentials(): GoogleCredentials | undefined {
  // Vercel 환경: Base64 디코딩
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64) {
    try {
      const decoded = Buffer.from(
        process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64,
        "base64"
      ).toString("utf-8");

      return JSON.parse(decoded) as GoogleCredentials;
    } catch (error) {
      console.error("Failed to decode GOOGLE_APPLICATION_CREDENTIALS_BASE64:", error);
      throw new Error("Invalid Google credentials format");
    }
  }

  // 로컬 환경: 파일 경로 사용 (google-auth-library가 자동으로 읽음)
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    // 파일 경로가 있으면 undefined 반환 (라이브러리가 자동으로 처리)
    return undefined;
  }

  // ADC (Application Default Credentials) 사용
  // gcloud auth application-default login 실행한 경우
  return undefined;
}

/**
 * Google Cloud 프로젝트 ID 반환
 */
export function getGoogleProjectId(): string {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;

  if (!projectId) {
    throw new Error("GOOGLE_CLOUD_PROJECT environment variable is required");
  }

  return projectId;
}

/**
 * Google Cloud 리전 반환
 */
export function getGoogleLocation(): string {
  return process.env.GOOGLE_CLOUD_LOCATION || "us-central1";
}
