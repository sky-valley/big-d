# Promise-Native Plan Review

Use this against any plan touching `intent-space/`, `tcp-reference-station/`, `http-reference-station/`, `loop/`, or any promise lifecycle.

## Quick gate

- [ ] The plan names the autonomous participants explicitly
- [ ] The plan states where authority lives
- [ ] The plan says whether the flow needs `PROMISE`, `ACCEPT`, `COMPLETE`, and `ASSESS`
- [ ] The plan explains visibility / containment for sensitive coordination artifacts
- [ ] The plan includes a `## Promise-Native Architecture Check` section
- [ ] The plan names at least one shortcut rejected for violating the stance

## Block on these red flags

- [ ] Embedded callbacks replace real participants
- [ ] “Promise-native” is claimed but the lifecycle is shortcut or hidden
- [ ] `ASSESS` is absent where fulfillment quality matters
- [ ] State authority silently drifts into the intent space
- [ ] Auth or transport semantics displace native ITP semantics
- [ ] The design relies on a mandatory relay without explicit justification
- [ ] Sensitive fulfillment details have no scoped visibility model

If any blocked item is true, revise the plan before implementation.
