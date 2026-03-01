# Article Topic Queue

Topics to research and write about, organized by priority and theme.

## 🔥 High Priority (from Laurie Voss talk - March 1, 2026)

### 1. Agent Planning Systems: The To-Do List Pattern
**Source:** Laurie Voss - Building Production AI Agents (Arise AI)
**Why:** Core pattern for keeping agents on task
**Key Points:**
- Problem: Agents start tasks, then wander off mid-execution
- Solution: First-class planning tools (to-do write/update/read)
- The "in progress" status as a working pointer (highest leverage change)
- Plan re-injection pattern (not in history, dynamically injected after system prompt)
- The "finish gate" - recoverable exceptions that prevent premature completion
- Prompts are suggestions; code is constraints

### 2. Context Engineering: The Large JSON Pattern
**Source:** Laurie Voss - Building Production AI Agents (Arise AI)
**Why:** Practical pattern for handling large datasets without context overflow
**Key Points:**
- Problem: Huge datasets (100k+ tokens) overflow context windows
- Solution: Compress values, not structure (preview + handle pattern)
- JQ/grep as agent query tools (Unix philosophy for AI)
- 10k character hard budget per tool output
- Effectively infinite context through targeted queries
- Small, sharp, composable tools

### 3. Testing Non-Deterministic Systems
**Source:** Laurie Voss - Building Production AI Agents (Arise AI)
**Why:** Solves the "how do you test this?" problem for production agents
**Key Points:**
- Golden sessions from production as ground truth
- Decision point tests (flexible assertions, not exact matching)
- Trajectory tests (LLM as judge with careful prompt tuning)
- Claude Code Review in CI for catching prompt-tool mismatches
- Natural language bugs caught by natural language review
- Don't write expected outputs by hand; let production tell you what good looks like

### 4. Agent Debugging with Agents
**Source:** Laurie Voss - Building Production AI Agents (Arise AI)
**Why:** Meta-level insight - use agents to debug agents
**Key Points:**
- Skills as markdown runbooks for coding agents
- The three-skill debugging loop (Arise traces → Datadog → GCP logs)
- Read-only wrapper scripts as guardrails (not in prompts, in code)
- Skills reference each other naturally
- Using the thing you built to fix the thing you built
- Build observability before you need it

### 5. Enforcing Agent Behavior: Code vs Prompts
**Source:** Laurie Voss - Building Production AI Agents (Arise AI)
**Why:** Fundamental pattern for production reliability
**Key Points:**
- "Prompts are suggestions. Code is constraints."
- Tool-based validation (finish gate as example)
- Recoverable exceptions with structured guidance
- The blocked status for human-in-the-loop escape hatches
- Show, don't tell (concrete examples > abstract instructions)
- If you want agents to follow a rule, put the rule in code

### 6. Small, Sharp, Composable Tools (Unix Philosophy for AI)
**Source:** Laurie Voss - Building Production AI Agents (Arise AI)
**Why:** Design principle that keeps appearing in successful agent systems
**Key Points:**
- JQ, grep, plain text outputs
- Skills reference each other naturally (no orchestration code needed)
- The agent is the shell script; tools are the commands
- One thing well > Swiss army knife tools
- Output of one is input of another
- Cursor, Claude Code, Alex all follow this pattern

## 📚 Backlog

*(Add new topics here as they come up during news curation)*

---

## Writing Guidelines

- 1000-1500 words
- Practical, code-heavy
- Opinionated (what works, what doesn't, why)
- Real examples from production systems
- Focus on patterns, not just tools

## Topic Discovery

- Add during news curation when encountering interesting patterns
- Ask Joe for preferences periodically
- Rotate through AI/ML, agentic systems, dev tooling, Apple/Swift
