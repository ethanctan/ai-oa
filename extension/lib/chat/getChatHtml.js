// lib/chat/getChatHtml.js

function getChatHtml() {
    return `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Chat Interface</title>
    <style>
      /* Basic styles for the chat interface */
      body {
        font-family: sans-serif;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        height: 100vh;
      }
      #chat-log {
        flex: 1;
        overflow-y: auto;
        padding: 10px;
        border-bottom: 1px solid #ccc;
        background-color: #f9f9f9;
      }
      #chat-form {
        display: flex;
        padding: 10px;
        background: #eee;
      }
      #chat-input {
        flex: 1;
        padding: 5px;
        font-size: 1rem;
      }
      #chat-submit {
        margin-left: 10px;
        padding: 5px 10px;
        font-size: 1rem;
      }
      .chat-message {
        margin-bottom: 8px;
      }
      .user {
        color: blue;
      }
      .bot {
        color: green;
      }
    </style>
  </head>
  <body>
    <div id="chat-log"></div>
    <form id="chat-form">
      <input id="chat-input" type="text" placeholder="Type your message..." autocomplete="off" />
      <button id="chat-submit" type="submit">Send</button>
    </form>
    <script>
      (function() {
        const vscode = acquireVsCodeApi();
        const chatLog = document.getElementById('chat-log');
        const chatForm = document.getElementById('chat-form');
        const chatInput = document.getElementById('chat-input');
  
        function appendMessage(sender, text) {
          const messageElem = document.createElement('div');
          messageElem.className = 'chat-message ' + sender;
          messageElem.textContent = sender + ': ' + text;
          chatLog.appendChild(messageElem);
          chatLog.scrollTop = chatLog.scrollHeight;
        }
  
        chatForm.addEventListener('submit', async (event) => {
          event.preventDefault();
          const message = chatInput.value.trim();
          if (!message) return;
          appendMessage('user', message);
          chatInput.value = '';
  
          // Replace with your backend endpoint integration.
          try {
            const response = await fetch('https://your-backend-api.com/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ message })
            });
            const data = await response.json();
            appendMessage('bot', data.reply || 'No reply');
          } catch (error) {
            appendMessage('bot', 'Error: ' + error.message);
          }
        });
      }());
    </script>
  </body>
  </html>`;
  }

  module.exports = { getChatHtml };