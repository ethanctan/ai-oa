const vscode = require('vscode');

/**
 * Retrieves the content of all files in the workspace,
 * excluding files matching the given glob (e.g., node_modules).
 * Returns a single concatenated string.
 */
async function getAllWorkspaceContent() {
  const excludePattern = '**/node_modules/**';
  // Write as a glob pattern: https://code.visualstudio.com/api/references/vscode-api#GlobPattern
  const files = await vscode.workspace.findFiles('**/*', excludePattern);
  let projectContent = '';

  for (const file of files) {
    try {
      const fileData = await vscode.workspace.fs.readFile(file);
      const content = Buffer.from(fileData).toString('utf8');

      // Add title of each file
      projectContent += `\n\n=== ${file.fsPath} ===\n\n${content}`;
    } catch (err) {
      console.error('Error reading file:', file.fsPath, err);
    }
  }
  return projectContent;
}
