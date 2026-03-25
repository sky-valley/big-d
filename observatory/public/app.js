const app = document.getElementById('app');

let snapshot = null;
let selectedRoomId = null;
let selectedEventId = null;
let knownRoomIds = new Set();

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function summarizeTime(timestamp) {
  if (!timestamp) return 'quiet';
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 5) return 'live now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ago`;
}

function roomTone(room) {
  if (room.type === 'commons') return 'room-node room-node-commons';
  if (room.visibility === 'private') return 'room-node room-node-private';
  return 'room-node';
}

function roomPosition(index, total, radius) {
  if (total <= 1) return { x: 50, y: 50 };
  const angle = (-Math.PI / 2) + (index / Math.max(total, 1)) * Math.PI * 2;
  return {
    x: 50 + Math.cos(angle) * radius,
    y: 50 + Math.sin(angle) * radius,
  };
}

function buildGraphMarkup(rooms) {
  const commons = rooms.find((room) => room.type === 'commons');
  const others = rooms.filter((room) => room.id !== commons?.id);
  const indexById = new Map();
  const coords = new Map();

  if (commons) {
    coords.set(commons.id, { x: 50, y: 50 });
    indexById.set(commons.id, 0);
  }
  others.forEach((room, index) => {
    coords.set(room.id, roomPosition(index, others.length, 34));
    indexById.set(room.id, index + 1);
  });

  const edgeMarkup = (snapshot.edges || []).map((edge) => {
    const from = coords.get(edge.from);
    const to = coords.get(edge.to);
    if (!from || !to) return '';
    return `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" class="graph-edge graph-edge-${edge.kind}" />`;
  }).join('');

  const nodeMarkup = rooms.map((room) => {
    const point = coords.get(room.id) || { x: 50, y: 50 };
    const isSelected = room.id === selectedRoomId;
    const isFresh = !knownRoomIds.has(room.id);
    return `
      <button
        class="${roomTone(room)}${isSelected ? ' is-selected' : ''}${isFresh ? ' is-fresh' : ''}"
        data-room-id="${escapeHtml(room.id)}"
        style="left:${point.x}%;top:${point.y}%"
      >
        <span class="room-node-title">${escapeHtml(room.title)}</span>
        <span class="room-node-meta">${escapeHtml(room.visibility)} · ${escapeHtml(summarizeTime(room.updatedAt))}</span>
      </button>
    `;
  }).join('');

  return `
    <div class="graph-surface">
      <svg viewBox="0 0 100 100" class="graph-lines" preserveAspectRatio="none">
        ${edgeMarkup}
      </svg>
      ${nodeMarkup}
    </div>
  `;
}

function render() {
  if (!snapshot) {
    app.innerHTML = `<main class="loading-shell"><p>Waiting for Headwaters activity…</p></main>`;
    return;
  }

  const rooms = snapshot.rooms || [];
  if (!selectedRoomId || !rooms.some((room) => room.id === selectedRoomId)) {
    selectedRoomId = rooms[0]?.id ?? null;
  }
  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) ?? rooms[0];
  const roomEvents = selectedRoom ? (snapshot.eventsByRoom?.[selectedRoom.id] ?? []) : [];
  if (!selectedEventId || !roomEvents.some((event) => event.id === selectedEventId)) {
    selectedEventId = roomEvents.at(-1)?.id ?? null;
  }
  const selectedEvent = roomEvents.find((event) => event.id === selectedEventId) ?? roomEvents.at(-1) ?? null;

  app.innerHTML = `
    <main class="shell">
      <section class="hero-plane">
        <div class="hero-copy">
          <p class="eyebrow">${escapeHtml(snapshot.label || 'Live Headwaters observatory')}</p>
          <h1>Rooms appear as agents make them real.</h1>
          <p class="lede">
            Commons anchors the space. Private request interiors bloom at the edges. Spawned spaces arrive as dedicated rooms, not hidden backend state.
          </p>
          <div class="hero-meta">
            <span>${escapeHtml(snapshot.headwatersOrigin)}</span>
            <span>${rooms.length} rooms</span>
            <span>${Object.values(snapshot.eventsByRoom || {}).reduce((sum, events) => sum + events.length, 0)} semantic events</span>
          </div>
        </div>
        <div class="hero-graph">
          ${buildGraphMarkup(rooms)}
        </div>
      </section>

      <section class="workspace">
        <div class="room-list" id="room-list">
          ${rooms.map((room) => `
            <button class="room-pill${room.id === selectedRoomId ? ' is-selected' : ''}" data-room-id="${escapeHtml(room.id)}">
              <span>${escapeHtml(room.title)}</span>
              <span>${escapeHtml(room.type.replaceAll('_', ' '))}</span>
            </button>
          `).join('')}
        </div>

        <section class="room-stage">
          ${selectedRoom ? `
            <header class="room-header">
              <div>
                <p class="eyebrow">${escapeHtml(selectedRoom.type.replaceAll('_', ' '))}</p>
                <h2>${escapeHtml(selectedRoom.title)}</h2>
                <p class="room-subtitle">${escapeHtml(selectedRoom.subtitle)}</p>
              </div>
              <div class="room-badges">
                <span>${escapeHtml(selectedRoom.visibility)}</span>
                <span>${selectedRoom.eventCount} events</span>
                <span>${escapeHtml(summarizeTime(selectedRoom.updatedAt))}</span>
              </div>
            </header>
            <div class="event-rail" id="event-rail">
              ${roomEvents.map((event) => `
                <button class="event-row${event.id === selectedEventId ? ' is-selected' : ''}" data-event-id="${escapeHtml(event.id)}">
                  <span class="event-kind">${escapeHtml(event.kind.replaceAll('_', ' '))}</span>
                  <span class="event-label">${escapeHtml(event.label)}</span>
                  <span class="event-meta">${escapeHtml(event.actorId)} · ${escapeHtml(summarizeTime(event.timestamp))}</span>
                </button>
              `).join('')}
            </div>
          ` : '<p>No rooms discovered yet.</p>'}
        </section>

        <aside class="inspector">
          <p class="eyebrow">Raw detail</p>
          <h3>${escapeHtml(selectedEvent?.label ?? 'No event selected')}</h3>
          <p class="inspector-meta">${escapeHtml(selectedEvent?.actorId ?? '')}</p>
          <pre>${escapeHtml(JSON.stringify(selectedEvent?.raw ?? {}, null, 2))}</pre>
        </aside>
      </section>
    </main>
  `;

  knownRoomIds = new Set(rooms.map((room) => room.id));

  app.querySelectorAll('[data-room-id]').forEach((node) => {
    node.addEventListener('click', () => {
      selectedRoomId = node.getAttribute('data-room-id');
      selectedEventId = null;
      render();
    });
  });
  app.querySelectorAll('[data-event-id]').forEach((node) => {
    node.addEventListener('click', () => {
      selectedEventId = node.getAttribute('data-event-id');
      render();
    });
  });
}

async function boot() {
  const res = await fetch('/api/snapshot');
  snapshot = await res.json();
  render();

  const stream = new EventSource('/api/stream');
  stream.addEventListener('snapshot', (event) => {
    snapshot = JSON.parse(event.data);
    render();
  });
}

boot().catch((error) => {
  app.innerHTML = `<main class="loading-shell"><p>Observatory failed to load: ${escapeHtml(error.message)}</p></main>`;
});
