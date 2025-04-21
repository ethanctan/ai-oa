// lib/context/getWorkspaceContent.js
const vscode = require('vscode');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const util = require('util');
const execPromise = util.promisify(exec);

/**
 * Checks if code2prompt is installed and available in the PATH
 */
async function isCode2PromptInstalled() {
  try {
    await execPromise('code2prompt --version');
    return true;
  } catch (error) {
    console.log('code2prompt not found in PATH:', error.message);
    return false;
  }
}

/**
 * Retrieves the content of files in the workspace using code2prompt.
 * Falls back to the original implementation if code2prompt is not available.
 */
async function getWorkspaceContent(includePattern = '**', excludePattern = '') {
  // Get the first workspace folder
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return 'No workspace folder found.';
  }
  
  const workspacePath = workspaceFolders[0].uri.fsPath;
  
  // Check if code2prompt is installed
  const code2promptInstalled = await isCode2PromptInstalled();
  
  if (code2promptInstalled) {
    try {
      console.log('Using code2prompt to process workspace content');
      
      // Create a temporary file to store the output
      const tempOutputFile = path.join(workspacePath, '.code2prompt_output.md');
      
      // Build the code2prompt command
      // We use --path for the workspace path
      // We automatically use .gitignore if it exists
      // We exclude node_modules and python env directories
      const gitignoreFlag = fs.existsSync(path.join(workspacePath, '.gitignore')) 
        ? `--gitignore "${path.join(workspacePath, '.gitignore')}"` 
        : '';
      
      const command = `code2prompt "${workspacePath}" ${gitignoreFlag} --exclude "node_modules,.venv,venv,env,.env,__pycache__,dist,build" --output-file "${tempOutputFile}" --no-codeblock`;

      console.log(`Executing command: ${command}`);
      const { stdout, stderr } = await execPromise(command);
      
      if (stderr) {
        console.error('code2prompt stderr:', stderr);
      }
      
      // Read the output file
      const content = fs.readFileSync(tempOutputFile, 'utf8');
      
      // Delete the temporary file
      fs.unlinkSync(tempOutputFile);

      console.log('code2prompt output:', content);
      
      return content;
    } catch (error) {
      console.error('Error using code2prompt:', error);
      console.log('Falling back to original implementation');
      // Fall back to original implementation
      return fallbackGetWorkspaceContent(includePattern, excludePattern);
    }
  } else {
    console.log('code2prompt not installed, using fallback method');
    // Fall back to original implementation if code2prompt is not installed
    return fallbackGetWorkspaceContent(includePattern, excludePattern);
  }
}

/**
 * Original implementation as fallback
 */
async function fallbackGetWorkspaceContent(includePattern = '**', excludePattern = '') {
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