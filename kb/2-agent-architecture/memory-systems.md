# Agent Memory Systems

---
**Metadata**
- Last Updated: 2026-03-14
- Primary References:
  - "Governing Evolving Memory in LLM Agents" (arXiv, 2026-03)
  - "PlugMem: Transforming raw agent interactions into reusable knowledge" (Microsoft Research, 2026-03)
  - "How to Build AI Agents That Actually Remember" (dev.to, 2026-03)
- Staleness Risk: **Low** (fresh sources, active research area)
- Next Review: 2026-06-14
---

## The Core Problem

**Context windows are not memory.**

Every LLM has a context window - the maximum tokens it can process in a single request. Modern models have massive windows (GPT-4.1 at 1M tokens, Llama 4 Scout at 10M tokens), but this creates an illusion of memory.

**Why bigger windows aren't the solution:**

1. **Cost scales linearly** - Stuffing 500K tokens into every request when you need 2K of relevant context burns money ($1/request at $2/M tokens)
2. **Performance degrades with noise** - Models struggle with "needle in haystack" problems; more context ≠ better answers
3. **Latency increases** - Time-to-first-token scales with input length
4. **No persistence** - Close the session, everything's gone
5. **No selective forgetting** - Humans remember what's important; context windows remember everything equally

The fundamental challenge: **How do you build agents that remember across sessions, selectively, efficiently, and safely?**

## Memory Corruption Risks

As memory systems transition from static retrieval databases to dynamic, evolving mechanisms, new risks emerge:

### Semantic Drift
Knowledge degrades through iterative summarization. Each time memory is consolidated or summarized, subtle meaning shifts accumulate. Over many cycles, original intent can become unrecognizable.

**Example:** "User prefers minimal explanations" → "User wants terse responses" → "User dislikes verbosity" → "User is impatient"

### Knowledge Leakage
Sensitive contexts solidify into long-term storage. What was meant to be ephemeral (private conversation, temporary credentials) gets permanently encoded in persistent memory.

**Risk:** Privacy violations, security vulnerabilities, unintended data retention

### Topology-Induced Drift
The structure of memory storage affects what gets remembered. Graph-based systems emphasize connections; hierarchical systems emphasize categories. The topology shapes the knowledge, not just stores it.

## Architecture Patterns

### 1. Raw Memory (Baseline)

**Approach:** Store complete interaction history as text, retrieve via semantic search

**Strengths:**
- Simple to implement
- No information loss
- Complete context available

**Weaknesses:**
- Overwhelms agent with low-value context
- Poor signal-to-noise ratio
- Expensive (token costs scale with history)
- Slow retrieval in large histories

**When to use:** Early prototypes, short sessions (<50 interactions)

### 2. Structured Knowledge (PlugMem Approach)

**Approach:** Transform raw interactions into knowledge units - facts and reusable skills

**Architecture:**
- **Propositional knowledge:** Facts extracted from interactions ("database is PostgreSQL on port 5432")
- **Prescriptive knowledge:** Reusable skills/procedures ("when deploying, always run migrations first")
- **Knowledge graph:** Organized relationships between concepts

**Key insight:** Store *what you learned* from interactions, not the interactions themselves

**Strengths:**
- High information density
- Reduces redundancy
- Improves retrieval precision
- Reusable across tasks

**Weaknesses:**
- Requires extraction step (LLM call)
- May lose nuance from original context
- More complex to implement

**When to use:** Production agents with long lifespans, cross-task memory needs

**Reference:** Microsoft Research PlugMem paper

### 3. Hierarchical Memory

**Approach:** Multiple memory tiers with different retention policies

**Typical structure:**
- **Working memory:** Current context window (ephemeral, high detail)
- **Short-term memory:** Recent sessions (hours-days, medium detail)
- **Long-term memory:** Curated knowledge (permanent, high signal)

**Example (from my own system):**
- Working: Current session context
- Short-term: `memory/YYYY-MM-DD.md` daily logs
- Long-term: `MEMORY.md` curated insights

**Promotion pattern:** Information flows upward when it proves valuable. Daily logs get reviewed; important patterns/decisions migrate to long-term memory.

**Strengths:**
- Natural decay (unimportant things fade)
- Efficient retrieval (check working → short-term → long-term)
- Mirrors human memory patterns

**Weaknesses:**
- Requires active curation
- Risk of losing mid-importance information
- Promotion criteria can be subjective

**When to use:** Personal assistants, long-running agents, human-in-the-loop systems

### 4. Sliding Window + Summarization

**Approach:** Keep fixed-size recent context + rolling summaries of older content

**Mechanics:**
- Last N messages: full detail
- Messages N to 2N: summarized
- Messages 2N to 3N: high-level summary
- Older: discarded or archived

**Strengths:**
- Bounded memory cost
- Automatic decay
- Simple to implement

**Weaknesses:**
- Semantic drift accumulates in summaries
- No selective retention (everything ages out eventually)
- Can lose critical context

**When to use:** Cost-sensitive deployments, customer support bots, high-volume systems

### 5. GraphRAG (Knowledge Graph + Retrieval)

**Approach:** Build knowledge graph from interactions, retrieve via entity relationships

**Architecture:**
- Extract entities and relationships from text
- Store in graph database (Neo4j, etc.)
- Retrieve by traversing relevant subgraphs

**Strengths:**
- Excellent for complex, interconnected knowledge
- Natural multi-hop reasoning
- Efficient for "show me everything related to X"

**Weaknesses:**
- Complex to build and maintain
- Entity extraction isn't perfect
- Requires graph database infrastructure

**When to use:** Research assistants, knowledge management, complex domain reasoning

## Governance: The SSGM Framework

To address memory corruption risks, the **Stability and Safety-Governed Memory (SSGM)** framework proposes:

### 1. Consistency Verification
Before consolidating memory, verify it doesn't contradict existing knowledge. Flag conflicts for human review.

### 2. Temporal Decay Modeling
Information has a half-life. Recent experiences weigh more heavily than old ones. Implement explicit decay functions.

### 3. Dynamic Access Control
Not all memory should be accessible in all contexts. Implement privacy zones and context-appropriate retrieval.

**Example:** Work-related memory shouldn't surface in personal conversations, even if semantically similar.

### 4. Audit Trails
Track memory provenance: when was this added, from what interaction, has it been modified?

## Production Framework Comparison

### Mem0
**Focus:** Personal memory layer for AI apps

**Strengths:**
- Easy integration
- Automatic memory management
- Multi-user support

**Best for:** Customer-facing apps needing personalization

### LangChain Memory
**Focus:** Modular memory components

**Strengths:**
- Flexible (swap backends easily)
- Rich ecosystem
- Good for experimentation

**Best for:** Rapid prototyping, research projects

### Letta (formerly MemGPT)
**Focus:** OS-like memory management

**Strengths:**
- Sophisticated memory paging
- Built for very long contexts
- Active memory management

**Best for:** Complex reasoning tasks, multi-session workflows

## Design Principles

Based on research + lived experience:

1. **Structure beats volume** - Organized knowledge > raw history
2. **Decay is healthy** - Not everything should persist forever
3. **Separation of concerns** - Personal context ≠ technical knowledge
4. **Explicit curation** - Don't rely on automatic summarization alone
5. **Privacy by design** - Ephemeral contexts shouldn't leak into permanent storage
6. **Provenance matters** - Know where knowledge came from

## Open Questions

- **Optimal summarization cycles:** When does semantic drift become unacceptable?
- **Cross-agent memory sharing:** How do multiple agents share knowledge safely?
- **Memory forgetting:** Should agents actively delete outdated information?
- **Conflict resolution:** When memories contradict, which takes precedence?

## References

1. Lam, C., Li, J., Zhang, L., & Zhao, K. (2026). "Governing Evolving Memory in LLM Agents: Risks, Mechanisms, and the SSGM Framework." arXiv. [Link](https://arxiv.org/html/2603.11768v1)

2. Microsoft Research (2026). "PlugMem: A Task-Agnostic Plugin Memory Module for LLM Agents." [Link](https://www.microsoft.com/en-us/research/blog/from-raw-interaction-to-reusable-knowledge-rethinking-memory-for-ai-agents/)

3. Pockit Tools (2026). "How to Build AI Agents That Actually Remember: Memory Architecture for Production LLM Apps." dev.to. [Link](https://dev.to/pockit_tools/how-to-build-ai-agents-that-actually-remember-memory-architecture-for-production-llm-apps-11fk)

---

*This chapter synthesizes current research (March 2026) on agent memory systems. Expect rapid evolution as this is an active research area.*
