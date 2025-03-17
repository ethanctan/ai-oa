// controllers/chatController.js
const ModelClient = require("@azure-rest/ai-inference").default;
const { DefaultAzureCredential } = require("@azure/identity");

const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
const deploymentId = process.env.AZURE_OPENAI_DEPLOYMENT_ID;
const apiVersion = process.env.AZURE_OPENAI_API_VERSION;

/**
 * Calls the Azure OpenAI API to get a chat response.
 * @param {Object} param0 - An object with a "messages" property. Expected format:
 *  [
 *    { role: "system", content: "<System prompt here>" },
 *    { role: "user", content: "First user message" },
 *    { role: "assistant", content: "First assistant response" },
 *    ...
 *  ]
 * @returns {Promise<string>} - The chat response.
 */
async function getChatResponse({ messages }) {
  const client = new ModelClient(endpoint, new DefaultAzureCredential());
  const path = `/openai/deployments/${deploymentId}/chat/completions`;

  const response = await client.path(path).post({
    queryParameters: { "api-version": apiVersion },
    body: {
      messages,
      temperature: 1.0,
      top_p: 1.0,
      max_tokens: 1000
    }
  });

  if (response.status !== "200") {
    throw new Error(response.body.error);
  }
  return response.body.choices[0].message.content;
}

module.exports = { getChatResponse };
