import "server-only";
import { createServiceClient } from "./server";

/**
 * Supabase Storage 유틸리티
 *
 * assets 버킷에 파일 업로드/삭제
 */

const ASSETS_BUCKET = "assets";

/**
 * 파일 경로 정규화 (한글 및 특수문자 처리)
 *
 * @param path - 원본 경로
 * @returns 정규화된 경로 (한글은 영문으로 변환)
 */
function normalizePath(path: string): string {
  // 경로를 슬래시로 분리
  const parts = path.split("/");

  // 각 부분을 정규화 (파일명만 인코딩, 디렉토리는 유지)
  const normalized = parts.map((part, index) => {
    // 마지막 부분(파일명)만 처리
    if (index === parts.length - 1) {
      // 파일명과 확장자 분리
      const lastDotIndex = part.lastIndexOf(".");
      if (lastDotIndex === -1) return part;

      const name = part.substring(0, lastDotIndex);
      const ext = part.substring(lastDotIndex);

      // 한글 및 특수문자를 타임스탬프로 대체
      const safeName = /[^\w\-.]/.test(name)
        ? `file_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
        : name;

      return `${safeName}${ext}`;
    }
    return part;
  });

  return normalized.join("/");
}

/**
 * 파일 업로드
 *
 * @param file - File 객체
 * @param path - 저장 경로 (예: "projects/abc123/avatar.png")
 * @returns 업로드된 파일의 공개 URL
 */
export async function uploadFile(
  file: File,
  path: string
): Promise<{ url: string; path: string }> {
  const supabase = createServiceClient();

  // 한글 및 특수문자가 포함된 경로 정규화
  const normalizedPath = normalizePath(path);

  const { data, error } = await supabase.storage
    .from(ASSETS_BUCKET)
    .upload(normalizedPath, file, {
      cacheControl: "3600",
      upsert: true, // 같은 경로에 파일이 있으면 덮어쓰기
    });

  if (error) {
    throw new Error(`Failed to upload file: ${error.message}`);
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(ASSETS_BUCKET).getPublicUrl(data.path);

  return {
    url: publicUrl,
    path: data.path,
  };
}

/**
 * 버퍼에서 파일 업로드 (크기에 따라 자동으로 적절한 방식 선택)
 *
 * @param buffer - Buffer 데이터
 * @param path - 저장 경로
 * @param contentType - MIME 타입
 * @returns 업로드된 파일의 공개 URL
 */
export async function uploadFromBuffer(
  buffer: Buffer,
  path: string,
  contentType: string
): Promise<{ url: string; path: string }> {
  const MAX_STANDARD_SIZE = 50 * 1024 * 1024; // 50MB
  const bufferSize = buffer.length;

  console.log(`[Storage] Uploading buffer: ${(bufferSize / 1024 / 1024).toFixed(2)} MB`);

  // 50MB 이상이면 resumable upload 사용
  if (bufferSize > MAX_STANDARD_SIZE) {
    console.log(`[Storage] Using resumable upload for large file (${(bufferSize / 1024 / 1024).toFixed(2)} MB)`);
    return uploadLargeBuffer(buffer, path, contentType);
  }

  // 50MB 이하는 표준 업로드
  const supabase = createServiceClient();
  const normalizedPath = normalizePath(path);

  const { data, error } = await supabase.storage
    .from(ASSETS_BUCKET)
    .upload(normalizedPath, buffer, {
      cacheControl: "3600",
      upsert: true,
      contentType,
    });

  if (error) {
    console.error(`[Storage] Upload failed for ${normalizedPath}:`, error);
    const errorDetails = typeof error === "object"
      ? JSON.stringify(error, null, 2)
      : String(error);
    throw new Error(
      `Failed to upload buffer to ${normalizedPath}\n` +
      `Size: ${(buffer.length / 1024 / 1024).toFixed(2)} MB\n` +
      `Error: ${errorDetails}`
    );
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(ASSETS_BUCKET).getPublicUrl(data.path);

  return {
    url: publicUrl,
    path: data.path,
  };
}

/**
 * 대용량 버퍼 업로드 (50MB 이상)
 * Supabase resumable upload 사용
 *
 * @param buffer - Buffer 데이터
 * @param path - 저장 경로
 * @param contentType - MIME 타입
 * @returns 업로드된 파일의 공개 URL
 */
async function uploadLargeBuffer(
  buffer: Buffer,
  path: string,
  contentType: string
): Promise<{ url: string; path: string }> {
  const supabase = createServiceClient();
  const normalizedPath = normalizePath(path);

  // Blob으로 변환 (resumable upload는 Blob/File 필요)
  // Buffer에서 ArrayBuffer를 추출하여 타입 호환성 보장
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  const blob = new Blob([arrayBuffer], { type: contentType });

  const { data, error } = await supabase.storage
    .from(ASSETS_BUCKET)
    .upload(normalizedPath, blob, {
      cacheControl: "3600",
      upsert: true,
      contentType,
    });

  if (error) {
    console.error(`[Storage] Large upload failed for ${normalizedPath}:`, error);
    const errorDetails = typeof error === "object"
      ? JSON.stringify(error, null, 2)
      : String(error);
    throw new Error(
      `Failed to upload large buffer to ${normalizedPath}\n` +
      `Size: ${(buffer.length / 1024 / 1024).toFixed(2)} MB\n` +
      `Error: ${errorDetails}`
    );
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(ASSETS_BUCKET).getPublicUrl(data.path);

  console.log(`[Storage] Large file uploaded successfully: ${normalizedPath}`);

  return {
    url: publicUrl,
    path: data.path,
  };
}

/**
 * URL에서 파일 다운로드 후 Supabase에 업로드
 *
 * @param url - 원본 파일 URL
 * @param path - 저장 경로
 * @returns 업로드된 파일의 공개 URL
 */
export async function uploadFromUrl(
  url: string,
  path: string
): Promise<{ url: string; path: string }> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch file from URL: ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") || "application/octet-stream";

  // uploadFromBuffer에서 이미 normalizePath를 호출하므로 여기서는 추가로 처리하지 않음
  return uploadFromBuffer(buffer, path, contentType);
}

/**
 * 파일 다운로드 (재시도 로직 포함)
 *
 * @param path - 파일 경로
 * @param maxRetries - 최대 재시도 횟수 (기본 3회)
 * @returns Blob
 */
export async function downloadFile(
  path: string,
  maxRetries = 3
): Promise<Blob> {
  const supabase = createServiceClient();

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(
        `[Storage] Downloading file (attempt ${attempt}/${maxRetries}): ${path}`
      );

      const { data, error } = await supabase.storage
        .from(ASSETS_BUCKET)
        .download(path);

      if (error) {
        // Supabase 에러 객체를 명확하게 출력
        const errorMessage = typeof error === "object"
          ? JSON.stringify(error, null, 2)
          : String(error);

        lastError = new Error(
          `Supabase download error (attempt ${attempt}/${maxRetries})\n` +
          `Path: ${path}\n` +
          `Bucket: ${ASSETS_BUCKET}\n` +
          `Error: ${errorMessage}`
        );

        console.error(lastError.message);

        // 마지막 시도가 아니면 재시도
        if (attempt < maxRetries) {
          const delayMs = attempt * 1000; // 1초, 2초, 3초 대기
          console.log(`[Storage] Retrying in ${delayMs}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }

        throw lastError;
      }

      console.log(
        `[Storage] Download successful: ${path} (${(data.size / 1024).toFixed(2)} KB)`
      );
      return data;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // 마지막 시도가 아니면 재시도
      if (attempt < maxRetries) {
        const delayMs = attempt * 1000;
        console.log(`[Storage] Error occurred, retrying in ${delayMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      throw lastError;
    }
  }

  throw lastError || new Error(`Failed to download file after ${maxRetries} attempts: ${path}`);
}

/**
 * 파일 삭제
 *
 * @param path - 삭제할 파일 경로
 */
export async function deleteFile(path: string): Promise<void> {
  const supabase = createServiceClient();

  const { error } = await supabase.storage.from(ASSETS_BUCKET).remove([path]);

  if (error) {
    throw new Error(`Failed to delete file: ${error.message}`);
  }
}

/**
 * 여러 파일 삭제
 *
 * @param paths - 삭제할 파일 경로 배열
 */
export async function deleteFiles(paths: string[]): Promise<void> {
  const supabase = createServiceClient();

  const { error } = await supabase.storage.from(ASSETS_BUCKET).remove(paths);

  if (error) {
    throw new Error(`Failed to delete files: ${error.message}`);
  }
}

/**
 * 공개 URL 가져오기
 *
 * @param path - 파일 경로
 * @returns 공개 URL
 */
export function getPublicUrl(path: string): string {
  const supabase = createServiceClient();

  const {
    data: { publicUrl },
  } = supabase.storage.from(ASSETS_BUCKET).getPublicUrl(path);

  return publicUrl;
}

/**
 * 서명된 URL 생성 (임시 접근 URL)
 *
 * @param path - 파일 경로
 * @param expiresIn - 만료 시간 (초, 기본 3600 = 1시간)
 * @returns 서명된 URL
 */
export async function createSignedUrl(
  path: string,
  expiresIn: number = 3600
): Promise<string> {
  const supabase = createServiceClient();

  const { data, error } = await supabase.storage
    .from(ASSETS_BUCKET)
    .createSignedUrl(path, expiresIn);

  if (error) {
    throw new Error(`Failed to create signed URL: ${error.message}`);
  }

  return data.signedUrl;
}

/**
 * 프로젝트의 모든 파일 삭제
 *
 * @param projectId - 프로젝트 ID
 */
export async function deleteProjectFiles(projectId: string): Promise<void> {
  const supabase = createServiceClient();

  // projects/{projectId}/ 폴더 내 모든 파일 목록 조회
  const { data: files, error: listError } = await supabase.storage
    .from(ASSETS_BUCKET)
    .list(`projects/${projectId}`, {
      limit: 1000,
    });

  if (listError) {
    throw new Error(`Failed to list project files: ${listError.message}`);
  }

  if (!files || files.length === 0) {
    return; // 삭제할 파일 없음
  }

  const paths = files.map((file) => `projects/${projectId}/${file.name}`);
  await deleteFiles(paths);
}
