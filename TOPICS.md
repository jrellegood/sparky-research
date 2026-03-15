# Article Topic Queue

Topics to research and write about, organized by priority and theme.

## 🔥 High Priority

### Active Context & State Management (Requested by Joe - 2026-03-14)

**Topic 1: Working Memory / Active Context in Conversational Agents**
- How apps/external systems represent and update state to LLMs beyond conversation history
- State representation mechanisms (structured data, JSON schemas, embeddings)
- State update patterns (incremental, full refresh, delta encoding)
- Context as finite resource (attention budget, context rot)

**Topic 2: Session/Activity Representation**
- How to represent ongoing activities (cooking, trip planning, project work) to LLMs
- Activity state modeling: current step, context, goals, constraints
- Enabling LLMs to understand and manipulate multi-turn activity state
- State persistence across sessions

**Key sources found:**
- Anthropic: "Effective context engineering for AI agents"
- GitHub: "Understanding State and State Management in LLM-Based AI Agents"
- OpenAI: Conversation state API docs
- arXiv: ContextBranch (version control for conversation state)
- arXiv: AutoContext (instance-level context learning)

**Why it matters:** Fundamental to building useful conversational agents, surprisingly under-documented

**Joe's question:** How do you make agents aware of *what the user is doing* beyond chat history?

---

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

### 🔜 Next Articles (Prioritized)

**1. Claude Code Scheduled Tasks vs OpenClaw Heartbeats** (Mar 8)
- **Category:** External Research + OpenClaw Patterns
- **Source:** Claude Code Desktop scheduled tasks release (March 2026)
- **Connection:** Relates directly to our heartbeat vs cron discussion
- **Key Points:**
  - Desktop tasks (persistent, GUI, worktree isolation) vs CLI /loop (session-scoped, ephemeral)
  - Permission models and approval flows
  - Catch-up logic and missed runs
  - Comparison to OpenClaw's heartbeat + cron patterns
  - Batching orchestration vs batching tool calls
  - Context poisoning trade-offs
  - Stateful batching without conversation history (the hybrid approach)
- **Angle:** Two philosophies for autonomous agent scheduling
- **Request:** Joe asked for this after our heartbeat/cron design discussion

**2. OpenClaw Message Channels: Routing, Sessions, and Multi-Surface Best Practices**
- **Category:** OpenClaw Features & Patterns
- **Dual Perspective:**
  - **User view:** When to reply naturally vs use `message` tool, reply tags, multi-channel routing, NO_REPLY pattern, avoiding duplicate sends
  - **Infrastructure view:** How sessions map to channels, when messages are in-session vs cross-session, channel capabilities (reactions, inline buttons, formatting), the message routing pipeline
- **Key Topics:**
  - Main session vs isolated sessions (where messages go by default)
  - `sessions_send` vs `message` tool vs natural reply (when to use each)
  - Reply tags (`[[reply_to_current]]`) and platform support
  - Channel-specific constraints (Discord no tables, WhatsApp no headers, Signal reactions minimal mode)
  - Group chat etiquette (HEARTBEAT_OK, when to speak vs stay silent)
- **Why it matters:** Prevents common mistakes like double-sends, helps users understand session boundaries
- **Request:** Joe wants both user best practices and infrastructure understanding

**3. Sub-Agent Orchestration in OpenClaw: When to Delegate, How to Coordinate**
- **Category:** OpenClaw Features & Patterns
- **Dual Perspective:**
  - **User view:** When to spawn vs do it yourself, task framing, cleanup strategies, monitoring without polling
  - **Infrastructure view:** Session lifecycle, how announcements work, isolated vs main session differences, token budget implications
- **Key Topics:**
  - `sessions_spawn` patterns (task framing, model selection, timeout tuning)
  - `subagents` tool (list, steer, kill - when to use each)
  - Push-based completion (why not to poll in loops)
  - Cleanup strategies (delete vs keep)
  - Real examples: research tasks, long-running builds, parallel data processing
  - Anti-patterns: spawning for trivial tasks, polling loops, unclear task boundaries
- **Why it matters:** Sub-agents are powerful but easy to misuse; understanding lifecycle helps avoid waste
- **Request:** Joe wants both user best practices and infrastructure understanding

### Go vs Swift: Type Safety for AI Agent Development
- **Category:** External Research (with personal angle - Joe's Swift background)
- **Thesis:** Go is gaining traction for AI agent coding due to type safety, compiled performance, and simple syntax
- **Comparison angles:**
  - **Similarities:** Both type-safe, compiled, modern concurrency primitives (goroutines vs async/await), strong standard libraries
  - **Differences:** Memory model (GC vs ARC), error handling (explicit returns vs throws), struct vs class/struct duality, protocol vs interface semantics
  - **AI-specific considerations:**
    - Goroutines for parallel tool execution vs Swift Concurrency
    - JSON marshaling patterns (critical for LLM tool schemas)
    - Deployment targets (servers/CLIs for Go, Apple ecosystem for Swift)
    - Ecosystem maturity for AI libraries (LangChain ports, OpenAI SDKs, vector DBs)
- **Personal context:** Joe has 7 years Swift experience - how does that transfer to Go for agent work?
- **Why it matters:** If you're building agentic systems, language choice affects architecture (concurrent tool calls, type-safe schemas, deployment flexibility)
- **Source:** Comes up in AI agent community discussions

*(Add new topics here as they come up during news curation)*

---

## Writing Guidelines

- 1000-1500 words
- Practical, code-heavy
- Opinionated (what works, what doesn't, why)
- Real examples from production systems
- Focus on patterns, not just tools

## Topic Categories

**1. External Research** (AI/ML, agentic systems, dev tooling, Apple/Swift)
- Industry patterns, new tools, case studies
- Source: News curation, web research
- Frequency: 2-3x per week

**2. OpenClaw Features & Patterns** (practical user guides)
- Features Joe could be using better
- Patterns I've discovered through actual usage
- "How to do X with OpenClaw"
- Source: My own experience, docs deep-dives, skill exploration
- Frequency: 1-2x per week
- **Examples:**
  - Skills system architecture and best practices
  - Memory strategies (daily logs vs MEMORY.md vs search)
  - Heartbeat vs cron trade-offs (already discussed!)
  - Sub-agent orchestration patterns
  - Browser automation workflows
  - Message routing and multi-channel integration
  - Node integration for embodied agents (Reachy use case)

## Topic Discovery

- Add during news curation when encountering interesting patterns
- Add when discovering OpenClaw features/patterns worth sharing
- Ask Joe for preferences periodically
- Rotate between external research and internal OpenClaw content
