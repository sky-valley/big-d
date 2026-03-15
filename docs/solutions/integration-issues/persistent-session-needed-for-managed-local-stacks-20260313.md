---
title: "Persistent Session Needed for Managed Local Stacks Under Codex"
date: 2026-03-13
category: integration-issues
component: tooling
tags: [codex, local-dev, process-management, skills, intent-space]
severity: medium
root_cause: "Detached background processes started from the tool runner were reaped when the command exited, so the local academy, station, and tutor stack appeared to start and then disappeared."
---

# Persistent Session Needed for Managed Local Stacks Under Codex

## Problem

We created a reusable local-station skill to start the academy HTTP server, the `intent-space` TCP station, and the tutor in one command. The first implementation used `nohup ... &` plus PID tracking in `/tmp`, which looked correct in a normal shell but failed under Codex: the startup command returned success, then all three processes vanished.

We also hit a smaller startup race where the tutor tried to connect before the station had opened its TCP port.

## Root Cause

There were two issues:

1. Detached backgrounding was the wrong execution model for this tool runner. Once the elevated command finished, child processes were not reliably preserved as independently managed daemons.
2. The tutor was launched immediately after the station process, without waiting for the TCP listener to become reachable.

So the scripts were valid shell, but invalid for this runtime model.

## Solution

We changed the operational pattern rather than only patching the scripts.

### What worked

- Keep the academy, station, and tutor inside one long-lived elevated PTY session.
- Start the three processes in that session.
- Add a bounded wait for the station TCP port before launching the tutor.
- Keep the session alive with a long sleep loop and a `trap` that kills all three child processes on exit.

That produced a stable managed stack:

- academy: `http://localhost:8080/agent-setup.md`
- station: `tcp://127.0.0.1:4000`

### What changed in the skill guidance

The `intent-space-local-station` skill should now distinguish between two environments:

- **User shell:** detached background scripts are acceptable.
- **Codex tool runner:** prefer one persistent managed session over `nohup`/PID-file orchestration.

The skill should explicitly request elevated execution immediately for these local runtime commands.

## Prevention Tip

When a skill is responsible for long-running local services, document the expected process-lifetime model of the environment. Do not assume shell-style daemonization survives a managed tool runner. If the runner owns the lifecycle, keep the stack inside one explicit long-lived session and stop it by ending that session.

## Related Documentation

- [docs/runbooks/internet-intent-space-station.md](/Users/noam/work/skyvalley/big-d/docs/runbooks/internet-intent-space-station.md)
- [docs/plans/2026-03-13-001-feat-internet-intent-space-station-plan.md](/Users/noam/work/skyvalley/big-d/docs/plans/2026-03-13-001-feat-internet-intent-space-station-plan.md)
