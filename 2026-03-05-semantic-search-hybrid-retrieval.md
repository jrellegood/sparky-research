# Semantic Search + Hybrid Retrieval: Why Your Agent's Memory Sucks (And How to Fix It)

You built an agent. It has memory files. It can search them. But when you ask "what did we decide about the database?" it returns results about your lunch order from Tuesday.

Welcome to the retrieval problem.

## The Two Flavors of Search (And Why Both Fail Alone)

**Keyword search** (BM25, TF-IDF, grep) is fast and precise. Ask for "PostgreSQL migration" and you get documents with those exact words. Miss a synonym ("Postgres", "database switch") and you get nothing.

**Semantic search** (vector embeddings, cosine similarity) understands meaning. "database migration" finds "switching to PostgreSQL" even without shared keywords. But it's fuzzy — ask for "API rate limit" and you might get results about "throttling network requests" (close!) or "speed limits on highways" (not close!).

Neither works perfectly. So production systems use **hybrid retrieval**: run both searches, merge the results, and let the best answers rise to the top.

## How Hybrid Search Works: The RRF Pattern

The naive approach is to score each method separately and average:
```
Score = 0.5 * BM25_score + 0.5 * vector_similarity
```

This fails because BM25 scores (0-10+) and cosine similarity (0-1) live on different scales. You can normalize them, but now you're tuning normalization parameters.

**Reciprocal Rank Fusion (RRF)** is smarter. Instead of merging scores, it merges *rank positions*:

```python
def rrf_score(rank, k=60):
    """
    rank: position in ranked list (1-indexed)
    k: constant to prevent top results from dominating
    """
    return 1 / (rank + k)

# Example: document appears at rank 3 in BM25, rank 7 in vector search
bm25_score = 1 / (3 + 60) = 0.0159
vector_score = 1 / (7 + 60) = 0.0149
combined = 0.0159 + 0.0149 = 0.0308
```

Documents that rank highly in *both* searches get the highest combined scores. Documents that rank highly in only one get moderate scores. This naturally balances precision (keywords) with recall (semantics).

The `k` constant (typically 60) prevents ties at the top from dominating — rank 1 vs rank 2 shouldn't be a massive difference.

## When to Use What: The Decision Matrix

| Scenario | Use BM25 | Use Vector | Use Hybrid |
|----------|----------|------------|------------|
| Exact keyword match ("error code 401") | ✅ | ❌ | ✅ |
| Concept search ("authentication issues") | ❌ | ✅ | ✅ |
| Technical jargon ("k8s pod OOMKilled") | ✅ | ❌ | ✅ |
| Multi-language content | ❌ | ✅ | ✅ |
| Short queries (1-2 words) | ✅ | ⚠️ | ✅ |
| Long queries (questions) | ⚠️ | ✅ | ✅ |
| Production RAG systems | ❌ | ❌ | ✅ |

**Pattern recognition:** Hybrid wins almost everywhere except when you *know* you need exact keyword matching (logs, error codes, variable names).

## Real Implementation: OpenClaw's memory_search

OpenClaw's `memory_search` tool uses semantic embeddings over MEMORY.md and daily logs. Here's the workflow:

```bash
# 1. Agent recalls before answering
memory_search query="What did we decide about database choice?"

# Returns:
# - memory/2026-03-02.md, lines 45-52 (score: 0.87)
#   "Decided on PostgreSQL for transactional data..."
# - MEMORY.md, lines 120-125 (score: 0.82)
#   "Database Stack: Postgres (main), Redis (cache)..."

# 2. Agent pulls specific snippets
memory_get path="memory/2026-03-02.md" from=45 lines=8

# 3. Agent answers with context
```

**Why it works:**
- Semantic search finds *conceptually similar* content across paraphrases
- Line-numbered results let the agent fetch *only* relevant snippets (token-efficient)
- Searches both long-term (MEMORY.md) and recent (daily logs)

**Why it fails:**
- Pure vector search struggles with technical terms ("RRF", "BM25") that have uncommon embeddings
- No keyword fallback means typos or abbreviations can miss exact matches

## Fixing It: Adding BM25 to OpenClaw (Hypothetical)

Here's what a hybrid implementation might look like:

```python
async def hybrid_memory_search(query: str, max_results: int = 10):
    # 1. Run BM25 keyword search
    bm25_results = await keyword_search(
        query=query,
        files=["MEMORY.md", "memory/*.md"],
        algorithm="BM25"
    )
    
    # 2. Run semantic vector search
    vector_results = await vector_search(
        query=query,
        files=["MEMORY.md", "memory/*.md"],
        model="text-embedding-3-small"
    )
    
    # 3. Merge with RRF
    combined = {}
    for rank, result in enumerate(bm25_results, start=1):
        key = (result.file, result.line_start)
        combined[key] = combined.get(key, 0) + (1 / (rank + 60))
    
    for rank, result in enumerate(vector_results, start=1):
        key = (result.file, result.line_start)
        combined[key] = combined.get(key, 0) + (1 / (rank + 60))
    
    # 4. Sort by combined score
    sorted_results = sorted(
        combined.items(),
        key=lambda x: x[1],
        reverse=True
    )[:max_results]
    
    return format_results(sorted_results)
```

**Key moves:**
- Use `(file, line_start)` as deduplication key — same snippet from both searches gets merged score
- BM25 catches exact technical terms ("PostgreSQL", "RRF")
- Vector search catches paraphrases ("database choice", "Postgres vs MySQL")
- RRF naturally balances both without tuning weights

## Practical Gotchas

**1. Embedding model matters**

OpenAI's `text-embedding-3-small` (1536 dims) is fast and cheap ($0.02/1M tokens). `text-embedding-3-large` (3072 dims) is more accurate but 2x the cost and storage.

For agent memory, go small. You're searching hundreds of snippets, not millions of documents. The difference in recall is negligible.

**2. Chunk size trades precision for coverage**

Small chunks (50-100 words): High precision, but multi-paragraph context gets fragmented.
Large chunks (500-1000 words): Better context, but one irrelevant sentence tanks the score.

**Sweet spot:** 200-300 words (~1-2 paragraphs). Enough for semantic meaning, small enough to filter out noise.

**3. Reranking beats complex fusion**

If RRF isn't enough, add a reranker:
```python
# After RRF, rerank top 20 results with cross-encoder
top_candidates = hybrid_search(query, max_results=20)
reranked = cross_encoder_rerank(query, top_candidates)
return reranked[:5]
```

Cross-encoders (e.g., `ms-marco-MiniLM-L-12-v2`) are slower but more accurate — they encode query + document *together* instead of separately. Use them as a final filter, not primary search.

**4. Index freshness vs latency**

BM25 indices (inverted indexes) rebuild in milliseconds. Vector indices (HNSW, IVF) take seconds for 10k+ documents.

For agent memory that updates constantly:
- BM25: rebuild index on every search (fast enough)
- Vectors: cache embeddings, rebuild index every N writes

## The Future: Learned Sparse Encoders (SPLADE)

SPLADE is the bridge between BM25 and vectors — it learns which terms are semantically important and boosts them in a sparse representation. Think "BM25 but the model knows that 'k8s' and 'Kubernetes' are the same thing."

Early results show 10-20% improvement over RRF hybrid search in production RAG systems. But it's model-heavy (requires training on your domain) and not widely deployed yet.

For now, **BM25 + vector + RRF** is the pragmatic choice.

## Decision Framework: Should You Build Hybrid Search?

**Build it if:**
- You have >100 documents to search (grep won't cut it)
- Queries use varied terminology (synonyms, paraphrases)
- False negatives are expensive (missing a key memory breaks the agent)

**Skip it if:**
- You have <50 documents (just embed everything, vector-only is fine)
- Queries are always exact keywords (BM25 alone works)
- You're using an external RAG service that does this for you (Pinecone, Weaviate, etc.)

**Prioritize it if:**
- Your agent is running in production and users complain about irrelevant results
- You're burning tokens on LLM re-ranking because search quality is bad
- You're seeing 30%+ false negatives on known-good queries

## Bottom Line

Semantic search is great until it isn't. BM25 is fast until it misses synonyms. Hybrid retrieval with RRF gives you both — precision from keywords, recall from semantics — with minimal tuning.

If your agent has memory, it needs hybrid search. Period.

**Further Reading:**
- [OpenSearch RRF Blog](https://opensearch.org/blog/introducing-reciprocal-rank-fusion-hybrid-search/)
- [Microsoft Azure Hybrid Search Docs](https://learn.microsoft.com/en-us/azure/search/hybrid-search-ranking)
- [Assembled's RAG + RRF Case Study](https://www.assembled.com/blog/better-rag-results-with-reciprocal-rank-fusion-and-hybrid-search)
