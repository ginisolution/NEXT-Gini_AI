#!/usr/bin/env tsx

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const allAssets = await prisma.asset.findMany({
    where: {
      projectId: "cmi892g880009sihq8mfiqic1",
      OR: [
        { kind: "background_image" },
        { kind: "background_video" },
      ],
    },
    include: {
      scene: {
        select: {
          sceneNumber: true,
          backgroundAnalysis: true,
        },
      },
    },
    orderBy: [
      { scene: { sceneNumber: "asc" } },
    ],
  });

  console.log("📊 Cloud Knight 프로젝트 전체 배경 Asset:\n");

  const sceneMap = new Map();
  for (const asset of allAssets) {
    const analysis = asset.scene?.backgroundAnalysis as any;
    const metadata = asset.metadata as any;
    const sceneNum = asset.scene?.sceneNumber || 0;

    if (!sceneMap.has(sceneNum)) {
      sceneMap.set(sceneNum, []);
    }
    sceneMap.get(sceneNum).push({
      kind: asset.kind,
      priority: analysis?.priority || "N/A",
      provider: metadata?.provider || "N/A",
      url: asset.url,
    });
  }

  for (const [sceneNum, assets] of Array.from(sceneMap.entries()).sort()) {
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🎬 Scene ${sceneNum}:`);
    for (const asset of assets) {
      console.log(`  - ${asset.kind}`);
      console.log(`    🎯 Priority: ${asset.priority}`);
      console.log(`    📦 Provider: ${asset.provider}`);
      console.log(`    🔗 URL: ${asset.url.substring(0, 60)}...`);
    }
    console.log("");
  }

  await prisma.$disconnect();
}

main();
