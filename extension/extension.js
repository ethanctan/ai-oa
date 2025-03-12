const vscode = require('vscode');
const { openChat } = require('./lib/chat/openChat');

function activate(context) {
  console.log('Chat Extension activated');

  // Register a command that opens the chat panel
  let openChatCommand = vscode.commands.registerCommand('ai-oa.openChat', openChat);
  context.subscriptions.push(openChatCommand);

  // Open the panel automatically on activation:
  vscode.commands.executeCommand('ai-oa.openChat');
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};
