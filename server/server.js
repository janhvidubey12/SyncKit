// server/server.js
// SyncKit Real-Time Server
// Authoritative server for room-based real-time multiplayer applications
// Includes persistent PostgreSQL & SQLite database storage, whiteboard synchronization,
// and server-side note permission enforcement.

const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const db = require('./db.js');

// ==========================================
// 1. Start HTTP Server with Express
// ==========================================
const app = express();
const server = http.createServer(app);

// ==========================================
// 2. Attach Socket.IO with CORS Enabled
// ==========================================
const io = new Server(server, {
  cors: {
    origin: '*', // Allows connections from local or external testing origins
    methods: ['GET', 'POST'],
  },
});

// ==========================================
// 3. Serve Client Files & Health Check
// ==========================================
const clientPath = path.join(__dirname, '..', 'client');
app.use(express.static(clientPath));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    totalActiveSockets: io.engine.clientsCount,
    totalRooms: Object.keys(rooms).length,
    database: db.type,
    databaseReady: db.isReady,
  });
});

// Redirect root to demo page, preserving query parameters (e.g. ?room=alpha)
app.get('/', (req, res) => {
  const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  res.redirect('/demo' + query);
});

// Dedicated room route support (e.g. /room/hackathon-team)
app.get('/room/:roomId', (req, res) => {
  const roomId = encodeURIComponent(req.params.roomId);
  res.redirect(`/demo?room=${roomId}`);
});

// ==========================================
// 4. Authoritative In-Memory Room State Store
// ==========================================
const rooms = {};

// Blocklist of forbidden keys to prevent prototype pollution or metadata overwriting
const FORBIDDEN_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype',
  'roomId',
  'id',
  'version',
  'createdAt',
  'members',
]);

/**
 * Validates incoming state updates.
 */
function validateStateUpdates(updates) {
  if (typeof updates !== 'object' || updates === null || Array.isArray(updates)) {
    return { valid: false, error: 'State updates must be a non-null key-value object.' };
  }

  const keys = Object.keys(updates);
  if (keys.length === 0) {
    return { valid: false, error: 'State update object cannot be empty.' };
  }

  const sanitized = {};

  for (const key of keys) {
    if (FORBIDDEN_KEYS.has(key)) {
      return { valid: false, error: `Modifying protected key "${key}" is forbidden.` };
    }

    const value = updates[key];

    if (typeof value === 'function' || typeof value === 'undefined') {
      return { valid: false, error: `Invalid value type for key "${key}". Functions and undefined are not allowed.` };
    }

    if (typeof value === 'string') {
      if (value.length > 50000) {
        return { valid: false, error: `String for key "${key}" exceeds max length of 50000 characters.` };
      }
      sanitized[key] = value;
      continue;
    }

    if (typeof value === 'number') {
      if (isNaN(value) || !isFinite(value)) {
        return { valid: false, error: `Number for key "${key}" must be a valid finite number.` };
      }
      sanitized[key] = value;
      continue;
    }

    if (typeof value === 'boolean') {
      sanitized[key] = value;
      continue;
    }

    if (typeof value === 'object' && value !== null) {
      if (Array.isArray(value)) {
        if (value.length > 500) {
          return { valid: false, error: `Array for key "${key}" exceeds limit of 500 items.` };
        }
        sanitized[key] = value;
      } else {
        sanitized[key] = value;
      }
      continue;
    }

    return { valid: false, error: `Unsupported value type for key "${key}".` };
  }

  return { valid: true, sanitized };
}

/**
 * Retrieves an existing room or creates an isolated new room with initial authoritative state.
 */
function getOrCreateRoom(roomId) {
  let isNew = false;
  if (!rooms[roomId]) {
    rooms[roomId] = {
      id: roomId,
      createdAt: new Date().toISOString(),
      members: new Set(),
      presence: {},
      whiteboard: [],
      whiteboardVersion: 1,
      _loadedFromDb: false,
      state: {
        count: 0,
        text: 'Welcome to SyncKit!',
        notes: '# Room Notes\n\nWelcome to your collaborative workspace! Type notes here to sync in real time across all members in this room.',
        notesList: [],
        version: 1,
        lastUpdated: new Date().toISOString(),
        lastUpdatedBy: 'system',
      },
    };
    isNew = true;
    console.log(`[SyncKit Server] [Room Created] Room "${roomId}" initialized.`);
  }
  return { room: rooms[roomId], isNew };
}

/**
 * Asynchronously loads persisted notes and whiteboard from the database into room memory.
 */
async function ensureRoomLoaded(roomId) {
  const { room, isNew } = getOrCreateRoom(roomId);
  if (!room._loadedFromDb) {
    try {
      const [savedNotes, savedWb] = await Promise.all([
        db.getRoomNotes(roomId),
        db.getWhiteboard(roomId),
      ]);

      if (savedNotes && savedNotes.length > 0) {
        room.state.notesList = savedNotes;
        room.state.notes = savedNotes.map((n) => n.content).join('\n\n');
        room.state.text = room.state.notes;
        room.state.version += 1;
      }

      if (savedWb && Array.isArray(savedWb.strokes) && savedWb.strokes.length > 0) {
        room.whiteboard = savedWb.strokes;
        room.whiteboardVersion = savedWb.version || 1;
      }
    } catch (e) {
      console.error(`[SyncKit Server] Error loading room "${roomId}" from DB:`, e);
    }
    room._loadedFromDb = true;
  }
  return { room, isNew };
}

// ==========================================
// Debounced Database Persistence Helpers
// ==========================================
const noteSaveDebounceTimers = {};
function debouncedSaveNote(note) {
  if (!note || !note.id || !note.roomId) return;
  const key = `${note.roomId}:${note.id}`;
  if (noteSaveDebounceTimers[key]) clearTimeout(noteSaveDebounceTimers[key]);
  noteSaveDebounceTimers[key] = setTimeout(async () => {
    delete noteSaveDebounceTimers[key];
    try {
      await db.saveNote(note);
    } catch (err) {
      console.error(`[SyncKit Server] DB error saving note ${note.id}:`, err);
    }
  }, 300);
}

const wbSaveDebounceTimers = {};
function debouncedSaveWhiteboard(roomId, strokes, version, updatedBy) {
  if (!roomId) return;
  if (wbSaveDebounceTimers[roomId]) clearTimeout(wbSaveDebounceTimers[roomId]);
  wbSaveDebounceTimers[roomId] = setTimeout(async () => {
    delete wbSaveDebounceTimers[roomId];
    try {
      await db.saveWhiteboard(roomId, strokes, version, updatedBy);
    } catch (err) {
      console.error(`[SyncKit Server] DB error saving whiteboard for room ${roomId}:`, err);
    }
  }, 400);
}

// ==========================================
// Note Permission Enforcement Helper
// ==========================================
function verifyNotePermission(existingNote, socket, authorKey, action = 'edit') {
  if (!existingNote) return { allowed: true, isAuthor: true };

  // Check if client is the verified author
  const isAuthor =
    Boolean(authorKey && existingNote.authorKey && authorKey === existingNote.authorKey) ||
    Boolean(socket.sessionId && existingNote.authorId === socket.sessionId);

  if (action === 'delete' || action === 'permission') {
    if (!isAuthor) {
      return {
        allowed: false,
        error: `Permission denied: Only the note author (${existingNote.authorName || 'Creator'}) can ${
          action === 'delete' ? 'delete' : 'change permissions for'
        } this note.`,
      };
    }
    return { allowed: true, isAuthor: true };
  }

  // action === 'edit'
  if (existingNote.permission === 'private') {
    if (!isAuthor) {
      return {
        allowed: false,
        error: `Permission denied: This note is locked ("Only I can edit") by ${existingNote.authorName || 'the author'}.`,
      };
    }
  }

  return { allowed: true, isAuthor };
}

// ==========================================
// 5. Socket.IO Connection & Event Handlers
// ==========================================
let totalConnections = 0;

io.on('connection', (socket) => {
  totalConnections++;
  console.log(`[SyncKit Server] [Connected] Socket ID: ${socket.id} | Total Connected: ${totalConnections}`);

  socket.currentRooms = new Set();
  io.emit('synckit:user-count', totalConnections);

  // ----------------------------------------------------
  // EVENT: join-room
  // ----------------------------------------------------
  socket.on('join-room', async (payload, callback) => {
    try {
      const roomId = typeof payload === 'string' ? payload.trim() : payload?.roomId?.trim();

      if (!roomId) {
        const errorMsg = 'Invalid room ID. Please provide a non-empty room name.';
        socket.emit('synckit:error', { code: 'INVALID_ROOM', message: errorMsg });
        if (typeof callback === 'function') callback({ success: false, error: errorMsg });
        return;
      }

      const sessionId = payload?.sessionId ? String(payload.sessionId).trim() : `sess_${socket.id}`;
      const displayName = payload?.displayName ? String(payload.displayName).trim().slice(0, 30) : `User-${sessionId.slice(-4)}`;
      socket.sessionId = sessionId;
      socket.displayName = displayName;
      socket.authorKey = payload?.authorKey ? String(payload.authorKey).trim() : '';

      // Leave previous rooms if switching rooms
      for (const oldRoomId of Array.from(socket.currentRooms)) {
        if (oldRoomId !== roomId) {
          socket.leave(oldRoomId);
          socket.currentRooms.delete(oldRoomId);
          const oldRoom = rooms[oldRoomId];
          if (oldRoom) {
            oldRoom.members.delete(socket.id);
            if (socket.sessionId && oldRoom.presence[socket.sessionId]?.socketId === socket.id) {
              delete oldRoom.presence[socket.sessionId];
            }
            const oldPresence = Object.values(oldRoom.presence);
            console.log(`[SyncKit Server] [Room Switch] ${displayName} left old room "${oldRoomId}" (Online: ${oldPresence.length})`);
            io.to(oldRoomId).emit('presence-update', {
              roomId: oldRoomId,
              presence: oldPresence,
            });
          }
        }
      }

      // Asynchronously load room from DB if not yet cached in memory
      const { room, isNew } = await ensureRoomLoaded(roomId);

      socket.join(roomId);
      room.members.add(socket.id);
      socket.currentRooms.add(roomId);

      room.presence[sessionId] = {
        sessionId,
        socketId: socket.id,
        displayName,
        joinedAt: room.presence[sessionId]?.joinedAt || new Date().toISOString(),
      };

      const activePresenceList = Object.values(room.presence);
      console.log(`[SyncKit Server] [Room Join] ${displayName} (${sessionId}) joined "${roomId}" (Online: ${activePresenceList.length})`);

      socket.emit('room-joined', {
        roomId: room.id,
        state: room.state,
        whiteboard: room.whiteboard,
        whiteboardVersion: room.whiteboardVersion,
        membersCount: activePresenceList.length,
        presence: activePresenceList,
        sessionId,
        isNewRoom: isNew,
      });

      io.to(roomId).emit('presence-update', {
        roomId: room.id,
        presence: activePresenceList,
      });

      if (typeof callback === 'function') {
        callback({
          success: true,
          roomId,
          state: room.state,
          whiteboard: room.whiteboard,
          whiteboardVersion: room.whiteboardVersion,
          sessionId,
          presence: activePresenceList,
          isNewRoom: isNew,
        });
      }
    } catch (err) {
      console.error(`[SyncKit Server] [Error] Failed to join room for ${socket.id}:`, err);
      socket.emit('synckit:error', { code: 'JOIN_ERROR', message: 'Internal server error joining room.' });
      if (typeof callback === 'function') callback({ success: false, error: err.message });
    }
  });

  // ----------------------------------------------------
  // EVENT: get-state
  // ----------------------------------------------------
  socket.on('get-state', (payload, callback) => {
    try {
      const roomId = typeof payload === 'string' ? payload.trim() : payload?.roomId?.trim();

      if (!roomId || !rooms[roomId]) {
        const errorMsg = `Room "${roomId}" not found.`;
        socket.emit('synckit:error', { code: 'ROOM_NOT_FOUND', message: errorMsg });
        if (typeof callback === 'function') callback({ success: false, error: errorMsg });
        return;
      }

      const room = rooms[roomId];

      if (!room.members.has(socket.id)) {
        const errorMsg = `You must join room "${roomId}" before requesting its state.`;
        socket.emit('synckit:error', { code: 'UNAUTHORIZED_ROOM_ACCESS', message: errorMsg });
        if (typeof callback === 'function') callback({ success: false, error: errorMsg });
        return;
      }

      socket.emit('room-state', {
        roomId: room.id,
        state: room.state,
        whiteboard: room.whiteboard,
        whiteboardVersion: room.whiteboardVersion,
      });

      if (typeof callback === 'function') {
        callback({
          success: true,
          roomId: room.id,
          state: room.state,
          whiteboard: room.whiteboard,
          whiteboardVersion: room.whiteboardVersion,
        });
      }
    } catch (err) {
      console.error(`[SyncKit Server] [Error] Failed to get state for ${socket.id}:`, err);
      if (typeof callback === 'function') callback({ success: false, error: err.message });
    }
  });

  // ----------------------------------------------------
  // EVENT: update-state
  // ----------------------------------------------------
  socket.on('update-state', (payload, callback) => {
    try {
      const roomId = payload?.roomId?.trim();
      const updates = payload?.updates;
      const authorKey = payload?.authorKey || socket.authorKey;

      if (!roomId || !rooms[roomId]) {
        const errorMsg = `Room "${roomId}" does not exist.`;
        socket.emit('synckit:error', { code: 'ROOM_NOT_FOUND', message: errorMsg });
        if (typeof callback === 'function') callback({ success: false, error: errorMsg });
        return;
      }

      const room = rooms[roomId];

      if (!room.members.has(socket.id)) {
        const errorMsg = `Cannot update state: You are not a member of room "${roomId}".`;
        socket.emit('synckit:error', { code: 'NOT_IN_ROOM', message: errorMsg });
        if (typeof callback === 'function') callback({ success: false, error: errorMsg });
        return;
      }

      const validation = validateStateUpdates(updates);
      if (!validation.valid) {
        socket.emit('synckit:error', { code: 'INVALID_STATE_UPDATE', message: validation.error });
        if (typeof callback === 'function') callback({ success: false, error: validation.error });
        return;
      }

      // Permission Enforcement if updating notesList via update-state
      if (Array.isArray(validation.sanitized.notesList)) {
        const existingMap = new Map((room.state.notesList || []).map((n) => [n.id, n]));
        const incomingIds = new Set(validation.sanitized.notesList.map((n) => n.id));

        // 1. Verify modified notes
        for (const note of validation.sanitized.notesList) {
          const existing = existingMap.get(note.id);
          if (existing) {
            // Permission change
            if (note.permission && note.permission !== existing.permission) {
              const check = verifyNotePermission(existing, socket, authorKey, 'permission');
              if (!check.allowed) {
                socket.emit('synckit:error', { code: 'UNAUTHORIZED_NOTE_PERMISSION', message: check.error });
                if (typeof callback === 'function') callback({ success: false, error: check.error });
                return;
              }
            }
            // Content/Title change
            if (note.content !== existing.content || note.title !== existing.title) {
              const check = verifyNotePermission(existing, socket, authorKey, 'edit');
              if (!check.allowed) {
                socket.emit('synckit:error', { code: 'UNAUTHORIZED_NOTE_EDIT', message: check.error });
                if (typeof callback === 'function') callback({ success: false, error: check.error });
                return;
              }
            }
          }
        }

        // 2. Verify deleted notes
        for (const [id, existing] of existingMap.entries()) {
          if (!incomingIds.has(id)) {
            const check = verifyNotePermission(existing, socket, authorKey, 'delete');
            if (!check.allowed) {
              socket.emit('synckit:error', { code: 'UNAUTHORIZED_NOTE_DELETE', message: check.error });
              if (typeof callback === 'function') callback({ success: false, error: check.error });
              return;
            }
            db.deleteNote(id, room.id).catch((e) => console.error(e));
          }
        }

        // Persist modified notes to DB
        for (const note of validation.sanitized.notesList) {
          debouncedSaveNote({ ...note, roomId: room.id });
        }
      }

      Object.assign(room.state, validation.sanitized);
      room.state.version += 1;
      room.state.lastUpdated = new Date().toISOString();
      room.state.lastUpdatedBy = socket.id;

      io.to(roomId).emit('state-updated', {
        roomId: room.id,
        state: room.state,
        updatedBy: socket.id,
        version: room.state.version,
      });

      if (typeof callback === 'function') {
        callback({ success: true, roomId: room.id, state: room.state, version: room.state.version });
      }
    } catch (err) {
      console.error(`[SyncKit Server] [Error] Failed updating state in room:`, err);
      socket.emit('synckit:error', { code: 'UPDATE_FAILED', message: 'Internal server error during state update.' });
      if (typeof callback === 'function') callback({ success: false, error: err.message });
    }
  });

  // ----------------------------------------------------
  // EVENT: note-create
  // Explicit note creation with author ownership & permissions
  // ----------------------------------------------------
  socket.on('note-create', async (payload, callback) => {
    try {
      const roomId = payload?.roomId || Array.from(socket.currentRooms)[0];
      if (!roomId || !rooms[roomId] || !rooms[roomId].members.has(socket.id)) {
        const err = 'Cannot create note: You are not a member of this room.';
        socket.emit('synckit:error', { code: 'NOT_IN_ROOM', message: err });
        if (typeof callback === 'function') callback({ success: false, error: err });
        return;
      }
      const room = rooms[roomId];
      const noteData = payload.note || {};
      const authorKey = payload.authorKey || socket.authorKey || '';

      const newNote = {
        id: String(noteData.id || `note_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`),
        roomId,
        title: String(noteData.title || '').slice(0, 200),
        content: String(noteData.content || '').slice(0, 50000),
        authorId: socket.sessionId || socket.id,
        authorName: socket.displayName || noteData.authorName || 'Member',
        authorColor: noteData.authorColor || '#ef4444',
        permission: noteData.permission === 'private' ? 'private' : 'public',
        authorKey,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        updatedBy: socket.displayName || 'Member',
      };

      const currentList = Array.isArray(room.state.notesList) ? [...room.state.notesList] : [];
      currentList.push(newNote);
      room.state.notesList = currentList;
      room.state.notes = currentList.map((n) => n.content).join('\n\n');
      room.state.text = room.state.notes;
      room.state.version += 1;
      room.state.lastUpdated = new Date().toISOString();
      room.state.lastUpdatedBy = socket.id;

      await db.saveNote(newNote);

      io.to(roomId).emit('state-updated', {
        roomId: room.id,
        state: room.state,
        updatedBy: socket.id,
        version: room.state.version,
      });

      if (typeof callback === 'function') {
        callback({ success: true, note: newNote, version: room.state.version });
      }
    } catch (err) {
      console.error('[SyncKit Server] note-create error:', err);
      if (typeof callback === 'function') callback({ success: false, error: err.message });
    }
  });

  // ----------------------------------------------------
  // EVENT: note-update
  // Explicit note edit or permission update with strict authorization
  // ----------------------------------------------------
  socket.on('note-update', async (payload, callback) => {
    try {
      const roomId = payload?.roomId || Array.from(socket.currentRooms)[0];
      const noteId = payload?.noteId;
      const updates = payload?.updates || {};
      const authorKey = payload?.authorKey || socket.authorKey || '';

      if (!roomId || !rooms[roomId] || !rooms[roomId].members.has(socket.id)) {
        const err = 'Cannot update note: You are not a member of this room.';
        socket.emit('synckit:error', { code: 'NOT_IN_ROOM', message: err });
        if (typeof callback === 'function') callback({ success: false, error: err });
        return;
      }
      const room = rooms[roomId];
      const currentList = Array.isArray(room.state.notesList) ? [...room.state.notesList] : [];
      const noteIndex = currentList.findIndex((n) => n.id === noteId);

      if (noteIndex === -1) {
        const err = 'Note not found';
        socket.emit('synckit:error', { code: 'NOTE_NOT_FOUND', message: err });
        if (typeof callback === 'function') callback({ success: false, error: err });
        return;
      }

      const existing = currentList[noteIndex];

      // Permission change authorization check
      if (updates.permission !== undefined && updates.permission !== existing.permission) {
        const permCheck = verifyNotePermission(existing, socket, authorKey, 'permission');
        if (!permCheck.allowed) {
          socket.emit('synckit:error', { code: 'UNAUTHORIZED_NOTE_PERMISSION', message: permCheck.error });
          if (typeof callback === 'function') callback({ success: false, error: permCheck.error });
          return;
        }
      }

      // Content/Title edit authorization check
      if (updates.content !== undefined || updates.title !== undefined) {
        const editCheck = verifyNotePermission(existing, socket, authorKey, 'edit');
        if (!editCheck.allowed) {
          socket.emit('synckit:error', { code: 'UNAUTHORIZED_NOTE_EDIT', message: editCheck.error });
          if (typeof callback === 'function') callback({ success: false, error: editCheck.error });
          return;
        }
      }

      const updatedNote = {
        ...existing,
        title: updates.title !== undefined ? String(updates.title).slice(0, 200) : existing.title,
        content: updates.content !== undefined ? String(updates.content).slice(0, 50000) : existing.content,
        permission:
          updates.permission !== undefined
            ? updates.permission === 'private'
              ? 'private'
              : 'public'
            : existing.permission,
        updatedAt: new Date().toISOString(),
        updatedBy: socket.displayName || 'Member',
      };

      currentList[noteIndex] = updatedNote;
      room.state.notesList = currentList;
      room.state.notes = currentList.map((n) => n.content).join('\n\n');
      room.state.text = room.state.notes;
      room.state.version += 1;
      room.state.lastUpdated = new Date().toISOString();
      room.state.lastUpdatedBy = socket.id;

      debouncedSaveNote(updatedNote);

      io.to(roomId).emit('state-updated', {
        roomId: room.id,
        state: room.state,
        updatedBy: socket.id,
        version: room.state.version,
      });

      if (typeof callback === 'function') {
        callback({ success: true, note: updatedNote, version: room.state.version });
      }
    } catch (err) {
      console.error('[SyncKit Server] note-update error:', err);
      if (typeof callback === 'function') callback({ success: false, error: err.message });
    }
  });

  // ----------------------------------------------------
  // EVENT: note-delete
  // Explicit note deletion with author authorization check
  // ----------------------------------------------------
  socket.on('note-delete', async (payload, callback) => {
    try {
      const roomId = payload?.roomId || Array.from(socket.currentRooms)[0];
      const noteId = payload?.noteId;
      const authorKey = payload?.authorKey || socket.authorKey || '';

      if (!roomId || !rooms[roomId] || !rooms[roomId].members.has(socket.id)) {
        const err = 'Cannot delete note: You are not a member of this room.';
        socket.emit('synckit:error', { code: 'NOT_IN_ROOM', message: err });
        if (typeof callback === 'function') callback({ success: false, error: err });
        return;
      }
      const room = rooms[roomId];
      const currentList = Array.isArray(room.state.notesList) ? [...room.state.notesList] : [];
      const noteIndex = currentList.findIndex((n) => n.id === noteId);

      if (noteIndex === -1) {
        const err = 'Note not found';
        socket.emit('synckit:error', { code: 'NOTE_NOT_FOUND', message: err });
        if (typeof callback === 'function') callback({ success: false, error: err });
        return;
      }

      const existing = currentList[noteIndex];
      const delCheck = verifyNotePermission(existing, socket, authorKey, 'delete');
      if (!delCheck.allowed) {
        socket.emit('synckit:error', { code: 'UNAUTHORIZED_NOTE_DELETE', message: delCheck.error });
        if (typeof callback === 'function') callback({ success: false, error: delCheck.error });
        return;
      }

      currentList.splice(noteIndex, 1);
      room.state.notesList = currentList;
      room.state.notes = currentList.map((n) => n.content).join('\n\n');
      room.state.text = room.state.notes;
      room.state.version += 1;
      room.state.lastUpdated = new Date().toISOString();
      room.state.lastUpdatedBy = socket.id;

      await db.deleteNote(noteId, roomId);

      io.to(roomId).emit('state-updated', {
        roomId: room.id,
        state: room.state,
        updatedBy: socket.id,
        version: room.state.version,
      });

      if (typeof callback === 'function') {
        callback({ success: true, noteId, version: room.state.version });
      }
    } catch (err) {
      console.error('[SyncKit Server] note-delete error:', err);
      if (typeof callback === 'function') callback({ success: false, error: err.message });
    }
  });

  // ----------------------------------------------------
  // EVENT: whiteboard-draw
  // Synchronizes freehand drawing strokes across all members in room
  // ----------------------------------------------------
  socket.on('whiteboard-draw', async (payload, callback) => {
    try {
      const roomId = payload?.roomId || Array.from(socket.currentRooms)[0] || 'room-1';
      const stroke = payload?.stroke;

      if (!stroke || !Array.isArray(stroke.points) || stroke.points.length === 0) {
        if (typeof callback === 'function') callback({ success: false, error: 'Invalid stroke data' });
        return;
      }

      const { room } = await ensureRoomLoaded(roomId);
      room.members.add(socket.id);
      socket.currentRooms.add(roomId);
      socket.join(roomId);

      const sanitizedStroke = {
        id: String(stroke.id || `stroke_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`),
        authorId: socket.sessionId || socket.id,
        authorName: socket.displayName || 'Member',
        color: String(stroke.color || '#f8fafc').slice(0, 30),
        size: Math.min(Math.max(Number(stroke.size) || 3, 1), 60),
        isEraser: Boolean(stroke.isEraser),
        points: stroke.points.slice(0, 1000).map((p) => ({
          x: Math.round(Number(p.x) * 10) / 10,
          y: Math.round(Number(p.y) * 10) / 10,
        })),
        timestamp: Date.now(),
      };

      room.whiteboard.push(sanitizedStroke);
      if (room.whiteboard.length > 3000) {
        room.whiteboard = room.whiteboard.slice(-2000);
      }
      room.whiteboardVersion += 1;

      // Broadcast exclusively to other clients in this specific room
      socket.to(roomId).emit('whiteboard-stroke', {
        roomId,
        stroke: sanitizedStroke,
        version: room.whiteboardVersion,
      });

      debouncedSaveWhiteboard(roomId, room.whiteboard, room.whiteboardVersion, socket.id);

      if (typeof callback === 'function') {
        callback({ success: true, strokeId: sanitizedStroke.id, version: room.whiteboardVersion });
      }
    } catch (err) {
      console.error(`[SyncKit Server] Error drawing on whiteboard:`, err);
      if (typeof callback === 'function') callback({ success: false, error: err.message });
    }
  });

  // ----------------------------------------------------
  // EVENT: whiteboard-clear
  // Clears whiteboard strokes with confirmation broadcast
  // ----------------------------------------------------
  socket.on('whiteboard-clear', async (payload, callback) => {
    try {
      const roomId = payload?.roomId || Array.from(socket.currentRooms)[0] || 'room-1';
      const { room } = await ensureRoomLoaded(roomId);
      room.members.add(socket.id);
      socket.currentRooms.add(roomId);
      socket.join(roomId);

      room.whiteboard = [];
      room.whiteboardVersion += 1;

      // Cancel any pending debounce timer
      if (wbSaveDebounceTimers[roomId]) {
        clearTimeout(wbSaveDebounceTimers[roomId]);
        delete wbSaveDebounceTimers[roomId];
      }

      // Persist cleared state immediately to DB
      await db.saveWhiteboard(roomId, [], room.whiteboardVersion, socket.id);

      io.to(roomId).emit('whiteboard-cleared', {
        roomId,
        version: room.whiteboardVersion,
        clearedBy: socket.displayName || 'Member',
      });

      if (typeof callback === 'function') {
        callback({ success: true, version: room.whiteboardVersion });
      }
    } catch (err) {
      console.error(`[SyncKit Server] Error clearing whiteboard:`, err);
      if (typeof callback === 'function') callback({ success: false, error: err.message });
    }
  });

  // ----------------------------------------------------
  // EVENT: whiteboard-undo
  // Removes last stroke drawn by the current user
  // ----------------------------------------------------
  socket.on('whiteboard-undo', async (payload, callback) => {
    try {
      const roomId = payload?.roomId || Array.from(socket.currentRooms)[0] || 'room-1';
      const { room } = await ensureRoomLoaded(roomId);
      room.members.add(socket.id);
      socket.currentRooms.add(roomId);
      socket.join(roomId);
      if (room.whiteboard.length === 0) {
        if (typeof callback === 'function') callback({ success: true, strokes: [], version: room.whiteboardVersion });
        return;
      }

      const authorId = socket.sessionId || socket.id;
      let targetIndex = -1;
      for (let i = room.whiteboard.length - 1; i >= 0; i--) {
        const s = room.whiteboard[i];
        if (s.authorId === authorId || s.authorId === socket.id || s.authorId === socket.sessionId) {
          targetIndex = i;
          break;
        }
      }
      if (targetIndex === -1) {
        // No stroke drawn by this user to undo
        if (typeof callback === 'function') {
          callback({ success: true, strokes: room.whiteboard, version: room.whiteboardVersion, noUserStrokes: true });
        }
        return;
      }

      const removed = room.whiteboard.splice(targetIndex, 1)[0];
      room.whiteboardVersion += 1;

      // Cancel pending debounce timer and save immediately
      if (wbSaveDebounceTimers[roomId]) {
        clearTimeout(wbSaveDebounceTimers[roomId]);
        delete wbSaveDebounceTimers[roomId];
      }
      await db.saveWhiteboard(roomId, room.whiteboard, room.whiteboardVersion, socket.id);

      io.to(roomId).emit('whiteboard-updated', {
        roomId,
        strokes: room.whiteboard,
        version: room.whiteboardVersion,
        undoneStrokeId: removed?.id,
      });

      if (typeof callback === 'function') {
        callback({ success: true, strokes: room.whiteboard, version: room.whiteboardVersion });
      }
    } catch (err) {
      console.error(`[SyncKit Server] Error undoing whiteboard:`, err);
      if (typeof callback === 'function') callback({ success: false, error: err.message });
    }
  });

  // ----------------------------------------------------
  // EVENT: get-whiteboard
  // ----------------------------------------------------
  socket.on('get-whiteboard', (payload, callback) => {
    const roomId = payload?.roomId || Array.from(socket.currentRooms)[0];
    if (roomId && rooms[roomId]) {
      const room = rooms[roomId];
      const data = { roomId, strokes: room.whiteboard, version: room.whiteboardVersion };
      socket.emit('whiteboard-state', data);
      if (typeof callback === 'function') callback({ success: true, ...data });
    } else {
      if (typeof callback === 'function') callback({ success: false, error: 'Room not found' });
    }
  });

  // ----------------------------------------------------
  // EVENT: cursor-move
  // ----------------------------------------------------
  socket.on('cursor-move', (payload) => {
    const roomId = payload?.roomId || Array.from(socket.currentRooms)[0];
    if (roomId && rooms[roomId] && rooms[roomId].members.has(socket.id)) {
      const x = typeof payload?.x === 'number' ? payload.x : Number(payload?.x) || 0;
      const y = typeof payload?.y === 'number' ? payload.y : Number(payload?.y) || 0;
      socket.to(roomId).emit('cursor-moved', {
        userId: socket.id,
        sessionId: socket.sessionId || payload.sessionId,
        displayName: socket.displayName || payload.displayName || 'Anonymous',
        x,
        y,
        data: payload.data,
      });
    }
  });

  // ----------------------------------------------------
  // EVENT: presence-update
  // ----------------------------------------------------
  socket.on('presence-update', (payload) => {
    const roomId = payload?.roomId || Array.from(socket.currentRooms)[0];
    if (roomId && rooms[roomId] && socket.sessionId) {
      const room = rooms[roomId];
      if (room.presence[socket.sessionId]) {
        if (payload.displayName) {
          room.presence[socket.sessionId].displayName = String(payload.displayName).trim().slice(0, 30);
        }
        if (payload.customData) {
          room.presence[socket.sessionId].customData = payload.customData;
        }

        const activePresenceList = Object.values(room.presence);
        io.to(roomId).emit('presence-update', {
          roomId,
          presence: activePresenceList,
        });
      }
    }
  });

  // ----------------------------------------------------
  // EVENT: send-reaction
  // ----------------------------------------------------
  socket.on('send-reaction', (payload) => {
    const roomId = payload?.roomId || Array.from(socket.currentRooms)[0];
    if (roomId && rooms[roomId] && rooms[roomId].members.has(socket.id)) {
      const emoji = typeof payload?.emoji === 'string' ? payload.emoji.slice(0, 10) : '❤️';
      socket.to(roomId).emit('reaction-received', {
        userId: socket.id,
        sessionId: socket.sessionId || payload?.sessionId,
        displayName: socket.displayName || payload?.displayName || 'Anonymous',
        emoji,
        timestamp: Date.now(),
      });
    }
  });

  socket.on('error', (err) => {
    console.error(`[SyncKit Server] [Socket Error] Socket ${socket.id}:`, err);
  });

  // ----------------------------------------------------
  // EVENT: disconnect
  // ----------------------------------------------------
  socket.on('disconnect', (reason) => {
    totalConnections--;
    console.log(`[SyncKit Server] [Disconnected] Socket ID: ${socket.id} (Reason: ${reason}) | Remaining: ${totalConnections}`);

    io.emit('synckit:user-count', totalConnections);

    for (const roomId of socket.currentRooms) {
      const room = rooms[roomId];
      if (room) {
        room.members.delete(socket.id);

        if (socket.sessionId && room.presence[socket.sessionId]?.socketId === socket.id) {
          delete room.presence[socket.sessionId];
        }

        const activePresenceList = Object.values(room.presence);
        console.log(`[SyncKit Server] [Room Leave] Socket ${socket.id} left room "${roomId}" (Online: ${activePresenceList.length})`);

        io.to(roomId).emit('presence-update', {
          roomId,
          presence: activePresenceList,
        });
      }
    }
  });
});

// ==========================================
// 6. Start Listening & Initialize Database
// ==========================================
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    await db.init();
    server.listen(PORT, () => {
      console.log(`===============================================`);
      console.log(`🚀 SyncKit Server running at http://localhost:${PORT}`);
      console.log(`🩺 Health check:    http://localhost:${PORT}/health`);
      console.log(`🎮 Demo webpage:    http://localhost:${PORT}/demo`);
      console.log(`📦 Client library:  http://localhost:${PORT}/synckit/synckit.js`);
      console.log(`🗄️ Database driver: ${db.type} (${db.isReady ? 'Ready' : 'Pending'})`);
      console.log(`===============================================`);
    });
  } catch (err) {
    console.error('[SyncKit Server] Failed to initialize server:', err);
    process.exit(1);
  }
}

startServer();
