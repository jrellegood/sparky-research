# LangGraph vs Temporal vs Custom Orchestrators: The 2026 Decision Matrix

*"Orchestration is what turns a talented freelancer into a reliable workflow engine."*

When your AI agent demo works 80% of the time, it feels like success. When your production agent fails 20% of the time, it's a disaster. The difference isn't prompt engineering—it's orchestration. The architecture that coordinates what your agent does, in what order, with what error handling, and how it recovers when things go wrong.

By March 2026, the agent orchestration landscape has crystallized around three viable approaches: **LangGraph** (graph-based state machines), **Temporal** (durable workflow engine), and **custom orchestrators** (roll-your-own control). Each excels at different tasks. The choice matters more than your model choice.

## Why Orchestration Beats Prompt Engineering

Consider a straightforward production task: "Process a customer refund for order #12345."

**Without orchestration**, your agent calls tools in whatever order the LLM decides:
- Sometimes it works perfectly
- Sometimes it processes the refund before checking eligibility
- Sometimes it retries a failed API call 47 times in a row
- Sometimes it forgets the confirmation email entirely
- Sometimes it charges the customer twice while investigating

**With proper orchestration**:
```
verify_identity → check_eligibility → [approve if > $100] → process_refund → send_confirmation
     ↓                  ↓                      ↓                   ↓
 retry 2x         if ineligible         timeout 5min        retry 3x
                  then escalate         → escalate       then log error
                  → explain why
```

Every step has defined behavior, retry policies, timeout limits, and failure transitions. The workflow is testable, debuggable, and recoverable. LLMs handle the content; orchestration handles the control flow.

Gartner predicts 40% of enterprise applications will embed agentic capabilities by end of 2026 (up from 12% in 2025). But their other finding matters more: **40% of agentic AI projects will be canceled by 2027** due to unreliable execution and unclear value. Most demos work. Most production systems fail. Orchestration is the difference.

## The Three Viable Architectures

### 1. LangGraph: Graph-Based State Machines

**Mental model:** Your agent is a flowchart where boxes are actions and arrows are conditional transitions.

LangGraph represents workflows as directed cyclic graphs. Nodes execute logic, edges define transitions, and state flows through the graph. It can loop back for refinement, branch into parallel paths, or pause indefinitely for human approval.

**Core primitives:**
- **State schema:** Typed dictionary with reducer functions (accumulate vs overwrite)
- **Nodes:** Functions that read state, do work, update state
- **Edges:** Unconditional (A always → B) or conditional (router functions)
- **Checkpointing:** Persist state at every step for recovery and debugging

**Minimal example:**
```python
from langgraph.graph import StateGraph, END
from typing import TypedDict, Literal

class AgentState(TypedDict):
    messages: list
    intent: str
    customer_id: str | None
    order: dict | None
    should_escalate: bool

async def classify_intent(state: AgentState) -> AgentState:
    intent = await llm.classify(state["messages"][-1])
    return {"intent": intent}

async def authenticate(state: AgentState) -> AgentState:
    customer = await lookup_customer(state["messages"])
    return {"customer_id": customer["id"] if customer else None}

def route_after_classify(state: AgentState) -> Literal["authenticate", "respond", "escalate"]:
    if state["intent"] in ["order_status", "refund"]:
        return "authenticate"
    if state["intent"] == "general_question":
        return "respond"
    return "escalate"

graph = StateGraph(AgentState)
graph.add_node("classify", classify_intent)
graph.add_node("authenticate", authenticate)
graph.add_conditional_edges("classify", route_after_classify)
graph.set_entry_point("classify")

# Checkpointing for durability
from langgraph.checkpoint.postgres import PostgresSaver
checkpointer = PostgresSaver.from_conn_string("postgresql://...")
app = graph.compile(checkpointer=checkpointer)
```

**Human-in-the-loop with interrupt():**
```python
from langgraph.types import interrupt, Command

async def request_approval(state: AgentState):
    if state["order"]["amount"] > 10000:  # > $100 refund
        approval = interrupt({
            "question": "Approve this refund?",
            "proposed_action": state["proposed_action"],
            "context": state["order"]
        })
        return Command(update={"approval_status": approval})
    return state

# Graph pauses here until human responds via API
```

**When LangGraph wins:**
- Complex branching logic (conditional transitions based on runtime state)
- Human-in-the-loop workflows (approval gates, clarification loops)
- Debugging complex workflows (checkpoint replay, state inspection)
- Streaming output (real-time progress updates to users)
- Teams already using LangChain ecosystem

**When LangGraph loses:**
- Simple linear pipelines (3-5 steps, no branching)
- Workflows <5 minutes (checkpointing overhead for short tasks)
- Cost-sensitive prototypes (adds 15-20% token overhead for state management)
- Teams without Python expertise (LangGraph is Python-only)

**Production gotchas:**
- State schema evolution requires migration scripts
- Postgres checkpointer needs connection pooling for scale
- Graph visualization breaks for >20 nodes
- Error messages are cryptic for circular dependencies
- Interrupt payloads must be JSON-serializable (no arbitrary objects)

### 2. Temporal: Durable Workflow Orchestration

**Mental model:** Your agent is a distributed system that must survive crashes, deploys, and outages.

Temporal is a workflow engine originally built for Uber's microservices. It's overkill for simple agents but essential for **mission-critical, long-running workflows** that cannot lose state. When your workflow spans hours/days, involves multiple services, and failure means financial loss, Temporal is the answer.

**Core primitives:**
- **Workflows:** Durable code that survives process crashes
- **Activities:** Individual steps with retry/timeout policies
- **Signals:** Send messages to running workflows (pause, resume, update)
- **Queries:** Inspect running workflow state without modifying it
- **Timers:** Sleep for hours/days without holding resources

**Example: Research report agent:**
```python
from temporalio import workflow, activity
from datetime import timedelta

@activity.defn
async def search_web(query: str) -> list[str]:
    """Search and return top URLs."""
    return await web_search_tool.search(query, top_k=10)

@activity.defn
async def scrape_page(url: str) -> str:
    """Scrape and extract content."""
    return await scraper.extract(url)

@activity.defn
async def analyze_content(content: str, question: str) -> dict:
    """LLM analysis of scraped content."""
    return await llm.analyze(content, question)

@workflow.defn
class ResearchWorkflow:
    @workflow.run
    async def run(self, topic: str) -> str:
        # Step 1: Search (with retry)
        urls = await workflow.execute_activity(
            search_web,
            topic,
            start_to_close_timeout=timedelta(seconds=30),
            retry_policy=RetryPolicy(maximum_attempts=3)
        )
        
        # Step 2: Scrape in parallel
        scrape_tasks = [
            workflow.execute_activity(
                scrape_page,
                url,
                start_to_close_timeout=timedelta(seconds=60),
                retry_policy=RetryPolicy(maximum_attempts=2)
            )
            for url in urls[:5]
        ]
        contents = await asyncio.gather(*scrape_tasks, return_exceptions=True)
        contents = [c for c in contents if isinstance(c, str)]
        
        # Step 3: Analyze each source
        findings = []
        for content in contents:
            finding = await workflow.execute_activity(
                analyze_content,
                args=[content, topic],
                start_to_close_timeout=timedelta(seconds=120)
            )
            findings.append(finding)
        
        # Step 4: Write report
        report = await workflow.execute_activity(
            write_report,
            args=[findings, topic],
            start_to_close_timeout=timedelta(seconds=180)
        )
        
        return report
```

**Durability in action:**
- Server crashes during step 2? Temporal replays from step 1 and resumes.
- Deploy new code mid-workflow? Temporal version-migrates safely.
- Activity timeout? Retry policy kicks in automatically.
- Need to query progress? Call `workflow.query()` for real-time state.

**When Temporal wins:**
- Long-running workflows (hours to days)
- Mission-critical systems (financial transactions, compliance, healthcare)
- Multi-service orchestration (coordinating microservices)
- Crash recovery requirements (cannot lose state, ever)
- Polyglot teams (Python, Go, Java, TypeScript supported)

**When Temporal loses:**
- Simple agents (<5 minute execution)
- Prototypes and MVPs (infrastructure overhead too high)
- Single-process applications (Temporal requires server + database)
- Cost-sensitive deployments (adds 50-100ms latency per activity)
- Teams without DevOps resources (complex to operate)

**Production gotchas:**
- Requires Temporal server cluster (self-hosted or Temporal Cloud)
- Activity functions must be idempotent (replays call them multiple times)
- Workflow code must be deterministic (no random(), time.now(), etc.)
- Event history grows unbounded without `ContinueAsNew`
- Adds 50-100ms latency per activity call (network roundtrip)

### 3. Custom Orchestrator: Full Control, Zero Dependencies

**Mental model:** You're building your own event loop with explicit control flow.

When frameworks add more complexity than value, a custom orchestrator gives you full control with minimal overhead. It's not "reinventing the wheel"—it's choosing the right level of abstraction for your problem.

**Minimal production-ready implementation:**
```python
import asyncio
from dataclasses import dataclass, field
from enum import Enum

class StepStatus(Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"

@dataclass
class Step:
    name: str
    fn: callable
    depends_on: list[str] = field(default_factory=list)
    retry_count: int = 2
    timeout_seconds: int = 60
    condition: callable = None  # Skip if returns False
    status: StepStatus = StepStatus.PENDING
    result: any = None
    error: str = None

class Orchestrator:
    def __init__(self):
        self.steps: dict[str, Step] = {}
        self.context: dict = {}
    
    def add_step(self, step: Step):
        self.steps[step.name] = step
    
    async def run(self) -> dict:
        while self._has_pending_steps():
            # Find steps ready to run
            ready = [
                s for s in self.steps.values()
                if s.status == StepStatus.PENDING
                and self._dependencies_met(s)
            ]
            
            if not ready:
                break  # Deadlock or done
            
            # Run ready steps in parallel
            await asyncio.gather(*[self._execute_step(s) for s in ready])
        
        return self.context
    
    async def _execute_step(self, step: Step):
        # Check condition
        if step.condition and not step.condition(self.context):
            step.status = StepStatus.SKIPPED
            return
        
        step.status = StepStatus.RUNNING
        
        for attempt in range(step.retry_count + 1):
            try:
                result = await asyncio.wait_for(
                    step.fn(self.context),
                    timeout=step.timeout_seconds
                )
                step.result = result
                step.status = StepStatus.COMPLETED
                self.context[step.name] = result
                return
            except asyncio.TimeoutError:
                step.error = f"Timeout after {step.timeout_seconds}s"
            except Exception as e:
                step.error = str(e)
            
            if attempt < step.retry_count:
                await asyncio.sleep(2 ** attempt)  # Exponential backoff
        
        step.status = StepStatus.FAILED
    
    def _dependencies_met(self, step: Step) -> bool:
        return all(
            self.steps[dep].status == StepStatus.COMPLETED
            for dep in step.depends_on
        )
    
    def _has_pending_steps(self) -> bool:
        return any(s.status == StepStatus.PENDING for s in self.steps.values())

# Usage
orch = Orchestrator()
orch.add_step(Step("classify", classify_intent))
orch.add_step(Step(
    "authenticate",
    authenticate,
    depends_on=["classify"],
    condition=lambda ctx: ctx["classify"]["requires_auth"]
))
orch.add_step(Step("lookup", lookup_order, depends_on=["authenticate"]))
orch.add_step(Step("respond", generate_response, depends_on=["lookup"]))

result = await orch.run()
```

**When custom orchestrators win:**
- Workflows with <10 steps and simple dependencies
- Performance-critical paths (no framework overhead)
- Unique control flow that frameworks don't support
- Teams that own their infrastructure end-to-end
- Cost-sensitive deployments (minimal dependencies)

**When custom orchestrators lose:**
- Complex human-in-the-loop workflows (pause/resume is hard)
- Multi-hour workflows (no built-in persistence)
- Teams without distributed systems expertise (easy to get wrong)
- Debugging needs (no built-in observability/replay)

**Production gotchas:**
- Parallel execution logic is tricky to get right (deadlocks, race conditions)
- No automatic retry with backoff (you implement it)
- No state persistence (crashes lose all progress)
- No observability without instrumentation (add logging yourself)
- Grows complex over time (consider refactoring to framework at ~20 steps)

## The 2026 Decision Matrix

| Scenario | Best Choice | Why |
|----------|-------------|-----|
| Simple agent (3-5 linear steps) | **Custom or ReAct** | Frameworks add unnecessary complexity |
| Complex branching (>5 conditional paths) | **LangGraph** | Graph model makes logic explicit |
| Long-running (hours/days) | **Temporal** | Durable execution survives crashes |
| Human approval workflows | **LangGraph or Temporal** | Both have native interrupt/signal support |
| Mission-critical / financial | **Temporal** | Battle-tested by Uber, Netflix, Snap |
| Maximum flexibility | **Custom** | No framework constraints |
| Team already uses LangChain | **LangGraph** | Ecosystem integration |
| Polyglot codebase | **Temporal** | Supports Python, Go, Java, TypeScript |
| Streaming progress to UI | **LangGraph** | Built-in streaming support |
| Cost-sensitive prototype | **Custom** | Minimal overhead |

## Real-World Production Patterns

### Pattern 1: Hybrid Architecture

Most production systems combine approaches. Use Temporal for **cross-service coordination** at the top level, LangGraph for **AI-specific branching** in leaf nodes, and custom logic for **performance-critical paths**.

**Example: Customer support orchestration**
```
Temporal Workflow (top-level)
├─ Activity: Route to queue
├─ Activity: Authenticate customer (custom code, <50ms)
├─ Activity: Delegate to AI agent (LangGraph)
│   └─ Graph: classify → retrieve context → generate response → validate
├─ Activity: Log to compliance DB
└─ Activity: Update CRM
```

Temporal handles durability and service coordination. LangGraph handles AI-specific logic with checkpointing. Custom authentication code avoids framework overhead for hot path.

### Pattern 2: Cost-Optimized LangGraph

LangGraph's checkpointing adds 15-20% token overhead. Optimize by:
- **Selective checkpointing:** Only persist at human-in-the-loop gates, not every step
- **State pruning:** Drop intermediate results after they're consumed
- **Cheap models for routing:** Use Haiku/GPT-4o-mini for conditional edges

```python
# Checkpoint only at approval gates
graph = StateGraph(
    AgentState,
    checkpointer=checkpointer,
    interrupt_before=["human_approval"]  # Only checkpoint here
)

# Cheap model for routing decisions
router_llm = ChatAnthropic(model="claude-3-5-haiku-20241022")
synthesis_llm = ChatAnthropic(model="claude-sonnet-4-20250514")
```

### Pattern 3: Temporal for Batch Jobs

Use Temporal for overnight batch processing where durability matters more than latency.

```python
@workflow.defn
class NightlyReportWorkflow:
    @workflow.run
    async def run(self, date: str) -> str:
        # Step 1: Extract data (can take 2 hours)
        data = await workflow.execute_activity(
            extract_data,
            date,
            start_to_close_timeout=timedelta(hours=3),
            heartbeat_timeout=timedelta(minutes=5)  # Detect stuck jobs
        )
        
        # Step 2: Transform (parallel processing)
        tasks = [
            workflow.execute_activity(transform_chunk, chunk)
            for chunk in data.chunks
        ]
        transformed = await asyncio.gather(*tasks)
        
        # Step 3: Generate report
        report = await workflow.execute_activity(
            generate_report,
            transformed,
            start_to_close_timeout=timedelta(hours=1)
        )
        
        # Step 4: Email stakeholders
        await workflow.execute_activity(email_report, report)
        
        return report.summary
```

If the server crashes at 3 AM during step 2, Temporal resumes from step 1 automatically. No lost work.

## Common Orchestration Mistakes

### Mistake 1: Over-Orchestrating Simple Tasks

If your agent has 3 sequential steps with no branching, you don't need LangGraph or Temporal. A simple ReAct loop with tool calling is fine.

**Bad:** Using LangGraph for "search → summarize → respond"
**Good:** ReAct loop with three tools

Add orchestration when complexity justifies it (>5 conditional branches, human-in-the-loop, multi-hour workflows).

### Mistake 2: No Timeout Budget

LLM calls hang. API calls timeout. Without per-step timeouts, your workflow hangs forever.

**LangGraph:**
```python
# Add timeouts to node functions
async def expensive_node(state):
    async with timeout(120):  # 2 minute limit
        return await llm.invoke(...)
```

**Temporal:**
```python
# Built-in timeout support
await workflow.execute_activity(
    expensive_task,
    start_to_close_timeout=timedelta(minutes=2)
)
```

**Custom:**
```python
# Use asyncio.wait_for
result = await asyncio.wait_for(
    step.fn(context),
    timeout=step.timeout_seconds
)
```

### Mistake 3: No Error Boundaries

A failure in step 4 shouldn't crash the entire workflow. Each step needs retry policy, fallback behavior, and graceful degradation.

**Example: Retry with fallback**
```python
async def fetch_data_with_fallback(state):
    try:
        return await primary_api.fetch()
    except Exception as e:
        logger.warning(f"Primary API failed: {e}")
        try:
            return await secondary_api.fetch()
        except Exception as e2:
            logger.error(f"Secondary API failed: {e2}")
            return {"data": [], "source": "fallback", "error": str(e2)}
```

### Mistake 4: Ignoring Observability

Production orchestrators without structured logging are impossible to debug.

**Minimum viable observability:**
- Log every step entry/exit with timing
- Structured JSON logs (not plain text)
- Correlation IDs across services
- Error traces with full context

```python
import structlog

logger = structlog.get_logger()

async def orchestrate():
    request_id = uuid.uuid4()
    logger.info("workflow_start", request_id=request_id, workflow="research")
    
    for step in steps:
        logger.info("step_start", request_id=request_id, step=step.name)
        try:
            result = await step.fn()
            logger.info("step_complete", request_id=request_id, step=step.name, duration_ms=...)
        except Exception as e:
            logger.error("step_failed", request_id=request_id, step=step.name, error=str(e))
            raise
```

## The Uncomfortable Truth

Most teams pick LangGraph because it's popular, not because it fits their problem. Most LangGraph deployments could be replaced with 100 lines of custom orchestration code.

**Use LangGraph when:**
- Your workflow has >5 conditional branches
- You need human-in-the-loop with pause/resume
- Debugging requires state replay
- Your team already owns LangChain infrastructure

**Use Temporal when:**
- Your workflow runs >1 hour
- Crash recovery is non-negotiable
- You're coordinating multiple services
- You have DevOps resources to operate it

**Use custom orchestration when:**
- Your workflow is <10 steps
- Performance is critical
- You own your infrastructure
- Frameworks feel like overkill

The best architecture is the simplest one that meets your requirements. Start simple. Add complexity only when proven necessary by real production failures.

## Further Reading

- **LangGraph Documentation:** https://langchain-ai.github.io/langgraph/
- **Temporal Documentation:** https://docs.temporal.io/
- **OpenAI Agents SDK + Temporal Integration:** https://temporal.io/blog/announcing-openai-agents-sdk-integration
- **Agentic AI Orchestration Patterns (2026):** https://dev.to/paxrel/ai-agent-orchestration-langgraph-temporal-amp-custom-workflows-2026-guide-4p9n
- **Why 40% of Agentic AI Projects Fail:** https://www.gartner.com/en/newsroom/press-releases/2025-06-25-gartner-predicts-over-40-percent-of-agentic-ai-projects-will-be-canceled-by-end-of-2027

---

*Most agents fail in production not because of bad prompts, but because of missing orchestration. Choose your architecture based on your workflow's actual needs, not framework popularity. The simplest solution that handles your error cases is the right solution.*
