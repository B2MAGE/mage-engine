const fs = require('node:fs');
const path = require('node:path');

const distDir = path.join(__dirname, '..', 'dist');

// Keep only these files in dist
const filesToKeep = [
  'mage-engine.js',
  'mage-engine.js.map',
  'mage-engine.d.ts',
];

// Read all files in dist
const files = fs.readdirSync(distDir);

// Delete files not in the keep list
files.forEach(file => {
  if (!filesToKeep.includes(file)) {
    const filePath = path.join(distDir, file);
    fs.rmSync(filePath);
    console.log(`Deleted: ${file}`);
  }
});