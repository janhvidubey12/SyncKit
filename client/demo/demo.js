// client/demo/demo.js
// Demo application showing how clean application code is when using the SyncKit public API.
// Notice: ZERO Socket.IO calls or raw networking logic here!

document.addEventListener('DOMContentLoaded', () => {
  // 1. UI Elements
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const userCount = document.getElementById('user-count');
  const clientId = document.getElementById('client-id');
  const toggleConnectionBtn = document.getElementById('toggle-connection-btn');
  const displayNameInput = document.getElementById('display-name-input');
  const updateNameBtn = document.getElementById('update-name-btn');

  const roomInput = document.getElementById('room-input');
  const joinBtn = document.getElementById('join-btn');
  const roomDetails = document.getElementById('room-details');
  const activeRoomName = document.getElementById('active-room-name');
  const activeRoomMembers = document.getElementById('active-room-members');
  const presenceCount = document.getElementById('presence-count');
  const presenceList = document.getElementById('presence-list');
  const roomStateOutput = document.getElementById('room-state-output');
  const roomFeed = document.getElementById('room-feed');

  const counterVal = document.getElementById('counter-val');
  const decrementBtn = document.getElementById('decrement-btn');
  const incrementBtn = document.getElementById('increment-btn');
  const sharedTextInput = document.getElementById('shared-text-input');
  const updateTextBtn = document.getElementById('update-text-btn');
  const stateVersion = document.getElementById('state-version');
  const refreshStateBtn = document.getElementById('refresh-state-btn');

  // 2. Initialize the SyncKit library (networking happens automatically inside)
  const sync = new SyncKit();

  // Populate initial display name in UI
  if (displayNameInput) {
    displayNameInput.value = sync.getDisplayName();
  }

  // ==========================================
  // Live Cursor Sharing State & Helpers
  // Declared early so listeners can safely access them
  // ==========================================
  const remoteCursors = new Map(); // sessionId -> DOMElement

  function getOrCreateCursor(sessionId, displayName, color) {
    let cursor = remoteCursors.get(sessionId);
    if (!cursor) {
      cursor = document.createElement('div');
      cursor.className = 'cursor-indicator';
      cursor.id = `cursor-${sessionId}`;
      cursor.innerHTML = `
        <svg class="cursor-pointer" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M0 0L7.5 18.5L10.5 11L18 8L0 0Z" fill="${color}" stroke="#0f172a" stroke-width="1.5" stroke-linejoin="round"/>
        </svg>
        <span class="cursor-label" style="background-color: ${color};">${displayName || 'Anonymous'}</span>
      `;
      document.body.appendChild(cursor);
      remoteCursors.set(sessionId, cursor);
    }
    return cursor;
  }

  function removeCursor(sessionId) {
    const cursor = remoteCursors.get(sessionId);
    if (cursor) {
      if (cursor.parentNode) cursor.parentNode.removeChild(cursor);
      remoteCursors.delete(sessionId);
    }
  }

  function clearAllCursors() {
    if (typeof remoteCursors !== 'undefined' && remoteCursors) {
      remoteCursors.forEach((cursor) => {
        if (cursor && cursor.parentNode) cursor.parentNode.removeChild(cursor);
      });
      remoteCursors.clear();
    }
  }

  // Helper to render state updates
  function renderState(state) {
    if (!state) return;
    counterVal.textContent = state.count ?? 0;
    stateVersion.textContent = state.version ?? 1;
    roomStateOutput.textContent = JSON.stringify(state, null, 2);

    if (document.activeElement !== sharedTextInput && typeof state.text === 'string') {
      sharedTextInput.value = state.text;
    }
  }


  // 3. Listen to connection status changes through the public API
  sync.onStatusChange((status, details) => {
    switch (status) {
      case 'connected':
        statusDot.className = 'dot connected';
        statusText.textContent = 'Connected';
        clientId.textContent = `${sync.getDisplayName()} (${sync.getSessionId()})`;
        if (toggleConnectionBtn) toggleConnectionBtn.textContent = '🔌 Disconnect Tab';
        break;
      case 'reconnecting':
        statusDot.className = 'dot disconnected';
        statusText.textContent = 'Reconnecting...';
        roomFeed.textContent = '⚠️ Connection dropped. Attempting to reconnect...';
        if (toggleConnectionBtn) toggleConnectionBtn.textContent = '⚡ Reconnect Tab';
        break;
      case 'reconnected':
        statusDot.className = 'dot connected';
        statusText.textContent = 'Reconnected';
        clientId.textContent = `${sync.getDisplayName()} (${sync.getSessionId()})`;
        if (toggleConnectionBtn) toggleConnectionBtn.textContent = '🔌 Disconnect Tab';
        if (details.recovered) {
          roomFeed.textContent = '🔄 Reconnected! State was automatically recovered from the server.';
        }
        break;
      case 'disconnected':
      default:
        statusDot.className = 'dot disconnected';
        statusText.textContent = 'Disconnected';
        clientId.textContent = 'Not connected';
        if (toggleConnectionBtn) toggleConnectionBtn.textContent = '⚡ Reconnect Tab';
        clearAllCursors();
        break;
    }
  });


  if (toggleConnectionBtn) {
    toggleConnectionBtn.addEventListener('click', () => {
      if (sync.isConnected()) {
        sync.disconnect();
      } else {
        sync.connect();
      }
    });
  }

  // 4. Update display name handler (Requirement 2)
  if (updateNameBtn && displayNameInput) {
    updateNameBtn.addEventListener('click', () => {
      const newName = displayNameInput.value.trim();
      if (newName) {
        sync.setDisplayName(newName);
        clientId.textContent = `${sync.getDisplayName()} (${sync.getSessionId()})`;
        roomFeed.textContent = `✏️ Updated your display name to "${newName}".`;
      }
    });

    displayNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') updateNameBtn.click();
    });
  }

  // 5. Listen to state changes through the public API
  sync.onStateChange((state, meta) => {
    roomDetails.style.display = 'block';
    activeRoomName.textContent = sync.getRoom();
    renderState(state);

    if (meta.recovered) {
      roomFeed.textContent = `♻️ Auto-recovered latest state (v${meta.version}) from server after reconnection!`;
    } else if (meta.updatedBy) {
      const isMe = meta.updatedBy === sync.getUserId();
      const who = isMe ? 'You' : `User ${meta.updatedBy.slice(0, 6)}...`;
      roomFeed.textContent = `🔄 State updated to v${meta.version} by ${who}.`;
    }
  });

  // ==========================================
  // Live Cursor Sharing Event Listeners (Requirements 1, 4, 5, 8)
  // ==========================================


  // 1. Capture cursor movement on the page and send through SyncKit (Requirement 1 & 2)
  window.addEventListener('mousemove', (e) => {
    if (sync.isConnected() && sync.getRoom()) {
      sync.sendCursor({ x: e.clientX, y: e.clientY });
    }
  });

  // 2. Render other users' cursors with distinct colors & labels (Requirement 4 & 5)
  sync.onCursorMove(({ sessionId, displayName, x, y, color }) => {
    if (sessionId === sync.getSessionId()) return;

    const cursor = getOrCreateCursor(sessionId, displayName, color);
    cursor.style.transform = `translate3d(${x}px, ${y}px, 0)`;

    // Keep label updated if display name changes
    const label = cursor.querySelector('.cursor-label');
    if (label && displayName && label.textContent !== displayName) {
      label.textContent = displayName;
    }
  });

  // 6. Room presence events through the public API (Requirement 4 & 8)
  sync.onPresenceChange((users) => {
    if (presenceCount) presenceCount.textContent = users.length;
    if (activeRoomMembers) activeRoomMembers.textContent = users.length;

    // Remove stale cursor indicators when users leave (Requirement 8)
    const activeSessionIds = new Set(users.map((u) => u.sessionId));
    remoteCursors.forEach((_, sessionId) => {
      if (!activeSessionIds.has(sessionId)) {
        removeCursor(sessionId);
      }
    });

    if (presenceList) {
      presenceList.innerHTML = '';
      users.forEach((u) => {
        const isMe = u.sessionId === sync.getSessionId();
        const pill = document.createElement('span');
        pill.className = `user-pill ${isMe ? 'user-me' : ''}`;
        pill.textContent = `${isMe ? '🟢 ' : '⚪ '}${u.displayName}${isMe ? ' (You)' : ''}`;
        presenceList.appendChild(pill);
      });
    }
  });

  // 7. Error handling through the public API
  sync.onError((err) => {
    alert(`[SyncKit Error] ${err.message}`);
  });


  // 8. User Action Handlers (calling SyncKit public methods)

  // Join Room
  joinBtn.addEventListener('click', () => {
    const roomId = roomInput.value.trim();
    if (!roomId) {
      roomFeed.textContent = '⚠️ Please enter a room name.';
      return;
    }

    clearAllCursors();

    if (!sync.isConnected()) {
      roomFeed.textContent = `⏳ Connecting to server to join "${roomId}"...`;
      sync.connect();
    }

    sync.joinRoom(roomId, (res) => {
      if (res && res.success) {
        roomDetails.style.display = 'block';
        activeRoomName.textContent = res.roomId || roomId;
        activeRoomMembers.textContent = res.presence?.length || 1;
        if (res.state) renderState(res.state);
        roomFeed.textContent = `✅ Joined "${roomId}". Received authoritative state.`;
      } else if (res && res.error) {
        roomFeed.textContent = `❌ Could not join "${roomId}": ${res.error}`;
      }
    });
  });



  roomInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') joinBtn.click();
  });

  // Update State: Increment
  incrementBtn.addEventListener('click', () => {
    const current = sync.getState().count || 0;
    sync.updateState({ count: current + 1 });
  });

  // Update State: Decrement
  decrementBtn.addEventListener('click', () => {
    const current = sync.getState().count || 0;
    sync.updateState({ count: current - 1 });
  });

  // Update State: Text
  updateTextBtn.addEventListener('click', () => {
    sync.updateState({ text: sharedTextInput.value });
  });

  sharedTextInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') updateTextBtn.click();
  });

  // Fetch State on Demand
  refreshStateBtn.addEventListener('click', () => {
    sync.getState((res) => {
      if (res && res.success) {
        renderState(res.state);
        roomFeed.textContent = `🔄 State refreshed from server (v${res.state.version}).`;
      }
    });
  });
});
