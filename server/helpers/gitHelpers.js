// helpers/gitHelpers.js

/**
 * Clones a GitHub repository to a target directory.
 * @param {string} repoUrl - The GitHub repository URL.
 * @param {string} targetDir - The absolute path where the repo should be cloned.
 * @param {string} [token] - Optional GitHub Personal Access Token for private repos.
 * @param {function} execPromise - Promisified version of Node.js exec function. (It executes shell commands and returns a promise)
 */
async function cloneRepo(repoUrl, targetDir, token, execPromise) {
    // If a token is provided, insert it into the repo URL (for HTTPS)
    let cloneUrl = repoUrl;
    if (token && repoUrl.startsWith('https://')) {
      // Insert token after https:// (be mindful of encoding or special characters)
      cloneUrl = repoUrl.replace(
        'https://',
        `https://${token}@`
      );
    } else {
      throw new Error('Invalid GitHub repository URL');
    }
  
    const command = `git clone ${cloneUrl} ${targetDir}`;
    console.log('Cloning repository with command:', command);
    try {
      await execPromise(command);
      return targetDir;
    } catch (error) {
      throw new Error(`Error cloning repository: ${error.message}`);
    }
  }

/**
 * Sanitizes a name for use as the target directory for a 'git clone' command.
 * @param {string} name - The name to sanitize.
 * @returns {string} Sanitized name.
 */
function sanitizeName(name) {
  return name.replace(/[^a-z0-9]/gi, '_');
}

module.exports = {
  cloneRepo,
  sanitizeName
};