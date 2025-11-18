const vscode = require('vscode');
const { openChat } = require('./src/chat/openChat');

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

  // Heuristic paste detection in editors (independent of keybindings)
  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((event) => {
    try {
      const doc = event.document;
      for (const change of event.contentChanges) {
        const inserted = change.text || '';
        const isPureInsert = change.rangeLength === 0 && inserted.length > 0;
        const looksLikePaste = isPureInsert && (inserted.includes('\n') || inserted.length >= 20);
        if (looksLikePaste) {
          recordEvent('pasteHeuristic', {
            target: 'editor',
            file: doc?.uri?.toString() || 'unknown',
            length: inserted.length,
            content: inserted,
            position: { line: change.range.start.line, character: change.range.start.character }
          });
        }
      }
    } catch {}
  }));

  // Clipboard polling fallback (desktop only – web uses webview-based polling)
  const isWebHost = ((vscode.env.appHost || '').toLowerCase() === 'web') || (vscode.UIKind && vscode.env.uiKind === vscode.UIKind.Web);
  if (!isWebHost) {
    let lastClipboardText = undefined;
    const CLIPBOARD_POLL_MS = 750;
    const clipboardPoll = setInterval(async () => {
      try {
        const text = await vscode.env.clipboard.readText();
        if (text !== lastClipboardText) {
          lastClipboardText = text;
          recordEvent('copy', { target: 'clipboardPoll', content: text, length: (text || '').length });
        }
      } catch (error) {
        // If the host denies access, stop polling to avoid repeated errors
        clearInterval(clipboardPoll);
        recordEvent('clipboardPollingDisabled', { reason: error?.message || 'unknown' });
      }
    }, CLIPBOARD_POLL_MS);
    context.subscriptions.push({ dispose: () => clearInterval(clipboardPoll) });
  } else {
    console.log('Clipboard polling skipped in web host; relying on webview telemetry.');
  }

  // Wrapped paste/copy/cut commands: forward to default after logging
  context.subscriptions.push(vscode.commands.registerCommand('ai-oa.telemetry.paste', async (args) => {
    try {
      const text = await vscode.env.clipboard.readText();
      recordEvent('paste', { target: args?.target || 'unknown', content: text, length: (text || '').length });
    } catch {
      recordEvent('paste', { target: args?.target || 'unknown' });
    }
    try { await vscode.commands.executeCommand('editor.action.clipboardPasteAction'); } catch {}
    try { await vscode.commands.executeCommand('workbench.action.terminal.paste'); } catch {}
  }));

  context.subscriptions.push(vscode.commands.registerCommand('ai-oa.telemetry.copy', async (args) => {
    try { await vscode.commands.executeCommand('editor.action.clipboardCopyAction'); } catch {}
    try { await vscode.commands.executeCommand('workbench.action.terminal.copySelection'); } catch {}
    try {
      const text = await vscode.env.clipboard.readText();
      recordEvent('copy', { target: args?.target || 'unknown', content: text, length: (text || '').length });
    } catch {
      recordEvent('copy', { target: args?.target || 'unknown' });
    }
  }));

  context.subscriptions.push(vscode.commands.registerCommand('ai-oa.telemetry.cut', async (args) => {
    try { await vscode.commands.executeCommand('editor.action.clipboardCutAction'); } catch {}
    try {
      const text = await vscode.env.clipboard.readText();
      recordEvent('cut', { target: args?.target || 'unknown', content: text, length: (text || '').length });
    } catch {
      recordEvent('cut', { target: args?.target || 'unknown' });
    }
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
