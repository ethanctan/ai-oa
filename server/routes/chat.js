const express = require('express');
const fetch = require('node-fetch'); // Install via npm install node-fetch
const router = express.Router();

// Ensure you have your OpenAI API key stored in an environment variable.
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

router.post('/', async (req, res) => {
  const { message, workspaceContext } = req.body;
  
  // Construct your prompt. You can include workspaceContext if needed.
  // For example, you might combine a system prompt with the user's message:
  const messages = [
    {
      role: "system",
      content: "You are an assistant helping with a technical assessment. Use the workspace context to give detailed answers."
    },
    {
      role: "user",
      content: workspaceContext ? `${workspaceContext}\nUser: ${message}` : message
    }
  ];

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages,
        temperature: 0.7
      })
    });
    
    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.error });
    }
    
    const reply = data.choices[0].message.content;
    res.json({ reply });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
