---
name: graph
description: Run a FoxLog bug fix or feature as a graph of bounded nodes (one input, one output, one check each) instead of one long session, with a baseline, gates, and resumable state files. Invoke explicitly with /graph <bug or feature description>.
argument-hint: <bug or feature description>
disable-model-invocation: true
---

# /graph: bounded-node execution for FoxLog

Task: $ARGUMENTS

You are the lead. You plan, merge and keep the graph up to date yourself, and you give bounded work to subagents. The goal is a usable result plus enough state on disk that another session can resume or rerun it.

Adapted from Karpathy's autoresearch loop: measure a baseline first, give every node one scope and a fixed evaluator, change one thing at a time, keep what improves, record what failed, and use as few nodes as the job allows.

## 0. Orient (always)

1. Read `.github/instructions/copilot.instructions.md` (code conventions), `.claude/skills/graph/lessons.md` (rules learned in earlier runs), and `CLAUDE.md` if there is one.
2. `git status`, the current branch, and `git log --oneline -10`. If `.claude/runs/*/progress.md` exists for this task, this is a resume: read `graph.md` and `progress.md`, then continue from the recorded next action. Don't re-plan.
3. Work on a branch off `develop`: `fix/<slug>` for a bug, `feature/<slug>` for a feature. Don't touch `main` or `develop` directly.

## 1. Triage: does this need a graph?

If the change touches at most 2 files and has a single check (a typical bug fix), **don't build a graph**. Say so in one line and work directly, with the same discipline: reproduce or measure first, make the change, run the check, report the evidence. Use a graph only when the work has several independent parts or several distinct checks. Fewer nodes wins whenever the results would be comparable.

## 2. Fill the inputs

Derive these from the task and the code, and only ask the user when a missing detail would change the outcome (one focused question at a time):

| Input | FoxLog default |
|---|---|
| OUTPUT | files changed on the work branch |
| CHECKS | `node tests/test-call-tree-worker.js`, `node tests/test-diff-engine.js`, `node tests/run-fixtures.js --compare` when it exists, plus a task-specific check (a repro script, a grep, a UI preview scene) |
| SOURCES | the user's description, any log or screenshot they gave, `tests/flow-error-repro/` for generating real logs |
| SCOPE | the files the graph lists; never `manifest*.json` or `CHANGELOG.md` unless the task is about them |
| LIMIT | 3 correction attempts per node; stop and report if the whole run needs more than about 8 nodes |

## 3. Baseline

Before any edit, run every check and save the output to `.claude/runs/<slug>/baseline.txt`. For a bug, the baseline must **reproduce the bug**: a failing script, test or grep that shows it. If you can't reproduce it, stop and ask the user for the missing input (usually a real log) rather than fixing a guess.

## 4. Split into nodes, then pause

Write `.claude/runs/<slug>/graph.md` using this layout:

```markdown
# <task>
Completion: <checklist from CHECKS, each item pointing to observable evidence>

| Node | Kind | Reads | Writes (owns) | Check | Depends on |
|---|---|---|---|---|---|
| N1 | agent | ... | src/... | ... | - |
| N2 | code | ... | ... | ... | N1 |

Parallel groups: {N1, N3}, then {N2}
## Decisions
## Learned rules
```

Rules for the split:
- Split by what each node has to read, not by folder. Draw an edge only when a node consumes another node's output. Nodes with no edge between them run in parallel.
- **One owner per file.** Two nodes never write the same file. If two need to, merge them into one node.
- **Code nodes**: anything with exactly one correct answer (count, compare, sort, dedupe, grep, run tests, snapshot diff) is a script or a command that you run, never a subagent.
- FoxLog edits that must go together belong in the same node: a type list in `src/core/constants.js` and its copy in `src/workers/call-tree-worker.js`; the diff engine and its copy in `src/workers/log-diff-worker.js`; `manifest.json` and `manifest.firefox.json`.
- Any node that changes how a log event is parsed or classified goes to the `foxlog-log-verifier` agent if `.claude/agents/foxlog-log-verifier.md` exists. Otherwise, include its rule in the node spec: never guess a log format; prove it with a real log line.

**Stop here.** Show the user the graph (nodes, checks, parallel groups) and wait for approval before running anything.

## 5. Run the nodes

For each ready node, start a subagent (Agent tool) and give it only:
- the node spec: scope, the files it owns, the files it may read
- its inputs (paths)
- its check, as an exact command
- this instruction: "Edit only the files you own. Run the check on the saved files. Return the paths you wrote, PASS or FAIL, and the check's actual output as evidence."

Run independent nodes in parallel within a single message. Run code nodes yourself.

## 6. Gates

Every node output goes through a gate before anything downstream consumes it. A gate opens on evidence, checked in this order: the deterministic check first, then the node's report, and the model's confidence last. Record every result in `.claude/runs/<slug>/checks.md`:

```markdown
| Node | Requirement | Verdict | Evidence |
|---|---|---|---|
| N1 | worker tests pass | pass | `All call tree worker tests passed` |
```

The verdict is `pass`, `fail` or `unresolved`. Evidence is a file path or the actual command output. Leave missing evidence visible. Never weaken a check to get a pass.

**Correction edge**: on a failed gate, send only that node back to its own subagent with the reason, the evidence and the instruction "fix this node only". After 3 failed attempts, mark the node `unresolved` and continue with the nodes that don't depend on it.

**Learning edge**: when a result is accepted and it proves a reusable rule (for example "VALIDATION_* events have no second pipe"), add the rule to `.claude/skills/graph/lessons.md` so the next run starts from it.

## 7. Merge, commit, hand off

- Once a node passes its gate, commit its files on the work branch and push (`git push -u origin <branch>`). The container is ephemeral, so anything that isn't pushed is lost.
- After each stage, update `.claude/runs/<slug>/progress.md`:

```markdown
Graph: done N1, N3 | running N2 | blocked -
Outputs: <exact paths>
Decisions: <what changed in graph.md and why>
Open issues: <failures, uncertainties, blockers>
Next action: <next ready node>
```

- Ask before anything outside the branch: opening a PR, merging, bumping the version, editing store texts.

## 8. Completion and delivery

The run is done when every item in the completion checklist has evidence, every gate ran on the saved version, every failure is fixed or reported, and `graph.md` matches the nodes that actually ran. If a limit or blocker stops the run, return a partial status that names the exact nodes left.

Final report, in the user's language and kept short:
- what changed (paths), and the commit SHAs
- what was checked, what passed, and what is still unresolved, with evidence
- the rules added to `lessons.md`
- measured usage only if you actually have the numbers; never estimate savings

Then, in a final commit, delete `.claude/runs/<slug>/`: by then the durable lessons are in `lessons.md` and the decisions are in the commits.
