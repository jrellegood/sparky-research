#!/usr/bin/env node
/**
 * Send HTML content directly to Readwise Reader
 * Usage: node send-to-readwise.js article.html "Title" "tag1,tag2" "Notes"
 */

const fs = require('fs');
const https = require('https');

if (process.argv.length < 3) {
  console.error('Usage: node send-to-readwise.js <html-file> [title] [tags] [notes]');
  process.exit(1);
}

const htmlFile = process.argv[2];
const title = process.argv[3] || '';
const tags = process.argv[4] || 'sparky-research';
const notes = process.argv[5] || '';

const token = process.env.READWISE_ACCESS_TOKEN;
if (!token) {
  console.error('Error: READWISE_ACCESS_TOKEN not set');
  process.exit(1);
}

try {
  const htmlContent = fs.readFileSync(htmlFile, 'utf8');
  
  // Extract title from HTML if not provided
  const titleMatch = htmlContent.match(/<title>([^<]+)<\/title>/);
  const finalTitle = title || (titleMatch ? titleMatch[1] : htmlFile);
  
  const payload = {
    url: `https://github.com/jrellegood/sparky-research/blob/main/${htmlFile}`,
    html: htmlContent,
    should_clean_html: true,
    location: 'feed',
    tags: tags.split(',').map(t => t.trim()),
    notes: notes
  };
  
  const data = JSON.stringify(payload);
  
  const options = {
    hostname: 'readwise.io',
    port: 443,
    path: '/api/v3/save/',
    method: 'POST',
    headers: {
      'Authorization': `Token ${token}`,
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  };
  
  const req = https.request(options, (res) => {
    let responseBody = '';
    
    res.on('data', (chunk) => {
      responseBody += chunk;
    });
    
    res.on('end', () => {
      if (res.statusCode === 200 || res.statusCode === 201) {
        const result = JSON.parse(responseBody);
        console.log(`✓ Sent to Readwise: ${result.url}`);
      } else {
        console.error(`Error ${res.statusCode}: ${responseBody}`);
        process.exit(1);
      }
    });
  });
  
  req.on('error', (error) => {
    console.error(`Request failed: ${error.message}`);
    process.exit(1);
  });
  
  req.write(data);
  req.end();
  
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
