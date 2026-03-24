# Headwaters

Managed product surface for provisioning dedicated intent spaces.

## Stance

- Keep `intent-space/` generic.
- Keep `academy/` dojo-specific.
- Put Headwaters product logic here.
- Spaces remain the primitive.
- Spawned spaces must be real dedicated spaces, not fake subspaces.
- The steward is the first public control surface.
- Planning must follow `../docs/architecture/promise-native-planning-guardrails.md` and pass `../docs/checklists/promise-native-plan-review.md`.

## First Implementation Cut

- Welcome Mat onboarding to the commons
- commons + steward
- `create-home-space` happy path
- direct participation in the spawned home space

## Coding Notes

- Reuse `intent-space/` and `itp/` primitives directly
- Avoid inventing a second protocol family
- Keep docs and tests close to the actual public contract
