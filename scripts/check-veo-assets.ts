#!/usr/bin/env tsx

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  try {
    console.log("🎬 VEO Background Video Assets 확인 중...\n");

    const videoAssets = await prisma.asset.findMany({
      where: {
        kind: "background_video",
        projectId: "cmi892g880009sihq8mfiqic1", // Cloud Knight
      },
      include: {
        scene: {
          select: {
            sceneNumber: true,
            backgroundStatus: true,
            backgroundAnalysis: true,
          },
        },
      },
      orderBy: {
        sceneId: "asc",
      },
    });

    console.log(`📊 총 ${videoAssets.length}개의 background_video Assets:\n`);

    for (const asset of videoAssets) {
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`🆔 Asset ID: ${asset.id}`);
      console.log(`🎬 Scene: ${asset.scene?.sceneNumber || "N/A"}`);
      console.log(`📊 Background Status: ${asset.scene?.backgroundStatus || "N/A"}`);
      console.log(`🔗 URL: ${asset.url}`);
      console.log(`📂 Storage Path: ${asset.storagePath || "N/A"}`);
      console.log(`📅 Created: ${asset.createdAt.toISOString()}`);

      if (asset.scene?.backgroundAnalysis) {
        const analysis = asset.scene.backgroundAnalysis as any;
        console.log(`🎯 Priority: ${analysis.priority || "N/A"}`);
      }

      if (asset.metadata) {
        console.log(`\n📋 Metadata:`);
        const metadata = asset.metadata as any;
        console.log(`  - Provider: ${metadata.provider || "N/A"}`);
        console.log(`  - Operation: ${metadata.operationName || "N/A"}`);
        console.log(`  - Cost: $${metadata.cost || 0}`);
        console.log(`  - Mocked: ${metadata.mocked || false}`);
      }

      console.log("");
    }
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
