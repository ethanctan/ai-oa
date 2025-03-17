// routes/chat.js
import express from "express";
import { getChatResponse } from "../controllers/chatController.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { messages } = req.body;
    const reply = await getChatResponse(messages);
    res.json({ reply });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
