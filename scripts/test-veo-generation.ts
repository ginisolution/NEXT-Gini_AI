import { GoogleAuth } from "google-auth-library";

async function main() {
    const projectId = "bold-network-478100-e6";
    const location = "us-central1";
    const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/veo-3.1-generate-preview:predictLongRunning`;

    console.log("Endpoint:", endpoint);

    const auth = new GoogleAuth({
        scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
    const client = await auth.getClient();
    const accessTokenResponse = await client.getAccessToken();
    const token = accessTokenResponse.token;

    if (!token) {
        console.error("Failed to get token");
        return;
    }

    // Dummy image (1x1 pixel transparent png base64)
    const imageBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    const requestBody = {
        instances: [
            {
                prompt: "A cinematic shot of a futuristic city, 8 seconds duration",
                image: {
                    bytesBase64Encoded: imageBase64,
                    mimeType: "image/png"
                }
            }
        ],
        parameters: {
            aspectRatio: "16:9",
            resolution: "720p",
            sampleCount: 1
        }
    };

    console.log("Sending request...");

    try {
        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(requestBody)
        });

        console.log("Status:", response.status, response.statusText);

        const data = await response.json();
        console.log("Response Body:", JSON.stringify(data, null, 2));

        if (data.name) {
            console.log("\n--- Attempting to Poll Operation ---");
            const operationName = data.name;
            // Try to poll using the name as is
            const pollUrl = `https://${location}-aiplatform.googleapis.com/v1/${operationName}`;
            console.log("Poll URL:", pollUrl);

            const pollResponse = await fetch(pollUrl, {
                headers: { Authorization: `Bearer ${token}` }
            });

            console.log("Poll Status:", pollResponse.status);
            if (pollResponse.ok) {
                const pollData = await pollResponse.json();
                console.log("Poll Data:", JSON.stringify(pollData, null, 2));
            } else {
                const text = await pollResponse.text();
                console.log("Poll Error:", text.substring(0, 500));
            }
        }

    } catch (error) {
        console.error("Error:", error);
    }
}

main().catch(console.error);
