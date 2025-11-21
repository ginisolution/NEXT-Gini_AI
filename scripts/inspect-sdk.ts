
const aiplatform = require("@google-cloud/aiplatform");

console.log("Top level keys:", Object.keys(aiplatform));

if (aiplatform.v1) {
    console.log("v1 keys:", Object.keys(aiplatform.v1));
}

if (aiplatform.v1beta1) {
    console.log("v1beta1 keys:", Object.keys(aiplatform.v1beta1));
}
