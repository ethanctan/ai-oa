/**
 * This file contains functions for the chat functionality.
 * It interacts with the server to send and receive messages,
 * manage the timer, and handle the interview state.
 */

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

// Send a chat message to the server
async function sendChatMessage(message, instanceId) {
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instanceId,
        message
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error sending chat message:', error);
    throw error;
  }
}

// Start the interview timer
async function startTimer(instanceId, duration = 10 * 60) { // Default 10 minutes
  try {
    const response = await fetch('/api/timer/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instanceId,
        duration
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.timer;
  } catch (error) {
    console.error('Error starting timer:', error);
    throw error;
  }
}

// Get the timer status
async function getTimerStatus(instanceId) {
  try {
    const response = await fetch(`/api/timer/status?instanceId=${instanceId}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.timer;
  } catch (error) {
    console.error('Error getting timer status:', error);
    throw error;
  }
}

// Mark the interview as started
async function setInterviewStarted(instanceId) {
  try {
    const response = await fetch('/api/timer/interview-started', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instanceId })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.timer;
  } catch (error) {
    console.error('Error marking interview as started:', error);
    throw error;
  }
}

// Format time remaining for display (MM:SS)
function formatTimeRemaining(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// Update the UI based on the timer status
function updateTimerUI(timerStatus) {
  const timerElement = document.getElementById('timer');
  const timerSection = document.getElementById('timer-section');
  const timerInfo = document.getElementById('timer-info');
  const chatInput = document.getElementById('chat-input');
  const chatSubmit = document.getElementById('chat-submit');
  
  if (!timerStatus) {
    console.error('No timer status provided');
    return;
  }
  
  // Update the timer display
  if (timerElement) {
    const timeRemainingMs = timerStatus.timeRemainingMs || 0;
    timerElement.textContent = formatTimeRemaining(timeRemainingMs);
    
    if (timerStatus.isExpired) {
      timerElement.classList.add('expired');
    }
  }
  
  // If interview has already started, update UI accordingly
  if (timerStatus.interviewStarted) {
    // Hide timer controls
    if (timerSection) timerSection.classList.add('hidden');
    if (timerInfo) timerInfo.classList.add('hidden');
    
    // Enable chat input
    if (chatInput) chatInput.disabled = false;
    if (chatSubmit) chatSubmit.disabled = false;
  }
}

// Check existing timer and update UI on page load
async function checkExistingTimer(instanceId) {
  if (!instanceId) {
    console.error('No instance ID provided to check timer');
    return;
  }
  
  try {
    const timerStatus = await getTimerStatus(instanceId);
    
    // Update the UI based on timer status
    updateTimerUI(timerStatus);
    
    // If the timer is active, set up interval to update it
    if (timerStatus.active && !timerStatus.isExpired) {
      const endTime = timerStatus.endTimeMs;
      
      // Update timer display every second
      setInterval(() => {
        const now = Date.now();
        const timeRemaining = Math.max(0, endTime - now);
        
        // Update timer display
        const timerElement = document.getElementById('timer');
        if (timerElement) {
          timerElement.textContent = formatTimeRemaining(timeRemaining);
          
          // If timer expired during this session
          if (timeRemaining <= 0) {
            timerElement.classList.add('expired');
            
            // Auto-start interview if not already started and timer expired
            if (!timerStatus.interviewStarted) {
              setInterviewStarted(instanceId);
              updateTimerUI({
                ...timerStatus,
                interviewStarted: true
              });
            }
          }
        }
      }, 1000);
    }
  } catch (error) {
    console.error('Error checking existing timer:', error);
  }
}

// Export functions
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    sendChatMessage,
    startTimer,
    getTimerStatus,
    setInterviewStarted,
    formatTimeRemaining,
    updateTimerUI,
    checkExistingTimer
  };
} 