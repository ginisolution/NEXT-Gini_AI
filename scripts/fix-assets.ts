import { prisma } from "@/lib/prisma";

async function main() {
    const projectId = "cmi892g880009sihq8mfiqic1";
    const scenes = await prisma.scene.findMany({
        where: { projectId },
        include: { assets: true },
    });

    console.log(`Checking ${scenes.length} scenes for orphaned assets...`);

    for (const scene of scenes) {
        if (scene.backgroundAssetId && (!scene.assets || scene.assets.length === 0)) {
            console.log(`Scene ${scene.sceneNumber} has backgroundAssetId ${scene.backgroundAssetId} but no linked assets. Fixing...`);

            // Link the asset to the scene
            await prisma.asset.update({
                where: { id: scene.backgroundAssetId },
                data: { sceneId: scene.id },
            });
            console.log(`Linked Asset ${scene.backgroundAssetId} to Scene ${scene.id}`);
        }
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
