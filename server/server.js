// server/server.js
// SyncKit Real-Time Server
// Authoritative server for room-based real-time multiplayer applications

const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const db = require('./database');

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
// Serve the static files from the client folder (reusable library and demo)
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

// Stored Room Discussions API from SQLite database
app.get('/api/rooms/:roomId/discussions', (req, res) => {
  const roomId = req.params.roomId;
  const discussions = db.getDiscussions(roomId);
  res.status(200).json({ success: true, roomId, discussions });
});


// ==========================================
// 4. Authoritative In-Memory Room State Store
// ==========================================
// The server is the single authoritative source of truth.
// Each room has its own isolated state.
// Structure:
// rooms[roomId] = {
//   id: string,
//   createdAt: string,
//   members: Set<socketId>,
//   state: {
//     count: number,
//     text: string,
//     version: number,
//     lastUpdated: string,
//     lastUpdatedBy: string
//   }
// }
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
 * Clients cannot directly overwrite server memory without strict checks.
 *
 * @param {*} updates Candidate updates from client
 * @returns {{ valid: boolean, error?: string, sanitized?: object }}
 */
function validateStateUpdates(updates) {
  // 1. Must be a non-null, non-array JavaScript object
  if (typeof updates !== 'object' || updates === null || Array.isArray(updates)) {
    return { valid: false, error: 'State updates must be a non-null key-value object.' };
  }

  const keys = Object.keys(updates);
  if (keys.length === 0) {
    return { valid: false, error: 'State update object cannot be empty.' };
  }

  const sanitized = {};

  for (const key of keys) {
    // 2. Reject forbidden or dangerous property names
    if (FORBIDDEN_KEYS.has(key)) {
      return { valid: false, error: `Modifying protected key "${key}" is forbidden.` };
    }

    const value = updates[key];

    // 3. Reject functions or undefined
    if (typeof value === 'function' || typeof value === 'undefined') {
      return { valid: false, error: `Invalid value type for key "${key}". Functions and undefined are not allowed.` };
    }

    // 4. Validate strings (prevent oversized payloads)
    if (typeof value === 'string') {
      if (value.length > 20000) {
        return { valid: false, error: `String for key "${key}" exceeds max length of 20000 characters.` };
      }
      sanitized[key] = value;
      continue;
    }

    // 5. Validate numbers
    if (typeof value === 'number') {
      if (isNaN(value) || !isFinite(value)) {
        return { valid: false, error: `Number for key "${key}" must be a valid finite number.` };
      }
      sanitized[key] = value;
      continue;
    }

    // 6. Validate booleans
    if (typeof value === 'boolean') {
      sanitized[key] = value;
      continue;
    }

    // 7. Validate plain nested objects
    if (typeof value === 'object' && value !== null) {
      if (Array.isArray(value)) {
        if (value.length > 100) {
          return { valid: false, error: `Array for key "${key}" exceeds limit of 100 items.` };
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
 * Returns { room, isNew } to detect if server state was recreated (e.g. after restart).
 */
function getOrCreateRoom(roomId) {
  let isNew = false;
  if (!rooms[roomId]) {
    rooms[roomId] = {
      id: roomId,
      createdAt: new Date().toISOString(),
      members: new Set(),
      presence: {}, // Map of socketId -> presence object (Deduplicated presence)
      // Initial authoritative state for this room
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


// ==========================================
// 5. Socket.IO Connection & Event Handlers
// ==========================================
let totalConnections = 0;

io.on('connection', (socket) => {
  totalConnections++;
  console.log(`[SyncKit Server] [Connected] Socket ID: ${socket.id} | Total Connected: ${totalConnections}`);

  // Track rooms this socket belongs to
  socket.currentRooms = new Set();

  // Send global user count update
  io.emit('synckit:user-count', totalConnections);

  // ----------------------------------------------------
  // EVENT: join-room
  // Clients join a room and receive authoritative state & presence (Requirement 1, 2, 3, 4)
  // ----------------------------------------------------
  socket.on('join-room', (payload, callback) => {
    try {
      const roomId = typeof payload === 'string' ? payload.trim() : payload?.roomId?.trim();

      if (!roomId) {
        const errorMsg = 'Invalid room ID. Please provide a non-empty room name.';
        console.warn(`[SyncKit Server] [Validation Error] Socket ${socket.id} attempted to join empty room.`);
        socket.emit('synckit:error', { code: 'INVALID_ROOM', message: errorMsg });
        if (typeof callback === 'function') callback({ success: false, error: errorMsg });
        return;
      }

      // 1. Session Identifier & Display Name (Requirement 1 & 2)
      const sessionId = payload?.sessionId ? String(payload.sessionId).trim() : `sess_${socket.id}`;
      const displayName = payload?.displayName ? String(payload.displayName).trim().slice(0, 30) : `User-${sessionId.slice(-4)}`;
      socket.sessionId = sessionId;
      socket.displayName = displayName;

      // 2. Get or create the room (server authoritative store)
      const { room, isNew } = getOrCreateRoom(roomId);

      // 3. Add socket to Socket.IO channel and track membership
      socket.join(roomId);
      room.members.add(socket.id);
      socket.currentRooms.add(roomId);

      // 4. Update room active presence (keyed by sessionId to prevent duplicates - Requirement 6)
      room.presence[sessionId] = {
        sessionId,
        socketId: socket.id,
        displayName,
        joinedAt: room.presence[sessionId]?.joinedAt || new Date().toISOString(),
      };

      const activePresenceList = Object.values(room.presence);
      console.log(`[SyncKit Server] [Room Join] ${displayName} (${sessionId}) joined "${roomId}" (Online: ${activePresenceList.length})`);

      // 5. Retrieve discussions and whiteboard strokes from SQLite database for this room
      const discussions = db.getDiscussions(roomId);
      const whiteboardStrokes = db.getWhiteboardStrokes(roomId);

      // Send current authoritative room state & active presence to joining client
      socket.emit('room-joined', {
        roomId: room.id,
        state: room.state,
        membersCount: activePresenceList.length,
        presence: activePresenceList,
        sessionId,
        isNewRoom: isNew, // Requirement 10
        discussions,
        whiteboardStrokes,
      });

      // 6. Broadcast updated presence to all clients in the room (Requirement 4)
      io.to(roomId).emit('presence-update', {
        roomId: room.id,
        presence: activePresenceList,
      });

      if (typeof callback === 'function') {
        callback({
          success: true,
          roomId,
          state: room.state,
          sessionId,
          presence: activePresenceList,
          isNewRoom: isNew,
          discussions,
          whiteboardStrokes,
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
  // Clients can request the current authoritative state (Rule 3)
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

      // Verify the client is a member of this room
      if (!room.members.has(socket.id)) {
        const errorMsg = `You must join room "${roomId}" before requesting its state.`;
        socket.emit('synckit:error', { code: 'UNAUTHORIZED_ROOM_ACCESS', message: errorMsg });
        if (typeof callback === 'function') callback({ success: false, error: errorMsg });
        return;
      }

      // Return state to requesting client
      socket.emit('room-state', { roomId: room.id, state: room.state });
      if (typeof callback === 'function') {
        callback({ success: true, roomId: room.id, state: room.state });
      }
    } catch (err) {
      console.error(`[SyncKit Server] [Error] Failed to get state for ${socket.id}:`, err);
      if (typeof callback === 'function') callback({ success: false, error: err.message });
    }
  });

  // ----------------------------------------------------
  // EVENT: update-state
  // Clients request a state update; server validates, applies, and broadcasts (Rules 4, 5, 6, 7, 9, 10)
  // ----------------------------------------------------
  socket.on('update-state', (payload, callback) => {
    try {
      const roomId = payload?.roomId?.trim();
      const updates = payload?.updates;

      // 1. Validate room existence
      if (!roomId || !rooms[roomId]) {
        const errorMsg = `Room "${roomId}" does not exist.`;
        socket.emit('synckit:error', { code: 'ROOM_NOT_FOUND', message: errorMsg });
        if (typeof callback === 'function') callback({ success: false, error: errorMsg });
        return;
      }

      const room = rooms[roomId];

      // 2. Validate that sender is an active member of this room (Rule 7: Isolation & Security)
      if (!room.members.has(socket.id)) {
        const errorMsg = `Cannot update state: You are not a member of room "${roomId}".`;
        console.warn(`[SyncKit Server] [Security Warning] Socket ${socket.id} attempted to update room "${roomId}" without joining.`);
        socket.emit('synckit:error', { code: 'NOT_IN_ROOM', message: errorMsg });
        if (typeof callback === 'function') callback({ success: false, error: errorMsg });
        return;
      }

      // 3. Validate updates against injection and type errors (Rule 5 & Rule 9)
      const validation = validateStateUpdates(updates);
      if (!validation.valid) {
        console.warn(`[SyncKit Server] [Validation Rejected] Socket ${socket.id} sent invalid update: ${validation.error}`);
        socket.emit('synckit:error', { code: 'INVALID_STATE_UPDATE', message: validation.error });
        if (typeof callback === 'function') callback({ success: false, error: validation.error });
        return;
      }

      // 4. Update the authoritative state on the server (Rule 2)
      // Merge safe sanitized updates into room.state
      Object.assign(room.state, validation.sanitized);

      // Increment authoritative state version and update metadata
      room.state.version += 1;
      room.state.lastUpdated = new Date().toISOString();
      room.state.lastUpdatedBy = socket.id;

      console.log(`[SyncKit Server] [State Updated] Room "${roomId}" v${room.state.version} updated by ${socket.id}:`, validation.sanitized);

      // 5. Broadcast new state to ALL clients in this specific room (Rule 6 & Rule 7)
      io.to(roomId).emit('state-updated', {
        roomId: room.id,
        state: room.state,
        updatedBy: socket.id,
        version: room.state.version,
      });

      // 6. Acknowledge the sender if callback provided
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
  // EVENT: cursor-move
  // Relays real-time cursor coordinates only to other members in the room (Requirement 3 & 6)
  // ----------------------------------------------------
  socket.on('cursor-move', (payload) => {
    const roomId = payload?.roomId || Array.from(socket.currentRooms)[0];
    if (roomId && rooms[roomId] && rooms[roomId].members.has(socket.id)) {
      const x = typeof payload?.x === 'number' ? payload.x : Number(payload?.x) || 0;
      const y = typeof payload?.y === 'number' ? payload.y : Number(payload?.y) || 0;
      // Broadcast ONLY to other clients in this specific room (never echo back to sender)
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
  // Allows a client to update their display name or status (Requirement 2 & 4)
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
  // Broadcasts ephemeral reaction to other members in the room (Requirement 4)
  // ----------------------------------------------------
  socket.on('send-reaction', (payload) => {
    const roomId = payload?.roomId || Array.from(socket.currentRooms)[0];
    if (roomId && rooms[roomId] && rooms[roomId].members.has(socket.id)) {
      const emoji = typeof payload?.emoji === 'string' ? payload.emoji.slice(0, 10) : '❤️';
      // Broadcast strictly to other clients in this specific room (never echo back to sender)
      socket.to(roomId).emit('reaction-received', {
        userId: socket.id,
        sessionId: socket.sessionId || payload?.sessionId,
        displayName: socket.displayName || payload?.displayName || 'Anonymous',
        emoji,
        timestamp: Date.now(),
      });
    }
  });

  // ----------------------------------------------------
  // EVENT: send-discussion
  // Saves discussion to SQLite database and broadcasts to room members
  // ----------------------------------------------------
  socket.on('send-discussion', (payload, callback) => {
    try {
      const roomId = payload?.roomId || Array.from(socket.currentRooms)[0];
      const message = String(payload?.message || '').trim().slice(0, 5000);

      if (!roomId || !message) {
        if (typeof callback === 'function') callback({ success: false, error: 'Empty message or invalid room' });
        return;
      }

      const savedDiscussion = db.addDiscussion({
        roomId,
        sessionId: socket.sessionId || payload?.sessionId || socket.id,
        authorName: socket.displayName || payload?.authorName || 'Anonymous',
        authorColor: payload?.authorColor || '#ef4444',
        message,
      });

      console.log(`[SyncKit Database] [Discussion Saved] Room "${roomId}" by ${savedDiscussion.authorName}: "${message.slice(0, 30)}..."`);

      // Broadcast to ALL sockets in this room (including sender for acknowledgment)
      io.to(roomId).emit('new-discussion', {
        roomId,
        discussion: savedDiscussion,
      });

      if (typeof callback === 'function') {
        callback({ success: true, roomId, discussion: savedDiscussion });
      }
    } catch (err) {
      console.error(`[SyncKit Server] [Error] Failed saving discussion message:`, err);
      if (typeof callback === 'function') callback({ success: false, error: err.message });
    }
  });

  // ----------------------------------------------------
  // EVENT: get-discussions
  // Retrieves stored discussions from SQLite database for room
  // ----------------------------------------------------
  socket.on('get-discussions', (payload, callback) => {
    try {
      const roomId = typeof payload === 'string' ? payload.trim() : payload?.roomId?.trim();
      if (!roomId) {
        if (typeof callback === 'function') callback({ success: false, error: 'Invalid room' });
        return;
      }
      const discussions = db.getDiscussions(roomId);
      if (typeof callback === 'function') {
        callback({ success: true, roomId, discussions });
      }
    } catch (err) {
      console.error(`[SyncKit Server] [Error] Failed getting discussions:`, err);
      if (typeof callback === 'function') callback({ success: false, error: err.message });
    }
  });

  // ----------------------------------------------------
  // EVENT: draw-stroke
  // Broadcasts interactive whiteboard drawing stroke and saves to database
  // ----------------------------------------------------
  socket.on('draw-stroke', (payload) => {
    const roomId = payload?.roomId || Array.from(socket.currentRooms)[0];
    if (roomId && rooms[roomId] && rooms[roomId].members.has(socket.id)) {
      db.addWhiteboardStroke(roomId, payload);
      // Relay strictly to other clients in this specific room
      socket.to(roomId).emit('draw-stroke', payload);
    }
  });

  // ----------------------------------------------------
  // EVENT: clear-whiteboard
  // Clears whiteboard canvas drawing history from database and notifies room
  // ----------------------------------------------------
  socket.on('clear-whiteboard', (payload) => {
    const roomId = payload?.roomId || Array.from(socket.currentRooms)[0];
    if (roomId && rooms[roomId] && rooms[roomId].members.has(socket.id)) {
      db.clearWhiteboardStrokes(roomId);
      io.to(roomId).emit('whiteboard-cleared', { roomId });
    }
  });

  // ----------------------------------------------------
  // Socket-level error handling (Rule 10)
  // ----------------------------------------------------
  socket.on('error', (err) => {
    console.error(`[SyncKit Server] [Socket Error] Socket ${socket.id}:`, err);
  });

  // ----------------------------------------------------
  // EVENT: disconnect
  // Graceful cleanup of room memberships and presence (Requirement 5 & 7)
  // ----------------------------------------------------
  socket.on('disconnect', (reason) => {
    totalConnections--;
    console.log(`[SyncKit Server] [Disconnected] Socket ID: ${socket.id} (Reason: ${reason}) | Remaining: ${totalConnections}`);

    io.emit('synckit:user-count', totalConnections);

    // Clean up room memberships and presence (Requirement 5 & 7)
    for (const roomId of socket.currentRooms) {
      const room = rooms[roomId];
      if (room) {
        room.members.delete(socket.id);

        // Remove from active presence immediately if this socket owned the session
        if (socket.sessionId && room.presence[socket.sessionId]?.socketId === socket.id) {
          delete room.presence[socket.sessionId];
        }

        const activePresenceList = Object.values(room.presence);
        console.log(`[SyncKit Server] [Room Leave] Socket ${socket.id} left room "${roomId}" (Online: ${activePresenceList.length})`);

        // Broadcast updated presence list to everyone remaining in the room
        io.to(roomId).emit('presence-update', {
          roomId,
          presence: activePresenceList,
        });
      }
    }
  });
});

// ==========================================
// 6. Start Listening
// ==========================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🚀 SyncKit Server running at http://localhost:${PORT}`);
  console.log(`🩺 Health check:    http://localhost:${PORT}/health`);
  console.log(`🎮 Demo webpage:    http://localhost:${PORT}/demo`);
  console.log(`📦 Client library:  http://localhost:${PORT}/synckit/synckit.js`);
  console.log(`===============================================`);
});
