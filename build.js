#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');
const buildDir = path.join(__dirname, 'build');

if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
}

// Read HTML template
let html = fs.readFileSync(path.join(srcDir, 'index.html'), 'utf8');

// Inject CSS
const css = fs.readFileSync(path.join(srcDir, 'styles.css'), 'utf8');
html = html.replace('<!-- STYLES_PLACEHOLDER -->', `<style>\n${css}\n</style>`);

// Concatenate JS in dependency order
const jsFiles = [
  'constants.js',
  'state.js',
  'audio.js',
  'animations.js',
  'renderer.js',
  'cards.js',
  'main.js',
];

const js = jsFiles
  .map(f => `// ── ${f} ──\n${fs.readFileSync(path.join(srcDir, f), 'utf8')}`)
  .join('\n\n');

html = html.replace('<!-- SCRIPTS_PLACEHOLDER -->', `<script>\n${js}\n</script>`);

const outFile = path.join(buildDir, 'broadside.html');
fs.writeFileSync(outFile, html, 'utf8');
console.log(`Built: ${outFile} (${(fs.statSync(outFile).size / 1024).toFixed(1)} KB)`);
