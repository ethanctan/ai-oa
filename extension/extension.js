// extension.js

const vscode = require('vscode');

/**
 * Called when the extension is activated.
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  console.log('Dummy Sidebar extension activated');

  // Register the webview view provider for the sidebar.
  const provider = new DummySidebarViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(DummySidebarViewProvider.viewType, provider)
  );

  // Attempt to auto-show the sidebar. Note: Depending on your Code-Server or VS Code version,
  // you might need to adjust the command id.
  vscode.commands.executeCommand('workbench.view.extension.dummySidebar');
}

function deactivate() {
  // Clean up resources if needed.
}

class DummySidebarViewProvider {
  static viewType = 'dummySidebar.myView';

  /**
   * @param {vscode.Uri} extensionUri
   */
  constructor(extensionUri) {
    this.extensionUri = extensionUri;
  }

  /**
   * This method is called when the view is resolved.
   * @param {vscode.WebviewView} webviewView
   * @param {vscode.WebviewViewResolveContext} context
   * @param {vscode.CancellationToken} token
   */
  resolveWebviewView(webviewView, context, token) {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };

    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);
  }

  /**
   * Returns HTML content for the sidebar.
   * @param {vscode.Webview} webview
   */
  getHtmlForWebview(webview) {
    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dummy Sidebar</title>
  </head>
  <body>
    <h2>Dummy Sidebar</h2>
    <p>This is a dummy right-hand sidebar.</p>
  </body>
</html>`;
  }
}

module.exports = {
  activate,
  deactivate
};
