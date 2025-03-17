// controllers/chatController.js
import ModelClient from "@azure-rest/ai-inference";
import { DefaultAzureCredential } from "@azure/identity";

const endpoint = process.env.AZURE_OPENAI_ENDPOINT; // e.g. "https://ai-oa-chatbot.openai.azure.com"
const deploymentId = process.env.AZURE_OPENAI_DEPLOYMENT_ID; // e.g. "gpt-4o"
const apiVersion = process.env.AZURE_OPENAI_API_VERSION || "2023-03-15-preview";

/**
 * Calls the Azure OpenAI Chat Completions API with the provided messages.
 * @param {Array} messages - Array of message objects in the format expected by OpenAI.
 * @returns {Promise<string>} - The response message content.
 */
export async function getChatResponse(messages) {
  // Create a new ModelClient instance with default credentials.
  const client = new ModelClient(endpoint, new DefaultAzureCredential());

  // Build the path with deploymentId and pass the API version as a query parameter.
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
  // Return the first response message from the API.
  return response.body.choices[0].message.content;
}

// TODO: Implement streaming