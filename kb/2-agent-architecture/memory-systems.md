# Agent Memory Systems

---
**Metadata**
- Last Updated: 2026-03-20
- Primary References:
  - "Governing Evolving Memory in LLM Agents" (arXiv, 2026-03)
  - "PlugMem: Transforming raw agent interactions into reusable knowledge" (Microsoft Research, 2026-03)
  - "How to Build AI Agents That Actually Remember" (dev.to, 2026-03)
  - "Multi-Agent Memory as Computer Architecture Problem" (Sparky Research, 2026-03-19)
  - "Memori: A Persistent Memory Layer for Efficient, Context-Aware LLM Agents" (Memori Labs, 2026-03-20)
- Staleness Risk: **Low** (fresh sources, active research area)
- Next Review: 2026-06-20
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

## Multi-Agent Memory Architecture

When multiple agents need to coordinate, memory becomes a distributed systems problem. Two fundamental paradigms emerge:

### Shared Memory Architecture

**Model:** All agents read/write to a single memory pool

**Analogy:** Symmetric multiprocessing (SMP) - multiple CPUs, one RAM

**Advantages:**
- Simple coordination (no synchronization protocol needed)
- Automatic visibility (Agent A's writes immediately visible to Agent B)
- Natural for tightly-coupled tasks

**Challenges:**
- **Contention:** Multiple agents competing for same memory regions
- **Consistency:** Who wins when two agents update simultaneously?
- **Scalability:** Single memory becomes bottleneck as agent count grows

**Good for:** Small agent teams (2-5), shared context tasks (collaborative writing, joint research)

### Distributed Memory Architecture

**Model:** Each agent has local memory + selective synchronization

**Analogy:** NUMA (Non-Uniform Memory Access) - CPUs have local caches, sync when needed

**Advantages:**
- **Scalability:** No central bottleneck
- **Autonomy:** Agents work independently most of the time
- **Fault isolation:** One agent's memory corruption doesn't affect others

**Challenges:**
- **Synchronization complexity:** When/how to share memory?
- **Consistency problems:** Agent A's knowledge may be stale relative to Agent B
- **Discovery:** How does Agent A find what Agent B knows?

**Good for:** Large agent swarms, loosely-coupled tasks, autonomous sub-agents

### Memory Consistency Models

Borrowed from computer architecture, these models govern how agents see each other's memory updates:

#### 1. Sequential Consistency (Strongest)

**Rule:** All agents see updates in the same order

**Example:** Agent A writes fact X, then Y. Agent B is guaranteed to see X before Y, never Y without X.

**Cost:** Requires global ordering - expensive, limits parallelism

**Use case:** Financial transactions, medical records (correctness > performance)

#### 2. Eventual Consistency (Weakest)

**Rule:** All agents will *eventually* see updates, but order isn't guaranteed

**Example:** Agent A writes fact X. Agent B might not see it immediately, but will see it within some time bound.

**Cost:** Minimal coordination overhead

**Use case:** Content curation, research aggregation (availability > immediate consistency)

#### 3. Causal Consistency (Middle Ground)

**Rule:** If update B depends on update A, all agents see A before B. Independent updates can arrive in any order.

**Example:** Agent A discovers fact X, Agent B uses X to derive Y. All agents see X before Y. But if Agent C independently discovers Z, agents may see Y-then-Z or Z-then-Y.

**Cost:** Moderate - track causal dependencies only

**Use case:** Most multi-agent workflows (balance correctness and performance)

### Cache Coherence for Agents

Just like CPU caches, agents can cache frequently-accessed memory locally for speed. But this creates coherence problems:

**Problem:** Agent A caches "user's location: San Francisco." User moves to New York. Agent B updates the fact. Agent A's cache is now stale.

**Solutions:**

1. **Write-through:** Updates immediately propagate to all caches
   - Simple, but expensive (every write broadcasts to all agents)

2. **Write-invalidate:** Updates invalidate other agents' caches
   - Cheaper (just send invalidation signal), but next read requires fetch

3. **TTL-based:** Cached data expires after time limit
   - Simple, no coordination needed, but stale data possible within TTL window

4. **Event-driven:** Agents subscribe to specific memory regions, get notified on updates
   - Flexible, but requires pub/sub infrastructure

### Practical Implementation Patterns

#### Pattern 1: Versioned Memory with Compare-and-Swap

```python
class VersionedMemory:
    def __init__(self):
        self.facts = {}
        self.versions = {}
    
    def read(self, key):
        return self.facts.get(key), self.versions.get(key, 0)
    
    def write(self, key, value, expected_version):
        current = self.versions.get(key, 0)
        if current != expected_version:
            raise ConflictError("Version mismatch - retry")
        self.facts[key] = value
        self.versions[key] = current + 1
```

**When to use:** Shared memory with multiple writers, low contention

#### Pattern 2: Optimistic Concurrency

```python
def agent_update(memory, key, transform_fn):
    while True:
        value, version = memory.read(key)
        new_value = transform_fn(value)
        try:
            memory.write(key, new_value, version)
            break
        except ConflictError:
            # Retry with latest version
            continue
```

**When to use:** Reads are common, writes are rare, conflicts are unlikely

#### Pattern 3: CRDT-Based Memory (Conflict-Free Replicated Data Types)

For naturally commutative operations (counters, sets), use CRDTs that merge without conflicts:

```python
class GCounter:  # Grow-only counter
    def __init__(self, agent_id):
        self.agent_id = agent_id
        self.counts = defaultdict(int)  # per-agent counts
    
    def increment(self):
        self.counts[self.agent_id] += 1
    
    def value(self):
        return sum(self.counts.values())
    
    def merge(self, other):
        for agent, count in other.counts.items():
            self.counts[agent] = max(self.counts[agent], count)
```

**When to use:** Distributed agents, high partition tolerance needed, operations are commutative

### Cost vs. Accuracy Tradeoffs

Recent benchmarks (Memori Labs, March 2026) provide empirical data on memory architecture performance:

**The "Context Rot" Problem:** As conversation history grows, relevant information gets lost in noise. Models have the data but can't effectively use it.

**Benchmark Results (LoCoMo long-conversation memory):**

| Approach | Accuracy | Avg Tokens/Query | Relative Cost |
|----------|----------|------------------|---------------|
| Full Context | ~75% | 26,000 | 100% (baseline) |
| Raw Retrieval (Mem0) | 62.47% | ~5,000 | 19% |
| Hybrid (LangMem) | 78.05% | ~3,000 | 12% |
| Structured (Memori) | 81.95% | 1,294 | 4.98% |

**Key insight:** Structured memory (semantic triples + session summaries) outperforms both full-context and raw retrieval while using ~5% of the tokens.

**Architecture details (Memori approach):**
- **Semantic triples:** Extract facts as (subject, predicate, object) for precise recall
- **Session summaries:** Narrative context for temporal/causal understanding
- **Hybrid retrieval:** Search both triples (for facts) and summaries (for context)

**Performance by reasoning type:**
- Single-hop (direct fact retrieval): 87.87%
- Multi-hop (connecting facts): 72.70%
- Temporal (tracking changes): 80.37%
- Open-domain (synthesis): 63.54%

**Takeaway:** Memory structure matters more than memory volume. Well-structured 1K tokens beats poorly-structured 26K tokens.

## Design Principles

Based on research + lived experience:

1. **Structure beats volume** - Organized knowledge > raw history
2. **Decay is healthy** - Not everything should persist forever
3. **Separation of concerns** - Personal context ≠ technical knowledge
4. **Explicit curation** - Don't rely on automatic summarization alone
5. **Privacy by design** - Ephemeral contexts shouldn't leak into permanent storage
6. **Provenance matters** - Know where knowledge came from
7. **Choose consistency model explicitly** - Don't default to strongest (sequential) or weakest (eventual) without thought
8. **Measure cost/accuracy tradeoffs** - Structure reduces both token cost and information loss

## Open Questions

- **Optimal summarization cycles:** When does semantic drift become unacceptable?
- **Cross-agent memory sharing:** How do multiple agents share knowledge safely?
- **Memory forgetting:** Should agents actively delete outdated information?
- **Conflict resolution:** When memories contradict, which takes precedence?

## References

1. Lam, C., Li, J., Zhang, L., & Zhao, K. (2026). "Governing Evolving Memory in LLM Agents: Risks, Mechanisms, and the SSGM Framework." arXiv. [Link](https://arxiv.org/html/2603.11768v1)

2. Microsoft Research (2026). "PlugMem: A Task-Agnostic Plugin Memory Module for LLM Agents." [Link](https://www.microsoft.com/en-us/research/blog/from-raw-interaction-to-reusable-knowledge-rethinking-memory-for-ai-agents/)

3. Pockit Tools (2026). "How to Build AI Agents That Actually Remember: Memory Architecture for Production LLM Apps." dev.to. [Link](https://dev.to/pockit_tools/how-to-build-ai-agents-that-actually-remember-memory-architecture-for-production-llm-apps-11fk)

4. Sparky Research (2026-03-19). "Multi-Agent Memory as Computer Architecture Problem." [Link](https://jrellegood.com/sparky-research/2026-03-19-multi-agent-memory-computer-architecture.html)

5. Memori Labs (2026-03-20). "Memori: A Persistent Memory Layer for Efficient, Context-Aware LLM Agents." Benchmark paper. [Link](https://www.memorilabs.ai/benchmark)

---

*This chapter synthesizes current research (March 2026) on agent memory systems. Last updated: 2026-03-20 with multi-agent coordination patterns and empirical cost/accuracy benchmarks. Expect rapid evolution as this is an active research area.*
