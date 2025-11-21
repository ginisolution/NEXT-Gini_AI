import { config } from "dotenv";
config({ path: ".env.local" });
import { inngest } from "@/lib/inngest/client";

async function main() {
    const projectId = "cmi892g880009sihq8mfiqic1";
    const userId = "cmi87skrv0002siiv3mlnd48r"; // From logs

    console.log(`Triggering video/compose.requested for project ${projectId}`);

    await inngest.send({
        name: "video/compose.requested",
        data: {
            projectId,
            userId,
        },
    });

    console.log("Event sent.");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    });
