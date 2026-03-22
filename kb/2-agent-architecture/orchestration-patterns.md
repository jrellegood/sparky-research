# Agent Orchestration and Design Patterns

---
**Metadata**
- Last Updated: 2026-03-22
- Primary References:
  - "LLMs as CPUs, Agents as Processes: Operating System Architecture" (Sparky Research, 2026-03-18)
  - "Four Emerging Agentic Patterns" (Sparky Research, 2026-03-21)
  - "Multi-Model Routing: Architecture Over Intelligence" (Sparky Research, 2026-03-22)
- Staleness Risk: **Low** (fresh content, production-focused)
- Next Review: 2026-06-22
---

## The Fundamental Architecture

**Agents are not models.** This is the first mistake most teams make. An LLM is a reasoning engine—a CPU that processes tokens and generates predictions. An agent is a **loop** wrapped around that engine, with state management, tool access, and termination logic.

Understanding this distinction is critical. When your agent fails, the problem is rarely "the model isn't smart enough." It's usually "the loop is poorly designed."

### The Minimal Agent Loop

Strip away all complexity and you get this:

```python
def agent_loop(task: str, max_iterations: int = 10):
    state = {"task": task, "history": [], "complete": False}
    
    for i in range(max_iterations):
        # 1. Reason: Ask LLM what to do next
        action = llm.generate(state)
        
        # 2. Act: Execute the action
        result = execute_action(action)
        
        # 3. Observe: Update state with results
        state["history"].append({"action": action, "result": result})
        
        # 4. Terminate: Check if we're done
        if should_terminate(state):
            state["complete"] = True
            break
    
    return state
```

Four components define every agent:
1. **LLM** - The reasoning engine
2. **Loop** - Iterative execution
3. **Tools** - Actions the agent can take
4. **Termination** - How the loop exits

Everything else—ReAct, Reflection, Planning, Multi-Agent orchestration—is about making this loop more robust, efficient, or capable.

## The LLM-as-CPU Analogy

| Computer Architecture | Agentic AI | Why It Matters |
|----------------------|------------|----------------|
| CPU | LLM | Processes instructions, but needs surrounding infrastructure |
| Process | Agent | Loop with state, tools, and termination logic |
| Operating System | Orchestration Layer | Schedules agents, manages state, enforces safety |
| Memory (RAM) | Context Window | Fast but limited working space |
| Disk Storage | Long-Term Memory | Persistent but requires retrieval |
| System Calls | Tool/Function Calls | Interface to external capabilities |
| Process Scheduler | Multi-Agent Router | Decides which agent runs when |

**The key insight:** Just as you wouldn't run a CPU without an OS, you shouldn't run an LLM without orchestration infrastructure. The orchestration layer provides:

- **State management**: External state that survives crashes
- **Observability**: Logging, metrics, debugging
- **Safety**: Sandboxing, validation, guardrails
- **Resilience**: Retry logic, fallback strategies, circuit breakers

## Established Design Patterns

### 1. ReAct (Reason + Act)

**Pattern:** Alternate between reasoning and acting. The agent thinks out loud before each action.

**Structure:**
```
Thought: I need to find the capital of France
Action: search("capital of France")
Observation: Paris is the capital of France
Thought: I found the answer, I can respond now
Action: finish("Paris")
```

**When to use:**
- Tasks requiring multi-step problem solving
- When you need an audit trail of reasoning
- Error debugging (reasoning steps show where logic failed)

**Production gotchas:**
- Token-heavy: 2-3x more tokens than direct generation
- Reasoning quality varies by model (GPT-4 > GPT-3.5 for complex tasks)
- Can hallucinate plausible-sounding but wrong reasoning

**Implementation tip:** Use structured prompts that force the "Thought:" prefix. Without it, models often skip reasoning and jump to action.

### 2. Reflection (Self-Critique Loop)

**Pattern:** After generating an output, critique it and regenerate. Repeat N times or until quality threshold met.

**Structure:**
```python
def reflect(task, max_rounds=3):
    output = generate(task)
    
    for i in range(max_rounds):
        critique = evaluate(output, task)
        if critique["quality"] > threshold:
            break
        output = regenerate(task, output, critique)
    
    return output
```

**When to use:**
- High-stakes outputs (code, legal text, medical advice)
- When cost of failure >> cost of iteration
- Tasks where quality improves with revision

**Cost analysis:**
- 3x tokens for typical 3-round reflection
- Quality gain: 10-20% improvement in most benchmarks
- Diminishing returns after 3 rounds

**When NOT to use:**
- Simple lookups or classification tasks
- Real-time latency requirements (<2s)
- Low-cost, high-volume scenarios

### 3. Planning (Think Before Acting)

**Pattern:** Decompose the task into subtasks before execution. Create a plan, then execute step-by-step.

**Two variants:**

**Plan-and-Execute (serial):**
```
1. Plan: Generate full task breakdown
2. Execute: Run each subtask sequentially
3. Adapt: Revise plan if a step fails
```

**ReWOO (Planner-Worker-Solver):**
```
1. Planner: Create task DAG with dependencies
2. Worker: Execute tasks in parallel where possible
3. Solver: Aggregate results into final answer
```

**When to use:**
- Complex tasks with clear subtask structure
- Multi-step workflows (e.g., research → summarize → email)
- When intermediate validation is critical

**Production gotchas:**
- Plans can be wrong—need adaptation logic
- Over-planning wastes tokens on unnecessary detail
- Parallel execution (ReWOO) requires careful dependency tracking

## Emerging Patterns (Production-Tested, Not Yet Standard)

### 4. Dry-Run Harness

**Pattern:** Simulate agent actions in a sandbox before executing in production. Validate outcomes, check for errors, optionally request human approval—then run for real.

**Architecture:**
```python
class DryRunHarness:
    def execute(self, action, dry_run=True):
        if dry_run:
            # Run in sandbox
            result = sandbox.simulate(action)
            
            # Validate expected outcomes
            if not self.validate(result):
                return {"status": "rejected", "reason": result.error}
            
            # Optional: Human approval gate
            if self.requires_approval(action):
                if not get_approval(action, result):
                    return {"status": "rejected", "reason": "user declined"}
            
            # Now run for real
            return sandbox.execute_production(action)
        else:
            return direct_execute(action)
```

**When to use:**
- High-stakes workflows (financial transactions, infrastructure changes)
- Code generation and execution
- External API mutations (POST/PUT/DELETE)

**Sandbox options:**
- **Docker containers**: Fast (~100ms overhead), good isolation
- **gVisor**: Stronger kernel isolation (~2x Docker overhead)
- **MicroVMs (Firecracker)**: VM-level security (~500ms-1s startup)

**Production gotcha:** State divergence between sandbox and production. Keep sandbox fresh through periodic sync.

**Graduation strategy:** As agent reliability improves (success rate >99%), selectively graduate certain action types to direct execution.

### 5. Blackboard Architecture

**Pattern:** Shared workspace where multiple agents contribute asynchronously without direct coordination. Agents read from and write to the blackboard; a control unit decides when to invoke which agent.

**Origins:** Revived from HEARSAY-II speech recognition system (1970s CMU). Originally used for combining phoneme recognition, syntax parsing, and semantic interpretation.

**Three components:**

1. **Blackboard (shared workspace):**
```python
class Blackboard:
    def __init__(self):
        self.data = {}  # Shared state
        self.locks = {}  # Concurrency control
    
    def read(self, key):
        return self.data.get(key)
    
    def write(self, key, value, agent_id):
        with self.locks.get(key, threading.Lock()):
            self.data[key] = {
                "value": value,
                "author": agent_id,
                "timestamp": time.time()
            }
```

2. **Agents (specialists):**
Each agent monitors the blackboard for relevant state changes, processes data, and writes results back.

```python
class SpecialistAgent:
    def should_activate(self, blackboard_state):
        # Check if this agent's expertise is needed
        pass
    
    def process(self, blackboard):
        # Read relevant data, do work, write results
        pass
```

3. **Control Unit (scheduler):**
Decides which agent to activate next based on blackboard state.

```python
class ControlUnit:
    def schedule(self, blackboard, agents):
        for agent in agents:
            if agent.should_activate(blackboard.data):
                agent.process(blackboard)
```

**When to use:**
- Loosely coupled multi-agent systems
- Asynchronous workflows (agents work at different speeds)
- Complex problems requiring diverse expertise

**When NOT to use:**
- Tightly coordinated workflows (use explicit orchestration)
- Real-time latency requirements (scheduling overhead)
- Simple sequential tasks (just use a pipeline)

**Production gotcha:** Blackboard can become a bottleneck. Use fine-grained locking (per-key) rather than global locks.

### 6. Meta-Controller Pattern

**Pattern:** Top-level orchestrator that routes tasks to specialized sub-agents. The meta-controller doesn't solve tasks—it decides which agent should.

**Three routing strategies:**

**Rule-based (deterministic):**
```python
def route(task):
    if "code" in task.lower():
        return CodeAgent()
    elif "math" in task.lower():
        return MathAgent()
    else:
        return GeneralAgent()
```

**LLM-based (flexible):**
```python
def route(task):
    routing_prompt = f"""
    Task: {task}
    Available agents: CodeAgent, MathAgent, ResearchAgent, GeneralAgent
    Which agent should handle this? Return JSON: {{"agent": "name", "reasoning": "why"}}
    """
    decision = llm.generate(routing_prompt)
    return get_agent(decision["agent"])
```

**Hybrid (fast + smart):**
```python
def route(task):
    # First pass: cheap classification
    category = classifier.predict(task)  # Fast ML classifier
    
    if category == "ambiguous":
        # Second pass: LLM-based routing for edge cases
        return llm_route(task)
    else:
        return rule_route(category)
```

**When to use:**
- 5+ specialized agents with distinct expertise
- Tasks naturally partition by domain (code/math/research/writing)
- Cost optimization (route simple tasks to cheaper agents)

**Production pattern:** Start with rule-based routing, upgrade to LLM-based for edge cases. Hybrid approach gives you 80% fast routing, 20% smart handling.

### 7. Reflexive Agent

**Pattern:** The agent decides in real-time whether to reason deeply (chain-of-thought) or act directly based on task complexity and confidence.

**Decision logic:**
```python
def execute(task):
    # Quick confidence check
    confidence = quick_classify(task)
    
    if confidence > 0.9:
        # Simple task, direct execution
        return llm.generate(task)
    elif confidence < 0.5:
        # Complex task, full reasoning
        return react_loop(task)
    else:
        # Middle ground: lightweight reasoning
        return one_shot_cot(task)
```

**Confidence strategies:**

1. **Embedding similarity:** Compare task to known-easy examples
2. **LLM self-assessment:** Ask model to rate task difficulty (cheap prompt)
3. **Keyword heuristics:** "What's 2+2?" vs "Prove the Riemann Hypothesis"

**When to use:**
- Mixed workloads (trivial + complex tasks)
- Cost optimization (avoid expensive reasoning for simple tasks)
- Latency-sensitive applications (fast path for easy tasks)

**Example impact:** A customer support bot routing 80% of "password reset" questions to direct answers, 20% of complex account issues to full reasoning → 60% token savings.

## Multi-Model Routing: Architecture Over Intelligence

**Core thesis:** Different models excel at different tasks. Production agents route to the right model for each step, not one expensive model for everything.

### Model Strengths Matrix

| Model | Best For | Cost | Speed |
|-------|----------|------|-------|
| GPT-4o / Claude 3.5 Opus | Complex reasoning, code generation, planning | High | Medium |
| Claude 3.5 Sonnet | Long context, summarization, narrative | Medium-High | Medium |
| GPT-4o-mini / Claude 3 Haiku | Simple lookups, classification, cheap routing | Low | Fast |
| DeepSeek-V3 / Qwen | Structured extraction, data transformation | Very Low | Fast |
| Mixtral / Mistral | Bulk tasks, entity recognition, validation | Low | Fast |

### Routing Strategies

**1. Static Routing (UI-driven):**
Different features/modules route to different models. Content generation UI → GPT-4. Data extraction UI → DeepSeek.

**Pros:** Simple, predictable
**Cons:** No adaptability

**2. Semantic Routing (embedding-based):**
Embed the task, compare to labeled examples, route based on nearest neighbor.

```python
def semantic_route(task):
    task_embedding = embed(task)
    nearest = find_nearest(task_embedding, labeled_examples)
    return MODEL_MAP[nearest.category]
```

**Pros:** Fast (<10ms), scalable
**Cons:** Limited to predefined categories

**3. LLM-Assisted Routing (classifier model):**
Use a cheap model to classify the task, route based on classification.

```python
def llm_route(task):
    classification = cheap_llm.classify(task)  # GPT-4o-mini
    if classification == "complex_reasoning":
        return GPT_4
    elif classification == "data_extraction":
        return DEEPSEEK
    else:
        return HAIKU
```

**Pros:** Nuanced decisions, handles novel tasks
**Cons:** Extra LLM call (50-100ms latency, minor cost)

**4. Hybrid Routing:**
Semantic routing for common cases, LLM fallback for ambiguous/novel tasks.

**Real-world example:** Research agent routing factual history questions to Haiku, complex math problems to Sonnet → **83% cost savings** with minimal quality loss.

### Performance-Based Routing

**Cost guards:**
```python
def route_with_budget(task, budget_remaining):
    if budget_remaining < 0.01:  # Low budget
        return CHEAP_MODEL
    elif task_complexity > 0.8:
        return EXPENSIVE_MODEL
    else:
        return MID_TIER_MODEL
```

**Latency thresholds:**
```python
def route_with_latency(task, max_latency_ms):
    if max_latency_ms < 500:
        return FAST_LOCAL_MODEL
    else:
        return CLOUD_MODEL
```

**Availability fallbacks:**
```python
def route_with_fallback(task, primary_model):
    try:
        return primary_model.generate(task, timeout=2)
    except TimeoutError:
        return fallback_model.generate(task)
```

## DAG-Based Orchestration (LangGraph Pattern)

**Pattern:** Represent workflows as directed acyclic graphs where nodes are functions (potentially different models) and edges are transitions.

**Example: Research workflow**
```
[Query Analysis] → [Web Search] → [Content Extraction]
                ↓                       ↓
            [Clarify]              [Summarize] → [Final Report]
                                        ↓
                                  [Fact Check]
```

Each node can route to a different model:
- Query Analysis → Claude 3 Haiku (cheap classification)
- Web Search → Tool call (no LLM)
- Content Extraction → DeepSeek-V3 (fast structured extraction)
- Summarize → Claude 3.5 Sonnet (long context handling)
- Fact Check → GPT-4o (high accuracy validation)

**Explicit failure paths:**
```python
graph = StateGraph()
graph.add_node("extract", extract_fn)
graph.add_node("validate", validate_fn)
graph.add_node("retry", retry_extraction)

graph.add_edge("extract", "validate")
graph.add_conditional_edges("validate", {
    "success": END,
    "failure": "retry"
})
```

**When to use:**
- Multi-step workflows with clear dependencies
- When different steps need different models
- When you need explicit retry/failure handling

## Orchestration Best Practices

### 1. External State Management

**Anti-pattern:** Storing state in-memory within the agent loop
**Why it fails:** Process crashes, debugging impossible, no recovery

**Production pattern:** External state in Redis/database
```python
class Agent:
    def __init__(self, state_store):
        self.state = state_store  # Redis/Postgres/etc
    
    def execute_step(self):
        current_state = self.state.get(self.task_id)
        # ... do work ...
        self.state.set(self.task_id, updated_state)
```

**Benefits:**
- Crash recovery: Resume from last checkpoint
- Debugging: Inspect state at any point in the loop
- Multi-agent coordination: Shared state visibility

### 2. Zero-Trust Execution

**Principle:** Validate every tool output, sandbox every execution, timeout every operation.

**Validation:**
```python
def execute_tool(tool_call):
    # 1. Validate schema
    if not validate_schema(tool_call):
        raise ValidationError("Invalid tool call format")
    
    # 2. Sandbox execution
    result = sandbox.run(tool_call, timeout=5)
    
    # 3. Validate output
    if not validate_output(result):
        raise ValidationError("Tool returned invalid output")
    
    return result
```

**Timeouts:**
- Tool calls: 5 seconds max
- LLM generation: 30 seconds max
- Total agent loop: Task-dependent (e.g., 5 minutes for research)

### 3. Observability

**Minimum viable observability:**
- **Logs:** Every LLM call (prompt + response + tokens + latency)
- **Metrics:** Token usage, cost, success rate, latency percentiles
- **Traces:** Execution path through the agent loop

**Example instrumentation:**
```python
@trace_agent_step
def execute_step(state):
    start = time.time()
    try:
        result = llm.generate(state)
        log_success(step="generate", tokens=result.tokens, latency=time.time() - start)
        return result
    except Exception as e:
        log_failure(step="generate", error=str(e))
        raise
```

**Key metrics to track:**
- **Token efficiency:** Useful work / total tokens
- **Success rate:** Completed tasks / attempted tasks
- **Mean time to failure:** How long until the agent gets stuck
- **Cost per task:** Total API cost / completed tasks

### 4. Termination Logic

**Why it matters:** Without robust termination, agents loop infinitely.

**Three termination strategies:**

**Max iterations (hard limit):**
```python
for i in range(max_iterations):
    # ... agent loop ...
    if i == max_iterations - 1:
        raise MaxIterationsError()
```

**Goal completion (task-specific):**
```python
if "FINAL_ANSWER:" in agent_output:
    return extract_answer(agent_output)
```

**Confidence threshold:**
```python
if agent.confidence > 0.95:
    return agent.output
elif iterations > 10:
    raise LowConfidenceError()
```

**Production pattern:** Combine all three. Max iterations as safety, goal completion as success, confidence as early exit.

## When to Use Multiple Agents

**Single-agent is usually enough.** Don't cargo-cult multi-agent just because it sounds sophisticated.

**Split into multiple agents when:**
- **>10 tools** - Single agent struggles with too many function signatures
- **Specialized contexts** - Math agent needs different prompts than code agent
- **Parallel execution** - Research + summarization can run concurrently
- **Isolation** - Untrusted code execution should be a separate agent

**Keep single agent when:**
- **<5 tools** - Single agent handles this fine
- **Sequential workflow** - No parallelism benefits
- **Shared context** - All steps need same background knowledge

## Production Failure Modes

### 1. Infinite Loops

**Cause:** Termination logic fails, agent never converges
**Example:** Agent searches → summarizes → re-searches same query

**Fix:**
- Hard iteration limit
- Detect repeated actions (if last 3 actions identical, abort)
- Confidence-based early exit

### 2. Tool Call Explosions

**Cause:** Agent calls every tool "just in case"
**Example:** "What's the weather?" → searches web, checks database, runs code

**Fix:**
- Explicit planning phase ("Which tools do I actually need?")
- Tool call budget (max 5 calls per task)
- Reflection ("Did I actually need that?")

### 3. State Corruption

**Cause:** Concurrent writes to shared state without locking
**Example:** Two agents update user preferences simultaneously

**Fix:**
- Optimistic locking with version numbers
- Per-key locks in shared state
- Event sourcing (append-only log)

### 4. Cost Runaway

**Cause:** Expensive operations in tight loops
**Example:** 3-round reflection with GPT-4 on every response

**Fix:**
- Budget guards (abort if cost > threshold)
- Model routing (use cheap models when possible)
- Cost attribution (track per-task spend)

### 5. Context Overflow

**Cause:** Stuffing too much history into context window
**Example:** Research agent includes 50 search results in next LLM call

**Fix:**
- Hierarchical summarization (see Memory Systems chapter)
- Selective context (only include relevant excerpts)
- Structured memory (extract facts, discard prose)

## Decision Framework: Which Pattern When?

| Scenario | Recommended Pattern | Why |
|----------|---------------------|-----|
| Simple lookup/classification | Direct LLM call | No orchestration overhead needed |
| Multi-step task, clear subtasks | Planning (Plan-and-Execute) | Explicit structure reduces errors |
| Complex reasoning, audit trail needed | ReAct | Transparency for debugging |
| High-stakes outputs | Reflection | Quality >> cost |
| Code generation/execution | Dry-Run Harness | Safety critical |
| Multi-agent with loose coupling | Blackboard | Decoupled coordination |
| Multi-agent with diverse expertise | Meta-Controller | Explicit routing |
| Mixed simple/complex workload | Reflexive Agent | Cost optimization |
| Multi-step with model specialization | DAG + Multi-Model Routing | Right tool for each job |

## The Meta-Lesson

**Start simple.** Most teams over-engineer their first agent. A minimal loop with good termination logic beats a complex orchestration system that no one understands.

**Add patterns incrementally:**
1. Start with direct LLM calls
2. Add basic loop when you need iteration
3. Add ReAct when you need reasoning transparency
4. Add planning when subtask structure is clear
5. Add reflection when quality matters more than cost
6. Add multi-agent when single agent is overloaded

**Measure before optimizing:**
- Track token usage per task
- Measure success rate
- Log where agents get stuck
- Monitor cost trends

**Architecture beats intelligence.** A well-designed agent loop with a smaller model often outperforms a massive model with no orchestration.

Your agent is a system, not a prompt. Design it like one.

---

**Next:** [Multi-Agent Systems](multi-agent.md) *(coming soon)*
**Related:** [Memory Systems](memory-systems.md) | [Tool Use](tool-use.md) *(planned)*
