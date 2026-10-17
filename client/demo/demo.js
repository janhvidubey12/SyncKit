// client/demo/demo.js
// SyncKit - Real-Time Collaborative Workspace
// Black and Red Theme with Shared Multi-Member Room Notes
// Demonstrates genuine real-time multiplayer synchronization using the clean SyncKit API.

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
  const cancelNoteBtn = document.getElementById('cancel-note-btn');
  const saveNoteBtn = document.getElementById('save-note-btn');
  const notesCardsList = document.getElementById('notes-cards-list');
  const notesEmptyState = document.getElementById('notes-empty-state');
  const notesCountBadge = document.getElementById('notes-count-badge');
  const textSyncIndicator = document.getElementById('text-sync-indicator');
  const newNoteEditable = document.getElementById('new-note-editable');

  // Navigation Tabs (Notes vs Discussions)
  const tabBtnNotes = document.getElementById('tab-btn-notes');
  const tabBtnDiscussions = document.getElementById('tab-btn-discussions');
  const notesTabContent = document.getElementById('notes-tab-content');
  const discussionsTabContent = document.getElementById('discussions-tab-content');

  // Stored Room Discussions Elements (SQLite Database)
  const discussionsFeedList = document.getElementById('discussions-feed-list');
  const discussionsEmptyState = document.getElementById('discussions-empty-state');
  const discussionsCountBadge = document.getElementById('discussions-count-badge');
  const discussionRoomBadge = document.getElementById('discussion-room-badge');
  const discussionInput = document.getElementById('discussion-input');
  const sendDiscussionBtn = document.getElementById('send-discussion-btn');

  // Collaborative Whiteboard Elements (Pen & Eraser)
  const whiteboardCanvas = document.getElementById('whiteboard-canvas');
  const canvasViewport = document.getElementById('canvas-viewport');
  const wbToolPen = document.getElementById('wb-tool-pen');
  const wbToolEraser = document.getElementById('wb-tool-eraser');
  const wbClearBtn = document.getElementById('wb-clear-btn');
  const wbColorDots = document.querySelectorAll('.wb-color-dot');
  const wbSizeBtns = document.querySelectorAll('.wb-size-btn');

  // Legacy elements preserved for test compatibility
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

  // Collaboration Board & Cursors
  const collabBoard = document.getElementById('collab-board');
  const remoteCursorsLayer = document.getElementById('remote-cursors-layer');
  const localCursorCoords = document.getElementById('local-cursor-coords');

  // Counter Widget
  const counterVal = document.getElementById('counter-val');
  const counterVersionVal = document.getElementById('counter-version-val');
  const decrementBtn = document.getElementById('decrement-btn');
  const incrementBtn = document.getElementById('increment-btn');

  // Reaction Cards
  const reactionCards = document.querySelectorAll('.reaction-card');

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
  function sanitizeRoomId(name) {
    if (!name || typeof name !== 'string') return 'room-1';
    const cleaned = name.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
    return cleaned || 'room-1';
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
      li.innerHTML = `<span class="log-time">${timeStr}</span> <span>${msg}</span>`;
      activityLogList.insertBefore(li, activityLogList.firstChild);
      while (activityLogList.children.length > 25) {
        activityLogList.removeChild(activityLogList.lastChild);
      }
    }
  }

  // ==========================================
  // 4. Live Cursor Sharing
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
          <path d="M0 0L7.5 18.5L10.5 11L18 8L0 0Z" fill="${color || '#ef4444'}" stroke="#060608" stroke-width="1.5" stroke-linejoin="round"/>
        </svg>
        <span class="cursor-label" style="background-color: ${color || '#ef4444'};">${displayName || 'Anonymous'}</span>
      `;
      if (remoteCursorsLayer) {
        remoteCursorsLayer.appendChild(cursor);
      } else {
        document.body.appendChild(cursor);
      }
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

  // Capture cursor movements within the collaborative surface
  if (collabBoard) {
    collabBoard.addEventListener('mousemove', (e) => {
      const rect = collabBoard.getBoundingClientRect();
      const relX = Math.round(e.clientX - rect.left);
      const relY = Math.round(e.clientY - rect.top);

      if (localCursorCoords) {
        localCursorCoords.textContent = `Cursor: X: ${relX}, Y: ${relY}`;
      }

      if (sync.isConnected() && sync.getRoom()) {
        const pctX = rect.width > 0 ? relX / rect.width : 0;
        const pctY = rect.height > 0 ? relY / rect.height : 0;
        sync.sendCursor({
          x: relX,
          y: relY,
          data: { pctX, pctY },
        });
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!localCursorCoords) return;
      if (e.target && !collabBoard.contains(e.target)) {
        localCursorCoords.textContent = `Window: X: ${e.clientX}, Y: ${e.clientY}`;
      }
    });
  }

  // Render incoming remote cursors
  sync.onCursorMove(({ sessionId, displayName, x, y, color, data }) => {
    if (sessionId === sync.getSessionId()) return;

    const cursor = getOrCreateCursor(sessionId, displayName, color);

    if (collabBoard && data && typeof data.pctX === 'number' && typeof data.pctY === 'number') {
      const rect = collabBoard.getBoundingClientRect();
      const posX = Math.round(data.pctX * rect.width);
      const posY = Math.round(data.pctY * rect.height);
      cursor.style.transform = `translate3d(${posX}px, ${posY}px, 0)`;
    } else {
      cursor.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    }

    const label = cursor.querySelector('.cursor-label');
    if (label && displayName && label.textContent !== displayName) {
      label.textContent = displayName;
    }
  });

  // ==========================================
  // 5. Shared Room Notes Collection for Every Member
  // ==========================================
  let activeEditingNoteId = null; // Track note currently being inline edited
  let editDebounceTimer = null;

  function setSyncStatus(status, text) {
    if (!textSyncIndicator) return;
    textSyncIndicator.className = `sync-badge ${status}`;
    textSyncIndicator.textContent = text;
  }

  function formatRelativeTime(dateStr) {
    if (!dateStr) return 'Just now';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return 'Recently';
      const now = new Date();
      const diffSec = Math.floor((now - d) / 1000);
      if (diffSec < 10) return 'Just now';
      if (diffSec < 60) return `${diffSec}s ago`;
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin}m ago`;
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return 'Recently';
    }
  }

  // Toggle New Note Form
  if (openCreateNoteBtn) {
    openCreateNoteBtn.addEventListener('click', () => {
      if (!newNoteForm) return;
      const isHidden = newNoteForm.style.display === 'none';
      newNoteForm.style.display = isHidden ? 'flex' : 'none';
      if (isHidden && newNoteContent) {
        newNoteContent.focus();
      }
    });
  }

  function closeNewNoteForm() {
    if (newNoteForm) newNoteForm.style.display = 'none';
    if (newNoteTitle) newNoteTitle.value = '';
    if (newNoteContent) newNoteContent.value = '';
  }

  if (cancelCreateNoteBtn) cancelCreateNoteBtn.addEventListener('click', closeNewNoteForm);
  if (cancelNoteBtn) cancelNoteBtn.addEventListener('click', closeNewNoteForm);

  // Publish New Note
  if (saveNoteBtn) {
    saveNoteBtn.addEventListener('click', () => {
      const content = newNoteContent ? newNoteContent.value.trim() : '';
      const title = newNoteTitle ? newNoteTitle.value.trim() : '';
      const editable = newNoteEditable ? newNoteEditable.checked : true;

      if (!content) {
        alert('Please write some content for your note.');
        if (newNoteContent) newNoteContent.focus();
        return;
      }

      setSyncStatus('saving', '◌ Publishing note...');
      sync.createNote({ title, content, editable }, (res) => {
        if (res && res.success) {
          closeNewNoteForm();
          setSyncStatus('synced', `● Synced (v${res.version || sync.getState().version || 1})`);
          addLog(`📝 Published note "${title || content.slice(0, 20)}..." (${editable ? '🔓 Editable by all' : '🔒 Locked to author'}).`);
        } else {
          setSyncStatus('offline', '❌ Error saving');
          alert('Failed to publish note. Please check your connection.');
        }
      });
    });
  }

  // Render Note Cards List
  function renderNotesList(state) {
    if (!notesCardsList) return;

    let notes = [];
    if (Array.isArray(state?.notesList)) {
      notes = state.notesList;
    } else if (state?.notes || state?.text) {
      // Backward compatibility fallback: synthesize a single note card from legacy text
      const content = state.notes || state.text;
      notes = [{
        id: 'note_legacy_primary',
        authorId: state.lastUpdatedBy || 'system',
        authorName: state.lastUpdatedBy === sync.getUserId() ? sync.getDisplayName() : 'Collaborator',
        authorColor: '#ef4444',
        title: 'Room Note',
        content: content,
        createdAt: state.lastUpdated || new Date().toISOString(),
        updatedAt: state.lastUpdated || new Date().toISOString(),
      }];
    }

    // Update count badge
    if (notesCountBadge) {
      notesCountBadge.textContent = `${notes.length} ${notes.length === 1 ? 'note' : 'notes'}`;
    }

    // Update legacy hidden fields
    const serializedNotes = notes.map((n) => n.content).join('\n\n');
    if (sharedTextArea) sharedTextArea.value = serializedNotes;
    if (sharedTextInput) sharedTextInput.value = serializedNotes;

    // Empty state
    if (notes.length === 0) {
      notesCardsList.innerHTML = `
        <div id="notes-empty-state" class="notes-empty-card">
          <span class="empty-icon">📋</span>
          <h4 class="empty-title">No Notes in This Room</h4>
          <p class="empty-desc">Click <strong>"Create Note"</strong> above to share a note with all members in this room in real time.</p>
        </div>
      `;
      return;
    }

    // If user is currently editing an active note, preserve their active textarea to avoid losing focus
    if (activeEditingNoteId) {
      const activeTextarea = document.getElementById(`edit-textarea-${activeEditingNoteId}`);
      if (activeTextarea && document.activeElement === activeTextarea) {
        // Only re-render non-active notes or update timestamps
        return;
      }
    }

    // Build cards HTML
    notesCardsList.innerHTML = '';
    notes.forEach((note) => {
      const isMyNote = note.authorId === sync.getSessionId();
      const isEditable = note.editable !== false;
      const canEdit = isMyNote || isEditable;
      const authorColor = note.authorColor || SyncKit.getUserColor(note.authorId);
      const isCurrentlyEditing = activeEditingNoteId === note.id;

      const card = document.createElement('div');
      card.className = `note-item-card ${isMyNote ? 'is-own-note' : ''} ${!isEditable ? 'is-locked-note' : ''}`;
      card.id = `note-card-${note.id}`;

      if (isCurrentlyEditing) {
        // Edit mode card
        card.innerHTML = `
          <div class="note-card-top">
            <div class="note-author-info">
              <span class="note-author-dot" style="background-color: ${authorColor};"></span>
              <span class="note-author-name">${escapeHtml(note.authorName || 'Member')}</span>
              ${isMyNote ? '<span class="note-you-pill">You</span>' : ''}
            </div>
            <span class="note-time">Editing</span>
          </div>
          <input type="text" id="edit-title-${note.id}" class="note-input-title" value="${escapeHtml(note.title || '')}" placeholder="Title (optional)" />
          <textarea id="edit-textarea-${note.id}" class="note-edit-area" rows="4">${escapeHtml(note.content || '')}</textarea>
          ${isMyNote ? `
            <div class="note-permission-row" style="margin-top: 0.35rem; padding: 0.4rem 0.6rem;">
              <label class="perm-checkbox-label" for="edit-editable-${note.id}">
                <input type="checkbox" id="edit-editable-${note.id}" ${isEditable ? 'checked' : ''} />
                <span class="perm-checkbox-custom"></span>
                <span class="perm-text-group">
                  <strong class="perm-title" style="font-size: 0.78rem;">Allow other members to edit this note</strong>
                </span>
              </label>
            </div>
          ` : ''}
          <div class="new-note-actions" style="margin-top: 0.4rem;">
            <button class="btn btn-xs btn-outline cancel-edit-btn" data-id="${note.id}">Cancel</button>
            <button class="btn btn-xs btn-primary save-edit-btn" data-id="${note.id}">Save Changes</button>
          </div>
        `;
      } else {
        // Normal view card
        card.innerHTML = `
          <div class="note-card-top">
            <div class="note-author-info">
              <span class="note-author-dot" style="background-color: ${authorColor};"></span>
              <span class="note-author-name">${escapeHtml(note.authorName || 'Member')}</span>
              ${isMyNote ? '<span class="note-you-pill">You</span>' : ''}
            </div>
            <div class="note-top-right">
              ${isEditable
                ? '<span class="note-perm-pill editable" title="Anyone in this room can edit this note">🔓 Editable by all</span>'
                : '<span class="note-perm-pill locked" title="Only the author can edit this note">🔒 Locked (Author only)</span>'
              }
              <span class="note-time">${formatRelativeTime(note.updatedAt || note.createdAt)}</span>
            </div>
          </div>
          ${note.title ? `<div class="note-card-title">${escapeHtml(note.title)}</div>` : ''}
          <div class="note-card-body">${escapeHtml(note.content || '')}</div>
          <div class="note-card-footer">
            <span class="note-shared-badge" title="${isEditable ? 'Collaborative: Any member can edit' : 'Author protected'}">
              ${isEditable ? '🌐 Room Shared' : '🔒 Protected'}
            </span>
            <div class="note-actions-group">
              ${isMyNote ? `
                <button class="btn-note-action perm-toggle-btn" data-id="${note.id}" title="${isEditable ? 'Click to lock note (only you can edit)' : 'Click to unlock note (allow all members to edit)'}">
                  ${isEditable ? '🔒 Lock' : '🔓 Unlock'}
                </button>
              ` : ''}
              ${canEdit ? `
                <button class="btn-note-action edit-note-btn" data-id="${note.id}" title="Edit note">✏️ Edit</button>
              ` : `
                <button class="btn-note-action locked" disabled title="Locked: Only ${escapeHtml(note.authorName || 'author')} can edit this note">🔒 Read-only</button>
              `}
              ${(isMyNote || isEditable) ? `
                <button class="btn-note-action delete delete-note-btn" data-id="${note.id}" title="Delete note">🗑️ Delete</button>
              ` : ''}
            </div>
          </div>
        `;
      }

      notesCardsList.appendChild(card);
    });

    // Attach listeners for Edit, Delete, Save, Toggle Permission
    attachNoteCardActions();
  }

  function escapeHtml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function attachNoteCardActions() {
    // Permission toggle buttons (Author only)
    document.querySelectorAll('.perm-toggle-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        setSyncStatus('saving', '◌ Updating permission...');
        sync.toggleNoteEditable(id, (res) => {
          if (res && res.success) {
            setSyncStatus('synced', `● Synced (v${res.version || sync.getState().version || 1})`);
            addLog(`🔒 Updated note editing permission.`);
          } else {
            setSyncStatus('offline', '❌ Error');
            alert(res?.error || 'Failed to update note permission.');
          }
        });
      });
    });

    // Edit buttons
    document.querySelectorAll('.edit-note-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        activeEditingNoteId = id;
        renderNotesList(sync.getState());
        const textarea = document.getElementById(`edit-textarea-${id}`);
        if (textarea) {
          textarea.focus();
          textarea.setSelectionRange(textarea.value.length, textarea.value.length);
        }
      });
    });

    // Cancel edit buttons
    document.querySelectorAll('.cancel-edit-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeEditingNoteId = null;
        renderNotesList(sync.getState());
      });
    });

    // Save edit buttons
    document.querySelectorAll('.save-edit-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const titleInput = document.getElementById(`edit-title-${id}`);
        const contentTextarea = document.getElementById(`edit-textarea-${id}`);
        const editEditableCheckbox = document.getElementById(`edit-editable-${id}`);
        const updatedTitle = titleInput ? titleInput.value.trim() : '';
        const updatedContent = contentTextarea ? contentTextarea.value.trim() : '';

        if (!updatedContent) {
          alert('Note content cannot be empty. Click Delete if you wish to remove it.');
          return;
        }

        const updates = { title: updatedTitle, content: updatedContent };
        if (editEditableCheckbox) {
          updates.editable = editEditableCheckbox.checked;
        }

        setSyncStatus('saving', '◌ Saving changes...');
        sync.editNote(id, updates, (res) => {
          activeEditingNoteId = null;
          if (res && res.success) {
            setSyncStatus('synced', `● Synced (v${res.version || sync.getState().version || 1})`);
            addLog(`✏️ Updated note "${updatedTitle || updatedContent.slice(0, 20)}...".`);
          } else {
            setSyncStatus('offline', '❌ Error saving');
            alert(res?.error || 'Failed to save note changes.');
          }
        });
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
              alert(res?.error || 'Failed to delete note.');
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

    // Counter Widget
    if (counterVal) counterVal.textContent = state.count ?? 0;
    if (counterVersionVal) counterVersionVal.textContent = v;
    if (stateVersion) stateVersion.textContent = v;
    if (roomStateOutput) roomStateOutput.textContent = JSON.stringify(state, null, 2);

    // Multi-member room notes
    renderNotesList(state);

    if (noteMetaText) {
      const editor = state.lastUpdatedBy === sync.getUserId() ? 'You' : `User ${String(state.lastUpdatedBy).slice(0, 6)}`;
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
        addLog('🔄 Successfully reconnected! Authoritative room state and notes recovered from server.');
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

  // State Recovery Banner
  function showRecoveryBanner(version) {
    if (recoveryBanner) {
      if (recoveryVersionText) recoveryVersionText.textContent = `v${version}`;
      recoveryBanner.style.display = 'flex';
      addLog(`♻️ State recovery complete: Room state restored to v${version}.`);

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

  // State Changes Subscription
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

    // Clean up cursors for disconnected members
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

  // Error listener
  sync.onError((err) => {
    addLog(`❌ SyncKit Error: ${err.message}`);
  });

  // ==========================================
  // 9. Room Joining & Switching (No Stale Leaks)
  // ==========================================
  function handleJoinRoom(roomId) {
    const targetRoom = sanitizeRoomId(roomId);
    if (!targetRoom) {
      addLog('⚠️ Please enter a room name.');
      return;
    }

    // Immediately reset notes, discussions, whiteboard and cursors to prevent stale leak from previous room
    activeEditingNoteId = null;
    clearTimeout(editDebounceTimer);
    closeNewNoteForm();
    clearAllCursors();
    clearLocalCanvas();

    if (notesRoomBadge) notesRoomBadge.textContent = targetRoom;
    if (discussionRoomBadge) discussionRoomBadge.textContent = targetRoom;
    if (activeRoomName) activeRoomName.textContent = targetRoom;
    if (navRoomName) navRoomName.textContent = targetRoom;
    if (roomInput) roomInput.value = targetRoom;
    updateBrowserUrl(targetRoom);

    // Visual loading state for notes
    if (notesCardsList) {
      notesCardsList.innerHTML = `
        <div class="notes-empty-card">
          <span class="empty-icon">⏳</span>
          <h4 class="empty-title">Loading Room Notes...</h4>
          <p class="empty-desc">Fetching synchronized notes for <strong>"${targetRoom}"</strong>.</p>
        </div>
      `;
    }
    setSyncStatus('saving', '◌ Loading notes...');

    if (!sync.isConnected()) {
      addLog(`⏳ Connecting to server to join "${targetRoom}"...`);
      sync.connect();
    }

    sync.joinRoom(targetRoom, (res) => {
      if (res && res.success) {
        if (roomDetails) roomDetails.style.display = 'block';
        if (roomStatusBadge) {
          roomStatusBadge.textContent = `Joined ${targetRoom}`;
        }
        if (activeRoomMembers) activeRoomMembers.textContent = res.presence?.length || 1;
        if (res.state) renderState(res.state);

        // Load discussions and whiteboard from SQLite database for target room
        if (discussionRoomBadge) discussionRoomBadge.textContent = targetRoom;
        renderDiscussionsList(sync.getDiscussions());
        redrawAllWhiteboardStrokes(sync.getWhiteboardStrokes());

        addLog(`✅ Joined room "${targetRoom}". Authoritative state, notes & discussions synchronized.`);
      } else if (res && res.error) {
        addLog(`❌ Failed to join room "${targetRoom}": ${res.error}`);
        setSyncStatus('offline', '❌ Error');
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

  // Quick Room Chips
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

  // Counter Actions
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

  // Quick Step Counters (+5, -5, ↺ 0)
  const stepUpBtn = document.getElementById('step-up-btn');
  const stepDownBtn = document.getElementById('step-down-btn');
  const resetCounterBtn = document.getElementById('reset-counter-btn');

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
  // Live Room Reactions & Pop-Up Floating Animation (~1s)
  // ==========================================
  const floatingReactionsStage = document.getElementById('floating-reactions-stage');

  function triggerReactionAnimation(emoji, senderName = 'You', sourceElement = null) {
    if (!floatingReactionsStage) return;

    const bubble = document.createElement('div');
    bubble.className = 'floating-reaction-bubble';

    // Slight random horizontal offset & rotation so multiple rapid reactions don't overlap
    const xOffset = Math.floor(Math.random() * 80) - 40; // -40px to +40px
    const rotation = Math.floor(Math.random() * 24) - 12; // -12deg to +12deg

    let startLeft = '50%';
    let startTop = '35%';

    if (sourceElement) {
      const stageRect = floatingReactionsStage.getBoundingClientRect();
      const btnRect = sourceElement.getBoundingClientRect();
      if (stageRect.width > 0) {
        const relLeft = btnRect.left - stageRect.left + (btnRect.width / 2);
        startLeft = `${Math.max(30, Math.min(stageRect.width - 30, relLeft))}px`;
      }
    }

    bubble.style.left = startLeft;
    bubble.style.top = startTop;
    bubble.style.setProperty('--x-offset', `${xOffset}px`);
    bubble.style.setProperty('--rot', `${rotation}deg`);

    bubble.innerHTML = `
      <span class="floating-reaction-emoji">${emoji}</span>
      <span class="floating-reaction-badge">${escapeHtml(senderName)}</span>
    `;

    floatingReactionsStage.appendChild(bubble);

    // Remove element after ~1 second (1000ms) to avoid DOM clutter
    setTimeout(() => {
      if (bubble.parentNode) {
        bubble.parentNode.removeChild(bubble);
      }
    }, 1000);
  }

  // Clickable reaction buttons near shared counters
  const reactionTriggerBtns = document.querySelectorAll('.reaction-trigger-btn');
  reactionTriggerBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const emoji = btn.getAttribute('data-emoji') || '❤️';
      const name = btn.getAttribute('data-name') || 'Reaction';

      // 1. Show immediate local floating pop-up animation
      triggerReactionAnimation(emoji, 'You', btn);

      // 2. Broadcast ephemeral reaction to other members in the room
      sync.sendReaction(emoji);
      addLog(`${emoji} You reacted with ${name}!`);
    });
  });

  // Subscribe to real-time reactions from other room members
  sync.onReaction(({ emoji, displayName }) => {
    const who = displayName || 'Member';
    triggerReactionAnimation(emoji, who);
    addLog(`${emoji} ${who} reacted with ${emoji}!`);
  });

  // Interactive Reaction Cards (legacy support)
  reactionCards.forEach((card) => {
    card.addEventListener('click', () => {
      const emoji = card.getAttribute('data-emoji') || '✨';
      triggerReactionAnimation(emoji, 'You');
      sync.sendReaction(emoji);
      addLog(`${emoji} Reaction stamped by you in ${sync.getRoom() || 'room'}!`);
      card.style.transform = 'scale(0.95)';
      setTimeout(() => { card.style.transform = ''; }, 150);
    });
  });

  // ==========================================
  // Navigation Tabs: Notes vs Discussions
  // ==========================================
  if (tabBtnNotes && tabBtnDiscussions) {
    tabBtnNotes.addEventListener('click', () => {
      tabBtnNotes.classList.add('active');
      tabBtnDiscussions.classList.remove('active');
      if (notesTabContent) notesTabContent.style.display = 'block';
      if (discussionsTabContent) discussionsTabContent.style.display = 'none';
    });

    tabBtnDiscussions.addEventListener('click', () => {
      tabBtnDiscussions.classList.add('active');
      tabBtnNotes.classList.remove('active');
      if (notesTabContent) notesTabContent.style.display = 'none';
      if (discussionsTabContent) discussionsTabContent.style.display = 'flex';
      scrollDiscussionsToBottom();
    });
  }

  // ==========================================
  // Stored Room Discussions (SQLite Database)
  // ==========================================
  function renderDiscussionsList(discussions) {
    if (!discussionsFeedList) return;
    const list = Array.isArray(discussions) ? discussions : [];

    if (discussionsCountBadge) {
      discussionsCountBadge.textContent = list.length;
    }

    if (list.length === 0) {
      discussionsFeedList.innerHTML = `
        <div id="discussions-empty-state" class="discussions-empty-card">
          <span class="empty-icon">💬</span>
          <h4 class="empty-title">No Discussions in This Room Yet</h4>
          <p class="empty-desc">Share discussion points, ideas, or feedback. All room discussions are permanently stored in the SQLite database.</p>
        </div>
      `;
      return;
    }

    discussionsFeedList.innerHTML = '';
    list.forEach((item) => {
      const isMe = item.sessionId === sync.getSessionId();
      const color = item.authorColor || SyncKit.getUserColor(item.sessionId);

      const msgCard = document.createElement('div');
      msgCard.className = `discussion-msg-card ${isMe ? 'is-me' : ''}`;
      msgCard.innerHTML = `
        <div class="msg-header">
          <span class="msg-author-dot" style="background-color: ${color};"></span>
          <span class="msg-author-name">${escapeHtml(item.authorName || 'Anonymous')}</span>
          ${isMe ? '<span class="note-you-pill">You</span>' : ''}
          <span class="msg-time">${formatRelativeTime(item.createdAt)}</span>
        </div>
        <div class="msg-content">${escapeHtml(item.message)}</div>
      `;
      discussionsFeedList.appendChild(msgCard);
    });

    scrollDiscussionsToBottom();
  }

  function scrollDiscussionsToBottom() {
    if (discussionsFeedList) {
      setTimeout(() => {
        discussionsFeedList.scrollTop = discussionsFeedList.scrollHeight;
      }, 50);
    }
  }

  function handleSendDiscussion() {
    if (!discussionInput) return;
    const msg = discussionInput.value.trim();
    if (!msg) return;

    discussionInput.value = '';
    sync.sendDiscussion(msg, (res) => {
      if (res && res.success) {
        addLog(`💬 Saved discussion to SQLite database.`);
      } else {
        alert(res?.error || 'Failed to save discussion message.');
      }
    });
  }

  if (sendDiscussionBtn) {
    sendDiscussionBtn.addEventListener('click', handleSendDiscussion);
  }
  if (discussionInput) {
    discussionInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleSendDiscussion();
    });
  }

  // Subscribe to real-time incoming discussions (stored in SQLite)
  sync.onDiscussion((newMsg) => {
    renderDiscussionsList(sync.getDiscussions());
    addLog(`💬 New discussion from ${newMsg.authorName || 'member'} (saved to DB).`);
  });

  // ==========================================
  // Interactive Collaborative Whiteboard (Pen & Eraser)
  // ==========================================
  let wbCtx = null;
  let isDrawing = false;
  let lastWbX = 0;
  let lastWbY = 0;
  let currentTool = 'pen'; // 'pen' | 'eraser'
  let currentColor = '#ef4444';
  let currentSize = 4;

  function initWhiteboard() {
    if (!whiteboardCanvas || !canvasViewport) return;

    function resizeCanvas() {
      const rect = canvasViewport.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const dpr = window.devicePixelRatio || 1;
      whiteboardCanvas.width = Math.floor(rect.width * dpr);
      whiteboardCanvas.height = Math.floor(rect.height * dpr);
      whiteboardCanvas.style.width = `${rect.width}px`;
      whiteboardCanvas.style.height = `${rect.height}px`;

      wbCtx = whiteboardCanvas.getContext('2d');
      wbCtx.scale(dpr, dpr);
      wbCtx.lineCap = 'round';
      wbCtx.lineJoin = 'round';

      redrawAllWhiteboardStrokes(sync.getWhiteboardStrokes());
    }

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
  }

  function clearLocalCanvas() {
    if (!whiteboardCanvas || !wbCtx) return;
    wbCtx.save();
    wbCtx.setTransform(1, 0, 0, 1, 0, 0);
    wbCtx.clearRect(0, 0, whiteboardCanvas.width, whiteboardCanvas.height);
    wbCtx.restore();
  }

  function drawWhiteboardLine(x0, y0, x1, y1, color, size, tool) {
    if (!wbCtx || !whiteboardCanvas) return;
    wbCtx.save();
    if (tool === 'eraser') {
      wbCtx.globalCompositeOperation = 'destination-out';
      wbCtx.lineWidth = (size || 4) * 3.5; // Eraser radius is wider
    } else {
      wbCtx.globalCompositeOperation = 'source-over';
      wbCtx.strokeStyle = color || '#ef4444';
      wbCtx.lineWidth = size || 4;
    }
    wbCtx.beginPath();
    wbCtx.moveTo(x0, y0);
    wbCtx.lineTo(x1, y1);
    wbCtx.stroke();
    wbCtx.restore();
  }

  function redrawAllWhiteboardStrokes(strokes) {
    clearLocalCanvas();
    if (!Array.isArray(strokes) || strokes.length === 0 || !canvasViewport) return;
    const rect = canvasViewport.getBoundingClientRect();
    const w = rect.width || 400;
    const h = rect.height || 350;

    strokes.forEach((s) => {
      const x0 = typeof s.pctX0 === 'number' ? s.pctX0 * w : s.x0;
      const y0 = typeof s.pctY0 === 'number' ? s.pctY0 * h : s.y0;
      const x1 = typeof s.pctX1 === 'number' ? s.pctX1 * w : s.x1;
      const y1 = typeof s.pctY1 === 'number' ? s.pctY1 * h : s.y1;
      drawWhiteboardLine(x0, y0, x1, y1, s.color, s.size, s.tool);
    });
  }

  function getCanvasRelativeCoords(e) {
    if (!whiteboardCanvas) return { x: 0, y: 0, width: 1, height: 1 };
    const rect = whiteboardCanvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: Math.round(clientX - rect.left),
      y: Math.round(clientY - rect.top),
      width: rect.width,
      height: rect.height,
    };
  }

  if (whiteboardCanvas) {
    const handleStartDraw = (e) => {
      e.preventDefault();
      isDrawing = true;
      const coords = getCanvasRelativeCoords(e);
      lastWbX = coords.x;
      lastWbY = coords.y;

      // Draw single point
      drawWhiteboardLine(lastWbX, lastWbY, lastWbX + 0.5, lastWbY + 0.5, currentColor, currentSize, currentTool);
      const stroke = {
        x0: lastWbX,
        y0: lastWbY,
        x1: lastWbX + 0.5,
        y1: lastWbY + 0.5,
        pctX0: coords.width > 0 ? lastWbX / coords.width : 0,
        pctY0: coords.height > 0 ? lastWbY / coords.height : 0,
        pctX1: coords.width > 0 ? (lastWbX + 0.5) / coords.width : 0,
        pctY1: coords.height > 0 ? (lastWbY + 0.5) / coords.height : 0,
        color: currentColor,
        size: currentSize,
        tool: currentTool,
      };
      sync.sendDrawStroke(stroke);
    };

    const handleMoveDraw = (e) => {
      if (!isDrawing) return;
      e.preventDefault();
      const coords = getCanvasRelativeCoords(e);
      const currX = coords.x;
      const currY = coords.y;

      drawWhiteboardLine(lastWbX, lastWbY, currX, currY, currentColor, currentSize, currentTool);
      const stroke = {
        x0: lastWbX,
        y0: lastWbY,
        x1: currX,
        y1: currY,
        pctX0: coords.width > 0 ? lastWbX / coords.width : 0,
        pctY0: coords.height > 0 ? lastWbY / coords.height : 0,
        pctX1: coords.width > 0 ? currX / coords.width : 0,
        pctY1: coords.height > 0 ? currY / coords.height : 0,
        color: currentColor,
        size: currentSize,
        tool: currentTool,
      };
      sync.sendDrawStroke(stroke);
      lastWbX = currX;
      lastWbY = currY;
    };

    const handleEndDraw = () => {
      isDrawing = false;
    };

    whiteboardCanvas.addEventListener('mousedown', handleStartDraw);
    whiteboardCanvas.addEventListener('mousemove', handleMoveDraw);
    window.addEventListener('mouseup', handleEndDraw);

    whiteboardCanvas.addEventListener('touchstart', handleStartDraw, { passive: false });
    whiteboardCanvas.addEventListener('touchmove', handleMoveDraw, { passive: false });
    window.addEventListener('touchend', handleEndDraw);
  }

  // Whiteboard Tools: Pen & Eraser
  if (wbToolPen) {
    wbToolPen.addEventListener('click', () => {
      currentTool = 'pen';
      wbToolPen.classList.add('active');
      if (wbToolEraser) wbToolEraser.classList.remove('active');
    });
  }

  if (wbToolEraser) {
    wbToolEraser.addEventListener('click', () => {
      currentTool = 'eraser';
      wbToolEraser.classList.add('active');
      if (wbToolPen) wbToolPen.classList.remove('active');
    });
  }

  // Whiteboard Color Palette
  wbColorDots.forEach((dot) => {
    dot.addEventListener('click', () => {
      const color = dot.getAttribute('data-color');
      if (color) {
        currentColor = color;
        currentTool = 'pen';
        if (wbToolPen) wbToolPen.classList.add('active');
        if (wbToolEraser) wbToolEraser.classList.remove('active');
        wbColorDots.forEach((d) => d.classList.remove('active'));
        dot.classList.add('active');
      }
    });
  });

  // Whiteboard Stroke Sizes
  wbSizeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const size = Number(btn.getAttribute('data-size'));
      if (size) {
        currentSize = size;
        wbSizeBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      }
    });
  });

  // Clear Whiteboard Button
  if (wbClearBtn) {
    wbClearBtn.addEventListener('click', () => {
      if (confirm('Clear collaborative whiteboard canvas for all room members?')) {
        clearLocalCanvas();
        sync.clearWhiteboard(() => {
          addLog('🗑️ Cleared collaborative whiteboard.');
        });
      }
    });
  }

  // Listen to remote drawing strokes
  sync.onDrawStroke((stroke) => {
    if (!canvasViewport) return;
    const rect = canvasViewport.getBoundingClientRect();
    const w = rect.width || 400;
    const h = rect.height || 350;
    const x0 = typeof stroke.pctX0 === 'number' ? stroke.pctX0 * w : stroke.x0;
    const y0 = typeof stroke.pctY0 === 'number' ? stroke.pctY0 * h : stroke.y0;
    const x1 = typeof stroke.pctX1 === 'number' ? stroke.pctX1 * w : stroke.x1;
    const y1 = typeof stroke.pctY1 === 'number' ? stroke.pctY1 * h : stroke.y1;
    drawWhiteboardLine(x0, y0, x1, y1, stroke.color, stroke.size, stroke.tool);
  });

  // Listen to remote whiteboard clear
  sync.onWhiteboardClear(() => {
    clearLocalCanvas();
    addLog('🧹 Whiteboard canvas cleared by room member.');
  });

  initWhiteboard();

  // ==========================================
  // 10. Shareable Invite Modal & Link
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

  if (inviteBtn) {
    inviteBtn.addEventListener('click', openInviteModal);
  }

  if (closeInviteBtn) {
    closeInviteBtn.addEventListener('click', closeInviteModal);
  }

  if (inviteModal) {
    inviteModal.addEventListener('click', (e) => {
      if (e.target === inviteModal) closeInviteModal();
    });
  }

  // Copy Invite Link with graceful fallback
  if (copyInviteBtn) {
    copyInviteBtn.addEventListener('click', async () => {
      const currentRoom = sync.getRoom() || roomInput.value.trim() || 'room-1';
      const linkToCopy = getFullInviteUrl(currentRoom);

      let copySuccess = false;

      // 1. Modern Clipboard API
      if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
          await navigator.clipboard.writeText(linkToCopy);
          copySuccess = true;
        } catch (err) {
          console.warn('[SyncKit] navigator.clipboard error, trying fallback:', err);
        }
      }

      // 2. Fallback to select & execCommand
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

  // Auto-join initial room specified in URL or default
  handleJoinRoom(initialRoom);
});
