/**
 * SyncKit - Reusable Client Library
 * A lightweight, beginner-friendly library to make webpages multiplayer.
 * Encapsulates all Socket.IO networking, state-synchronization, and presence internally.
 */

class SyncKit {
  /**
   * @param {Object} [options]
   * @param {string} [options.serverUrl] Optional server URL (defaults to window.location.origin)
   * @param {string} [options.displayName] Optional custom user display name (Requirement 2)
   * @param {string} [options.sessionId] Optional session identifier (Requirement 1)
   * @param {boolean} [options.autoConnect=true] Automatically initiate connection on creation
   */
  constructor(options = {}) {
    // 1. Configuration
    this.serverUrl =
      options.serverUrl ||
      (typeof window !== 'undefined' && window.location ? window.location.origin : 'http://localhost:3000');
    this.autoConnect = options.autoConnect !== false;

    // 2. Session Identity & Display Name (Requirement 1 & 2)
    this.sessionId = options.sessionId || this._getOrCreateSessionId();
    this.displayName = options.displayName || `User-${this.sessionId.slice(-4)}`;

    // 3. Internal networking & connection state
    this.socket = null;
    this.status = 'disconnected'; // 'connected' | 'disconnected' | 'reconnecting' | 'reconnected'
    this.hasConnectedOnce = false;
    this.isReconnecting = false;

    // 4. Room, State & Presence Store (Requirement 3, 6, 9)
    this.currentRoom = null;
    this.state = {};
    this.presenceList = []; // Array of currently online users in the room

    // 5. Cursor Tracking & Throttling (Requirement 6 & 7)
    this.cursorThrottleMs = options.cursorThrottleMs || 30; // ~33fps limit
    this._lastCursorTime = 0;
    this._cursorThrottleTimer = null;
    this._pendingCursor = null;
    this._pendingJoinCallback = null;


    // 6. Public Event Subscriptions
    this._listeners = {
      statusChange: [],
      stateChange: [],
      presenceChange: [],
      cursorMove: [],
      error: [],
      userJoined: [],
      userLeft: [],
      reaction: [],
    };

    if (this.autoConnect) {
      this.connect();
    }
  }

  // ==========================================
  // Public API: Connection Management
  // ==========================================

  /**
   * Connect to the SyncKit real-time server
   * Avoids duplicate listeners by reusing existing socket instance (Requirement 8)
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

    // Reuse existing socket to avoid duplicate listeners (Requirement 8)
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

    // Create Socket.IO socket instance with automatic reconnection options (Requirement 2)
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
   * Join a named room and receive its authoritative state & presence (Requirement 3 & 4)
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
      },
      (res) => {
        if (typeof callback === 'function') callback(res);
      }
    );

    return this;
  }


  /**
   * Get the current room state
   */
  getState(callback) {
    if (!callback) {
      return { ...this.state };
    }

    if (!this.currentRoom || !this.isConnected()) {
      callback({ success: false, error: 'Not currently connected to a room' });
      return this;
    }

    this.socket.emit('get-state', { roomId: this.currentRoom }, (res) => {
      if (res && res.success) {
        this.state = res.state;
      }
      callback(res);
    });

    return this;
  }

  /**
   * Request a state update from the authoritative server
   * @param {Object} updates Key-value updates
   * @param {Function} [callback]
   */
  updateState(updates, callback) {
    if (!this.currentRoom) {
      const err = 'Cannot update state: You must call joinRoom(roomId) first.';
      this._emitError('NOT_IN_ROOM', err);
      if (typeof callback === 'function') callback({ success: false, error: err });
      return this;
    }

    if (!this.isConnected()) {
      const err = 'Cannot update state: Disconnected from server.';
      this._emitError('DISCONNECTED', err);
      if (typeof callback === 'function') callback({ success: false, error: err });
      return this;
    }

    this.socket.emit('update-state', { roomId: this.currentRoom, updates }, (res) => {
      if (res && res.success && res.state) {
        this.state = res.state;
      }
      if (typeof callback === 'function') callback(res);
    });

    return this;
  }

  setState(updates, callback) {
    return this.updateState(updates, callback);
  }

  /**
   * Get the current room notes (single string)
   * @returns {string}
   */
  getNotes() {
    if (this.state.notes || this.state.text) {
      return this.state.notes || this.state.text;
    }
    if (Array.isArray(this.state.notesList) && this.state.notesList.length > 0) {
      return this.state.notesList.map((n) => n.content).join('\n\n');
    }
    return '';
  }

  /**
   * Get the collection of individual member notes in this room
   * @returns {Array<Object>}
   */
  getNotesList() {
    return Array.isArray(this.state.notesList) ? [...this.state.notesList] : [];
  }

  /**
   * Create a new note belonging to this member in the current room
   * @param {{ title?: string, content: string }} noteData
   * @param {Function} [callback]
   */
  createNote(noteData, callback) {
    const title = typeof noteData === 'object' && noteData.title ? String(noteData.title).trim().slice(0, 80) : '';
    const content = typeof noteData === 'object' ? String(noteData.content || '').slice(0, 15000) : String(noteData || '').slice(0, 15000);

    const newNote = {
      id: `note_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      authorId: this.sessionId,
      authorName: this.displayName || 'Member',
      authorColor: this.getUserColor(),
      title: title,
      content: content,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: this.displayName || 'Member',
    };

    const currentList = Array.isArray(this.state.notesList) ? [...this.state.notesList] : [];
    const updatedList = [newNote, ...currentList];
    const serializedNotes = updatedList.map((n) => n.content).join('\n\n');

    return this.updateState({
      notesList: updatedList,
      notes: serializedNotes || content,
      text: serializedNotes || content,
    }, callback);
  }

  /**
   * Edit an existing note in the current room
   * @param {string} noteId
   * @param {string|{ title?: string, content?: string }} updates
   * @param {Function} [callback]
   */
  editNote(noteId, updates, callback) {
    const currentList = Array.isArray(this.state.notesList) ? [...this.state.notesList] : [];
    const noteIndex = currentList.findIndex((n) => n.id === noteId);

    if (noteIndex === -1) {
      const err = `Note "${noteId}" not found.`;
      if (typeof callback === 'function') callback({ success: false, error: err });
      return this;
    }

    const existing = currentList[noteIndex];
    const newContent = typeof updates === 'string'
      ? updates.slice(0, 15000)
      : (updates.content !== undefined ? String(updates.content).slice(0, 15000) : existing.content);
    const newTitle = typeof updates === 'object' && updates.title !== undefined
      ? String(updates.title).slice(0, 80)
      : existing.title;

    currentList[noteIndex] = {
      ...existing,
      title: newTitle,
      content: newContent,
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
   * Delete a note from the current room
   * @param {string} noteId
   * @param {Function} [callback]
   */
  deleteNote(noteId, callback) {
    const currentList = Array.isArray(this.state.notesList) ? [...this.state.notesList] : [];
    const updatedList = currentList.filter((n) => n.id !== noteId);
    const serializedNotes = updatedList.map((n) => n.content).join('\n\n');

    return this.updateState({
      notesList: updatedList,
      notes: serializedNotes,
      text: serializedNotes,
    }, callback);
  }

  /**
   * Update the current room notes in real time
   * Synchronizes both `notesList`, `notes`, and `text` for complete backward compatibility.
   * @param {string} content
   * @param {Function} [callback]
   */
  updateNotes(content, callback) {
    const currentList = Array.isArray(this.state.notesList) ? [...this.state.notesList] : [];
    if (currentList.length > 0) {
      currentList[0] = {
        ...currentList[0],
        content: String(content || ''),
        updatedAt: new Date().toISOString(),
        updatedBy: this.displayName || 'Member',
      };
    } else {
      currentList.push({
        id: `note_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        authorId: this.sessionId,
        authorName: this.displayName || 'Member',
        authorColor: this.getUserColor(),
        title: 'Shared Note',
        content: String(content || ''),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        updatedBy: this.displayName || 'Member',
      });
    }

    return this.updateState({
      notesList: currentList,
      notes: content,
      text: content,
    }, callback);
  }


  // ==========================================
  // Public API: Presence & Identity (Requirement 1, 2, 3, 4)
  // ==========================================

  /**
   * Update the client's display name and notify room members (Requirement 2 & 4)
   * @param {string} name New display name
   */
  setDisplayName(name) {
    if (!name || typeof name !== 'string') return this;
    this.displayName = name.trim().slice(0, 30);

    // If connected in a room, send presence update to server
    if (this.isConnected() && this.currentRoom) {
      this.socket.emit('presence-update', {
        roomId: this.currentRoom,
        displayName: this.displayName,
      });
    }
    return this;
  }

  /**
   * Get the client's unique session identifier (Requirement 1)
   */
  getSessionId() {
    return this.sessionId;
  }

  /**
   * Get the client's current display name (Requirement 2)
   */
  getDisplayName() {
    return this.displayName;
  }

  /**
   * Get list of currently connected users in the room (Requirement 3)
   */
  getPresence() {
    return [...this.presenceList];
  }

  /**
   * Generates a consistent, distinct color for any user identifier (Requirement 4)
   * @param {string} identifier User sessionId or ID
   * @returns {string} Hex color code
   */
  static getUserColor(identifier) {
    const PALETTE = [
      '#38bdf8', // sky blue
      '#f43f5e', // rose red
      '#10b981', // emerald green
      '#fbbf24', // amber yellow
      '#a855f7', // purple
      '#ec4899', // pink
      '#06b6d4', // cyan
      '#f97316', // orange
      '#8b5cf6', // violet
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

  /**
   * Send real-time cursor coordinates
   * Throttled automatically to avoid flooding the server (Requirement 2 & 7)
   * Completely separate from shared state (Requirement 6 & 9)
   * @param {{ x: number, y: number, [key: string]: any }} coords
   */
  sendCursor(coords) {
    if (!this.isConnected() || !this.currentRoom || !coords) return this;

    const now = Date.now();

    // Throttle check (Requirement 7)
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

  /**
   * Broadcast an ephemeral reaction to other room members (Requirement 4)
   * @param {string} emoji
   */
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
  // Public API: Subscriptions / Event Listeners
  // (Avoids duplicate listener entries - Requirement 8)
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

  /**
   * Subscribe to room presence changes (Requirement 4 & 8)
   * @param {Function} callback Receives array of online users [{ sessionId, displayName, ... }]
   */
  onPresenceChange(callback) {
    if (typeof callback !== 'function') return () => {};
    if (!this._listeners.presenceChange.includes(callback)) {
      this._listeners.presenceChange.push(callback);
    }
    if (this.presenceList.length > 0) {
      callback(this.presenceList);
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

  /**
   * Subscribe to ephemeral room reactions from other members (Requirement 4)
   * @param {Function} callback Receives { emoji, displayName, sessionId, userId, timestamp }
   */
  onReaction(callback) {
    if (typeof callback !== 'function') return () => {};
    if (!this._listeners.reaction.includes(callback)) {
      this._listeners.reaction.push(callback);
    }
    return () => {
      this._listeners.reaction = this._listeners.reaction.filter((cb) => cb !== callback);
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

  // ==========================================
  // Getters
  // ==========================================

  isConnected() {
    return Boolean(this.socket && this.socket.connected);
  }

  getUserId() {
    return this.socket ? this.socket.id : null;
  }

  getRoom() {
    return this.currentRoom;
  }

  // ==========================================
  // Internal Helpers & Networking
  // ==========================================

  _getOrCreateSessionId() {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        let id = window.sessionStorage.getItem('synckit:session-id');
        if (!id) {
          id = `sess_${Math.random().toString(36).substring(2, 10)}`;
          window.sessionStorage.setItem('synckit:session-id', id);
        }
        return id;
      } catch (e) {
        // Fallback
      }
    }
    return `sess_${Math.random().toString(36).substring(2, 10)}`;
  }

  _setupSocketListeners() {
    // 1. Socket Connected (Initial or Reconnection)
    this.socket.on('connect', () => {
      const isReconnection = this.hasConnectedOnce;
      this.hasConnectedOnce = true;

      if (isReconnection) {
        console.log(`[SyncKit] Reconnected! (New Socket ID: ${this.socket.id})`);
        this.isReconnecting = true;

        // Rejoin room with same sessionId & displayName (Requirement 4 & 6)
        if (this.currentRoom) {
          console.log(`[SyncKit] Re-joining room "${this.currentRoom}" and recovering state...`);
          const pendingCb = this._pendingJoinCallback;
          this._pendingJoinCallback = null;
          this.socket.emit(
            'join-room',
            {
              roomId: this.currentRoom,
              sessionId: this.sessionId,
              displayName: this.displayName,
            },
            (res) => {
              this.isReconnecting = false;
              this._setStatus('reconnected', { socketId: this.socket.id, recovered: true });
              if (typeof pendingCb === 'function') pendingCb(res);
            }
          );
          return;
        }

        this.isReconnecting = false;
        this._setStatus('reconnected', { socketId: this.socket.id, recovered: false });
      } else {
        console.log(`[SyncKit] Connected to server (Socket ID: ${this.socket.id})`);
        this._setStatus('connected', { socketId: this.socket.id, recovered: false });

        if (this.currentRoom) {
          const pendingCb = this._pendingJoinCallback;
          this._pendingJoinCallback = null;
          this.joinRoom(this.currentRoom, pendingCb);
        }
      }
    });


    // 2. Disconnect (Requirement 1 & 5)
    this.socket.on('disconnect', (reason) => {
      console.log(`[SyncKit] Disconnected from server (Reason: ${reason})`);
      this._setStatus('disconnected', { reason });
    });

    // 3. Reconnection Attempts
    if (this.socket.io) {
      this.socket.io.on('reconnect_attempt', (attempt) => {
        console.log(`[SyncKit] Reconnecting attempt ${attempt}...`);
        this._setStatus('reconnecting', { attempt });
      });
    }

    // 4. Room State & Presence Broadcasts (Requirement 3, 4, 6, 7)
    this.socket.on('room-joined', (data) => {
      const wasReconnection = this.isReconnecting;
      this.currentRoom = data.roomId;
      this.state = data.state || {};
      this.presenceList = Array.isArray(data.presence) ? data.presence : Object.values(data.presence || {});

      const wasReset = Boolean(data.isNewRoom && wasReconnection);
      if (wasReset) {
        console.warn(`[SyncKit] Notice: Room "${data.roomId}" was initialized fresh on the server.`);
      }

      this._emitStateChange(this.state, {
        version: this.state.version,
        recovered: wasReconnection,
        wasReset: wasReset,
        roomId: this.currentRoom,
      });

      this._emitPresenceChange(this.presenceList);
    });

    // Full presence list update from server (Requirement 4 & 5)
    this.socket.on('presence-update', (data) => {
      if (data.roomId === this.currentRoom) {
        this.presenceList = Array.isArray(data.presence) ? data.presence : Object.values(data.presence || {});
        this._emitPresenceChange(this.presenceList);
      }
    });

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

    // 5. Cursors (Requirement 4 & 5)
    this.socket.on('cursor-moved', (data) => {
      // Distinct color based on user sessionId (Requirement 4)
      const color = SyncKit.getUserColor(data.sessionId || data.userId);
      const cursorEvent = {
        ...data,
        color,
      };
      this._listeners.cursorMove.forEach((cb) => cb(cursorEvent));
    });

    // 6. Ephemeral Room Reactions (Requirement 4)
    this.socket.on('reaction-received', (data) => {
      this._listeners.reaction.forEach((cb) => cb(data));
    });

    // 7. Errors
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
