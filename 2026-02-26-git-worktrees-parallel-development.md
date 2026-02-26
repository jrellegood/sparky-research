# Git Worktrees: The Secret Weapon for Parallel Development

**For:** Engineers running multiple coding agents, juggling hotfixes, or just tired of context switching  
**Runtime:** 7 min read  
**Date:** 2026-02-26

---

## The Context-Switching Tax

You're deep in a refactor. Tests are passing. Code is clean. Then: "Production is down, urgent hotfix needed."

Your options suck:

```bash
# Option 1: Commit half-baked work
git add . && git commit -m "WIP: this breaks everything"
git checkout main

# Option 2: Stash and pray
git stash
git checkout main
# Fix the bug
git checkout feature-branch
git stash pop  # merge conflicts incoming...

# Option 3: Clone the repo again
cd ..
git clone git@github.com:yourorg/project.git project-hotfix
cd project-hotfix
git checkout main
```

All three options are bad. The first pollutes history. The second risks merge conflicts. The third wastes disk space and loses local configuration.

**Git worktrees** solve this. They let you work on multiple branches simultaneously in separate directories, all sharing the same Git history.

## What Are Worktrees?

Think of your repository as a library. Traditionally, Git gives you one reading room where you can only read one book (branch) at a time. Want to reference another book? Close the current one, fetch the other, open it.

Worktrees are like having multiple reading rooms. Same library, same books, but you can have different books open in different rooms simultaneously.

Concretely:

```bash
project/                    # Main repo (feature-branch)
├── src/
├── README.md
└── .git/                   # The actual Git database

project-hotfix/             # Worktree (main branch)
├── src/                    # Same files, different state
├── README.md
└── .git                    # File pointing to main .git/

project-experiment/         # Another worktree (experimental branch)
├── src/
├── README.md
└── .git
```

All three directories share the same Git history (objects, commits, branches). But each can have different files checked out.

## The Basic Workflow

### Creating a Worktree

```bash
# You're on feature-branch, urgent hotfix needed
git worktree add ../project-hotfix main

# This creates:
# - New directory at ../project-hotfix
# - Checks out 'main' branch there
# - Links it to your main .git directory
```

Now you can:

```bash
# In one terminal
cd ~/project
# Continue feature work

# In another terminal
cd ~/project-hotfix
# Fix the bug, commit, push
git add . && git commit -m "Fix critical bug"
git push origin main
```

**No context switch.** No stashing. No losing your place.

### Listing Worktrees

```bash
$ git worktree list

/home/you/project           bd54845 [feature-branch]
/home/you/project-hotfix    a1b2c3d [main]
/home/you/project-experiment 4e5f6a7 [experimental]
```

### Cleaning Up

```bash
# When done with the hotfix
cd ~/project
git worktree remove ../project-hotfix

# Or force removal (nukes uncommitted changes)
git worktree remove --force ../project-hotfix

# Clean up stale worktree references
git worktree prune
```

## Real-World Patterns

### Pattern 1: Parallel AI Coding Agents

You're orchestrating multiple Claude Code sessions to tackle different issues:

```bash
# Main repo stays on develop
cd ~/myapp

# Spawn worktrees for each agent
git worktree add ../myapp-issue-123 -b fix/auth-bug
git worktree add ../myapp-issue-124 -b feat/api-v2
git worktree add ../myapp-issue-125 -b refactor/models

# Launch agents in tmux
tmux new-session -d -s agent-123 -c ~/myapp-issue-123
tmux send-keys -t agent-123 "claude" Enter

tmux new-session -d -s agent-124 -c ~/myapp-issue-124
tmux send-keys -t agent-124 "claude" Enter

tmux new-session -d -s agent-125 -c ~/myapp-issue-125
tmux send-keys -t agent-125 "claude" Enter
```

Each agent gets:
- Isolated environment
- No risk of stepping on each other
- Independent test runs
- Parallel commits

When done, review each worktree, merge the good ones, nuke the experiments.

### Pattern 2: PR Review + Testing

You need to review a PR while keeping your current work intact:

```bash
# Create worktree from PR branch
git fetch origin pull/456/head:pr-456
git worktree add ../myapp-pr-review pr-456

# In another terminal
cd ~/myapp-pr-review
npm test  # Run tests in isolation
npm start # Fire up dev server on port 3000

# Meanwhile, in main repo
cd ~/myapp
# Continue your work on port 3001
```

No branch switching. Both environments running simultaneously. Compare implementations side-by-side in your IDE.

### Pattern 3: Speculative Work

Try multiple approaches without committing to any:

```bash
git worktree add ../project-approach-a -b experiment/approach-a
git worktree add ../project-approach-b -b experiment/approach-b

# Implement both, benchmark them
cd ~/project-approach-a
# ... write code ...
hyperfine './bench.sh'

cd ~/project-approach-b
# ... write code ...
hyperfine './bench.sh'
```

Keep the winner, delete the loser. No stash juggling, no `git reset --hard` anxiety.

### Pattern 4: Long-Running Build Monitoring

```bash
# Kick off slow build in worktree
git worktree add ../myapp-ci main
cd ~/myapp-ci
./run-full-test-suite.sh  # Takes 30 minutes

# Meanwhile, continue feature work
cd ~/myapp
# Keep coding while tests run
```

When tests finish, you haven't lost context.

## Worktrees vs Branches: When to Use Each

### Use Branches When:
- You're working on **one thing at a time**
- Context switching is rare
- You're comfortable with stashing
- Disk space is tight

### Use Worktrees When:
- You're running **multiple coding agents**
- You frequently **compare implementations**
- You need to **review PRs** while keeping current work
- You want **parallel test runs**
- You're doing **speculative experiments**

## Advanced Tips

### 1. Create Worktree + New Branch in One Command

```bash
# Creates worktree and new branch based on main
git worktree add -b new-feature ../project-feature main
```

### 2. Locked Worktrees (for Network Drives)

```bash
# Prevent auto-cleanup for worktrees on removable media
git worktree lock ../project-external
```

### 3. Move a Worktree

```bash
# Oops, created in wrong location
git worktree move project-hotfix ../better-location/project-hotfix
```

### 4. Repair Broken Links

```bash
# Manually moved a worktree? Fix the references
git worktree repair ../manually-moved-worktree
```

### 5. Shared .git for Faster Clones

Worktrees share the `.git` directory, so:
- **Disk usage:** Mostly just working files (2x-3x cheaper than cloning)
- **Fetch/pull:** Updates are shared across all worktrees
- **Branch checkout:** Instant (no fetch needed)

## Gotchas

### 1. Same Branch Can't Be Checked Out Twice

```bash
git worktree add ../project-copy main
# Error: 'main' is already checked out at '/home/you/project'
```

Solution: Create a new branch or use a detached HEAD:

```bash
git worktree add ../project-copy -b main-copy main
# or
git worktree add --detach ../project-copy main
```

### 2. Submodules Need Manual Init

```bash
git worktree add ../project-feature feature-branch
cd ../project-feature
git submodule update --init --recursive  # Don't forget!
```

### 3. Worktrees Are Local

Worktrees exist on your machine only. They're not in `.git/config`, they're in `.git/worktrees/`. When you clone on another machine, you start fresh.

## The Agentic Multiplier

Here's why worktrees are a game-changer for AI-assisted development:

**Before:** You ask Claude Code to refactor a module. Halfway through, you realize you want to try a different approach. You either interrupt the agent or let it finish and start over.

**With worktrees:**

```bash
git worktree add ../project-refactor-v1 -b refactor/v1
git worktree add ../project-refactor-v2 -b refactor/v2

# Run two Claude sessions simultaneously
tmux new -s claude-v1 -c ~/project-refactor-v1
tmux new -s claude-v2 -c ~/project-refactor-v2
```

**Result:** Two agents, two approaches, zero interference. Compare results, merge the winner.

Or run three agents on three different issues while keeping `main` pristine for urgent hotfixes. Your throughput just tripled.

## The One-Liner Workflow

```bash
# Create worktree for task
wt() { git worktree add ../"$(basename "$PWD")-$1" -b "$1"; }

# Usage
wt fix/auth-bug      # Creates ../myapp-fix/auth-bug with branch fix/auth-bug
wt feat/api-v2       # Creates ../myapp-feat/api-v2 with branch feat/api-v2

# Clean up when done
git worktree remove ../"$(basename "$PWD")-fix/auth-bug"
```

Add to `.bashrc` or `.zshrc`.

## Summary

Git worktrees are like tmux for your repository. Same history, parallel sessions, instant switching.

**Core insight:** Branches are for managing code history. Worktrees are for managing **your attention**.

Stop paying the context-switching tax. Start thinking in parallel.

---

## Further Reading

- [Official Git Worktree Docs](https://git-scm.com/docs/git-worktree)
- [VS Code Git Worktree Support](https://code.visualstudio.com/updates/v1_103#_git-worktree-support) (added July 2025)
- [Git Worktrees with Submodules](https://gist.github.com/ashwch/946ad983977c9107db7ee9abafeb95bd)

**Tags:** git, productivity, agentic-systems, parallel-development, workflow

**Word count:** ~1,500