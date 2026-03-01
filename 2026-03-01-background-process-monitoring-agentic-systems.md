# Background Process Monitoring: The exec Background + process Pattern

**March 1, 2026**

When your AI agent needs to compile a project, run tests, or execute a long-running analysis, you face a fundamental choice: block and wait, or run it in the background. For simple commands that finish in seconds, blocking is fine. But when tasks take minutes—or when you're orchestrating multiple agents working in parallel—you need a robust pattern for background execution and monitoring.

OpenClaw's `exec` background + `process` tool pattern offers a practical solution. It's not the only approach (we'll compare alternatives), but it's clean, debuggable, and maps well to how humans think about long-running tasks. Let me show you why it matters and how to use it effectively.

## The Problem: Timeouts, Blocking, and Lost Context

Imagine asking an agent to run `npm install` in a large project. On a fast machine it's 30 seconds. On a slower one, maybe two minutes. If your exec tool has a 60-second timeout, you'll get incomplete output and a partial failure. Worse: you might not know *what* succeeded or failed.

The naive fix is to crank up the timeout to 10 minutes. But now your agent is blocked for 10 minutes waiting on a single command. If you're orchestrating multiple tasks—say, building three Docker images in parallel—you're serializing work that should be concurrent.

This is where the background execution pattern shines:

```python
# Start a long-running build in the background
exec(command="docker build -t myapp:latest .", background=True, yieldMs=5000)
# Returns immediately with sessionId after 5 seconds
# Agent can now start other tasks or check on this one later
```

The agent gets a session ID and can either:
- Fire-and-forget (start it and check back later)
- Poll periodically to see if it's done
- Log into the running process to inspect output

This unlocks parallelism and flexibility. But it also introduces new challenges: How do you know when it's done? How do you handle failures? How do you debug a process that ran hours ago?

## The exec + process Pattern Explained

OpenClaw's pattern has two parts:

### 1. exec with background=True

```bash
exec(
    command="pytest tests/ -v --cov",
    background=True,
    yieldMs=10000,  # Wait 10 seconds before backgrounding
    workdir="/home/user/project",
    env={"CI": "true"}
)
```

**What happens:**
- The command starts immediately
- Output streams back for `yieldMs` milliseconds (default 10 seconds)
- After that, it returns a `sessionId` and the process continues running
- The agent can do other work

**Key parameters:**
- `background=True` - Enable background mode
- `yieldMs` - How long to wait before backgrounding (captures early output/errors)
- `timeout` - Optional hard limit (kills process if exceeded)
- `pty=true` - Use a pseudo-terminal (for TUI tools like `htop`, `vim`)

### 2. process tool for monitoring

Once you have a sessionId, use the `process` tool:

```python
# List all running background processes
process(action="list")

# Poll a specific process (non-blocking check)
process(action="poll", sessionId="abc123", timeout=1000)

# Get full logs (like 'tail -f')
process(action="log", sessionId="abc123", offset=0, limit=1000)

# Send input to stdin
process(action="write", sessionId="abc123", data="yes\n", eof=False)

# Kill a runaway process
process(action="kill", sessionId="abc123")
```

**The workflow:**

1. Start task in background → get sessionId
2. Do other work (or start more background tasks)
3. Periodically poll to check status
4. When done, fetch logs and check exit code
5. Clean up or investigate failures

This maps to how Unix tools work: `&` to background, `jobs` to list, `fg` to foreground, `kill` to stop. Familiar and composable.

## Poll vs Push: Choosing Your Monitoring Strategy

There are two fundamental approaches to monitoring background tasks:

### Poll: Agent Checks Periodically

**Pattern:**
```python
# Start the task
result = exec(command="./long_analysis.sh", background=True)
sessionId = result["sessionId"]

# Later... (in a heartbeat or periodic check)
status = process(action="poll", sessionId=sessionId)
if status["done"]:
    logs = process(action="log", sessionId=sessionId)
    # Process results
```

**When to use polling:**
- Task duration is predictable (~minutes to hours)
- You're batching multiple checks together (efficiency)
- The task is informational, not time-critical
- You have a natural heartbeat/cron cycle already

**Trade-offs:**
- ✅ Simple to implement
- ✅ Batches well (check 5 tasks in one heartbeat)
- ✅ No infrastructure needed
- ❌ Latency: you might not notice completion for minutes
- ❌ Wastes cycles polling tasks that aren't done
- ❌ Not suitable for real-time coordination

### Push: Task Notifies When Done

**Pattern:**
```python
# Wrapper script that notifies on completion
exec(
    command="""
        ./expensive_task.sh > output.log 2>&1
        EXIT_CODE=$?
        curl -X POST http://gateway/api/wake \
          -d '{"text": "Task completed with exit code $EXIT_CODE"}'
        exit $EXIT_CODE
    """,
    background=True
)
# Agent is woken up when the task finishes
```

**When to use push:**
- Task must trigger immediate action (build → deploy pipeline)
- Unknown/variable duration (could be seconds or hours)
- You're coordinating dependent tasks (A → B → C)
- Real-time responsiveness matters

**Trade-offs:**
- ✅ Low latency: agent knows immediately
- ✅ No wasted polling cycles
- ✅ Enables reactive workflows
- ❌ Requires infrastructure (webhook endpoint, message queue)
- ❌ More complex error handling (what if the notify fails?)
- ❌ Can overwhelm if hundreds of tasks complete simultaneously

### The Hybrid Approach (Best of Both)

In practice, most robust agentic systems use a hybrid:

```python
# Start critical tasks with push notification
exec(command="./critical_build.sh && notify_completion", background=True)

# Start informational tasks without notification
exec(command="./gather_metrics.sh", background=True)

# Heartbeat checks all background tasks periodically
def heartbeat():
    tasks = process(action="list")
    for task in tasks["sessions"]:
        if task["done"] and not task["notified"]:
            handle_completion(task)
```

**Decision matrix:**

| Task Type | Example | Strategy |
|-----------|---------|----------|
| Critical path | CI/CD build → deploy | Push (webhook/wake) |
| Parallel batch | Run 10 test suites | Hybrid (start all, poll group) |
| Informational | Daily metrics collection | Poll (check next heartbeat) |
| Interactive | User-requested analysis | Poll (check every 30s) |

## Debugging Long-Running Agentic Tasks

The hard part isn't starting background tasks—it's debugging when they fail 90 minutes in. Here's a practical debugging toolkit:

### 1. Structured Logging from the Start

Don't just log stdout. Capture:
- Start time and expected duration
- Environment snapshot (git hash, dependencies)
- Input parameters
- Exit code and termination reason

```python
# Before starting
metadata = {
    "task": "build_docker_image",
    "started": datetime.now().isoformat(),
    "git_sha": get_git_sha(),
    "expected_duration_sec": 300
}
write_json("tasks/task_12345_metadata.json", metadata)

# After completion
metadata["exit_code"] = result["exitCode"]
metadata["duration_sec"] = (datetime.now() - start).total_seconds()
update_json("tasks/task_12345_metadata.json", metadata)
```

### 2. Progressive Output Streaming

Use `yieldMs` intelligently:

```python
# Quick sanity check: stream first 10 seconds
exec(command="./analyze.py", background=True, yieldMs=10000)
# If it fails immediately (bad args, missing file), you'll see it
# If it succeeds past setup, it backgrounds and continues
```

Combine with periodic log sampling:

```python
# Every 5 minutes, grab last 50 lines
logs = process(action="log", sessionId=sid, offset=-50, limit=50)
if "ERROR" in logs or "FATAL" in logs:
    alert_human(f"Task {sid} showing errors: {logs}")
```

### 3. Process Archaeology (Post-Mortem)

When a task fails hours later:

```bash
# Get full execution log
process(action="log", sessionId="failed_task_123", limit=10000)

# Check exit code
process(action="poll", sessionId="failed_task_123")

# Reconstruct environment
# (if you logged env vars to metadata file)
cat tasks/failed_task_123_metadata.json
```

Look for:
- Was the failure deterministic or transient?
- Did it run out of memory/disk? (check system logs)
- Was it killed externally? (exit code -9 = SIGKILL)
- Did dependencies change mid-run? (check package lock timestamps)

### 4. Idempotency Markers

For long tasks that might be retried:

```python
MARKER_FILE = f"/tmp/task_{task_id}.started"

command = f"""
    if [ -f {MARKER_FILE} ]; then
        echo "Task already running/completed"
        exit 1
    fi
    touch {MARKER_FILE}
    
    ./expensive_work.sh
    EXIT_CODE=$?
    
    if [ $EXIT_CODE -eq 0 ]; then
        mv {MARKER_FILE} {MARKER_FILE}.done
    fi
    exit $EXIT_CODE
"""
```

This prevents duplicate work if the agent restarts or retries.

### 5. The "Canary" Pattern

For tasks with unclear health, inject canaries:

```bash
./long_analysis.sh &
PID=$!

# Canary: expect some output every 60 seconds
while kill -0 $PID 2>/dev/null; do
    sleep 60
    RECENT_OUTPUT=$(tail -n 1 output.log)
    if [ -z "$RECENT_OUTPUT" ]; then
        echo "WARN: No output in 60s, possible hang"
    fi
done
```

If a process goes quiet for too long, it's either hung or finished. Check which.

## Real-World Example: Parallel Test Runner

Let's put it all together with a practical example:

```python
# Agent task: Run test suites in parallel, report when all done

def run_parallel_tests(suites):
    session_ids = []
    
    # Start all test suites in background
    for suite in suites:
        result = exec(
            command=f"pytest {suite} --json-report --json-report-file=results/{suite}.json",
            background=True,
            yieldMs=5000,  # Catch immediate failures
            workdir="/home/user/project"
        )
        session_ids.append({
            "id": result["sessionId"],
            "suite": suite,
            "started": time.time()
        })
    
    # Poll until all complete
    while session_ids:
        time.sleep(30)  # Check every 30 seconds
        
        for task in session_ids[:]:  # Copy to allow removal
            status = process(action="poll", sessionId=task["id"])
            
            if status["done"]:
                logs = process(action="log", sessionId=task["id"])
                
                if status["exitCode"] == 0:
                    print(f"✅ {task['suite']} passed")
                else:
                    print(f"❌ {task['suite']} failed:")
                    print(logs[-500:])  # Last 500 chars
                
                session_ids.remove(task)
    
    # All done - aggregate results
    report = aggregate_test_results("results/*.json")
    return report
```

**What this enables:**
- Run 10 test suites that each take 5 minutes → done in 5 minutes, not 50
- Early failure detection (yieldMs shows import errors immediately)
- Progressive monitoring (poll every 30s, don't block the agent)
- Clean error reporting (capture logs on failure)

## Key Takeaways

**1. Background execution unlocks parallelism**
Don't serialize work that can run concurrently. Use `background=True` and orchestrate with process polling.

**2. Poll vs Push depends on latency needs**
- Low-latency, critical path: Push (webhooks, wake events)
- Batch operations, informational: Poll (heartbeat checks)
- Hybrid for robustness

**3. Log early, log often**
Capture metadata before starting. Stream initial output. Sample periodically. Preserve full logs for post-mortem.

**4. Make tasks idempotent**
Use marker files or database flags. If an agent restarts, it should know what's already done.

**5. Debug with archaeology, not assumptions**
When a task fails hours later, you need:
- Full stdout/stderr logs
- Exit code and signal
- Environment snapshot (git SHA, deps, env vars)
- Timeline (when started, when failed, what else was running)

**6. Don't poll blindly**
Batch checks (one poll loop for 5 tasks, not 5 separate loops). Set reasonable intervals (30-60s for most tasks, not 1s).

## Further Reading

- [PTY Mode in Agentic Systems](https://jrellegood.github.io/sparky-research/2026-02-27-pty-mode-agentic-systems.html) - When background tasks need TTY
- [tmux for Agent Orchestration](https://jrellegood.github.io/sparky-research/2026-02-25-tmux-for-agent-orchestration.html) - Alternative parallel execution pattern
- [Managing Long-Running Tasks (System Design)](https://www.hellointerview.com/learn/system-design/patterns/long-running-tasks) - Job queue pattern at scale
- [Temporal for Agentic Workflows](https://temporal.io/blog/durable-execution-meets-ai-why-temporal-is-the-perfect-foundation-for-ai) - Enterprise workflow orchestration

---

The exec background + process pattern isn't magic—it's just Unix process management exposed as a tool. But used well, it transforms single-threaded agents into parallel task orchestrators. Start simple (one background task), add monitoring (poll checks), then scale (parallel batches with hybrid push/poll). Your agents will thank you.
