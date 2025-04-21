// lib/chat/openChat.js

const vscode = require('vscode');
const { getChatHtml } = require('./getChatHtml');
const { getWorkspaceContent } = require('../context/getWorkspaceContent');

const SERVER_URL = 'http://host.docker.internal:3000';
const SERVER_TIMER_START_URL = `${SERVER_URL}/timer/start`;
const SERVER_TIMER_STATUS_URL = `${SERVER_URL}/timer/status`;
const SERVER_TIMER_INTERVIEW_STARTED_URL = `${SERVER_URL}/timer/interview-started`;
const SERVER_CHAT_URL = `${SERVER_URL}/chat`;

// Global variables to store environment prompts - accessed throughout the module
let globalInitialPrompt = '';
let globalFinalPrompt = '';
let globalAssessmentPrompt = '';

// Function to get environment variables 
async function getEnvironmentVariables() {
  try {
    // Execute a command to read environment variables
    const result = await new Promise((resolve, reject) => {
      const { exec } = require('child_process');
      exec('env | grep -E "INITIAL_PROMPT|FINAL_PROMPT|ASSESSMENT_PROMPT|INSTANCE_ID"', (error, stdout, stderr) => {
        if (error) {
          console.error(`Error getting env variables: ${error.message}`);
          // Don't reject - just return empty if there's an issue
          resolve({});
          return;
        }
        
        // Parse the output to get the environment variables
        const env = {};
        stdout.split('\n').forEach(line => {
          const [key, ...valueParts] = line.split('=');
          if (key) {
            env[key] = valueParts.join('=');
          }
        });
        
        resolve(env);
      });
    });
    
    return result;
  } catch (error) {
    console.error('Error getting environment variables:', error);
    return {};
  }
}

// Generate a unique session ID for this extension instance
const sessionId = `vscode-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

// The instance ID will be retrieved from environment variables
let instanceId = null;

function openChat() {
  // If the chat panel already exists, reveal it in the right group.
  if (global.chatPanel) {
    global.chatPanel.reveal(vscode.ViewColumn.Two);
    return;
  }
  
  // Create the webview panel (initially in the first editor group)
  global.chatPanel = vscode.window.createWebviewPanel(
    'sidebar',               // Identifier for the webview type.
    'AI Interviewer',        // Title for the panel.
    vscode.ViewColumn.One,   // Initially show in editor group 1.
    { 
      enableScripts: true,
      retainContextWhenHidden: true  // Keep the webview state when hidden
    }
  );

  // Set the HTML content for the panel.
  global.chatPanel.webview.html = getChatHtml();

  // Listen for messages from the webview.
  global.chatPanel.webview.onDidReceiveMessage(async message => {
    console.log(`Received message from webview: ${message.command}`);
    
    if (message.command === 'getWorkspaceContent') {
      try {
        const includePattern = '*';
        const excludePattern = '**/node_modules/**';
        const content = await getWorkspaceContent(includePattern, excludePattern);
        // Post the content back to the webview
        global.chatPanel.webview.postMessage({ command: 'workspaceContent', content });
      } catch (error) {
        global.chatPanel.webview.postMessage({ command: 'workspaceContent', error: error.message });
      }
    }

    // Handle timer configuration
    if (message.command === 'setTimerConfig') {
      console.log(`Setting timer configuration: ${JSON.stringify(message.config)}`);
      // Store timer configuration in global variable for use in startTimer
      global.timerConfig = message.config;
      global.chatPanel.webview.postMessage({ 
        command: 'timerConfigSet', 
        success: true 
      });
    }

    if (message.command === 'getEnvironmentPrompts') {
      try {
        const envVars = await getEnvironmentVariables();
        
        // Store the instance ID if it's available in the environment
        if (envVars.INSTANCE_ID) {
          instanceId = envVars.INSTANCE_ID;
          console.log(`Found instance ID in environment: ${instanceId}`);
          
          // First fetch chat history separately
          await getChatHistory(instanceId);
          
          // Then check timer status
          await checkTimerAndInterviewStatus(instanceId);
        }
        
        // Store the prompts in global variables for use elsewhere
        globalInitialPrompt = envVars.INITIAL_PROMPT || 'You are a technical interviewer assessing a software engineering candidate. They have been provided with a coding project, which they have not started yet. Instructions for the project have been provided in the README.md file. IMPORTANT: Ask only ONE question at a time about their approach to the project, and wait for their response before asking another question. Start by asking about their initial thoughts on the project requirements.';
        globalFinalPrompt = envVars.FINAL_PROMPT || 'You are a technical interviewer assessing a software engineering candidate. They have been provided with a coding project, which they have now completed. IMPORTANT: Ask only ONE question at a time about their implementation, and wait for their response before asking another question. Start by asking them to explain their overall approach.';
        globalAssessmentPrompt = envVars.ASSESSMENT_PROMPT || '';
        
        global.chatPanel.webview.postMessage({ 
          command: 'environmentPrompts', 
          initialPrompt: globalInitialPrompt,
          finalPrompt: globalFinalPrompt,
          assessmentPrompt: globalAssessmentPrompt,
          instanceId: instanceId
        });
      } catch (error) {
        global.chatPanel.webview.postMessage({ 
          command: 'environmentPrompts', 
          error: error.message,
          initialPrompt: 'You are a technical interviewer assessing a software engineering candidate. They have been provided with a coding project, which they have not started yet. Instructions for the project have been provided in the README.md file. IMPORTANT: Ask only ONE question at a time about their approach to the project, and wait for their response before asking another question. Start by asking about their initial thoughts on the project requirements.',
          finalPrompt: 'You are a technical interviewer assessing a software engineering candidate. They have been provided with a coding project, which they have now completed. IMPORTANT: Ask only ONE question at a time about their implementation, and wait for their response before asking another question. Start by asking them to explain their overall approach.',
          instanceId: instanceId
        });
      }
    }

    if (message.command === 'chatMessage') {
      try {
        // Extract instance id
        const chatInstanceId = message.instanceId || instanceId;
        if (!chatInstanceId) {
          throw new Error('No instance ID provided for chat message');
        }
        
        // Extract user message from the standardized payload format
        let userMessage = null;
        if (message.payload && message.payload.payload && message.payload.payload.messages) {
          // Handle nested payload structure from chat.html
          const messages = message.payload.payload.messages;
          console.log(`Received nested payload with ${messages.length} messages`);
          
          // Log message roles to help diagnose issues
          console.log('Message roles:', messages.map(m => m.role).join(', '));
          
          // Get the last user message
          const userMessages = messages.filter(m => m.role === 'user');
          console.log(`Found ${userMessages.length} user messages in payload`);
          
          if (userMessages.length > 0) {
            userMessage = userMessages[userMessages.length - 1];
            console.log(`User message from payload: ${userMessage.content.substring(0, 30)}...`);
          } else {
            console.error('No user messages found in payload. Message roles:', messages.map(m => m.role).join(', '));
          }
        } else if (message.payload && message.payload.messages) {
          // Handle direct payload structure
          const messages = message.payload.messages;
          console.log(`Received direct payload with ${messages.length} messages`);
          
          // Log message roles to help diagnose issues
          console.log('Message roles:', messages.map(m => m.role).join(', '));
          
          // Get the last user message
          const userMessages = messages.filter(m => m.role === 'user');
          console.log(`Found ${userMessages.length} user messages in payload`);
          
          if (userMessages.length > 0) {
            userMessage = userMessages[userMessages.length - 1];
            console.log(`User message from payload: ${userMessage.content.substring(0, 30)}...`);
          } else {
            console.error('No user messages found in payload. Message roles:', messages.map(m => m.role).join(', '));
          }
        } else {
          console.error('Invalid payload format:', JSON.stringify(message.payload));
        }
        
        if (!userMessage || !userMessage.content) {
          throw new Error('Could not find user message in payload');
        }
        
        // Save the user message to history explicitly
        try {
          console.log('Saving user message to history from chatMessage');
          await fetch(`${SERVER_CHAT_URL}/message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              instanceId: chatInstanceId,
              message: { role: 'user', content: userMessage.content }
            })
          });
          console.log('Successfully saved user message to history');
        } catch (historyError) {
          console.error(`Error saving user message to history: ${historyError.message}`);
        }
        
        // Create a new payload using the standardized format
        const newPayload = {
          instanceId: chatInstanceId,
          skipHistorySave: true,
          payload: {
            messages: [
              // Use the global initial prompt as system message with ending instructions
              { role: "system", content: globalInitialPrompt + " Based on the candidate's responses and the progress of the interview, decide whether to ask the next question or end the interview. If you decide the interview has covered enough topics and should conclude, respond with 'END' as your complete message. Otherwise, ask your next question." },
              // Include the user message
              { role: "user", content: userMessage.content }
            ]
          }
        };
        
        // Log which prompt we're using
        console.log(`Using system prompt: ${globalInitialPrompt.substring(0, 50)}...`);
        
        const response = await fetch(SERVER_CHAT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newPayload)
        });
        
        if (!response.ok) {
          throw new Error('HTTP error ' + response.status);
        }
        
        const data = await response.json();
        
        // Check if the AI is ending the interview
        if (data.reply.trim() === 'END') {
          console.log('AI has decided to end the interview with "END" message');
        }
        
        // Save AI response to history explicitly
        try {
          console.log('Saving AI response to history from chatMessage');
          await fetch(`${SERVER_CHAT_URL}/message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              instanceId: chatInstanceId,
              message: { role: 'assistant', content: data.reply }
            })
          });
          console.log('Successfully saved AI response to history');
        } catch (historyError) {
          console.error(`Error saving AI response to history: ${historyError.message}`);
        }
        
        global.chatPanel.webview.postMessage({ command: 'chatResponse', reply: data.reply });
      } catch (error) {
        global.chatPanel.webview.postMessage({ command: 'chatResponse', error: error.message });
      }
    }

    // Handle starting the interview
    if (message.command === 'startInterview') {
      console.log(`Starting interview for instance: ${message.instanceId}`);
      
      // Mark the interview as started in the server
      await setInterviewStarted(message.instanceId);
      
      // Send a confirmation back to the webview
      global.chatPanel.webview.postMessage({
        command: 'interviewStarted',
        success: true
      });
      
      // Send an initial message to get the first question from the AI
      await sendInitialMessage(message.instanceId);
    }

    // Handle timer start command
    if (message.command === 'startTimer') {
      console.log(`Starting timer for instance: ${message.instanceId}`);
      startTimer(message.instanceId);
    }

    // Handle get timer status command
    if (message.command === 'getTimerStatus') {
      console.log(`Getting timer status for instance: ${message.instanceId}`);
      getTimerStatus(message.instanceId);
    }

    // Handle get chat history command
    if (message.command === 'getChatHistory') {
      console.log(`Getting chat history for instance: ${message.instanceId}`);
      getChatHistory(message.instanceId);
    }

    // Handle sending a chat message
    if (message.command === 'sendChatMessage') {
      console.log(`Sending chat message for instance: ${message.instanceId}`);
      sendChatMessage(message.text, message.instanceId);
    }
    
    // Handle saving interview phase
    if (message.command === 'saveInterviewPhase') {
      console.log(`Saving interview phase ${message.phase} for instance: ${message.instanceId}`);
      saveInterviewPhase(message.instanceId, message.phase);
    }
    
    // Handle submitting workspace content for report generation
    if (message.command === 'submitWorkspaceContent') {
      console.log(`Submitting workspace content for instance: ${message.instanceId}`);
      
      // Submit but don't wait for response to continue with the interview
      submitWorkspaceContent(message.instanceId, message.content)
        .then(() => {
          console.log('Workspace content submitted successfully');
        })
        .catch(error => {
          console.error(`Error submitting workspace content: ${error.message}`);
          // Just log to console, don't send error back to webview
        });
    }
    
    // Handle starting the final interview
    if (message.command === 'startFinalInterview') {
      console.log(`Starting final interview for instance: ${message.instanceId}`);
      
      // Mark the final interview as started in the server
      await setFinalInterviewStarted(message.instanceId);
      
      // Send a confirmation back to the webview
      global.chatPanel.webview.postMessage({
        command: 'finalInterviewStarted',
        success: true
      });
    }
  });

  // Move the panel to the right editor group.
  vscode.commands.executeCommand('workbench.action.moveEditorToRightGroup');

  // Clean up when the panel is closed.
  global.chatPanel.onDidDispose(() => {
    global.chatPanel = undefined;
  });
}

// Send initial message to trigger AI first question
async function sendInitialMessage(instanceId) {
  console.log(`Initial message will be sent directly from chat.html using chatMessage command`);
  
  // This function is now just a placeholder as the chat.html handles sending the initial message
  // using the standard chatMessage framework with all the required system prompts
  
  return { success: true, message: 'Initial message handled by chat.html' };
}

// Handle starting the timer
async function startTimer(instanceId) {
  console.log(`Starting timer for instance: ${instanceId}`);
  
  try {
    // Check if there are any timer configuration parameters
    const timerConfig = global.timerConfig || {};
    
    const response = await fetch(
      SERVER_TIMER_START_URL,
      {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ 
          instanceId,
          enableTimer: timerConfig.enableTimer !== false, // Default to true if not specified
          duration: timerConfig.duration ? timerConfig.duration * 60 : undefined // Convert minutes to seconds
        })
      }
    );
    
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    
    const data = await response.json();
    console.log(`Timer started: ${JSON.stringify(data)}`);
    
    // Send the timer status back to the webview
    if (global.chatPanel) {
      global.chatPanel.webview.postMessage({
        command: 'timerStatus',
        data: data.timer
      });
    }
    
    return data;
  } catch (error) {
    console.error(`Error starting timer: ${error.message}`);
    if (global.chatPanel) {
      global.chatPanel.webview.postMessage({
        command: 'timerStatus',
        data: { 
          error: `Failed to start timer: ${error.message}. Please ensure the server is running at ${SERVER_URL}.` 
        }
      });
    }
    return { error: error.message };
  }
}

// Get the status of a timer
async function getTimerStatus(instanceId) {
  console.log(`Getting timer status for instance: ${instanceId}`);
  
  try {
    const response = await fetch(
      `${SERVER_TIMER_STATUS_URL}?instanceId=${instanceId}`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      }    
    );
    
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    
    const data = await response.json();
    console.log(`Timer status: ${JSON.stringify(data)}`);
    
    // Send the timer status back to the webview
    if (global.chatPanel) {
      global.chatPanel.webview.postMessage({
        command: 'timerStatus',
        data: data.timer
      });
    }
    
    return data;
  } catch (error) {
    console.error(`Error getting timer status: ${error.message}`);
    // Send a more descriptive error message to help with troubleshooting
    if (global.chatPanel) {
      global.chatPanel.webview.postMessage({
        command: 'timerStatus',
        data: { 
          error: `Failed to connect to timer service: ${error.message}. Please ensure the server is running at ${SERVER_URL}.` 
        }
      });
    }
    return { error: error.message };
  }
}

// Check timer and interview status on page load
async function checkTimerAndInterviewStatus(instanceId) {
  if (!instanceId) {
    console.error('Cannot check timer: No instance ID available');
    return;
  }
  
  try {
    console.log(`Checking timer and interview status for instance ${instanceId}`);
    
    const response = await fetch(
      `${SERVER_TIMER_STATUS_URL}?instanceId=${instanceId}`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      }    
    );
    
    if (!response.ok) {
      if (response.status === 404) {
        // No timer exists yet, start one
        console.log('No timer found, starting a new one');
        startTimer(instanceId);
        return;
      }
      throw new Error(`HTTP error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.success && data.timer) {
      console.log(`Timer status: ${JSON.stringify(data.timer)}`);
      
      // Check if the interview is already started
      if (data.timer.interviewStarted) {
        console.log('Interview is already marked as started');
      }
      
      // Send the timer status to the webview for UI updates
      if (global.chatPanel) {
        global.chatPanel.webview.postMessage({
          command: 'timerStatus',
          data: data.timer
        });
      }
    } else {
      // Start a new timer if none exists
      console.log('No valid timer found, starting a new one');
      startTimer(instanceId);
    }
  } catch (error) {
    console.error(`Error checking timer status: ${error.message}`);
    // Try to start a new timer as fallback
    startTimer(instanceId);
  }
}

// Handle sending a chat message
async function sendChatMessage(message, instanceId) {
  console.log(`Sending chat message for instance: ${instanceId}`);
  
  try {
    // First save the user message to history explicitly
    try {
      console.log('Explicitly saving user message to history before sending to API');
      await fetch(`${SERVER_CHAT_URL}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instanceId,
          message: { role: 'user', content: message }
        })
      });
      console.log('User message saved successfully');
    } catch (historyError) {
      console.error(`Warning: Could not save user message to history: ${historyError.message}`);
    }
    
    // Create a payload using the standardized format
    const payload = {
      instanceId,
      skipHistorySave: true, // Signal to server not to save to history
      payload: {
        messages: [
          // Only include system prompt if we have one
          ...(globalInitialPrompt ? [{ role: "system", content: globalInitialPrompt }] : []),
          { role: "user", content: message }
        ]
      }
    };
    
    // Log which prompt we're using
    console.log(`Using prompt: ${globalInitialPrompt.substring(0, 50)}...`);
    
    // Then call the API with the skip flag to avoid duplication
    const aiResponse = await fetch(
      SERVER_CHAT_URL,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );
    
    if (!aiResponse.ok) {
      throw new Error(`HTTP error: ${aiResponse.status}`);
    }
    
    const data = await aiResponse.json();
    console.log('AI response:', data);
    
    // Check if the AI is ending the interview
    if (data.reply.trim() === 'END') {
      console.log('AI has decided to end the interview with "END" message');
    }
    
    // Save the AI response to history
    try {
      console.log('Explicitly saving AI response to history after receiving');
      await fetch(`${SERVER_CHAT_URL}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instanceId,
          message: { role: 'assistant', content: data.reply }
        })
      });
      console.log('Successfully saved AI response to history');
    } catch (historyError) {
      console.error(`Error saving AI response to history: ${historyError.message}`);
    }
    
    // Send the AI response back to the webview
    if (global.chatPanel) {
      global.chatPanel.webview.postMessage({
        command: 'chatMessage',
        text: data.reply
      });
    }
    
    return data;
  } catch (error) {
    console.error(`Error sending chat message: ${error.message}`);
    
    if (global.chatPanel) {
      global.chatPanel.webview.postMessage({
        command: 'chatMessage',
        text: `Error: ${error.message}. Please ensure the server is running at ${SERVER_URL}.`
      });
    }
    
    return { error: error.message };
  }
}

// Function to get chat history for an instance
async function getChatHistory(instanceId) {
  if (!instanceId) {
    console.error('Cannot get chat history: No instance ID provided');
    return [];
  }
  
  console.log(`Getting chat history for instance: ${instanceId}`);
  
  try {
    // Ensure we're using the correct URL
    const url = `${SERVER_CHAT_URL}/history?instanceId=${instanceId}`;
    console.log(`Fetching chat history from: ${url}`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    
    const data = await response.json();
    console.log(`Retrieved chat history with ${data.history?.length || 0} messages`);
    
    // Very detailed logging to help diagnose issues
    console.log('Chat history data:', JSON.stringify(data));
    
    if (data.history && data.history.length > 0) {
      // If we have chat history, the interview must have started
      const interviewStarted = true;
      
      // Send history to the webview explicitly with detailed log
      console.log(`Sending ${data.history.length} chat history messages to webview`);
      
      if (global.chatPanel) {
        global.chatPanel.webview.postMessage({
          command: 'chatHistory',
          history: data.history,
          interviewStarted
        });
        
        // If there is chat history, ensure interview is marked as started
        if (interviewStarted) {
          await setInterviewStarted(instanceId);
        }
      }
      
      return data.history;
    } else {
      console.log('No chat history found');
      return [];
    }
  } catch (error) {
    console.error(`Error getting chat history: ${error.message}`);
    
    if (global.chatPanel) {
      global.chatPanel.webview.postMessage({
        command: 'chatHistory',
        error: error.message,
        history: []
      });
    }
    
    return [];
  }
}

// Function to mark interview as started
async function setInterviewStarted(instanceId) {
  if (!instanceId) {
    console.error('Cannot set interview started: No instance ID provided');
    return false;
  }
  
  console.log(`Setting interview started for instance: ${instanceId}`);
  
  try {
    const response = await fetch(SERVER_TIMER_INTERVIEW_STARTED_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instanceId })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    
    const data = await response.json();
    console.log(`Interview started status set for instance ${instanceId}: ${JSON.stringify(data)}`);
    
    // Notify UI that interview has started
    if (global.chatPanel) {
      global.chatPanel.webview.postMessage({
        command: 'interviewStarted',
        success: true,
        timer: data.timer
      });
    }
    
    return true;
  } catch (error) {
    console.error(`Error setting interview started: ${error.message}`);
    return false;
  }
}

// Function to mark the final interview as started
async function setFinalInterviewStarted(instanceId) {
  if (!instanceId) {
    console.error('Cannot set final interview started: No instance ID provided');
    return false;
  }
  
  console.log(`Setting final interview started for instance: ${instanceId}`);
  
  try {
    // Save the phase indicator to the server
    await saveInterviewPhase(instanceId, 'final_started');
    
    // Notify UI that final interview has started
    if (global.chatPanel) {
      global.chatPanel.webview.postMessage({
        command: 'finalInterviewStarted',
        success: true
      });
    }
    
    return true;
  } catch (error) {
    console.error(`Error setting final interview started: ${error.message}`);
    return false;
  }
}

// Function to save the interview phase to the server
async function saveInterviewPhase(instanceId, phase) {
  if (!instanceId) {
    console.error('Cannot save interview phase: No instance ID provided');
    return false;
  }
  
  console.log(`Saving interview phase ${phase} for instance: ${instanceId}`);
  
  try {
    // Add metadata to last message to indicate phase change
    await fetch(`${SERVER_CHAT_URL}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instanceId,
        message: { 
          role: 'system', 
          content: `PHASE_MARKER: ${phase}`,
          metadata: { phase }
        }
      })
    });
    
    console.log(`Successfully saved phase marker for ${phase}`);
    return true;
  } catch (error) {
    console.error(`Error saving interview phase: ${error.message}`);
    return false;
  }
}

// Function to submit workspace content to the backend for report generation
async function submitWorkspaceContent(instanceId, content) {
  if (!instanceId) {
    throw new Error('No instance ID provided for workspace submission');
  }
  
  if (!content) {
    throw new Error('No workspace content provided for submission');
  }
  
  console.log(`Submitting workspace content for instance ${instanceId}, size: ${content.length} chars`);
  
  try {
    // POST the workspace content to the report endpoint
    const response = await fetch(`${SERVER_URL}/instances/${instanceId}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instanceId,
        workspaceContent: content,
        timestamp: new Date().toISOString()
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    
    const data = await response.json();
    console.log(`Workspace content submitted successfully: ${JSON.stringify(data)}`);
    return data;
  } catch (error) {
    console.error(`Error submitting workspace content: ${error.message}`);
    throw error;
  }
}

module.exports = { openChat };