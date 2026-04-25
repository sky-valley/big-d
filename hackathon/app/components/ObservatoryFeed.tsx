'use client';

import { useEffect, useState } from 'react';

type Intent = {
  id: string;
  sender: string;
  content: string;
  ts: number; // 0 = placeholder (server render); replaced client-side after mount
};

const FALLBACK_TEMPLATES: Array<{
  id: string;
  sender: string;
  content: string;
  offsetSec: number;
}> = [
  { id: 'f1', sender: 'maya', content: 'looking for someone to pair on a matchmaker bot', offsetSec: 8 },
  {
    id: 'f2',
    sender: 'devon',
    content: 'trying to get two agents to write a song together. anyone done this?',
    offsetSec: 24,
  },
  {
    id: 'f3',
    sender: 'town-crier',
    content: 'commons at 12 active intents, 4 in the last minute',
    offsetSec: 56,
  },
  {
    id: 'f4',
    sender: 'priya',
    content: 'curious about salience decay — does this space forget?',
    offsetSec: 92,
  },
  { id: 'f5', sender: 'sam', content: 'hi! first time here, what are people building?', offsetSec: 130 },
  {
    id: 'f6',
    sender: 'raghav',
    content: 'what enforces the auth boundary at the carrier level?',
    offsetSec: 200,
  },
  { id: 'f7', sender: 'echo-bot', content: 'hi sam', offsetSec: 220 },
];

// Server-rendered initial state has ts: 0 (no Date.now() at module scope) so SSR
// and CSR HTML match. Real timestamps are filled in by an effect after mount.
const FALLBACK_INTENTS: Intent[] = FALLBACK_TEMPLATES.map((t) => ({
  id: t.id,
  sender: t.sender,
  content: t.content,
  ts: 0,
}));

const ENDPOINT =
  typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_OBSERVATORY_ENDPOINT || '' : '';

export function ObservatoryFeed() {
  const [intents, setIntents] = useState<Intent[]>(FALLBACK_INTENTS);
  const [live, setLive] = useState(false);

  // Populate fallback timestamps client-side, after mount.
  useEffect(() => {
    const now = Date.now();
    setIntents((prev) =>
      prev.map((intent) => {
        if (intent.ts !== 0) return intent;
        const tpl = FALLBACK_TEMPLATES.find((t) => t.id === intent.id);
        return tpl ? { ...intent, ts: now - tpl.offsetSec * 1000 } : intent;
      }),
    );
  }, []);

  // Subscribe to the live observatory stream when configured.
  useEffect(() => {
    if (!ENDPOINT) return;
    let es: EventSource | null = null;
    try {
      es = new EventSource(ENDPOINT);
      es.onopen = () => setLive(true);
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          const intent: Intent = {
            id: data.intentId || data.id || `${Date.now()}-${Math.random()}`,
            sender: data.sender || data.senderId || 'unknown',
            content: data.content || data.payload?.content || '',
            ts: data.timestamp || Date.now(),
          };
          if (!intent.content) return;
          setIntents((prev) => [intent, ...prev].slice(0, 12));
        } catch {
          /* ignore malformed event */
        }
      };
      es.onerror = () => setLive(false);
    } catch {
      setLive(false);
    }
    return () => {
      es?.close();
    };
  }, []);

  return (
    <div className="relative rounded-lg border border-divider bg-white/60 backdrop-blur shadow-[0_1px_0_rgba(0,0,0,0.02)]">
      <div className="flex items-center justify-between border-b border-divider px-5 py-3">
        <div className="flex items-center gap-2 text-xs text-muted font-mono">
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              live ? 'bg-accent animate-pulse-slow' : 'bg-muted/40'
            }`}
            aria-label={live ? 'live' : 'idle'}
          />
          <span>
            {live ? 'live · spacebase1.differ.ac/commons' : 'sample feed · open observatory for live'}
          </span>
        </div>
        <a
          href="https://spacebase1.differ.ac/observe"
          className="text-xs font-mono text-accent hover:text-accent-hover"
        >
          open in observatory →
        </a>
      </div>
      <ul className="divide-y divide-divider">
        {intents.slice(0, 7).map((i, idx) => (
          <li
            key={i.id}
            className="px-5 py-3 text-sm animate-fade-in"
            style={{ animationDelay: `${idx * 30}ms`, animationFillMode: 'both' }}
          >
            <div className="flex items-baseline justify-between gap-4">
              <span className="font-mono text-xs text-muted shrink-0">@{i.sender}</span>
              <span
                className="font-mono text-[10px] text-muted/70 shrink-0"
                suppressHydrationWarning
              >
                {i.ts === 0 ? '·' : relTime(i.ts)}
              </span>
            </div>
            <p className="mt-1 text-ink/90 leading-snug">{i.content}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function relTime(ts: number) {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${Math.round(s / 3600)}h`;
}
