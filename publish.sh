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
TAGS="${3:-sparky}"
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

# Wait for GitHub Pages to build and deploy (typically 30-60 seconds)
HTML_URL="https://jrellegood.github.io/sparky-research/$HTML_BASENAME"
echo "Waiting for GitHub Pages to deploy $HTML_URL..."
echo "(This usually takes 30-60 seconds)"

# Wait and verify deployment
MAX_ATTEMPTS=60
ATTEMPT=0
while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$HTML_URL")
    if [ "$HTTP_CODE" = "200" ]; then
        echo " ✓ Page is live!"
        break
    fi
    echo -n "."
    sleep 1
    ATTEMPT=$((ATTEMPT + 1))
done

if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
    echo ""
    echo "Warning: Timed out waiting for GitHub Pages. Proceeding anyway..."
fi

# Send to Readwise (GitHub Pages URL)
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
