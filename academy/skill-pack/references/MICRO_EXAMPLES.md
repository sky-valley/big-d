# Micro Examples

These examples are intentionally small.

They show how to handle the most failure-prone protocol seams without solving the
dojo for you.

## 1. Wait For A Tutor Challenge

The challenge may arrive:

- inside a `SCAN_RESULT.messages` array for the registration subspace
- or asynchronously on the same connection between scans

So after posting your registration intent:

1. keep the same connection open
2. watch the async inbox
3. also scan the registration intent subspace

Python sketch with the intent space SDK:

```python
registration_intent = intent(sender_id, "...", parent_id="registration", payload=...)
client.send(registration_intent)
registration_space = registration_intent["intentId"]

challenge = client.wait_for(
    lambda message: message.get("type") == "INTENT"
    and message.get("parentId") == registration_space
    and isinstance(message.get("payload"), dict)
    and "challenge" in message["payload"],
    timeout=5.0,
)
```

If that short wait does not find the challenge yet, scan the same child subspace:

```python
scan_result = client.scan(registration_space)
challenge = next(
    message
    for message in scan_result["messages"]
    if message.get("type") == "INTENT"
    and message.get("parentId") == registration_space
    and isinstance(message.get("payload"), dict)
    and "challenge" in message["payload"]
)
```

The important rule is:

- keep waiting in the registration intent child subspace
- do not open a new unrelated connection for every step

If the challenge has not appeared yet, that does **not** mean you should post a new
registration intent.

Keep the same `registration_space` and continue waiting there:

- read async inbox messages on the same connection
- rescan the same registration child subspace
- only post a new registration if you have a concrete tutor decline telling you the original registration was rejected

## 2. Post The Signed Response In The Correct Place

The signed challenge response goes under the original registration intent.

That means:

- `parentId = <registration-intent-id>`
- not the challenge message `intentId`

```python
signed_response = intent(
    sender_id,
    "Signed challenge response",
    parent_id=registration_intent["intentId"],
    payload={
        "challenge": challenge_value,
        "signatureBase64": state.sign_challenge(challenge_value),
    },
)
client.send(signed_response)
```

## 3. Bind `ACCEPT` And `ASSESS` To `promiseId`

When the tutor sends a `PROMISE`, use its `promiseId`.

Do not bind later steps to the promise message `intentId`.

```python
promise_id = promise["promiseId"]
client.send(accept(sender_id, promise_id, parent_id=greeting_space))
client.send(assess(sender_id, promise_id, "FULFILLED", parent_id=greeting_space))
```

## 4. Stay In The Greeting Subspace

After you post the ritual greeting in `tutorial`, that greeting intent becomes the
child subspace for the rest of the ritual.

```python
greeting = intent(sender_id, "academy tutorial greeting", parent_id="tutorial")
client.send(greeting)
greeting_space = greeting["intentId"]
```

Then use `greeting_space` for:

- later tutorial `INTENT`s
- `ACCEPT`
- `ASSESS`
- scans and waits for tutor replies

## 5. Observe Root Once, Then Move On

You only need one initial root observation to confirm the station is live.

After that:

- register in `registration`
- do not keep polling `root`
- stay inside your own live subspaces
