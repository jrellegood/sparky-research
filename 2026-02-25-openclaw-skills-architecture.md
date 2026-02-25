# OpenClaw's Skill System: Plug-and-Play Intelligence

*Understanding how OpenClaw teaches agents new capabilities through modular, filterable instruction packages*

---

## The Problem

You're building an AI agent. It needs to interact with your calendar, send emails, control smart lights, and maybe even order pizza. How do you teach it all this without bloating the core system?

Traditional approaches:
- **Hardcode everything** - Rigid, unmaintainable, breaks when APIs change
- **Dynamic tool calling** - Flexible but slow, checks availability at runtime
- **Plugin hell** - Each tool needs deep integration, version conflicts everywhere

OpenClaw takes a different approach: **Skills as filtered instruction packages**.

---

## What is a Skill?

A skill is a directory containing:
- `SKILL.md` - YAML frontmatter + markdown instructions
- Optional scripts, assets, helpers

That's it. No complex plugin API, no registration ceremony. Just instructions the LLM can read.

**Example: Weather skill**

```markdown
---
name: weather
description: Get current weather and forecasts (no API key required)
metadata:
  {
    "openclaw": {
      "emoji": "🌤",
      "requires": { "bins": ["curl"] }
    }
  }
---

# Weather Skill

When the user asks about weather, use `curl` to fetch from wttr.in:

\`\`\`bash
curl "https://wttr.in/San_Francisco?format=3"
\`\`\`

For detailed forecast:
\`\`\`bash
curl "https://wttr.in/San_Francisco"
\`\`\`
```

The LLM reads this and learns: "I can get weather by curling wttr.in."

---

## The Key Innovation: Load-Time Filtering

Here's where it gets interesting. OpenClaw doesn't load ALL skills into context. It filters at startup based on:

### 1. Binary Availability
```yaml
metadata:
  openclaw:
    requires:
      bins: ["docker", "jq"]  # Must be on PATH
```

If `docker` isn't installed, the skill never enters the prompt. Zero runtime checks, zero wasted context.

### 2. Environment Variables
```yaml
metadata:
  openclaw:
    requires:
      env: ["GEMINI_API_KEY"]
```

No API key? Skill is filtered out. The agent never tries to use it.

### 3. Config Paths
```yaml
metadata:
  openclaw:
    requires:
      config: ["browser.enabled"]
```

Check arbitrary config values. Only load skills when infrastructure is ready.

### 4. Platform Gating
```yaml
metadata:
  openclaw:
    os: ["darwin", "linux"]  # Not Windows
```

Skills self-declare compatibility. No cross-platform bugs from unavailable tools.

---

## Why This Matters

**Scenario:** You have 50 skills installed. Only 12 are usable on your current machine.

**Traditional approach:** Load all 50, agent tries unusable ones, fails at runtime, wastes tokens and time.

**OpenClaw approach:** Load 12, inject 12 into context. Smaller prompt, faster inference, no runtime failures.

**The math:**
- Base overhead: ~195 chars (only when ≥1 skill)
- Per skill: ~97 chars + name/description/location lengths
- Rough estimate: ~24 tokens per skill

50 skills = ~1,200 tokens wasted on unavailable tools.  
12 skills = ~288 tokens of useful context.

That's a **75% reduction** in skill-related prompt size.

---

## Precedence: The Override Hierarchy

Skills load from three locations with clear precedence:

```
1. <workspace>/skills      (highest - per-agent)
2. ~/.openclaw/skills      (shared across agents)
3. Bundled skills          (shipped with OpenClaw)
```

**Use case:** You want to test a modified version of the bundled `weather` skill.

```bash
# Copy bundled skill to workspace
cp -r ~/.openclaw/skills/weather ~/workspace/skills/

# Edit it
vim ~/workspace/skills/weather/SKILL.md

# Next session automatically uses your version
```

No code changes. No config tweaks. Just directory precedence.

**Why this is brilliant:**

- Test modifications without touching originals
- Per-agent customization in multi-agent setups
- Roll back by just deleting the override
- Share improvements by moving from workspace → managed

---

## Configuration & Secrets

Skills can be configured in `openclaw.json`:

```json5
{
  skills: {
    entries: {
      "nano-banana-pro": {
        enabled: true,
        apiKey: "GEMINI_KEY_HERE",
        env: {
          CUSTOM_ENDPOINT: "https://api.example.com"
        },
        config: {
          model: "nano-pro"
        }
      }
    }
  }
}
```

**The scoping trick:** Environment variables are injected **per agent run**, not globally.

```
Agent run starts
  → Inject skill.env into process.env
  → Build prompt with eligible skills
  → Agent executes
  → Restore original environment
Agent run ends
```

**Why this matters:**

- No global env pollution
- Secrets isolated per session
- Multi-agent systems can have different configs
- No risk of leaked credentials across contexts

---

## Real-World Example: Coding Agent Skill

Let's look at a complex skill to see the pattern in action:

```yaml
---
name: coding-agent
description: Run Codex CLI, Claude Code, OpenCode, or Pi Coding Agent
metadata:
  {
    "openclaw": {
      "emoji": "🧩",
      "requires": { "anyBins": ["claude", "codex", "opencode", "pi"] }
    }
  }
---

# Coding Agent (bash-first)

⚠️ PTY Mode Required!

Coding agents need a pseudo-terminal. Always use `pty:true`:

\`\`\`bash
bash pty:true command:"codex exec 'Your prompt'"
\`\`\`

### Background Mode

For longer tasks:
\`\`\`bash
bash pty:true workdir:~/project background:true command:"codex --full-auto 'Build feature'"
# Returns sessionId

process action:log sessionId:XXX  # Monitor
process action:kill sessionId:XXX # Terminate
\`\`\`

[... rest of instructions ...]
```

**Notice:**

- `anyBins` - Only needs ONE of the coding agents installed
- Clear warnings about PTY requirement (common failure mode)
- Practical examples with actual commands
- Monitoring patterns included

The skill teaches both **what** tools are available and **how** to use them correctly.

---

## Performance: Token Impact

Every skill costs tokens. OpenClaw is upfront about it:

**Formula (characters):**
```
total = 195 + Σ (97 + len(name) + len(description) + len(location))
```

**Example calculation:**

Skill with:
- name: "weather" (7 chars)
- description: "Get current weather and forecasts" (33 chars)
- location: "/home/user/.openclaw/skills/weather" (37 chars)

Cost: 97 + 7 + 33 + 37 = **174 chars** ≈ **44 tokens**

**Decision framework:**

- Under 20 skills? Don't worry about it (~1,000 tokens)
- 20-50 skills? Use gating aggressively (~2,500 tokens)
- Over 50 skills? Split into specialized agents (~5,000+ tokens)

---

## Comparison to Other Frameworks

### LangChain Tools

```python
from langchain.tools import Tool

weather_tool = Tool(
    name="weather",
    func=get_weather,
    description="Get weather for a location"
)
```

**Pros:** Programmatic, type-safe  
**Cons:** Code-heavy, runtime loading only, no filtering

### AutoGPT Plugins

```json
{
  "name": "weather",
  "enabled": true,
  "config": {...}
}
```

**Pros:** JSON config, enable/disable  
**Cons:** No load-time filtering, all plugins in memory

### OpenClaw Skills

```yaml
metadata:
  openclaw:
    requires:
      bins: ["curl"]
```

**Pros:** Load-time filtering, precedence overrides, minimal API  
**Cons:** Less programmatic control, simpler patterns only

**The trade-off:** OpenClaw sacrifices programmatic flexibility for simplicity and context efficiency.

---

## Patterns Worth Stealing

### 1. Load-Time Filtering
Check dependencies BEFORE building the prompt. Don't waste context on unavailable tools.

### 2. Precedence Hierarchies
Let users override without modifying originals. workspace → managed → bundled.

### 3. Scoped Injection
Don't pollute global environment. Inject secrets per-run, restore after.

### 4. Markdown as DSL
Instructions as documentation. No plugin API to learn, just write clear instructions.

### 5. Self-Describing Metadata
Skills declare their own requirements. No central registry, no version conflicts.

---

## Building Your First Skill

**Step 1: Create directory**
```bash
mkdir -p ~/.openclaw/workspace/skills/hello-world
```

**Step 2: Write SKILL.md**
```markdown
---
name: hello_world
description: A simple greeting skill
---

# Hello World

When the user asks for a greeting, respond with:
"Hello from your custom skill!"
```

**Step 3: Restart OpenClaw**
```bash
openclaw gateway restart
```

**Step 4: Test it**
Ask your agent: "Use the hello world skill"

That's it. No registration, no compilation, no plugin API.

---

## When NOT to Use Skills

Skills are instructions, not code. They're great for:
- Teaching tool usage patterns
- Wrapping CLIs with context
- Providing decision frameworks

They're NOT great for:
- Complex business logic (write a proper tool)
- Stateful operations (use proper services)
- Performance-critical paths (move to compiled code)

**Rule of thumb:** If you need more than 500 words to explain it, consider a native tool instead.

---

## Key Takeaways

1. **Skills = Filtered instructions** - Only load what's usable
2. **Load-time > runtime** - Check dependencies before prompting
3. **Precedence enables iteration** - Override without breaking originals
4. **Scoped secrets** - Per-run injection, no global pollution
5. **Markdown as interface** - Simple, version-controllable, readable
6. **Token awareness** - Every skill costs ~24-50 tokens

OpenClaw's skill system isn't the most powerful tool framework. It's the most **efficient** one. And in agentic systems where context is currency, efficiency wins.

---

## Further Reading

- OpenClaw Skills Docs: https://docs.openclaw.ai/tools/skills
- Creating Skills: https://docs.openclaw.ai/tools/creating-skills
- ClawHub (skill registry): https://clawhub.com
- AgentSkills Spec: https://agentskills.io
