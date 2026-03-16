"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.callAzureAI = callAzureAI;
const openai_1 = require("openai");
function getClient() {
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const apiKey = process.env.AZURE_OPENAI_API_KEY;
    const deployment = process.env.AZURE_DEPLOYMENT_NAME;
    if (!endpoint || !apiKey || !deployment) {
        throw new Error('Azure OpenAI environment variables are not configured.');
    }
    return new openai_1.AzureOpenAI({
        endpoint,
        apiKey,
        deployment,
        apiVersion: '2024-08-01-preview',
    });
}
async function callAzureAI(history, userMessage, systemPrompt) {
    const client = getClient();
    const completion = await client.chat.completions.create({
        model: process.env.AZURE_DEPLOYMENT_NAME,
        messages: [
            { role: 'system', content: systemPrompt },
            ...history,
            { role: 'user', content: userMessage },
        ],
        max_tokens: 800,
        temperature: 0.7,
    });
    return completion.choices[0]?.message?.content ?? '';
}
//# sourceMappingURL=azureAI.js.map