export const OBSERVATORY_HTML =
  '<!doctype html>\n' +
  '<html lang="en">\n' +
  '  <head>\n' +
  '    <meta charset="UTF-8" />\n' +
  '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n' +
  '    <title>Space Observatory</title>\n' +
  '    <link rel="preconnect" href="https://fonts.googleapis.com" />\n' +
  '    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />\n' +
  '    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />\n' +
  '    <style>\n' +
  ':root {\n' +
  '  --ink: #111217;\n' +
  '  --paper: #f2eee6;\n' +
  '  --paper-soft: #ebe4d8;\n' +
  '  --accent: #0e6d5a;\n' +
  '  --accent-soft: rgba(14, 109, 90, 0.14);\n' +
  '  --signal: #d1642e;\n' +
  '  --signal-soft: rgba(209, 100, 46, 0.16);\n' +
  '  --line: rgba(17, 18, 23, 0.14);\n' +
  '  --line-strong: rgba(17, 18, 23, 0.28);\n' +
  '  --shadow: 0 24px 80px rgba(17, 18, 23, 0.12);\n' +
  '  --mono: "IBM Plex Mono", ui-monospace, monospace;\n' +
  '  --display: "Space Grotesk", "Avenir Next", sans-serif;\n' +
  '}\n' +
  '\n' +
  '* { box-sizing: border-box; }\n' +
  'html, body { margin: 0; min-height: 100%; background: radial-gradient(circle at top, #fbf7f1 0%, var(--paper) 46%, #e8dfd1 100%); color: var(--ink); }\n' +
  'body { font-family: var(--display); }\n' +
  'button { font: inherit; color: inherit; }\n' +
  '\n' +
  '/* ── Connect screen ────────────────────────────── */\n' +
  '.connect-shell {\n' +
  '  min-height: 100vh;\n' +
  '  display: grid;\n' +
  '  place-items: center;\n' +
  '  padding: 2rem;\n' +
  '}\n' +
  '.connect-card {\n' +
  '  width: 100%;\n' +
  '  max-width: 38rem;\n' +
  '  border: 1px solid var(--line);\n' +
  '  background: rgba(255, 255, 255, 0.45);\n' +
  '  backdrop-filter: blur(14px);\n' +
  '  box-shadow: var(--shadow);\n' +
  '  padding: 2.5rem;\n' +
  '}\n' +
  '.connect-card h1 {\n' +
  '  margin: 0 0 0.25rem;\n' +
  '  font-size: 2.2rem;\n' +
  '  line-height: 1;\n' +
  '  letter-spacing: -0.04em;\n' +
  '}\n' +
  '.connect-card .eyebrow {\n' +
  '  margin: 0 0 1.8rem;\n' +
  '  font-family: var(--mono);\n' +
  '  font-size: 0.77rem;\n' +
  '  letter-spacing: 0.12em;\n' +
  '  text-transform: uppercase;\n' +
  '  color: rgba(17, 18, 23, 0.6);\n' +
  '}\n' +
  '.connect-field { margin-bottom: 1rem; }\n' +
  '.connect-field label {\n' +
  '  display: block;\n' +
  '  margin-bottom: 0.3rem;\n' +
  '  font-family: var(--mono);\n' +
  '  font-size: 0.72rem;\n' +
  '  font-weight: 600;\n' +
  '  text-transform: uppercase;\n' +
  '  letter-spacing: 0.06em;\n' +
  '  color: rgba(17, 18, 23, 0.55);\n' +
  '}\n' +
  '.connect-field input,\n' +
  '.connect-field textarea {\n' +
  '  width: 100%;\n' +
  '  padding: 0.6rem 0.7rem;\n' +
  '  font-family: var(--mono);\n' +
  '  font-size: 0.82rem;\n' +
  '  border: 1px solid var(--line);\n' +
  '  background: rgba(255, 255, 255, 0.6);\n' +
  '  color: var(--ink);\n' +
  '  outline: none;\n' +
  '  transition: border-color 120ms ease;\n' +
  '}\n' +
  '.connect-field input:focus,\n' +
  '.connect-field textarea:focus { border-color: var(--accent); }\n' +
  '.connect-field textarea { min-height: 6rem; resize: vertical; }\n' +
  '.connect-error {\n' +
  '  margin: 0 0 1rem;\n' +
  '  padding: 0.6rem 0.8rem;\n' +
  '  font-family: var(--mono);\n' +
  '  font-size: 0.75rem;\n' +
  '  color: #9c2e11;\n' +
  '  background: rgba(209, 100, 46, 0.1);\n' +
  '  border: 1px solid rgba(209, 100, 46, 0.25);\n' +
  '  display: none;\n' +
  '}\n' +
  '.connect-btn {\n' +
  '  width: 100%;\n' +
  '  padding: 0.75rem;\n' +
  '  border: 1px solid var(--accent);\n' +
  '  background: var(--accent);\n' +
  '  color: #fff;\n' +
  '  font-family: var(--mono);\n' +
  '  font-size: 0.82rem;\n' +
  '  font-weight: 600;\n' +
  '  text-transform: uppercase;\n' +
  '  letter-spacing: 0.08em;\n' +
  '  cursor: pointer;\n' +
  '  transition: background 100ms ease;\n' +
  '}\n' +
  '.connect-btn:hover { background: #0a5a49; }\n' +
  '.connect-btn:disabled { opacity: 0.5; cursor: not-allowed; }\n' +
  '.connect-hint {\n' +
  '  margin: 1rem 0 0;\n' +
  '  font-size: 0.78rem;\n' +
  '  line-height: 1.5;\n' +
  '  color: rgba(17, 18, 23, 0.5);\n' +
  '}\n' +
  '\n' +
  '/* ── Observatory shell ─────────────────────────── */\n' +
  '.shell {\n' +
  '  min-height: 100vh;\n' +
  '  padding: 2rem;\n' +
  '  display: grid;\n' +
  '  gap: 0;\n' +
  '}\n' +
  '\n' +
  '.hero-plane,\n' +
  '.workspace {\n' +
  '  border: 1px solid var(--line);\n' +
  '  background: rgba(255, 255, 255, 0.45);\n' +
  '  backdrop-filter: blur(14px);\n' +
  '  box-shadow: var(--shadow);\n' +
  '}\n' +
  '\n' +
  '.hero-plane {\n' +
  '  display: grid;\n' +
  '  grid-template-columns: 1.1fr 1fr;\n' +
  '  min-height: min(36rem, calc(100vh - 4rem));\n' +
  '  overflow: hidden;\n' +
  '}\n' +
  '\n' +
  '.hero-copy {\n' +
  '  padding: 3rem 3rem 2.75rem;\n' +
  '  display: flex;\n' +
  '  flex-direction: column;\n' +
  '  justify-content: space-between;\n' +
  '  gap: 1.5rem;\n' +
  '}\n' +
  '\n' +
  '.eyebrow {\n' +
  '  margin: 0 0 0.5rem;\n' +
  '  font-family: var(--mono);\n' +
  '  font-size: 0.77rem;\n' +
  '  letter-spacing: 0.12em;\n' +
  '  text-transform: uppercase;\n' +
  '  color: rgba(17, 18, 23, 0.6);\n' +
  '}\n' +
  '\n' +
  '.hero-copy h1,\n' +
  '.room-header h2 {\n' +
  '  margin: 0;\n' +
  '  font-size: clamp(2.8rem, 5vw, 5.5rem);\n' +
  '  line-height: 0.94;\n' +
  '  letter-spacing: -0.05em;\n' +
  '  max-width: 10ch;\n' +
  '}\n' +
  '\n' +
  '.lede {\n' +
  '  margin: 0;\n' +
  '  max-width: 32rem;\n' +
  '  font-size: 1.08rem;\n' +
  '  line-height: 1.7;\n' +
  '  color: rgba(17, 18, 23, 0.76);\n' +
  '}\n' +
  '\n' +
  '.hero-meta {\n' +
  '  display: flex;\n' +
  '  flex-wrap: wrap;\n' +
  '  gap: 0.75rem;\n' +
  '  font-family: var(--mono);\n' +
  '  font-size: 0.75rem;\n' +
  '  text-transform: uppercase;\n' +
  '}\n' +
  '\n' +
  '.hero-meta span,\n' +
  '.room-badges span {\n' +
  '  padding: 0.55rem 0.7rem;\n' +
  '  border: 1px solid var(--line);\n' +
  '  background: rgba(255, 255, 255, 0.55);\n' +
  '}\n' +
  '\n' +
  '.hero-graph {\n' +
  '  position: relative;\n' +
  '  border-left: 1px solid var(--line);\n' +
  '  background:\n' +
  '    linear-gradient(rgba(17, 18, 23, 0.05) 1px, transparent 1px),\n' +
  '    linear-gradient(90deg, rgba(17, 18, 23, 0.05) 1px, transparent 1px);\n' +
  '  background-size: 3rem 3rem;\n' +
  '  overflow: hidden;\n' +
  '  cursor: grab;\n' +
  '}\n' +
  '.hero-graph.is-panning { cursor: grabbing; }\n' +
  '\n' +
  '.graph-surface {\n' +
  '  position: absolute;\n' +
  '  inset: 0;\n' +
  '  transform-origin: 0 0;\n' +
  '}\n' +
  '\n' +
  '.graph-controls {\n' +
  '  position: absolute;\n' +
  '  top: 0.75rem;\n' +
  '  right: 0.75rem;\n' +
  '  display: flex;\n' +
  '  flex-direction: column;\n' +
  '  gap: 1px;\n' +
  '  z-index: 10;\n' +
  '  border: 1px solid var(--line);\n' +
  '  border-radius: 4px;\n' +
  '  overflow: hidden;\n' +
  '  box-shadow: 0 2px 8px rgba(17, 18, 23, 0.08);\n' +
  '}\n' +
  '.graph-controls button {\n' +
  '  width: 2rem;\n' +
  '  height: 2rem;\n' +
  '  border: none;\n' +
  '  background: rgba(255, 255, 255, 0.85);\n' +
  '  backdrop-filter: blur(6px);\n' +
  '  cursor: pointer;\n' +
  '  font-size: 1rem;\n' +
  '  line-height: 1;\n' +
  '  color: var(--ink);\n' +
  '  display: grid;\n' +
  '  place-items: center;\n' +
  '  transition: background 100ms ease;\n' +
  '}\n' +
  '.graph-controls button:hover { background: rgba(255, 255, 255, 1); }\n' +
  '.graph-controls button + button { border-top: 1px solid var(--line); }\n' +
  '\n' +
  '.graph-lines {\n' +
  '  position: absolute;\n' +
  '  inset: 0;\n' +
  '  width: 100%;\n' +
  '  height: 100%;\n' +
  '}\n' +
  '\n' +
  '.metro-line {\n' +
  '  stroke: var(--line-strong);\n' +
  '  stroke-width: 0.35;\n' +
  '  stroke-linecap: round;\n' +
  '}\n' +
  '.metro-line-interior { stroke: rgba(209, 100, 46, 0.5); stroke-width: 0.35; }\n' +
  '.metro-line-nested { stroke: rgba(14, 109, 90, 0.4); stroke-width: 0.3; stroke-dasharray: 0.8 0.6; }\n' +
  '\n' +
  '.station {\n' +
  '  position: absolute;\n' +
  '  transform: translate(-5px, -50%);\n' +
  '  display: flex;\n' +
  '  align-items: center;\n' +
  '  gap: 0.5rem;\n' +
  '  padding: 0;\n' +
  '  border: none;\n' +
  '  background: transparent;\n' +
  '  cursor: pointer;\n' +
  '  white-space: nowrap;\n' +
  '  transition: transform 180ms ease;\n' +
  '}\n' +
  '.station:hover { transform: translate(-5px, -50%) scale(1.06); }\n' +
  '.station.is-selected { transform: translate(-5px, -50%) scale(1.06); }\n' +
  '.station-root { transform: translate(-8px, -50%); }\n' +
  '.station-root:hover,\n' +
  '.station-root.is-selected { transform: translate(-8px, -50%) scale(1.06); }\n' +
  '\n' +
  '.station-dot {\n' +
  '  flex-shrink: 0;\n' +
  '  width: 10px;\n' +
  '  height: 10px;\n' +
  '  border-radius: 50%;\n' +
  '  background: var(--dot-color, var(--ink));\n' +
  '  border: 2px solid rgba(255, 255, 255, 0.9);\n' +
  '  box-shadow: 0 0 0 1px var(--dot-color, var(--ink));\n' +
  '  transition: transform 180ms ease, box-shadow 180ms ease;\n' +
  '}\n' +
  '.station-dot-hub {\n' +
  '  width: 16px;\n' +
  '  height: 16px;\n' +
  '  border-width: 3px;\n' +
  '}\n' +
  '.station.is-selected .station-dot,\n' +
  '.station:hover .station-dot {\n' +
  '  transform: scale(1.35);\n' +
  '  box-shadow: 0 0 0 2px var(--dot-color, var(--ink)), 0 0 12px rgba(14, 109, 90, 0.25);\n' +
  '}\n' +
  '\n' +
  '.station-label {\n' +
  '  font-family: var(--mono);\n' +
  '  font-size: 0.7rem;\n' +
  '  font-weight: 600;\n' +
  '  letter-spacing: 0.02em;\n' +
  '  color: var(--ink);\n' +
  '  padding: 0.2rem 0.45rem;\n' +
  '  background: rgba(242, 238, 230, 0.92);\n' +
  '  border: 1px solid var(--line);\n' +
  '  pointer-events: none;\n' +
  '  opacity: 0;\n' +
  '  transform: translateX(4px);\n' +
  '  transition: opacity 140ms ease, transform 140ms ease;\n' +
  '}\n' +
  '.station:hover .station-label,\n' +
  '.station.is-selected .station-label {\n' +
  '  opacity: 1;\n' +
  '  transform: translateX(0);\n' +
  '}\n' +
  '\n' +
  '.station.is-fresh { animation: station-arrive 420ms ease; }\n' +
  '\n' +
  '/* ── Browser chrome ─────────────────────────────── */\n' +
  '.browser {\n' +
  '  display: grid;\n' +
  '  grid-template-rows: auto minmax(0, 1fr);\n' +
  '  min-height: 30rem;\n' +
  '  margin-top: -4.75rem;\n' +
  '  position: relative;\n' +
  '  z-index: 2;\n' +
  '  border: 1px solid var(--line);\n' +
  '  border-top: 0;\n' +
  '  background: rgba(255, 252, 247, 0.92);\n' +
  '  border-radius: 0 0 6px 6px;\n' +
  '  overflow: hidden;\n' +
  '}\n' +
  '\n' +
  '.browser-nav {\n' +
  '  display: flex;\n' +
  '  align-items: center;\n' +
  '  gap: 0;\n' +
  '  padding: 0.5rem 0.85rem;\n' +
  '  border-bottom: 1px solid var(--line);\n' +
  '  background: rgba(255, 255, 255, 0.6);\n' +
  '  font-family: var(--mono);\n' +
  '  font-size: 0.78rem;\n' +
  '  min-height: 2.4rem;\n' +
  '}\n' +
  '\n' +
  '.crumb {\n' +
  '  position: relative;\n' +
  '  display: flex;\n' +
  '  align-items: center;\n' +
  '  gap: 0.35rem;\n' +
  '}\n' +
  '.crumb-type {\n' +
  '  padding: 0.12rem 0.4rem;\n' +
  '  font-size: 0.62rem;\n' +
  '  font-weight: 600;\n' +
  '  text-transform: uppercase;\n' +
  '  letter-spacing: 0.05em;\n' +
  '  border-radius: 2px;\n' +
  '  background: rgba(17, 18, 23, 0.06);\n' +
  '  color: rgba(17, 18, 23, 0.45);\n' +
  '}\n' +
  '.crumb:first-child .crumb-type { background: var(--accent-soft); color: var(--accent); }\n' +
  '.crumb-name {\n' +
  '  border: none;\n' +
  '  background: none;\n' +
  '  font: inherit;\n' +
  '  padding: 0.2rem 0.3rem;\n' +
  '  cursor: pointer;\n' +
  '  color: rgba(17, 18, 23, 0.6);\n' +
  '  border-radius: 3px;\n' +
  '  transition: background 100ms ease, color 100ms ease;\n' +
  '}\n' +
  '.crumb-name:hover { background: rgba(17, 18, 23, 0.06); color: var(--ink); }\n' +
  '.crumb-current .crumb-name { color: var(--ink); font-weight: 600; }\n' +
  '\n' +
  '.crumb-sep {\n' +
  '  margin: 0 0.25rem;\n' +
  '  color: rgba(17, 18, 23, 0.22);\n' +
  '  font-size: 0.85rem;\n' +
  '}\n' +
  '\n' +
  '.nav-meta {\n' +
  '  margin-left: auto;\n' +
  '  color: rgba(17, 18, 23, 0.4);\n' +
  '  font-size: 0.66rem;\n' +
  '  text-transform: uppercase;\n' +
  '  white-space: nowrap;\n' +
  '}\n' +
  '\n' +
  '.browser-viewport {\n' +
  '  display: grid;\n' +
  '  grid-template-columns: minmax(0, 1fr) 22rem;\n' +
  '  min-height: 0;\n' +
  '}\n' +
  '\n' +
  '.browser-page {\n' +
  '  overflow: auto;\n' +
  '  padding: 0.8rem 1rem;\n' +
  '  display: flex;\n' +
  '  flex-direction: column;\n' +
  '  gap: 0.45rem;\n' +
  '}\n' +
  '.page-subtitle {\n' +
  '  margin: 0 0 0.4rem;\n' +
  '  padding: 0 0.2rem;\n' +
  '  font-size: 0.92rem;\n' +
  '  color: rgba(17, 18, 23, 0.55);\n' +
  '}\n' +
  '.page-empty {\n' +
  '  padding: 2rem;\n' +
  '  text-align: center;\n' +
  '  color: rgba(17, 18, 23, 0.4);\n' +
  '}\n' +
  '\n' +
  '.event-row {\n' +
  '  border: 1px solid transparent;\n' +
  '  border-left: 3px solid var(--line);\n' +
  '  background: transparent;\n' +
  '  padding: 0.8rem 0.9rem;\n' +
  '  display: grid;\n' +
  '  gap: 0.22rem;\n' +
  '  cursor: pointer;\n' +
  '  text-align: left;\n' +
  '  animation: event-fade 280ms ease;\n' +
  '}\n' +
  '.event-row:hover,\n' +
  '.event-row.is-selected {\n' +
  '  border-color: var(--line);\n' +
  '  border-left-color: var(--signal);\n' +
  '  background: rgba(255, 255, 255, 0.7);\n' +
  '}\n' +
  '\n' +
  '.event-row.has-children {\n' +
  '  border-left-color: var(--accent);\n' +
  '}\n' +
  '.event-row.has-children:hover {\n' +
  '  border-left-color: var(--accent);\n' +
  '  background: var(--accent-soft);\n' +
  '}\n' +
  '.drill-arrow {\n' +
  '  font-weight: 700;\n' +
  '  color: var(--accent);\n' +
  '  margin-left: 0.3rem;\n' +
  '}\n' +
  '\n' +
  '.event-kind,\n' +
  '.event-meta,\n' +
  '.inspector-meta {\n' +
  '  font-family: var(--mono);\n' +
  '  font-size: 0.7rem;\n' +
  '  text-transform: uppercase;\n' +
  '  letter-spacing: 0.06em;\n' +
  '}\n' +
  '.event-kind { color: var(--signal); }\n' +
  '.event-label { font-size: 0.98rem; line-height: 1.5; }\n' +
  '.event-meta, .inspector-meta { color: rgba(17, 18, 23, 0.5); }\n' +
  '\n' +
  '.browser-inspector {\n' +
  '  border-left: 1px solid var(--line);\n' +
  '  padding: 1.2rem;\n' +
  '  background: rgba(17, 18, 23, 0.94);\n' +
  '  color: #f7f4ee;\n' +
  '  min-width: 0;\n' +
  '  overflow: auto;\n' +
  '}\n' +
  '.browser-inspector h3 {\n' +
  '  margin: 0 0 0.45rem;\n' +
  '  font-size: 1.2rem;\n' +
  '  line-height: 1.1;\n' +
  '  overflow-wrap: anywhere;\n' +
  '}\n' +
  '.browser-inspector pre {\n' +
  '  margin: 0.8rem 0 0;\n' +
  '  padding: 0.8rem;\n' +
  '  border: 1px solid rgba(247, 244, 238, 0.12);\n' +
  '  background: rgba(255, 255, 255, 0.04);\n' +
  '  overflow: auto;\n' +
  '  font-family: var(--mono);\n' +
  '  font-size: 0.74rem;\n' +
  '  line-height: 1.55;\n' +
  '  white-space: pre-wrap;\n' +
  '  word-break: break-word;\n' +
  '}\n' +
  '\n' +
  '.loading-shell {\n' +
  '  min-height: 100vh;\n' +
  '  display: grid;\n' +
  '  place-items: center;\n' +
  '  font-size: 1.2rem;\n' +
  '}\n' +
  '\n' +
  '@keyframes station-arrive {\n' +
  '  from { opacity: 0; transform: translate(-50%, -50%) scale(0.6); }\n' +
  '  60% { opacity: 1; transform: translate(-50%, -50%) scale(1.12); }\n' +
  '  to { opacity: 1; transform: translate(-50%, -50%) scale(1); }\n' +
  '}\n' +
  '\n' +
  '@keyframes event-fade {\n' +
  '  from { opacity: 0; transform: translateY(8px); }\n' +
  '  to { opacity: 1; transform: translateY(0); }\n' +
  '}\n' +
  '\n' +
  '@media (max-width: 1100px) {\n' +
  '  .hero-plane { grid-template-columns: 1fr; min-height: auto; }\n' +
  '  .hero-graph { min-height: 26rem; border-left: 0; border-top: 1px solid var(--line); }\n' +
  '  .browser { margin-top: 0.85rem; }\n' +
  '  .browser-viewport { grid-template-columns: 1fr; }\n' +
  '  .browser-inspector { border-left: 0; border-top: 1px solid var(--line); max-height: 18rem; }\n' +
  '}\n' +
  '\n' +
  '@media (max-width: 720px) {\n' +
  '  .shell { padding: 1rem; gap: 1rem; }\n' +
  '  .hero-copy { padding: 1.2rem; }\n' +
  '  .hero-copy h1 { max-width: none; }\n' +
  '  .hero-meta { gap: 0.4rem; }\n' +
  '  .browser-inspector { padding: 1rem; }\n' +
  '}\n' +
  '    </style>\n' +
  '  </head>\n' +
  '  <body>\n' +
  '    <div id="app"></div>\n' +
  '    <script type="module">\n' +
  'import { hierarchy, tree } from \'https://cdn.jsdelivr.net/npm/d3-hierarchy@3/+esm\';\n' +
  '\n' +
  'const app = document.getElementById(\'app\');\n' +
  '\n' +
  '// ── Observe client ───────────────────────────────────────────────────────────\n' +
  '// Uses the token-only GET /observe endpoint — no DPoP, no ITP framing.\n' +
  '\n' +
  'let connection = null; // { origin, spaceId, stationToken, anonymous? }\n' +
  '\n' +
  '// In anonymous (public-read) mode, hit the unauthenticated /commons/feed.json\n' +
  '// endpoint instead of the auth-gated /observe. The shape is the same\n' +
  '// ({ spaceId, latestSeq, messages }), so the rest of the renderer is unchanged.\n' +
  'async function scanSpace(spaceId, since = 0) {\n' +
  '  const url = connection.anonymous\n' +
  '    ? `${connection.origin}/commons/feed.json`\n' +
  '      + `?since=${since}`\n' +
  '      + `&limit=50`\n' +
  '      + `&_t=${Date.now()}`\n' +
  '    : `${connection.origin}/spaces/${connection.spaceId}/observe`\n' +
  '      + `?token=${encodeURIComponent(connection.stationToken)}`\n' +
  '      + `&space=${encodeURIComponent(spaceId)}`\n' +
  '      + `&since=${since}`\n' +
  '      + `&_t=${Date.now()}`;\n' +
  '  const response = await fetch(url);\n' +
  '  if (!response.ok) {\n' +
  '    const text = await response.text();\n' +
  '    throw new Error(`Observe failed (${response.status}): ${text}`);\n' +
  '  }\n' +
  '  return response.json();\n' +
  '}\n' +
  '\n' +
  'async function scanRecursive(spaceId, maxDepth = 3) {\n' +
  '  // Anonymous public read shows top-level commons activity only.\n' +
  '  // Interiors stay auth-gated server-side, so descending here would 403.\n' +
  '  // Honor the constraint locally rather than blasting failed requests.\n' +
  '  if (connection.anonymous) {\n' +
  '    const result = await scanSpace(spaceId);\n' +
  '    return { topLevel: result.messages ?? [], interiors: new Map() };\n' +
  '  }\n' +
  '  const allMessages = new Map();\n' +
  '  const interiorMessages = new Map();\n' +
  '\n' +
  '  async function descend(parentId, depth) {\n' +
  '    const result = await scanSpace(parentId);\n' +
  '    const messages = result.messages;\n' +
  '    allMessages.set(parentId, messages);\n' +
  '    if (depth >= maxDepth) return;\n' +
  '\n' +
  '    const intents = messages.filter((m) => m.type === \'INTENT\' && m.intentId);\n' +
  '    const scanPromises = intents.map(async (intent) => {\n' +
  '      try {\n' +
  '        const interior = await scanSpace(intent.intentId);\n' +
  '        if (interior.messages.length > 0) {\n' +
  '          interiorMessages.set(intent.intentId, interior.messages);\n' +
  '          await descend(intent.intentId, depth + 1);\n' +
  '        }\n' +
  '      } catch (err) {\n' +
  '        console.warn(\'Failed to scan interior\', intent.intentId, err.message);\n' +
  '      }\n' +
  '    });\n' +
  '    await Promise.all(scanPromises);\n' +
  '  }\n' +
  '\n' +
  '  await descend(spaceId, 0);\n' +
  '  return { topLevel: allMessages.get(spaceId) ?? [], interiors: interiorMessages };\n' +
  '}\n' +
  '\n' +
  '// ── Data model ───────────────────────────────────────────────────────────────\n' +
  '\n' +
  'const participantNames = new Map();\n' +
  '\n' +
  'function friendlyName(senderId) {\n' +
  '  if (participantNames.has(senderId)) return participantNames.get(senderId);\n' +
  '  if (senderId.length > 16) return senderId.slice(-8);\n' +
  '  return senderId;\n' +
  '}\n' +
  '\n' +
  'function learnParticipants(messages) {\n' +
  '  for (const m of messages) {\n' +
  '    if (m.payload?.handle && typeof m.payload.handle === \'string\') {\n' +
  '      participantNames.set(m.senderId, m.payload.handle);\n' +
  '    }\n' +
  '    if (m.payload?.intended_agent_label && typeof m.payload.intended_agent_label === \'string\') {\n' +
  '      const label = m.payload.intended_agent_label;\n' +
  '      if (!participantNames.has(m.senderId) && label.length < 40) {\n' +
  '        participantNames.set(m.senderId, label);\n' +
  '      }\n' +
  '    }\n' +
  '    if (m.payload?.content && typeof m.payload.content === \'string\') {\n' +
  '      const match = m.payload.content.match(/for\\s+([a-z0-9_-]+)/i);\n' +
  '      if (match && match[1].length < 30) {\n' +
  '        const target = match[1];\n' +
  '        if (!participantNames.has(target)) {\n' +
  '          participantNames.set(target, target);\n' +
  '        }\n' +
  '      }\n' +
  '    }\n' +
  '  }\n' +
  '}\n' +
  '\n' +
  'function eventKindFor(msg) {\n' +
  '  const map = {\n' +
  '    INTENT: \'intent_posted\', PROMISE: \'promise_posted\', ACCEPT: \'accept_posted\',\n' +
  '    COMPLETE: \'complete_posted\', ASSESS: \'assess_posted\', DECLINE: \'decline_posted\',\n' +
  '  };\n' +
  '  return map[msg.type] ?? \'message_posted\';\n' +
  '}\n' +
  '\n' +
  'function eventLabelFor(msg) {\n' +
  '  if (msg.type === \'PROMISE\') return String(msg.payload?.content ?? \'Promise posted\');\n' +
  '  if (msg.type === \'ACCEPT\') return `${friendlyName(msg.senderId)} accepts`;\n' +
  '  if (msg.type === \'COMPLETE\') return `${friendlyName(msg.senderId)} completes`;\n' +
  '  if (msg.type === \'ASSESS\') return `${friendlyName(msg.senderId)} assesses`;\n' +
  '  if (msg.type === \'DECLINE\') return String(msg.payload?.reason ?? \'Declined\');\n' +
  '  if (msg.type === \'INTENT\') return String(msg.payload?.content ?? \'Intent posted\');\n' +
  '  return String(msg.payload?.content ?? `${msg.type.toLowerCase()} posted`);\n' +
  '}\n' +
  '\n' +
  'function toEvents(parentId, messages) {\n' +
  '  return messages.map((msg) => ({\n' +
  '    id: `${parentId}:${msg.seq}`,\n' +
  '    roomId: parentId,\n' +
  '    kind: eventKindFor(msg),\n' +
  '    label: eventLabelFor(msg),\n' +
  '    actorId: friendlyName(msg.senderId),\n' +
  '    timestamp: msg.timestamp,\n' +
  '    seq: msg.seq,\n' +
  '    raw: msg,\n' +
  '  }));\n' +
  '}\n' +
  '\n' +
  'function buildSnapshot(spaceId, topLevel, interiors) {\n' +
  '  learnParticipants(topLevel);\n' +
  '  for (const msgs of interiors.values()) learnParticipants(msgs);\n' +
  '\n' +
  '  const nodes = [];\n' +
  '  const edges = [];\n' +
  '  const eventsByNode = {};\n' +
  '  const interiorEvents = {};\n' +
  '\n' +
  '  const topEvents = toEvents(spaceId, topLevel);\n' +
  '  eventsByNode[spaceId] = topEvents;\n' +
  '  const participants = [...new Set(topLevel.map((m) => m.senderId))];\n' +
  '  nodes.push({\n' +
  '    id: spaceId,\n' +
  '    type: \'root\',\n' +
  '    title: spaceId.length > 20 ? spaceId.slice(0, 8) + \'...\' + spaceId.slice(-6) : spaceId,\n' +
  '    subtitle: \'Top-level space\',\n' +
  '    visibility: \'bound\',\n' +
  '    participants: participants.map(friendlyName),\n' +
  '    updatedAt: topEvents.at(-1)?.timestamp ?? 0,\n' +
  '    eventCount: topEvents.length,\n' +
  '    preview: topEvents.at(-1)?.label ?? \'No activity\',\n' +
  '  });\n' +
  '\n' +
  '  const intents = topLevel.filter((m) => m.type === \'INTENT\' && m.intentId);\n' +
  '  for (const intent of intents) {\n' +
  '    const id = intent.intentId;\n' +
  '    edges.push({ from: spaceId, to: id, kind: \'contains\' });\n' +
  '    const interior = interiors.get(id) ?? [];\n' +
  '    const intEvents = toEvents(id, interior);\n' +
  '    eventsByNode[id] = intEvents;\n' +
  '\n' +
  '    const label = intent.payload?.content\n' +
  '      ? String(intent.payload.content).slice(0, 60)\n' +
  '      : `Intent ${id.slice(-8)}`;\n' +
  '    const intParticipants = [...new Set(interior.map((m) => m.senderId))];\n' +
  '    nodes.push({\n' +
  '      id,\n' +
  '      type: \'intent_interior\',\n' +
  '      title: label,\n' +
  '      subtitle: `Thread from ${friendlyName(intent.senderId)}`,\n' +
  '      visibility: \'interior\',\n' +
  '      participants: intParticipants.map(friendlyName),\n' +
  '      updatedAt: intEvents.at(-1)?.timestamp ?? intent.timestamp,\n' +
  '      eventCount: intEvents.length,\n' +
  '      preview: intEvents.at(-1)?.label ?? \'No responses yet\',\n' +
  '    });\n' +
  '\n' +
  '    for (const innerMsg of interior) {\n' +
  '      if (innerMsg.type === \'INTENT\' && innerMsg.intentId && interiors.has(innerMsg.intentId)) {\n' +
  '        const nestedId = innerMsg.intentId;\n' +
  '        edges.push({ from: id, to: nestedId, kind: \'contains\' });\n' +
  '        const nestedMsgs = interiors.get(nestedId);\n' +
  '        const nestedEvents = toEvents(nestedId, nestedMsgs);\n' +
  '        interiorEvents[nestedId] = nestedEvents;\n' +
  '        eventsByNode[nestedId] = nestedEvents;\n' +
  '        nodes.push({\n' +
  '          id: nestedId,\n' +
  '          type: \'nested_interior\',\n' +
  '          title: `Thread ${nestedId.slice(-8)}`,\n' +
  '          subtitle: `Nested thread`,\n' +
  '          visibility: \'interior\',\n' +
  '          participants: [...new Set(nestedMsgs.map((m) => m.senderId))].map(friendlyName),\n' +
  '          updatedAt: nestedEvents.at(-1)?.timestamp ?? 0,\n' +
  '          eventCount: nestedEvents.length,\n' +
  '          preview: nestedEvents.at(-1)?.label ?? \'\',\n' +
  '        });\n' +
  '      }\n' +
  '    }\n' +
  '\n' +
  '    // Interior events for drill-down from top-level intents\n' +
  '    if (interior.length > 0) {\n' +
  '      interiorEvents[id] = intEvents;\n' +
  '    }\n' +
  '  }\n' +
  '\n' +
  '  nodes.sort((a, b) => {\n' +
  '    if (a.type === \'root\') return -1;\n' +
  '    if (b.type === \'root\') return 1;\n' +
  '    return b.updatedAt - a.updatedAt;\n' +
  '  });\n' +
  '\n' +
  '  return {\n' +
  '    generatedAt: Date.now(),\n' +
  '    origin: connection.origin,\n' +
  '    spaceId,\n' +
  '    nodes,\n' +
  '    edges,\n' +
  '    eventsByNode,\n' +
  '    interiorEvents,\n' +
  '  };\n' +
  '}\n' +
  '\n' +
  '// ── Rendering ────────────────────────────────────────────────────────────────\n' +
  '\n' +
  'let snapshot = null;\n' +
  'let selectedNodeId = null;\n' +
  'let selectedEventId = null;\n' +
  'let knownNodeIds = new Set();\n' +
  'let renderedFingerprint = null;\n' +
  'let renderedNodeId = null;\n' +
  'let renderedEventId = null;\n' +
  'let renderedBrowseDepth = 0;\n' +
  'let isFirstRender = true;\n' +
  'let browseStack = [];\n' +
  '\n' +
  'let graphScale = 1;\n' +
  'let graphPanX = 0;\n' +
  'let graphPanY = 0;\n' +
  'const ZOOM_MIN = 0.5;\n' +
  'const ZOOM_MAX = 4;\n' +
  'const ZOOM_STEP = 0.15;\n' +
  '\n' +
  'function esc(value) {\n' +
  '  return String(value).replaceAll(\'&\', \'&amp;\').replaceAll(\'<\', \'&lt;\').replaceAll(\'>\', \'&gt;\').replaceAll(\'"\', \'&quot;\').replaceAll("\'", \'&#39;\');\n' +
  '}\n' +
  '\n' +
  'function timeAgo(ts) {\n' +
  '  if (!ts) return \'quiet\';\n' +
  '  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));\n' +
  '  if (s < 5) return \'live now\';\n' +
  '  if (s < 60) return `${s}s ago`;\n' +
  '  const m = Math.floor(s / 60);\n' +
  '  if (m < 60) return `${m}m ago`;\n' +
  '  const h = Math.floor(m / 60);\n' +
  '  if (h < 48) return `${h}h ago`;\n' +
  '  return `${Math.floor(h / 24)}d ago`;\n' +
  '}\n' +
  '\n' +
  'function nodeColor(node) {\n' +
  '  if (node.type === \'root\') return \'var(--accent)\';\n' +
  '  if (node.type === \'intent_interior\') return \'var(--signal)\';\n' +
  '  return \'var(--accent)\';\n' +
  '}\n' +
  '\n' +
  'function metroLayout(nodes, edges) {\n' +
  '  const coords = new Map();\n' +
  '  const root = nodes.find((n) => n.type === \'root\');\n' +
  '  if (!root) return coords;\n' +
  '\n' +
  '  const childrenOf = new Map();\n' +
  '  const hasParent = new Set();\n' +
  '  for (const edge of edges) {\n' +
  '    if (!childrenOf.has(edge.from)) childrenOf.set(edge.from, []);\n' +
  '    childrenOf.get(edge.from).push(edge.to);\n' +
  '    hasParent.add(edge.to);\n' +
  '  }\n' +
  '  for (const n of nodes) {\n' +
  '    if (n.id !== root.id && !hasParent.has(n.id)) {\n' +
  '      if (!childrenOf.has(root.id)) childrenOf.set(root.id, []);\n' +
  '      childrenOf.get(root.id).push(n.id);\n' +
  '    }\n' +
  '  }\n' +
  '\n' +
  '  const nodeById = new Map(nodes.map((n) => [n.id, n]));\n' +
  '  function buildNode(id) {\n' +
  '    const kids = (childrenOf.get(id) || []).filter((cid) => nodeById.has(cid)).map((cid) => buildNode(cid));\n' +
  '    return { id, children: kids.length > 0 ? kids : undefined };\n' +
  '  }\n' +
  '\n' +
  '  const rootH = hierarchy(buildNode(root.id));\n' +
  '  const nodeCount = rootH.descendants().length;\n' +
  '  const radius = Math.min(40, 20 + nodeCount * 3);\n' +
  '  const treeLayout = tree()\n' +
  '    .size([2 * Math.PI, radius])\n' +
  '    .separation((a, b) => (a.parent === b.parent ? 1.2 : 2) / (a.depth || 1));\n' +
  '  treeLayout(rootH);\n' +
  '\n' +
  '  const angleOffset = -Math.PI / 4;\n' +
  '  rootH.each((d) => {\n' +
  '    if (d.depth === 0) {\n' +
  '      coords.set(d.data.id, { x: 50, y: 50 });\n' +
  '    } else {\n' +
  '      const angle = d.x + angleOffset;\n' +
  '      coords.set(d.data.id, {\n' +
  '        x: Math.max(8, Math.min(92, 50 + Math.cos(angle) * d.y)),\n' +
  '        y: Math.max(8, Math.min(92, 50 + Math.sin(angle) * d.y)),\n' +
  '      });\n' +
  '    }\n' +
  '  });\n' +
  '  return coords;\n' +
  '}\n' +
  '\n' +
  'function buildGraphMarkup(nodes) {\n' +
  '  const edges = snapshot.edges || [];\n' +
  '  const coords = metroLayout(nodes, edges);\n' +
  '  const nodeById = new Map(nodes.map((n) => [n.id, n]));\n' +
  '\n' +
  '  let lineMarkup = \'\';\n' +
  '  for (const edge of edges) {\n' +
  '    const from = coords.get(edge.from);\n' +
  '    const to = coords.get(edge.to);\n' +
  '    if (!from || !to) continue;\n' +
  '    const child = nodeById.get(edge.to);\n' +
  '    const cls = child?.type === \'intent_interior\' ? \'metro-line metro-line-interior\' : \'metro-line metro-line-nested\';\n' +
  '    lineMarkup += `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" class="${cls}" />`;\n' +
  '  }\n' +
  '\n' +
  '  const nodeMarkup = nodes.map((node) => {\n' +
  '    const point = coords.get(node.id) || { x: 50, y: 50 };\n' +
  '    const isSelected = node.id === selectedNodeId;\n' +
  '    const isFresh = !knownNodeIds.has(node.id);\n' +
  '    const isRoot = node.type === \'root\';\n' +
  '    const cls = [\'station\', isRoot ? \'station-root\' : \'\', isSelected ? \'is-selected\' : \'\', isFresh ? \'is-fresh\' : \'\'].filter(Boolean).join(\' \');\n' +
  '    const shortLabel = node.title.length > 24 ? node.title.slice(0, 22) + \'...\' : node.title;\n' +
  '    return `\n' +
  '      <button class="${cls}" data-node-id="${esc(node.id)}" style="left:${point.x}%;top:${point.y}%">\n' +
  '        <span class="station-dot${isRoot ? \' station-dot-hub\' : \'\'}" style="--dot-color:${nodeColor(node)}"></span>\n' +
  '        <span class="station-label">${esc(shortLabel)}</span>\n' +
  '      </button>`;\n' +
  '  }).join(\'\');\n' +
  '\n' +
  '  return `\n' +
  '    <div class="graph-surface">\n' +
  '      <svg viewBox="0 0 100 100" class="graph-lines" preserveAspectRatio="none">${lineMarkup}</svg>\n' +
  '      ${nodeMarkup}\n' +
  '    </div>`;\n' +
  '}\n' +
  '\n' +
  'function applyGraphTransform() {\n' +
  '  const surface = document.querySelector(\'.graph-surface\');\n' +
  '  if (surface) surface.style.transform = `translate(${graphPanX}px, ${graphPanY}px) scale(${graphScale})`;\n' +
  '}\n' +
  '\n' +
  'let graphPanZoomBound = false;\n' +
  '\n' +
  'function bindGraphPanZoom() {\n' +
  '  const container = document.querySelector(\'.hero-graph\');\n' +
  '  if (!container) return;\n' +
  '  applyGraphTransform();\n' +
  '  if (graphPanZoomBound) return;\n' +
  '  graphPanZoomBound = true;\n' +
  '\n' +
  '  container.addEventListener(\'wheel\', (e) => {\n' +
  '    e.preventDefault();\n' +
  '    const rect = container.getBoundingClientRect();\n' +
  '    const cx = e.clientX - rect.left;\n' +
  '    const cy = e.clientY - rect.top;\n' +
  '    const old = graphScale;\n' +
  '    graphScale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, graphScale + (e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP)));\n' +
  '    const ratio = graphScale / old;\n' +
  '    graphPanX = cx - ratio * (cx - graphPanX);\n' +
  '    graphPanY = cy - ratio * (cy - graphPanY);\n' +
  '    applyGraphTransform();\n' +
  '  }, { passive: false });\n' +
  '\n' +
  '  let dragging = false, dx = 0, dy = 0, px = 0, py = 0;\n' +
  '  container.addEventListener(\'pointerdown\', (e) => {\n' +
  '    if (e.target.closest(\'.station\') || e.target.closest(\'.graph-controls\')) return;\n' +
  '    dragging = true; dx = e.clientX; dy = e.clientY; px = graphPanX; py = graphPanY;\n' +
  '    container.classList.add(\'is-panning\');\n' +
  '    container.setPointerCapture(e.pointerId);\n' +
  '  });\n' +
  '  container.addEventListener(\'pointermove\', (e) => {\n' +
  '    if (!dragging) return;\n' +
  '    graphPanX = px + (e.clientX - dx);\n' +
  '    graphPanY = py + (e.clientY - dy);\n' +
  '    applyGraphTransform();\n' +
  '  });\n' +
  '  const endDrag = () => { dragging = false; container.classList.remove(\'is-panning\'); };\n' +
  '  container.addEventListener(\'pointerup\', endDrag);\n' +
  '  container.addEventListener(\'pointercancel\', endDrag);\n' +
  '\n' +
  '  container.addEventListener(\'click\', (e) => {\n' +
  '    const btn = e.target.closest(\'.graph-controls button\');\n' +
  '    if (!btn) return;\n' +
  '    const rect = container.getBoundingClientRect();\n' +
  '    const cx = rect.width / 2, cy = rect.height / 2;\n' +
  '    const old = graphScale;\n' +
  '    if (btn.classList.contains(\'graph-zoom-in\')) graphScale = Math.min(ZOOM_MAX, graphScale + ZOOM_STEP);\n' +
  '    else if (btn.classList.contains(\'graph-zoom-out\')) graphScale = Math.max(ZOOM_MIN, graphScale - ZOOM_STEP);\n' +
  '    else if (btn.classList.contains(\'graph-zoom-reset\')) { graphScale = 1; graphPanX = 0; graphPanY = 0; applyGraphTransform(); return; }\n' +
  '    const ratio = graphScale / old;\n' +
  '    graphPanX = cx - ratio * (cx - graphPanX);\n' +
  '    graphPanY = cy - ratio * (cy - graphPanY);\n' +
  '    applyGraphTransform();\n' +
  '  });\n' +
  '}\n' +
  '\n' +
  'function snapshotFingerprint(snap) {\n' +
  '  const nodes = snap.nodes || [];\n' +
  '  const eventCounts = nodes.map((n) => `${n.id}:${(snap.eventsByNode?.[n.id] || []).length}`).join(\',\');\n' +
  '  const interiorCounts = Object.entries(snap.interiorEvents || {}).map(([k, v]) => `${k}:${v.length}`).join(\',\');\n' +
  '  return `${nodes.length}|${eventCounts}|${interiorCounts}|bs${browseStack.length}`;\n' +
  '}\n' +
  '\n' +
  'function eventRowHtml(event, isSelected, hasChildren) {\n' +
  '  return `\n' +
  '    <button class="event-row${isSelected ? \' is-selected\' : \'\'}${hasChildren ? \' has-children\' : \'\'}" data-event-id="${esc(event.id)}"${hasChildren ? ` data-drill-id="${esc(event.raw?.intentId ?? \'\')}"` : \'\'}>\n' +
  '      <span class="event-kind">${esc(event.kind.replaceAll(\'_\', \' \'))}</span>\n' +
  '      <span class="event-label">${esc(event.label)}${hasChildren ? \' <span class="drill-arrow">&#8250;</span>\' : \'\'}</span>\n' +
  '      <span class="event-meta">${esc(event.actorId)} &middot; ${esc(timeAgo(event.timestamp))}${hasChildren ? \' &middot; has thread\' : \'\'}</span>\n' +
  '    </button>`;\n' +
  '}\n' +
  '\n' +
  'function currentBrowseEvents(nodeEvents) {\n' +
  '  if (browseStack.length === 0) return nodeEvents;\n' +
  '  const deepest = browseStack[browseStack.length - 1];\n' +
  '  return snapshot?.interiorEvents?.[deepest.parentId] ?? [];\n' +
  '}\n' +
  '\n' +
  'function eventHasChildren(event) {\n' +
  '  const intentId = event.raw?.intentId;\n' +
  '  if (!intentId) return false;\n' +
  '  const children = snapshot?.interiorEvents?.[intentId];\n' +
  '  return children && children.length > 0;\n' +
  '}\n' +
  '\n' +
  'function buildBreadcrumbMarkup(selectedNode) {\n' +
  '  if (!selectedNode) return \'\';\n' +
  '  const nodes = snapshot.nodes || [];\n' +
  '  const edges = snapshot.edges || [];\n' +
  '  const nodeById = new Map(nodes.map((n) => [n.id, n]));\n' +
  '  const parentOf = new Map();\n' +
  '  for (const edge of edges) parentOf.set(edge.to, edge.from);\n' +
  '\n' +
  '  const path = [];\n' +
  '  let cur = selectedNode.id;\n' +
  '  while (cur && nodeById.has(cur)) { path.unshift(cur); cur = parentOf.get(cur); }\n' +
  '\n' +
  '  let markup = path.map((id, i) => {\n' +
  '    const node = nodeById.get(id);\n' +
  '    if (!node) return \'\';\n' +
  '    const isLast = browseStack.length === 0 && i === path.length - 1;\n' +
  '    const sep = i > 0 ? \'<span class="crumb-sep">&#8250;</span>\' : \'\';\n' +
  '    const typeLabel = node.type === \'root\' ? \'space\' : \'thread\';\n' +
  '    return `${sep}<div class="crumb${isLast ? \' crumb-current\' : \'\'}">\n' +
  '      <span class="crumb-type">${esc(typeLabel)}</span>\n' +
  '      <button class="crumb-name" data-node-id="${esc(id)}">${esc(node.title.length > 30 ? node.title.slice(0, 28) + \'...\' : node.title)}</button>\n' +
  '    </div>`;\n' +
  '  }).join(\'\');\n' +
  '\n' +
  '  for (let i = 0; i < browseStack.length; i++) {\n' +
  '    const entry = browseStack[i];\n' +
  '    const isLast = i === browseStack.length - 1;\n' +
  '    markup += `<span class="crumb-sep">&#8250;</span><div class="crumb${isLast ? \' crumb-current\' : \'\'}">\n' +
  '      <span class="crumb-type">thread</span>\n' +
  '      <button class="crumb-name" data-browse-depth="${i}">${esc(entry.label)}</button>\n' +
  '    </div>`;\n' +
  '  }\n' +
  '  return markup;\n' +
  '}\n' +
  '\n' +
  'function bindNodeClicks() {\n' +
  '  app.querySelectorAll(\'[data-node-id]\').forEach((el) => {\n' +
  '    el.addEventListener(\'click\', () => {\n' +
  '      selectedNodeId = el.getAttribute(\'data-node-id\');\n' +
  '      selectedEventId = null;\n' +
  '      browseStack = [];\n' +
  '      render();\n' +
  '    });\n' +
  '  });\n' +
  '  app.querySelectorAll(\'[data-browse-depth]\').forEach((el) => {\n' +
  '    el.addEventListener(\'click\', () => {\n' +
  '      browseStack = browseStack.slice(0, parseInt(el.getAttribute(\'data-browse-depth\'), 10) + 1);\n' +
  '      selectedEventId = null;\n' +
  '      render();\n' +
  '    });\n' +
  '  });\n' +
  '}\n' +
  '\n' +
  'function bindEventClicks() {\n' +
  '  app.querySelectorAll(\'#event-rail [data-event-id]\').forEach((el) => {\n' +
  '    el.addEventListener(\'click\', () => {\n' +
  '      const drillId = el.getAttribute(\'data-drill-id\');\n' +
  '      if (drillId) {\n' +
  '        const label = el.querySelector(\'.event-label\')?.textContent?.replace(\' \\u203A\', \'\') ?? drillId.slice(-8);\n' +
  '        browseStack.push({ parentId: drillId, label });\n' +
  '        selectedEventId = null;\n' +
  '        render();\n' +
  '        return;\n' +
  '      }\n' +
  '      selectedEventId = el.getAttribute(\'data-event-id\');\n' +
  '      render();\n' +
  '    });\n' +
  '  });\n' +
  '}\n' +
  '\n' +
  'function render() {\n' +
  '  if (!snapshot) {\n' +
  '    app.innerHTML = `<main class="loading-shell"><p>Scanning space...</p></main>`;\n' +
  '    return;\n' +
  '  }\n' +
  '\n' +
  '  const nodes = snapshot.nodes || [];\n' +
  '  if (!selectedNodeId || !nodes.some((n) => n.id === selectedNodeId)) {\n' +
  '    selectedNodeId = nodes[0]?.id ?? null;\n' +
  '    browseStack = [];\n' +
  '  }\n' +
  '  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? nodes[0];\n' +
  '  const nodeEvents = selectedNode ? (snapshot.eventsByNode?.[selectedNode.id] ?? []) : [];\n' +
  '  const visibleEvents = currentBrowseEvents(nodeEvents);\n' +
  '  if (!selectedEventId || !visibleEvents.some((e) => e.id === selectedEventId)) {\n' +
  '    selectedEventId = visibleEvents.at(-1)?.id ?? null;\n' +
  '  }\n' +
  '  const selectedEvent = visibleEvents.find((e) => e.id === selectedEventId) ?? visibleEvents.at(-1) ?? null;\n' +
  '\n' +
  '  const nextFp = snapshotFingerprint(snapshot);\n' +
  '  const browseChanged = browseStack.length !== renderedBrowseDepth;\n' +
  '  const nodeChanged = selectedNodeId !== renderedNodeId || browseChanged;\n' +
  '  const eventChanged = selectedEventId !== renderedEventId;\n' +
  '  const dataChanged = nextFp !== renderedFingerprint;\n' +
  '\n' +
  '  if (!isFirstRender && !dataChanged && !nodeChanged && !eventChanged) return;\n' +
  '\n' +
  '  // Fast path: only event selection changed\n' +
  '  if (!isFirstRender && !dataChanged && !nodeChanged && eventChanged) {\n' +
  '    app.querySelectorAll(\'#event-rail .event-row\').forEach((el) => {\n' +
  '      el.classList.toggle(\'is-selected\', el.getAttribute(\'data-event-id\') === selectedEventId);\n' +
  '    });\n' +
  '    const inspector = app.querySelector(\'.browser-inspector\');\n' +
  '    if (inspector) {\n' +
  '      inspector.querySelector(\'h3\').textContent = selectedEvent?.label ?? \'No event selected\';\n' +
  '      inspector.querySelector(\'.inspector-meta\').textContent = selectedEvent?.actorId ?? \'\';\n' +
  '      inspector.querySelector(\'code\').textContent = JSON.stringify(selectedEvent?.raw ?? {}, null, 2);\n' +
  '    }\n' +
  '    renderedEventId = selectedEventId;\n' +
  '    return;\n' +
  '  }\n' +
  '\n' +
  '  // Medium path: data changed but node didn\'t — patch event rail\n' +
  '  if (!isFirstRender && dataChanged && !nodeChanged) {\n' +
  '    const rail = document.getElementById(\'event-rail\');\n' +
  '    if (rail) {\n' +
  '      const existingIds = new Set();\n' +
  '      rail.querySelectorAll(\'[data-event-id]\').forEach((el) => existingIds.add(el.getAttribute(\'data-event-id\')));\n' +
  '      const newEvents = visibleEvents.filter((e) => !existingIds.has(e.id));\n' +
  '      for (const event of newEvents) {\n' +
  '        rail.insertAdjacentHTML(\'beforeend\', eventRowHtml(event, event.id === selectedEventId, eventHasChildren(event)));\n' +
  '      }\n' +
  '      rail.querySelectorAll(\'.event-row\').forEach((el) => {\n' +
  '        el.classList.toggle(\'is-selected\', el.getAttribute(\'data-event-id\') === selectedEventId);\n' +
  '      });\n' +
  '      bindEventClicks();\n' +
  '    }\n' +
  '\n' +
  '    const navMeta = app.querySelector(\'.nav-meta\');\n' +
  '    if (navMeta && selectedNode) navMeta.textContent = `${selectedNode.visibility} \\u00B7 ${selectedNode.eventCount} events \\u00B7 ${timeAgo(selectedNode.updatedAt)}`;\n' +
  '\n' +
  '    const heroMeta = app.querySelector(\'.hero-meta\');\n' +
  '    if (heroMeta) {\n' +
  '      const spans = heroMeta.querySelectorAll(\'span\');\n' +
  '      if (spans[1]) spans[1].textContent = `${nodes.length} threads`;\n' +
  '      if (spans[2]) spans[2].textContent = `${Object.values(snapshot.eventsByNode || {}).reduce((s, e) => s + e.length, 0)} events`;\n' +
  '    }\n' +
  '\n' +
  '    const graph = app.querySelector(\'.hero-graph\');\n' +
  '    if (graph) {\n' +
  '      graph.innerHTML = buildGraphMarkup(nodes) + `<div class="graph-controls">\n' +
  '        <button class="graph-zoom-in" title="Zoom in">+</button>\n' +
  '        <button class="graph-zoom-out" title="Zoom out">&minus;</button>\n' +
  '        <button class="graph-zoom-reset" title="Reset view">&#8226;</button>\n' +
  '      </div>`;\n' +
  '      bindGraphPanZoom();\n' +
  '      graph.querySelectorAll(\'[data-node-id]\').forEach((el) => {\n' +
  '        el.addEventListener(\'click\', () => { selectedNodeId = el.getAttribute(\'data-node-id\'); selectedEventId = null; browseStack = []; render(); });\n' +
  '      });\n' +
  '    }\n' +
  '\n' +
  '    const inspector = app.querySelector(\'.browser-inspector\');\n' +
  '    if (inspector) {\n' +
  '      inspector.querySelector(\'h3\').textContent = selectedEvent?.label ?? \'No event selected\';\n' +
  '      inspector.querySelector(\'.inspector-meta\').textContent = selectedEvent?.actorId ?? \'\';\n' +
  '      inspector.querySelector(\'code\').textContent = JSON.stringify(selectedEvent?.raw ?? {}, null, 2);\n' +
  '    }\n' +
  '\n' +
  '    knownNodeIds = new Set(nodes.map((n) => n.id));\n' +
  '    renderedFingerprint = nextFp;\n' +
  '    renderedNodeId = selectedNodeId;\n' +
  '    renderedBrowseDepth = browseStack.length;\n' +
  '    renderedEventId = selectedEventId;\n' +
  '    return;\n' +
  '  }\n' +
  '\n' +
  '  // Full render\n' +
  '  const totalEvents = Object.values(snapshot.eventsByNode || {}).reduce((s, e) => s + e.length, 0);\n' +
  '  graphPanZoomBound = false;\n' +
  '  app.innerHTML = `\n' +
  '    <main class="shell">\n' +
  '      <section class="hero-plane">\n' +
  '        <div class="hero-copy">\n' +
  '          <p class="eyebrow">Live space observatory</p>\n' +
  '          <h1>Threads appear as agents act.</h1>\n' +
  '          <p class="lede">\n' +
  '            The space anchors observation. Intent threads bloom at the edges.\n' +
  '            Promise lifecycles unfold inside each thread.\n' +
  '          </p>\n' +
  '          <div class="hero-meta">\n' +
  '            <span>${esc(snapshot.origin)}</span>\n' +
  '            <span>${nodes.length} threads</span>\n' +
  '            <span>${totalEvents} events</span>\n' +
  '          </div>\n' +
  '        </div>\n' +
  '        <div class="hero-graph">\n' +
  '          ${buildGraphMarkup(nodes)}\n' +
  '          <div class="graph-controls">\n' +
  '            <button class="graph-zoom-in" title="Zoom in">+</button>\n' +
  '            <button class="graph-zoom-out" title="Zoom out">&minus;</button>\n' +
  '            <button class="graph-zoom-reset" title="Reset view">&#8226;</button>\n' +
  '          </div>\n' +
  '        </div>\n' +
  '      </section>\n' +
  '\n' +
  '      <section class="browser">\n' +
  '        <nav class="browser-nav" id="nav-bar">\n' +
  '          ${buildBreadcrumbMarkup(selectedNode)}\n' +
  '          <span class="nav-meta">${selectedNode ? `${esc(selectedNode.visibility)} \\u00B7 ${selectedNode.eventCount} events \\u00B7 ${esc(timeAgo(selectedNode.updatedAt))}` : \'\'}</span>\n' +
  '        </nav>\n' +
  '\n' +
  '        <div class="browser-viewport">\n' +
  '          <div class="browser-page" id="event-rail">\n' +
  '            ${selectedNode ? `\n' +
  '              <p class="page-subtitle">${esc(selectedNode.subtitle)}${browseStack.length > 0 ? ` \\u203A ${esc(browseStack[browseStack.length - 1].label)}` : \'\'}</p>\n' +
  '              ${visibleEvents.map((e) => eventRowHtml(e, e.id === selectedEventId, eventHasChildren(e))).join(\'\')}\n' +
  '            ` : \'<p class="page-empty">No threads discovered yet.</p>\'}\n' +
  '          </div>\n' +
  '\n' +
  '          <aside class="browser-inspector${selectedEvent ? \' has-event\' : \'\'}">\n' +
  '            <p class="eyebrow">Raw detail</p>\n' +
  '            <h3>${esc(selectedEvent?.label ?? \'No event selected\')}</h3>\n' +
  '            <p class="inspector-meta">${esc(selectedEvent?.actorId ?? \'\')}</p>\n' +
  '            <pre><code>${esc(JSON.stringify(selectedEvent?.raw ?? {}, null, 2))}</code></pre>\n' +
  '          </aside>\n' +
  '        </div>\n' +
  '      </section>\n' +
  '    </main>`;\n' +
  '\n' +
  '  knownNodeIds = new Set(nodes.map((n) => n.id));\n' +
  '  isFirstRender = false;\n' +
  '  renderedFingerprint = nextFp;\n' +
  '  renderedNodeId = selectedNodeId;\n' +
  '  renderedBrowseDepth = browseStack.length;\n' +
  '  renderedEventId = selectedEventId;\n' +
  '\n' +
  '  bindNodeClicks();\n' +
  '  bindEventClicks();\n' +
  '  bindGraphPanZoom();\n' +
  '}\n' +
  '\n' +
  '// ── Connect screen ───────────────────────────────────────────────────────────\n' +
  '\n' +
  'function showConnect(errorMsg) {\n' +
  '  const hash = new URLSearchParams(location.hash.slice(1));\n' +
  '  const savedOrigin = hash.get(\'origin\') ?? \'\';\n' +
  '  const savedSpace = hash.get(\'space\') ?? \'\';\n' +
  '  const savedToken = hash.get(\'token\') ?? \'\';\n' +
  '\n' +
  '  app.innerHTML = `\n' +
  '    <main class="connect-shell">\n' +
  '      <div class="connect-card">\n' +
  '        <p class="eyebrow">Space observatory</p>\n' +
  '        <h1>Connect</h1>\n' +
  '        <div class="connect-error" id="connect-error">${esc(errorMsg ?? \'\')}</div>\n' +
  '        <form id="connect-form">\n' +
  '          <div class="connect-field">\n' +
  '            <label for="f-origin">Station origin</label>\n' +
  '            <input id="f-origin" type="url" placeholder="https://spacebase1.differ.ac" value="${esc(savedOrigin)}" required />\n' +
  '          </div>\n' +
  '          <div class="connect-field">\n' +
  '            <label for="f-space">Space ID</label>\n' +
  '            <input id="f-space" type="text" placeholder="space-xxxxxxxx-..." value="${esc(savedSpace)}" required />\n' +
  '          </div>\n' +
  '          <div class="connect-field">\n' +
  '            <label for="f-token">Station token</label>\n' +
  '            <input id="f-token" type="text" placeholder="From signup response" value="${esc(savedToken)}" required />\n' +
  '          </div>\n' +
  '          <button type="submit" class="connect-btn" id="connect-btn">Connect</button>\n' +
  '          <p class="connect-hint">\n' +
  '            These values come from the signup response. If you opened this link\n' +
  '            from the agent output, they are already filled in.\n' +
  '          </p>\n' +
  '        </form>\n' +
  '      </div>\n' +
  '    </main>`;\n' +
  '\n' +
  '  if (errorMsg) document.getElementById(\'connect-error\').style.display = \'block\';\n' +
  '\n' +
  '  document.getElementById(\'connect-form\').addEventListener(\'submit\', async (e) => {\n' +
  '    e.preventDefault();\n' +
  '    const btn = document.getElementById(\'connect-btn\');\n' +
  '    const errEl = document.getElementById(\'connect-error\');\n' +
  '    btn.disabled = true;\n' +
  '    btn.textContent = \'Connecting...\';\n' +
  '    errEl.style.display = \'none\';\n' +
  '\n' +
  '    try {\n' +
  '      const origin = document.getElementById(\'f-origin\').value.replace(/\\/+$/, \'\');\n' +
  '      const spaceId = document.getElementById(\'f-space\').value.trim();\n' +
  '      const stationToken = document.getElementById(\'f-token\').value.trim();\n' +
  '      connection = { origin, stationToken, spaceId };\n' +
  '      location.hash = `origin=${encodeURIComponent(origin)}&space=${encodeURIComponent(spaceId)}&token=${encodeURIComponent(stationToken)}`;\n' +
  '      await startObservatory();\n' +
  '    } catch (err) {\n' +
  '      errEl.textContent = err.message || err.name || \'Connection failed\';\n' +
  '      errEl.style.display = \'block\';\n' +
  '      btn.disabled = false;\n' +
  '      btn.textContent = \'Connect\';\n' +
  '    }\n' +
  '  });\n' +
  '}\n' +
  '\n' +
  '// ── Refresh loop ─────────────────────────────────────────────────────────────\n' +
  '\n' +
  'const POLL_INTERVAL = 4000;\n' +
  'let pollTimer = null;\n' +
  '\n' +
  'async function poll() {\n' +
  '  try {\n' +
  '    const { topLevel, interiors } = await scanRecursive(connection.spaceId);\n' +
  '    snapshot = buildSnapshot(connection.spaceId, topLevel, interiors);\n' +
  '    render();\n' +
  '  } catch (err) {\n' +
  '    console.warn(\'Poll failed:\', err.message);\n' +
  '  }\n' +
  '}\n' +
  '\n' +
  'async function startObservatory() {\n' +
  '  app.innerHTML = `<main class="loading-shell"><p>Scanning space...</p></main>`;\n' +
  '  const { topLevel, interiors } = await scanRecursive(connection.spaceId);\n' +
  '  snapshot = buildSnapshot(connection.spaceId, topLevel, interiors);\n' +
  '  render();\n' +
  '  pollTimer = setInterval(poll, POLL_INTERVAL);\n' +
  '}\n' +
  '\n' +
  '// ── Boot ─────────────────────────────────────────────────────────────────────\n' +
  '// Auto-connect if origin, space, and token are all in the hash.\n' +
  '\n' +
  'async function boot() {\n' +
  '  const hash = new URLSearchParams(location.hash.slice(1));\n' +
  '  const origin = hash.get(\'origin\');\n' +
  '  const space = hash.get(\'space\');\n' +
  '  const token = hash.get(\'token\');\n' +
  '  const isPublic = hash.get(\'public\') === \'1\';\n' +
  '\n' +
  '  if (origin && space && token) {\n' +
  '    try {\n' +
  '      connection = { origin, stationToken: token, spaceId: space };\n' +
  '      await startObservatory();\n' +
  '      return;\n' +
  '    } catch (err) {\n' +
  '      showConnect(`Auto-connect failed: ${err.message || err.name || \'Unknown error\'}`);\n' +
  '      return;\n' +
  '    }\n' +
  '  }\n' +
  '  // Anonymous public-read mode — for now, only valid against the commons.\n' +
  '  // Hash shape: #origin=<origin>&space=commons&public=1\n' +
  '  if (origin && space && isPublic) {\n' +
  '    try {\n' +
  '      connection = { origin, spaceId: space, stationToken: \'\', anonymous: true };\n' +
  '      await startObservatory();\n' +
  '      return;\n' +
  '    } catch (err) {\n' +
  '      showConnect(`Public read failed: ${err.message || err.name || \'Unknown error\'}`);\n' +
  '      return;\n' +
  '    }\n' +
  '  }\n' +
  '  showConnect();\n' +
  '}\n' +
  '\n' +
  'boot();\n' +
  '    </script>\n' +
  '  </body>\n' +
  '</html>\n' +
  '\n';
