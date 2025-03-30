// controllers/chatController.js
require('dotenv').config();
const { AzureOpenAI } = require("openai");
const fs = require('fs');
const path = require('path');

const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
const apiKey = process.env.AZURE_OPENAI_API_KEY;
const apiVersion = process.env.OPENAI_API_VERSION;
const deployment = process.env.AZURE_OPENAI_DEPLOYMENT_NAME; 

// Path to the chat history data file
const CHAT_DATA_FILE = path.join(__dirname, '../data/chat-history.json');

// Store chat history with instanceId as the key
const chatHistories = new Map();

/**
 * Load chat histories from persistent storage
 */
function loadChatHistories() {
  try {
    // Create data directory if it doesn't exist
    const dataDir = path.dirname(CHAT_DATA_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
      console.log(`Created data directory: ${dataDir}`);
    }

    // Check if chat data file exists
    if (!fs.existsSync(CHAT_DATA_FILE)) {
      console.log(`Chat data file does not exist. Creating empty file at: ${CHAT_DATA_FILE}`);
      fs.writeFileSync(CHAT_DATA_FILE, JSON.stringify({}));
      return;
    }

    // Load chat histories
    const data = fs.readFileSync(CHAT_DATA_FILE, 'utf8');
    const chatData = JSON.parse(data);
    
    // Clear current histories
    chatHistories.clear();
    
    // Restore chat histories
    Object.entries(chatData).forEach(([instanceId, history]) => {
      chatHistories.set(instanceId, history);
    });
    
    console.log(`Loaded chat histories for ${chatHistories.size} instances`);
  } catch (error) {
    console.error(`Error loading chat histories: ${error.message}`);
  }
}

/**
 * Save chat histories to persistent storage
 */
function saveChatHistories() {
  try {
    // Convert Map to object for JSON serialization
    const chatData = {};
    chatHistories.forEach((history, instanceId) => {
      chatData[instanceId] = history;
    });
    
    // Save to file
    fs.writeFileSync(CHAT_DATA_FILE, JSON.stringify(chatData, null, 2));
    console.log(`Saved chat histories for ${chatHistories.size} instances`);
  } catch (error) {
    console.error(`Error saving chat histories: ${error.message}`);
  }
}

/**
 * Get chat history for a specific instance
 * @param {string} instanceId - The instance ID
 * @returns {Array} The chat history
 */
function getChatHistory(instanceId) {
  if (!instanceId) {
    return [];
  }
  
  // Get the chat history or return an empty array if none exists
  return chatHistories.get(instanceId) || [];
}

/**
 * Add a message to the chat history
 * @param {string} instanceId - The instance ID
 * @param {Object} message - The message to add
 * @returns {Array} The updated chat history
 */
function addChatMessage(instanceId, message) {
  if (!instanceId) {
    throw new Error('Instance ID is required');
  }
  
  // Get the existing history or create a new one
  const history = chatHistories.get(instanceId) || [];
  
  // Add the new message
  history.push(message);
  
  // Update the history
  chatHistories.set(instanceId, history);
  
  // Save to persistent storage
  saveChatHistories();
  
  return history;
}

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

// Load chat histories on module initialization
loadChatHistories();

module.exports = { 
  getChatResponse,
  getChatHistory,
  addChatMessage 
};

