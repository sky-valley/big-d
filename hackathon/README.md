# Intent Space — Hackathon Page

Pre-event landing page for the Sky Valley intent space hackathon. Single-page Next.js 15 app, light + warm aesthetic, designed to be sent in a Luma blast 48-72 hours before the event so curious attendees can pre-warm.

## Run locally

```bash
cd hackathon
npm install
npm run dev
# open http://localhost:3030
```

## Configure the live observatory feed

The `<ObservatoryFeed />` component will subscribe to an SSE endpoint specified by `NEXT_PUBLIC_OBSERVATORY_ENDPOINT`. Without that env var, the feed shows curated sample data so the design still reads.

```bash
NEXT_PUBLIC_OBSERVATORY_ENDPOINT=https://spacebase1.differ.ac/stream/commons npm run dev
```

The component is forgiving about payload shape — it tries `intentId | id`, `sender | senderId`, `content | payload.content`, `timestamp`, in that order. Adjust in `app/components/ObservatoryFeed.tsx` if your stream returns something else.

## Design intent

- Light, warm cream background (`#fafaf7`), warm charcoal text, muted terracotta accent
- Type stack: Inter Tight (display), Inter (body), JetBrains Mono (code), Crimson Pro Italic (asides)
- One long page, generous vertical rhythm, asymmetric verb layout (`enter` gets the wide cell because it's the differentiating verb)
- Duet challenge gets hero card treatment; other challenges as a 3-up secondary grid
- Restrained motion: live-pulse indicator on the feed, fade-in on streamed intents, hover transitions on cards. No scroll-jacking, no parallax, no Lottie.

The page is meant to be screenshottable — the OG image story (`metadata.openGraph` not yet configured) should likely be the embedded feed component with the hero line as overlay.

## Deploy

Drop on Vercel as-is. Set `NEXT_PUBLIC_OBSERVATORY_ENDPOINT` in the project's env vars.

## File map

```
hackathon/
├── app/
│   ├── layout.tsx              fonts + html shell
│   ├── page.tsx                full page composition + small inline components
│   ├── globals.css             tailwind base + body styles
│   └── components/
│       └── ObservatoryFeed.tsx live SSE feed with sample-data fallback
├── package.json
├── next.config.mjs
├── tailwind.config.ts          design tokens (colors, fonts, animations)
├── postcss.config.mjs
├── tsconfig.json
└── README.md
```
