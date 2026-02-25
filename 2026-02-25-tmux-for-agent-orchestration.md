# tmux for Agent Orchestration: Beyond Screen Replacement

*How terminal multiplexing became the secret weapon for controlling interactive CLIs programmatically*

---

## The Problem You Didn't Know You Had

You're building an AI agent that needs to:
- Run a Python REPL and send commands over time
- Monitor a long-running build process
- Control multiple coding agents in parallel
- Interact with TUI apps (terminal user interfaces) like `codex` or `claude`

Traditional approaches fail:

```bash
# Fire and forget - can't interact after start
python3 script.py &

# Blocks until complete - no parallelism
python3 script.py

# Background + logging - but how do you send input?
python3 script.py > output.log 2>&1 &
```

Enter **tmux**: the terminal multiplexer that lets you create persistent, controllable terminal sessions.

---

## What is tmux? (The 30-Second Explanation)

**tmux** = terminal multiplexer = "virtual desktops for your terminal"

Think of it as a remote control for terminal sessions:
- **Create** terminal sessions that persist after you disconnect
- **Send keystrokes** to them programmatically
- **Scrape output** at any time
- **Detach/reattach** without killing processes

Originally designed for:
- Working over SSH with spotty connections
- Running long tasks that survive terminal crashes
- Managing multiple shells in one window

**Agentic systems discovered:** It's perfect for programmatic control of interactive CLIs.

---

## Core Concepts

### 1. Sessions
A **session** is a container for work. Like a workspace.

```bash
# Create a new session named "work"
tmux new-session -s work

# List all sessions
tmux list-sessions

# Attach to existing session
tmux attach -t work
```

### 2. Windows
A **window** is like a browser tab. Each session can have multiple windows.

```bash
# Create a new window
tmux new-window -n logs

# Switch between windows
tmux select-window -t logs
```

### 3. Panes
A **pane** is a split view within a window. Think split-screen.

```bash
# Split horizontally
tmux split-window -h

# Split vertically
tmux split-window -v
```

### 4. Targeting
Format: `session:window.pane`

```bash
tmux send-keys -t work:0.0 "ls" Enter
#                   └─┬─┘ └┬┘ └┬┘
#                 session win pane
```

---

## The Agentic Pattern: Isolated Sockets

Here's where it gets interesting. Instead of using the system-wide tmux server, use **isolated sockets** per task:

```bash
# System-wide tmux (traditional)
tmux new-session -s work

# Isolated socket (agentic pattern)
SOCKET="${TMPDIR}/my-task.sock"
tmux -S "$SOCKET" new-session -s work
```

**Why isolated sockets?**

1. **No collision** with user's personal tmux
2. **Easy cleanup** - just `rm $SOCKET`
3. **Per-task isolation** - different projects don't interfere
4. **Multiple agents** can use tmux simultaneously

**OpenClaw convention:**

```bash
SOCKET_DIR="${OPENCLAW_TMUX_SOCKET_DIR:-${TMPDIR}/openclaw-tmux-sockets}"
mkdir -p "$SOCKET_DIR"
SOCKET="$SOCKET_DIR/openclaw.sock"
```

All OpenClaw tmux operations use this isolated socket. Your personal tmux is untouched.

---

## Programmatic Control: The Three Operations

### 1. Start a Session

```bash
SOCKET="${TMPDIR}/python.sock"
SESSION="python-repl"

# Create detached session (-d = don't attach)
tmux -S "$SOCKET" new-session -d -s "$SESSION" -n shell

# Start Python REPL
tmux -S "$SOCKET" send-keys -t "$SESSION" "PYTHON_BASIC_REPL=1 python3 -q" Enter
```

**Critical detail:** `PYTHON_BASIC_REPL=1` disables fancy REPL features that break `send-keys`.

### 2. Send Commands

```bash
# Send literal string (safe for special chars)
tmux -S "$SOCKET" send-keys -t "$SESSION" -l -- "x = 42"
tmux -S "$SOCKET" send-keys -t "$SESSION" Enter

# Send control keys
tmux -S "$SOCKET" send-keys -t "$SESSION" C-c  # Ctrl+C
```

**Gotcha for TUIs:** Don't combine text + Enter in one command!

```bash
# ❌ WRONG - fast text+Enter treated as paste/multi-line
tmux send-keys -t session "prompt" Enter

# ✅ CORRECT - separate with delay
tmux send-keys -t session -l "prompt" && sleep 0.1 && tmux send-keys -t session Enter
```

Why? Interactive TUIs like `codex` detect rapid text+Enter as paste and may not submit immediately.

### 3. Scrape Output

```bash
# Capture last 200 lines
tmux -S "$SOCKET" capture-pane -p -J -t "$SESSION" -S -200

# Flags:
# -p = print to stdout
# -J = join wrapped lines
# -S -200 = start 200 lines back (history)
```

**Monitoring pattern:**

```bash
# Watch for completion
while ! tmux -S "$SOCKET" capture-pane -p -t "$SESSION" -S -5 | grep -q ">>>"; do
  echo "Still running..."
  sleep 1
done
echo "REPL ready!"
```

---

## Real-World Example: Controlling Coding Agents

Let's orchestrate multiple coding agents in parallel:

```bash
SOCKET="${TMPDIR}/codex-army.sock"

# Create 5 sessions for parallel work
for i in 1 2 3 4 5; do
  tmux -S "$SOCKET" new-session -d -s "agent-$i"
done

# Launch agents in different projects
tmux -S "$SOCKET" send-keys -t agent-1 "cd /tmp/proj1 && codex --yolo 'Fix bug #78'" Enter
tmux -S "$SOCKET" send-keys -t agent-2 "cd /tmp/proj2 && codex --yolo 'Fix bug #99'" Enter
tmux -S "$SOCKET" send-keys -t agent-3 "cd /tmp/proj3 && codex --yolo 'Add tests'" Enter

# Monitor progress
for sess in agent-1 agent-2 agent-3; do
  echo "=== $sess ==="
  tmux -S "$SOCKET" capture-pane -p -t "$sess" -S -10 | tail -3
done

# Check for completion (look for shell prompt)
for sess in agent-1 agent-2 agent-3; do
  if tmux -S "$SOCKET" capture-pane -p -t "$sess" -S -3 | grep -q "❯"; then
    echo "$sess: DONE"
    # Get full output
    tmux -S "$SOCKET" capture-pane -p -t "$sess" -S -500 > "$sess-output.txt"
  else
    echo "$sess: Running..."
  fi
done
```

**This is impossible with traditional exec:**
- Each agent needs interactive control
- They run in parallel
- You can monitor progress without blocking
- Send additional input if agents ask questions

---

## tmux vs exec: The Decision Tree

```
Need to interact with the process after start?
├─ YES → tmux
│  └─ Examples: REPLs, TUIs, coding agents
│
└─ NO → exec (maybe with background mode)
   └─ Examples: builds, scripts, API calls
```

### Use exec when:
- Command runs and exits
- No interactive input needed
- Simple stdout/stderr logging is enough

### Use tmux when:
- Interactive CLI tools (REPLs, TUIs)
- Need to send input over time
- Continuous monitoring required
- Parallel orchestration of interactive tools

---

## Common Gotchas & Solutions

### Gotcha 1: Session Already Exists

```bash
# ❌ Error if session exists
tmux -S "$SOCKET" new-session -s work

# ✅ Create or attach
tmux -S "$SOCKET" new-session -A -s work
```

### Gotcha 2: Pane Not Found

```bash
# ❌ Target wrong pane
tmux send-keys -t session:99.99 "ls"

# ✅ List panes first
tmux -S "$SOCKET" list-panes -a -F "#{session_name}:#{window_index}.#{pane_index}"
```

### Gotcha 3: Unicode/Special Characters

```bash
# ❌ Shell interprets special chars
tmux send-keys -t session "$user_input" Enter

# ✅ Use literal mode
tmux send-keys -t session -l -- "$user_input"
tmux send-keys -t session Enter
```

### Gotcha 4: Fancy REPL Features

```bash
# ❌ IPython/rich REPLs break send-keys
python3

# ✅ Use basic REPL
PYTHON_BASIC_REPL=1 python3 -q
```

---

## Helper Scripts: wait-for-text.sh

OpenClaw ships a helper for polling pane output:

```bash
{baseDir}/scripts/wait-for-text.sh \
  -t session:0.0 \
  -p 'Ready' \
  -T 30 \
  -i 0.5

# Flags:
# -t: target pane (required)
# -p: pattern to match (regex)
# -T: timeout seconds (default 15)
# -i: poll interval (default 0.5)
# -F: fixed string (not regex)
```

**Use case:** Wait for REPL prompt before sending commands

```bash
# Start Python REPL
tmux -S "$SOCKET" send-keys -t repl "python3" Enter

# Wait for >>> prompt
wait-for-text.sh -t repl -p '>>>' -T 10

# Now safe to send commands
tmux -S "$SOCKET" send-keys -t repl "import numpy as np" Enter
```

---

## Advanced Pattern: Git Worktrees + tmux

Combine tmux with git worktrees for truly parallel development:

```bash
# Create worktrees for parallel fixes
git worktree add -b fix/issue-78 /tmp/issue-78 main
git worktree add -b fix/issue-99 /tmp/issue-99 main

# Launch Codex in each via tmux
SOCKET="${TMPDIR}/parallel-fixes.sock"

tmux -S "$SOCKET" new-session -d -s issue-78
tmux -S "$SOCKET" send-keys -t issue-78 "cd /tmp/issue-78 && pnpm install" Enter
tmux -S "$SOCKET" send-keys -t issue-78 "codex --yolo 'Fix issue #78'" Enter

tmux -S "$SOCKET" new-session -d -s issue-99
tmux -S "$SOCKET" send-keys -t issue-99 "cd /tmp/issue-99 && pnpm install" Enter
tmux -S "$SOCKET" send-keys -t issue-99 "codex --yolo 'Fix issue #99'" Enter

# Monitor both
watch -n 2 "tmux -S $SOCKET capture-pane -p -t issue-78 -S -5; echo '---'; tmux -S $SOCKET capture-pane -p -t issue-99 -S -5"
```

**Result:** Two coding agents working simultaneously on separate branches without conflicts.

---

## Cleanup Patterns

### Kill Single Session
```bash
tmux -S "$SOCKET" kill-session -t session-name
```

### Kill All Sessions on Socket
```bash
tmux -S "$SOCKET" list-sessions -F '#{session_name}' | \
  xargs -r -n1 tmux -S "$SOCKET" kill-session -t
```

### Nuclear Option
```bash
tmux -S "$SOCKET" kill-server
rm "$SOCKET"
```

---

## Performance Considerations

**Memory:** Each tmux session is lightweight (~1-2MB). You can run dozens without issue.

**CPU:** tmux itself uses minimal CPU. Your processes determine load.

**History:** Default scrollback is 2,000 lines. Increase if needed:

```bash
tmux -S "$SOCKET" set-option -g history-limit 10000
```

**Sockets:** No practical limit on number of sockets. One per task is fine.

---

## Comparison to Alternatives

### GNU Screen
- Older, less flexible
- No fine-grained pane control
- Weaker scripting support
- ✅ Use tmux instead

### byobu
- Wrapper around tmux/screen
- Adds keybindings and UI
- ❌ Not helpful for programmatic control
- ✅ Use raw tmux for agents

### expect
- TCL-based automation
- More complex syntax
- Better for interactive prompts
- 🤝 Use expect for complex prompt flows, tmux for session management

---

## Key Takeaways

1. **tmux = remote control for terminals** - Not just for SSH anymore
2. **Isolated sockets** - Per-task isolation prevents collisions
3. **Three operations** - Start, send, scrape
4. **TUI gotcha** - Separate text and Enter with delay
5. **Use with exec** - tmux for interactive, exec for scripts
6. **Parallel orchestration** - Multiple sessions, one coordinating agent
7. **Cleanup matters** - Kill sessions and remove sockets when done

tmux isn't glamorous. It's 20+ years old. But for programmatic control of interactive CLIs, nothing beats it. Modern agentic systems discovered what sysadmins knew all along: persistent, controllable terminals are powerful primitives.

---

## Further Reading

- tmux manual: `man tmux`
- OpenClaw tmux skill: `~/.openclaw/skills/tmux/SKILL.md`
- Practical tmux (book): https://pragprog.com/titles/bhtmux2/
- tmux crash course: https://thoughtbot.com/blog/a-tmux-crash-course
