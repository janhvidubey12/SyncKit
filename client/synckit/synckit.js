/**
 * SyncKit - Reusable Client Library
 * A lightweight, beginner-friendly library to make webpages multiplayer.
 * Encapsulates all Socket.IO networking, state-synchronization, presence,
 * collaborative whiteboard, and multi-member notes internally.
 */

class SyncKit {
  /**
   * @param {Object} [options]
   * @param {string} [options.serverUrl] Optional server URL (defaults to window.location.origin)
   * @param {string} [options.displayName] Optional custom user display name
   * @param {string} [options.sessionId] Optional session identifier
   * @param {string} [options.authorKey] Optional stable author token
   * @param {boolean} [options.autoConnect=true] Automatically initiate connection on creation
   */
  constructor(options = {}) {
    // 1. Configuration
    this.serverUrl =
      options.serverUrl ||
      (typeof window !== 'undefined' && window.location ? window.location.origin : 'http://localhost:3000');
    this.autoConnect = options.autoConnect !== false;

    // 2. Session Identity & Display Name
    this.sessionId = options.sessionId || this._getOrCreateSessionId();
    this.displayName = options.displayName || `User-${this.sessionId.slice(-4)}`;
    this.authorKey = options.authorKey || this._getOrCreateAuthorKey();

    // 3. Internal networking & connection state
    this.socket = null;
    this.status = 'disconnected'; // 'connected' | 'disconnected' | 'reconnecting' | 'reconnected'
    this.hasConnectedOnce = false;
    this.isReconnecting = false;
    this.isLocalEditing = false; // Prevents background sync from overwriting active user typing

    // 4. Room, State, Whiteboard & Presence Store
    this.currentRoom = null;
    this.state = {};
    this.presenceList = [];
    this.whiteboard = [];
    this.whiteboardVersion = 1;

    // 5. Cursor Tracking & Throttling
    this.cursorThrottleMs = options.cursorThrottleMs || 30; // ~33fps limit
    this._lastCursorTime = 0;
    this._cursorThrottleTimer = null;
    this._pendingCursor = null;
    this._pendingJoinCallback = null;

    // 6. Background 7-second Sync Interval (Feature 1)
    this._syncInterval = null;

    // 7. Public Event Subscriptions
    this._listeners = {
      statusChange: [],
      stateChange: [],
      presenceChange: [],
      cursorMove: [],
      error: [],
      userJoined: [],
      userLeft: [],
      reaction: [],
      whiteboardStroke: [],
      whiteboardCleared: [],
      whiteboardUpdated: [],
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this._stopSyncInterval();
      });
    }

    if (this.autoConnect) {
      this.connect();
    }
  }

  // ==========================================
  // Public API: Connection Management
  // ==========================================

  /**
   * Connect to the SyncKit real-time server
   */
  connect() {
    const ioFn =
      typeof io !== 'undefined'
        ? io
        : typeof require !== 'undefined'
        ? require('socket.io-client').io || require('socket.io-client')
        : null;

    if (!ioFn) {
      console.error(
        '[SyncKit] Socket.IO client library not found! Please load <script src="/socket.io/socket.io.js"></script>'
      );
      return this;
    }

    if (this.socket) {
      if (!this.socket.connected) {
        this._setStatus('reconnecting');
        this.socket.connect();
      }
      return this;
    }

    if (this.hasConnectedOnce) {
      this._setStatus('reconnecting');
    }

    this.socket = ioFn(this.serverUrl, {
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 3000,
      timeout: 20000,
    });

    this._setupSocketListeners();
    return this;
  }

  /**
   * Disconnect from the server manually
   */
  disconnect() {
    this._stopSyncInterval();

    if (this._cursorThrottleTimer) {
      clearTimeout(this._cursorThrottleTimer);
      this._cursorThrottleTimer = null;
    }
    this._pendingCursor = null;

    if (this.socket) {
      this.socket.disconnect();
    }
    this._setStatus('disconnected');
    return this;
  }

  // ==========================================
  // Public API: Rooms & State
  // ==========================================

  /**
   * Join a named room and receive its authoritative state & presence
   * @param {string} roomId Name of the room to join
   * @param {Function} [callback] Optional callback receiving server acknowledgment
   */
  joinRoom(roomId, callback) {
    if (!roomId || typeof roomId !== 'string') {
      const err = 'Room name must be a non-empty string.';
      this._emitError('INVALID_ROOM', err);
      if (typeof callback === 'function') callback({ success: false, error: err });
      return this;
    }

    this._stopSyncInterval();
    this.currentRoom = roomId.trim();

    if (!this.isConnected()) {
      this._pendingJoinCallback = callback;
      if (!this.socket || !this.socket.connected) {
        this.connect();
      }
      return this;
    }

    this.socket.emit(
      'join-room',
      {
        roomId: this.currentRoom,
        sessionId: this.sessionId,
        displayName: this.displayName,
        authorKey: this.authorKey,
      },
      (response) => {
        if (response && response.success) {
          this.state = response.state || {};
          this.whiteboard = response.whiteboard || [];
          this.whiteboardVersion = response.whiteboardVersion || 1;
          this.presenceList = Array.isArray(response.presence)
            ? response.presence
            : Object.values(response.presence || {});

          this._emitStateChange(this.state, {
            version: this.state.version,
            recovered: Boolean(this.isReconnecting),
            wasReset: Boolean(response.isNewRoom && this.isReconnecting),
            roomId: this.currentRoom,
          });
          this._emitPresenceChange(this.presenceList);
          this._startSyncInterval();
        } else if (response && !response.success) {
          this._emitError('JOIN_FAILED', response.error || 'Failed to join room');
        }
        if (typeof callback === 'function') callback(response);
      }
    );

    return this;
  }

  /**
   * Get the current room name
   */
  getRoom() {
    return this.currentRoom;
  }

  /**
   * Read the local authoritative state snapshot
   */
  getState(callback) {
    if (typeof callback === 'function') {
      if (this.isConnected() && this.currentRoom) {
        this.socket.emit('get-state', { roomId: this.currentRoom }, (res) => {
          if (res && res.success) {
            this.state = res.state;
          }
          callback(res);
        });
      } else {
        callback({ success: false, error: 'Not connected to room', state: { ...this.state } });
      }
      return this;
    }
    return { ...this.state };
  }

  /**
   * Request a state update
   * @param {Object} updates Key-value updates to merge into server authoritative state
   * @param {Function} [callback] Optional callback with server acknowledgment
   */
  updateState(updates, callback) {
    if (!this.isConnected()) {
      const err = 'Cannot update state: Client is currently disconnected.';
      this._emitError('NOT_CONNECTED', err);
      if (typeof callback === 'function') callback({ success: false, error: err });
      return this;
    }

    if (!this.currentRoom) {
      const err = 'Cannot update state: You have not joined a room yet.';
      this._emitError('NOT_IN_ROOM', err);
      if (typeof callback === 'function') callback({ success: false, error: err });
      return this;
    }

    if (!updates || typeof updates !== 'object') {
      const err = 'State update must be an object.';
      this._emitError('INVALID_STATE_UPDATE', err);
      if (typeof callback === 'function') callback({ success: false, error: err });
      return this;
    }

    this.socket.emit(
      'update-state',
      {
        roomId: this.currentRoom,
        updates,
        authorKey: this.authorKey,
      },
      (response) => {
        if (response && response.success) {
          this.state = response.state;
        } else if (response && !response.success) {
          this._emitError('UPDATE_FAILED', response.error);
        }
        if (typeof callback === 'function') callback(response);
      }
    );

    return this;
  }

  setState(updates, callback) {
    return this.updateState(updates, callback);
  }

  // ==========================================
  // Public API: Multi-Member Shared Notes & Permissions
  // ==========================================

  getNotesList() {
    return Array.isArray(this.state.notesList) ? [...this.state.notesList] : [];
  }

  getNotes() {
    if (Array.isArray(this.state.notesList) && this.state.notesList.length > 0) {
      return this.state.notesList.map((n) => n.content).join('\n\n');
    }
    return this.state.notes || this.state.text || '';
  }

  /**
   * Create a new note in the room
   * @param {Object|string} noteData Note content or object with title, content, permission
   * @param {Function} [callback]
   */
  createNote(noteData = {}, callback) {
    const title = typeof noteData === 'string' ? '' : String(noteData.title || '').slice(0, 200);
    const content = typeof noteData === 'string' ? noteData : String(noteData.content || '').slice(0, 50000);
    const permission = noteData.permission === 'private' ? 'private' : 'public';

    const newNote = {
      id: noteData.id || `note_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      roomId: this.currentRoom,
      title,
      content,
      authorId: this.sessionId,
      authorName: this.displayName || 'Member',
      authorColor: this.getUserColor(),
      permission,
      authorKey: this.authorKey,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: this.displayName || 'Member',
    };

    if (this.socket && this.socket.connected && this.currentRoom) {
      this.socket.emit(
        'note-create',
        {
          roomId: this.currentRoom,
          note: newNote,
          authorKey: this.authorKey,
        },
        (res) => {
          if (typeof callback === 'function') callback(res);
        }
      );
      return this;
    }

    // Fallback via updateState
    const currentList = Array.isArray(this.state.notesList) ? [...this.state.notesList] : [];
    currentList.push(newNote);
    const serializedNotes = currentList.map((n) => n.content).join('\n\n');
    return this.updateState({
      notesList: currentList,
      notes: serializedNotes,
      text: serializedNotes,
    }, callback);
  }

  /**
   * Edit note title, content, or permission
   * @param {string} noteId
   * @param {Object|string} updates
   * @param {Function} [callback]
   */
  editNote(noteId, updates, callback) {
    const formattedUpdates =
      typeof updates === 'string' ? { content: updates } : (typeof updates === 'object' && updates !== null ? updates : {});

    if (this.socket && this.socket.connected && this.currentRoom) {
      this.socket.emit(
        'note-update',
        {
          roomId: this.currentRoom,
          noteId,
          updates: formattedUpdates,
          authorKey: this.authorKey,
        },
        (res) => {
          if (typeof callback === 'function') callback(res);
        }
      );
      return this;
    }

    // Fallback
    const currentList = Array.isArray(this.state.notesList) ? [...this.state.notesList] : [];
    const noteIndex = currentList.findIndex((n) => n.id === noteId);
    if (noteIndex === -1) {
      if (typeof callback === 'function') callback({ success: false, error: 'Note not found' });
      return this;
    }
    const existing = currentList[noteIndex];
    const newContent = formattedUpdates.content !== undefined ? formattedUpdates.content : existing.content;
    const newTitle = formattedUpdates.title !== undefined ? formattedUpdates.title : existing.title;
    const newPerm = formattedUpdates.permission !== undefined ? formattedUpdates.permission : existing.permission;

    currentList[noteIndex] = {
      ...existing,
      title: newTitle,
      content: newContent,
      permission: newPerm,
      updatedAt: new Date().toISOString(),
      updatedBy: this.displayName || 'Member',
    };
    const serializedNotes = currentList.map((n) => n.content).join('\n\n');
    return this.updateState({
      notesList: currentList,
      notes: serializedNotes,
      text: serializedNotes,
    }, callback);
  }

  /**
   * Delete a note from the room
   * @param {string} noteId
   * @param {Function} [callback]
   */
  deleteNote(noteId, callback) {
    if (this.socket && this.socket.connected && this.currentRoom) {
      this.socket.emit(
        'note-delete',
        {
          roomId: this.currentRoom,
          noteId,
          authorKey: this.authorKey,
        },
        (res) => {
          if (typeof callback === 'function') callback(res);
        }
      );
      return this;
    }

    const currentList = Array.isArray(this.state.notesList) ? [...this.state.notesList] : [];
    const updatedList = currentList.filter((n) => n.id !== noteId);
    const serializedNotes = updatedList.map((n) => n.content).join('\n\n');
    return this.updateState({
      notesList: updatedList,
      notes: serializedNotes,
      text: serializedNotes,
    }, callback);
  }

  setNotePermission(noteId, permission, callback) {
    return this.editNote(noteId, { permission: permission === 'private' ? 'private' : 'public' }, callback);
  }

  updateNotes(content, callback) {
    return this.createNote({ title: 'Shared Note', content }, callback);
  }

  // ==========================================
  // Public API: Collaborative Whiteboard (Feature 3)
  // ==========================================

  sendWhiteboardStroke(stroke, callback) {
    if (!this.isConnected() || !this.currentRoom || !stroke) return this;
    this.socket.emit(
      'whiteboard-draw',
      {
        roomId: this.currentRoom,
        stroke,
      },
      callback
    );
    return this;
  }

  clearWhiteboard(callback) {
    if (!this.isConnected() || !this.currentRoom) return this;
    this.whiteboard = [];
    this.socket.emit(
      'whiteboard-clear',
      {
        roomId: this.currentRoom,
      },
      callback
    );
    return this;
  }

  undoWhiteboard(callback) {
    if (!this.isConnected() || !this.currentRoom) return this;
    this.socket.emit(
      'whiteboard-undo',
      {
        roomId: this.currentRoom,
      },
      callback
    );
    return this;
  }

  getWhiteboard(callback) {
    if (!this.isConnected() || !this.currentRoom) {
      if (typeof callback === 'function') callback({ strokes: this.whiteboard || [], version: this.whiteboardVersion || 1 });
      return this;
    }
    this.socket.emit('get-whiteboard', { roomId: this.currentRoom }, callback);
    return this;
  }

  // ==========================================
  // Public API: Presence & Identity
  // ==========================================

  setDisplayName(name) {
    if (!name || typeof name !== 'string') return this;
    this.displayName = name.trim().slice(0, 30);

    if (this.isConnected() && this.currentRoom) {
      this.socket.emit('presence-update', {
        roomId: this.currentRoom,
        displayName: this.displayName,
      });
    }
    return this;
  }

  getSessionId() {
    return this.sessionId;
  }

  getAuthorKey() {
    return this.authorKey;
  }

  getDisplayName() {
    return this.displayName;
  }

  getPresence() {
    return [...this.presenceList];
  }

  static getUserColor(identifier) {
    const PALETTE = [
      '#ef4444', // red
      '#38bdf8', // sky blue
      '#f43f5e', // rose
      '#10b981', // emerald green
      '#fbbf24', // amber yellow
      '#a855f7', // purple
      '#ec4899', // pink
      '#06b6d4', // cyan
      '#f97316', // orange
    ];
    if (!identifier) return PALETTE[0];
    let hash = 0;
    for (let i = 0; i < identifier.length; i++) {
      hash = (hash << 5) - hash + identifier.charCodeAt(i);
      hash |= 0;
    }
    const index = Math.abs(hash) % PALETTE.length;
    return PALETTE[index];
  }

  getUserColor(identifier) {
    return SyncKit.getUserColor(identifier || this.sessionId);
  }

  // ==========================================
  // Public API: Cursor & Reactions
  // ==========================================

  sendCursor(coords) {
    if (!this.isConnected() || !this.currentRoom || !coords) return this;

    const now = Date.now();
    if (now - this._lastCursorTime < this.cursorThrottleMs) {
      this._pendingCursor = coords;
      if (!this._cursorThrottleTimer) {
        const delay = this.cursorThrottleMs - (now - this._lastCursorTime);
        this._cursorThrottleTimer = setTimeout(() => {
          this._cursorThrottleTimer = null;
          if (this._pendingCursor) {
            const next = this._pendingCursor;
            this._pendingCursor = null;
            this.sendCursor(next);
          }
        }, delay);
      }
      return this;
    }

    this._lastCursorTime = now;
    this.socket.emit('cursor-move', {
      roomId: this.currentRoom,
      sessionId: this.sessionId,
      displayName: this.displayName,
      x: coords.x,
      y: coords.y,
      data: coords.data,
    });
    return this;
  }

  sendReaction(emoji) {
    if (!this.isConnected() || !this.currentRoom || !emoji) return this;
    this.socket.emit('send-reaction', {
      roomId: this.currentRoom,
      sessionId: this.sessionId,
      displayName: this.displayName,
      emoji: String(emoji).slice(0, 10),
    });
    return this;
  }

  // ==========================================
  // Public API: Event Subscriptions
  // ==========================================

  onStatusChange(callback) {
    if (typeof callback !== 'function') return () => {};
    if (!this._listeners.statusChange.includes(callback)) {
      this._listeners.statusChange.push(callback);
    }
    callback(this.status, { socketId: this.getUserId() });
    return () => {
      this._listeners.statusChange = this._listeners.statusChange.filter((cb) => cb !== callback);
    };
  }

  onStateChange(callback) {
    if (typeof callback !== 'function') return () => {};
    if (!this._listeners.stateChange.includes(callback)) {
      this._listeners.stateChange.push(callback);
    }
    return () => {
      this._listeners.stateChange = this._listeners.stateChange.filter((cb) => cb !== callback);
    };
  }

  onPresenceChange(callback) {
    if (typeof callback !== 'function') return () => {};
    if (!this._listeners.presenceChange.includes(callback)) {
      this._listeners.presenceChange.push(callback);
    }
    return () => {
      this._listeners.presenceChange = this._listeners.presenceChange.filter((cb) => cb !== callback);
    };
  }

  onCursorMove(callback) {
    if (typeof callback !== 'function') return () => {};
    if (!this._listeners.cursorMove.includes(callback)) {
      this._listeners.cursorMove.push(callback);
    }
    return () => {
      this._listeners.cursorMove = this._listeners.cursorMove.filter((cb) => cb !== callback);
    };
  }

  onReaction(callback) {
    if (typeof callback !== 'function') return () => {};
    if (!this._listeners.reaction.includes(callback)) {
      this._listeners.reaction.push(callback);
    }
    return () => {
      this._listeners.reaction = this._listeners.reaction.filter((cb) => cb !== callback);
    };
  }

  onWhiteboardStroke(callback) {
    if (typeof callback !== 'function') return () => {};
    if (!this._listeners.whiteboardStroke.includes(callback)) {
      this._listeners.whiteboardStroke.push(callback);
    }
    return () => {
      this._listeners.whiteboardStroke = this._listeners.whiteboardStroke.filter((cb) => cb !== callback);
    };
  }

  onWhiteboardCleared(callback) {
    if (typeof callback !== 'function') return () => {};
    if (!this._listeners.whiteboardCleared.includes(callback)) {
      this._listeners.whiteboardCleared.push(callback);
    }
    return () => {
      this._listeners.whiteboardCleared = this._listeners.whiteboardCleared.filter((cb) => cb !== callback);
    };
  }

  onWhiteboardUpdated(callback) {
    if (typeof callback !== 'function') return () => {};
    if (!this._listeners.whiteboardUpdated.includes(callback)) {
      this._listeners.whiteboardUpdated.push(callback);
    }
    return () => {
      this._listeners.whiteboardUpdated = this._listeners.whiteboardUpdated.filter((cb) => cb !== callback);
    };
  }

  onError(callback) {
    if (typeof callback !== 'function') return () => {};
    if (!this._listeners.error.includes(callback)) {
      this._listeners.error.push(callback);
    }
    return () => {
      this._listeners.error = this._listeners.error.filter((cb) => cb !== callback);
    };
  }

  isConnected() {
    return Boolean(this.socket && this.socket.connected);
  }

  getUserId() {
    return this.socket ? this.socket.id : null;
  }

  // ==========================================
  // Internal Helpers & Background Sync (Feature 1)
  // ==========================================

  _startSyncInterval() {
    this._stopSyncInterval();
    // 7-second background synchronization check (Feature 1)
    this._syncInterval = setInterval(() => {
      if (this.isConnected() && this.currentRoom && !this.isLocalEditing) {
        this.socket.emit('get-state', { roomId: this.currentRoom }, (res) => {
          if (res && res.success && res.state) {
            const serverVersion = Number(res.state.version) || 0;
            const localVersion = Number(this.state.version) || 0;
            if (serverVersion > localVersion) {
              this.state = res.state;
              this._emitStateChange(this.state, {
                version: serverVersion,
                recovered: true,
                backgroundSync: true,
                roomId: this.currentRoom,
              });
            }
          }
        });
      }
    }, 7000);
  }

  _stopSyncInterval() {
    if (this._syncInterval) {
      clearInterval(this._syncInterval);
      this._syncInterval = null;
    }
  }

  _getOrCreateSessionId() {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      let id = window.sessionStorage.getItem('synckit_session_id');
      if (!id) {
        id = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        window.sessionStorage.setItem('synckit_session_id', id);
      }
      return id;
    }
    return `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  _getOrCreateAuthorKey() {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        let key = window.localStorage.getItem('synckit_author_key');
        if (!key) {
          key = `auth_${Date.now()}_${Math.random().toString(36).substring(2, 11)}_${Math.random().toString(36).substring(2, 11)}`;
          window.localStorage.setItem('synckit_author_key', key);
        }
        return key;
      } catch (e) {
        // Fallback for private browsing
      }
    }
    return `auth_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  _setupSocketListeners() {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      const isReconnection = this.hasConnectedOnce;
      this.hasConnectedOnce = true;
      if (isReconnection) {
        this.isReconnecting = true;
        this._setStatus('reconnected', { socketId: this.socket.id, recovered: true });
      } else {
        this._setStatus('connected', { socketId: this.socket.id });
      }

      if (this.currentRoom) {
        this.socket.emit(
          'join-room',
          {
            roomId: this.currentRoom,
            sessionId: this.sessionId,
            displayName: this.displayName,
            authorKey: this.authorKey,
          },
          (res) => {
            if (this._pendingJoinCallback) {
              const cb = this._pendingJoinCallback;
              this._pendingJoinCallback = null;
              cb(res);
            }
          }
        );
      }
    });

    this.socket.on('disconnect', (reason) => {
      this._stopSyncInterval();
      this._setStatus('disconnected', { reason });
      if (reason === 'io server disconnect' || reason === 'transport close' || reason === 'io client disconnect') {
        this.isReconnecting = true;
        this._setStatus('reconnecting');
      }
    });

    this.socket.io.on('reconnect_attempt', (attempt) => {
      this.isReconnecting = true;
      this._setStatus('reconnecting', { attempt });
    });

    this.socket.io.on('reconnect_failed', () => {
      this._setStatus('disconnected', { failed: true });
      this._emitError('RECONNECT_FAILED', 'Failed to reconnect to server.');
    });

    // Room joined
    this.socket.on('room-joined', (data) => {
      const wasReconnection = this.isReconnecting;
      this.isReconnecting = false;
      this.currentRoom = data.roomId;
      this.state = data.state || {};
      this.whiteboard = data.whiteboard || [];
      this.whiteboardVersion = data.whiteboardVersion || 1;
      this.presenceList = Array.isArray(data.presence) ? data.presence : Object.values(data.presence || {});

      this._emitStateChange(this.state, {
        version: this.state.version,
        recovered: wasReconnection,
        wasReset: Boolean(data.isNewRoom && wasReconnection),
        roomId: this.currentRoom,
      });

      this._emitPresenceChange(this.presenceList);
      this._startSyncInterval();

      this._listeners.whiteboardUpdated.forEach((cb) => cb({ strokes: this.whiteboard || [], version: this.whiteboardVersion }));
    });

    // Presence update
    this.socket.on('presence-update', (data) => {
      if (data.roomId === this.currentRoom) {
        this.presenceList = Array.isArray(data.presence) ? data.presence : Object.values(data.presence || {});
        this._emitPresenceChange(this.presenceList);
      }
    });

    // State update
    this.socket.on('state-updated', (data) => {
      if (data.roomId === this.currentRoom) {
        this.state = data.state || {};
        this._emitStateChange(this.state, {
          version: data.version,
          updatedBy: data.updatedBy,
          recovered: false,
          roomId: data.roomId,
        });
      }
    });

    // Whiteboard events
    this.socket.on('whiteboard-stroke', (data) => {
      if (data.roomId === this.currentRoom) {
        if (!Array.isArray(this.whiteboard)) this.whiteboard = [];
        this.whiteboard.push(data.stroke);
        this.whiteboardVersion = data.version;
        this._listeners.whiteboardStroke.forEach((cb) => cb(data));
      }
    });

    this.socket.on('whiteboard-cleared', (data) => {
      if (data.roomId === this.currentRoom) {
        this.whiteboard = [];
        this.whiteboardVersion = data.version;
        this._listeners.whiteboardCleared.forEach((cb) => cb(data));
      }
    });

    this.socket.on('whiteboard-updated', (data) => {
      if (data.roomId === this.currentRoom) {
        this.whiteboard = data.strokes || [];
        this.whiteboardVersion = data.version;
        this._listeners.whiteboardUpdated.forEach((cb) => cb(data));
      }
    });

    // Cursors
    this.socket.on('cursor-moved', (data) => {
      const color = SyncKit.getUserColor(data.sessionId || data.userId);
      const cursorEvent = {
        ...data,
        color,
      };
      this._listeners.cursorMove.forEach((cb) => cb(cursorEvent));
    });

    // Ephemeral Reactions
    this.socket.on('reaction-received', (data) => {
      this._listeners.reaction.forEach((cb) => cb(data));
    });

    // Server Errors
    this.socket.on('synckit:error', (err) => {
      this._emitError(err.code || 'SERVER_ERROR', err.message);
    });
  }

  _setStatus(status, details = {}) {
    this.status = status;
    this._listeners.statusChange.forEach((cb) => cb(status, details));
  }

  _emitStateChange(state, meta) {
    this._listeners.stateChange.forEach((cb) => cb(state, meta));
  }

  _emitPresenceChange(presenceList) {
    this._listeners.presenceChange.forEach((cb) => cb(presenceList));
  }

  _emitError(code, message) {
    console.error(`[SyncKit Error] [${code}] ${message}`);
    this._listeners.error.forEach((cb) => cb({ code, message }));
  }
}

// Support both browser global and module environments
if (typeof window !== 'undefined') {
  window.SyncKit = SyncKit;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SyncKit;
}
