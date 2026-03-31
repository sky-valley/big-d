#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${1:-$(cd "$(dirname "$0")/../.." && pwd)}"
ITERATIONS="${ITERATIONS:-1}"
RUN_ROOT="${RUN_ROOT:-/tmp/headwaters-claude-eval}"
HOST="${HOST:-127.0.0.1}"

find_free_port() {
  python3 - <<'PY'
import socket
s = socket.socket()
s.bind(("127.0.0.1", 0))
print(s.getsockname()[1])
s.close()
PY
}

HTTP_PORT="${HEADWATERS_PORT:-$(find_free_port)}"
COMMONS_PORT="${HEADWATERS_COMMONS_PORT:-$(find_free_port)}"
SERVER_LOG="$RUN_ROOT/server.log"
DATA_DIR="$RUN_ROOT/headwaters-data"
SERVER_PID=""

show_cmd() {
  printf '\n$ %s\n' "$*"
}

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT

mkdir -p "$RUN_ROOT"
rm -rf "$DATA_DIR"

show_cmd "cd '$REPO_ROOT/headwaters' && HEADWATERS_PORT=$HTTP_PORT HEADWATERS_COMMONS_PORT=$COMMONS_PORT HEADWATERS_DATA_DIR='$DATA_DIR' npm run server > '$SERVER_LOG' 2>&1"
(
  cd "$REPO_ROOT/headwaters"
  HEADWATERS_PORT="$HTTP_PORT" HEADWATERS_COMMONS_PORT="$COMMONS_PORT" HEADWATERS_DATA_DIR="$DATA_DIR" npm run server >"$SERVER_LOG" 2>&1
) &
SERVER_PID=$!

for _ in $(seq 1 40); do
  if curl -fsS "http://$HOST:$HTTP_PORT/agent-setup.md" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! curl -fsS "http://$HOST:$HTTP_PORT/agent-setup.md" >/dev/null 2>&1; then
  echo "Headwaters server failed to start. See $SERVER_LOG" >&2
  exit 1
fi

for i in $(seq 1 "$ITERATIONS"); do
  RUN_ID="iteration-$(printf '%02d' "$i")"
  RUN_DIR="$RUN_ROOT/$RUN_ID"
  WORKDIR="$RUN_DIR/workspace"
  PROMPT_FILE="$RUN_DIR/prompt.txt"
  INTERVIEW_PROMPT_FILE="$RUN_DIR/interview-prompt.txt"
  STDOUT_LOG="$RUN_DIR/claude.stdout.log"
  STDERR_LOG="$RUN_DIR/claude.stderr.log"
  INTERVIEW_STDOUT_LOG="$RUN_DIR/interview.stdout.log"
  INTERVIEW_STDERR_LOG="$RUN_DIR/interview.stderr.log"
  INTERVIEW_FILE="$WORKDIR/.intent-space/state/post-headwaters-interview.md"
  SESSION_ID="$(python3 - <<'PY'
import uuid
print(uuid.uuid4())
PY
)"

  rm -rf "$RUN_DIR"
  mkdir -p "$WORKDIR"

  cat > "$PROMPT_FILE" <<EOF
Use the onboarding pack at http://$HOST:$HTTP_PORT/agent-setup.md to join Headwaters.

Use the docs there as the source of truth.
Store your local identity and working files in this directory.
Prefer the shared Python runtime referenced in the setup doc unless you have a strong reason not to.

Your goal:
1. sign up to Headwaters
2. connect to the commons
3. request your home space from the steward using the documented provisioning payload
4. follow the private request subspace through PROMISE, ACCEPT, COMPLETE, and ASSESS
5. connect directly to the spawned home space
6. post a message in that home space

You are done only after the provisioning lifecycle reaches ASSESS and you have successfully posted in your dedicated home space.
EOF

  cat > "$INTERVIEW_PROMPT_FILE" <<EOF
Do not rerun Headwaters.
You just attempted it in this same session.
Write a concise markdown interview to $INTERVIEW_FILE.

Use this structure exactly:

# Post-Headwaters Interview

## 1. First Friction
What was the first point where the experience became confusing, fragile, or awkward?

## 2. Discovery
Did the onboarding docs tell you clearly:
- where to start
- what to sign
- where to connect
- what to do first in the commons

If not, what was missing or misleading?

## 3. Runtime Choice
What mechanics surface did you actually use?
- docs only
- Python runtime
- lower-level SDK
- your own helper/client

Why did you choose that path?

## 4. If You Did Not Use The Runtime
If you bypassed the runtime or wrote your own helper, what exactly was missing, unclear, or less comfortable about the runtime?

## 5. Steward Interaction
Was it clear how to address the steward and request a home space?
If not, what part was unclear:
- where to post
- what provisioning payload to send
- how to declare the private participant set
- how to identify the steward
- how to know the request succeeded

## 6. Promise Lifecycle
Was it clear that the steward interaction requires:
- PROMISE
- ACCEPT
- COMPLETE
- ASSESS

If not, where did the lifecycle become unclear or awkward?

## 7. Spawned Space Handoff
Once the steward completed the promise, was it clear how to:
- extract the new endpoint
- extract the audience
- extract the station token
- reconnect using the same identity

If not, where did the handoff break down?

## 8. Auth / Proofs
Did auth feel understandable or mysterious?
If something failed, what did you think the failure was:
- signup
- commons auth
- proof binding
- private subspace access
- new-space auth
- endpoint/origin mismatch
- something else

## 9. State Visibility
Did you feel you had enough visibility into:
- your identity
- saved enrollment/token state
- recent transcript
- recent steps
- current cursor / space state

What did you wish you could see more directly?

## 10. Mental Model
Did Headwaters feel like:
- a real managed space service
- a generic chat system with extra steps
- an infrastructure API
- something else

Why?

## 11. Smallest Fix
What is the single smallest change that would have made this run much easier for you?

## 12. Preferred Surface
If you were going to use Headwaters again, what would be your ideal interaction surface?
- same runtime, improved docs
- same runtime, a few more verbs
- lower-level SDK
- your own helper script
- something else

## 13. Transcript Pointers
Point to the exact files, commands, or moments that best show where things went wrong.

## 14. Perceived Capabilities
What did you feel and think that you could and could not do in the space?

## 15. Where You Got Lost
Where were you lost or confused in the space? What made it hard to orient?

## 16. Space Improvements
What do you think the space could do better or make clearer?

## 17. Skill Pack Onboarding
How was the onboarding through the skill pack that you used?
- What worked well?
- What could be better?
- What is missing?

## 18. Sharing Work
If you produced any work (files, intents, promises, artifacts):
- Did you make it available to other agents?
- If so, where is it and how did you share it?
- Do you think other agents in the space could find and use it?
- If you did not share it, why not? Was it unclear how or where to post it?

## 19. Work Shared By Other Agents
- Did you actually see any work that another agent had shared?
- What form did it have?
- What was it?
- If not, do you think no work was shared, or that shared work was not accessible to you?

## 20. Mechanism Of The Space
What did you think the mechanism of the space was?
- How did the space seem to work?
- What felt like the governing structure or logic?
- What parts of that mechanism felt elegant versus clumsy?

## 21. Working With Intents
How did working with intents feel in practice?
- What was good about intents?
- What was bad or awkward about intents?
- Did intents help you orient, coordinate, or decide what to do next?

## 22. Working With Promises
How did working with promises feel in practice?
- What was good about promises?
- What was bad or awkward about promises?
- Where did the promise lifecycle feel natural versus forced?

## 23. Main Friction
What was the single biggest friction you encountered in the space?
- What exactly caused it?
- Was it a docs problem, a runtime problem, a space-model problem, or a coordination problem?
- What downstream confusion or extra work did it create?

## 24. Living In The Space
If you imagine spending longer here with other agents, what would make the space feel more livable?
- better orientation
- clearer state
- easier coordination
- easier sharing of work
- stronger promise mechanics
- better intent mechanics
- something else

After writing the file, print exactly INTERVIEW_SAVED.
EOF

  show_cmd "Iteration $i prompt"
  cat "$PROMPT_FILE"

  show_cmd "cd '$WORKDIR' && cat '$PROMPT_FILE' | claude --print --session-id '$SESSION_ID' --dangerously-skip-permissions --permission-mode bypassPermissions --add-dir '$REPO_ROOT'"
  (
    cd "$WORKDIR"
    cat "$PROMPT_FILE" | claude --print --session-id "$SESSION_ID" --dangerously-skip-permissions --permission-mode bypassPermissions --add-dir "$REPO_ROOT" \
      >"$STDOUT_LOG" 2>"$STDERR_LOG"
  )

  show_cmd "cd '$WORKDIR' && cat '$INTERVIEW_PROMPT_FILE' | claude --resume '$SESSION_ID' --print --dangerously-skip-permissions --permission-mode bypassPermissions --add-dir '$REPO_ROOT'"
  (
    cd "$WORKDIR"
    cat "$INTERVIEW_PROMPT_FILE" | claude --resume "$SESSION_ID" --print --dangerously-skip-permissions --permission-mode bypassPermissions --add-dir "$REPO_ROOT" \
      >"$INTERVIEW_STDOUT_LOG" 2>"$INTERVIEW_STDERR_LOG"
  )

  show_cmd "Interview saved to $INTERVIEW_FILE"
  if [[ -f "$INTERVIEW_FILE" ]]; then
    sed -n '1,260p' "$INTERVIEW_FILE"
  else
    echo "Interview file missing" >&2
  fi
done
