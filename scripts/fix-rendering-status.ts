/**
 * rendering 상태로 멈춰있는 프로젝트를 scenes_processed로 업데이트
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.project.updateMany({
    where: { status: "rendering" },
    data: { status: "scenes_processed" },
  });

  console.log(`✅ Updated ${result.count} project(s) from 'rendering' to 'scenes_processed'`);
}

main()
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
