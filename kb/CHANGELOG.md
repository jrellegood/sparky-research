# Knowledge Base Changelog

## 2026-03-30 - Planning, Orchestration Frameworks, Production Reliability

**Major Update:** Comprehensive expansion of orchestration patterns plus new production engineering chapter.

### Updated: Orchestration Patterns Chapter

**Added: Planning & Task Decomposition (substantial expansion)**
- Why planning matters: global constraints, reduced redundancy, recovery scaffolding
- ReAct vs Planning: reactive (one step ahead) vs anticipatory (many steps ahead)
- Five task decomposition strategies: Chain-of-Thought, Least-to-Most, Divide-and-Conquer, Goal Decomposition, Plan-Sketch Refinement
- Hierarchical decomposition: breaking complex goals into progressively simpler subgoals
- Sequential vs parallel decomposition: identifying data dependencies for parallelism
- Five planning architectures with trade-offs:
  - **Plan-and-Execute:** Simple serial execution (brittle, no adaptation)
  - **ReWOO:** Explicit dependency DAG with parallel execution
  - **Tree-of-Thought:** Search over reasoning paths (expensive but robust)
  - **PlanReAct:** Most common production pattern—initial plan + ReAct execution with revision
  - **Graph-based:** LangGraph-style state machines with explicit control flow
- Plan execution challenges: context management, three types of tool failures, semantic failures
- Plan revision & recovery: three triggers (execution failure, observation surprise, goal clarification) and three strategies (local repair, suffix replanning, full replanning)
- Reflexion pattern: self-critique before replanning to avoid repeating mistakes
- When NOT to plan: single-step tasks, dynamic environments, exploratory work, tight cost constraints

**Added: Orchestration Frameworks Comparison**
- Three viable approaches crystallized by March 2026: LangGraph, Temporal, Custom
- **LangGraph (graph-based state machines):**
  - State schema with reducers, nodes/edges, checkpointing for durability
  - Human-in-the-loop via interrupt() pattern
  - Best for: complex branching, approval workflows, <10 steps, Python-only teams
  - Trade-offs: Python-only, state management overhead (50-100ms/step), learning curve
- **Temporal (durable workflow engine):**
  - Durable functions that survive crashes/deploys/restarts
  - Workflows (long-running) + Activities (individual work units) + built-in retry/timeout policies
  - Best for: long-running (hours/days), mission-critical tasks, multi-service orchestration
  - Trade-offs: infrastructure complexity (Temporal cluster), 50-100ms/activity overhead, deterministic code constraints
- **Custom orchestrators (roll your own):**
  - Direct async/await with explicit state management (~200 lines)
  - Dependency-aware parallel execution via DAG
  - Best for: simple workflows (<10 steps), performance-critical, full control
  - Trade-offs: no persistence/observability by default, more code, harder debugging
- **Decision matrix:** When to use each based on workflow duration, branching complexity, human-in-loop needs, durability requirements, performance constraints
- **Hybrid production patterns:**
  - Temporal top-level + LangGraph for AI logic (combines durability + AI-friendly branching)
  - LangGraph with selective checkpointing (reduce overhead from 100ms to 10ms)
  - Custom for real-time + Temporal for batch jobs
- **Common mistake:** Picking LangGraph for popularity not fit—most workflows <5 steps don't need graph orchestration
- **Gartner prediction reality check:** 40% enterprise adoption by 2026, but 40% will fail by 2027 due to unreliable execution (architecture beats tooling)

**Sources:**
- "Planning & Task Decomposition" (Sparky Research, 2026-03-23)
- "LangGraph vs Temporal vs Custom Orchestrators" (Sparky Research, 2026-03-30)
- "Google's 421-Page Agentic Design Patterns" (Antonio Gulli, 2026-03-24)

### NEW Chapter: Production Reliability & Guardrails (3-production/)

**The Reliability Gap**
- Demo 80% success vs production 20% failure unacceptable
- Princeton research: reliability improving at 1/2 rate of accuracy (general), 1/7 rate (customer service)
- Production agents are distributed systems problem, not prompt engineering

**Four Dimensions of Reliability**
1. **Consistency:** Same task → same result (Claude Opus 73%, GPT-5.2 68%, Gemini 52%)
2. **Robustness:** Function under non-ideal conditions (15-30% performance drop typical)
3. **Calibration:** Agent accurately signals own certainty (GPT-5.2 78%, Claude 64%, Gemini 25%)
4. **Safety:** Catastrophic failure avoidance (Claude 8%, GPT-5.2 12%, Gemini 75%!)
- Cascading failures: 3 tools at 90%/85%/97% = 74% combined (1 in 4 failures)

**Reliability Patterns with Code Examples**
- **Circuit Breaker:** Stop flooding dying services (3-state: closed → open → half-open)
- **Bulkhead Isolation:** Separate thread pools by risk/cost
- **Cascading Fallbacks:** Primary → secondary → degraded → error with LLM-readable messages
- **Hierarchical Timeouts:** Tool (10s) < Step (60s) < Workflow (300s)

**Guardrails (Defense in Depth)**
Four layers:
1. **Input Filtering:** Prompt injection detection, PII redaction, length limits
2. **Output Filtering:** Hallucination checks, PII redaction, toxicity filtering, unsafe code detection
3. **Cost Controls:** Per-session and per-user budgets with enforcement
4. **Rate Limiting:** Token bucket algorithm for user request throttling

**Observability (Minimum Viable)**
- **Structured Logging:** Every LLM call, every tool call with context
- **Metrics:** Success rate, P50/P95 latency, token efficiency, cost per task, guardrail triggers, fallback rate
- **Distributed Tracing:** OpenTelemetry spans showing execution path with bottleneck identification
- Target metrics: >95% success rate, <2s P50 latency, >60% token efficiency, <$0.10 cost/task

**Production Deployment Checklist**
Comprehensive checklist covering:
- Testing: unit, integration, eval suite, load, chaos
- Reliability: retries, circuit breakers, fallbacks, timeouts, external state
- Guardrails: input/output validation, cost controls, rate limiting
- Observability: logging, metrics, tracing, alerting
- Security: auth, authz, audit logs, secrets management, sandboxing
- Deployment: canary rollouts, rollback plans, feature flags, versioned configs

**Key insight:** Reliability is architecture, not intelligence. Teams obsessing over prompts while ignoring retry policies ship fragile systems.

**Sources:**
- "Towards a Science of AI Agent Reliability" (Princeton, Kapoor/Narayanan et al., 2026)
- "AI Agents in Production: The Reliability Gap" (Sparky Research, 2026-03-27)
- "Google's 421-Page Agentic Design Patterns" (Antonio Gulli, 2026-03-24)
- "Graceful Degradation & Fallback Patterns" (Sparky Research, 2026-03-15)

### Updated: Memory Systems Chapter

**Added: Three-Axis Framework (December 2025 taxonomy)**
- New taxonomy from 107-page NUS/Oxford/Peking survey replaces outdated short-term/long-term split
- **Forms axis** (where memory lives): Token-level (external storage), Latent (internal representations), Parametric (model weights)
- Token-level topology spectrum: flat → planar → hierarchical (start flat, add structure only when needed)
- **Functions axis** (why memory matters): Factual (declarative knowledge), Experiential (learning from outcomes), Working (active processing)
- Experiential memory is biggest gap: most agents don't learn from successes/failures
- **Dynamics axis** (how memory operates): Formation (creating), Evolution (updating), Retrieval (accessing)

**Added: Advanced Retrieval Patterns**
- **HyDE (Hypothetical Document Embeddings):** Generate fabricated answer first, embed it, use for retrieval (counterintuitive but effective)
- **Hybrid retrieval wins:** BM25 + semantic + graph consistently beats any single method
- **Conflict detection at write time:** 0.6-0.9 cosine similarity = potential conflicts worth surfacing
- **Multi-tenancy:** Storage-level isolation (separate collections) > application-level filtering

**Updated: Empirical Benchmarks**
- Memori Labs results: 81.95% accuracy at 4.98% token cost (structured memory)
- Raw retrieval baseline: 69.29% accuracy at 100% token cost
- Key insight: 1,294 tokens structured > 26K tokens raw (20x compression with quality gain)
- Performance by reasoning type: single-hop 88%, multi-hop 79%, temporal 78% (structured)

**Key takeaway:** Retrieval quality bounded by formation/evolution quality—invest in what you store as much as retrieval sophistication.

**Sources:**
- "Memory in the Age of AI Agents" (arXiv 2512.13564, 107 pages, Dec 2025)
- "Three-Axis Memory Framework" (Sparky Research, 2026-03-28)
- Steve Kinney synthesis article (2026-03)

---

## 2026-03-22 - Orchestration & Design Patterns Chapter

**Added:**
- **NEW Chapter: Orchestration and Design Patterns** (2-agent-architecture/orchestration-patterns.md)
  - Comprehensive coverage of agent architecture patterns (established + emerging)
  - LLM-as-CPU analogy: LLMs = CPUs, Agents = Processes, Orchestration = OS
  - Minimal agent loop breakdown (LLM + loop + tools + termination)
  - Established patterns: ReAct, Reflection, Planning (with cost/benefit analysis)
  - Emerging patterns: Dry-Run Harness, Blackboard Architecture, Meta-Controller, Reflexive Agent
  - Multi-model routing strategies (static, semantic, LLM-assisted, hybrid, performance-based)
  - DAG-based orchestration (LangGraph pattern)
  - Production best practices: external state, zero-trust execution, observability, termination logic
  - Failure modes: infinite loops, tool call explosions, state corruption, cost runaway, context overflow
  - Decision framework: which pattern for which scenario

**Synthesis from this week's research:**
- Mar 18: LLMs as CPUs, Agents as Processes → Core architecture metaphor
- Mar 21: Four Emerging Patterns → Dry-Run, Blackboard, Meta-Controller, Reflexive
- Mar 22: Multi-Model Routing → Architecture over intelligence, routing strategies

**Technical depth:** ~6,300 words covering 7 patterns with implementation examples, cost analysis, production gotchas, and decision matrices

**Impact:** KB now provides comprehensive agent design pattern reference from minimal loops to complex multi-agent orchestration

---

## 2026-03-20 - Multi-Agent Memory Expansion

**Updated:**
- **Chapter: Agent Memory Systems** (2-agent-architecture/memory-systems.md)
  - Added multi-agent memory architecture section
  - Shared vs. distributed memory paradigms
  - Memory consistency models (sequential, eventual, causal)
  - Cache coherence patterns for agents
  - Practical implementation: versioned memory, optimistic concurrency, CRDTs
  - Empirical cost/accuracy tradeoffs (Memori Labs benchmark)
  - "Context rot" problem and structured memory solutions

**Key additions:**
- Computer architecture analogies (SMP, NUMA, cache coherence)
- Concrete code examples for consistency protocols
- Benchmark data: structured memory achieves 81.95% accuracy at 4.98% token cost
- Performance breakdown by reasoning type (single-hop, multi-hop, temporal)

**Sources:**
- Sparky Research: "Multi-Agent Memory as Computer Architecture Problem" (2026-03-19)
- Memori Labs benchmark paper (2026-03-20)

**Impact:** Chapter now covers both single-agent and multi-agent scenarios with empirical validation.

**Update (same day):**
- Added deep dive on Memori Advanced Augmentation pipeline
- Detailed technical architecture: semantic triples + session summaries
- Hybrid retrieval flow with concrete examples
- Information density analysis (why 1,294 tokens beats 26K)
- Performance breakdown by reasoning type with explanations
- Implementation lessons (incremental extraction, deduplication, confidence scoring)
- Comparison to raw retrieval approaches (Mem0, LangMem)

**Technical depth:** Now explains *how* structured memory achieves superior cost/accuracy tradeoffs, not just *that* it does.

---

## 2026-03-14 - Initial Creation

**Added:**
- Knowledge base structure and README
- **Chapter: Agent Memory Systems** (2-agent-architecture/memory-systems.md)
  - Memory corruption risks (semantic drift, knowledge leakage)
  - Structured vs. raw memory approaches
  - Production patterns (hierarchical, sliding window, GraphRAG)
  - Framework comparison (Mem0, LangChain Memory, Letta)
  - Based on 3 fresh sources (arXiv, Microsoft Research, dev.to)

**Structure:**
- 4 top-level domains (Foundations, Agent Architecture, Production, Frameworks)
- Expandable/collapsible structure
- Metadata tracking for freshness

---

*Future updates will track: new chapters, major revisions, deprecated sections, emerging patterns*
