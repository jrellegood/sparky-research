# Multi-Agent Memory as a Computer Architecture Problem: Cache Coherence for LLMs

Your multi-agent system is slow. Agents repeat work, read stale data, and overwrite each other's results. You've tried bigger vector stores, fancier prompts, more capable models. Nothing helps.

Here's why: **you're treating memory as a prompt engineering problem when it's actually a systems problem.** The same problems that plague distributed databases—cache coherence, memory consistency, bandwidth bottlenecks—are killing your agents. And the solutions? They're in your old computer architecture textbook.

A [recent paper from UC San Diego](https://arxiv.org/html/2603.10062v1) frames multi-agent memory through a computer architecture lens. Let's translate the academic concepts into production patterns you can ship today.

## The Problem: Context Is No Longer a Static Prompt

Early LLM work treated context like a static string: "Here's your prompt, here are some documents, go." But modern agent systems operate in a fundamentally different environment:

- **Longer histories**: Not 10k tokens of reference docs, but 200k+ tokens of conversation history, tool traces, and intermediate results
- **Multimodal inputs**: Images, videos, audio, structured data—all part of the "memory" an agent needs to reason over
- **Structured traces**: Not just text, but executable artifacts (SQL queries, code diffs, API responses) that need versioning
- **Collaborative workflows**: Multiple agents reading from and writing to shared state concurrently

This isn't a prompt. It's a **dynamic memory system** with bandwidth constraints, caching requirements, and consistency challenges. Computer architecture solved these problems decades ago. We're just relearning the lessons.

## Shared vs Distributed Memory: The Two Paradigms

In traditional computing, there are two fundamental ways to organize memory across multiple processors:

**Shared Memory**: All processors access a single shared address space. Easy to program (just read/write to shared variables), but requires coherence protocols to keep caches consistent.

**Distributed Memory**: Each processor has its own local memory. Processors communicate via explicit message passing. Harder to program, but scales better and avoids coherence bottlenecks.

Multi-agent systems mirror this exactly:

### Shared Memory Agents

All agents access a shared pool—typically a vector store, document database, or key-value store.

```python
# Shared memory pattern
class SharedMemorySystem:
    def __init__(self):
        self.vector_store = VectorDB()  # Shared pool
        self.doc_store = DocumentStore()  # Shared pool
    
    def agent_a_writes(self, key, value):
        # Agent A writes to shared store
        self.doc_store.put(key, value)
    
    def agent_b_reads(self, key):
        # Agent B reads same store
        # Problem: No guarantee this is fresh!
        return self.doc_store.get(key)
```

**Pros:**
- Easy knowledge reuse (all agents see all data)
- No explicit synchronization needed
- Simple to implement initially

**Cons:**
- **Coherence nightmare**: Without coordination, agents read stale data, overwrite each other, rely on inconsistent versions
- Single bottleneck for all memory access
- Hard to scale (all agents contend for same resources)

### Distributed Memory Agents

Each agent owns its local memory and synchronizes selectively.

```python
# Distributed memory pattern
class DistributedMemorySystem:
    def __init__(self):
        self.agent_memories = {}  # Each agent has private memory
    
    def agent_a_writes_local(self, key, value):
        if 'agent_a' not in self.agent_memories:
            self.agent_memories['agent_a'] = {}
        self.agent_memories['agent_a'][key] = value
    
    def sync_to_agent_b(self, key):
        # Explicit synchronization required
        value = self.agent_memories['agent_a'].get(key)
        if 'agent_b' not in self.agent_memories:
            self.agent_memories['agent_b'] = {}
        self.agent_memories['agent_b'][key] = value
```

**Pros:**
- Better isolation (no accidental overwrites)
- Scales better (no shared bottleneck)
- Clearer ownership model

**Cons:**
- **State divergence**: Without explicit sync, agents operate on different facts
- More complex coordination logic
- Harder to debug (distributed state is always hard)

**Reality check**: Most production systems sit between these extremes. Agents have local working memory (recent tool calls, intermediate results) but share certain artifacts (facts, search indices, conversation history).

## The Three-Layer Memory Hierarchy

Computer systems don't have "one memory." They have a **memory hierarchy**: registers → L1 cache → L2 cache → L3 cache → RAM → disk. Each layer trades off latency, bandwidth, and capacity.

Agents need the same structure. Here's the mapping:

### Layer 1: I/O (Interfaces)

**What it is**: The interface layer where information enters and leaves the system.

**Agent equivalent**: Audio transcriptions, text documents, images, API responses, network calls.

**Key insight**: This is the slowest layer. Fetching a document from the web, transcribing audio, or making an API call takes seconds. Minimize round trips.

```python
# I/O layer: slow, external
def fetch_document(url):
    response = requests.get(url)  # Slow network I/O
    return response.text

# Don't do this in a loop!
for url in urls:
    doc = fetch_document(url)  # 100ms+ per fetch
    process(doc)
```

### Layer 2: Cache (Fast, Limited Capacity)

**What it is**: Fast, limited-capacity memory for immediate reasoning.

**Agent equivalent**: Compressed context summaries, recent tool call results, KV caches, embeddings of recent messages.

**Key insight**: The cache is where agents spend most of their time. If relevant information isn't here, you pay the latency penalty to fetch from Layer 3.

```python
# Cache layer: fast, small
class AgentCache:
    def __init__(self, max_size=50):
        self.recent_context = deque(maxlen=max_size)  # Sliding window
        self.tool_results = {}  # Recent tool outputs
        self.kv_cache = None  # LLM KV cache (if available)
    
    def add_message(self, msg):
        self.recent_context.append(msg)
        # Evict oldest if over limit
    
    def get_tool_result(self, tool_name):
        # Check cache before calling tool again
        return self.tool_results.get(tool_name)
```

**Production pattern**: Keep the last 20-50 messages in the cache. Summarize older context into compressed artifacts. This is how OpenClaw's daily log pattern works: full detail for today, summaries for last week, semantic search for everything older.

### Layer 3: Memory (Large Capacity, Slower)

**What it is**: Large-capacity, slower memory optimized for retrieval and persistence.

**Agent equivalent**: Full dialogue history, vector databases, graph databases, document stores.

**Key insight**: This is your swap space. Expensive to access (embeddings + similarity search), but necessary for long-term recall.

```python
# Memory layer: slow, large
class AgentMemory:
    def __init__(self):
        self.vector_db = VectorDB()  # Full conversation history
        self.graph_db = Neo4j()  # Entity relationships
        self.doc_store = MongoDB()  # Raw artifacts
    
    def retrieve_relevant(self, query, k=5):
        # Semantic search: ~100ms+ depending on index size
        return self.vector_db.similarity_search(query, k=k)
```

**Performance trap**: If you're doing semantic search on every agent turn, you're thrashing between layers 2 and 3. Cache common queries. Prefetch likely-needed context during idle time.

## The Two Missing Protocols

The paper identifies two critical gaps in current multi-agent systems:

### Missing Protocol 1: Agent Cache Sharing

In multiprocessor systems, cache coherence protocols (MESI, MOESI) let processors share cached data efficiently. One CPU's cache line can be transferred directly to another CPU's cache without going back to main memory.

**Agent equivalent**: When Agent A generates intermediate results (e.g., code analysis), Agent B should be able to reuse that work **without re-running the analysis**.

```python
# Without cache sharing (wasteful)
class WastefulMultiAgent:
    def agent_a_analyze(self, code):
        # Agent A analyzes code, stores result locally
        analysis = expensive_analysis(code)  # Takes 30 seconds
        return analysis
    
    def agent_b_refactor(self, code):
        # Agent B needs same analysis, re-runs it!
        analysis = expensive_analysis(code)  # Another 30 seconds
        refactored = refactor_with_analysis(code, analysis)
        return refactored

# With cache sharing (efficient)
class CacheSharingMultiAgent:
    def __init__(self):
        self.shared_cache = {}  # Cache accessible to all agents
    
    def agent_a_analyze(self, code):
        cache_key = hash(code)
        if cache_key in self.shared_cache:
            return self.shared_cache[cache_key]
        
        analysis = expensive_analysis(code)
        self.shared_cache[cache_key] = analysis  # Store for others
        return analysis
    
    def agent_b_refactor(self, code):
        cache_key = hash(code)
        analysis = self.shared_cache.get(cache_key)  # Reuse Agent A's work!
        if not analysis:
            analysis = expensive_analysis(code)
        
        refactored = refactor_with_analysis(code, analysis)
        return refactored
```

**Production pattern**: Use Redis or Memcached as a shared cache layer. Key by content hash (not filename—files change!). Include metadata (agent_id, timestamp, version) for debugging.

### Missing Protocol 2: Agent Memory Access Control

In databases, access control is well-defined: read permissions, write permissions, transaction isolation levels. In multi-agent systems? Often undefined.

**Key questions with no standard answers**:
- Can Agent B read Agent A's long-term memory?
- Is access read-only or read-write?
- What's the unit of access: a document, a chunk, a key-value record, or a trace segment?
- How do you handle concurrent writes?

```python
# Access control protocol (proposal)
class AgentMemoryAccessControl:
    def __init__(self):
        self.permissions = {}  # agent_id -> {read: [scopes], write: [scopes]}
        self.memory_scopes = {
            'shared_facts': SharedFactStore(),
            'conversation_history': ConversationStore(),
            'agent_a_private': PrivateStore('agent_a'),
            'agent_b_private': PrivateStore('agent_b'),
        }
    
    def grant_permission(self, agent_id, scope, mode='read'):
        if agent_id not in self.permissions:
            self.permissions[agent_id] = {'read': [], 'write': []}
        self.permissions[agent_id][mode].append(scope)
    
    def read(self, agent_id, scope, key):
        if scope not in self.permissions[agent_id]['read']:
            raise PermissionError(f"Agent {agent_id} cannot read from {scope}")
        return self.memory_scopes[scope].get(key)
    
    def write(self, agent_id, scope, key, value):
        if scope not in self.permissions[agent_id]['write']:
            raise PermissionError(f"Agent {agent_id} cannot write to {scope}")
        self.memory_scopes[scope].put(key, value)

# Example usage
acl = AgentMemoryAccessControl()
acl.grant_permission('agent_a', 'shared_facts', mode='read')
acl.grant_permission('agent_a', 'shared_facts', mode='write')
acl.grant_permission('agent_b', 'shared_facts', mode='read')  # Read-only for B

acl.write('agent_a', 'shared_facts', 'user_pref_theme', 'dark')
theme = acl.read('agent_b', 'shared_facts', 'user_pref_theme')  # OK
acl.write('agent_b', 'shared_facts', 'user_pref_theme', 'light')  # PermissionError!
```

**Production pattern**: Start with **scope-based access control**. Define scopes (shared_facts, conversation_history, agent_X_private) and grant read/write permissions explicitly. Don't rely on "all agents can access everything"—that's how you get data corruption.

## The Real Challenge: Multi-Agent Consistency

Here's the hardest problem: **memory consistency**. In computer architecture, consistency models specify which updates are visible to a read and in what order. Classic example:

```
# Two processors, shared variable X (initially 0)
Processor A:              Processor B:
X = 1                     if X == 1:
                              Y = 1
```

Under **sequential consistency**, if B reads `X == 1`, then A's write happened before B's read. Under **relaxed consistency**, B might read `X == 0` even after A wrote `X = 1` (because writes can be reordered or delayed).

Multi-agent systems face the same problem, but worse:

### Problem 1: Read-Time Conflict Handling

Agents read from memory that's constantly being updated. How do you handle stale reads?

```python
# Agent A updates a fact
memory.update_fact('user_location', 'San Francisco')

# Agent B reads the fact (moments later)
location = memory.get_fact('user_location')

# Question: Is this the latest value? What if Agent A's write is still propagating?
```

**Solution 1: Versioning**

Track version numbers for all facts. Agents specify which version they're reading.

```python
class VersionedMemory:
    def __init__(self):
        self.facts = {}  # key -> [(version, value, timestamp)]
    
    def update_fact(self, key, value):
        if key not in self.facts:
            self.facts[key] = []
        version = len(self.facts[key]) + 1
        self.facts[key].append((version, value, time.time()))
    
    def get_fact(self, key, version='latest'):
        if version == 'latest':
            return self.facts[key][-1][1]  # Most recent value
        else:
            for v, val, ts in self.facts[key]:
                if v == version:
                    return val
        raise KeyError(f"Version {version} not found")
```

**Solution 2: Read Timestamps**

Tag each read with a timestamp. If the data changes after the read, flag potential conflicts.

```python
class TimestampedMemory:
    def __init__(self):
        self.facts = {}  # key -> (value, last_updated_ts)
    
    def get_fact(self, key):
        value, ts = self.facts[key]
        return value, ts  # Return value + timestamp
    
    def verify_freshness(self, key, read_ts, threshold_ms=5000):
        _, current_ts = self.facts[key]
        if (current_ts - read_ts) > threshold_ms:
            raise StaleReadError(f"Fact {key} was updated after your read!")
```

### Problem 2: Update-Time Visibility and Ordering

When Agent A writes, when does Agent B see the update? What if Agent C writes concurrently?

```python
# Classic consistency problem
# Initially: memory['count'] = 0

# Agent A                        Agent B
read count (0)                   read count (0)
write count = count + 1          write count = count + 1

# Final value: 1 (expected: 2)
# Last write wins, first increment is lost!
```

**Solution 1: Locking (Pessimistic Concurrency)**

Agents acquire locks before writing.

```python
from threading import Lock

class LockedMemory:
    def __init__(self):
        self.facts = {}
        self.locks = {}  # key -> Lock
    
    def update_fact(self, key, update_fn):
        if key not in self.locks:
            self.locks[key] = Lock()
        
        with self.locks[key]:
            current_value = self.facts.get(key, 0)
            new_value = update_fn(current_value)
            self.facts[key] = new_value
            return new_value

# Usage
memory = LockedMemory()
memory.update_fact('count', lambda x: x + 1)  # Atomic increment
```

**Solution 2: Optimistic Concurrency (Compare-and-Swap)**

Agents read, compute new value, then write **only if the value hasn't changed**.

```python
class OptimisticMemory:
    def __init__(self):
        self.facts = {}  # key -> (value, version)
    
    def read(self, key):
        value, version = self.facts.get(key, (None, 0))
        return value, version
    
    def compare_and_swap(self, key, expected_version, new_value):
        current_value, current_version = self.facts.get(key, (None, 0))
        if current_version != expected_version:
            raise ConflictError(f"Version mismatch: expected {expected_version}, got {current_version}")
        self.facts[key] = (new_value, current_version + 1)
        return True

# Usage
value, version = memory.read('count')
new_value = value + 1
memory.compare_and_swap('count', version, new_value)  # Fails if count changed
```

**Solution 3: Conflict-Free Replicated Data Types (CRDTs)**

For certain data structures (counters, sets, maps), you can use CRDTs that guarantee eventual consistency without coordination.

```python
# CRDT counter: all agents can increment independently, merge later
class CRDTCounter:
    def __init__(self, agent_id):
        self.agent_id = agent_id
        self.counts = {}  # agent_id -> count
    
    def increment(self):
        self.counts[self.agent_id] = self.counts.get(self.agent_id, 0) + 1
    
    def merge(self, other_counter):
        for agent_id, count in other_counter.counts.items():
            self.counts[agent_id] = max(self.counts.get(agent_id, 0), count)
    
    def value(self):
        return sum(self.counts.values())

# Agents increment independently
agent_a_counter = CRDTCounter('agent_a')
agent_b_counter = CRDTCounter('agent_b')

agent_a_counter.increment()  # a=1, total=1
agent_b_counter.increment()  # b=1, total=1

# Merge later (no coordination needed!)
agent_a_counter.merge(agent_b_counter)  # a=1, b=1, total=2
```

## Practical Recommendations

**1. Start with a clear memory model**: Shared or distributed? Hybrid? Document your choice.

**2. Implement a cache layer**: Don't hit vector stores on every turn. Cache recent context, tool results, and common queries.

**3. Version everything**: Facts, artifacts, tool outputs—all should have version numbers or timestamps.

**4. Define access control early**: Which agents can read/write which scopes? Don't rely on "everyone accesses everything."

**5. Choose a consistency model**: For shared state, pick one:
   - **Locking** for high-stakes writes (user preferences, financial data)
   - **Optimistic concurrency** for low-conflict writes (logs, analytics)
   - **CRDTs** for naturally commutative operations (counters, sets)

**6. Monitor cache hit rates**: If agents are constantly fetching from Layer 3 (vector DB), your cache is too small or poorly designed.

**7. Use explicit synchronization**: Don't assume writes are instantly visible. Use pub/sub, message queues, or explicit sync calls.

## When NOT to Overthink This

Not every multi-agent system needs full consistency protocols. If you're building:
- **Demo or prototype**: Start simple. Shared vector store, no versioning, optimistic about conflicts.
- **Single-user, sequential agents**: If agents run one at a time, concurrency isn't an issue.
- **Read-only agents**: If agents only read (never write), consistency is trivial.

But if you're building **production multi-agent systems** where agents collaborate, share state, and make decisions based on each other's work? You need these patterns. The bugs won't show up in demos. They'll show up at scale, under load, and they'll be hell to debug.

## Conclusion

Multi-agent memory isn't a prompt engineering problem. It's a distributed systems problem. Cache coherence, memory hierarchies, consistency models—these aren't academic curiosities. They're the patterns that make production systems reliable.

The next time your agents read stale data, overwrite each other's work, or mysteriously repeat the same analysis twice, don't reach for a better prompt. Reach for your old computer architecture textbook. The solutions are already there.

---

**Further Reading:**
- [Original paper: Multi-Agent Memory from a Computer Architecture Perspective](https://arxiv.org/html/2603.10062v1)
- [A Primer on Memory Consistency and Cache Coherence](https://pages.cs.wisc.edu/~markhill/papers/primer2020_2nd_edition.pdf) (Sorin, Hill, Wood)
- [Designing Data-Intensive Applications](https://dataintensive.net/) (Martin Kleppmann) - Chapter 5 on Replication
- [CRDTs: Consistency without concurrency control](https://arxiv.org/abs/0907.0929)
