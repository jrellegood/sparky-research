# Skill/Plugin Architecture Patterns: Load-Time vs Runtime Discovery

*How OpenClaw, LangChain, and AutoGPT teach agents new tricks — and why the timing matters*

---

## The Extensibility Problem

You've built your AI agent. Now it needs to learn 47 new skills: send emails, control smart devices, query databases, browse the web, manage Git repos. How do you teach it all this without:

- Hardcoding everything into the core (unmaintainable)
- Loading unused capabilities into context (expensive)
- Breaking existing functionality when adding new tools (fragile)
- Creating dependency hell (frustrating)

Three popular frameworks took three different approaches: **LangChain** (runtime registration), **AutoGPT** (command-based discovery), and **OpenClaw** (load-time filtering). Each optimizes for different constraints.

Let's break them down.

---

## LangChain: Runtime Registration

**Philosophy:** Tools are Python objects registered at runtime. Maximum flexibility, programmatic control.

```python
from langchain.tools import Tool
from langchain.agents import initialize_agent, AgentType

# Define your tools
def get_weather(location: str) -> str:
    return f"Weather in {location}: Sunny, 72°F"

weather_tool = Tool(
    name="weather",
    func=get_weather,
    description="Get current weather for a location"
)

# Register and run
tools = [weather_tool, search_tool, calculator_tool]
agent = initialize_agent(tools, llm, agent=AgentType.ZERO_SHOT_REACT_DESCRIPTION)
```

**Discovery mechanism:**
1. Tools are Python objects instantiated at runtime
2. Agent introspects `tools` list to build function descriptions
3. LLM receives function schemas in system prompt
4. LLM outputs function calls in structured format
5. Framework routes calls to registered Python functions

**Pros:**
- **Type safety** - Python type hints catch errors at dev time
- **Dynamic composition** - Build tool lists programmatically based on context
- **Rich abstractions** - Chains, agents, memory modules all first-class
- **Debugging** - Step through Python code, set breakpoints

**Cons:**
- **All tools always loaded** - No filtering by availability or permissions
- **Heavy dependencies** - Full LangChain install just to use one tool
- **Context bloat** - Unused tools still consume prompt tokens
- **Abstraction overhead** - [Developers complain](https://minimaxir.com/2023/07/langchain-problem/) about complexity

**When to use:**
- Building complex, multi-step workflows
- Need programmatic tool composition
- Type safety matters more than context efficiency
- Team is comfortable with heavy Python frameworks

---

## AutoGPT: Command-Based Discovery

**Philosophy:** Agents execute commands from a predefined registry. The LLM learns available commands through prompt engineering.

```python
# From AutoGPT's command registry
commands = {
    "google": google_search,
    "browse_website": browse_website,
    "write_to_file": write_file,
    "start_agent": spawn_agent,
    # ... 20+ built-in commands
}

# Injected into prompt:
"""
Commands:
1. Google Search: "google", args: "input": "<search>"
2. Browse Website: "browse_website", args: "url": "<url>", "question": "<what_you_want_to_find>"
3. Write to File: "write_to_file", args: "file": "<file>", "text": "<text>"
...
"""
```

**Discovery mechanism:**
1. Commands are plain text descriptions in the system prompt
2. LLM outputs JSON with command name + arguments
3. Framework parses JSON, looks up command in registry
4. Executes Python function, returns string result
5. Result is added to memory (both short-term and vector DB)

**Memory system:**
- **Short-term:** Last 9 messages (FIFO queue)
- **Long-term:** Embeddings stored in Pinecone/FAISS, KNN search for relevant memories
- Each turn: Query top-K (K=10) memories, inject into prompt under "This reminds you of events from your past"

**Pros:**
- **Simple mental model** - Commands are just functions
- **Built-in memory** - Vector search for long-running tasks
- **Agent spawning** - Recursive sub-agents for complex workflows
- **Proven in practice** - Thousands of successful autonomous runs

**Cons:**
- **No load-time filtering** - All commands always available, even if dependencies missing
- **Fragile parsing** - JSON extraction from LLM output fails frequently
- **Limited customization** - Adding commands requires forking the repo
- **Token inefficient** - Lists all commands even if user context suggests only 2 are needed

**When to use:**
- Autonomous, long-running tasks (research, content generation)
- Need memory across sessions
- Want recursive agent spawning
- Don't mind occasional JSON parsing failures

---

## OpenClaw: Load-Time Filtering

**Philosophy:** Skills are markdown instructions filtered at startup. Only usable capabilities enter the prompt.

```yaml
---
name: weather
description: Get current weather and forecasts
metadata:
  openclaw:
    emoji: "🌤"
    requires:
      bins: ["curl"]  # Must be on PATH
      env: []         # No API keys needed
---

# Weather Skill

When the user asks about weather, use `curl`:

```bash
curl "https://wttr.in/San_Francisco?format=3"
```

For detailed forecast:
```bash
curl "https://wttr.in/San_Francisco"
```
```

**Discovery mechanism:**
1. At startup, scan `workspace/skills`, `~/.openclaw/skills`, bundled skills
2. Check each skill's `requires` metadata (bins, env vars, OS compatibility)
3. Filter out skills with missing dependencies
4. Inject only usable skills into system prompt
5. LLM reads markdown instructions, calls tools via existing functions (exec, web_fetch, etc.)

**Precedence hierarchy:**
```
workspace/skills      (highest - per-agent overrides)
  ↓
~/.openclaw/skills    (shared across agents)
  ↓
bundled/skills        (shipped with OpenClaw)
```

**Filtering example:**

50 skills installed, but:
- 12 missing required binaries → filtered out
- 8 missing API keys → filtered out
- 5 incompatible OS → filtered out
- **25 skills loaded** (50% reduction in context)

**Token math:**
- Base overhead: 195 chars (only when ≥1 skill)
- Per skill: 97 + name + description + location ≈ 44 tokens
- 50 skills unfiltered = ~2,200 tokens wasted
- 25 skills filtered = ~1,100 tokens of useful context

**Pros:**
- **Context efficient** - Only load usable skills
- **Override hierarchy** - Test modifications without touching originals
- **Zero ceremony** - Just drop markdown file in directory
- **Self-documenting** - Skills are literally instructions
- **Scoped secrets** - Environment injected per-run, not globally

**Cons:**
- **Less programmatic** - Can't build skill lists dynamically
- **No type safety** - Skills are text, not typed functions
- **Simpler patterns only** - Complex logic needs proper tool implementation
- **Static filtering** - Can't enable/disable skills mid-session

**When to use:**
- Context window is precious (expensive models, long conversations)
- Many skills but most aren't always relevant
- Want easy user customization (just edit markdown)
- Prefer simplicity over programmatic control

---

## The Decision Matrix

| Factor | LangChain | AutoGPT | OpenClaw |
|--------|-----------|---------|----------|
| **Context efficiency** | ❌ All tools loaded | ❌ All commands listed | ✅ Filtered at startup |
| **Type safety** | ✅ Python types | ⚠️ JSON parsing | ❌ Text-based |
| **Customization** | ✅ Programmatic | ⚠️ Fork required | ✅ Drop-in overrides |
| **Memory system** | ⚠️ Optional add-on | ✅ Built-in (short + vector) | ✅ Semantic search |
| **Learning curve** | 📈 Steep | 📊 Moderate | 📉 Gentle |
| **Token cost** | 💰💰💰 High | 💰💰 Medium | 💰 Low |
| **Best for** | Complex workflows | Autonomous tasks | Chat assistants |

---

## Best Practices Across Frameworks

### 1. Gate by Capability, Not Intent

**Bad:**
```python
# Load all tools, check at runtime
tools = [gmail_tool, slack_tool, calendar_tool]
# User asks about weather → agent tries Gmail, fails
```

**Good:**
```yaml
# OpenClaw approach
requires:
  bins: ["curl"]
  env: ["WEATHER_API_KEY"]
# Missing deps → skill not loaded
```

### 2. Document Usage Patterns, Not Just APIs

**Bad:**
```python
Tool(name="git", description="Run git commands")
```

**Good:**
```markdown
# Git Skill

To check status:
```bash
git -C /path/to/repo status --short
```

Common mistake: Forgetting `-C` when CWD isn't the repo.
```

The second version teaches the LLM **how** to avoid common failures.

### 3. Precedence Over Versioning

Instead of npm-style version resolution:

```
workspace/skills/weather  (overrides everything)
  ↓
~/.openclaw/skills/weather
  ↓  
bundled/skills/weather
```

Want to test a fix? Just copy to workspace. Roll back? Delete the override.

### 4. Scope Secrets Per-Run

**Bad:**
```bash
export GMAIL_TOKEN="secret"
# Now available to ALL processes forever
```

**Good:**
```json
{
  "skills": {
    "entries": {
      "gmail": {
        "env": {"GMAIL_TOKEN": "secret"}
      }
    }
  }
}
```

Injected only during agent execution, restored after.

### 5. Token Budget Awareness

Every tool costs tokens. If you have 50 tools:

- **LangChain approach:** Load all 50, let LLM figure it out (~3,000 tokens)
- **AutoGPT approach:** List all 50 commands (~2,500 tokens)
- **OpenClaw approach:** Filter to 12 usable (~600 tokens)

The difference compounds across multi-turn conversations.

---

## Hybrid Approach: The Future?

What if you combined the best of each?

```python
# LangChain's type safety + OpenClaw's filtering
@skill(requires={"bins": ["ffmpeg"]})
def video_tool(input: str) -> str:
    """Convert video formats using ffmpeg"""
    # Type-safe implementation
    ...

# Only loaded if ffmpeg exists
# Type hints catch dev-time errors
# Filtered at load-time for efficiency
```

Or AutoGPT's memory + OpenClaw's skills:

```yaml
---
name: research
memory:
  short_term: 10  # Last 10 messages
  long_term: true  # Enable vector search
---

When researching a topic:
1. Query long-term memory for relevant past research
2. Search the web for new information
3. Synthesize findings
4. Store summary in long-term memory
```

The frameworks are converging. LangChain added [structured outputs](https://blog.langchain.dev/structured-outputs/) (AutoGPT's JSON parsing, but type-safe). OpenClaw could add programmatic skill registration (LangChain's flexibility, but filtered).

---

## Key Takeaways

1. **Load-time filtering beats runtime discovery** when context is expensive
2. **Type safety matters** for complex, production-grade tools
3. **Precedence hierarchies** enable safe experimentation
4. **Memory systems** are essential for long-running tasks
5. **Markdown as DSL** is surprisingly powerful for LLM interfaces

**Decision framework:**

- **Building a chatbot?** OpenClaw (context efficiency)
- **Complex workflow orchestration?** LangChain (programmatic control)
- **Autonomous research agent?** AutoGPT (memory + spawning)
- **Production SaaS?** Write custom (tailor to your needs)

The "best" architecture depends on your constraints. But all three teach us valuable patterns:

- Filter early (OpenClaw)
- Type when possible (LangChain)
- Remember context (AutoGPT)

Use them all.

---

## Further Reading

- LangChain Tools: https://python.langchain.com/docs/modules/agents/tools/
- AutoGPT Architecture Breakdown: https://medium.com/@georgesung/ai-agents-autogpt-architecture-breakdown-ba37d60db944
- OpenClaw Skills: https://docs.openclaw.ai/tools/skills
- AgentSkills Spec: https://agentskills.io
