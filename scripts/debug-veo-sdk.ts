
import { PredictionServiceClient } from "@google-cloud/aiplatform";
import { GoogleAuth } from "google-auth-library";

async function main() {
    const projectId = "bold-network-478100-e6";
    const location = "us-central1";
    const operationName = `projects/${projectId}/locations/${location}/publishers/google/models/veo-3.1-generate-preview/operations/796102aa-f692-463d-b1ab-67b2e8c98bbe`;

    console.log("Using AI Platform SDK to poll operation...");
    console.log("Operation Name:", operationName);

    const clientOptions = {
        apiEndpoint: `${location}-aiplatform.googleapis.com`,
    };

    const predictionServiceClient = new PredictionServiceClient(clientOptions);

    try {
        // The SDK has a method to check LRO status
        // Usually checkLongRunningOperation or similar, but for generic operations we might need OperationsClient

        let operation;

        // Try to import OperationsClient from the package directly
        try {
            const aiplatform = require("@google-cloud/aiplatform");
            // Check if v1beta1 exists
            if (aiplatform.v1beta1 && aiplatform.v1beta1.OperationsClient) {
                console.log("Using aiplatform.v1beta1.OperationsClient...");
                const opsClient = new aiplatform.v1beta1.OperationsClient(clientOptions);
                const [op] = await opsClient.getOperation({ name: operationName });
                console.log("OpsClient Result:", JSON.stringify(op, null, 2));
                operation = op;
            } else {
                console.log("aiplatform.v1beta1.OperationsClient NOT found");
                // Check if it's under protos?
                // console.log("v1beta1 keys:", Object.keys(aiplatform.v1beta1 || {}));
            }
        } catch (e) {
            console.error("Error requiring OperationsClient:", e);
        }

        console.log("SDK Operation Result:", JSON.stringify(operation, null, 2));

        if (operation.done) {
            console.log("Operation is DONE");
            if (operation.response) {
                console.log("Response:", JSON.stringify(operation.response, null, 2));
            }
            if (operation.error) {
                console.log("Error:", JSON.stringify(operation.error, null, 2));
            }
        } else {
            console.log("Operation is STILL RUNNING");
        }

    } catch (error) {
        console.error("SDK Error:", error);
    }
}

main().catch(console.error);
