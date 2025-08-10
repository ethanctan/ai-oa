const vscode = require('vscode');
const { openChat } = require('./lib/chat/openChat');

function activate(context) {
  console.log('AI Interviewer Extension activated');

  // Register a command that opens the chat panel
  let openChatCommand = vscode.commands.registerCommand('ai-oa.openChat', openChat);
  context.subscriptions.push(openChatCommand);

  // Open the panel automatically on activation:
  // Use a slight delay to ensure the extension is fully initialized
  setTimeout(() => {
    vscode.commands.executeCommand('ai-oa.openChat');
  }, 1000);
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};
