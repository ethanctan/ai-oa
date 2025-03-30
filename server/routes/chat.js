// routes/chat.js
const express = require('express');
const router = express.Router();

// Import functions from controller
const { getChatResponse, getChatHistory, addChatMessage } = require('../controllers/chatController');

// POST /chat - Get a chat response from the OpenAI API
router.post("/", async (req, res) => {
  try {
    console.log('Received chat request:', JSON.stringify(req.body, null, 2));
    
    // The client sends { payload: { messages: [...] } }
    const messages = req.body.payload?.messages;
    const instanceId = req.body.instanceId || req.query.instanceId;
    
    if (!messages) {
      throw new Error('No messages array found in request payload');
    }
    
    console.log(`Processing chat with ${messages.length} messages for instance ${instanceId || 'unknown'}`);
    const reply = await getChatResponse({ messages });
    
    // If we have an instance ID, save the messages to history
    if (instanceId) {
      // First, add the user's last message (if any)
      const userMessages = messages.filter(m => m.role === 'user');
      if (userMessages.length > 0) {
        const lastUserMessage = userMessages[userMessages.length - 1];
        addChatMessage(instanceId, { role: 'user', content: lastUserMessage.content });
      }
      
      // Then add the AI response
      addChatMessage(instanceId, { role: 'assistant', content: reply });
    }
    
    res.json({ reply });
  } catch (error) {
    console.error('Error in chat route:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /chat/history - Get chat history for an instance
router.get("/history", (req, res) => {
  try {
    const { instanceId } = req.query;
    
    if (!instanceId) {
      return res.status(400).json({
        success: false,
        error: 'Instance ID is required'
      });
    }
    
    console.log(`Getting chat history for instance ${instanceId}`);
    const history = getChatHistory(instanceId);
    
    res.json({
      success: true,
      instanceId,
      history
    });
  } catch (error) {
    console.error(`Error getting chat history: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /chat/message - Add a message to chat history
router.post("/message", (req, res) => {
  try {
    const { instanceId, message } = req.body;
    
    if (!instanceId) {
      return res.status(400).json({
        success: false,
        error: 'Instance ID is required'
      });
    }
    
    if (!message || !message.role || !message.content) {
      return res.status(400).json({
        success: false,
        error: 'Valid message with role and content is required'
      });
    }
    
    console.log(`Adding message to chat history for instance ${instanceId}`);
    const history = addChatMessage(instanceId, message);
    
    res.json({
      success: true,
      instanceId,
      history
    });
  } catch (error) {
    console.error(`Error adding chat message: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;