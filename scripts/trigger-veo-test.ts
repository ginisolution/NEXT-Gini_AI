#!/usr/bin/env tsx

import { inngest } from "@/lib/inngest/client";

async function main() {
  const sceneId = "cmi7kwi090007siys0a35bnmz"; // 씬 1

  console.log("🎬 씬 1 배경 생성 이벤트 트리거 중...");
  console.log(`   Scene ID: ${sceneId}`);
  console.log(`   Priority: High (Veo 영상 생성)`);

  await inngest.send({
    name: "background/generate.requested",
    data: {
      sceneId,
    },
  });

  console.log("✅ 이벤트 전송 완료!");
  console.log("   Inngest Dev Server에서 로그를 확인하세요:");
  console.log("   http://localhost:8288");
}

main().catch((error) => {
  console.error("❌ 에러 발생:", error);
  process.exit(1);
});
