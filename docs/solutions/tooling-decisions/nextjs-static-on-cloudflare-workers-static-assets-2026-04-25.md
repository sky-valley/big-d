---
title: Deploying a Next.js static site on Cloudflare Workers Static Assets, with monorepo CI
date: 2026-04-25
category: docs/solutions/tooling-decisions
module: hackathon
problem_type: tooling_decision
component: tooling
severity: medium
applies_when:
  - "Deploying a static-friendly Next.js site (no server-rendered API routes)"
  - "Project lives in a subdirectory of a monorepo"
  - "Want CI/CD via GitHub push without managing a separate Pages project"
  - "Custom domain is on a Cloudflare-managed zone"
related_components:
  - documentation
tags:
  - cloudflare
  - cloudflare-workers
  - workers-static-assets
  - workers-builds
  - nextjs
  - static-export
  - monorepo
  - ci
  - hackathon
---

# Deploying a Next.js static site on Cloudflare Workers Static Assets, with monorepo CI

## Context

We needed to ship the hackathon landing page (`hack.memetic.software`) from a new `hackathon/` subdirectory inside the existing `big-d` monorepo. The page is a Next.js 15 app that's substantially static — server components rendered at build time, one client component for the live commons feed. There's no server-side API surface that needs runtime execution.

Three deploy options were on the table:

1. **Vercel** — Next.js's canonical host. Fast, well-supported, and what `hackathon/README.md` initially recommended.
2. **Cloudflare Pages with the Next.js framework adapter** — Pages auto-detects Next.js and runs it via Cloudflare's adapter. Handles dynamic routes, ISR, edge functions.
3. **Cloudflare Workers with Static Assets** — full Worker that serves a `./out` directory via the `[assets]` directive in `wrangler.jsonc`. Static-only.

We picked option 3. The reasoning: spacebase1 (the other CF Worker in big-d) was already on Cloudflare and the `memetic.software` zone was on Cloudflare DNS — so the custom domain would auto-wire without leaving the dashboard. The page is static enough that the framework adapter overhead wasn't earning its keep. And we wanted Workers Builds CI on push to main, scoped to just the `hackathon/` subtree, so an unrelated commit elsewhere in big-d wouldn't trigger a redeploy.

The recipe end-to-end: `output: 'export'` in `next.config.mjs` + a sibling `wrangler.jsonc` with `[assets].directory = "./out"` + Workers Builds with `Path: hackathon/` + custom domain via the Worker's Domains & Routes panel. Verified working: push to main → Workers Builds rebuilds only the hackathon subtree → wrangler deploys the static export → DNS auto-wires the custom domain → SSL automatic. ~1 minute end-to-end.

## Guidance

When deploying a static-friendly Next.js site from a monorepo subdirectory to Cloudflare, use Workers Static Assets — not Pages, not the Next.js framework adapter. The recipe is four files and four dashboard settings.

### The four files

**1. `next.config.mjs`** — switch Next into static-export mode:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Emits ./out/ at build time. Workers serves it via [assets] in wrangler.jsonc.
  output: 'export',
  // Image optimization needs a runtime; static export disables it.
  images: { unoptimized: true },
  // Each route becomes a directory with index.html — friendlier to static hosts.
  trailingSlash: true,
};

export default nextConfig;
```

**2. `wrangler.jsonc`** — sibling Worker config:

```jsonc
{
  // Worker name as it appears in the Cloudflare dashboard.
  "name": "big-d",
  "compatibility_date": "2024-12-30",
  // Static assets served directly from ./out (Next.js static export).
  // No Worker entry script — Cloudflare serves the files as-is.
  "assets": {
    "directory": "./out",
    "not_found_handling": "404-page"
  }
}
```

`not_found_handling: "404-page"` makes Workers serve `./out/404.html` for any missing route, which is what Next's static export emits.

**3. `package.json`** — standard Next scripts; nothing CF-specific:

```json
{
  "scripts": {
    "dev": "next dev --port 3030",
    "build": "next build",
    "start": "next start --port 3030",
    "typecheck": "tsc --noEmit"
  }
}
```

**4. `.gitignore`** — exclude the build output:

```
node_modules/
.next/
out/
build/
.env*.local
.DS_Store
*.tsbuildinfo
next-env.d.ts
```

### The four dashboard settings

In Cloudflare Workers Builds → Settings → Build:

- **Git repository** — connected via the Cloudflare GitHub App. Install on the org, grant access to the specific repo only.
- **Path: `hackathon`** — *critical for monorepos*. This makes the build trigger only on changes inside `hackathon/`, and runs the build commands from inside that directory. Without this, Workers Builds runs from the repo root, can't find `package.json`, and fails with `ENOENT`.
- **Build command: `npm install && npm run build`** — vanilla npm.
- **Deploy command: `npx wrangler deploy`** — picks up the sibling `wrangler.jsonc` automatically.

For the custom domain: in the Worker's Settings → Domains & Routes → Add → Custom domain → enter `hack.memetic.software`. Cloudflare auto-creates the proxied DNS record because the zone is on Cloudflare. SSL certificate provisions automatically. Total time: ~30 seconds + a few minutes of cert propagation.

## Why This Matters

The recipe is small but the choice between options 1/2/3 has real implications.

**Why not Vercel:**
- Adds a second account, second dashboard, second billing surface.
- The custom domain CNAME would need to point off-Cloudflare; we'd lose the in-zone DNS automation.
- No genuine win in build times or DX for a static site this size.

**Why not Pages with the Next.js adapter:**
- The adapter runs a thin runtime per request. For a page with no server logic, this is overhead that buys nothing.
- The Pages product line and Workers product line are converging; new infrastructure work (Workers Builds, the new CI surface, the monorepo path filtering) lands on the Workers side first.
- Workers Static Assets is genuinely simpler — `[assets].directory` and you're done; no adapter, no runtime, no streaming SSR considerations.

**Why monorepo path filtering matters:**
- Without `Path: hackathon/`, every commit anywhere in `big-d` would trigger the hackathon build. With ~7 active subprojects, that's a ~10× wasted-build multiplier.
- The `Path:` setting also makes the build commands run from the subdirectory, which is what makes `npm install` find `package.json`. The first build I ran without this setting failed instantly with `npm error enoent Could not read package.json: Error: ENOENT: no such file or directory, open '/opt/buildhome/repo/package.json'`. Setting `Path: hackathon` fixed it on the next push.

**Why the sibling pattern (Workers Static Assets next to a full Worker) is fine:**
- spacebase1 is a full Worker with Durable Objects, deployed via manual `wrangler deploy` ([runbook](../../runbooks/2026-04-05-spacebase1-production-deployment.md)). hackathon is static-only with Workers Builds CI. Both live in the same Cloudflare account, same zone, with no interaction between them.
- Each Worker has its own `wrangler.jsonc` and its own deploy lifecycle. The monorepo only matters at the source-of-truth level; the deploy units are independent.

**Where the recipe stops working:**
- The moment the Next.js page needs server-rendered API routes, Server Actions, or middleware, `output: 'export'` is no longer viable. At that point the right move is `@opennextjs/cloudflare` adapter + drop the `[assets]`-only config. We are not at that point and probably won't be.
- `NEXT_PUBLIC_*` env vars get baked in at build time, not runtime. If the value needs to change without a redeploy, Workers Static Assets doesn't help — you'd need a runtime adapter or a small fetch-from-config-endpoint pattern.

## When to Apply

- The Next.js site doesn't need a runtime (no API routes, no Server Actions, no middleware that does anything beyond rewrites).
- The project lives in a monorepo subdirectory and you want path-filtered CI builds.
- The custom domain is on a Cloudflare-managed zone (or you're willing to point CNAME to `*.workers.dev`).
- You already have other Workers in the same account; consolidating on Cloudflare keeps the operational surface smaller.

Do not apply when:

- You need any runtime behavior (use `@opennextjs/cloudflare` instead, or Pages with the Next.js adapter).
- You want PR preview deployments — Workers Builds supports this via "non-production branch deploy command" but it's less polished than Vercel's preview URLs as of this writing.
- You're already deeply on Vercel and migrating costs more than it saves.

## Examples

### The deploy in this session, as a step list

```
1. cd hackathon/
2. npm install                    # local, just to typecheck
3. write next.config.mjs (above)
4. write wrangler.jsonc (above)
5. push to main
6. Cloudflare dashboard → Workers Builds → Create application
   → Connect GitHub repo (via Cloudflare GitHub App)
   → Configure: Path = hackathon, Production branch = main
   → Build command: npm install && npm run build
   → Deploy command: npx wrangler deploy
7. First build runs automatically; check logs
8. Worker now live at https://big-d.{your-subdomain}.workers.dev
9. Settings → Domains & Routes → Add → Custom domain → hack.memetic.software
10. Wait ~30 sec for cert; verify with curl
```

### Sibling deployment matrix in big-d

| Worker | Type | Wrangler config | CI | Deploy trigger |
|---|---|---|---|---|
| `spacebase1` | Full Worker + Durable Objects | `spacebase1/wrangler.jsonc` | none | manual `wrangler deploy` |
| `big-d` (hackathon) | Static Assets only | `hackathon/wrangler.jsonc` | Workers Builds | push to `main` (path-filtered) |

The two siblings share an account but have entirely separate deploy lifecycles. spacebase1's CI follow-up (give it Workers Builds too, with `Path: spacebase1/`) would mirror this same pattern — same recipe with a different `Path:` and the spacebase1 deploy command (`npx wrangler deploy` from a Worker config that includes Durable Objects bindings).

### Build-failure debugging note

The most likely failure mode for a fresh setup is forgetting to set `Path: hackathon/`. The build will fail at the `npm install` step with `npm error enoent Could not read package.json: Error: ENOENT: no such file or directory, open '/opt/buildhome/repo/package.json'`. Fix is one dashboard setting; nothing in the code needs to change.

The second-most-likely failure mode is forgetting `images: { unoptimized: true }`. Static export will fail with `Error: Image Optimization using the default loader is not compatible with \`{ output: 'export' }\``. Fix is in `next.config.mjs`.

## Related

**Companion docs (sibling Worker, different shape):**

- `docs/runbooks/2026-04-05-spacebase1-production-deployment.md` — how the other CF Worker in big-d gets deployed; manual wrangler from `spacebase1/`. Useful for understanding the *shared* pieces (custom domain via Cloudflare Domains & Routes; account_id pinning) and the *different* pieces (full Worker vs static assets, manual vs CI).
- `spacebase1/wrangler.jsonc` — sibling config showing the full-Worker shape (Durable Objects bindings, vars) for contrast.
- `hackathon/wrangler.jsonc` — the static-only config introduced by this recipe.
- `hackathon/next.config.mjs` — the static-export config introduced by this recipe.
- `hackathon/README.md` — the subproject's own readme; updated alongside this doc to point at the CF Workers Static Assets recipe instead of the prior "Drop on Vercel as-is" placeholder.

**Strategic context (why the public hackathon page exists at all):**

- `docs/plans/2026-03-24-003-feat-headwaters-public-hackathon-hosting-plan.md` — the upstream plan that motivates having a public-facing artifact for the hackathon. Different deploy target (DigitalOcean, for spawned spaces) but same operating constraint (must work for external visitors over the internet).

**Related design choice on the same hackathon page:**

- `docs/solutions/architecture-patterns/public-read-surface-for-protocol-bound-state-2026-04-25.md` — the public commons feed pattern that the hackathon page depends on for its "see it" call to action. The deploy recipe and the public-feed pattern were shipped together on 2026-04-25.
