// lib/chat/openChat.js

const vscode = require('vscode');
const { getChatHtml } = require('./getChatHtml');
const { getWorkspaceContent } = require('../context/getWorkspaceContent');

// This might not work for Linux - instead use the host’s IP
const SERVER_CHAT_URL = 'http://host.docker.internal:3000/chat';

function openChat() {
  // If the chat panel already exists, reveal it in the right group.
  if (global.chatPanel) {
    global.chatPanel.reveal(vscode.ViewColumn.Two);
    return;
  }
  
  // Create the webview panel (initially in the first editor group)
  global.chatPanel = vscode.window.createWebviewPanel(
    'sidebar',               // Identifier for the webview type.
    'Chat Interface',        // Title for the panel.
    vscode.ViewColumn.One,   // Initially show in editor group 1.
    { enableScripts: true }  // Enable scripts in the webview.
  );

  // Set the HTML content for the panel.
  global.chatPanel.webview.html = getChatHtml();

  // Listen for messages from the webview.
  global.chatPanel.webview.onDidReceiveMessage(async message => {
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

  });

  // Move the panel to the right editor group.
  vscode.commands.executeCommand('workbench.action.moveEditorToRightGroup');

  // Clean up when the panel is closed.
  global.chatPanel.onDidDispose(() => {
    global.chatPanel = undefined;
  });
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