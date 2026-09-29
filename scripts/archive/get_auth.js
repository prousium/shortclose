const fs = require('fs');
const path = require('path');

const dir = 'C:\\Users\\aditi\\AppData\\Roaming\\Postman\\Partitions\\2f4cfa57-e73c-4cbc-8bd4-986badf9d648\\IndexedDB\\https_desktop.postman.com_0.indexeddb.leveldb';
const files = fs.readdirSync(dir);

for (const file of files) {
  if (file.endsWith('.ldb') || file.endsWith('.log')) {
    const fullPath = path.join(dir, file);
    const data = fs.readFileSync(fullPath, 'utf8');
    let idx = 0;
    while ((idx = data.indexOf('Basic Q1NfQlRQ', idx)) !== -1) {
      const authStr = data.slice(idx, idx + 100).replace(/[^\x20-\x7E]/g, ' ');
      console.log('Found auth:', authStr);
      const match = authStr.match(/Basic\s+([A-Za-z0-9+/=]+)/);
      if (match) {
        console.log('Decoded:', Buffer.from(match[1], 'base64').toString('utf8'));
      }
      idx += 10;
    }
  }
}
