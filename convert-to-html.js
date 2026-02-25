#!/usr/bin/env node
/**
 * Markdown to HTML converter using marked
 * Usage: node convert-to-html.js input.md [output.html]
 */

const fs = require('fs');
const path = require('path');
const { marked } = require('marked');

function createHtmlDocument(title, content) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      line-height: 1.6;
      max-width: 800px;
      margin: 40px auto;
      padding: 0 20px;
      color: #24292e;
      background: #ffffff;
    }
    h1, h2, h3, h4, h5, h6 {
      margin-top: 24px;
      margin-bottom: 16px;
      font-weight: 600;
      line-height: 1.25;
    }
    h1 {
      font-size: 2em;
      border-bottom: 1px solid #eaecef;
      padding-bottom: 0.3em;
    }
    h2 {
      font-size: 1.5em;
      border-bottom: 1px solid #eaecef;
      padding-bottom: 0.3em;
    }
    h3 { font-size: 1.25em; }
    code {
      background: #f6f8fa;
      padding: 0.2em 0.4em;
      border-radius: 3px;
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
      font-size: 85%;
    }
    pre {
      background: #f6f8fa;
      padding: 16px;
      border-radius: 6px;
      overflow-x: auto;
      line-height: 1.45;
    }
    pre code {
      background: none;
      padding: 0;
      font-size: 100%;
    }
    a {
      color: #0366d6;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
    ul, ol {
      padding-left: 2em;
      margin: 16px 0;
    }
    li {
      margin: 0.25em 0;
    }
    li > p {
      margin-top: 16px;
    }
    blockquote {
      padding: 0 1em;
      color: #6a737d;
      border-left: 0.25em solid #dfe2e5;
      margin: 16px 0;
    }
    hr {
      height: 0.25em;
      padding: 0;
      margin: 24px 0;
      background-color: #e1e4e8;
      border: 0;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 16px 0;
    }
    table th, table td {
      padding: 6px 13px;
      border: 1px solid #dfe2e5;
    }
    table th {
      font-weight: 600;
      background: #f6f8fa;
    }
    table tr:nth-child(2n) {
      background: #f6f8fa;
    }
    img {
      max-width: 100%;
      box-sizing: border-box;
    }
  </style>
</head>
<body>
${content}
</body>
</html>`;
}

// Main
if (process.argv.length < 3) {
  console.error('Usage: node convert-to-html.js input.md [output.html]');
  process.exit(1);
}

const inputFile = process.argv[2];
const outputFile = process.argv[3] || inputFile.replace(/\.md$/, '.html');

try {
  const markdown = fs.readFileSync(inputFile, 'utf8');
  
  // Extract title from first h1
  const titleMatch = markdown.match(/^# (.+)$/m);
  const title = titleMatch ? titleMatch[1] : path.basename(inputFile, '.md');
  
  // Convert markdown to HTML
  const htmlContent = marked(markdown);
  const fullHtml = createHtmlDocument(title, htmlContent);
  
  fs.writeFileSync(outputFile, fullHtml);
  console.log(`✓ Converted ${inputFile} → ${outputFile}`);
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
