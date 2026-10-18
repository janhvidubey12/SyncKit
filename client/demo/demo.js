// client/demo/demo.js
// SyncKit - Real-Time Collaborative Workspace
// Collaborative Whiteboard, Wide Room Notes with Permissions, Live Ephemeral Reactions,
// Persistent Database Storage, and Real-Time Cursors.

document.addEventListener('DOMContentLoaded', () => {
  // ==========================================
  // 1. UI Elements
  // ==========================================
  // Navigation & Status
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
  const roomErrorBanner = document.getElementById('room-error-banner');
  const roomErrorMessage = document.getElementById('room-error-message');
  const dismissRoomErrorBtn = document.getElementById('dismiss-room-error-btn');
  let roomErrorTimeout = null;

  // Room Join & Navigation
  const roomInput = document.getElementById('room-input');
  const joinBtn = document.getElementById('join-btn');
  const roomStatusBadge = document.getElementById('room-status-badge');
  const roomChips = document.querySelectorAll('.room-chip');
  const notesRoomBadge = document.getElementById('notes-room-badge');
  const activeRoomName = document.getElementById('active-room-name');
  const activeRoomMembers = document.getElementById('active-room-members');
  const roomDetails = document.getElementById('room-details');

  // Multi-Member Shared Room Notes Elements
  const openCreateNoteBtn = document.getElementById('open-create-note-btn');
  const newNoteForm = document.getElementById('new-note-form');
  const cancelCreateNoteBtn = document.getElementById('cancel-create-note-btn');
  const newNoteTitle = document.getElementById('new-note-title');
  const newNoteContent = document.getElementById('new-note-content');
  const newNotePermission = document.getElementById('new-note-permission');
  const cancelNoteBtn = document.getElementById('cancel-note-btn');
  const saveNoteBtn = document.getElementById('save-note-btn');
  const notesCardsList = document.getElementById('notes-cards-list');
  const notesEmptyState = document.getElementById('notes-empty-state');
  const notesCountBadge = document.getElementById('notes-count-badge');
  const textSyncIndicator = document.getElementById('text-sync-indicator');

  // Legacy elements preserved for backward compatibility
  const sharedTextArea = document.getElementById('shared-text-area');
  const sharedTextInput = document.getElementById('shared-text-input');
  const updateTextBtn = document.getElementById('update-text-btn');
  const noteMetaText = document.getElementById('note-meta-text');
  const notesWordCount = document.getElementById('notes-word-count');

  // Presence & Identity
  const displayNameInput = document.getElementById('display-name-input');
  const updateNameBtn = document.getElementById('update-name-btn');
  const presenceCount = document.getElementById('presence-count');
  const presenceList = document.getElementById('presence-list');

  // Collaborative Whiteboard Elements (Feature 3)
  const collabBoard = document.getElementById('collab-board');
  const whiteboardCanvas = document.getElementById('whiteboard-canvas');
  const toolPenBtn = document.getElementById('tool-pen');
  const toolEraserBtn = document.getElementById('tool-eraser');
  const colorSwatches = document.querySelectorAll('.color-swatch');
  const sizePills = document.querySelectorAll('.size-pill');
  const undoBtn = document.getElementById('undo-btn');
  const clearBoardBtn = document.getElementById('clear-board-btn');
  const whiteboardStrokeCount = document.getElementById('whiteboard-stroke-count');
  const remoteCursorsLayer = document.getElementById('remote-cursors-layer');
  const localCursorCoords = document.getElementById('local-cursor-coords');
  const floatingReactionsStage = document.getElementById('floating-reactions-stage');

  // Counter Elements (Hidden fallbacks preserved for test compatibility)
  const counterVal = document.getElementById('counter-val');
  const counterVersionVal = document.getElementById('counter-version-val');
  const decrementBtn = document.getElementById('decrement-btn');
  const incrementBtn = document.getElementById('increment-btn');
  const stepUpBtn = document.getElementById('step-up-btn');
  const stepDownBtn = document.getElementById('step-down-btn');
  const resetCounterBtn = document.getElementById('reset-counter-btn');

  // State Inspector & Ticker
  const roomStateOutput = document.getElementById('room-state-output');
  const stateVersion = document.getElementById('state-version');
  const refreshStateBtn = document.getElementById('refresh-state-btn');
  const roomFeed = document.getElementById('room-feed');
  const activityLogList = document.getElementById('activity-log-list');

  // Invite Modal Elements
  const inviteBtn = document.getElementById('invite-btn');
  const inviteModal = document.getElementById('invite-modal');
  const closeInviteBtn = document.getElementById('close-invite-btn');
  const inviteLinkInput = document.getElementById('invite-link-input');
  const copyInviteBtn = document.getElementById('copy-invite-btn');
  const copyBtnText = document.getElementById('copy-btn-text');
  const copyBtnIcon = document.getElementById('copy-btn-icon');
  const inviteToast = document.getElementById('invite-toast');
  const toastMessage = document.getElementById('toast-message');

  // ==========================================
  // 2. URL Parameters & Invite Link Helper
  // ==========================================
  function showRoomError(msg) {
    if (roomErrorBanner && roomErrorMessage) {
      roomErrorMessage.textContent = msg;
      roomErrorBanner.style.display = 'flex';
    }
    if (roomInput && roomInput.parentElement) {
      roomInput.parentElement.classList.add('input-error');
    }
    addLog(`❌ ${msg}`);
    if (roomErrorTimeout) clearTimeout(roomErrorTimeout);
    roomErrorTimeout = setTimeout(() => {
      hideRoomError();
    }, 7000);
  }

  function hideRoomError() {
    if (roomErrorBanner) roomErrorBanner.style.display = 'none';
    if (roomInput && roomInput.parentElement) {
      roomInput.parentElement.classList.remove('input-error');
    }
  }

  if (dismissRoomErrorBtn) {
    dismissRoomErrorBtn.addEventListener('click', hideRoomError);
  }

  function sanitizeRoomId(name) {
    if (!name || typeof name !== 'string') return 'room-1';
    const cleaned = name.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
    return cleaned || 'room-1';
  }

  function validateRoomId(name) {
    if (!name || typeof name !== 'string' || !name.trim()) {
      return { valid: false, error: 'Please enter a room name.' };
    }
    const cleaned = name.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
    if (!cleaned) {
      return {
        valid: false,
        error: 'Invalid room name. Room names may only contain letters, numbers, hyphens, and underscores.',
      };
    }
    return { valid: true, roomId: cleaned };
  }

  function updateActiveRoomChips(currentRoom) {
    roomChips.forEach((chip) => {
      if (chip.getAttribute('data-room') === currentRoom) {
        chip.classList.add('active');
      } else {
        chip.classList.remove('active');
      }
    });
  }

  function getRoomFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    if (roomParam && roomParam.trim()) {
      return sanitizeRoomId(roomParam);
    }
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    if (pathParts[0] === 'room' && pathParts[1]) {
      return sanitizeRoomId(pathParts[1]);
    }
    if (window.location.hash) {
      const hash = window.location.hash.replace(/^#/, '');
      if (hash.startsWith('room=')) {
        return sanitizeRoomId(hash.slice(5));
      }
      if (hash) return sanitizeRoomId(hash);
    }
    return 'room-1';
  }

  function updateBrowserUrl(roomId) {
    if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
      const url = new URL(window.location.href);
      url.searchParams.set('room', roomId);
      window.history.replaceState({ room: roomId }, '', url.toString());
    }
  }

  function getFullInviteUrl(roomId) {
    const origin = window.location.origin || 'http://localhost:3000';
    return `${origin}/demo?room=${encodeURIComponent(roomId || sync.getRoom() || 'room-1')}`;
  }

  // ==========================================
  // 3. Initialize SyncKit Library
  // ==========================================
  const initialRoom = getRoomFromUrl();
  if (roomInput) roomInput.value = initialRoom;
  if (notesRoomBadge) notesRoomBadge.textContent = initialRoom;
  if (navRoomName) navRoomName.textContent = initialRoom;

  const sync = new SyncKit({ autoConnect: true });

  function updateMyIdentityUI() {
    const name = sync.getDisplayName();
    const id = sync.getSessionId();
    const color = sync.getUserColor();

    if (clientId) clientId.textContent = `${name} (${id.slice(-6)})`;
    if (displayNameInput) displayNameInput.value = name;
    if (myColorDot) myColorDot.style.backgroundColor = color;
  }
  updateMyIdentityUI();

  function addLog(msg) {
    if (roomFeed) roomFeed.textContent = msg;
    if (activityLogList) {
      const li = document.createElement('li');
      li.className = 'log-item';
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      li.innerHTML = `<span class="log-time">${timeStr}</span> ${escapeHtml(msg)}`;
      activityLogList.insertBefore(li, activityLogList.firstChild);
      while (activityLogList.children.length > 20) {
        activityLogList.removeChild(activityLogList.lastChild);
      }
    }
  }

  function setSyncStatus(state, msg) {
    if (!textSyncIndicator) return;
    textSyncIndicator.className = `sync-badge ${state}`;
    textSyncIndicator.textContent = msg;
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ==========================================
  // 4. Collaborative Whiteboard Engine (Feature 3)
  // ==========================================
  let ctx = null;
  let isDrawing = false;
  let currentTool = 'pen'; // 'pen' | 'eraser'
  let currentColor = '#f8fafc';
  let currentSize = 5;
  let currentStrokePoints = [];
  let allStrokes = [];
  let canvasWidth = 800;
  let canvasHeight = 600;
  let dpr = window.devicePixelRatio || 1;

  if (whiteboardCanvas) {
    ctx = whiteboardCanvas.getContext('2d');
  }

  function resizeCanvas() {
    if (!whiteboardCanvas || !collabBoard || !ctx) return;
    const rect = collabBoard.getBoundingClientRect();
    canvasWidth = Math.max(rect.width, 300);
    canvasHeight = Math.max(rect.height, 400);
    dpr = window.devicePixelRatio || 1;

    whiteboardCanvas.width = canvasWidth * dpr;
    whiteboardCanvas.height = canvasHeight * dpr;
    whiteboardCanvas.style.width = `${canvasWidth}px`;
    whiteboardCanvas.style.height = `${canvasHeight}px`;

    ctx.scale(dpr, dpr);
    redrawAllStrokes();
  }

  window.addEventListener('resize', () => {
    resizeCanvas();
  });
  setTimeout(resizeCanvas, 150);

  function getCanvasCoords(e) {
    if (!whiteboardCanvas) return { x: 0, y: 0 };
    const rect = whiteboardCanvas.getBoundingClientRect();
    let clientX = e.clientX;
    let clientY = e.clientY;

    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    }

    return {
      x: Math.round((clientX - rect.left) * 10) / 10,
      y: Math.round((clientY - rect.top) * 10) / 10,
    };
  }

  function drawStroke(stroke) {
    if (!ctx || !stroke || !Array.isArray(stroke.points) || stroke.points.length === 0) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = stroke.size || 5;

    if (stroke.isEraser) {
      ctx.strokeStyle = '#08080c';
    } else {
      ctx.strokeStyle = stroke.color || '#f8fafc';
    }

    const pts = stroke.points;
    if (pts.length === 1) {
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, (stroke.size || 5) / 2, 0, Math.PI * 2);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function updateUndoButtonState() {
    if (!undoBtn) return;
    const mySessionId = sync.getSessionId();
    const myUserId = sync.getUserId();
    const hasMyStrokes = allStrokes.some(
      (s) => s.authorId === mySessionId || s.authorId === myUserId
    );
    undoBtn.disabled = !hasMyStrokes;
    if (hasMyStrokes) {
      undoBtn.classList.remove('disabled');
      undoBtn.setAttribute('title', 'Undo your last stroke');
    } else {
      undoBtn.classList.add('disabled');
      undoBtn.setAttribute('title', 'No strokes to undo');
    }
  }

  function clearCanvasDisplay() {
    if (!ctx || !whiteboardCanvas) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, whiteboardCanvas.width, whiteboardCanvas.height);
    ctx.restore();
  }

  function redrawAllStrokes() {
    if (!ctx) return;
    clearCanvasDisplay();
    for (const stroke of allStrokes) {
      drawStroke(stroke);
    }
    updateStrokeCount();
    updateUndoButtonState();
  }

  function updateStrokeCount() {
    if (whiteboardStrokeCount) {
      whiteboardStrokeCount.textContent = `${allStrokes.length} stroke${allStrokes.length === 1 ? '' : 's'}`;
    }
  }

  // Pointer event listeners on canvas for mouse & touch
  if (whiteboardCanvas) {
    whiteboardCanvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try {
        whiteboardCanvas.setPointerCapture(e.pointerId);
      } catch (err) {}

      isDrawing = true;
      const coords = getCanvasCoords(e);
      currentStrokePoints = [coords];

      drawStroke({
        color: currentColor,
        size: currentSize,
        isEraser: currentTool === 'eraser',
        points: currentStrokePoints,
      });

      sync.sendCursor({ x: coords.x, y: coords.y, isDrawing: true });
    });

    whiteboardCanvas.addEventListener('pointermove', (e) => {
      const coords = getCanvasCoords(e);
      if (localCursorCoords) {
        localCursorCoords.textContent = `X: ${Math.round(coords.x)}, Y: ${Math.round(coords.y)}`;
      }

      if (isDrawing) {
        e.preventDefault();
        const prev = currentStrokePoints[currentStrokePoints.length - 1];
        currentStrokePoints.push(coords);

        if (ctx && prev) {
          ctx.save();
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.lineWidth = currentSize;
          ctx.strokeStyle = currentTool === 'eraser' ? '#08080c' : currentColor;
          ctx.beginPath();
          ctx.moveTo(prev.x, prev.y);
          ctx.lineTo(coords.x, coords.y);
          ctx.stroke();
          ctx.restore();
        }
      }

      sync.sendCursor({ x: coords.x, y: coords.y, isDrawing });
    });

    const handlePointerUp = (e) => {
      if (!isDrawing) return;
      isDrawing = false;
      try {
        whiteboardCanvas.releasePointerCapture(e.pointerId);
      } catch (err) {}

      if (currentStrokePoints.length > 0) {
        const stroke = {
          id: `str_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          color: currentColor,
          size: currentSize,
          isEraser: currentTool === 'eraser',
          points: currentStrokePoints,
          authorId: sync.getSessionId(),
          authorName: sync.getDisplayName(),
          timestamp: Date.now(),
        };
        allStrokes.push(stroke);
        updateStrokeCount();
        updateUndoButtonState();

        sync.sendWhiteboardStroke(stroke);
      }
      currentStrokePoints = [];
    };

    whiteboardCanvas.addEventListener('pointerup', handlePointerUp);
    whiteboardCanvas.addEventListener('pointercancel', handlePointerUp);
  }

  // Whiteboard Subscriptions from server
  sync.onWhiteboardStroke(({ stroke }) => {
    if (!stroke) return;
    allStrokes.push(stroke);
    drawStroke(stroke);
    updateStrokeCount();
    updateUndoButtonState();
  });

  sync.onWhiteboardCleared(() => {
    allStrokes = [];
    clearCanvasDisplay();
    updateStrokeCount();
    updateUndoButtonState();
    addLog('🗑️ Whiteboard cleared by room member.');
  });

  sync.onWhiteboardUpdated(({ strokes }) => {
    allStrokes = Array.isArray(strokes) ? strokes : [];
    redrawAllStrokes();
  });

  // Whiteboard Tool Button Handlers
  if (toolPenBtn) {
    toolPenBtn.addEventListener('click', () => {
      currentTool = 'pen';
      toolPenBtn.classList.add('active');
      toolPenBtn.setAttribute('aria-pressed', 'true');
      if (toolEraserBtn) {
        toolEraserBtn.classList.remove('active');
        toolEraserBtn.setAttribute('aria-pressed', 'false');
      }
    });
  }

  if (toolEraserBtn) {
    toolEraserBtn.addEventListener('click', () => {
      currentTool = 'eraser';
      toolEraserBtn.classList.add('active');
      toolEraserBtn.setAttribute('aria-pressed', 'true');
      if (toolPenBtn) {
        toolPenBtn.classList.remove('active');
        toolPenBtn.setAttribute('aria-pressed', 'false');
      }
    });
  }

  colorSwatches.forEach((swatch) => {
    swatch.addEventListener('click', () => {
      const color = swatch.getAttribute('data-color');
      if (color) {
        currentColor = color;
        colorSwatches.forEach((s) => s.classList.remove('active'));
        swatch.classList.add('active');

        if (currentTool === 'eraser') {
          currentTool = 'pen';
          if (toolPenBtn) toolPenBtn.classList.add('active');
          if (toolEraserBtn) toolEraserBtn.classList.remove('active');
        }
      }
    });
  });

  sizePills.forEach((pill) => {
    pill.addEventListener('click', () => {
      const size = parseInt(pill.getAttribute('data-size'), 10);
      if (size) {
        currentSize = size;
        sizePills.forEach((p) => p.classList.remove('active'));
        pill.classList.add('active');
      }
    });
  });

  if (undoBtn) {
    undoBtn.addEventListener('click', () => {
      if (undoBtn.disabled) return;
      sync.undoWhiteboard((res) => {
        if (res && res.success) {
          if (res.noUserStrokes) {
            addLog('⚠️ No strokes drawn by you to undo.');
          } else {
            allStrokes = Array.isArray(res.strokes) ? res.strokes : [];
            redrawAllStrokes();
            addLog('⤺ Undid stroke on whiteboard.');
          }
        } else if (res && res.error) {
          addLog(`❌ Undo failed: ${res.error}`);
        }
      });
    });
  }

  if (clearBoardBtn) {
    let clearClickedOnce = false;
    let clearClickTimer = null;

    clearBoardBtn.addEventListener('click', (e) => {
      if (e) e.preventDefault();

      let shouldClear = false;

      // First attempt standard browser confirm
      try {
        shouldClear = window.confirm('Clear the collaborative whiteboard for all members in this room?');
      } catch (err) {
        shouldClear = true;
      }

      // Resilient fallback: If window.confirm is suppressed by the browser environment,
      // allow rapid double-click confirmation within 3.5s
      if (!shouldClear) {
        if (clearClickedOnce) {
          shouldClear = true;
          clearClickedOnce = false;
          if (clearClickTimer) clearTimeout(clearClickTimer);
        } else {
          clearClickedOnce = true;
          clearClickTimer = setTimeout(() => {
            clearClickedOnce = false;
          }, 3500);
        }
      }

      if (shouldClear) {
        clearClickedOnce = false;
        if (clearClickTimer) clearTimeout(clearClickTimer);

        allStrokes = [];
        clearCanvasDisplay();
        updateStrokeCount();
        updateUndoButtonState();
        addLog('🗑️ Cleared whiteboard for room.');

        sync.clearWhiteboard((res) => {
          if (res && res.error && !res.success) {
            addLog(`⚠️ Server sync clear notice: ${res.error}`);
          }
        });
      }
    });
  }

  // ==========================================
  // 5. Multi-Member Shared Notes & Permissions
  // ==========================================
  let activeEditingNoteId = null;

  if (openCreateNoteBtn) {
    openCreateNoteBtn.addEventListener('click', () => {
      if (newNoteForm) {
        newNoteForm.style.display = 'flex';
        sync.isLocalEditing = true;
        if (newNoteTitle) newNoteTitle.focus();
      }
    });
  }

  function closeNewNoteForm() {
    if (newNoteForm) newNoteForm.style.display = 'none';
    if (newNoteTitle) newNoteTitle.value = '';
    if (newNoteContent) newNoteContent.value = '';
    if (newNotePermission) newNotePermission.value = 'public';
    sync.isLocalEditing = false;
  }

  if (cancelCreateNoteBtn) cancelCreateNoteBtn.addEventListener('click', closeNewNoteForm);
  if (cancelNoteBtn) cancelNoteBtn.addEventListener('click', closeNewNoteForm);

  [newNoteTitle, newNoteContent].forEach((el) => {
    if (el) {
      el.addEventListener('focus', () => { sync.isLocalEditing = true; });
      el.addEventListener('blur', () => {
        if (!newNoteForm || newNoteForm.style.display === 'none') {
          sync.isLocalEditing = false;
        }
      });
    }
  });

  if (saveNoteBtn) {
    saveNoteBtn.addEventListener('click', () => {
      const title = newNoteTitle ? newNoteTitle.value.trim() : '';
      const content = newNoteContent ? newNoteContent.value.trim() : '';
      const permission = newNotePermission ? newNotePermission.value : 'public';

      if (!content && !title) {
        alert('Please enter a note title or content.');
        return;
      }

      setSyncStatus('saving', '◌ Saving note...');
      sync.createNote({ title, content, permission }, (res) => {
        closeNewNoteForm();
        if (res && res.success) {
          setSyncStatus('synced', `● Synced (v${res.version || sync.getState().version || 1})`);
          addLog(`📝 Created new note "${title || content.slice(0, 20)}...".`);
        } else {
          setSyncStatus('offline', '❌ Error saving');
          alert(`Failed to save note: ${res?.error || 'Server error'}`);
        }
      });
    });
  }

  function renderNotesList(state) {
    if (!notesCardsList) return;
    const notes = Array.isArray(state?.notesList) ? state.notesList : [];

    if (notesCountBadge) {
      notesCountBadge.textContent = `${notes.length} note${notes.length === 1 ? '' : 's'}`;
    }

    if (notes.length === 0) {
      notesCardsList.innerHTML = `
        <div id="notes-empty-state" class="notes-empty-card">
          <span class="empty-icon">📋</span>
          <h4 class="empty-title">No Notes in This Room</h4>
          <p class="empty-desc">Click <strong>"Create Note"</strong> above to share a note with all room members in real time.</p>
        </div>
      `;
      return;
    }

    const currentMyId = sync.getSessionId();
    const currentMyKey = sync.getAuthorKey();

    let html = '';
    notes.forEach((note) => {
      const isAuthor =
        Boolean(currentMyKey && note.authorKey && currentMyKey === note.authorKey) ||
        Boolean(currentMyId && note.authorId === currentMyId);
      const isPrivate = note.permission === 'private';
      const canEdit = isAuthor || !isPrivate;
      const canDelete = isAuthor;

      const formattedTime = note.updatedAt
        ? new Date(note.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : 'Now';

      if (activeEditingNoteId === note.id) {
        // Inline Edit Card Mode
        html += `
          <div class="note-item-card is-editing" data-note-id="${note.id}">
            <div class="note-card-top">
              <span class="form-title">✏️ Editing Note</span>
            </div>
            <input type="text" class="note-input-title edit-note-title" value="${escapeHtml(note.title || '')}" placeholder="Note title..." />
            <textarea class="note-edit-area edit-note-content" rows="4">${escapeHtml(note.content || '')}</textarea>
            ${
              isAuthor
                ? `
              <div class="note-permission-row">
                <label class="perm-label"><span class="perm-icon">🛡️</span> Permission:</label>
                <select class="permission-select edit-note-permission">
                  <option value="public" ${note.permission !== 'private' ? 'selected' : ''}>🌐 Anyone in this room can edit</option>
                  <option value="private" ${note.permission === 'private' ? 'selected' : ''}>🔒 Only I can edit</option>
                </select>
              </div>
            `
                : ''
            }
            <div class="new-note-actions">
              <button class="btn btn-xs btn-outline cancel-edit-btn" data-id="${note.id}">Cancel</button>
              <button class="btn btn-xs btn-primary save-edit-btn" data-id="${note.id}">Save Changes</button>
            </div>
          </div>
        `;
      } else {
        // Normal View Mode
        html += `
          <div class="note-item-card ${isAuthor ? 'is-own-note' : ''}" data-note-id="${note.id}">
            <div class="note-card-top">
              <div class="note-author-info">
                <span class="note-author-dot" style="background-color: ${escapeHtml(note.authorColor || '#ef4444')};"></span>
                <span class="note-author-name">${escapeHtml(note.authorName || 'Member')}</span>
                ${isAuthor ? '<span class="note-you-pill">You</span>' : ''}
              </div>
              <div class="note-top-right">
                <span class="perm-badge ${isPrivate ? 'private' : 'public'}">
                  ${isPrivate ? '🔒 Only I can edit' : '🌐 Anyone can edit'}
                </span>
                <span class="note-time">${formattedTime}</span>
              </div>
            </div>

            ${note.title ? `<h3 class="note-card-title">${escapeHtml(note.title)}</h3>` : ''}
            <div class="note-card-body">${escapeHtml(note.content || '')}</div>

            <div class="note-card-footer">
              <span class="note-shared-badge">
                ${isPrivate ? '🔒 Private Note' : '🌐 Room Shared'}
              </span>
              <div class="note-actions-group">
                ${
                  canEdit
                    ? `
                  <button class="btn-note-action edit-note-btn" data-id="${note.id}" title="Edit note">
                    ✏️ Edit
                  </button>
                `
                    : `
                  <span class="btn-note-action" style="opacity: 0.6; cursor: not-allowed;" title="Locked: Only the author can edit this note">🔒 Locked</span>
                `
                }
                ${
                  canDelete
                    ? `
                  <button class="btn-note-action delete delete-note-btn" data-id="${note.id}" title="Delete note">
                    🗑️ Delete
                  </button>
                `
                    : ''
                }
              </div>
            </div>
          </div>
        `;
      }
    });

    notesCardsList.innerHTML = html;
    attachNoteActionListeners();
  }

  function attachNoteActionListeners() {
    // Edit buttons
    document.querySelectorAll('.edit-note-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        activeEditingNoteId = id;
        sync.isLocalEditing = true;
        renderNotesList(sync.getState());
      });
    });

    // Cancel edit
    document.querySelectorAll('.cancel-edit-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeEditingNoteId = null;
        sync.isLocalEditing = false;
        renderNotesList(sync.getState());
      });
    });

    // Save edit
    document.querySelectorAll('.save-edit-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const card = e.currentTarget.closest('.note-item-card');
        const titleInput = card.querySelector('.edit-note-title');
        const contentInput = card.querySelector('.edit-note-content');
        const permSelect = card.querySelector('.edit-note-permission');

        const updatedTitle = titleInput ? titleInput.value.trim() : '';
        const updatedContent = contentInput ? contentInput.value.trim() : '';
        const updatedPerm = permSelect ? permSelect.value : undefined;

        if (!updatedContent && !updatedTitle) {
          alert('Note cannot be completely empty.');
          return;
        }

        setSyncStatus('saving', '◌ Saving changes...');
        sync.editNote(
          id,
          {
            title: updatedTitle,
            content: updatedContent,
            permission: updatedPerm,
          },
          (res) => {
            activeEditingNoteId = null;
            sync.isLocalEditing = false;
            if (res && res.success) {
              setSyncStatus('synced', `● Synced (v${res.version || sync.getState().version || 1})`);
              addLog(`✏️ Updated note "${updatedTitle || updatedContent.slice(0, 20)}...".`);
            } else {
              setSyncStatus('offline', '❌ Error saving');
              alert(`Error saving note: ${res?.error || 'Unauthorized'}`);
              renderNotesList(sync.getState());
            }
          }
        );
      });
    });

    // Delete buttons
    document.querySelectorAll('.delete-note-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        if (confirm('Delete this note from the room? All members will see it removed.')) {
          setSyncStatus('saving', '◌ Deleting note...');
          sync.deleteNote(id, (res) => {
            if (res && res.success) {
              setSyncStatus('synced', `● Synced (v${res.version || sync.getState().version || 1})`);
              addLog('🗑️ Deleted note from room.');
            } else {
              setSyncStatus('offline', '❌ Error deleting');
              alert(`Error deleting note: ${res?.error || 'Unauthorized'}`);
            }
          });
        }
      });
    });
  }

  // ==========================================
  // 6. State Rendering & Inspection
  // ==========================================
  function renderState(state) {
    if (!state) return;
    const v = state.version ?? 1;

    // Counter Widget fallbacks
    if (counterVal) counterVal.textContent = state.count ?? 0;
    if (counterVersionVal) counterVersionVal.textContent = v;
    if (stateVersion) stateVersion.textContent = v;
    if (roomStateOutput) roomStateOutput.textContent = JSON.stringify(state, null, 2);

    renderNotesList(state);

    if (noteMetaText) {
      const editor =
        state.lastUpdatedBy === sync.getUserId() ? 'You' : `User ${String(state.lastUpdatedBy).slice(0, 6)}`;
      noteMetaText.textContent = `State v${v} • Last updated by ${editor}`;
    }

    setSyncStatus('synced', `● Synced (v${v})`);
  }

  // ==========================================
  // 7. Connection Status & Reconnecting
  // ==========================================
  sync.onStatusChange((status, details) => {
    switch (status) {
      case 'connected':
        if (statusDot) statusDot.className = 'dot connected';
        if (statusText) statusText.textContent = 'Connected';
        if (toggleConnectionBtn) toggleConnectionBtn.textContent = '🔌 Disconnect Tab';
        if (reconnectingBanner) reconnectingBanner.style.display = 'none';
        setSyncStatus('synced', `● Synced (v${sync.getState().version || 1})`);
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
        setSyncStatus('offline', '⚠️ Reconnecting...');
        addLog('⚠️ Connection dropped. Attempting automatic reconnection...');
        break;

      case 'reconnected':
        if (statusDot) statusDot.className = 'dot connected';
        if (statusText) statusText.textContent = 'Reconnected';
        if (toggleConnectionBtn) toggleConnectionBtn.textContent = '🔌 Disconnect Tab';
        if (reconnectingBanner) reconnectingBanner.style.display = 'none';
        updateMyIdentityUI();

        if (details?.recovered) {
          showRecoveryBanner(sync.getState().version || 1);
        }
        addLog('🔄 Successfully reconnected! Authoritative state, notes, and whiteboard restored from server.');
        break;

      case 'disconnected':
      default:
        if (statusDot) statusDot.className = 'dot disconnected';
        if (statusText) statusText.textContent = 'Disconnected';
        if (toggleConnectionBtn) toggleConnectionBtn.textContent = '⚡ Reconnect Tab';
        if (reconnectingBanner) reconnectingBanner.style.display = 'none';
        setSyncStatus('offline', '● Offline');
        clearAllCursors();
        addLog('🔌 Disconnected from server.');
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

  function showRecoveryBanner(version) {
    if (recoveryBanner) {
      if (recoveryVersionText) recoveryVersionText.textContent = `v${version}`;
      recoveryBanner.style.display = 'flex';
      addLog(`♻️ State recovery complete: Room state restored to v${version}.`);

      setTimeout(() => {
        if (recoveryBanner) recoveryBanner.style.display = 'none';
      }, 8000);
    }
  }

  if (dismissRecoveryBtn) {
    dismissRecoveryBtn.addEventListener('click', () => {
      if (recoveryBanner) recoveryBanner.style.display = 'none';
    });
  }

  sync.onStateChange((state, meta) => {
    if (roomDetails) roomDetails.style.display = 'block';
    if (activeRoomName) activeRoomName.textContent = sync.getRoom();
    if (notesRoomBadge) notesRoomBadge.textContent = sync.getRoom();
    renderState(state);

    if (meta.recovered) {
      showRecoveryBanner(meta.version);
    } else if (meta.updatedBy) {
      const isMe = meta.updatedBy === sync.getUserId();
      const who = isMe ? 'You' : `User ${meta.updatedBy.slice(0, 5)}`;
      addLog(`State updated to v${meta.version} by ${who}.`);
    }
  });

  // ==========================================
  // 8. Presence & Online Members
  // ==========================================
  sync.onPresenceChange((users) => {
    if (presenceCount) presenceCount.textContent = users.length;
    if (activeRoomMembers) activeRoomMembers.textContent = users.length;

    const activeSessionIds = new Set(users.map((u) => u.sessionId));
    remoteCursors.forEach((_, sessionId) => {
      if (!activeSessionIds.has(sessionId)) {
        removeCursor(sessionId);
      }
    });

    if (presenceList) {
      presenceList.innerHTML = '';
      if (users.length === 0) {
        presenceList.innerHTML = '<span class="empty-state-text">No members in room yet. Use Invite to share!</span>';
        return;
      }

      users.forEach((u) => {
        const isMe = u.sessionId === sync.getSessionId();
        const userColor = SyncKit.getUserColor(u.sessionId);

        const chip = document.createElement('div');
        chip.className = `member-chip ${isMe ? 'is-me' : ''}`;
        chip.innerHTML = `
          <span class="chip-color-dot" style="background-color: ${userColor};"></span>
          <span>${escapeHtml(u.displayName || 'Anonymous')}</span>
          ${isMe ? '<span class="pill-mini">You</span>' : ''}
        `;
        presenceList.appendChild(chip);
      });
    }
  });

  sync.onError((err) => {
    addLog(`❌ SyncKit Error: ${err.message}`);
  });

  // ==========================================
  // 9. Remote Cursors on Whiteboard
  // ==========================================
  const remoteCursors = new Map();

  function updateRemoteCursor(data) {
    if (!remoteCursorsLayer) return;
    const { sessionId, displayName, x, y, color } = data;
    if (sessionId === sync.getSessionId() || data.userId === sync.getUserId()) return;

    let cursorElem = remoteCursors.get(sessionId);

    if (!cursorElem) {
      cursorElem = document.createElement('div');
      cursorElem.className = 'remote-cursor cursor-indicator';
      cursorElem.setAttribute('data-session-id', sessionId);

      cursorElem.innerHTML = `
        <svg class="cursor-pointer" viewBox="0 0 16 16" width="16" height="16">
          <path d="M0 0 L14 5 L8 8 L5 14 Z" fill="${color || '#ef4444'}" stroke="#000" stroke-width="1.2"/>
        </svg>
        <span class="cursor-label" style="background-color: ${color || '#ef4444'};">${escapeHtml(
        displayName || 'Anonymous'
      )}</span>
      `;

      remoteCursorsLayer.appendChild(cursorElem);
      remoteCursors.set(sessionId, cursorElem);
    }

    cursorElem.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }

  function removeCursor(sessionId) {
    const cursorElem = remoteCursors.get(sessionId);
    if (cursorElem && cursorElem.parentNode) {
      cursorElem.parentNode.removeChild(cursorElem);
    }
    remoteCursors.delete(sessionId);
  }

  function clearAllCursors() {
    remoteCursors.forEach((elem) => {
      if (elem.parentNode) elem.parentNode.removeChild(elem);
    });
    remoteCursors.clear();
  }

  sync.onCursorMove((data) => {
    updateRemoteCursor(data);
  });

  // ==========================================
  // 10. Room Joining & Switching
  // ==========================================
  function handleJoinRoom(rawRoomId) {
    hideRoomError();
    const candidate = (typeof rawRoomId === 'string' && rawRoomId.trim())
      ? rawRoomId.trim()
      : (roomInput ? roomInput.value.trim() : '');
    const toValidate = candidate || sync.getRoom() || 'room-1';
    const val = validateRoomId(toValidate);
    if (!val.valid) {
      showRoomError(val.error);
      return;
    }
    const targetRoom = val.roomId;

    if (joinBtn) {
      joinBtn.textContent = 'Joining...';
      joinBtn.disabled = true;
    }

    if (!sync.isConnected()) {
      addLog(`⏳ Connecting to server to join "${targetRoom}"...`);
      sync.connect();
    }

    activeEditingNoteId = null;
    closeNewNoteForm();
    clearAllCursors();
    const stage = document.getElementById('floating-reactions-stage');
    if (stage) stage.innerHTML = '';

    const isDifferentRoom = targetRoom !== sync.getRoom();
    if (isDifferentRoom) {
      allStrokes = [];
      clearCanvasDisplay();
      updateStrokeCount();
      updateUndoButtonState();
    }

    if (notesRoomBadge) notesRoomBadge.textContent = targetRoom;
    if (activeRoomName) activeRoomName.textContent = targetRoom;
    if (navRoomName) navRoomName.textContent = targetRoom;
    if (roomInput) roomInput.value = targetRoom;
    updateBrowserUrl(targetRoom);
    updateActiveRoomChips(targetRoom);

    if (notesCardsList && isDifferentRoom) {
      notesCardsList.innerHTML = `
        <div class="notes-empty-card">
          <span class="empty-icon">⏳</span>
          <h4 class="empty-title">Loading Room Notes...</h4>
          <p class="empty-desc">Fetching synchronized notes for <strong>"${targetRoom}"</strong>.</p>
        </div>
      `;
    }
    setSyncStatus('saving', '◌ Loading notes...');

    let joinFinished = false;
    const joinTimeout = setTimeout(() => {
      if (!joinFinished) {
        joinFinished = true;
        if (joinBtn) {
          joinBtn.textContent = 'Join';
          joinBtn.disabled = false;
        }
        showRoomError(`Connection to room "${targetRoom}" timed out. Server is unreachable.`);
        setSyncStatus('offline', '❌ Unreachable');
      }
    }, 6000);

    sync.joinRoom(targetRoom, (res) => {
      if (joinFinished) return;
      joinFinished = true;
      clearTimeout(joinTimeout);

      if (joinBtn) {
        joinBtn.textContent = 'Join';
        joinBtn.disabled = false;
      }

      if (res && res.success) {
        hideRoomError();
        if (roomDetails) roomDetails.style.display = 'block';
        if (roomStatusBadge) {
          roomStatusBadge.textContent = `Joined ${targetRoom}`;
        }
        if (activeRoomMembers) activeRoomMembers.textContent = res.presence?.length || 1;
        if (presenceCount) presenceCount.textContent = res.presence?.length || 1;
        if (res.state) renderState(res.state);

        allStrokes = Array.isArray(res.whiteboard) ? res.whiteboard : [];
        redrawAllStrokes();

        addLog(`✅ Joined room "${targetRoom}". Authoritative state & notes synchronized.`);
      } else {
        const err = res?.error || 'Failed to join room';
        showRoomError(err);
        setSyncStatus('offline', '❌ Error');
      }
    });
  }

  if (joinBtn) {
    joinBtn.addEventListener('click', (e) => {
      if (e) e.preventDefault();
      const val = roomInput ? roomInput.value.trim() : '';
      handleJoinRoom(val || sync.getRoom() || 'room-1');
    });
  }

  if (roomInput) {
    roomInput.addEventListener('input', () => {
      hideRoomError();
    });
    roomInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const val = roomInput.value.trim();
        handleJoinRoom(val || sync.getRoom() || 'room-1');
      }
    });
  }

  roomChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const target = chip.getAttribute('data-room');
      if (target) {
        handleJoinRoom(target);
      }
    });
  });

  // Display Name Update
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

  // Counter Actions (Hidden fallbacks preserved for backward test compatibility)
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
  if (stepUpBtn) {
    stepUpBtn.addEventListener('click', () => {
      const current = sync.getState().count || 0;
      sync.updateState({ count: current + 5 });
    });
  }
  if (stepDownBtn) {
    stepDownBtn.addEventListener('click', () => {
      const current = sync.getState().count || 0;
      sync.updateState({ count: current - 5 });
    });
  }
  if (resetCounterBtn) {
    resetCounterBtn.addEventListener('click', () => {
      sync.updateState({ count: 0 });
    });
  }

  // ==========================================
  // 11. Live Room Reactions (Feature 4)
  // ==========================================
  function triggerReactionAnimation(emoji, senderName = 'You', sourceElement = null) {
    let stage = document.getElementById('floating-reactions-stage');
    if (!stage) {
      stage = document.createElement('div');
      stage.id = 'floating-reactions-stage';
      stage.className = 'floating-reactions-stage';
      document.body.appendChild(stage);
    }

    const targetBtn = sourceElement || document.querySelector(`.reaction-trigger-btn[data-emoji="${emoji}"]`);

    let startX = window.innerWidth / 2;
    let startY = 140;

    if (targetBtn && targetBtn.getBoundingClientRect) {
      const rect = targetBtn.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        startX = rect.left + rect.width / 2;
        startY = rect.top;
      }
    }

    const bubble = document.createElement('div');
    bubble.className = 'floating-reaction-bubble';

    const xOffset = Math.floor(Math.random() * 40) - 20;
    const rotation = Math.floor(Math.random() * 24) - 12;

    bubble.style.position = 'fixed';
    bubble.style.left = `${startX}px`;
    bubble.style.top = `${startY}px`;
    bubble.style.setProperty('--x-offset', `${xOffset}px`);
    bubble.style.setProperty('--rot', `${rotation}deg`);

    bubble.innerHTML = `
      <span class="floating-reaction-emoji">${emoji}</span>
      <span class="floating-reaction-badge">${escapeHtml(senderName)}</span>
    `;

    stage.appendChild(bubble);

    setTimeout(() => {
      if (bubble.parentNode) {
        bubble.parentNode.removeChild(bubble);
      }
    }, 1100);
  }

  const reactionTriggerBtns = document.querySelectorAll('.reaction-trigger-btn');
  reactionTriggerBtns.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      if (e) e.preventDefault();
      const emoji = btn.getAttribute('data-emoji') || '❤️';
      const name = btn.getAttribute('data-name') || 'Reaction';

      triggerReactionAnimation(emoji, 'You', btn);
      sync.sendReaction(emoji);
      addLog(`${emoji} You reacted with ${name}!`);
    });
  });

  sync.onReaction(({ emoji, displayName }) => {
    const who = displayName || 'Member';
    triggerReactionAnimation(emoji, who);
    addLog(`${emoji} ${who} reacted with ${emoji}!`);
  });

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

  // ==========================================
  // 12. Shareable Invite Modal & Link
  // ==========================================
  function showToast(message) {
    if (!inviteToast) return;
    if (toastMessage) toastMessage.textContent = message;
    inviteToast.style.display = 'flex';
    setTimeout(() => {
      if (inviteToast) inviteToast.style.display = 'none';
    }, 3500);
  }

  function openInviteModal() {
    const currentRoom = sync.getRoom() || roomInput.value.trim() || 'room-1';
    const inviteUrl = getFullInviteUrl(currentRoom);

    if (inviteLinkInput) inviteLinkInput.value = inviteUrl;
    if (copyBtnText) copyBtnText.textContent = 'Copy Link';
    if (copyBtnIcon) copyBtnIcon.textContent = '📋';
    if (copyInviteBtn) copyInviteBtn.classList.remove('copied');

    if (inviteModal) inviteModal.style.display = 'flex';
  }

  function closeInviteModal() {
    if (inviteModal) inviteModal.style.display = 'none';
  }

  if (inviteBtn) inviteBtn.addEventListener('click', openInviteModal);
  if (closeInviteBtn) closeInviteBtn.addEventListener('click', closeInviteModal);

  if (inviteModal) {
    inviteModal.addEventListener('click', (e) => {
      if (e.target === inviteModal) closeInviteModal();
    });
  }

  if (copyInviteBtn) {
    copyInviteBtn.addEventListener('click', async () => {
      const currentRoom = sync.getRoom() || roomInput.value.trim() || 'room-1';
      const linkToCopy = getFullInviteUrl(currentRoom);

      let copySuccess = false;

      if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
          await navigator.clipboard.writeText(linkToCopy);
          copySuccess = true;
        } catch (err) {
          console.warn('[SyncKit] navigator.clipboard error, trying fallback:', err);
        }
      }

      if (!copySuccess && inviteLinkInput) {
        try {
          inviteLinkInput.select();
          inviteLinkInput.setSelectionRange(0, 99999);
          copySuccess = document.execCommand('copy');
        } catch (err) {
          console.error('[SyncKit] Clipboard execCommand error:', err);
        }
      }

      if (copySuccess) {
        if (copyBtnText) copyBtnText.textContent = 'Copied!';
        if (copyBtnIcon) copyBtnIcon.textContent = '✓';
        copyInviteBtn.classList.add('copied');
        showToast(`Invite link copied! Share with collaborators for room "${currentRoom}".`);

        setTimeout(() => {
          if (copyBtnText) copyBtnText.textContent = 'Copy Link';
          if (copyBtnIcon) copyBtnIcon.textContent = '📋';
          copyInviteBtn.classList.remove('copied');
        }, 2500);
      } else {
        showToast('Please press Ctrl+C to copy the link.');
      }
    });
  }

  // Auto-join initial room
  handleJoinRoom(initialRoom);
});
