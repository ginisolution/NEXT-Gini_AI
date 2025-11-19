"use client";

import { createClient } from "./client";
import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * Supabase Realtime 헬퍼
 *
 * 실시간 데이터 변경 감지 및 브로드캐스트
 */

/**
 * 프로젝트 렌더링 상태 구독
 *
 * @param projectId - 프로젝트 ID
 * @param callback - 상태 업데이트 콜백
 * @returns RealtimeChannel (구독 해제용)
 */
export function subscribeToProjectStatus(
  projectId: string,
  callback: (payload: Record<string, unknown>) => void
): RealtimeChannel {
  const supabase = createClient();

  const channel = supabase
    .channel(`project:${projectId}:status`)
    .on("broadcast", { event: "status" }, (payload) => {
      callback(payload.payload);
    })
    .subscribe();

  return channel;
}

/**
 * 문서 처리 상태 구독
 *
 * @param documentId - 문서 ID
 * @param callback - 상태 업데이트 콜백
 * @returns RealtimeChannel (구독 해제용)
 */
export function subscribeToDocumentStatus(
  documentId: string,
  callback: (payload: Record<string, unknown>) => void
): RealtimeChannel {
  const supabase = createClient();

  const channel = supabase
    .channel(`document:${documentId}:status`)
    .on("broadcast", { event: "status" }, (payload) => {
      callback(payload.payload);
    })
    .subscribe();

  return channel;
}

/**
 * 씬 처리 상태 구독
 *
 * @param sceneId - 씬 ID
 * @param callback - 상태 업데이트 콜백
 * @returns RealtimeChannel (구독 해제용)
 */
export function subscribeToSceneStatus(
  sceneId: string,
  callback: (payload: Record<string, unknown>) => void
): RealtimeChannel {
  const supabase = createClient();

  const channel = supabase
    .channel(`scene:${sceneId}:status`)
    .on("broadcast", { event: "status" }, (payload) => {
      callback(payload.payload);
    })
    .subscribe();

  return channel;
}

/**
 * 상태 브로드캐스트 (서버에서 호출)
 *
 * @param channelName - 채널 이름
 * @param payload - 전송할 데이터
 */
export async function broadcastStatus(
  channelName: string,
  payload: Record<string, unknown>
): Promise<void> {
  const supabase = createClient();

  await supabase.channel(channelName).send({
    type: "broadcast",
    event: "status",
    payload,
  });
}
