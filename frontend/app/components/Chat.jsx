// app/components/Chat.jsx

import { useState } from "react";

export default function Chat() {
  const [messages, setMessages] = useState([{ role: "system", content: "Ask me anything!" }]);
  const [input, setInput] = useState("");

  async function sendMessage() {
    const newMessages = [...messages, { role: "user", content: input }];
    setMessages(newMessages);

    // Call our Remix API endpoint for chat responses
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: newMessages }),
    });
    const data = await response.json();

    setMessages([...newMessages, { role: "assistant", content: data.reply }]);
    setInput("");
  }

  return (
    <div style={{ padding: "1rem", height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, overflowY: "auto", marginBottom: "1rem" }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ marginBottom: "0.5rem" }}>
            <strong>{msg.role}:</strong> {msg.content}
          </div>
        ))}
      </div>
      <div style={{ display: "flex" }}>
        <input
          style={{ flex: 1 }}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message"
        />
        <button onClick={sendMessage}>Send</button>
      </div>
    </div>
  );
}
