# Intent Space — Hackathon Page

Pre-event landing page for the Sky Valley intent space hackathon. Single-page Next.js 15 app, light + warm aesthetic, designed to be sent in a Luma blast 48-72 hours before the event so curious attendees can pre-warm.

Deployed to **[hack.memetic.software](https://hack.memetic.software)** via Cloudflare Workers Static Assets.

## Run locally

```bash
cd hackathon
npm install
npm run dev
# open http://localhost:3030
```

## Live commons feed

The "See it" section on the landing page links out to `spacebase1.differ.ac`, where the live commons panel renders agent activity directly on the spacebase1 homepage. The hackathon page intentionally **does not** embed the feed itself — see `docs/solutions/architecture-patterns/public-read-surface-for-protocol-bound-state-2026-04-25.md` for the rationale (display surface lives where the data lives; the hackathon page links rather than duplicates).

If you previously saw an `<ObservatoryFeed />` component or a `NEXT_PUBLIC_OBSERVATORY_ENDPOINT` env var referenced in this readme, that's the older shape from before the public commons feed shipped on spacebase1. Both are gone.

## Design intent

- Light, warm cream background (`#fafaf7`), warm charcoal text, muted terracotta accent
- Type stack: Inter Tight (display), Inter (body), JetBrains Mono (code), Crimson Pro Italic (asides)
- One long page, generous vertical rhythm, asymmetric verb layout (`enter` gets the wide cell because it's the differentiating verb)
- Duet challenge gets hero card treatment; other challenges as a 3-up secondary grid
- Restrained motion: hover transitions on cards. No embedded feed, no scroll-jacking, no parallax, no Lottie.

The page is meant to be screenshottable — the OG image story (`metadata.openGraph` not yet configured) should likely be the hero line + the spacebase1 CTA card.

## Deploy

Auto-deploys to Cloudflare Workers Static Assets on push to `main`. The full recipe is documented at:

> `docs/solutions/tooling-decisions/nextjs-static-on-cloudflare-workers-static-assets-2026-04-25.md`

Short version: `output: 'export'` in `next.config.mjs` + sibling `wrangler.jsonc` with `[assets].directory = "./out"` + Workers Builds CI configured with `Path: hackathon/`. Custom domain `hack.memetic.software` is wired through the Worker's Settings → Domains & Routes panel; DNS auto-provisions because `memetic.software` is on Cloudflare.

For a manual deploy from a local checkout (e.g. emergency fix outside CI):

```bash
cd hackathon
npm install
npm run build
npx wrangler deploy
```

## File map

```
hackathon/
├── app/
│   ├── layout.tsx        fonts + html shell
│   ├── page.tsx          full page composition + small inline components
│   └── globals.css       tailwind base + body styles
├── package.json
├── next.config.mjs       static export config
├── wrangler.jsonc        Workers Static Assets config
├── tailwind.config.ts    design tokens (colors, fonts, animations)
├── postcss.config.mjs
├── tsconfig.json
└── README.md
```
