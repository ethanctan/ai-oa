// lib/chat/openChat.js

const vscode = require('vscode');
const { getChatHtml } = require('./getChatHtml');
const { getWorkspaceContent } = require('../context/getWorkspaceContent');
const JSZip = require('jszip'); // Added for zipping files
const TELEMETRY_BATCH_SIZE = 20;
let telemetryQueue = [];

// Function to get SERVER_URL from environment variables with fallback
function getServerUrl() {
  try {
    return process.env.SERVER_URL || 'https://ai-oa-production.up.railway.app';
  } catch (error) {
    console.warn('Failed to access process.env.SERVER_URL, using fallback:', error);
    return 'https://ai-oa-production.up.railway.app';
  }
}

// Function to get server URLs - called when needed
function getServerUrls() {
  const SERVER_URL = getServerUrl();
  return {
    SERVER_URL,
    SERVER_TELEMETRY_URL: `${SERVER_URL}/telemetry`,
    SERVER_TIMER_START_URL: `${SERVER_URL}/timer/start`,
    SERVER_TIMER_STATUS_URL: `${SERVER_URL}/timer/status`,
    SERVER_TIMER_INTERVIEW_STARTED_URL: `${SERVER_URL}/timer/interview-started`,
    SERVER_PROJECT_TIMER_START_URL: `${SERVER_URL}/timer/project/start`,
    SERVER_TIMER_FINAL_INTERVIEW_STARTED_URL: `${SERVER_URL}/timer/final-interview-started`,
    SERVER_CHAT_URL: `${SERVER_URL}/chat`
  };
}

// Global variables to store environment prompts - accessed throughout the module
let globalInitialPrompt = '';
let globalFinalPrompt = '';
let globalAssessmentPrompt = '';
// Store timer config globally
let globalTimerConfig = {};
let globalProjectTimerConfig = {};
let globalInitialQuestionBudget = 5;
let globalFinalQuestionBudget = 5;
let globalProjectHelperEnabled = false;
let globalProjectHelperPrompt = '';
const DEFAULT_PROJECT_HELPER_PROMPT = `You are a friendly AI project assistant helping a software engineering candidate while they implement a coding assignment. Offer constructive guidance, answer questions about the codebase or requirements, and provide suggestions when asked. Do not write the full solution for them, but feel free to share snippets, best practices, debugging tips, or references that unblock their progress. Keep your responses conversational, concise, and encouraging. Never say "END" or attempt to terminate the conversation.`;

function normalizePhaseName(value) {
  if (value === null || value === undefined) return null;
  const lower = String(value).trim().toLowerCase();
  if (!lower) return null;
  if (lower.startsWith('final')) return 'final';
  if (lower.startsWith('project')) return 'project';
  return 'initial';
}

function parsePositiveInteger(value, fallback) {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function resolveMessagePhase(message, defaultPhase) {
  if (!message || typeof message !== 'object') return defaultPhase;
  const explicitPhase = normalizePhaseName(message.phase);
  if (explicitPhase) return explicitPhase;
  if (message.metadata && message.metadata.phase) {
    const metadataPhase = normalizePhaseName(message.metadata.phase);
    if (metadataPhase) return metadataPhase;
  }
  const normalizedDefault = normalizePhaseName(defaultPhase);
  return normalizedDefault || 'initial';
}

function getQuestionBudgetForPhase(phaseName) {
  if (normalizePhaseName(phaseName) === 'final') {
    return parsePositiveInteger(globalFinalQuestionBudget, 5);
  }
  return parsePositiveInteger(globalInitialQuestionBudget, 5);
}

function buildInterviewControlContext({ phaseName, messages }) {
  const defaultPhase = phaseName === 'final' ? 'final' : 'initial';
  const budget = getQuestionBudgetForPhase(defaultPhase);
  const phaseLabel = defaultPhase === 'final' ? 'Final' : 'Initial';

  const normalizedDefaultPhase = normalizePhaseName(defaultPhase) || 'initial';
  let currentDerivedPhase = normalizedDefaultPhase;

  const enrichedMessages = Array.isArray(messages)
    ? messages.reduce((acc, msg) => {
        if (!msg) {
          return acc;
        }

        if (msg.role === 'system' && typeof msg.content === 'string') {
          const contentTrimmed = msg.content.trim();
          if (contentTrimmed.toUpperCase().startsWith('PHASE_MARKER:')) {
            const markerRaw = contentTrimmed.substring('PHASE_MARKER:'.length).trim();
            const markerPhase = normalizePhaseName(markerRaw);
            if (markerPhase) {
              currentDerivedPhase = markerPhase;
            }
            return acc;
          }
        }

        const resolvedPhase = resolveMessagePhase(msg, currentDerivedPhase);
        acc.push({ message: msg, phase: resolvedPhase });
        return acc;
      }, [])
    : [];

  const conversationMessages = enrichedMessages.filter(({ message }) =>
    message && (message.role === 'assistant' || message.role === 'user')
  );

  const assistantMessages = conversationMessages.filter(({ message, phase }) => {
    if (message.role !== 'assistant') return false;
    if (phase !== normalizedDefaultPhase) return false;
    const content = (message.content || '').trim();
    if (!content) return false;
    return content.toUpperCase() !== 'END';
  });

  const userMessages = conversationMessages.filter(({ message, phase }) => {
    if (message.role !== 'user') return false;
    return phase === normalizedDefaultPhase;
  });

  const questionCount = assistantMessages.length;
  const userResponseCount = userMessages.length;
  const questionsRemaining = Math.max(budget - questionCount, 0);

  const checklistItems = defaultPhase === 'final'
    ? [
        'Implementation decisions and rationale',
        'Code structure and quality trade-offs',
        'Testing and validation strategy',
        'Challenges encountered and mitigation'
      ]
    : [
        'Understanding of project requirements',
        'Proposed technical approach',
        'Consideration of risks and edge cases',
        'System architecture or design thinking'
      ];

  const statusLine = questionCount >= budget
    ? '⚠️ LIMIT REACHED — YOU MUST END'
    : `${questionsRemaining} question${questionsRemaining === 1 ? '' : 's'} remaining`;

  const lines = [
    '═══ INTERVIEW CONTROL SYSTEM ═══',
    `• Phase: ${phaseLabel} Interview`,
    `• Question budget: ${budget}`,
    `• Questions asked: ${questionCount}/${budget}`,
    `• Candidate responses recorded: ${userResponseCount}`,
    `• Status: ${statusLine}`,
    '',
    'MANDATORY END CONDITIONS (respond with ONLY "END"):',
    '1. You have reached the question budget',
    '2. The candidate explicitly asks to end (e.g. “let’s stop”, “I am done”)',
    '3. The candidate provides three consecutive non-answers (e.g. “I don’t know”, silence)',
    '',
    `ASSESSMENT COVERAGE CHECKLIST (${phaseLabel} Interview):`,
    ...checklistItems.map((item) => `□ ${item}`),
    '',
    'RESPONSE RULES:',
    '- If the checklist is complete OR the budget is exhausted → respond with exactly "END" (no additional text).',
    '- Otherwise, ask the next concise, high-signal question. One question per turn only.',
    '- Keep the conversation focused on the candidate’s reasoning and evidence.',
    '',
    'When you decide to conclude, reply with exactly "END" and nothing else.'
  ];

  return {
    prompt: lines.join('\n'),
    questionCount,
    userResponseCount,
    budget
  };
}

function buildSystemPrompt(basePrompt, controlPrompt) {
  const sanitizedBase = (basePrompt || '').trim();
  const sanitizedControl = (controlPrompt || '').trim();
  if (!sanitizedControl) {
    return sanitizedBase;
  }
  return `${sanitizedBase}\n\n${sanitizedControl}`.trim();
}

// Function to get environment variables 
async function getEnvironmentVariables() {
  try {
    // Execute a command to read environment variables
    const result = await new Promise((resolve, reject) => {
      const { exec } = require('child_process');
      // Update grep pattern to include timer variables
      exec('env | grep -E "INITIAL_PROMPT|FINAL_PROMPT|ASSESSMENT_PROMPT|INSTANCE_ID|ENABLE_INITIAL_TIMER|INITIAL_DURATION_MINUTES|ENABLE_PROJECT_TIMER|PROJECT_DURATION_MINUTES|INITIAL_QUESTION_BUDGET|FINAL_QUESTION_BUDGET|PROJECT_HELPER_ENABLED|PROJECT_HELPER_PROMPT"', (error, stdout, stderr) => {
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
    
    // Populate global timer configs from env vars
    globalTimerConfig = {
      enableTimer: result.ENABLE_INITIAL_TIMER ? (result.ENABLE_INITIAL_TIMER === '1') : true, // Default true if not set
      duration: result.INITIAL_DURATION_MINUTES ? parseInt(result.INITIAL_DURATION_MINUTES, 10) : 10 // Default 10 mins
    };
    globalProjectTimerConfig = {
      enableProjectTimer: result.ENABLE_PROJECT_TIMER ? (result.ENABLE_PROJECT_TIMER === '1') : true, // Default true
      projectDuration: result.PROJECT_DURATION_MINUTES ? parseInt(result.PROJECT_DURATION_MINUTES, 10) : 60 // Default 60 mins
    };
    
    if (result.INITIAL_QUESTION_BUDGET) {
      globalInitialQuestionBudget = parsePositiveInteger(result.INITIAL_QUESTION_BUDGET, globalInitialQuestionBudget);
    }
    if (result.FINAL_QUESTION_BUDGET) {
      globalFinalQuestionBudget = parsePositiveInteger(result.FINAL_QUESTION_BUDGET, globalFinalQuestionBudget);
    }
    if (result.PROJECT_HELPER_ENABLED) {
      const helperEnabledRaw = result.PROJECT_HELPER_ENABLED.toString().trim().toLowerCase();
      globalProjectHelperEnabled = ['1', 'true', 'yes', 'y', 'on'].includes(helperEnabledRaw);
    } else {
      globalProjectHelperEnabled = false;
    }
    if (result.PROJECT_HELPER_PROMPT) {
      globalProjectHelperPrompt = result.PROJECT_HELPER_PROMPT;
    } else if (!globalProjectHelperPrompt) {
      globalProjectHelperPrompt = DEFAULT_PROJECT_HELPER_PROMPT;
    }

    console.log('Populated globalTimerConfig:', globalTimerConfig);
    console.log('Populated globalProjectTimerConfig:', globalProjectTimerConfig);
    console.log('Populated question budgets:', {
      initial: globalInitialQuestionBudget,
      final: globalFinalQuestionBudget
    });
    console.log('Project helper enabled:', globalProjectHelperEnabled);
    
    return result;
  } catch (error) {
    console.error('Error getting environment variables:', error);
    // Return default configs on error
    globalTimerConfig = { enableTimer: true, duration: 10 };
    globalProjectTimerConfig = { enableProjectTimer: true, projectDuration: 60 };
    globalProjectHelperEnabled = false;
    if (!globalProjectHelperPrompt) {
      globalProjectHelperPrompt = DEFAULT_PROJECT_HELPER_PROMPT;
    }
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
    // Telemetry passthrough from webview
    if (message.command === 'telemetryBatch') {
      try {
        const { SERVER_TELEMETRY_URL } = getServerUrls();
        const sessionId = (global.__aioa_sessionId || `vscode-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`);
        global.__aioa_sessionId = sessionId;
        const batch = Array.isArray(message.events) ? message.events : [];
        telemetryQueue.push(...batch);
        if (telemetryQueue.length >= TELEMETRY_BATCH_SIZE) {
          const send = telemetryQueue.splice(0, telemetryQueue.length);
          await fetch(SERVER_TELEMETRY_URL, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ instanceId, sessionId, events: send })
          });
        }
      } catch (e) {
        // ignore
      }
      return;
    }
    console.log(`Received message from webview: ${message.command}`);
    
    // Get server URLs dynamically
    const { 
      SERVER_URL, 
      SERVER_CHAT_URL, 
      SERVER_TIMER_START_URL, 
      SERVER_TIMER_STATUS_URL, 
      SERVER_PROJECT_TIMER_START_URL, 
      SERVER_TIMER_INTERVIEW_STARTED_URL, 
      SERVER_TIMER_FINAL_INTERVIEW_STARTED_URL 
    } = getServerUrls();
    
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

    // Handle explicit interview start from the webview
    if (message.command === 'startInterview') {
      try {
        const startInstanceId = message.instanceId || instanceId;
        if (!startInstanceId) {
          throw new Error('No instance ID provided for startInterview');
        }

        // Ensure a timer exists; if status returns 404, create one
        let statusResult = await getTimerStatus(startInstanceId);
        if (statusResult && statusResult.error && String(statusResult.error).includes('404')) {
          console.log('No existing timer found when starting interview; creating one now');
          await startTimer(startInstanceId);
        }

        // Persist interviewStarted=true on the server so reloads honor the phase
        await setInterviewStarted(startInstanceId);

        // Acknowledge to the webview
        if (global.chatPanel) {
          global.chatPanel.webview.postMessage({ command: 'interviewStarted', success: true });
        }
      } catch (err) {
        console.error(`Error handling startInterview: ${err.message}`);
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

    // Handle project timer configuration
    if (message.command === 'setProjectTimerConfig') {
      console.log(`Setting project timer configuration: ${JSON.stringify(message.config)}`);
      // Store project timer configuration in global variable for use in startProjectTimer
      global.projectTimerConfig = message.config;
      global.chatPanel.webview.postMessage({ 
        command: 'projectTimerConfigSet', 
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
          instanceId: instanceId,
          initialQuestionBudget: globalInitialQuestionBudget,
          finalQuestionBudget: globalFinalQuestionBudget,
          projectHelperEnabled: globalProjectHelperEnabled,
          projectHelperPrompt: globalProjectHelperPrompt
        });
      } catch (error) {
        global.chatPanel.webview.postMessage({ 
          command: 'environmentPrompts', 
          error: error.message,
          initialPrompt: 'You are a technical interviewer assessing a software engineering candidate. They have been provided with a coding project, which they have not started yet. Instructions for the project have been provided in the README.md file. IMPORTANT: Ask only ONE question at a time about their approach to the project, and wait for their response before asking another question. Start by asking about their initial thoughts on the project requirements.',
          finalPrompt: 'You are a technical interviewer assessing a software engineering candidate. They have been provided with a coding project, which they have now completed. IMPORTANT: Ask only ONE question at a time about their implementation, and wait for their response before asking another question. Start by asking them to explain their overall approach.',
          instanceId: instanceId,
          initialQuestionBudget: globalInitialQuestionBudget,
          finalQuestionBudget: globalFinalQuestionBudget,
          projectHelperEnabled: globalProjectHelperEnabled,
          projectHelperPrompt: globalProjectHelperPrompt || DEFAULT_PROJECT_HELPER_PROMPT
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
        let payloadMessages = [];

        if (message.payload && message.payload.payload && message.payload.payload.messages) {
          // Handle nested payload structure from chat.html
          payloadMessages = message.payload.payload.messages || [];
          console.log(`Received nested payload with ${payloadMessages.length} messages`);
          
          // Log message roles to help diagnose issues
          console.log('Message roles:', payloadMessages.map(m => m.role).join(', '));
          
          // Get the last user message
          const userMessages = payloadMessages.filter(m => m.role === 'user');
          console.log(`Found ${userMessages.length} user messages in payload`);
          
          if (userMessages.length > 0) {
            userMessage = userMessages[userMessages.length - 1];
            console.log(`User message from payload: ${userMessage.content.substring(0, 30)}...`);
          } else {
            console.error('No user messages found in payload. Message roles:', payloadMessages.map(m => m.role).join(', '));
          }
        } else if (message.payload && message.payload.messages) {
          // Handle direct payload structure
          payloadMessages = message.payload.messages || [];
          console.log(`Received direct payload with ${payloadMessages.length} messages`);
          
          // Log message roles to help diagnose issues
          console.log('Message roles:', payloadMessages.map(m => m.role).join(', '));
          
          // Get the last user message
          const userMessages = payloadMessages.filter(m => m.role === 'user');
          console.log(`Found ${userMessages.length} user messages in payload`);
          
          if (userMessages.length > 0) {
            userMessage = userMessages[userMessages.length - 1];
            console.log(`User message from payload: ${userMessage.content.substring(0, 30)}...`);
          } else {
            console.error('No user messages found in payload. Message roles:', payloadMessages.map(m => m.role).join(', '));
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
        
        // Determine which prompt to use based on phase from the payload
        let promptToUse = globalInitialPrompt;
        let phaseName = 'initial';
        
        // Check if this message is for the final interview
        if (message.phase === 'final' || 
            (message.payload && message.payload.phase === 'final') ||
            (message.payload && message.payload.payload && message.payload.payload.messages && 
             message.payload.payload.messages.some(m => m.phase === 'final'))) {
          console.log('Using FINAL interview prompt for this message');
          promptToUse = globalFinalPrompt;
          phaseName = 'final';
        } else if (message.phase === 'project' ||
            (message.payload && message.payload.phase === 'project') ||
            (message.payload && message.payload.payload && message.payload.payload.messages &&
             message.payload.payload.messages.some(m => m.phase === 'project'))) {
          console.log('Using PROJECT helper prompt for this message');
          promptToUse = globalProjectHelperPrompt || DEFAULT_PROJECT_HELPER_PROMPT;
          phaseName = 'project';
        } else {
          console.log('Using INITIAL interview prompt for this message');
        }
        
        const isProjectHelperPhase = normalizePhaseName(phaseName) === 'project';
        let systemPrompt = promptToUse;
        let controlContext = null;

        if (!isProjectHelperPhase) {
          controlContext = buildInterviewControlContext({ phaseName, messages: payloadMessages });
          systemPrompt = buildSystemPrompt(promptToUse, controlContext.prompt);
          console.log(`Using system prompt for ${phaseName} phase. Budget: ${controlContext.budget}, questions asked: ${controlContext.questionCount}.`);
        } else {
          console.log('Project helper phase detected; skipping interview control context.');
        }

        // Create a new payload using the standardized format
        const newPayload = {
          instanceId: chatInstanceId,
          skipHistorySave: true,
          payload: {
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userMessage.content }
            ]
          }
        };
        
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
        if (!isProjectHelperPhase && data.reply.trim() === 'END') {
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

    // Handle project timer start command
    if (message.command === 'startProjectTimer') {
      console.log(`Starting project timer for instance: ${message.instanceId}`);
      // Call the local function to start the project timer on the server
      const timerData = await startProjectTimer(message.instanceId);
      
      // Check if timer started successfully and send confirmation
      if (timerData && !timerData.error) {
          // Send projectWorkStarted message to ensure UI updates correctly
          console.log('Sending projectWorkStarted after project timer started');
          global.chatPanel.webview.postMessage({
            command: 'projectWorkStarted',
            success: true
          });
      } else {
        // Log error if timer didn't start correctly
        console.error('Failed to start project timer, not sending projectWorkStarted message.');
      }
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
    
    // Handle submitting workspace content
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
    // Get server URLs dynamically
    const { SERVER_TIMER_START_URL, SERVER_URL } = getServerUrls();
    
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

// Handle starting the project timer
async function startProjectTimer(instanceId) {
  console.log(`Starting project timer for instance: ${instanceId}`);
  
  try {
    // Get server URLs dynamically
    const { SERVER_PROJECT_TIMER_START_URL, SERVER_URL } = getServerUrls();
    
    // Use the globally set project timer config from env vars
    const projectConfig = globalProjectTimerConfig || {}; // Use global config
    
    console.log(`Using project timer config from environment: ${JSON.stringify(projectConfig)}`);
    
    const response = await fetch(
      SERVER_PROJECT_TIMER_START_URL,
      {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ 
          instanceId,
          enableTimer: projectConfig.enableProjectTimer !== false, // Default to true if not specified
          duration: projectConfig.projectDuration ? projectConfig.projectDuration * 60 : 3600 // Convert minutes to seconds, default 60 minutes
        })
      }
    );
    
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    
    const data = await response.json();
    console.log(`Project timer started: ${JSON.stringify(data)}`);
    
    // Set up periodic logging of project timer status
    startProjectTimerDebugLogging(instanceId);
    
    // Send the timer status back to the webview
    if (global.chatPanel) {
      global.chatPanel.webview.postMessage({
        command: 'projectTimerStatus',
        data: data.timer
      });
    }
    
    return data;
  } catch (error) {
    console.error(`Error starting project timer: ${error.message}`);
    if (global.chatPanel) {
      global.chatPanel.webview.postMessage({
        command: 'projectTimerStatus',
        data: { 
          error: `Failed to start project timer: ${error.message}. Please ensure the server is running at ${SERVER_URL}.` 
        }
      });
    }
    return { error: error.message };
  }
}

// Debug helper function to periodically check and log project timer status
function startProjectTimerDebugLogging(instanceId) {
  console.log(`Setting up debug logging for project timer on instance ${instanceId}`);
  
  // Check project timer status every 10 seconds and log it
  const debugInterval = setInterval(async () => {
    try {
      const { SERVER_TIMER_STATUS_URL } = getServerUrls();
      const response = await fetch(
        `${SERVER_TIMER_STATUS_URL}?instanceId=${instanceId}`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        }    
      );
      
      if (!response.ok) {
        console.error(`Debug log: Failed to get timer status: ${response.status}`);
        return;
      }
      
      const data = await response.json();
      if (data.success && data.timer) {
        // Only log if this is a project timer
        if (data.timer.timerType === 'project') {
          const timeRemaining = data.timer.timeRemaining;
          const minutes = Math.floor(timeRemaining / 60);
          const seconds = timeRemaining % 60;
          
          console.log(`PROJECT TIMER DEBUG - Time remaining: ${minutes}:${seconds.toString().padStart(2, '0')} - Raw data: ${JSON.stringify(data.timer)}`);
        }
      }
    } catch (error) {
      console.error(`Debug log: Error checking project timer status: ${error.message}`);
    }
  }, 10000);
  
  // Store the interval ID in a global variable so we can clear it later if needed
  global.projectTimerDebugInterval = debugInterval;
}

// Get the status of a timer
async function getTimerStatus(instanceId) {
  console.log(`Getting timer status for instance: ${instanceId}`);
  
  try {
    // Get server URLs dynamically
    const { SERVER_TIMER_STATUS_URL, SERVER_URL } = getServerUrls();
    
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
    const { SERVER_TIMER_STATUS_URL, SERVER_URL } = getServerUrls();
    
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
      
      // Check what type of timer this is and which phase we're in
      if (data.timer.timerType === 'project') {
        console.log('Project work timer detected');
        
        // Start project timer debug logging
        startProjectTimerDebugLogging(instanceId);
        
        // We're in the project work phase
        if (global.chatPanel) {
          global.chatPanel.webview.postMessage({
            command: 'projectTimerStatus',
            data: data.timer
          });
          
          // Also send projectWorkStarted message to ensure UI updates correctly
          global.chatPanel.webview.postMessage({
            command: 'projectWorkStarted',
            success: true
          });
        }
        
        // Check if the final interview has already started
        if (data.timer.finalInterviewStarted) {
          console.log('Final interview is already marked as started');
          if (global.chatPanel) {
            global.chatPanel.webview.postMessage({
              command: 'finalInterviewStarted',
              success: true
            });
          }
        }
      } else {
        // This is the initial timer
        // Check if the interview is already started
        if (data.timer.interviewStarted) {
          console.log('Initial interview is already marked as started according to timer status');
          
          // Send interviewStarted confirmation to UI
          if (global.chatPanel) {
            global.chatPanel.webview.postMessage({
              command: 'interviewStarted',
              success: true
            });
          }
        }
        
        // Send the timer status to the webview for UI updates regardless
        if (global.chatPanel) {
          global.chatPanel.webview.postMessage({
            command: 'timerStatus',
            data: data.timer
          });
        }
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
    // Get server URLs dynamically
    const { SERVER_CHAT_URL, SERVER_TIMER_STATUS_URL, SERVER_URL } = getServerUrls();
    
    // First check timer status to determine if we're in final interview phase
    let isInFinalInterview = false;
    try {
      const timerResponse = await fetch(
        `${SERVER_TIMER_STATUS_URL}?instanceId=${instanceId}`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        }    
      );
      
      if (timerResponse.ok) {
        const timerData = await timerResponse.json();
        
        // Check if final interview has started in timer data
        if (timerData.success && timerData.timer && 
            (timerData.timer.finalInterviewStarted ||
             (timerData.timer.timerType === 'project' && timerData.timer.finalInterviewStarted))) {
          isInFinalInterview = true;
          console.log('Final interview phase detected from timer status');
        }
      }
    } catch (timerError) {
      console.error(`Warning: Could not check timer status to determine phase: ${timerError.message}`);
      // Continue with default initial interview phase
    }
    
    // Choose prompt based on detected phase
    const promptToUse = isInFinalInterview ? globalFinalPrompt : globalInitialPrompt;
    const phaseName = isInFinalInterview ? 'final' : 'initial';
    
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
    
    let conversationMessages = [];
    try {
      const historyResponse = await fetch(`${SERVER_CHAT_URL}/history?instanceId=${instanceId}`);
      if (historyResponse.ok) {
        const historyData = await historyResponse.json();
        if (Array.isArray(historyData.history)) {
          conversationMessages = historyData.history;
        }
      } else {
        console.warn(`Unable to fetch chat history for control context: ${historyResponse.status}`);
      }
    } catch (historyFetchError) {
      console.error(`Error fetching chat history for control context: ${historyFetchError.message}`);
    }

    const controlContext = buildInterviewControlContext({ phaseName, messages: conversationMessages });
    const systemPrompt = buildSystemPrompt(promptToUse, controlContext.prompt);

    console.log(`Using ${phaseName} system prompt. Budget: ${controlContext.budget}, questions asked: ${controlContext.questionCount}.`);

    // Create a payload using the standardized format
    const payload = {
      instanceId,
      skipHistorySave: true, // Signal to server not to save to history
      payload: {
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message }
        ]
      }
    };
    
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
      
      // Save the AI END response to history
      try {
        console.log('Saving AI END response to history');
        await fetch(`${SERVER_CHAT_URL}/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            instanceId,
            message: { role: 'assistant', content: 'END' }
          })
        });
        
        if (!isInFinalInterview) {
          // Only add phase transition message for initial interview
          // Also save a system message indicating the phase transition
          await fetch(`${SERVER_CHAT_URL}/message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              instanceId,
              message: { 
                role: 'system', 
                content: 'Initial interview completed. Beginning project work phase.' 
              }
            })
          });
          console.log('Successfully saved phase transition messages to history');
          
          // Start the project phase timer if ending initial interview
          console.log('Starting project timer after END message received');
          await startProjectTimer(instanceId);
          
          // Send a system message to the chat instead of END
          if (global.chatPanel) {
            global.chatPanel.webview.postMessage({
              command: 'chatMessage',
              text: 'Initial interview completed. You may now begin working on the project.'
            });
          }
        } else {
          // Handle END of final interview
          if (global.chatPanel) {
            global.chatPanel.webview.postMessage({
              command: 'chatMessage',
              text: 'Final interview completed. Thank you for your participation.'
            });
          }
        }
      } catch (historyError) {
        console.error(`Error saving phase transition to history: ${historyError.message}`);
      }
    } else {
      // Save the normal AI response to history
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
    // Get server URLs dynamically
    const { SERVER_CHAT_URL } = getServerUrls();
    
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
    // Get server URLs dynamically
    const { SERVER_TIMER_INTERVIEW_STARTED_URL } = getServerUrls();
    
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
    // Get server URLs dynamically
    const { SERVER_TIMER_FINAL_INTERVIEW_STARTED_URL } = getServerUrls();
    
    // Call the server API to update the timer status
    const response = await fetch(SERVER_TIMER_FINAL_INTERVIEW_STARTED_URL, {
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ instanceId })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    
    const data = await response.json();
    console.log(`Final interview started status set: ${JSON.stringify(data)}`);
    
    // Save the phase indicator to the server
    await saveInterviewPhase(instanceId, 'final_started');
    
    // Notify UI that final interview has started
    if (global.chatPanel) {
      global.chatPanel.webview.postMessage({
        command: 'finalInterviewStarted',
        success: true,
        timer: data.timer
      });
    }
    
    return true;
  } catch (error) {
    console.error(`Error setting final interview started: ${error.message}`);
    
    // Fall back to just saving the phase
    // Save the phase indicator to the server
    await saveInterviewPhase(instanceId, 'final_started');
    
    // Notify UI that final interview has started
    if (global.chatPanel) {
      global.chatPanel.webview.postMessage({
        command: 'finalInterviewStarted',
        success: true
      });
    }
    
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
    // Get server URLs dynamically
    const { SERVER_CHAT_URL } = getServerUrls();
    
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

// Function to submit workspace content to the backend for report generation AND GitHub upload
async function submitWorkspaceContent(instanceId, content) {
  if (!instanceId) {
    throw new Error('No instance ID provided for workspace submission');
  }
  
  console.log(`Submitting workspace content for instance ${instanceId}`);
  
  // Get server URLs dynamically
  const { SERVER_URL } = getServerUrls();

  // 1. Submit for report generation (existing functionality)
  if (content) {
    console.log(`Submitting for report, content size: ${content.length} chars`);
    try {
      const reportResponse = await fetch(`${SERVER_URL}/instances/${instanceId}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instanceId,
          workspaceContent: content,
          timestamp: new Date().toISOString()
        })
      });
      if (!reportResponse.ok) {
        console.error(`HTTP error submitting for report: ${reportResponse.status} - ${await reportResponse.text()}`);
        // Don't throw here, attempt GitHub upload regardless
      } else {
        const reportData = await reportResponse.json();
        console.log(`Workspace content submitted for report successfully: ${JSON.stringify(reportData)}`);
      }
    } catch (error) {
      console.error(`Error submitting workspace content for report: ${error.message}`);
      // Don't throw here, attempt GitHub upload regardless
    }
  }

  // 2. Gather files, ZIP them, and upload to GitHub
  try {
    console.log('Gathering workspace files for GitHub upload...');
    // We need a more robust way to get all files with their relative paths and content.
    // getWorkspaceContent as currently used gives a flat string.
    // For zipping, we need file paths and content.
    // This part requires a new utility or modification of getWorkspaceContent
    // to return a structure like: [{ path: 'path/to/file.js', content: 'file content' }, ...]

    const filesToZip = [];
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      const workspaceRoot = workspaceFolders[0].uri;
      // Example: Find all files, excluding .git and node_modules. 
      // You might want to refine this based on typical project structures.
      const allFiles = await vscode.workspace.findFiles('**/*', '{**/.git/**,**/node_modules/**,**/.*}'); 

      for (const fileUri of allFiles) {
        const fileContent = await vscode.workspace.fs.readFile(fileUri);
        // Get relative path from workspace root
        const relativePath = vscode.workspace.asRelativePath(fileUri, false);
        filesToZip.push({
          path: relativePath,
          content: Buffer.from(fileContent) // JSZip expects Buffer or similar
        });
      }
    }

    if (filesToZip.length === 0) {
      console.log('No files found to zip for GitHub upload.');
      // Optionally, you might want to inform the user or skip the upload
      return { reportSubmitted: true, githubUploadSkipped: true, message: "No files to upload." }; 
    }

    console.log(`Found ${filesToZip.length} files to zip.`);

    const zip = new JSZip();
    filesToZip.forEach(file => {
      zip.file(file.path, file.content);
      console.log(`Added to zip: ${file.path}`);
    });

    const zipBlob = await zip.generateAsync({ type: 'blob', compression: "DEFLATE", compressionOptions: { level: 9 } });
    console.log('ZIP file generated in memory.');

    const formData = new FormData();
    formData.append('file', zipBlob, `submission_instance_${instanceId}.zip`);

    const githubUploadResponse = await fetch(`${SERVER_URL}/instances/${instanceId}/upload-to-github`, {
      method: 'POST',
      body: formData, // Sending FormData handles multipart/form-data for file upload
      // Note: Do not set Content-Type header manually when using FormData with fetch,
      // the browser or Node fetch will set it correctly with the boundary.
    });

    const githubUploadData = await githubUploadResponse.json();
    if (!githubUploadResponse.ok) {
      console.error(`HTTP error uploading to GitHub: ${githubUploadResponse.status} - ${JSON.stringify(githubUploadData)}`);
      throw new Error(githubUploadData.error || `GitHub upload failed with status ${githubUploadResponse.status}`);
    }

    console.log(`Project uploaded to GitHub successfully: ${JSON.stringify(githubUploadData)}`);

    // Persist phase marker: final_completed
    try {
      const { SERVER_CHAT_URL } = getServerUrls();
      await fetch(`${SERVER_CHAT_URL}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instanceId,
          message: { role: 'system', content: 'PHASE_MARKER: final_completed', metadata: { phase: 'final_completed' } }
        })
      });
      console.log('Wrote PHASE_MARKER: final_completed');
    } catch (e) {
      console.error(`Failed writing final_completed marker: ${e.message}`);
    }

    // 3. Wind down the instance to conserve resources
    try {
      console.log('Requesting instance shutdown...');
      const stopResponse = await fetch(`${SERVER_URL}/instances/${instanceId}/stop`, { method: 'POST' });
      const stopData = await stopResponse.json().catch(() => ({}));
      if (!stopResponse.ok) {
        console.error(`Failed to stop instance: ${stopResponse.status} - ${JSON.stringify(stopData)}`);
      } else {
        console.log(`Instance stop response: ${JSON.stringify(stopData)}`);
      }
    } catch (e) {
      console.error(`Error calling stop instance: ${e.message}`);
    }

    return githubUploadData; // Contains success and message from backend

  } catch (error) {
    console.error(`Error during GitHub upload process: ${error.message}`);
    // Depending on requirements, you might re-throw or handle differently
    // For now, let's not make the whole submission fail if only GitHub upload fails
    return { success: false, error: error.message }; 
  }
}

module.exports = { openChat };