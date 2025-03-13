// lib/context/getWorkspaceContent.js

const vscode = require('vscode');

/**
 * Retrieves the content of files in the workspace matching a glob pattern,
 * excluding another glob pattern.
 * Returns a single concatenated string.
 */
async function getWorkspaceContent(includePattern = '**', excludePattern = '') {
  const files = await vscode.workspace.findFiles(includePattern, excludePattern);
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

module.exports = { getWorkspaceContent };