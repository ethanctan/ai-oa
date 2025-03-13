// NOT IN USE FOR MVP

// lib/context/getTree.js

const fs = require('fs');
const path = require('path');

/**
 * Recursively builds a file tree.
 * @param {string} dir - The directory path to scan.
 * @returns {Object} - The tree object.
 */
function buildFileTree(dir) {
  // Create the root node for the directory.
  const tree = {
    name: path.basename(dir),
    type: 'directory',
    children: []
  };

  // Read directory contents.
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      // Recursively build the tree for subdirectories.
      tree.children.push(buildFileTree(fullPath));
    } else if (item.isFile()) {
      // For files, capture the name and file extension.
      tree.children.push({
        name: item.name,
        type: 'file',
        extension: path.extname(item.name)
      });
    }
  }

  return tree;
}

module.exports = { buildFileTree };
