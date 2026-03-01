# Agent Planning Systems: The To-Do List Pattern

The most common failure mode in multi-step AI agents isn't hallucination. It isn't capability. It's **forgetting what they're supposed to be doing halfway through**.

You ask the agent to do three things. It starts on the first one, goes deep, produces great work... and then calls it done. The other two tasks? Forgotten. Buried under pages of tool output and intermediate results.

Junior engineers do this too. So do I, sometimes. But when you're building production agents, you can't just shrug and say "well, attention is hard." You need a systematic solution.

The answer, it turns out, is embarrassingly simple: **make the agent write a to-do list**.

Not as a polite suggestion in the prompt. As a **first-class tool call**—a structured object the system can inspect, enforce, and re-inject into context on every turn.

This is the pattern that keeps agents on task, and it's showing up everywhere: in Cursor, in Claude Code, and in Alex (the AI assistant built by Arise AI that inspired this article).

## The Problem: Attention Drift

Here's what happens in a typical multi-step agent execution:

1. User asks: "Summarize the last three agent traces, compare their performance, and identify the slowest operation."
2. Agent starts: "I'll fetch the first trace..."
3. Agent fetches trace → 50KB of JSON in context
4. Agent analyzes trace → more output
5. Agent writes summary → even more output
6. Agent calls "finish" → done!

Wait. What about the other two traces? What about the comparison? What about finding the slowest operation?

**The agent forgot.**

The original request is still in the conversation history, but it's buried under pages of tool results. By turn 6, the agent's attention is entirely focused on the immediate context—the trace it just analyzed—and the broader plan has faded into irrelevance.

This isn't a hallucination. The model didn't make things up. It just **lost track of the plan**.

## The Solution: First-Class Planning Tools

The fix is to make planning a **structured, enforceable step** before any work begins.

Here's how Alex does it:

```python
# Before the agent can fetch data or analyze anything,
# it must call to-do write to create a plan

def todo_write(tasks: List[str]) -> dict:
    """
    Create a task plan. Must be called before performing work.
    Returns a plan ID that persists for the session.
    """
    plan = {
        "id": generate_plan_id(),
        "tasks": [
            {"id": i, "description": task, "status": "pending"}
            for i, task in enumerate(tasks)
        ]
    }
    
    # Store outside conversation history (on disk or in session state)
    save_plan(plan)
    
    return {
        "plan_id": plan["id"],
        "message": "Plan created. Begin with the first pending task."
    }
```

The agent doesn't just think about planning—it **executes a plan creation step** that produces a durable artifact.

## Three Planning Tools

A complete planning system needs three operations:

### 1. `todo_write` - Create the Plan

Called once at the start. Takes a list of task descriptions, returns a plan ID.

Example:
```json
{
  "tool": "todo_write",
  "tasks": [
    "Fetch and summarize trace A",
    "Fetch and summarize trace B", 
    "Fetch and summarize trace C",
    "Compare performance metrics",
    "Identify slowest operation"
  ]
}
```

### 2. `todo_update` - Mark Progress

Called as work proceeds. Updates task status.

Example:
```json
{
  "tool": "todo_update",
  "task_id": 0,
  "status": "completed"
}
```

### 3. `todo_read` - Check Current State

Called when the agent needs to see where it is in the plan.

Returns:
```json
{
  "pending": ["Fetch and summarize trace B", "..."],
  "in_progress": ["Fetch and summarize trace C"],
  "completed": ["Fetch and summarize trace A"],
  "blocked": []
}
```

## The Four Statuses

Early versions of planning systems often use just two states: **pending** and **completed**.

This doesn't work.

With only two states, the agent knows what it hasn't started and what it's finished, but it has **no working pointer**. It doesn't know which of the pending tasks it's currently in the middle of.

That's why most production planning systems use **four statuses**:

### 1. `pending` - Not Started
Tasks waiting to begin.

### 2. `in_progress` - Current Task
**The single task the agent is actively working on right now.**

This is the working pointer. At any given time, exactly one task should be in progress (or zero if between tasks).

### 3. `completed` - Finished
Tasks that are done.

### 4. `blocked` - Waiting for Human
Tasks that can't proceed without human input.

Example: "I found three possible bottlenecks. Which one should I focus on?"

The `blocked` status provides an escape hatch—if the agent genuinely can't proceed, it can mark a task as blocked, explain why, and pause for human input.

## The Highest Leverage Change: `in_progress`

According to the Arise AI team, adding the `in_progress` status was **"one of the highest leveraged changes we made."**

Why?

Because it gives the agent a concrete anchor. No matter how deep into tool calls and JSON parsing it gets, the plan always shows:

**"You are currently working on: Fetch and summarize trace C"**

This is your cognitive anchor in a sea of intermediate results.

## Where the Plan Lives: Not in History

Here's the critical architectural decision:

**The plan does not live in the conversation history.**

If you store the plan as just another message in the chat, it gets buried the same way the original user request does. It scrolls up. It gets truncated when context limits hit. It becomes noise.

Instead, the plan lives **outside the conversation**, stored in:
- Session state (in-memory)
- Disk (a JSON file)
- Database (for multi-session agents)

And on **every single LLM call**, the plan is **dynamically re-injected** into the context window.

## The Plan Message: Always Visible

Here's what the agent sees on every turn:

```
# Current Plan

## Tasks
- [✓] Fetch and summarize trace A
- [✓] Fetch and summarize trace B  
- [→] Fetch and summarize trace C (IN PROGRESS)
- [ ] Compare performance metrics
- [ ] Identify slowest operation

## Next Steps
You are currently working on: "Fetch and summarize trace C"

When this task is complete, call:
  todo_update(task_id=2, status="completed")

Then move to the next pending task.

When ALL tasks are completed, call:
  finish()
```

This message is placed **right after the system prompt**, before the messy tool call history.

No matter how deep the agent gets—50 turns in, hundreds of KB of JSON—the plan is always right there, fresh and current.

## The Finish Gate: Enforcing Completion

Prompts aren't enough to keep agents from finishing early. You need code enforcement.

```python
def finish(context) -> dict:
    """
    Agent calls this when it believes work is complete.
    Enforces completion via code, not prompts.
    """
    plan = load_plan(context.plan_id)
    
    incomplete = [
        task for task in plan["tasks"]
        if task["status"] in ["pending", "in_progress"]
    ]
    
    # Can't finish with incomplete tasks unless they're blocked
    if incomplete:
        blocked_only = all(t["status"] == "blocked" for t in incomplete)
        if not blocked_only:
            return {
                "error": "Cannot finish with incomplete tasks",
                "incomplete": [t["description"] for t in incomplete],
                "instruction": "Complete pending tasks or mark as blocked if you need human input"
            }
    
    # Only reaches here if all tasks are done or blocked
    return {"status": "success"}
```

The agent can **try** to finish early, but the system won't let it.

This is a **recoverable exception**—not a crash, but a structured error that bounces the agent back into the work loop with guidance about what's still pending.

## The Blocked Escape Hatch

Sometimes the agent genuinely can't proceed:

- "Which of these three bottlenecks should I prioritize?"
- "This data appears corrupted. Should I skip it or wait for a fix?"
- "I need API credentials to proceed."

For these cases, the agent can mark a task as `blocked`:

```python
todo_update(task_id=3, status="blocked", reason="Need user to choose priority")
```

The finish gate allows completion when **all incomplete tasks are blocked**:

```python
if all(task["status"] in ["completed", "blocked"] for task in plan["tasks"]):
    return {"status": "success"}  # OK to finish
```

This prevents the agent from getting stuck in an unwinnable state while still enforcing that it can't skip work arbitrarily.

## Real-World Example: 27 Calls in Circles

Here's a memorable failure case from early Alex development:

**User request:** "Summarize several agent traces"

**What happened:** The agent made **27 LLM calls**, almost all of them managing its internal to-do list in freeform text, going in circles, never actually fetching or analyzing data.

**Why:** No structured planning. The agent kept *thinking about what to do* but had no durable plan to anchor its actions.

**Fix:** First-class planning tools. The agent writes the plan once, then **executes** tasks instead of repeatedly re-planning.

## Show, Don't Tell

Early versions of Alex included this in the system prompt:

```
Always use todo_write to plan your tasks before beginning work.
```

It didn't help.

What worked was **showing a concrete example**:

```
# Example Planning

User request: "Compare experiments A and B"

Step 1: Call todo_write with tasks:
  1. Fetch experiment A data
  2. Fetch experiment B data  
  3. Compare accuracy scores
  4. Compare latency metrics
  5. Summarize findings

Step 2: Execute tasks in order, updating status as you go

Step 3: Call finish() when all tasks are completed
```

Abstract instructions do very little. Concrete examples work.

## Patterns Across Systems

This isn't unique to Alex. You see variations of this pattern in:

**Cursor:**
- Has a first-class "to-do object" for code edits
- Shows task list in the UI
- Tracks which files need changes

**Claude Code / OpenCode:**
- Plans file operations before executing
- Shows user what it intends to do
- Executes plan step-by-step

**Agent frameworks (LangChain, CrewAI, etc.):**
- Explicit planning phases
- Task decomposition tools
- Progress tracking

The details vary, but the core pattern is the same: **make planning a structured, durable, visible artifact**.

## Implementation Checklist

If you're building a multi-step agent, here's what a planning system needs:

- [ ] **Three planning tools:** write, update, read
- [ ] **Four statuses:** pending, in_progress, completed, blocked  
- [ ] **Plan stored outside conversation history** (disk/state/DB)
- [ ] **Plan re-injected on every LLM call** (after system prompt)
- [ ] **Finish gate:** Prevent premature completion via code
- [ ] **Blocked escape hatch:** Allow pause when human input needed
- [ ] **Concrete examples in prompt:** Show, don't tell

## Code Over Prompts

The planning system works because it's **enforced in code**, not just suggested in prompts.

- The agent *must* call `todo_write` before doing work (or it has no plan to inject)
- The agent *can't* finish with incomplete tasks (the tool returns an error)
- The plan *always* appears in context (re-injection is automatic)

This is the broader lesson: **if you want agents to follow a rule, put the rule in code, not just the prompt.**

Prompts are suggestions. Code is constraints.

## Takeaway: Cognitive Anchors for Agents

Humans use to-do lists because our working memory is limited and distractions are constant. We write things down to offload cognitive load and maintain focus.

Agents have the same problem, just with different constraints: context windows fill with JSON, attention drifts toward recent outputs, and the original goal fades into the background.

The to-do list pattern solves this by providing a **cognitive anchor**—a durable, visible reminder of the plan that stays in focus no matter how deep the agent goes.

It's simple. Almost embarrassingly so.

But it works.

---

## References

- Laurie Voss, "Building Production AI Agents" (Arise AI, 2026)
- Alex: AI assistant for Arise AX observability platform
- Pattern variations in: Cursor, Claude Code, OpenCode, LangChain, CrewAI

## Related Patterns

- **Finish gate:** Code-enforced completion rules
- **Recoverable exceptions:** Structured errors that guide agents back on track
- **Context re-injection:** Keeping critical info visible across turns
- **Small, sharp tools:** Unix philosophy applied to agent tooling

## Next Steps

If you're building an agent:
1. Add planning tools **before** optimizing anything else
2. Test on multi-step tasks (3+ operations)
3. Watch for early finishes (common failure mode)
4. Add the `in_progress` status if you haven't already
5. Move the plan out of conversation history

And remember: the plan is not decoration. It's the agent's working memory externalized into a structure the system can enforce.
