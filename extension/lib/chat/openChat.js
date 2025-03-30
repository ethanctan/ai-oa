// lib/chat/openChat.js

const vscode = require('vscode');
const { getChatHtml } = require('./getChatHtml');
const { getWorkspaceContent } = require('../context/getWorkspaceContent');

const SERVER_URL = 'http://host.docker.internal:3000';
const SERVER_TIMER_START_URL = `${SERVER_URL}/timer/start`;
const SERVER_TIMER_STATUS_URL = `${SERVER_URL}/timer/status`;
const SERVER_CHAT_URL = `${SERVER_URL}/chat`;

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

    if (message.command === 'getEnvironmentPrompts') {
      try {
        const envVars = await getEnvironmentVariables();
        
        // Store the instance ID if it's available in the environment
        if (envVars.INSTANCE_ID) {
          instanceId = envVars.INSTANCE_ID;
          console.log(`Found instance ID in environment: ${instanceId}`);
          
          // Load chat history for this instance ID
          getChatHistory(instanceId);
        }
        
        global.chatPanel.webview.postMessage({ 
          command: 'environmentPrompts', 
          initialPrompt: envVars.INITIAL_PROMPT || 'You are a technical interviewer assessing a software engineering candidate. They have been provided with a coding project, which they have not started yet. Instructions for the project have been provided in the README.md file. IMPORTANT: Ask only ONE question at a time about their approach to the project, and wait for their response before asking another question. Start by asking about their initial thoughts on the project requirements.',
          finalPrompt: envVars.FINAL_PROMPT || 'You are a technical interviewer assessing a software engineering candidate. They have been provided with a coding project, which they have now completed. IMPORTANT: Ask only ONE question at a time about their implementation, and wait for their response before asking another question. Start by asking them to explain their overall approach.',
          assessmentPrompt: envVars.ASSESSMENT_PROMPT || '',
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
        const response = await fetch(SERVER_CHAT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message.payload)
        });
        if (!response.ok) {
          throw new Error('HTTP error ' + response.status);
        }
        const data = await response.json();
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
  });

  // Move the panel to the right editor group.
  vscode.commands.executeCommand('workbench.action.moveEditorToRightGroup');

  // Clean up when the panel is closed.
  global.chatPanel.onDidDispose(() => {
    global.chatPanel = undefined;
  });
}

// Handle starting the timer
async function startTimer(instanceId) {
  console.log(`Starting timer for instance: ${instanceId}`);
  
  try {
    const response = await fetch(
      SERVER_TIMER_START_URL,
      {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ instanceId })
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
        data: data
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
        data: data
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

// Handle sending a chat message
async function sendChatMessage(message, instanceId) {
  console.log(`Sending chat message for instance: ${instanceId}`);
  
  try {
    // Here you would call your AI service/API with the message
    const aiResponse = await fetch(
      SERVER_CHAT_URL,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instanceId,
          text: message,
          payload: {
            messages: [
              { role: "system", content: "You are a technical interviewer assessing a software engineering candidate." },
              { role: "user", content: message }
            ]
          }
        })
      }
    );
    
    if (!aiResponse.ok) {
      throw new Error(`HTTP error: ${aiResponse.status}`);
    }
    
    const data = await aiResponse.json();
    console.log('AI response:', data);
    
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

// Fallback function to try alternative server URL if first attempt fails
async function fetchWithFallback(url, options, fallbackUrl) {
  try {
    return await fetch(url, options);
  } catch (error) {
    console.log(`Fetch failed with ${url}, trying fallback URL ${fallbackUrl}`);
    // Replace localhost with host.docker.internal
    const altUrl = url.replace('localhost', 'host.docker.internal');
    return await fetch(altUrl, options);
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
    const response = await fetch(`${SERVER_CHAT_URL}/history?instanceId=${instanceId}`);
    
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    
    const data = await response.json();
    console.log(`Retrieved chat history with ${data.history?.length || 0} messages`);
    
    if (global.chatPanel) {
      global.chatPanel.webview.postMessage({
        command: 'chatHistory',
        history: data.history || []
      });
    }
    
    return data.history || [];
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
    const response = await fetch(`${SERVER_URL}/timer/interview-started`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instanceId })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    
    const data = await response.json();
    console.log(`Interview started status set for instance ${instanceId}: ${JSON.stringify(data)}`);
    
    return true;
  } catch (error) {
    console.error(`Error setting interview started: ${error.message}`);
    return false;
  }
}

module.exports = { openChat };


// {"messages":
  
//   [{"role":"system","content":"You are a technical interviewer assessing a software engineering candidate. They have been provided with a coding project. Interview them about their design decisions and implementation."},
    
//     {"role":"system","content":"Project workspace content: \n\n=== /home/coder/project/README.md ===\n\n# ai-oa-test-repo\nTest project repo for ethanctan/ai-oa\n\nIf you cloned this repo correctly, this text should show up.\n\n\n=== /home/coder/project/test.py ===\n\nprint(\"Hello, world!\")\n"},
    
//     {"role":"user","content":"Hello"},
    
//     {"role":"bot","content":"Hi there! Let's discuss the coding project. Could you walk me through your design decisions and implementation for the provided code in `test.py`? Specifically, why did you choose this approach?"},
    
//     {"role":"user","content":"Hello"},
    
//     {"role":"user","content":"Hello"}
//   ]}