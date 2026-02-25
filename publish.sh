#!/bin/bash
# Publish a markdown article to GitHub and Readwise
# Usage: ./publish.sh 2026-02-25-article-slug.md "Article Title" "tag1,tag2" "Context notes"

set -e

if [ $# -lt 2 ]; then
    echo "Usage: ./publish.sh <markdown-file> <title> [tags] [notes]"
    exit 1
fi

MARKDOWN_FILE="$1"
TITLE="$2"
TAGS="${3:-sparky-research}"
NOTES="${4:-}"

if [ ! -f "$MARKDOWN_FILE" ]; then
    echo "Error: File $MARKDOWN_FILE not found"
    exit 1
fi

# Convert to HTML (outputs to docs/)
echo "Converting to HTML..."
node convert-to-html.js "$MARKDOWN_FILE"
HTML_BASENAME=$(basename "${MARKDOWN_FILE%.md}.html")
HTML_FILE="docs/$HTML_BASENAME"

# Commit and push
echo "Committing to git..."
git add "$MARKDOWN_FILE" "$HTML_FILE"
git commit -m "Add: $TITLE"

echo "Pushing to GitHub..."
git push origin main

# Wait a moment for GitHub to process
sleep 2

# Send to Readwise (GitHub Pages URL)
HTML_URL="https://jrellegood.github.io/sparky-research/$HTML_BASENAME"
echo "Sending to Readwise: $HTML_URL"

curl -X POST https://readwise.io/api/v3/save/ \
  -H "Authorization: Token $READWISE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"url\": \"$HTML_URL\",
    \"title\": \"$TITLE\",
    \"location\": \"feed\",
    \"tags\": [$(echo "$TAGS" | sed 's/,/", "/g' | sed 's/^/"/' | sed 's/$/"/')],
    \"notes\": \"$NOTES\"
  }"

echo ""
echo "✓ Published successfully!"
echo "  Markdown: https://github.com/jrellegood/sparky-research/blob/main/$MARKDOWN_FILE"
echo "  HTML: $HTML_URL"
