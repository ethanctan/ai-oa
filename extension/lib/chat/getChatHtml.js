const fs = require('fs');
const path = require('path');

function getChatHtml() {
  const htmlPath = path.join(__dirname, 'chat.html');
  return fs.readFileSync(htmlPath, 'utf8');
}

module.exports = { getChatHtml };
