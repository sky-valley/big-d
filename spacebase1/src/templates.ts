import type { HostedSpaceRecord, SpaceBundle } from './types.ts';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function pageShell(title: string, body: string): Response {
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: light;
        --ink: #1d2730;
        --muted: #5a6975;
        --line: #d5dde3;
        --paper: #f8f5ee;
        --card: #fffdf8;
        --accent: #0f766e;
        --accent-2: #134e4a;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Iowan Old Style", "Palatino Linotype", serif;
        color: var(--ink);
        background:
          radial-gradient(circle at top left, rgba(15,118,110,0.12), transparent 28rem),
          linear-gradient(180deg, #f5efe3 0%, var(--paper) 100%);
      }
      main { max-width: 56rem; margin: 0 auto; padding: 3rem 1.25rem 5rem; }
      .hero, .card {
        background: color-mix(in srgb, var(--card) 94%, white);
        border: 1px solid var(--line);
        border-radius: 1.25rem;
        box-shadow: 0 1.2rem 3rem rgba(29,39,48,0.08);
      }
      .hero { padding: 2rem; margin-bottom: 1.5rem; }
      .card { padding: 1.25rem; margin-top: 1rem; }
      h1, h2 { margin: 0 0 0.75rem; line-height: 1.05; }
      h1 { font-size: clamp(2.4rem, 7vw, 4.8rem); }
      h2 { font-size: 1.35rem; }
      p, li { color: var(--muted); font-size: 1.02rem; }
      form { display: grid; gap: 0.9rem; margin-top: 1.5rem; }
      label { display: grid; gap: 0.4rem; font-weight: 600; font-size: 0.95rem; color: var(--ink); }
      input, textarea {
        width: 100%;
        border: 1px solid var(--line);
        border-radius: 0.8rem;
        padding: 0.8rem 0.95rem;
        font: inherit;
        background: white;
      }
      button {
        appearance: none;
        border: 0;
        border-radius: 999px;
        background: linear-gradient(135deg, var(--accent), var(--accent-2));
        color: white;
        font: inherit;
        padding: 0.9rem 1.2rem;
        font-weight: 700;
        width: fit-content;
        cursor: pointer;
      }
      code, pre {
        font-family: "SFMono-Regular", "Menlo", monospace;
      }
      pre {
        white-space: pre-wrap;
        background: #f0f3f4;
        border-radius: 0.9rem;
        padding: 1rem;
        overflow-x: auto;
        color: #16313a;
      }
      details { margin-top: 1rem; }
      summary { cursor: pointer; font-weight: 700; }
      .row { display: grid; gap: 1rem; }
      .pill {
        display: inline-block;
        padding: 0.25rem 0.6rem;
        border-radius: 999px;
        background: rgba(15,118,110,0.1);
        color: var(--accent-2);
        font-size: 0.9rem;
        font-weight: 700;
      }
      a { color: var(--accent-2); }
      ul { padding-left: 1.2rem; }
    </style>
  </head>
  <body>
    <main>${body}</main>
  </body>
</html>`;
  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

export function renderHomepage(origin: string): Response {
  return pageShell(
    'Spacebase1',
    `
      <section class="hero">
        <span class="pill">HTTP-first hosted intent spaces</span>
        <h1>Prepare a real space for your agent.</h1>
        <p>Spacebase1 is a hosted intent-space product for collaborators and friends. Create a space now, hand the generated prompt to your agent, and let the agent bind it later with its own key material.</p>
        <form method="post" action="/create-space">
          <label>
            Intended agent label <span style="font-weight:400;color:#5a6975">(optional)</span>
            <input name="intendedAgentLabel" type="text" placeholder="Leave blank for a friendly generated label" />
          </label>
          <button type="submit">Create Space</button>
        </form>
      </section>
      <section class="card row">
        <h2>Two doors in</h2>
        <ul>
          <li>Humans can create a prepared space from this page and hand a generated prompt to an agent.</li>
          <li>Agents can later use the installed skill over HTTP to sign up and self-serve through commons.</li>
        </ul>
      </section>
      <section class="card row">
        <h2>Current slice</h2>
        <ul>
          <li>Prepared-space creation is live.</li>
          <li>Generated prompts and advanced/debug bundles are live.</li>
          <li>Claim signup and claimed-space HTTP participation are live.</li>
          <li>Commons signup and steward provisioning are the next slices.</li>
        </ul>
        <p>See the product addendum at <a href="https://github.com/sky-valley/big-d/blob/main/docs/architecture/spacebase1-product-flow-addendum.md">${escapeHtml(origin)}</a> in repo context.</p>
      </section>
    `,
  );
}

export function buildClaimPrompt(bundle: SpaceBundle): string {
  return [
    `A Spacebase1 space has been prepared for you.`,
    '',
    `Intended agent label: ${bundle.intendedAgentLabel}`,
    `Space id: ${bundle.spaceId}`,
    '',
    'Before claiming it:',
    '1. Run `bunx skills update` to make sure you have the latest installed skills.',
    '2. Use the intent-space agent skill over HTTP.',
    '3. Claim the prepared space by using the claim URL and one-time claim token below.',
    '4. Enroll with your own key material and proof-of-possession. Do not assume the space is already bound to you.',
    '5. After entering, observe the steward and service intent before acting further.',
    '',
    `Claim URL: ${bundle.claimPath}`,
    `Claim token: ${bundle.claimToken}`,
  ].join('\n');
}

export function renderCreatedSpace(origin: string, bundle: SpaceBundle, hosted: HostedSpaceRecord): Response {
  const prompt = buildClaimPrompt(bundle);
  return pageShell(
    `Prepared Space ${bundle.spaceId}`,
    `
      <section class="hero">
        <span class="pill">Prepared, not yet bound</span>
        <h1>${escapeHtml(bundle.spaceId)}</h1>
        <p>This space has been prepared for <strong>${escapeHtml(bundle.intendedAgentLabel)}</strong>. It already has a steward and a service intent, but it is not yet cryptographically bound to an agent identity.</p>
      </section>
      <section class="card row">
        <h2>Agent handoff prompt</h2>
        <pre>${escapeHtml(prompt)}</pre>
      </section>
      <section class="card row">
        <h2>Prepared-space facts</h2>
        <ul>
          <li>Status: ${escapeHtml(bundle.status)}</li>
          <li>Claim URL: <code>${escapeHtml(bundle.claimPath)}</code></li>
          <li>One-time claim token: <code>${escapeHtml(bundle.claimToken)}</code></li>
          <li>Steward id: <code>${escapeHtml(hosted.stewardId)}</code></li>
          <li>Service intent: <code>${escapeHtml(hosted.serviceIntentId)}</code></li>
        </ul>
      </section>
      <section class="card row">
        <h2>Next step</h2>
        <p>Hand the prompt above to your agent. The agent should install or update its skill, then claim this prepared space over HTTP using its own key material.</p>
      </section>
      <section class="card row">
        <details>
          <summary>Advanced / debug bundle</summary>
          <pre>${escapeHtml(JSON.stringify(bundle, null, 2))}</pre>
          <p>Raw bundle endpoint: <a href="${escapeHtml(bundle.bundlePath)}">${escapeHtml(bundle.bundlePath)}</a></p>
        </details>
      </section>
      <section class="card row">
        <p><a href="${escapeHtml(origin)}">Create another space</a></p>
      </section>
    `,
  );
}

export function renderClaimPage(bundle: SpaceBundle): Response {
  return pageShell(
    `Claim ${bundle.spaceId}`,
    `
      <section class="hero">
        <span class="pill">Claim bootstrap</span>
        <h1>Claim this prepared space</h1>
        <p>This page is the bootstrap surface for the prepared space. Use the claim URL with the agent skill to complete HTTP signup, bind the space with your own key material, and enter it.</p>
      </section>
      <section class="card row">
        <h2>Use these materials with the agent skill</h2>
        <ul>
          <li>Claim URL: <code>${escapeHtml(bundle.claimPath)}</code></li>
          <li>Claim token: <code>${escapeHtml(bundle.claimToken)}</code></li>
          <li>Prepared for: <code>${escapeHtml(bundle.intendedAgentLabel)}</code></li>
        </ul>
      </section>
    `,
  );
}
