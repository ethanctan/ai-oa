const vscode = require('vscode');
const { openChat } = require('./lib/chat/openChat');

function activate(context) {
  console.log('AI Interviewer Extension activated');

  // Register a command that opens the chat panel
  let openChatCommand = vscode.commands.registerCommand('ai-oa.openChat', openChat);
  context.subscriptions.push(openChatCommand);

  // Telemetry buffer and flush logic
  const telemetryBuffer = [];
  let telemetryFlushTimer = null;
  const TELEMETRY_FLUSH_MS = 10000; // 10s

  function getServerUrl() {
    try { return process.env.SERVER_URL || 'https://ai-oa-production.up.railway.app'; } catch { return 'https://ai-oa-production.up.railway.app'; }
  }

  function getInstanceIdSync() {
    try { return process.env.INSTANCE_ID || null; } catch { return null; }
  }

  function enqueueTelemetry(event) {
    telemetryBuffer.push(event);
    if (!telemetryFlushTimer) {
      telemetryFlushTimer = setTimeout(flushTelemetry, TELEMETRY_FLUSH_MS);
    }
    if (telemetryBuffer.length >= 25) {
      flushTelemetry();
    }
  }

  async function flushTelemetry() {
    const events = telemetryBuffer.splice(0, telemetryBuffer.length);
    clearTimeout(telemetryFlushTimer);
    telemetryFlushTimer = null;
    if (events.length === 0) return;
    const instanceId = getInstanceIdSync();
    const sessionId = global.__aioa_sessionId || (`vscode-${Date.now()}-${Math.random().toString(36).slice(2,9)}`);
    global.__aioa_sessionId = sessionId;
    try {
      await fetch(`${getServerUrl()}/telemetry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceId, sessionId, events })
      });
    } catch (e) {
      // swallow errors
    }
  }

  function now() { return Date.now(); }

  function recordEvent(type, metadata) {
    enqueueTelemetry({ type, ts: now(), metadata });
  }

  // Wrapped paste/copy/cut commands: forward to default after logging
  context.subscriptions.push(vscode.commands.registerCommand('ai-oa.telemetry.paste', async (args) => {
    recordEvent('paste', { target: args?.target || 'unknown' });
    try { await vscode.commands.executeCommand('editor.action.clipboardPasteAction'); } catch {}
    try { await vscode.commands.executeCommand('workbench.action.terminal.paste'); } catch {}
  }));

  context.subscriptions.push(vscode.commands.registerCommand('ai-oa.telemetry.copy', async (args) => {
    recordEvent('copy', { target: args?.target || 'unknown' });
    try { await vscode.commands.executeCommand('editor.action.clipboardCopyAction'); } catch {}
    try { await vscode.commands.executeCommand('workbench.action.terminal.copySelection'); } catch {}
  }));

  context.subscriptions.push(vscode.commands.registerCommand('ai-oa.telemetry.cut', async (args) => {
    recordEvent('cut', { target: args?.target || 'unknown' });
    try { await vscode.commands.executeCommand('editor.action.clipboardCutAction'); } catch {}
  }));

  // Window focus activity
  context.subscriptions.push(vscode.window.onDidChangeWindowState((e) => {
    recordEvent('windowFocus', { focused: !!e.focused });
  }));

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
