// routes/chat.js
const express = require('express');
const router = express.Router();

// Import functions from controller
const { getChatResponse } = require('../controllers/chatController');

// POST /chat - Get a chat response from the OpenAI API
router.post("/", async (req, res) => {
  try {
    const { messages } = req.body;
    const reply = await getChatResponse(messages);
    res.json({ reply });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
