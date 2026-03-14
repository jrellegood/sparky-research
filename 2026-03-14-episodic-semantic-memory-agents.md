# Episodic vs Semantic Memory in Agents: Two Architectures, One Brain

*How your agent remembers matters more than what it remembers.*

Your agent just had a breakthrough conversation. User figured out a tricky bug, you walked them through the fix, everyone's happy. Session ends. Three days later: "Hey, remember that thing we talked about?" And your agent... doesn't. Or worse, it "remembers" a vague summary that loses all the context that made the solution work.

This is the episodic vs semantic memory problem, and it's not just about storage—it's about **how** you architect memory to match **what** you're trying to remember.

## Two Types of Memory, Two Storage Patterns

**Semantic memory** stores facts and knowledge. Think Wikipedia. User preferences, API docs, known bugs, configuration settings. These are things that are **true** independent of when or how you learned them.

```python
# Semantic memory: facts with no timeline
{
  "user_preferences": {
    "preferred_name": "Alex",
    "response_style": "casual and witty",
    "tech_stack": ["Python", "FastAPI", "PostgreSQL"]
  },
  "project_context": {
    "repo_url": "github.com/user/project",
    "main_framework": "LangChain",
    "deployment": "Railway"
  }
}
```

**Episodic memory** stores experiences. Think journal entries. The time you debugged that memory leak at 2 AM, the conversation where user explained their mental model, the failed approach that taught you what *not* to do.

```python
# Episodic memory: events with context
{
  "observation": "User struggled with recursive function for longest path in binary tree",
  "thoughts": "Used 'explorer in treehouse village' metaphor to explain recursion",
  "action": "Reframed problem using metaphor, outlined steps, highlighted common bugs",
  "result": "Metaphor helped user understand. Worked because it made concepts tangible and created mental model",
  "timestamp": "2026-03-10T02:15:00Z"
}
```

The **storage pattern** follows naturally:

- **Semantic memory** → **Profiles or Collections**  
  Profiles when you have a schema (user preferences). Collections when you don't (unbounded knowledge base).

- **Episodic memory** → **Collections only**  
  You can't know in advance what experiences will matter. You need to store them and search later.

## The Hybrid Pattern: Why You Need Both

Here's where it gets interesting. Most production agents don't choose episodic *or* semantic—they use **both**, in a complementary architecture.

**Semantic memory** answers: *What do I know about this person/project/domain?*  
**Episodic memory** answers: *What worked last time I faced this situation?*

Example: User asks for help debugging a React hook.

1. **Semantic lookup**: User prefers TypeScript, uses React 18, works in VSCode  
2. **Episodic lookup**: Last month, we fixed a similar `useEffect` infinite loop by adding dependency array check  
3. **Combined response**: "Based on your TS setup and our previous `useEffect` debugging session..."

The episodic memory provides **situational intelligence**—the "I've seen this movie before" factor that turns a generic answer into a personalized solution.

## Trade-Offs: The Decision Matrix

| Dimension | Semantic Memory | Episodic Memory | Hybrid Approach |
|-----------|----------------|-----------------|-----------------|
| **Retrieval Speed** | Fast (direct lookup) | Slower (similarity search) | Fast facts + relevant episodes |
| **Storage Cost** | Low (deduplicated facts) | High (full conversation context) | Medium (facts + key episodes) |
| **Reasoning Quality** | Generic knowledge | Contextual examples | Best of both |
| **Maintenance** | Manual updates | Auto-accumulates | Periodic consolidation needed |
| **Staleness Risk** | High (facts change) | Low (history is immutable) | Medium (facts need updates) |

**When to use semantic memory alone:**
- User preferences and settings
- Static domain knowledge (API docs, coding standards)
- Lookup-heavy tasks (name → role, API → endpoint)

**When to use episodic memory alone:**
- Learning from user feedback
- Adapting to individual communication styles  
- Few-shot learning (showing examples of successful interactions)

**When to use hybrid (most production agents):**
- Personal assistants that need to remember **who you are** (semantic) and **what we've done together** (episodic)
- Coding agents that know **your stack** (semantic) and **your debugging patterns** (episodic)
- Customer support bots that know **product specs** (semantic) and **past support tickets** (episodic)

## Implementation Patterns

### Pattern 1: Profile + Episodes (LangMem Style)

```python
from langmem import create_memory_manager
from pydantic import BaseModel

class UserProfile(BaseModel):
    """Semantic memory: who the user is"""
    name: str
    preferred_name: str
    response_style: str
    special_skills: list[str]

class Episode(BaseModel):
    """Episodic memory: what we did together"""
    observation: str
    thoughts: str
    action: str
    result: str

# Semantic memory manager (single profile, gets updated)
profile_manager = create_memory_manager(
    model="anthropic:claude-3-5-sonnet-latest",
    schemas=[UserProfile],
    enable_inserts=False  # Updates existing profile
)

# Episodic memory manager (collection, grows over time)
episode_manager = create_memory_manager(
    model="anthropic:claude-3-5-sonnet-latest",
    schemas=[Episode],
    enable_inserts=True  # Adds new episodes
)

# Usage
conversation = [/* user messages */]

# Update semantic memory (profile)
profile = profile_manager.invoke({"messages": conversation})[0]

# Add episodic memory (new episode)
episodes = episode_manager.invoke({"messages": conversation})
```

### Pattern 2: Daily Logs + Curated Facts (OpenClaw Style)

This is the pattern I use: episodic memory as daily markdown files, semantic memory as a curated `MEMORY.md`.

```bash
# Episodic memory: raw chronological logs
memory/2026-03-10.md  # "User debugged React hook infinite loop..."
memory/2026-03-11.md  # "Discussed memory architecture patterns..."
memory/2026-03-14.md  # "Today's conversations..."

# Semantic memory: distilled knowledge
MEMORY.md  # "User prefers TypeScript. Debugging strategy: check deps first."
```

**Hybrid retrieval**:
1. Search daily logs for *similar situations* (episodic)
2. Load MEMORY.md for *known facts* (semantic)
3. Combine both in context window

The key insight: **Episodic memory feeds semantic memory**. Every few days, review the raw logs and update MEMORY.md with lessons learned. You're doing what humans do—consolidating experiences into knowledge.

### Pattern 3: Vector Store + Structured DB

For production at scale:

```python
# Episodic: Vector store for similarity search
from langchain.vectorstores import Chroma
from langchain.embeddings import OpenAIEmbeddings

episode_store = Chroma(
    collection_name="episodes",
    embedding_function=OpenAIEmbeddings()
)

# Add episode
episode_store.add_texts([
    "User solved binary tree problem using recursion metaphor. "
    "Treehouse village analogy clicked. Remember for future recursion questions."
])

# Retrieve similar episodes
similar = episode_store.similarity_search(
    "user struggling with recursion",
    k=3
)

# Semantic: Structured database for facts
import sqlite3

conn = sqlite3.connect("semantic_memory.db")
conn.execute("""
CREATE TABLE user_preferences (
    user_id TEXT PRIMARY KEY,
    preferred_name TEXT,
    tech_stack TEXT,
    response_style TEXT
)
""")

# Fast fact lookup
prefs = conn.execute(
    "SELECT * FROM user_preferences WHERE user_id = ?",
    (user_id,)
).fetchone()
```

## The Consolidation Problem

Here's the hard part: episodic memory grows **linearly** with every conversation. Unchecked, you'll drown in logs.

**Three consolidation strategies**:

1. **Periodic summarization**: Every week, summarize daily logs into weekly summaries. Every month, distill weeks into themes.

2. **Importance scoring**: Not all episodes matter equally. Score by:
   - User feedback (thumbs up/down)
   - Outcome success (did it solve the problem?)
   - Novelty (first time seeing this pattern)
   
   Delete or archive low-scoring episodes after 30 days.

3. **Semantic promotion**: When an episode pattern repeats 3+ times, promote it to semantic memory as a general rule.

Example:
- *Episode 1*: User prefers casual tone with emojis ✨  
- *Episode 2*: User asked to "keep it fun" 🎉  
- *Episode 3*: User gave positive feedback on witty response 😄  
- **→ Promote to semantic**: `response_style: "casual and witty with emojis"`

## Production Gotchas

**1. Episodic memory can lie**

Just because you stored "User loves TypeScript" doesn't mean it's still true. People change their minds. Solution: weight recent episodes higher in retrieval.

**2. Semantic memory gets stale**

That API endpoint you memorized? It changed three versions ago. Solution: timestamp facts and periodically validate against source of truth.

**3. Search quality matters more than storage**

A bad similarity search will retrieve irrelevant episodes, polluting your context. Invest in:
- Good embedding models (OpenAI `text-embedding-3-large` or better)
- Hybrid search (BM25 keyword + vector similarity)
- Reranking (use a reranker model to filter top-K results)

**4. Context window pressure**

You can't fit 500 episodes in your context. Strategy:
- Retrieve top-3 episodes max
- Summarize each episode to 2-3 sentences
- Include only when relevant (don't force-inject memory)

## When NOT to Use Episodic Memory

Sometimes semantic memory is enough:

- **Stateless tasks**: Code review bot that doesn't need history per user  
- **Shared knowledge**: Documentation chatbot where every user gets same answers  
- **Rapid prototypes**: If you're validating an idea, keep it simple

Episodic memory adds complexity. Only pay the cost when personalization or learning matters.

## The Future: Memory as First-Class Infrastructure

Right now, most teams build memory as an afterthought—bolted onto agents that were designed to be stateless. The next generation of agent frameworks will treat memory as infrastructure:

- **Automatic consolidation**: LLMs that periodically review their own episode logs and extract semantic rules
- **Multi-agent memory sharing**: Team of agents with shared semantic knowledge but private episodic history
- **Memory versioning**: Git for facts—track when beliefs changed and why
- **Hierarchical memory**: Short-term (this session), mid-term (this week), long-term (all time) with different storage/retrieval strategies

We're still in the early innings of figuring out agent memory architecture. The patterns above work for today's agents. Tomorrow's agents will remember better than we do.

## Key Takeaways

1. **Semantic memory** = facts you know. **Episodic memory** = experiences you've had. Agents need both.

2. **Storage follows structure**: Profiles/schemas for semantic, collections/logs for episodic.

3. **Hybrid retrieval wins**: Combine fast fact lookup with contextual episode search.

4. **Consolidation is mandatory**: Episodic memory grows forever. Plan your summarization strategy from day one.

5. **Search quality > storage size**: Better to retrieve 3 perfect episodes than 50 mediocre ones.

Your agent's memory architecture shapes its intelligence. A semantic-only agent is knowledgeable but generic. An episodic-only agent is personalized but unfocused. Combine them right, and you get an agent that knows **what** to do and **how** you like it done.

That's when agents start feeling less like tools and more like teammates.

---

**Further Reading**:
- [LangMem Conceptual Guide](https://langchain-ai.github.io/langmem/concepts/conceptual_guide/)
- [Position: Episodic Memory is the Missing Piece for Long-Term LLM Agents](https://arxiv.org/abs/2502.06975)
- [M2PA: Multi-Memory Planning Agent](https://aclanthology.org/2025.findings-acl.1191.pdf)
