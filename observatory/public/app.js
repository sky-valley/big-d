import { hierarchy, tree } from 'https://cdn.jsdelivr.net/npm/d3-hierarchy@3/+esm';

const app = document.getElementById('app');

let snapshot = null;
let selectedRoomId = null;
let selectedEventId = null;
let knownRoomIds = new Set();
let renderedSnapshotHash = null;
let renderedSelectedRoomId = null;
let renderedSelectedEventId = null;
let isFirstRender = true;

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
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function roomTone(room) {
  if (room.type === 'commons') return 'room-node room-node-commons';
  if (room.type === 'private_request_interior') return 'room-node room-node-request';
  if (room.type === 'spawned_space') return 'room-node room-node-space';
  if (room.visibility === 'private') return 'room-node room-node-private';
  return 'room-node';
}

function metroLayout(rooms, edges) {
  const coords = new Map();
  const commons = rooms.find((r) => r.type === 'commons');
  if (!commons) return coords;

  // Build a tree data structure for d3-hierarchy
  const childrenOf = new Map();
  const hasParent = new Set();
  for (const edge of edges) {
    if (!childrenOf.has(edge.from)) childrenOf.set(edge.from, []);
    childrenOf.get(edge.from).push(edge.to);
    hasParent.add(edge.to);
  }

  // Attach orphan rooms (not in any edge) as children of commons
  for (const r of rooms) {
    if (r.id !== commons.id && !hasParent.has(r.id)) {
      if (!childrenOf.has(commons.id)) childrenOf.set(commons.id, []);
      childrenOf.get(commons.id).push(r.id);
    }
  }

  const roomById = new Map(rooms.map((r) => [r.id, r]));

  function buildNode(id) {
    const kids = (childrenOf.get(id) || [])
      .filter((cid) => roomById.has(cid))
      .map((cid) => buildNode(cid));
    return { id, children: kids.length > 0 ? kids : undefined };
  }

  const root = hierarchy(buildNode(commons.id));

  // Use d3 radial tree layout — produces reliable non-overlapping positions
  const nodeCount = root.descendants().length;
  const radius = Math.min(40, 20 + nodeCount * 3);
  const treeLayout = tree()
    .size([2 * Math.PI, radius])
    .separation((a, b) => (a.parent === b.parent ? 1.2 : 2) / (a.depth || 1));

  treeLayout(root);

  // Convert polar to cartesian. Rotate so the tree fans from upper-right.
  // With only one branch, d3 places it at angle 0 (3 o'clock), so rotating
  // by -π/4 sends a single branch toward NE — visually interesting.
  const angleOffset = -Math.PI / 4;
  root.each((node) => {
    if (node.depth === 0) {
      coords.set(node.data.id, { x: 50, y: 50 });
    } else {
      const angle = node.x + angleOffset;
      const r = node.y;
      coords.set(node.data.id, {
        x: Math.max(8, Math.min(92, 50 + Math.cos(angle) * r)),
        y: Math.max(8, Math.min(92, 50 + Math.sin(angle) * r)),
      });
    }
  });

  return coords;
}

function sidebarDetail(room) {
  const age = summarizeTime(room.updatedAt);
  if (room.type === 'private_request_interior') {
    return `${room.id.slice(-6)} · ${age}`;
  }
  if (room.type === 'spawned_space') {
    return `${room.participants[0] || 'dedicated'} · ${age}`;
  }
  return age;
}

function stationLabel(room) {
  if (room.type === 'commons') return room.title;
  if (room.type === 'private_request_interior') {
    const agent = room.title.replace('Request · ', '');
    return agent;
  }
  if (room.type === 'spawned_space') {
    const name = room.title.replace('Space · ', '');
    return name;
  }
  return room.title;
}

function stationColor(room) {
  if (room.type === 'commons') return 'var(--accent)';
  if (room.type === 'private_request_interior') return 'var(--signal)';
  if (room.type === 'spawned_space') return 'var(--accent)';
  return 'var(--ink)';
}

function buildGraphMarkup(rooms) {
  const edges = snapshot.edges || [];
  const coords = metroLayout(rooms, edges);
  const roomById = new Map(rooms.map((r) => [r.id, r]));

  // Draw lines along actual tree edges
  let lineMarkup = '';
  for (const edge of edges) {
    const from = coords.get(edge.from);
    const to = coords.get(edge.to);
    if (!from || !to) continue;
    const child = roomById.get(edge.to);
    const cls = child?.type === 'private_request_interior'
      ? 'metro-line metro-line-request'
      : 'metro-line metro-line-spawned';
    lineMarkup += `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" class="${cls}" />`;
  }

  const nodeMarkup = rooms.map((room) => {
    const point = coords.get(room.id) || { x: 50, y: 50 };
    const isSelected = room.id === selectedRoomId;
    const isFresh = !knownRoomIds.has(room.id);
    const isCommons = room.type === 'commons';
    const cls = [
      'station',
      `station-${room.type}`,
      isSelected ? 'is-selected' : '',
      isFresh ? 'is-fresh' : '',
    ].filter(Boolean).join(' ');

    return `
      <button
        class="${cls}"
        data-room-id="${escapeHtml(room.id)}"
        style="left:${point.x}%;top:${point.y}%"
      >
        <span class="station-dot${isCommons ? ' station-dot-hub' : ''}" style="--dot-color:${stationColor(room)}"></span>
        <span class="station-label">${escapeHtml(stationLabel(room))}</span>
      </button>
    `;
  }).join('');

  return `
    <div class="graph-surface">
      <svg viewBox="0 0 100 100" class="graph-lines" preserveAspectRatio="none">
        ${lineMarkup}
      </svg>
      ${nodeMarkup}
    </div>
  `;
}

function snapshotFingerprint(snap) {
  const rooms = snap.rooms || [];
  const eventCounts = rooms.map((r) => `${r.id}:${(snap.eventsByRoom?.[r.id] || []).length}`).join(',');
  return `${rooms.length}|${eventCounts}`;
}

function eventRowHtml(event, isSelected) {
  return `
    <button class="event-row${isSelected ? ' is-selected' : ''}" data-event-id="${escapeHtml(event.id)}">
      <span class="event-kind">${escapeHtml(event.kind.replaceAll('_', ' '))}</span>
      <span class="event-label">${escapeHtml(event.label)}</span>
      <span class="event-meta">${escapeHtml(event.actorId)} · ${escapeHtml(summarizeTime(event.timestamp))}</span>
    </button>
  `;
}

function buildBreadcrumbPath(roomId, rooms, edges) {
  // Walk edges backwards to find path from root to this room
  const parentOf = new Map();
  for (const edge of edges) {
    parentOf.set(edge.to, edge.from);
  }
  const path = [];
  let cur = roomId;
  const roomById = new Map(rooms.map((r) => [r.id, r]));
  while (cur && roomById.has(cur)) {
    path.unshift(cur);
    cur = parentOf.get(cur);
  }
  return path;
}

function siblingsOf(roomId, rooms, edges) {
  const parentOf = new Map();
  for (const edge of edges) {
    parentOf.set(edge.to, edge.from);
  }
  const childrenOf = new Map();
  for (const edge of edges) {
    if (!childrenOf.has(edge.from)) childrenOf.set(edge.from, []);
    childrenOf.get(edge.from).push(edge.to);
  }
  const parentId = parentOf.get(roomId);
  if (!parentId) {
    // Root level — just the commons
    return rooms.filter((r) => r.type === 'commons').map((r) => r.id);
  }
  return (childrenOf.get(parentId) || []).filter((id) => rooms.some((r) => r.id === id));
}

function breadcrumbLabel(room) {
  if (room.type === 'commons') return room.title;
  if (room.type === 'private_request_interior') return room.title.replace('Request · ', '');
  if (room.type === 'spawned_space') return room.title.replace('Space · ', '');
  return room.title;
}

function buildBreadcrumbMarkup(selectedRoom, rooms, edges) {
  if (!selectedRoom) return '';
  const roomById = new Map(rooms.map((r) => [r.id, r]));
  const path = buildBreadcrumbPath(selectedRoom.id, rooms, edges);

  return path.map((id, i) => {
    const room = roomById.get(id);
    if (!room) return '';
    const siblings = siblingsOf(id, rooms, edges);
    const hasSiblings = siblings.length > 1;
    const isLast = i === path.length - 1;

    const separator = i > 0 ? '<span class="crumb-sep">›</span>' : '';
    const typeLabel = room.type === 'commons' ? 'commons'
      : room.type === 'private_request_interior' ? 'request'
      : 'space';

    let dropdown = '';
    if (hasSiblings) {
      dropdown = `<div class="crumb-dropdown">
        ${siblings.map((sid) => {
          const sr = roomById.get(sid);
          if (!sr) return '';
          return `<button class="crumb-option${sid === id ? ' is-current' : ''}" data-room-id="${escapeHtml(sid)}">${escapeHtml(breadcrumbLabel(sr))}</button>`;
        }).join('')}
      </div>`;
    }

    return `${separator}<div class="crumb${isLast ? ' crumb-current' : ''}">
      <span class="crumb-type">${escapeHtml(typeLabel)}</span>
      <button class="crumb-name${hasSiblings ? ' has-dropdown' : ''}" data-room-id="${escapeHtml(id)}">${escapeHtml(breadcrumbLabel(room))}${hasSiblings ? ' <span class="crumb-arrow">▾</span>' : ''}</button>
      ${dropdown}
    </div>`;
  }).join('');
}

function bindRoomClicks() {
  app.querySelectorAll('[data-room-id]').forEach((node) => {
    node.addEventListener('click', (e) => {
      // If this is a crumb-name with dropdown, toggle the dropdown first
      if (node.classList.contains('crumb-name') && node.classList.contains('has-dropdown')) {
        const crumb = node.closest('.crumb');
        const dropdown = crumb?.querySelector('.crumb-dropdown');
        if (dropdown) {
          // Close all other dropdowns
          app.querySelectorAll('.crumb-dropdown.is-open').forEach((d) => { if (d !== dropdown) d.classList.remove('is-open'); });
          dropdown.classList.toggle('is-open');
          e.stopPropagation();
          return;
        }
      }
      // Close any open dropdown
      app.querySelectorAll('.crumb-dropdown.is-open').forEach((d) => d.classList.remove('is-open'));
      selectedRoomId = node.getAttribute('data-room-id');
      selectedEventId = null;
      render();
    });
  });

  // Close dropdowns on outside click
  document.addEventListener('click', () => {
    app.querySelectorAll('.crumb-dropdown.is-open').forEach((d) => d.classList.remove('is-open'));
  }, { once: true });
}

function bindEventClicks() {
  app.querySelectorAll('#event-rail [data-event-id]').forEach((node) => {
    node.addEventListener('click', () => {
      selectedEventId = node.getAttribute('data-event-id');
      render();
    });
  });
}

function updateInspector(event) {
  const inspector = app.querySelector('.browser-inspector');
  if (!inspector) return;
  inspector.querySelector('h3').textContent = event?.label ?? 'No event selected';
  inspector.querySelector('.inspector-meta').textContent = event?.actorId ?? '';
  inspector.querySelector('code').textContent = JSON.stringify(event?.raw ?? {}, null, 2);
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

  const nextHash = snapshotFingerprint(snapshot);
  const roomChanged = selectedRoomId !== renderedSelectedRoomId;
  const eventChanged = selectedEventId !== renderedSelectedEventId;
  const dataChanged = nextHash !== renderedSnapshotHash;

  // Nothing changed at all — skip
  if (!isFirstRender && !dataChanged && !roomChanged && !eventChanged) {
    return;
  }

  // Fast path: only the selected event changed — just update inspector + highlight
  if (!isFirstRender && !dataChanged && !roomChanged && eventChanged) {
    app.querySelectorAll('#event-rail .event-row').forEach((node) => {
      node.classList.toggle('is-selected', node.getAttribute('data-event-id') === selectedEventId);
    });
    updateInspector(selectedEvent);
    renderedSelectedEventId = selectedEventId;
    return;
  }

  // Medium path: data changed but room didn't — patch event rail + graph only
  if (!isFirstRender && dataChanged && !roomChanged) {
    const rail = document.getElementById('event-rail');
    if (rail) {
      const existingIds = new Set();
      rail.querySelectorAll('[data-event-id]').forEach((node) => existingIds.add(node.getAttribute('data-event-id')));

      // Append only new events
      const newEvents = roomEvents.filter((e) => !existingIds.has(e.id));
      for (const event of newEvents) {
        rail.insertAdjacentHTML('beforeend', eventRowHtml(event, event.id === selectedEventId));
      }

      // Update selection highlight
      rail.querySelectorAll('.event-row').forEach((node) => {
        node.classList.toggle('is-selected', node.getAttribute('data-event-id') === selectedEventId);
      });
      bindEventClicks();
    }

    // Update nav meta
    const navMeta = app.querySelector('.nav-meta');
    if (navMeta && selectedRoom) {
      navMeta.textContent = `${selectedRoom.visibility} · ${selectedRoom.eventCount} events · ${summarizeTime(selectedRoom.updatedAt)}`;
    }

    // Update hero meta counts
    const heroMeta = app.querySelector('.hero-meta');
    if (heroMeta) {
      const spans = heroMeta.querySelectorAll('span');
      if (spans[1]) spans[1].textContent = `${rooms.length} rooms`;
      if (spans[2]) spans[2].textContent = `${Object.values(snapshot.eventsByRoom || {}).reduce((sum, events) => sum + events.length, 0)} semantic events`;
    }

    // Refresh graph for new rooms
    const graph = app.querySelector('.hero-graph');
    if (graph) {
      graph.innerHTML = buildGraphMarkup(rooms);
      graph.querySelectorAll('[data-room-id]').forEach((node) => {
        node.addEventListener('click', () => {
          selectedRoomId = node.getAttribute('data-room-id');
          selectedEventId = null;
          render();
        });
      });
    }

    // Refresh breadcrumb if rooms changed
    const roomList = document.getElementById('room-list');
    if (roomList) {
      const navMeta = roomList.querySelector('.nav-meta')?.textContent;
      roomList.innerHTML = buildBreadcrumbMarkup(selectedRoom, rooms, snapshot.edges || [])
        + `<span class="nav-meta">${selectedRoom ? `${escapeHtml(selectedRoom.visibility)} · ${selectedRoom.eventCount} events · ${escapeHtml(summarizeTime(selectedRoom.updatedAt))}` : ''}</span>`;
      bindRoomClicks();
    }

    updateInspector(selectedEvent);
    knownRoomIds = new Set(rooms.map((room) => room.id));
    renderedSnapshotHash = nextHash;
    renderedSelectedRoomId = selectedRoomId;
    renderedSelectedEventId = selectedEventId;
    return;
  }

  // Full render: first load, room switch, or structural change
  app.innerHTML = `
    <main class="shell">
      <section class="hero-plane">
        <div class="hero-copy">
          <p class="eyebrow">Live Headwaters observatory</p>
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

      <section class="browser">
        <nav class="browser-nav" id="room-list">
          ${buildBreadcrumbMarkup(selectedRoom, rooms, snapshot.edges || [])}
          <span class="nav-meta">${selectedRoom ? `${escapeHtml(selectedRoom.visibility)} · ${selectedRoom.eventCount} events · ${escapeHtml(summarizeTime(selectedRoom.updatedAt))}` : ''}</span>
        </nav>

        <div class="browser-viewport">
          <div class="browser-page" id="event-rail">
            ${selectedRoom ? `
              <p class="page-subtitle">${escapeHtml(selectedRoom.subtitle)}</p>
              ${roomEvents.map((event) => eventRowHtml(event, event.id === selectedEventId)).join('')}
            ` : '<p class="page-empty">No rooms discovered yet.</p>'}
          </div>

          <aside class="browser-inspector${selectedEvent ? ' has-event' : ''}">
            <p class="eyebrow">Raw detail</p>
            <h3>${escapeHtml(selectedEvent?.label ?? 'No event selected')}</h3>
            <p class="inspector-meta">${escapeHtml(selectedEvent?.actorId ?? '')}</p>
            <pre><code>${escapeHtml(JSON.stringify(selectedEvent?.raw ?? {}, null, 2))}</code></pre>
          </aside>
        </div>
      </section>
    </main>
  `;

  knownRoomIds = new Set(rooms.map((room) => room.id));
  isFirstRender = false;
  renderedSnapshotHash = nextHash;
  renderedSelectedRoomId = selectedRoomId;
  renderedSelectedEventId = selectedEventId;

  bindRoomClicks();
  bindEventClicks();
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
