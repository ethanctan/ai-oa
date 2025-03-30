// Handle message rendering
function appendMessage(role, content, isSystem = false) {
  const messagesContainer = document.getElementById('messages');
  
  // Create message element
  const messageElement = document.createElement('div');
  messageElement.className = `message ${role === 'user' ? 'user-message' : 'ai-message'}`;
  
  if (isSystem) {
    messageElement.className += ' system-message';
  }
  
  // Create message content
  const contentElement = document.createElement('div');
  contentElement.className = 'message-content';
  contentElement.textContent = content;
  
  // Add content to message
  messageElement.appendChild(contentElement);
  
  // Add message to container
  messagesContainer.appendChild(messageElement);
  
  // Scroll to bottom
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
} 