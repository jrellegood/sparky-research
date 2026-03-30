# Agent Memory Systems

---
**Metadata**
- Last Updated: 2026-03-30
- Primary References:
  - "Memory in the Age of AI Agents" (arXiv 2512.13564, Hu et al., 107 pages, Dec 2025)
  - "Governing Evolving Memory in LLM Agents" (arXiv, 2026-03)
  - "PlugMem: Transforming raw agent interactions into reusable knowledge" (Microsoft Research, 2026-03)
  - "Memori: A Persistent Memory Layer for Efficient, Context-Aware LLM Agents" (Memori Labs, 2026-03-20)
  - Steve Kinney synthesis article (stevekinney.com, 2026-03)
- Staleness Risk: **Low** (updated with latest 2026 taxonomy and research)
- Next Review: 2026-06-30
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

## The Three-Axis Framework

The old "short-term vs long-term memory" taxonomy—borrowed from human cognitive science—doesn't capture what production agent memory systems actually do. A sliding context window isn't "short-term memory." A vector database full of past conversations isn't "long-term memory."

In December 2025, a 107-page survey from NUS, Oxford, and Peking University introduced a new taxonomy with three orthogonal axes:

### Forms: Where Memory Lives

**Token-level** (external storage): Text chunks, facts, profiles stored in databases/files. Works with any model including hosted APIs. This is what you'll build if using Claude/GPT-4/Gemini.

- **Flat (1D):** Vector store with semantic search - simplest, start here
- **Planar (2D):** Graphs/trees with explicit relationships - enables multi-hop reasoning
- **Hierarchical (3D):** Multi-layer abstractions (raw → summaries → global concepts)

**Latent** (internal representations): KV cache manipulation, hidden state compression. Requires model internals access (PyTorch/HuggingFace). Not available for hosted APIs.

**Parametric** (model weights): Fine-tuning, LoRA adapters, knowledge editing. Permanent changes across all conversations. Requires weight access.

**Practical constraint:** If you're using hosted frontier models through APIs, your entire design space is token-level. Master the topology spectrum and dynamics—that's where the leverage is.

### Functions: Why Memory Matters

**Factual memory** (declarative knowledge): "User prefers TypeScript," "Project uses Tailwind." Table stakes - what most frameworks implement.

**Experiential memory** (learning from outcomes): Capturing successes/failures to improve over time. The biggest gap in current systems.

- **Case-based:** Store individual examples
- **Strategy-based:** Extract patterns from multiple cases
- **Skill-based:** Compile strategies into reusable procedures
- **Hybrid:** All three with dynamic routing

**Working memory** (active processing): What agent is currently reasoning about. Three strategies:

- **State consolidation:** Compress conversation history periodically
- **Hierarchical folding:** Layer summaries at different detail levels
- **Cognitive planning:** Externalize plan as core context, not raw history

### Dynamics: How Memory Operates

**Formation** (creating memory):
- Semantic summarization (GPT-3.5 summaries)
- Knowledge distillation (extract facts/skills)
- Structured construction (entities + relationships)
- Hybrid (MemoryBank ACE pattern: Generator → Reflector → Curator)
- Parametric (fine-tuning as memory)

**Evolution** (updating memory):
- Consolidation (merge related memories)
- Updating (correct/extend existing)
- Forgetting (decay, pruning, importance scoring)

**Retrieval** (accessing memory):
1. **Timing:** When to retrieve (every turn vs periodic vs on-demand)
2. **Query construction:** User question → semantic query (HyDE: generate hypothetical answer first, then search for it)
3. **Strategy:** BM25 (keyword), vector (semantic), graph (relationships), hybrid (combine all three)
4. **Post-processing:** Rerank, filter, deduplicate

**Key insight from StructMemEval:** Simple flat retrieval can outperform complex memory hierarchies on standard benchmarks. Start flat, add structure only when you observe specific retrieval failures.

## Memory Corruption Risks

As memory systems transition from static retrieval to dynamic evolution, new risks emerge:

### Semantic Drift
Knowledge degrades through iterative summarization. Each consolidation cycle introduces subtle meaning shifts that accumulate.

**Example:** "User prefers minimal explanations" → "User wants terse responses" → "User dislikes verbosity" → "User is impatient"

### Knowledge Leakage
Sensitive contexts solidify into long-term storage. What was ephemeral (private conversation, temporary credentials) gets permanently encoded.

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

## Hybrid Retrieval: Why Single Methods Fail

**BM25 alone** (keyword search): Misses semantic similarity. "car" won't match "automobile."

**Vector search alone** (semantic): Misses exact matches. "order #12345" gets fuzzy results when you need that specific order.

**Graph traversal alone**: Requires entities/relationships to already exist. New information not in the graph is invisible.

**Hybrid approach** (BM25 + semantic + graph):
1. BM25 for exact matches and entity IDs
2. Vector search for semantic similarity
3. Graph traversal for multi-hop reasoning
4. Reciprocal Rank Fusion (RRF) to merge results
5. Rerank by relevance
6. Apply aggressive filtering (top-3 relevant > top-10 marginal)

**Empirical result:** Hybrid consistently beats any single method. The question isn't "which one?" but "how to combine them?"

## HyDE: Hypothetical Document Embeddings

Counterintuitive but effective retrieval pattern:

1. User asks question
2. **Generate fabricated answer** (don't care if it's correct)
3. Embed the fabricated answer
4. Use that embedding to search memory
5. Return actual stored content

**Why this works:** Answer-shaped queries are semantically closer to stored answers than question-shaped queries. "What is the capital of France?" is far from stored "Paris is the capital of France." But a fabricated "The capital of France is [something]" is close.

## Conflict Detection at Write Time

When storing new memory, check for contradictions with existing memory:

**Cosine similarity thresholds:**
- `< 0.6`: Unrelated, no conflict
- `0.6 - 0.9`: Potential conflict, worth surfacing
- `> 0.9`: Likely duplicate, merge or deduplicate

**Write-time validation:**
```python
new_fact = "User prefers Python"
existing = vector_search(embed(new_fact), threshold=0.6)

for fact in existing:
    similarity = cosine(embed(new_fact), embed(fact))
    if 0.6 <= similarity <= 0.9:
        # Potential conflict - ask LLM to judge
        is_conflict = llm.judge_conflict(new_fact, fact)
        if is_conflict:
            # Surface to user or merge intelligently
            pass
```

**Why write-time:** Catching conflicts at write time prevents corrupted memory from ever entering the system. Read-time detection is too late—you've already stored bad data.

## Multi-Tenancy: Storage-Level Isolation

**Wrong:** Application-level filtering with shared collections

```python
# BAD - leak waiting to happen
results = vector_search(query, filter={"user_id": current_user})
```

**Right:** Storage-level isolation with separate collections per tenant

```python
# GOOD - physical separation
collection = get_user_collection(current_user)
results = vector_search(collection, query)
```

Security boundary should be at the infrastructure layer, not the application layer. One bad filter clause shouldn't expose another user's memories.

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
   - More efficient (invalidation cheaper than data transfer)
   - Agent A's next read will fetch fresh data

3. **Versioned memory:** Each fact has a version number
   - Agents track version numbers, detect staleness
   - Can implement optimistic concurrency (retry on version mismatch)

4. **CRDTs (Conflict-Free Replicated Data Types):** Mathematical structures that guarantee eventual consistency
   - Each agent can update independently
   - Merges always converge to same result
   - Good for counters, sets, but complex for general knowledge

**Practical pattern:** Start with write-through for correctness, optimize to write-invalidate when performance matters, use CRDTs for specific data types (counters, flags).

### Empirical Cost/Accuracy Tradeoffs

**Memori Labs benchmark** (tested on LoCoMo, LongMemEval, ArcNLU):

| Approach | Accuracy | Token Cost | Notes |
|----------|----------|------------|-------|
| Raw Retrieval | 69.29% | 100% | Baseline: retrieve raw chunks |
| LangMem (entity extraction) | 73.56% | 27.94% | Better than raw, lower cost |
| Mem0 (summarization) | 71.45% | 18.37% | Cheapest, but loses detail |
| Memori Advanced | **81.95%** | **4.98%** | Structured memory: semantic triples + session summaries |

**Why structured memory wins:**
- 26,000 tokens of raw conversation → 1,294 tokens of structured memory (20x compression)
- Semantic triples capture entity relationships precisely
- Session summaries preserve narrative flow
- Information density matters more than raw volume

**Performance breakdown by reasoning type:**
- Single-hop factual recall: 88% (structured), 72% (raw)
- Multi-hop reasoning: 79% (structured), 64% (raw)
- Temporal reasoning: 78% (structured), 71% (raw)

The key insight: retrieval quality is bounded by formation and evolution quality. Investing in what you store matters as much as retrieval sophistication.

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

## Key Takeaways

1. **Forms constrain possibilities:** Token-level is your only option with hosted APIs. Master it.

2. **Functions define value:** Factual memory is table stakes. Experiential memory (learning from outcomes) is where differentiation lives.

3. **Dynamics drive quality:** Retrieval quality is bounded by formation and evolution. Invest in what you store.

4. **Start simple:** Flat vector search beats complex hierarchies until you prove otherwise with real failure cases.

5. **Hybrid retrieval wins:** BM25 + semantic + graph, combined via RRF, consistently outperforms any single method.

6. **Multi-agent = distributed systems:** Apply consistency models (sequential/eventual/causal) and cache coherence patterns from computer architecture.

7. **Structured > volume:** 1,294 tokens of structured memory beats 26K tokens of raw retrieval (Memori benchmark).

Memory isn't a feature you bolt on—it's the foundational primitive that turns a stateless LLM into something that improves over time.

## Further Reading

- [Memory in the Age of AI Agents](https://arxiv.org/abs/2512.13564) (107-page survey, Dec 2025)
- [Steve Kinney's synthesis article](https://stevekinney.com/writing/agent-memory-systems) (comprehensive practitioner's guide)
- [Memori Labs paper](https://arxiv.org/abs/[placeholder]) (empirical cost/accuracy benchmarks)
- [PlugMem (Microsoft Research)](https://arxiv.org/abs/[placeholder]) (structured knowledge extraction)
- Sparky Research: [Episodic vs Semantic Memory](../../2026-03-14-episodic-semantic-memory-agents.md)
- Sparky Research: [Three-Axis Memory Framework](../../2026-03-28-three-axis-memory-framework-forms-functions-dynamics.md)
- Sparky Research: [Multi-Agent Memory as Computer Architecture](../../2026-03-19-multi-agent-memory-computer-architecture.md)
