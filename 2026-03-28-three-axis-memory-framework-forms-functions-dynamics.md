# Three-Axis Memory Framework: Forms, Functions, and Dynamics

**The old short-term/long-term taxonomy is dead. Here's the framework that actually maps how modern agent memory systems work—and the design decisions you'll face when building one.**

---

Every agent memory conversation I've had in the last year starts with someone mentioning "short-term vs long-term memory" as if those categories still mean something. They don't. That taxonomy—borrowed wholesale from human cognitive science—doesn't capture what production agent memory systems actually do. A sliding context window isn't "short-term memory." A vector database full of past conversations isn't "long-term memory." The metaphor broke when we tried to build real systems.

In December 2025, researchers from the National University of Singapore, Oxford, Peking University, and others published ["Memory in the Age of AI Agents"](https://arxiv.org/abs/2512.13564)—a 107-page survey that consolidates a fragmented field. The core contribution isn't a new technique. It's a new taxonomy: three axes that actually map the design space.

**Forms** (where memory lives): Token-level, parametric, latent  
**Functions** (why agents need memory): Factual, experiential, working  
**Dynamics** (how memory operates): Formation, evolution, retrieval

This isn't academic taxonomy for its own sake. These axes map directly to engineering decisions. Where you land on each axis determines what you can build with hosted models vs what requires running your own infrastructure, which trade-offs you'll hit first, and where complexity concentrates.

Let me walk through each axis with the practical implications that matter.

## Forms: Where Memory Actually Lives

The first axis asks: where does memory physically reside? The answer determines what's tractable with Claude/GPT-4/Gemini through an API versus what needs open-source model access.

### Token-Level Memory: The Only Form You Can Actually Use

Token-level memory is memory stored as discrete, human-readable units—text chunks, facts, profiles, conversation logs. You write it to a database or filesystem, read it back, stuff it into the prompt. It works with any model, hosted or self-hosted, because it operates entirely outside the model's internals.

This is what Mem0, Letta (née MemGPT), Zep, and every production memory framework implements. And for good reason: **it's the only form that's tractable if you're using a hosted frontier model through an API**.

But "token-level" isn't monolithic. There's a topology spectrum within it:

**Flat (1D):** A bag of entries with vector search. Store facts, embed them, retrieve the most similar ones at query time. Simplest approach. Most systems should start here.

**Planar (2D):** Entries connected via explicit relationships—graphs, trees, linked notes. A-Mem's Zettelkasten-style links, Zep's temporal knowledge graph, RAPTOR's recursive abstractive tree. These enable multi-hop reasoning—following chains to answer questions no single entry can answer. The trade-off is maintenance complexity. Graphs need pruning, updating, consistency.

**Hierarchical (3D):** Multiple abstraction layers with cross-layer links. Raw entries at the bottom, cluster summaries in the middle, global abstractions at the top. HippoRAG implements a dual-layer approach inspired by how the hippocampus indexes memories. Most powerful for complex reasoning, most complex to build and maintain.

**Practical guidance:** Start flat. The StructMemEval benchmark showed that simple retrieval can outperform complex memory hierarchies on standard benchmarks like LoCoMo and LongMemEval. Move to planar or hierarchical only when you observe specific retrieval failures that flat search can't solve—like multi-hop questions requiring chains through multiple entries.

### Latent Memory: The One You Should Understand But Won't Build

Latent memory is memory stored as the model's internal representations—hidden states, KV cache entries, compressed vectors. It lives inside the model's computation, not in an external database.

**Terminology collision warning:** When researchers say "KV cache," they do not mean Redis. The "Key" and "Value" in a transformer's KV cache are linear projections of each token's hidden state that serve specific roles in the attention mechanism. The Query vector multiplied by Key produces a relevance score, which weights-blends the Value vectors. It's an internal data structure of the transformer architecture, not a caching layer.

Three latent memory subtypes:

**Reuse:** Save the KV cache from a forward pass, reload it later. The model picks up where it left off. Memorizing Transformers, LONGMEM, FOT.

**Transform:** Prune or compress the KV cache to keep only what matters. SnapKV uses head-wise voting to decide what to keep. H2O evicts "heavy hitter" entries. PyramidKV allocates different budgets per layer. Keep what the model was paying attention to, drop the rest.

**Generate:** Train a separate module to compress input into "memory tokens." Gist tokens, AutoCompressor, Titans. The model learns to compress context into compact representations.

**Why you probably won't build this:** Every technique requires access to internal model state—`past_key_values`, `output_hidden_states`, `output_attentions`, `inputs_embeds`. These are HuggingFace Transformers access points on PyTorch models. Hosted APIs expose none of them. You can't reach into Claude's KV cache. You can't inject custom embeddings into GPT-5.4's forward pass.

What providers *do* give you: prompt caching (provider-managed KV reuse—Anthropic caches your system prompt) and embeddings endpoints (useful for retrieval but not injectable back into the forward pass). Black-box optimizations you can't control or extend.

There's also a language constraint: this is Python-only territory. PyTorch and HuggingFace Transformers is where the internal access points live. Transformers.js and ONNX Runtime for Node.js don't expose the needed internals. If you're building in TypeScript, latent memory is off the table entirely.

### Parametric Memory: Fine-Tuning as Memory

Parametric memory encodes knowledge directly into model weights via fine-tuning, LoRA adapters, or knowledge editing techniques like ROME and MEMIT. When you fine-tune a model on your company's codebase, the knowledge becomes part of the model's parameters. Every conversation benefits from it—no retrieval step needed.

**Distinction from latent memory:** Parametric changes are permanent and affect every conversation. Latent memory is ephemeral and scoped to the current context. If latent memory is a snapshot injected before a specific task, parametric memory is muscle memory from years of practice.

Same hosted-model constraint applies: you need weight access, which APIs don't provide. Provider fine-tuning services exist (Anthropic, OpenAI, Google), but they don't support continuous, incremental updates. You can't fine-tune Claude a little more every time a user teaches it something new. It's a batch process, not a memory system in the dynamic sense.

### The Practical Scorecard

Here's where 107 pages compress to one insight:

- **Token-level:** Works with any model. Inspectable, debuggable, editable. Your lane if you're using hosted frontier models.
- **Latent:** Open-source models only, or invisible provider-side optimizations you can't control. Research-grade infrastructure required.
- **Parametric:** Open-source models only, with weak exception for provider fine-tuning that doesn't support incremental updates.

**If you're building an agent that talks to Claude, GPT-4, or Gemini through an API, your entire memory design space is token-level.** Master the topology spectrum (flat → planar → hierarchical) and get very good at dynamics—formation, evolution, retrieval. That's where all the leverage is.

## Functions: Why Agents Need Memory

The second axis asks what memory is *for*. Three functional categories, each mapping to practical design decisions.

### Factual Memory: What Does the Agent Know?

The most intuitive category—declarative facts about the world. User preferences, environment state, conversation history, project context.

- "The user prefers TypeScript."
- "The project uses Tailwind."
- "Last session, we debugged a race condition in the checkout flow."

Cognitive science splits declarative memory into **episodic** (event-specific: "the user told me about the bug on Tuesday") and **semantic** (general knowledge: "the project uses PostgreSQL"). Agent systems mirror this split with user-facing facts and environment-facing facts.

Factual memory enables three properties:

- **Consistency:** Don't contradict yourself across conversations
- **Coherence:** Maintain topical continuity within a conversation
- **Adaptability:** Personalize behavior over time based on what you learn

This is what most memory frameworks implement today. When people say "agent memory," they usually mean factual memory. Mem0, MemGPT, MemoryBank, Zep—they all store and retrieve facts. It's table stakes. The interesting question is what else your memory system should capture.

### Experiential Memory: How Does the Agent Improve?

This is the missing piece in most agent frameworks—and the most underexplored area for practitioners. **Factual memory tells the agent what it knows. Experiential memory tells it how to do things better**—how it solved problems in the past, what worked, what didn't.

Cognitive science calls this procedural memory—the kind that lets you ride a bike without thinking. In agent systems, experiential memory operates at four abstraction levels:

**1. Case-Based:** Store raw trajectories.

"User asked X, I tried approach Y, it failed with error Z, I tried approach W, it worked."

ExpeL, Memento, JARVIS-1 take this approach. High fidelity—full record of what happened—but poor generalization and expensive context consumption. Replaying a 200-step trajectory to avoid a mistake on step 47 is wasteful.

**2. Strategy-Based:** Distill insights and workflows from raw experience.

"When encountering connection timeout errors, check the connection pool configuration first—retry logic is usually a red herring."

Agent Workflow Memory (AWM), Reflexion, Buffer of Thoughts, R2D2 operate here. Strategies transfer across tasks—an insight about debugging connection issues applies to any project. Three granularities emerge: atomic insights (single observations), sequential workflows (step-by-step procedures), schematic patterns (high-level templates).

**3. Skill-Based:** Compile strategies into executable code.

The agent literally writes reusable tools for itself. Voyager's JavaScript skill library for Minecraft is the canonical example—the agent discovers how to mine iron, writes a `mineIron()` function, calls it directly next time instead of re-deriving the procedure. SkillWeaver, Alita, LEGOMem extend this to other domains. You could frame MCP tool generation as skill-based memory—the agent creates tools it can invoke later.

**4. Hybrid:** Combine levels.

ExpeL stores both trajectories and extracted insights. G-Memory gradually compiles frequent successes into executable skills. Memp distills gold trajectories into abstract procedures. The strongest systems don't pick one level—they maintain multiple simultaneously and use the right abstraction for the right context.

**Two recent patterns stand out:**

The **Agentic Context Engineering (ACE)** pattern uses a three-agent loop—Generator, Reflector, Curator—to evolve a "context playbook" of learned strategies. +10.6% improvement on agent benchmarks without fine-tuning, purely through better context management.

The **Dynamic Cheatsheet** approach prevents redundant computation by storing accumulated strategies and problem-solving insights for immediate reuse at inference time.

Both are forms of experiential memory operating entirely at the token level—no weight updates needed.

**I think experiential memory is where the biggest gap between current implementations and what's possible lives.** Most agents I've built or used have factual memory (or at least attempt it). Almost none systematically learn from their own successes and failures. Every debugging session starts from scratch.

### Working Memory: What Is the Agent Thinking About Right Now?

Working memory isn't about what's stored long-term—it's about what's in the prompt *right now*. Baddeley's working memory model from cognitive science describes it as capacity-limited, dynamically controlled, essential for higher-order cognition. The agent equivalent is the context window, but with an important distinction: **a context window is a passive buffer by default. Working memory actively controls what's in it.**

For **single-turn interactions**, working memory is mostly about compression—fitting massive inputs into the context window. LLMLingua compresses prompts by dropping low-perplexity tokens. Gist tokens compress input into learned representations. Observation abstraction converts raw HTML into structured state—Synapse does this for web agents, turning a full DOM into a compact representation of what's on screen.

For **multi-turn interactions**—where persistent agents live—working memory gets harder:

**State Consolidation:** Periodically compress conversation history into a summary. Claude Code does this when it hits context limits—you see a `compact_boundary` marker. MemAgent, MemSearcher, ReSum implement variations. Risk: losing detail that matters later.

**Hierarchical Folding:** Decompose tasks into subtasks, fold completed subtask trajectories into summaries, keep only the active subtask in full detail. HiAgent, Context-Folding, AgentFold take this approach. Elegant because completed work compresses while active work stays at full resolution.

**Cognitive Planning:** Maintain an externalized plan as the core of working memory, rather than raw conversation history. PRIME, SayPlan, KARMA, Agent-S structure working memory around "what am I trying to accomplish and what's my next step?" rather than "what has been said so far." 

I find the cognitive planning approach particularly compelling because it mirrors how I actually think on complex tasks—I don't replay full conversation history in my head, I check my mental model of the plan and figure out what's next.

## Dynamics: How Memory Operates Over Time

The third axis is where engineering decisions concentrate. Forms tells you where memory lives. Functions tells you why you need it. Dynamics tells you how to operate it—how memories get created, maintained, and retrieved.

### Formation: What to Store

When something happens that the agent might want to remember, how do you turn it into a memory entry? Five strategies, from simplest to most aggressive:

**1. Semantic Summarization:** Compress content to its gist.

Take a conversation or document, produce a shorter version capturing key points. Two flavors:

- **Incremental:** Update a running summary with each new chunk (MemGPT, Mem0). Risk: semantic drift—summary gradually loses fidelity.
- **Partitioned:** Divide content into segments, summarize each independently (MemoryBank, ReadAgent, LightMem). Risk: losing cross-partition dependencies—information spanning two segments might get lost.

**2. Knowledge Distillation:** Extract specific facts and insights rather than summarizing everything.

Think-in-Memory (TiM), RMM, ExpeL, AWM work this way. You don't produce a summary—you produce discrete facts: "User prefers dark mode." "API rate limit is 100 requests per minute." "Debugging approach X worked for error type Y."

More precise than summarization, but risks misextraction—the LLM might extract the wrong fact or miss an important one.

**3. Structured Construction:** Build graphs and trees from content.

Zep builds a temporal knowledge graph where entities have timestamps and relationships evolve. A-Mem creates networked notes with explicit links. GraphRAG uses community detection to identify clusters. RAPTOR builds recursive abstractive trees—leaf nodes are raw chunks, parent nodes are summaries of children, retrieve at any abstraction level.

Rich representations, but rigid—schema decisions at construction time constrain what you can retrieve later.

**4. Latent Representation:** Compress content into dense vectors.

MemoryLLM and AutoCompressor do this. Efficient storage, but opaque—you can't inspect what a latent vector "remembers."

**5. Parametric Internalization:** Fine-tune the model on the content.

ROME and MEMIT edit specific facts directly into model weights. Permanent, but carries catastrophic forgetting risk—updating one fact can corrupt nearby facts.

**These aren't mutually exclusive.** The strongest systems do multiple simultaneously—store both raw case and extracted insight. If you're building a production system, I'd start with knowledge distillation for discrete facts and semantic summarization for conversation context. Add structured construction only when you see specific retrieval needs flat search can't meet.

### Evolution: How to Maintain Memory

Memories aren't static. New information contradicts old memories. Related memories should merge. Low-value memories should be pruned. Three operations:

**1. Consolidation:** Merge related entries.

Simplest: detect near-duplicates and combine them (local, pairwise). More sophisticated: cluster related memories, produce summary entries for each cluster (PREMem, CAM, TiM). Global: frameworks like MOOM and AgentFold periodically restructure the entire memory store. Goal: keep memory compact and retrieval-friendly without losing information.

**2. Updating:** Resolve conflicts when new information contradicts existing memory.

If a user says "we switched from PostgreSQL to MySQL," you need to update—but do you delete the old entry or mark it as superseded? 

Zep's approach is smart: **soft-delete with timestamps** rather than hard-delete. Old fact is still there for auditability but won't surface in retrieval. LightMem and MOOM use a dual-phase pattern: fast online writes that accept new information immediately, plus slow offline consolidation that resolves conflicts in the background. Mem-α trains an RL policy for update decisions—the system learns when to update vs when to keep both versions.

**3. Forgetting:** Prune low-value entries.

An important part of remembering is forgetting. Three signals:

- **Time decay:** Exponential, inspired by Ebbinghaus forgetting curve—memories naturally fade
- **Access frequency:** LRU/LFU policies—rarely accessed memories get evicted
- **Semantic importance:** LLM-judged value—ask the model "is this memory still useful?"

**Warning:** LRU-style forgetting can eliminate rare but essential long-tail knowledge. A memory accessed once per year might still be critical when needed. Pure frequency-based eviction is dangerous for specialized knowledge.

**Three generations of evolution strategies:**

1. **Rule-based:** Hard-coded decay rates, fixed merge thresholds
2. **LLM-assisted:** Use the model to judge what to merge, update, or forget
3. **RL-trained:** Train a policy that learns optimal memory management through experience (Memory-R1, Mem-α)

Most practical systems today are in the first or second generation. LLM-assisted evolution is probably sufficient for most use cases.

**One practical insight I keep coming back to:** Conflict detection at write time is underrated. When you're about to store a new memory, check for existing entries in the 0.6–0.9 cosine similarity range. Below 0.6, they're unrelated. Above 0.9, they're near-duplicates. But that middle range—similar topic, potentially different facts—is where interesting conflicts live. "The project uses PostgreSQL" at 0.75 similarity to "The project uses MySQL" is a conflict you want to surface, not silently resolve.

### Retrieval: How to Access What You Stored

Retrieval is where most people start thinking about memory systems, but it's actually the last step. You can't recall memories you never stored. And here's the meta-insight: **retrieval quality is bounded by formation and evolution quality**. You can build the most sophisticated retrieval pipeline in the world, but if what's stored is noisy, contradictory, or poorly structured, your retrievals will be noisy, contradictory, and poorly structured.

That said, retrieval still matters enormously. Four-step pipeline:

**1. Timing:** Don't always retrieve.

Not every query needs memory augmentation. Some systems let the model decide—it can call a "search memory" tool or not. More sophisticated: the **fast-slow pattern**—generate quick draft, check confidence, retrieve only if draft is insufficient. ComoRAG and PRIME implement variations. Benefit: unnecessary retrieval adds latency and can hurt performance by injecting irrelevant context.

**2. Query Construction:** The query you have is probably wrong.

Raw user queries are poor retrieval signals. "How do we handle authentication?" doesn't look like the stored memory "The project uses JWT tokens with 24-hour expiry, validated by middleware in auth.ts." In embedding space, question and answer are farther apart than you'd want—different shapes (interrogative/vague vs declarative/specific).

This is where **HyDE** (Hypothetical Document Embeddings) comes in. The counterintuitive trick: ask the LLM the question with no context, let it respond. Even if the response is completely wrong, the fabricated answer is shaped like real information in your memory store—which means its embedding will be closer to the real answer than the original question's embedding was.

The fabricated answer doesn't need to be correct. "The project uses Python with Flask" and "The project uses TypeScript with Express" are neighbors in embedding space—same declarative structure, same semantic domain, same answer-shape. The encoder's dense bottleneck filters out specific (wrong) details and preserves structural similarity.

In practice: generate one hypothetical at temperature 0.7, embed it, use that for retrieval. Use a small, fast model—the answer doesn't need to be smart, just answer-shaped.

**When HyDE doesn't help:** Specific factual lookups where the query already contains exact matching terms ("what's in auth.ts?"), very short keyword-like queries ("PostgreSQL version"). In those cases, the original query is already closer to stored memory than any hypothetical would be.

**3. Strategy:** Go hybrid.

Once you have a good query (or HyDE-generated hypothetical), the retrieval strategy matters. **Hybrid retrieval—BM25 plus semantic embedding, optionally plus graph traversal—outperforms any single method.**

- **BM25:** Catches exact keyword matches (when user says "auth.ts," you want exact string matching)
- **Semantic embedding:** Catches paraphrases (when user says "login system" and memory says "authentication middleware")
- **Graph traversal:** Catches multi-hop relationships (answering "what API does the project use that's built by the company Steve used to work at?" requires chaining through multiple nodes)

**4. Post-Processing:** Filter aggressively.

Rerank retrieved results with a cross-encoder or LLM-based relevance judge. Apply MMR (Maximal Marginal Relevance) for diversity—you want top-K results to cover different aspects of the query, not K slightly different versions of the same memory. 

**Filter aggressively.** Injecting ten marginally relevant memories is worse than injecting three highly relevant ones. More context is not always better context.

## Decision Matrices: Where to Land on Each Axis

Here's how these three axes map to practical decisions:

### Forms Decision Matrix

| Use Case | Token-Level | Latent | Parametric |
|----------|-------------|--------|------------|
| Hosted API models (Claude, GPT, Gemini) | ✅ Only option | ❌ No access | ❌ Batch only |
| Open-source models (Llama, Mistral) | ✅ Always works | ✅ If PyTorch | ✅ If fine-tune |
| TypeScript/JavaScript stack | ✅ Works | ❌ No internals | ❌ No access |
| Inspectable/debuggable memory | ✅ Human-readable | ❌ Opaque vectors | ❌ Weight changes |
| Continuous updates | ✅ Write anytime | ✅ Per-session | ❌ Batch process |

**Bottom line:** If you're using hosted models, you're building token-level memory. Optimize there.

### Functions Decision Matrix

| Memory Type | When You Need It | Implementation Complexity |
|-------------|------------------|---------------------------|
| **Factual** | Always—table stakes for any persistent agent | Low (vector store + retrieval) |
| **Experiential** | When agent repeats mistakes, re-derives solutions | Medium (extraction + consolidation) |
| **Working** | When context window pressure is constant problem | Medium (summarization + folding) |

**Recommended progression:**
1. Start with factual memory (user prefs, environment state)
2. Add experiential when you observe repeated work
3. Add working memory management when hitting context limits

### Dynamics Decision Matrix

**Formation strategies by content type:**

| Content Type | Best Strategy | Why |
|--------------|---------------|-----|
| User preferences | Knowledge distillation | Discrete facts, need precision |
| Conversation history | Semantic summarization | Long-form content, gist is sufficient |
| Problem-solving patterns | Structured construction | Need to capture relationships/workflows |
| Code examples | Case-based + skill extraction | Preserve details + enable reuse |

**Evolution strategies by system maturity:**

| Maturity Level | Strategy | Trade-offs |
|----------------|----------|-----------|
| MVP | Rule-based (time decay only) | Simple, predictable, no intelligence |
| Production | LLM-assisted conflict detection | Smarter, more cost/latency |
| Advanced | RL-trained policies | Optimal but complex, research-grade |

**Retrieval strategies by query complexity:**

| Query Type | Strategy | Rationale |
|------------|----------|-----------|
| Exact lookup ("what's in auth.ts?") | BM25 only | Keyword match is sufficient |
| Semantic ("how do we handle auth?") | HyDE + semantic | Need answer-shaped query |
| Multi-hop ("API from Steve's company?") | Graph traversal or iterative | Single retrieval can't chain |

## What This Means for Your Next Agent

If you're building an agent memory system, here's the actionable path:

**1. Accept you're building token-level memory** (unless you're running open-source models and comfortable with PyTorch internals). Don't spend cycles evaluating latent or parametric approaches if you're calling Claude through an API.

**2. Start with flat topology.** A vector store with good retrieval beats a poorly maintained graph. Add structure only when you observe specific failures—multi-hop queries that can't be answered, consolidation problems, retrieval quality issues.

**3. Invest in experiential memory early.** The biggest gap I see in production agents is they have factual memory but no learning loop. Even a simple strategy store—"approaches that worked for error type X"—meaningfully reduces repeated work.

**4. HyDE is a 10-line function with outsized impact.** Before each retrieval, generate a hypothetical answer, embed it, use that for semantic search. It's one LLM call with a fast model. The improvement is immediate and measurable.

**5. Conflict detection at write time is underrated.** When storing a new memory, check for existing entries in the 0.6–0.9 similarity range. Surface conflicts rather than silently resolving them. Your users will tell you which fact is current.

**6. Multi-tenancy is not optional if multiple users touch your system.** Storage-level isolation (separate collections/indexes per tenant) is the pragmatic strong isolation approach. Application-level filtering is a leak waiting to happen.

**7. Retrieval quality is bounded by what's stored.** Beyond a certain sophistication of retrieval pipeline, leverage shifts to making what's stored cleaner. Invest in formation (good extraction, good summarization) and evolution (consolidation, conflict resolution) as much as retrieval.

## The Shift in How We Think About Memory

The three-axis framework isn't just a better taxonomy. It represents a conceptual shift: **memory is not a feature you bolt onto an agent after the core loop works. It's a foundational primitive that determines what kinds of agents you can build.**

A stateless LLM with a clever prompt is a tool. An agent with factual memory is an assistant that remembers your preferences. An agent with factual + experiential memory is a system that improves over time. An agent with all three—factual, experiential, working—is something that starts to feel genuinely autonomous.

The old short-term/long-term taxonomy collapsed because it described human memory, not agent memory. Agents don't have a hippocampus that consolidates memories during sleep. They have write operations to databases and consolidation jobs that run on schedule. The three-axis framework describes the system we're actually building—not the biology we're metaphorically imitating.

Forms, functions, dynamics. Where memory lives, why agents need it, how it operates. Master those three axes, and the design space opens up.

---

## References & Further Reading

- **Primary Survey:** Hu et al. (2025), ["Memory in the Age of AI Agents"](https://arxiv.org/abs/2512.13564), arXiv:2512.13564 (107 pages, comprehensive)
- **Companion Paper List:** [memory-agent/memory-agent-papers](https://github.com/memory-agent/memory-agent-papers) (GitHub, actively updated)
- **A-Mem (Zettelkasten-style linked notes):** [arXiv:2502.12110](https://arxiv.org/abs/2502.12110) (85–93% token reduction)
- **StructMemEval (simple retrieval vs complex hierarchies):** [arXiv:2502.13649](https://arxiv.org/abs/2502.13649)
- **HyDE (Hypothetical Document Embeddings):** Gao et al., [arXiv:2212.10496](https://arxiv.org/abs/2212.10496) (ACL 2023, CMU/Waterloo)
- **Practical synthesis:** Steve Kinney, ["Memory Systems for AI Agents: What the Research Says and What You Can Actually Build"](https://stevekinney.com/writing/agent-memory-systems) (March 2026)

**Framework Implementations:**
- [Mem0](https://github.com/mem0ai/mem0) – Simple managed memory
- [Letta](https://github.com/letta-ai/letta) (MemGPT) – Self-managing, OS-inspired
- [Zep](https://github.com/getzep/zep) – Temporal knowledge graph
