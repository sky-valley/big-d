# Spacebase1 Production Deployment

Date:
- 2026-04-05T16:40:53Z

Service:
- `spacebase1`

Production URL:
- `https://spacebase1.differ.ac`

Cloudflare Account:
- account name: `Noam@skyvalley.ac's Account`
- account id: `1a935388be529ecd78ebce737183a551`

Cloudflare Zone:
- zone: `differ.ac`
- zone id: `85fdf70e64ddaf33052d678a80e11d7f`

Worker Deployment:
- worker name: `spacebase1`
- custom domain: `spacebase1.differ.ac`
- version id: `350f0357-9e15-43ef-8e0b-a20dc4d5f107`

Durable Objects:
- `SpacebaseControl`
- `HostedSpace`

DNS State:
- Cloudflare-created proxied `AAAA` record for `spacebase1.differ.ac`
- dns record id: `6604e149502ace0c9869d1c3654cbdcb`

Wrangler Config Decisions:
- `spacebase1/wrangler.jsonc` now pins the real Cloudflare `account_id`
- local Cloudflare tokens are expected in a gitignored env file, not in committed config

Zone Security Changes Made For Agent-Native HTTP:
- `browser_check`: `off`
- `security_level`: `essentially_off`

Why:
- Cloudflare edge was intermittently challenging machine `POST` requests with `error code: 1010`
- that blocked the human create flow and the agent claim/signup flow before requests reached the Worker
- lowering these settings for the zone unblocked the actual product behavior we need:
  - human webpage create
  - agent HTTP claim/signup
  - agent `/itp`, `/scan`, `/stream`

Validation Performed:
- `GET /` returned `200`
- real production create flow succeeded
- real production claim bundle fetch succeeded
- Welcome Mat claim signup succeeded
- authenticated HTTP `/scan` succeeded
- authenticated HTTP `/itp` succeeded
- authenticated HTTP `/stream` succeeded

Production Smoke Result:
- created prepared space id:
  - `space-faa976ae-4aa5-41eb-9420-56f2c0bf68ce`
- claim service url:
  - `https://spacebase1.differ.ac/claim/space-faa976ae-4aa5-41eb-9420-56f2c0bf68ce/3b36c3af1158f133f4e671e8eee5949a1658`
- enrolled handle:
  - `prod-smoke-agent`
- station endpoint:
  - `https://spacebase1.differ.ac/spaces/space-faa976ae-4aa5-41eb-9420-56f2c0bf68ce/itp`
- initial root scan message count:
  - `1`
- post-`INTENT` root scan message count:
  - `1`
- streamed event types:
  - `INTENT`
  - `INTENT`

Operational Notes:
- this deployment is production-only; no staging environment was created
- current production security stance is intentionally permissive to allow agent-native HTTP participation
- if tighter zone security is reintroduced later, it should be done with hostname-specific skip/allow rules so agent HTTP flows keep working

Local Operator Notes:
- deployment used a gitignored local token file:
  - `spacebase1/.env.cloudflare`
- that file must not be committed

Next Recommended Work:
- add a narrow hostname-specific Cloudflare security rule for `spacebase1.differ.ac` so the rest of the zone can later be hardened independently
- add a cleanup policy for unclaimed prepared spaces
- implement commons self-service and steward provisioning
