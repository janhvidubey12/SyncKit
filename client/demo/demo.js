// client/demo/demo.js
// SyncKit Demo Application
// Clean, modern, professional client implementation utilizing the public SyncKit API.
// Strictly uses real-time library synchronization (no simulated users, zero mock sync).

document.addEventListener('DOMContentLoaded', () => {
  // ==========================================
  // 1. UI Elements
  // ==========================================
  // Navigation & Connection
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const userCount = document.getElementById('user-count');
  const clientId = document.getElementById('client-id');
  const myColorDot = document.getElementById('my-color-dot');
  const toggleConnectionBtn = document.getElementById('toggle-connection-btn');
  const navRoomPill = document.getElementById('nav-room-pill');
  const navRoomName = document.getElementById('nav-room-name');

  // Banners
  const reconnectingBanner = document.getElementById('reconnecting-banner');
  const reconnectAttemptCount = document.getElementById('reconnect-attempt-count');
  const recoveryBanner = document.getElementById('recovery-banner');
  const recoveryVersionText = document.getElementById('recovery-version-text');
  const dismissRecoveryBtn = document.getElementById('dismiss-recovery-btn');

  // Room Join
  const roomInput = document.getElementById('room-input');
  const joinBtn = document.getElementById('join-btn');
  const roomStatusBadge = document.getElementById('room-status-badge');
  const chipButtons = document.querySelectorAll('.chip-btn');
  const roomDetails = document.getElementById('room-details');
  const activeRoomName = document.getElementById('active-room-name');
  const activeRoomMembers = document.getElementById('active-room-members');

  // Presence
  const displayNameInput = document.getElementById('display-name-input');
  const updateNameBtn = document.getElementById('update-name-btn');
  const presenceCount = document.getElementById('presence-count');
  const presenceList = document.getElementById('presence-list');

  // Counter
  const counterVal = document.getElementById('counter-val');
  const counterVersionVal = document.getElementById('counter-version-val');
  const decrementBtn = document.getElementById('decrement-btn');
  const incrementBtn = document.getElementById('increment-btn');

  // Shared Note
  const sharedTextArea = document.getElementById('shared-text-area');
  const sharedTextInput = document.getElementById('shared-text-input');
  const updateTextBtn = document.getElementById('update-text-btn');
  const textSyncIndicator = document.getElementById('text-sync-indicator');
  const noteMetaText = document.getElementById('note-meta-text');

  // Cursors
  const localCursorCoords = document.getElementById('local-cursor-coords');

  // State Inspector & Logs
  const roomStateOutput = document.getElementById('room-state-output');
  const stateVersion = document.getElementById('state-version');
  const refreshStateBtn = document.getElementById('refresh-state-btn');
  const roomFeed = document.getElementById('room-feed');
  const activityLogList = document.getElementById('activity-log-list');

  // ==========================================
  // 2. Initialize SyncKit Library
  // ==========================================
  const sync = new SyncKit({ autoConnect: true });

  // Update initial identity UI
  function updateMyIdentityUI() {
    const name = sync.getDisplayName();
    const id = sync.getSessionId();
    const color = sync.getUserColor();

    if (clientId) clientId.textContent = `${name} (${id.slice(-6)})`;
    if (displayNameInput) displayNameInput.value = name;
    if (myColorDot) myColorDot.style.backgroundColor = color;
  }
  updateMyIdentityUI();

  // Activity logger helper
  function addLog(msg) {
    if (roomFeed) roomFeed.textContent = msg;
    if (activityLogList) {
      const li = document.createElement('li');
      li.className = 'log-item';
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      li.innerHTML = `<span class="log-time">${timeStr}</span> <span>${msg}</span>`;
      activityLogList.insertBefore(li, activityLogList.firstChild);
      while (activityLogList.children.length > 25) {
        activityLogList.removeChild(activityLogList.lastChild);
      }
    }
  }

  // ==========================================
  // 3. Live Cursor Tracking & Rendering (Requirement 5)
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
          <path d="M0 0L7.5 18.5L10.5 11L18 8L0 0Z" fill="${color}" stroke="#0b0f19" stroke-width="1.5" stroke-linejoin="round"/>
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
    remoteCursors.forEach((cursor) => {
      if (cursor && cursor.parentNode) cursor.parentNode.removeChild(cursor);
    });
    remoteCursors.clear();
  }

  // Capture mouse movement across page (throttled inside SyncKit to ~30ms)
  window.addEventListener('mousemove', (e) => {
    if (localCursorCoords) {
      localCursorCoords.textContent = `X: ${e.clientX}, Y: ${e.clientY}`;
    }
    if (sync.isConnected() && sync.getRoom()) {
      sync.sendCursor({ x: e.clientX, y: e.clientY });
    }
  });

  // Render incoming cursors from other room members
  sync.onCursorMove(({ sessionId, displayName, x, y, color }) => {
    if (sessionId === sync.getSessionId()) return;

    const cursor = getOrCreateCursor(sessionId, displayName, color);
    cursor.style.transform = `translate3d(${x}px, ${y}px, 0)`;

    const label = cursor.querySelector('.cursor-label');
    if (label && displayName && label.textContent !== displayName) {
      label.textContent = displayName;
    }
  });

  // ==========================================
  // 4. State Rendering & Inspection
  // ==========================================
  function renderState(state) {
    if (!state) return;
    const v = state.version ?? 1;

    if (counterVal) counterVal.textContent = state.count ?? 0;
    if (counterVersionVal) counterVersionVal.textContent = v;
    if (stateVersion) stateVersion.textContent = v;
    if (roomStateOutput) roomStateOutput.textContent = JSON.stringify(state, null, 2);

    if (typeof state.text === 'string') {
      if (sharedTextInput) sharedTextInput.value = state.text;
      if (sharedTextArea && document.activeElement !== sharedTextArea) {
        sharedTextArea.value = state.text;
      }
    }

    if (noteMetaText) {
      const editor = state.lastUpdatedBy === sync.getUserId() ? 'You' : `Socket ${String(state.lastUpdatedBy).slice(0, 6)}`;
      noteMetaText.textContent = `Last modified by ${editor} (v${v})`;
    }
  }

  // ==========================================
  // 5. Connection Status & Reconnecting Handlers (Requirements 6, 7, 8)
  // ==========================================
  sync.onStatusChange((status, details) => {
    switch (status) {
      case 'connected':
        if (statusDot) statusDot.className = 'dot connected';
        if (statusText) statusText.textContent = 'Connected';
        if (toggleConnectionBtn) toggleConnectionBtn.textContent = '🔌 Disconnect Tab';
        if (reconnectingBanner) reconnectingBanner.style.display = 'none';
        updateMyIdentityUI();
        addLog(`Connected to SyncKit server (Socket ID: ${sync.getUserId() || details?.socketId})`);
        break;

      case 'reconnecting':
        if (statusDot) statusDot.className = 'dot reconnecting';
        if (statusText) statusText.textContent = 'Reconnecting...';
        if (toggleConnectionBtn) toggleConnectionBtn.textContent = '⚡ Cancel Reconnect';
        if (reconnectingBanner) {
          reconnectingBanner.style.display = 'flex';
          if (reconnectAttemptCount) reconnectAttemptCount.textContent = details?.attempt || 1;
        }
        addLog('⚠️ Connection dropped. Attempting automatic reconnection...');
        break;

      case 'reconnected':
        if (statusDot) statusDot.className = 'dot connected';
        if (statusText) statusText.textContent = 'Reconnected';
        if (toggleConnectionBtn) toggleConnectionBtn.textContent = '🔌 Disconnect Tab';
        if (reconnectingBanner) reconnectingBanner.style.display = 'none';
        updateMyIdentityUI();

        // Requirement 8: State recovery completion notice
        if (details?.recovered) {
          showRecoveryBanner(sync.getState().version || 1);
        }
        addLog('🔄 Successfully reconnected! Latest room state recovered from server.');
        break;

      case 'disconnected':
      default:
        if (statusDot) statusDot.className = 'dot disconnected';
        if (statusText) statusText.textContent = 'Disconnected';
        if (toggleConnectionBtn) toggleConnectionBtn.textContent = '⚡ Reconnect Tab';
        if (reconnectingBanner) reconnectingBanner.style.display = 'none';
        clearAllCursors();
        addLog('🔌 Disconnected from server.');
        break;
    }
  });

  // Toggle Disconnect/Reconnect Button handler
  if (toggleConnectionBtn) {
    toggleConnectionBtn.addEventListener('click', () => {
      if (sync.isConnected()) {
        sync.disconnect();
      } else {
        sync.connect();
      }
    });
  }

  // ==========================================
  // 6. Visible State Recovery Banner (Requirement 8)
  // ==========================================
  function showRecoveryBanner(version) {
    if (recoveryBanner) {
      if (recoveryVersionText) recoveryVersionText.textContent = `v${version}`;
      recoveryBanner.style.display = 'flex';
      addLog(`♻️ State recovery complete: Room state restored to v${version}.`);

      // Auto dismiss after 9 seconds if not manually closed
      setTimeout(() => {
        if (recoveryBanner) recoveryBanner.style.display = 'none';
      }, 9000);
    }
  }

  if (dismissRecoveryBtn) {
    dismissRecoveryBtn.addEventListener('click', () => {
      if (recoveryBanner) recoveryBanner.style.display = 'none';
    });
  }

  // ==========================================
  // 7. State Changes Subscription
  // ==========================================
  sync.onStateChange((state, meta) => {
    if (roomDetails) roomDetails.style.display = 'flex';
    if (activeRoomName) activeRoomName.textContent = sync.getRoom();
    renderState(state);

    if (meta.recovered) {
      showRecoveryBanner(meta.version);
    } else if (meta.updatedBy) {
      const isMe = meta.updatedBy === sync.getUserId();
      const who = isMe ? 'You' : `Member ${meta.updatedBy.slice(0, 5)}`;
      addLog(`State updated to v${meta.version} by ${who}.`);
    }
  });

  // ==========================================
  // 8. Room Presence Subscription (Requirement 4)
  // ==========================================
  sync.onPresenceChange((users) => {
    if (presenceCount) presenceCount.textContent = users.length;
    if (activeRoomMembers) activeRoomMembers.textContent = users.length;

    // Clean up cursors for members who disconnected
    const activeSessionIds = new Set(users.map((u) => u.sessionId));
    remoteCursors.forEach((_, sessionId) => {
      if (!activeSessionIds.has(sessionId)) {
        removeCursor(sessionId);
      }
    });

    if (presenceList) {
      presenceList.innerHTML = '';
      if (users.length === 0) {
        presenceList.innerHTML = '<span class="empty-notice">No active members in room.</span>';
        return;
      }

      users.forEach((u) => {
        const isMe = u.sessionId === sync.getSessionId();
        const userColor = SyncKit.getUserColor(u.sessionId);

        const pill = document.createElement('div');
        pill.className = `user-pill ${isMe ? 'user-me' : ''}`;
        pill.innerHTML = `
          <span class="member-dot" style="background-color: ${userColor};"></span>
          <span>${u.displayName || 'Anonymous'}</span>
          ${isMe ? '<span class="pill pill-info" style="font-size:0.65rem; padding:0.1rem 0.35rem;">You</span>' : ''}
        `;
        presenceList.appendChild(pill);
      });
    }
  });

  // Error listener
  sync.onError((err) => {
    addLog(`❌ SyncKit Error: ${err.message}`);
  });

  // ==========================================
  // 9. Interactive User Actions
  // ==========================================

  // Join Room Functionality (Requirement 1)
  function handleJoinRoom(roomId) {
    if (!roomId) {
      addLog('⚠️ Please enter a room name.');
      return;
    }

    clearAllCursors();

    if (!sync.isConnected()) {
      addLog(`⏳ Connecting to server to join "${roomId}"...`);
      sync.connect();
    }

    sync.joinRoom(roomId, (res) => {
      if (res && res.success) {
        if (roomDetails) roomDetails.style.display = 'flex';
        if (activeRoomName) activeRoomName.textContent = res.roomId || roomId;
        if (navRoomName) navRoomName.textContent = res.roomId || roomId;
        if (navRoomPill) navRoomPill.style.display = 'inline-flex';
        if (roomStatusBadge) {
          roomStatusBadge.className = 'pill pill-success';
          roomStatusBadge.textContent = `Joined ${res.roomId || roomId}`;
        }
        if (activeRoomMembers) activeRoomMembers.textContent = res.presence?.length || 1;
        if (res.state) renderState(res.state);
        addLog(`✅ Successfully joined room "${roomId}". Authoritative state synchronized.`);
      } else if (res && res.error) {
        addLog(`❌ Failed to join room "${roomId}": ${res.error}`);
      }
    });
  }

  if (joinBtn) {
    joinBtn.addEventListener('click', () => {
      handleJoinRoom(roomInput.value.trim());
    });
  }

  if (roomInput) {
    roomInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleJoinRoom(roomInput.value.trim());
    });
  }

  // Quick Room Presets
  chipButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetRoom = btn.getAttribute('data-room');
      if (targetRoom && roomInput) {
        roomInput.value = targetRoom;
        handleJoinRoom(targetRoom);
      }
    });
  });

  // Update Display Name
  if (updateNameBtn && displayNameInput) {
    const handleUpdateName = () => {
      const newName = displayNameInput.value.trim();
      if (newName) {
        sync.setDisplayName(newName);
        updateMyIdentityUI();
        addLog(`✏️ Updated your display name to "${newName}".`);
      }
    };
    updateNameBtn.addEventListener('click', handleUpdateName);
    displayNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleUpdateName();
    });
  }

  // Counter Actions (Requirement 2)
  if (incrementBtn) {
    incrementBtn.addEventListener('click', () => {
      const current = sync.getState().count || 0;
      sync.updateState({ count: current + 1 });
    });
  }

  if (decrementBtn) {
    decrementBtn.addEventListener('click', () => {
      const current = sync.getState().count || 0;
      sync.updateState({ count: current - 1 });
    });
  }

  // Shared Note Actions (Requirement 3)
  let textDebounceTimer = null;

  function syncSharedText(val) {
    if (textSyncIndicator) {
      textSyncIndicator.className = 'pill pill-info';
      textSyncIndicator.textContent = 'Syncing...';
    }
    sync.updateState({ text: val }, (res) => {
      if (textSyncIndicator) {
        textSyncIndicator.className = 'pill pill-success';
        textSyncIndicator.textContent = 'Synced';
      }
    });
  }

  if (sharedTextArea) {
    sharedTextArea.addEventListener('input', (e) => {
      const val = e.target.value;
      if (sharedTextInput) sharedTextInput.value = val;

      if (textSyncIndicator) {
        textSyncIndicator.className = 'pill pill-muted';
        textSyncIndicator.textContent = 'Typing...';
      }

      // Smooth debounced sync (~300ms of inactivity triggers real-time broadcast)
      clearTimeout(textDebounceTimer);
      textDebounceTimer = setTimeout(() => {
        syncSharedText(val);
      }, 300);
    });
  }

  if (updateTextBtn && sharedTextArea) {
    updateTextBtn.addEventListener('click', () => {
      clearTimeout(textDebounceTimer);
      syncSharedText(sharedTextArea.value);
    });
  }

  // Manual Fetch State on Demand
  if (refreshStateBtn) {
    refreshStateBtn.addEventListener('click', () => {
      sync.getState((res) => {
        if (res && res.success) {
          renderState(res.state);
          addLog(`🔄 State snapshot fetched from server (v${res.state.version}).`);
        }
      });
    });
  }
});
