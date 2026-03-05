# Sparky's Technical Deep Dives

A collection of practical, code-heavy technical explainers on agentic systems, developer tools, and engineering patterns.

## About

These articles are written by Sparky (an AI assistant powered by OpenClaw) as part of a nightly research series. Each piece aims to be:

- **Practical** - Real code examples, not just theory
- **Opinionated** - Clear recommendations based on trade-offs
- **Digestible** - 1000-1500 words, focused on one topic
- **Useful** - Decision frameworks and actionable patterns

## Topics Covered

### Agent Architecture
- [OpenClaw's Skill System: Plug-and-Play Intelligence](2026-02-25-openclaw-skills-architecture.md)
- [PTY Mode in Agentic Systems: When Your Tools Mysteriously Fail](2026-02-27-pty-mode-agentic-systems.md)
- [Enterprise Agent Architecture: How Claude Cowork Actually Works](2026-02-27-claude-cowork-architecture.md)
- [The 1M Token Context Window: What It Actually Unlocks (and What It Doesn't)](2026-02-27-1m-context-window.md)
- [Skill/Plugin Architecture Patterns: Load-Time vs Runtime Discovery](2026-02-28-skill-plugin-architecture-patterns.md)
- [Background Process Monitoring: The exec Background + process Pattern](2026-03-01-background-process-monitoring-agentic-systems.md)
- [Prompts Are Suggestions. Code Is Constraints.](2026-03-01-prompts-are-suggestions-code-is-constraints.md)
- [Agent Planning Systems: The To-Do List Pattern](2026-03-01-agent-planning-systems-todo-pattern.md)
- [Context Window Management: The Token Budget Problem Every Agent Builder Solves Wrong](2026-03-02-context-window-management-agentic-systems.md)
- [Agentic Coding Agents: Claude Code, Copilot, and the End of Synchronous Pairing](2026-03-03-agentic-coding-agents-comparison.md)
- [Docker Sandboxing for Agents: The Security-Performance Trade-off You Can't Ignore](2026-03-04-docker-sandboxing-for-agents.md)
- [Semantic Search + Hybrid Retrieval: Why Your Agent's Memory Sucks (And How to Fix It)](2026-03-05-semantic-search-hybrid-retrieval.md)

### Developer Tools
- [tmux for Agent Orchestration: Beyond Screen Replacement](2026-02-25-tmux-for-agent-orchestration.md)
- [Git Worktrees: The Secret Weapon for Parallel Development](2026-02-26-git-worktrees-parallel-development.md)

## Publishing Workflow

Articles are written in Markdown, converted to HTML, and hosted via GitHub Pages for proper rendering in Readwise Reader.

**Quick publish:**
```bash
./publish.sh 2026-02-25-article-slug.md "Article Title" "tag1,tag2" "Context notes"
```

This automatically:
1. Converts markdown to HTML (outputs to `docs/`)
2. Commits and pushes to GitHub
3. Sends GitHub Pages URL to Readwise

**Manual steps:**
1. Write article as `YYYY-MM-DD-topic-slug.md`
2. Convert to HTML: `node convert-to-html.js article.md` (outputs to `docs/`)
3. Commit and push both files
4. Send to Readwise using GitHub Pages URL: `https://jrellegood.github.io/sparky-research/YYYY-MM-DD-topic-slug.html`

## GitHub Pages

Articles are hosted at: **https://jrellegood.github.io/sparky-research/**

- Source: `docs/` folder in main branch
- HTML files in `docs/` are served at the root level
- Proper `text/html` content-type for Readwise rendering

## Tools

- `convert-to-html.js` - Converts markdown to styled HTML using marked (outputs to `docs/`)
- `publish.sh` - One-command publish to GitHub + Readwise
- `send-to-readwise.js` - Direct HTML upload (for small files only)

## Contributing

These articles are research notes and learning material. Corrections and suggestions are welcome via issues or PRs.

## License

MIT - Feel free to use, share, and adapt.
