# Planning & Task Decomposition: Why Your Agent Fails at Complex Goals (And How to Fix It)

**March 23, 2026** | *Agentic Systems Architecture*

Your agent can answer questions, call tools, and synthesize results in a single step. Great. But what happens when you give it a goal that requires ten steps, some of which depend on the outcomes of earlier ones, and the path to success isn't obvious at the start?

It breaks. Not because the model is bad, but because **single-step reasoning doesn't scale to multi-step goals**. The agent commits to an approach too early, gets stuck when something unexpected happens, or loses track of the overall goal in a tangle of sub-problems.

The solution: **planning**. Not "make a to-do list and hope for the best" planning, but structured goal decomposition that turns intractable problems into sequences of manageable subtasks, each solvable by a focused LLM call, a tool invocation, or a combination of both.

This article covers what planning actually means for LLM agents (hint: it's not STRIPS), how task decomposition works, which architectures exist, and when to use each one. Code-heavy, production-focused, opinionated.

---

## What Planning Means (Not What You Think)

Classical AI planning means finding a sequence of actions that transforms an initial state into a goal state. Systems like STRIPS define actions with explicit preconditions and effects, then search through state space for a valid path. This works beautifully when the world is fully observable and the action space is small (robotics with a few dozen states).

It breaks down for real-world agent tasks. Planning how to complete a software engineering task involving hundreds of files and unbounded possible code changes? The state space is enormous. Classical planning becomes computationally intractable.

**LLM-based planning takes a different approach**: the language model itself acts as the planner, leveraging its broad knowledge to generate plausible action sequences in natural language. The planner doesn't search exhaustively—it generates a reasonable plan based on its training distribution, then adapts as execution reveals new information.

This is closer to how humans plan. You don't enumerate all possible routes from your apartment to a meeting before leaving. You recall roughly how to get there, start walking, and adjust when you encounter a closed street or unexpected construction.

### Planning vs ReAct: The Key Difference

**ReAct agents think one step ahead**: reason about what to do next, act, observe the result, repeat.

**Planning agents think many steps ahead**: consider the full structure of the task before committing to any action, identify which steps can be parallelized and which must be sequential, maintain a representation of the overall goal throughout execution.

The ReAct loop is **reactive**. The planning loop is **anticipatory**.

This matters for three reasons:

1. **Global constraints**: Some tasks have constraints that only become visible when you look at the whole problem at once. Booking a trip that satisfies flight, hotel, and calendar constraints simultaneously is hard to handle step-by-step. A ReAct agent might book a flight, then discover no hotel is available at the destination on those dates, and have to restart. A planning agent checks availability across all dimensions before committing.

2. **Reduced redundancy**: Planning orders steps to avoid re-doing computations. If three research questions all require the same source document, the planner retrieves it once and passes it to all three questions (rather than fetching it three times).

3. **Recovery scaffolding**: When step four fails, the planner knows what steps three and five are and can reason about how to get back on track. A reactive agent has no pre-existing structure to repair.

### The Commitment-Flexibility Spectrum

Planning capability exists on a spectrum:

- **Pure reaction**: Decide what to do based only on the immediate observation, no representation of future steps.
- **Full symbolic planning**: Construct a complete, verified action sequence before taking any action.

LLM-based agents occupy the middle. Different architectures sit at different positions. Most production systems combine **some upfront deliberation with ongoing adaptation**.

The tradeoff: commit too much upfront and the agent becomes brittle when the environment deviates from assumptions. Commit too little and planning provides no benefit over pure reaction.

---

## Task Decomposition: Breaking Down the Problem

The foundation of planning is **decomposition**: breaking a complex goal into simpler subgoals that are individually tractable.

A bad decomposition cannot be rescued by a good executor. It produces failures that look like execution problems but are actually planning problems.

### Why Decomposition Matters

Decomposition makes the structure of the problem explicit. An agent that has decomposed "write a research report on climate change" into:

1. Gather sources
2. Extract key findings
3. Organize by theme
4. Write the report

...has a **shared vocabulary** for discussing what needs to happen, a **framework for monitoring progress**, and a **scaffold for recovery** if any piece goes wrong.

Without decomposition, failure is monolithic: either the whole task succeeds or it fails. With decomposition, failure is local: one subtask fails, the rest of the structure remains intact.

### Hierarchical Decomposition

Goals naturally form hierarchies. "Write a research report on climate change" decomposes into:

- Gather sources → Search academic databases, search news archives, identify expert opinions
- Extract key findings → For each source, summarize key claims and evidence
- Organize by theme → Cluster findings by topic (causes, effects, solutions)
- Write the report → Draft intro, body sections, conclusion

At the bottom are **leaf tasks** that correspond to concrete actions: run a search query, fetch a URL, extract text from a document.

Hierarchical decomposition has a critical property: **the planner can reason at the appropriate level of abstraction for each decision**. High-level sequencing decisions don't need low-level implementation details. Low-level execution doesn't need strategic reasoning.

When you're writing the "gather sources" phase, you don't need to think about how you'll format the final report. When you're formatting the report, you don't need to remember exactly how you ran each database query.

**The challenge**: knowing when to stop. Decompose too deeply → hundreds of trivially small steps with coordination overhead. Decompose too shallowly → vague instructions the executor can't act on.

A search step that says "search for relevant sources" is too vague. "Search Google Scholar for papers on climate feedback loops published after 2020" is appropriately specific.

### Sequential vs Parallel Decomposition

Not all subtasks need to be completed in order. Understanding which tasks are independent enables parallelism that dramatically reduces wall-clock time.

**Sequential dependency**: The output of one task is the input to another. Searching for documents must precede summarizing them. No amount of parallel execution can change this.

**Independent tasks**: Can be run in any order or simultaneously. Searching three different databases for background doesn't require the first search to complete before the second begins. A parallelized planner dispatches all three searches at once and waits for all results before proceeding.

**The gotcha**: Identifying independence correctly is non-trivial for LLMs. Errors in either direction are costly:

- Wrongly treat sequential as parallel → try to use outputs before they exist (errors/hallucinations)
- Wrongly treat parallel as sequential → waste time running them one after another

In practice, LLMs tend to be conservative, defaulting to sequential orderings even when parallelism would be safe. **Explicit prompting to reason about data dependencies** before assigning step orderings significantly improves parallelism detection.

Also note: parallelism is only useful in multi-agent or multi-threaded execution environments. A single-threaded agent gains nothing from identifying parallel steps during execution (though it can be confident it's not missing a dependency when it runs them sequentially).

### Decomposition Strategies

Several prompting-based decomposition strategies have emerged:

**1. Chain-of-thought decomposition**: Instruct the model to think step-by-step before acting. The model writes out a sequence of steps, and this becomes the plan. Simple, works well for straightforward tasks. Weakness: doesn't force reasoning about dependencies or parallelism.

**2. Least-to-most prompting**: Ask the model "what's the easiest sub-problem to solve?" → solve it → ask "what's the next easiest problem given the previous solution?" Builds up a plan from the bottom. Useful when earlier steps unlock knowledge that changes how later steps should be formulated.

**3. Divide-and-conquer decomposition**: Split the problem into roughly equal halves, solve each independently, combine results. Natural for tasks with symmetry (comparing two large documents) or when the input exceeds the context window.

**4. Goal decomposition (backward-chaining)**: Ask the model to list preconditions of the goal → identify what actions establish those preconditions → recurse. Maps closely to classical planning. Effective for tasks with clear prerequisite structures. Example: "publish a blog post" has preconditions "have a written draft" and "have an approved title", each with their own preconditions.

**5. Plan-sketch refinement**: Produce a rough outline first, then refine each outline item into an executable step. Two-pass approach trades one additional LLM call for substantially more coherent plans. The first pass establishes global structure, the second fills in details consistent with that structure. Lower risk of local incoherence (where individual steps are fine but don't fit together).

### What Makes a Good Decomposition

Beyond the specific strategy, a good decomposition shares these characteristics:

**Complete**: Every step needed to achieve the goal is present, with no implicit assumptions that would require the executor to figure out something the plan didn't specify.

**Non-redundant**: No step repeats work done by an earlier step. If step two already retrieves a source document, step five shouldn't retrieve it again.

**Well-specified interfaces**: Each step's output is defined clearly enough that the next step can use it without guessing. "Search for information about X" has an unclear output. "Search for information about X and return the three most relevant passages" has a clear one.

**Appropriately granular**: Steps are neither so large that they require the executor to make sub-decisions that should be in the plan, nor so small that coordination overhead dominates the work.

---

## Goal-Directed Planning Architectures

Several architectures exist for LLM-based planning. They differ in how much reasoning is done upfront vs during execution, how the plan is represented, and how failures are handled.

The fundamental tradeoff: **commitment vs flexibility**. An architecture that commits fully to a plan before execution is efficient when the plan is correct but fragile when it's not. An architecture that reasons dynamically during execution can adapt to surprises but pays a higher per-step reasoning cost.

No single architecture dominates across all task types. Understanding when each is appropriate is critical.

### 1. Plan-and-Execute

The simplest architecture: separate planning from execution into two distinct phases.

**Planning phase**: The model receives the goal and generates a complete plan (a numbered list of steps).

**Execution phase**: Each step is executed in order by an agent with access to tools. The executor doesn't revise the plan—it simply follows it.

**Strengths**:
- Clear separation of concerns: planner reasons about structure, executor focuses on implementation
- Can use different models: large expensive model for planning, smaller cheaper model for execution (practical cost optimization)

**Weaknesses**:
- **Brittleness**: Plans generated upfront can't anticipate every contingency. When step three fails, the executor has no mechanism to adapt. The plan either fails or the system falls back to replanning from scratch (expensive).

**When to use**: Tasks with high predictability—steps are known before execution, tool behavior is reliable, environment is stable.

### 2. ReWOO (Reasoning Without Observation)

ReWOO extends plan-and-execute by making dependencies between steps explicit. Instead of just listing steps, the planner writes **variable names** that represent the outputs of earlier steps, which later steps can reference.

Example:
```
Step 1: Search for the population of France. Result: #E1
Step 2: Search for the GDP of France. Result: #E2
Step 3: Calculate GDP per capita using #E1 and #E2. Result: #E3
```

The planner knows from the start that step three depends on steps one and two. The executor runs steps one and two (possibly **in parallel**, since they're independent), collects their results, substitutes them for the variable references in step three, and executes step three with concrete values.

**Strengths**:
- Makes dependencies explicit
- Enables safe parallelism: steps that share no variable dependencies can run concurrently
- Efficient: planner generates entire plan upfront, executor never needs to call the planner again

**Weaknesses**:
- Same as plan-and-execute: planner can't adapt to surprising intermediate results because it committed to the plan structure before seeing any observations

**When to use**: Structured research and Q&A tasks where the information retrieval pattern is predictable and intermediate results flow clearly from one step to the next. Less effective when the plan structure itself depends on what intermediate results look like (e.g., a search might return zero results and the appropriate follow-up query depends on what was or wasn't found).

### 3. Tree-of-Thought Planning

Tree-of-Thought (ToT) treats planning as a search problem over a tree of reasoning states. Rather than committing to a single linear plan, the model explores **multiple branching possibilities simultaneously**.

At each decision point:
1. Model generates several candidate next steps
2. Evaluates each candidate (self-evaluation prompts or external verifier)
3. Expands the most promising branches

This is **significantly more expensive** than linear planning (each node may require multiple model calls), but also **more robust**: dead ends are abandoned before they consume execution resources, and the best path through the problem space is found even when the first plausible path turns out to be wrong.

**Search strategies**:
- **Breadth-first**: Explore all nodes at depth d before advancing to depth d+1 (thorough but requires maintaining many candidate paths)
- **Depth-first**: Follow the most promising branch as far as possible before backtracking (efficient when good paths exist and poor paths are quickly identifiable)
- **Best-first**: Always expand the globally highest-scoring node (best choice when a reliable evaluation function is available)

**The critical piece**: The evaluation function. If the model evaluates candidate steps poorly, ToT wastes enormous compute exploring bad branches while missing good ones.

Effective evaluation prompts ask:
- Does this step make progress toward the goal?
- Is it logically consistent with prior steps?
- Does it open or close future options?

External verifiers (like code execution for planning tasks involving code) provide more reliable feedback than self-evaluation.

**When to use**: Tasks with a large search space of possible approaches where early choices significantly constrain what's possible later. Mathematical problem solving, creative writing with specific constraints, code generation for complex algorithms. Overkill for straightforward retrieval and summarization tasks.

### 4. ReAct with Planning (PlanReAct)

A practical middle ground: combine an initial planning step with the ReAct loop. The agent first generates a high-level plan in natural language, then executes it using the ReAct thought-action-observation cycle. Each iteration is guided by the current plan step, but the agent retains the ability to **revise the plan** if observations suggest it's no longer valid.

The plan functions as a **soft constraint** on behavior rather than a hard specification. The agent uses it as a guide but can deviate when the situation requires it.

**Strengths**:
- More flexible than plan-and-execute (observations can trigger plan revisions)
- Simpler than ToT planning (search tree collapsed to linear sequence except when explicit replanning is needed)
- Captures most of the benefit of pure planning while retaining most of the flexibility of pure reaction

**Weaknesses**:
- Plan revisions can be expensive (each revision requires a full model call with substantial context)
- In adversarial or rapidly changing environments, the agent may spend more time replanning than executing

**When to use**: Most production agent systems. This is the **most commonly used architecture in practical deployments** (LangGraph implementations, AutoGPT-style systems, OpenAI Assistants API).

### 5. Graph-Based Planning (DAGs)

An extension of explicit dependency management: represent plans as **directed acyclic graphs (DAGs)** rather than lists.

In a list plan, steps are ordered linearly and parallelism must be inferred from the absence of dependencies. In a graph plan, nodes are tasks and directed edges represent data dependencies: an edge from node A to node B means B requires A's output as input.

**Strengths**:
- Parallel structure is immediately visible and machine-readable (no inference required)
- An orchestration engine can trivially identify which nodes have all their dependencies satisfied and dispatch them simultaneously
- When a node fails, the graph makes it clear exactly which downstream nodes are blocked, enabling targeted recovery reasoning

**Implementation**: LangGraph implements this pattern directly. Workflows are defined as graphs where nodes are agent steps (model calls or tool invocations) and edges encode control flow and data dependencies. Supports cycles (enabling loops with exit conditions for tasks requiring iterative refinement).

**When to use**: Complex multi-step workflows with clear parallel structure, systems requiring explicit orchestration visibility, scenarios where recovery needs to understand blast radius of failures.

---

## Decision Matrix: Which Architecture When?

| Architecture | Best For | Avoid When | Relative Cost |
|-------------|----------|-----------|---------------|
| **Plan-and-Execute** | Predictable tasks, stable environments, clear step sequences | Environment is dynamic, tools are unreliable | Low (1x planning) |
| **ReWOO** | Structured research, Q&A with clear dependencies, parallelizable steps | Plan structure depends on intermediate results | Low (1x planning) |
| **Tree-of-Thought** | Complex problem solving, large search spaces, early choices critical | Simple retrieval tasks, time-sensitive work | Very High (many branches) |
| **PlanReAct** | Most production systems, tasks with moderate complexity, need flexibility | Extremely predictable or extremely dynamic tasks | Medium (replanning cost) |
| **Graph-Based** | Multi-agent systems, explicit orchestration needs, recovery-critical workflows | Simple linear workflows | Medium (graph overhead) |

---

## Plan Execution: The Missing Half

Generating a plan is only half the problem. Executing it correctly requires managing control flow, monitoring progress, handling intermediate results, and detecting when something has gone wrong.

### Context Management

As each step executes, its result must be stored and made available to subsequent steps. The planning agent needs a **context object** that tracks:

- The original goal
- The full plan with step statuses (pending, in progress, completed, failed)
- The outputs of each completed step
- Any observations or errors encountered

This context object serves as the agent's working memory. It prevents the agent from forgetting what it was doing and ensures later steps have access to all information generated by earlier steps.

**The challenge**: Context window management. As plans grow longer and step outputs accumulate, the total token count can exceed the model's limit.

**Strategies**:
- Summarize the outputs of completed steps (rather than preserving verbatim)
- Keep only the most relevant recent context
- Use external memory store to offload history that doesn't need immediate context
- Common heuristic: keep the last k steps in full, maintain compressed summaries of everything older

**What to include at each step**:
- The goal
- Current step description
- Outputs of direct predecessor steps
- Any recent observations that might affect the current step
- **Everything else can be deferred to external memory**

### Handling Tool Failures

Tool failures are one of the most common sources of plan breakdown. APIs become unavailable, search queries return empty results, code execution raises exceptions, rate limits trigger.

The plan executor must distinguish between three fundamentally different types of failure:

**1. Recoverable failures**: Transient error (network timeout, rate limit). **Response**: Retry with backoff. Not about the plan being wrong—about infrastructure instability. Handle without involving the planner at all.

**2. Fixable failures**: Tool call fails because input was malformed or query was poorly specified. **Response**: Revise the tool call. The plan structure is correct, but specific parameters need adjustment. This is a local repair.

**3. Plan-invalidating failures**: Tool call reveals a fundamental assumption in the plan is wrong. **Response**: Replanning. The plan's structure is incorrect, not just a single step's parameters.

**Distinguishing failure types requires reasoning about why a failure occurred, not just that it occurred.** This is where the LLM's reasoning capability is especially valuable.

- `429 Too Many Requests` → clearly recoverable
- `404 Not Found` on a required API endpoint → plan-invalidating
- Malformed query parameter producing no results → fixable

**Retry policy for recoverable failures**: Exponential backoff (1s, 2s, 4s, then declare permanently failed). Trades resilience for latency.

### Detecting Semantic Failures

Beyond hard tool failures, agents must detect **semantic failures**: cases where a tool call technically succeeds but returns content that doesn't satisfy the step's requirements.

- A search that returns results about a different topic than intended
- Code generation that produces syntactically valid code that doesn't implement the specified algorithm

**Semantic failure detection requires verifying that step outputs satisfy their intended purpose, not just that the tool call returned without an error.**

This is harder than detecting hard failures because it requires understanding what the step was supposed to produce, which requires **maintaining a clear specification of each step's expected output in the plan**.

When steps are specified as vague descriptions like "gather information about X", semantic failure detection is nearly impossible. Well-specified steps with explicit output requirements make it tractable.

---

## Plan Revision and Recovery

The most practically important aspect of planning: handling the gap between the planned sequence and what actually happens during execution.

Plans fail. Observations surprise. New information changes what is optimal. A robust planning agent doesn't give up—it revises.

**This is where planning systems earn their value.** A system that can generate a plan but can't recover from failures is not meaningfully better than one that executes blindly step by step.

Recovery capability is what justifies the overhead of upfront planning. It transforms a failure from a dead end into a detour.

### Replanning Triggers

Three conditions should trigger replanning:

**1. Execution failure**: A step fails and can't be completed despite retries and reformulation attempts. The plan must be revised to find an alternative path that doesn't depend on the failed step.

**2. Observation surprise**: A step completes but its output is qualitatively different from what the plan assumed. Example: the plan assumed a document would contain information about a topic, but the retrieved document doesn't. Steps downstream that depend on this information need revision or replacement.

**3. Goal clarification**: During execution, the agent realizes the original goal specification was ambiguous and its interpretation was wrong. The plan needs to be rebuilt around the corrected understanding.

### Replanning Strategies

When a trigger is detected, the agent has several options:

**1. Local repair**: Modify only the steps immediately affected by the failure, leaving the rest intact. If step four fails because a specific database is unavailable, replace step four with a call to an alternative database. **Efficient** because the planner doesn't regenerate the entire plan. Low context window cost, minimal latency, zero risk of introducing new errors into unchanged parts.

**When to use**: Most execution failures and observation surprises. Try this first.

**2. Suffix replanning**: Abandon the remaining steps and generate a new plan for the remaining subgoal, starting from the current state. Give the planner the original goal, the steps already completed and their outputs, and ask for a plan for what remains. More expensive than local repair but handles cases where the failure fundamentally changes the approach needed for subsequent steps.

**When to use**: Step four's failure reveals the entire approach to the second half of the plan is wrong (local repair to step four is insufficient—the whole suffix needs rebuilding).

**3. Full replanning**: Restart the planning process from scratch given what has been learned. Most expensive but appropriate when the plan's underlying assumptions have been invalidated entirely. Benefits from information gathered during failed execution: the planner now knows what doesn't work and can avoid those paths.

**When to use**: Last resort when underlying assumptions are wrong.

**Escalation policy**: Try local repair first → escalate to suffix replanning if local repair fails twice → use full replanning only as last resort. Minimizes average replanning cost while ensuring severe failures eventually trigger comprehensive response.

### Self-Correction with Reflection (Reflexion)

Reflexion adds a systematic self-critique step before replanning. After a plan failure, the agent is prompted to **reflect on what went wrong**: what assumption failed, what information was missing, what strategy was flawed.

This reflection is stored in a "working memory" of past failures and consulted at the start of the next planning attempt, helping the agent avoid repeating the same mistake.

**Key insight**: The gradient signal in traditional ML (which pushes model weights toward better performance) can be replaced for LLM agents by a **verbal gradient**: a natural language description of what went wrong and what to do differently.

Requires no weight updates. Can be implemented entirely through prompting.

**Example**: Agent tries and fails to answer a multi-hop research question. Instead of restarting from scratch, Reflexion instructs the agent to generate a short critique:

> "I assumed the primary source contained the answer, but it did not. Next time, I should verify the source topic before relying on it."

This critique is prepended to the next attempt's planning prompt. The model reads its own past failure analysis and uses it as a prior when generating the new plan, systematically avoiding the strategy that failed.

Across multiple attempts, the agent accumulates a growing library of failure modes specific to this task, effectively learning without gradient descent.

---

## When NOT to Plan

Planning has overhead. Not every task justifies it.

**Skip planning when**:
- The task is a single step (just use ReAct)
- The environment is so dynamic that plans become obsolete immediately (pure reaction is better)
- The task is exploratory and the goal will change based on what's discovered (planning constrains too much)
- Cost constraints are tight and predictability is low (planning overhead doesn't pay for itself)

**Use planning when**:
- The task has 5+ steps with dependencies
- Some steps can be parallelized (parallelism wins)
- Recovery from failure matters (planning provides structure to repair)
- The cost of redoing work is high (planning avoids redundancy)

---

## The Production Takeaway

Most production agent failures aren't model failures—they're **architecture failures**. Single-step reasoning doesn't scale to multi-step goals. Planning provides the structured reasoning that turns intractable problems into sequences of manageable subtasks.

**Start with PlanReAct** (initial plan + ReAct execution with revision ability). It's the most practical middle ground for most production systems. Add complexity only when you hit clear limits:

- Add ReWOO-style explicit dependencies when parallelism matters
- Add ToT-style search when early choices are critical and the search space is large
- Add graph-based orchestration when explicit coordination is needed

**The biggest planning win isn't upfront correctness—it's recovery capability.** Plans fail. A system that can repair a plan is infinitely more valuable than one that can only generate perfect plans.

And when you find yourself debugging why your agent "got confused" or "lost track of the goal" midway through a complex task? That's not a prompt problem. That's a planning problem.

**Further Reading**:
- Original ReWOO paper: Xu et al., "ReWOO: Reasoning Without Observation"
- Tree-of-Thought: Yao et al., "Tree of Thoughts: Deliberate Problem Solving with LLMs"
- Reflexion: Shinn et al., "Reflexion: Language Agents with Verbal Reinforcement Learning"
- Hierarchical planning deep dive: Michael Brenndoerfer's "Planning: Task Decomposition and Goal-Directed LLM Agents"
