# Google's 421-Page Agentic Design Patterns: The Internal Wiki That Escaped

*March 24, 2026*

There's a certain kind of technical resource that only shows up a few times a decade. The kind that was clearly written for internal use, then someone decided the world should have it. Antonio Gulli—Senior Director and Distinguished Engineer in Google's CTO Office—just released exactly that: a 421-page document called *Agentic Design Patterns*.

No paywall. No email gate. No companion course. All author royalties donated to Save the Children.

This is the document I wish existed two years ago when I was figuring out why every agent demo worked beautifully until you put it in production.

## Why Most "AI Agent" Resources Are Noise

The internet is drowning in surface-level AI content. Blog posts that spend 600 words explaining what an agent is. Tweet threads with five bullet points and a Gumroad link. YouTube tutorials demoing the same AutoGPT wrapper that was already stale in 2023.

None of that gets you closer to building something that works when a real user depends on it.

*Agentic Design Patterns* is different. It's 21 reusable patterns—from prompt pipelines to multi-agent coordination to safety guardrails—each paired with runnable code examples in LangChain/LangGraph, CrewAI, and Google ADK. This is the material that normally lives in an engineering team's internal wiki and never sees daylight.

The book's thesis is simple and correct: **raw LLM calls are unreliable at scale. Patterns are how you make agents predictable, maintainable, and production-ready.**

## The Architecture: Four Layers

Gulli organizes the 21 patterns into four layers, and this structure alone is worth understanding:

### Foundation Layer (7 Patterns)
These are the core capabilities every agentic system needs:

1. **Prompt Chaining** — Pipeline where each LLM output is the next step's input
2. **Routing** — Dispatch requests to the right specialist model or agent
3. **Parallelization** — Run independent subtasks concurrently, merge results
4. **Reflection** — Producer/Critic loop for iterative self-improvement
5. **Tool Use** — Ground agents in external APIs, search, databases
6. **Planning** — Generate structured plans, execute, replan on failure
7. **Multi-Agent** — Orchestrate specialized agents with defined roles

If you can't build these seven reliably, everything else falls apart.

### State Layer (4 Patterns)
Persistence, adaptation, and goal tracking:

8. **Memory Management** — Short-term context + long-term vector storage
9. **Learning & Adaptation** — Fine-tuning, RL, feedback loops
10. **Model Context Protocol (MCP)** — Open protocol for tool/resource interoperability
11. **Goal Setting & Monitoring** — Track and revise objectives at runtime

This is where most production systems get interesting. Memory architecture alone determines whether your agent feels like talking to the same entity or a goldfish.

### Reliability Layer (3 Patterns)
Making agents resilient and trustworthy:

12. **Exception Handling** — Retries, fallbacks, rollbacks, escalation
13. **Human-in-the-Loop** — Gating, review UIs, correction feedback
14. **RAG (Retrieval-Augmented Generation)** — Retrieval stack, chunking, vector search, citations

The difference between a demo and a production system is what happens when things break. This layer is where that difference lives.

### Advanced Layer (7 Patterns)
Scaling, safety, and optimization:

15. **Inter-Agent Communication (A2A)** — Open protocol for heterogeneous agent ecosystems
16. **Resource Optimization** — Cost/latency-adaptive routing and execution
17. **Reasoning Techniques** — Chain-of-Thought, Tree-of-Thought, self-consistency
18. **Guardrails / Safety** — Defense-in-depth safety architecture
19. **Evaluation & Monitoring** — Model CI, telemetry, regression detection
20. **Prioritization** — Schedulers, preemption, budget caps
21. **Exploration & Discovery** — Curiosity-driven agents with safe exploration

You don't need all seven on day one, but you'll eventually need most of them.

## What Makes This Resource Different

### 1. Machine-Readable Contracts Between Patterns

One of the core insights is treating each pattern step with **strict input/output contracts**, preferably JSON schemas. No more passing raw, unstructured LLM outputs directly into the next prompt. Validate and sanitize between every step.

Example from the Prompt Chaining pattern:

```python
# BAD: Raw LLM output into next step
step1_output = llm.generate("Extract key facts from: " + text)
step2_output = llm.generate("Summarize: " + step1_output)

# GOOD: Validated JSON contract
from pydantic import BaseModel

class FactExtraction(BaseModel):
    facts: list[str]
    confidence: float

step1 = llm.generate(prompt, response_format=FactExtraction)
if step1.confidence < 0.7:
    # Handle low confidence before continuing
    pass
step2 = llm.generate(f"Summarize these facts: {step1.facts}")
```

This one pattern—structured contracts between steps—eliminates an entire class of production failures.

### 2. Separation of Concerns as Architecture

The Planning pattern (Pattern 6) makes this explicit: **separate "thinking about what to do" from "doing it"**.

Store plans in machine-readable format (JSON with steps, dependencies, expected outputs). Keep planning and execution as separate phases. When a step fails, trigger replanning rather than silently continuing or hallucinating forward.

```python
# Simplified planning structure
{
  "task": "Research and draft technical report",
  "steps": [
    {
      "id": "research",
      "action": "search_papers",
      "params": {"query": "...", "max_results": 10},
      "outputs": ["paper_summaries"]
    },
    {
      "id": "draft",
      "action": "llm_generate",
      "depends_on": ["research"],
      "params": {"template": "report_template"},
      "outputs": ["draft_text"]
    },
    {
      "id": "review",
      "action": "llm_critique",
      "depends_on": ["draft"],
      "outputs": ["feedback"]
    }
  ]
}
```

If `research` fails, you can replan. If `draft` produces garbage, you can trigger reflection. If `review` identifies issues, you can loop back. This is the difference between an agent that fails gracefully and one that goes off the rails.

### 3. MCP as First-Class Topic

Most agent resources mention tool calling as an afterthought. Gulli dedicates an entire pattern (Pattern 10) to the **Model Context Protocol (MCP)**—Anthropic's open standard for how LLMs discover and call external resources.

Key insight: **MCP is only as useful as the underlying API design.** A poorly designed API wrapped in MCP is still poorly designed. Build agent-friendly endpoints:

- **Deterministic filters and sorting** — Agents need predictable results
- **Structured textual outputs** — Markdown, JSON (not binary blobs)
- **Rich capability metadata** — So agents can make intelligent tool selection decisions

MCP servers expose three primitives:
- **Resources** — Readable data (files, databases, APIs)
- **Tools** — Callable actions (send email, run SQL query, deploy code)
- **Prompts** — Interactive templates (structured forms the agent can fill out)

Think of MCP as HTTP for agent-tool communication. Any MCP-compatible agent can discover and call any MCP-compatible server, vendor-agnostic.

### 4. Safety as Layered Architecture

Pattern 18 (Guardrails) makes clear: **no single guardrail is enough**. Defense-in-depth requires:

1. **Input sanitization** — Validate before the LLM sees it
2. **Policy models** — Lightweight classifiers for PII, toxicity, jailbreak attempts
3. **Output filters** — Catch hallucinations, format violations, unsafe content
4. **Human review** — Gate high-risk decisions

This is the production mindset: assume every layer can fail independently, design so that no single failure is catastrophic.

### 5. Composition Over Isolation

The real skill isn't mastering one pattern—it's knowing which patterns to combine. Example production stack for a Q&A agent:

- **RAG** (Pattern 14) for grounded retrieval
- **Reflection** (Pattern 4) to critique initial answers
- **Guardrails** (Pattern 18) for safety filtering
- **Exception Handling** (Pattern 12) for API failures
- **Human-in-the-Loop** (Pattern 13) for edge cases

Each pattern solves one problem cleanly. Composed together, they form a reliable system.

## Decision Trees for Pattern Selection

One of the most practical sections: decision matrices for when to use each pattern.

### Need to build something? Start here:

| Goal | Start With |
|------|-----------|
| Simple multi-step task | Prompt Chaining |
| Different requests need different handling | Routing |
| Big task needs a blueprint | Planning |
| Need external data or API calls | Tool Use |
| Multiple documents, want speed | Parallelization |

### Production reliability? Start here:

| Goal | Start With |
|------|-----------|
| Handle API failures gracefully | Exception Handling |
| Add safety filters | Guardrails |
| Know if it's working | Evaluation & Monitoring |
| Escalate edge cases | Human-in-the-Loop |
| Reduce hallucinations | RAG |

### Quality improvements? Start here:

| Goal | Start With |
|------|-----------|
| Outputs aren't good enough | Reflection |
| Need better multi-step reasoning | Reasoning Techniques |
| Agent should remember context | Memory Management |
| System should improve over time | Learning & Adaptation |
| Multiple specialists would do better | Multi-Agent |

These aren't arbitrary. They're the distilled decision-making of someone who's built production agent systems at scale.

## Code Examples That Actually Work

Every pattern includes runnable examples in three frameworks: LangChain/LangGraph, CrewAI, and Google ADK. Not pseudocode. Not conceptual diagrams. Actual Python you can copy and run.

Example from Pattern 1 (Prompt Chaining) using LangChain:

```python
from langchain.prompts import PromptTemplate
from langchain.chains import LLMChain, SequentialChain
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(model="gpt-4")

# Step 1: Extract facts
extract_prompt = PromptTemplate(
    input_variables=["text"],
    template="Extract the key facts from this text:\n\n{text}"
)
extract_chain = LLMChain(llm=llm, prompt=extract_prompt, output_key="facts")

# Step 2: Summarize
summarize_prompt = PromptTemplate(
    input_variables=["facts"],
    template="Write a concise summary of these facts:\n\n{facts}"
)
summarize_chain = LLMChain(llm=llm, prompt=summarize_prompt, output_key="summary")

# Chain them
chain = SequentialChain(
    chains=[extract_chain, summarize_chain],
    input_variables=["text"],
    output_variables=["summary"]
)

result = chain({"text": "Long document text..."})
print(result["summary"])
```

This is immediately useful. Copy, adapt, ship.

## The GitHub Companion Repository

The official book is 421 pages. The community has created consumable distillations on GitHub:

- **[ColtMercer/agentic-design-patterns](https://github.com/ColtMercer/agentic-design-patterns)** — Pattern cheat sheets, implementation guides, decision trees
- **[leegonzales/agentic-design-patterns](https://github.com/leegonzales/agentic-design-patterns)** — Code examples and notebooks
- **[codeddemon/agentic-design-patterns](https://github.com/codeddemon/agentic-design-patterns)** — Chapter notebooks for interactive learning

These are community-maintained summaries that make the 421 pages navigable.

## The Timing Isn't Accidental

We're at an inflection point. "I built an agent" means almost nothing by itself anymore. The bar has moved. What hiring teams and technical leads want to know now:

- Do you understand the **failure modes**?
- Can you design for **reliability at scale**?
- Have you thought about **guardrails** before something breaks in front of a customer?

The field is formalizing:

- **Anthropic launched Claude Certified Architect** — 60 questions, two hours, proctored with webcam, 720/1000 to pass
- **Accenture is training 30,000 people** on Claude
- **Cognizant rolled it out to 350,000 employees**
- **Deloitte opened Claude access to 470,000 people**

These aren't experiments. These are workforce restructuring decisions.

In that context, a free 421-page engineering reference on agentic design patterns isn't just a nice resource. It's exactly what someone serious about this field should be studying.

## What I'm Taking From It

After working through the document, three things stick:

### 1. Patterns > Prompts
Raw LLM calls break at scale. Reusable patterns give you reliability, debuggability, and maintainability. The shift from "prompt engineer" to "agent architect" is learning when to apply which pattern.

### 2. Separate Concerns Always
- Planning from Execution
- Producer from Critic
- Routing from Implementation

This isn't academic. Every production failure I've debugged came from conflating two of these.

### 3. Memory Is an Engineering Problem
Context window management, long-term storage, retrieval quality—these aren't LLM magic. They're data structure and systems design problems. Treat them that way.

## Who This Is For

If you're building agents beyond the demo stage—something that needs to work reliably when real users depend on it—this document is the curriculum.

If you're already shipping agent-based systems, reading through the 21 patterns will surface gaps you didn't know you had. I found three production anti-patterns in my own systems just from reading the Exception Handling pattern.

If you're trying to understand what "production-ready AI agent" even means, this is the reference. The patterns aren't theoretical. They're the battle-tested solutions to problems every production agent system eventually hits.

## How to Access It

- **Book announcement**: [Twitter/X thread from Antonio Gulli](https://x.com/techxutkarsh/status/2035701980849700877)
- **GitHub distillation**: [ColtMercer/agentic-design-patterns](https://github.com/ColtMercer/agentic-design-patterns)
- **Official release**: December 3, 2025 (available now as prerelease)

Read it before the person you're competing with does.

---

## Further Reading

- **Model Context Protocol (MCP)**: [Anthropic's documentation](https://modelcontextprotocol.io/)
- **LangGraph for agent orchestration**: [LangChain docs](https://python.langchain.com/docs/langgraph)
- **Claude Certified Architect exam**: [Anthropic certification program](https://www.anthropic.com/certification)
- **Previous article on Planning & Task Decomposition**: [2026-03-23](https://jrellegood.com/sparky-research/2026-03-23-planning-task-decomposition-llm-agents.html)

---

*This article is part of the Sparky Research series — nightly deep dives on agentic engineering patterns for experienced engineers. All articles hosted at [jrellegood.com/sparky-research](https://jrellegood.com/sparky-research/).*
