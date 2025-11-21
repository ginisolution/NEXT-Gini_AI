
import { GoogleAuth } from "google-auth-library";

async function main() {
    const projectId = "bold-network-478100-e6";
    const location = "us-central1";
    const operationId = "796102aa-f692-463d-b1ab-67b2e8c98bbe"; // From logs

    // Path 1: The one from the logs (failing on v1)
    const path1 = `projects/${projectId}/locations/${location}/publishers/google/models/veo-3.1-generate-preview/operations/${operationId}`;

    // Path 3: Publisher operations path
    const path3 = `projects/${projectId}/locations/${location}/publishers/google/operations/${operationId}`;

    // Path 2: Standard Vertex AI operation path
    const path2 = `projects/${projectId}/locations/${location}/operations/${operationId}`;

    console.log("Authenticating...");
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

    // Test v1beta1 for Path 1
    await checkPath(path1, token, "Original Path (v1beta1)", "v1beta1");

    // Test v1 for Path 3
    await checkPath(path3, token, "Publisher Ops Path (v1)", "v1");

    // List operations to find where it is
    await listOperations(projectId, location, token);
}

async function checkPath(path: string, token: string, label: string, version: string = "v1") {
    const endpoint = `https://us-central1-aiplatform.googleapis.com/${version}/${path}`;
    console.log(`\n--- Checking ${label} ---`);
    console.log(`Endpoint: ${endpoint}`);

    try {
        const response = await fetch(endpoint, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        console.log(`Status: ${response.status} ${response.statusText}`);
        if (response.ok) {
            const data = await response.json();
            console.log("Response:", JSON.stringify(data, null, 2));
        } else {
            const text = await response.text();
            console.log("Error Body:", text.substring(0, 200));
        }
    } catch (error) {
        console.error("Fetch error:", error);
    }
}

async function listOperations(projectId: string, location: string, token: string) {
    // 14. RPC :wait
    const operationName = `projects/${projectId}/locations/${location}/publishers/google/models/veo-3.1-generate-preview/operations/796102aa-f692-463d-b1ab-67b2e8c98bbe`;
    const url = `https://us-central1-aiplatform.googleapis.com/v1beta1/${operationName}:wait`;

    await checkRpc(url, token, operationName, "RPC :wait on Resource");
}

async function checkUrl(url: string, token: string, label: string, projectId?: string) {
    console.log(`\n--- Checking ${label} ---`);
    console.log(`URL: ${url}`);
    const headers: any = { Authorization: `Bearer ${token}` };
    if (projectId) {
        headers["x-goog-user-project"] = projectId;
    }

    try {
        const response = await fetch(url, { headers });
        if (response.ok) {
            const data = await response.json();
            console.log("Response:", JSON.stringify(data, null, 2));
        } else {
            const text = await response.text();
            if (text.includes("<!DOCTYPE html>")) {
                console.log("Error: 404 HTML");
            } else {
                console.log("Error:", text.substring(0, 200));
            }
        }
    } catch (e) {
        console.error("Error:", e);
    }
}

async function checkRpc(url: string, token: string, name: string, label: string) {
    console.log(`\n--- Checking ${label} ---`);
    console.log(`URL: ${url}`);
    try {
        const response = await fetch(url, {
            method: "POST", // RPC uses POST? Or GET with params? Usually GET for :get
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            // If it's GET, body is ignored. If it's POST, we send name.
            // But :get is usually mapped to GET.
            // Let's try GET with name param?
        });
        // Actually, :get is usually a custom verb.
        // Let's try GET url?name=...
        const urlWithParam = `${url}?name=${name}`;
        console.log(`URL with param: ${urlWithParam}`);
        const response2 = await fetch(urlWithParam, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (response2.ok) {
            const data = await response2.json();
            console.log("Response:", JSON.stringify(data, null, 2));
        } else {
            const text = await response2.text();
            console.log("Error:", text.substring(0, 200));
        }

    } catch (e) {
        console.error("Error:", e);
    }
}

main().catch(console.error);
