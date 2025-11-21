import { prisma } from "@/lib/prisma";

async function main() {
    const projectId = "cmi892g880009sihq8mfiqic1";
    const project = await prisma.project.findUnique({
        where: { id: projectId },
    });
    console.log(`Project Status: ${project?.status}`);

    const scenes = await prisma.scene.findMany({
        where: { projectId },
        orderBy: { sceneNumber: "asc" },
        include: { assets: true },
    });

    console.log(`Found ${scenes.length} scenes for project ${projectId}`);
    const renderJobs = await prisma.renderJob.findMany({
        where: { projectId },
        orderBy: { createdAt: "desc" },
    });
    console.log(`Render Jobs: ${renderJobs.length}`);
    renderJobs.forEach((job) => {
        console.log(`Job ${job.id}: Status = ${job.status}, Error = ${job.errorMessage}`);
    });
    scenes.forEach((scene) => {
        const analysis = scene.backgroundAnalysis as any;
        console.log(`Scene ${scene.sceneNumber}: Priority = ${analysis?.priority}, Status = ${scene.backgroundStatus}, BackgroundAssetId = ${(scene as any).backgroundAssetId}`);
        console.log(JSON.stringify(scene, null, 2));
    });
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
