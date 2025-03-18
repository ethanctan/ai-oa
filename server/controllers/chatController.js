// controllers/chatController.js
require('dotenv').config();
const { AzureOpenAI } = require("openai");

const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
const apiKey = process.env.AZURE_OPENAI_API_KEY;
const apiVersion = process.env.OPENAI_API_VERSION;
const deployment = process.env.AZURE_OPENAI_DEPLOYMENT_NAME; 

/**
 * Calls the Azure OpenAI API to get a chat response.
 * @param {Object} param0 - An object with a "messages" property.
 *   Expected format:
 *     [
 *       { role: "system", content: "<System prompt here>" },
 *       { role: "user", content: "First user message" },
 *       { role: "assistant", content: "First assistant response" },
 *       ...
 *     ]
 * @returns {Promise<string>} - The chat response.
 */
async function getChatResponse({ messages }) {
  try {
    // Create an AzureOpenAI client with the given configuration.
    const client = new AzureOpenAI({ endpoint, apiKey, apiVersion, deployment });

    // Call the chat completions API with the provided messages.
    const result = await client.chat.completions.create({
      messages,
      // Pass additional parameters such as temperature, top_p, max_tokens if needed
    });

    // Check if the result contains choices and return the first reply.
    if (result.choices && result.choices.length > 0) {
      return result.choices[0].message.content;
    } else {
      throw new Error("No choices returned from Azure OpenAI");
    }
  } catch (error) {
    throw new Error("Error calling Azure OpenAI: " + error.message);
  }
}

module.exports = { getChatResponse };

