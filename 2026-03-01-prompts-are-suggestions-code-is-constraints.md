# Prompts Are Suggestions. Code Is Constraints.

If you're building AI agents for production, you'll eventually learn this lesson the hard way: **prompts are suggestions, but code is constraints.** No matter how carefully you craft your system prompt, no matter how many examples you provide, if you want an agent to reliably follow a rule in production, you need to enforce it in code.

This isn't a criticism of LLMs. It's a fundamental property of probabilistic systems operating in complex environments. And once you internalize this principle, it changes how you architect agent systems.

## The Illusion of Prompt Control

Here's a pattern every agent builder hits early on:

Your agent keeps doing something wrong. Maybe it's calling a "finish" tool before completing all tasks. Maybe it's fetching too much data and overflowing context windows. Maybe it's skipping validation steps.

Your first instinct? Add it to the prompt.

```
You MUST complete all tasks before calling finish.
ALWAYS validate inputs before proceeding.
NEVER fetch more than 100 rows at once.
```

You test it. It works! Ship it.

Then in production, under different conditions, with different inputs, at different context depths... it does the wrong thing anyway.

The problem isn't that the LLM "didn't read" your prompt. The problem is that prompts are weighted suggestions in a probabilistic decision-making process, not hard constraints.

## What Actually Works: Tool-Based Enforcement

Laurie Voss, speaking about building Alex (an AI assistant at Arise AI), describes their solution to agents finishing tasks early:

> "We have what we call the finish gate. If the agent tries to call our finish tool with incomplete to-dos, it gets an error. Not a suggestion, not a reminder—a recoverable exception that lists which tasks are unfinished and bounces the agent back into the work loop."

This works because **the constraint lives in code**, not in the prompt. The agent can try to finish early, but the system won't let it.

Here's what that looks like in practice:

```python
def finish_tool(context):
    """
    Agent calls this when it believes the task is complete.
    Enforces completion via code, not prompts.
    """
    incomplete_tasks = [
        task for task in context.tasks 
        if task.status in ["pending", "in_progress"]
    ]
    
    # Hard constraint: can't finish with incomplete tasks
    # unless explicitly blocked waiting for human input
    if incomplete_tasks and not all(t.status == "blocked" for t in incomplete_tasks):
        return {
            "error": "Cannot finish with incomplete tasks",
            "incomplete": [task.description for task in incomplete_tasks],
            "instruction": "Complete pending tasks or mark them as blocked if human input is needed"
        }
    
    # Only reaches here if all tasks are complete or blocked
    return {"status": "success", "message": "Task completed"}
```

The prompt can still say "call finish when done," but the **tool itself enforces the rule**. The agent can't bypass it through creative interpretation or context-dependent attention drift.

## Recoverable Exceptions: Guardrails That Teach

The "finish gate" demonstrates a powerful pattern: **recoverable exceptions**. These aren't hard failures that crash the agent. They're structured errors that:

1. **Block the invalid action** (won't let finish succeed)
2. **Explain why it was blocked** (incomplete tasks listed)
3. **Suggest what to do instead** (complete tasks or mark as blocked)

This creates a feedback loop. The agent tries something, the tool guides it back on track, and the agent corrects course. Over time, the agent learns the constraints through interaction, not just through reading.

Another example from the same talk: data fetching limits.

**Old approach (prompt-based):**
```
Do not try to compare more than two experiments at a time.
```

This was a band-aid for context overflow. It didn't scale, and users were frustrated by artificial limits.

**New approach (code-based):**
```python
def query_data(json_id, jq_expression, context):
    """
    Query large JSON data with hard output limits.
    Enforces budget in code, not prompts.
    """
    result = execute_jq(json_id, jq_expression)
    
    # Hard 10k character budget
    MAX_OUTPUT = 10_000
    
    if len(result) > MAX_OUTPUT:
        return {
            "error": "Query returned too much data",
            "size": len(result),
            "max_allowed": MAX_OUTPUT,
            "suggestion": "Refine your jq expression to return fewer fields or filter rows",
            "preview": result[:1000]  # Show sample of what matched
        }
    
    return {"data": result}
```

Now the agent can query as many experiments as needed, but each query has a predictable cost. The budget is **enforced**, not suggested. The two-experiment cap was removed entirely.

## When Prompts Still Matter

This isn't an argument against prompts. Prompts are still critical for:

- **Defining goals and context** ("You help users debug AI agents")
- **Providing examples** (show, don't tell—concrete demonstrations work)
- **Setting tone and style** ("Be concise and direct")
- **Offering strategies** ("When stuck, try narrowing your search")

But when it comes to **rules that must not be broken**, code is your enforcement mechanism.

Think of it this way:
- **Prompts** = training and guidance
- **Code** = guardrails and budgets

## Patterns Worth Enforcing in Code

Based on production agent deployments, here are rules commonly moved from prompts to code:

### 1. Completion Gates
"Don't finish until all tasks are done" → tool returns error if incomplete tasks exist

### 2. Output Budgets
"Don't return too much data" → tool truncates or errors if output exceeds limit

### 3. Safety Constraints
"Only read, don't write" → wrapper scripts reject destructive commands

Example from the debugging skills mentioned in the talk:

```bash
# Wrapper for kubectl that enforces read-only
safe-kubectl() {
    # Reject any mutating operations
    if [[ "$*" =~ (apply|delete|patch|exec|create) ]]; then
        echo "ERROR: Destructive kubectl operations not allowed"
        return 1
    fi
    
    kubectl "$@"
}
```

The LLM can call `safe-kubectl`, but it **cannot** run destructive commands, no matter what the prompt says or what creative reasoning it employs.

### 4. Validation Rules
"Check inputs before processing" → tool validates and returns structured errors

### 5. Rate Limits
"Don't call this API too frequently" → tool enforces cooldown periods

## The "Blocked" Escape Hatch

One subtle but critical detail from the finish gate: the **blocked status**.

Sometimes agents genuinely can't proceed without human input. "I found three possible bottlenecks. Which one should I focus on?"

The blocked status provides an escape hatch:

```python
if all(task.status in ["completed", "blocked"] for task in context.tasks):
    # Can finish if everything is either done or waiting for human
    return {"status": "success"}
```

This prevents the agent from getting stuck in an unwinnable state. If it marks a task as blocked and explains why, it's allowed to pause and ask for help.

## Code Review for Prompts

Here's a meta-application of this principle: using code to enforce prompt correctness.

The Alex team runs **Claude Code Review on every PR** with validation rules in the project's `claude.md`. One class of bugs this catches: prompt-tool mismatches.

If your prompt says "call get_trace_preview to examine the trace," but the tool was recently renamed to `fetch_trace_summary`, that's a runtime failure that unit tests won't catch.

Code review acts as a constraint on the prompt itself, ensuring references stay valid. Natural language bugs caught by natural language review, backed by tooling.

## Takeaway: Design for Enforcement

When you're building an agent system and you find yourself adding emphatic instructions to the prompt—`ALWAYS`, `NEVER`, `MUST`—pause and ask:

**Can this rule be enforced in code instead?**

If the answer is yes, move it out of the prompt and into the tool. Make it a constraint, not a suggestion.

Your production agents will be more reliable, your debugging will be clearer (structured errors are easier to trace than vague misbehavior), and you'll sleep better knowing that critical rules can't be bypassed through attention drift or creative interpretation.

Prompts are powerful. They guide, they teach, they provide context. But when it matters—when a rule must hold—**code is your contract**.

---

## References

- Laurie Voss, "Building Production AI Agents" (Arise AI talk, 2026)
- Arise AX: Observability and evaluation platform for AI systems
- Pattern also visible in: Cursor (to-do objects), Claude Code (file references), Alex (finish gate)

## Related Topics

- Agent planning systems (to-do list patterns)
- Context engineering (large JSON previews)
- Testing non-deterministic systems (golden sessions)
- Small, sharp, composable tools (Unix philosophy for AI)
