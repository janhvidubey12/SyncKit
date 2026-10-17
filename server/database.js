// server/database.js
// Persistent SQLite Database for SyncKit Room Discussions & Whiteboard
// Uses Node.js built-in node:sqlite (DatabaseSync) with zero external dependencies.

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'synckit.db');
let db = null;

try {
  db = new DatabaseSync(dbPath);
  console.log(`[SyncKit Database] SQLite database initialized at ${dbPath}`);

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS discussions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      author_name TEXT NOT NULL,
      author_color TEXT,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_discussions_room ON discussions(room_id, id ASC);

    CREATE TABLE IF NOT EXISTS whiteboard_strokes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT NOT NULL,
      stroke_data TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_whiteboard_room ON whiteboard_strokes(room_id);
  `);
} catch (err) {
  console.error('[SyncKit Database] Error initializing SQLite database:', err);
}

/**
 * Get all discussions for a specific room ordered chronologically
 * @param {string} roomId
 * @param {number} [limit=150]
 * @returns {Array<Object>}
 */
function getDiscussions(roomId, limit = 150) {
  if (!db || !roomId) return [];
  try {
    const stmt = db.prepare(`
      SELECT id, room_id, session_id, author_name, author_color, message, created_at
      FROM discussions
      WHERE room_id = ?
      ORDER BY id ASC
      LIMIT ?
    `);
    const rows = stmt.all(String(roomId).trim(), limit);
    return rows.map((r) => ({
      id: r.id,
      roomId: r.room_id,
      sessionId: r.session_id,
      authorName: r.author_name,
      authorColor: r.author_color || '#ef4444',
      message: r.message,
      createdAt: r.created_at,
    }));
  } catch (err) {
    console.error(`[SyncKit Database] Error fetching discussions for ${roomId}:`, err);
    return [];
  }
}

/**
 * Save a new discussion message for a specific room
 * @param {Object} discussion
 * @param {string} discussion.roomId
 * @param {string} discussion.sessionId
 * @param {string} discussion.authorName
 * @param {string} [discussion.authorColor]
 * @param {string} discussion.message
 * @returns {Object} Saved discussion with ID and timestamp
 */
function addDiscussion({ roomId, sessionId, authorName, authorColor, message }) {
  if (!db) {
    throw new Error('Database is not available');
  }

  const cleanRoomId = String(roomId || 'room-1').trim();
  const cleanSessionId = String(sessionId || 'sess_anonymous').trim();
  const cleanAuthorName = String(authorName || 'Anonymous').trim().slice(0, 40);
  const cleanAuthorColor = String(authorColor || '#ef4444').trim();
  const cleanMessage = String(message || '').trim().slice(0, 5000);
  const createdAt = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO discussions (room_id, session_id, author_name, author_color, message, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    cleanRoomId,
    cleanSessionId,
    cleanAuthorName,
    cleanAuthorColor,
    cleanMessage,
    createdAt
  );

  return {
    id: Number(result.lastInsertRowid),
    roomId: cleanRoomId,
    sessionId: cleanSessionId,
    authorName: cleanAuthorName,
    authorColor: cleanAuthorColor,
    message: cleanMessage,
    createdAt,
  };
}

/**
 * Get whiteboard strokes for a specific room
 * @param {string} roomId
 * @returns {Array<Object>}
 */
function getWhiteboardStrokes(roomId) {
  if (!db || !roomId) return [];
  try {
    const stmt = db.prepare(`
      SELECT id, stroke_data, created_at
      FROM whiteboard_strokes
      WHERE room_id = ?
      ORDER BY id ASC
    `);
    const rows = stmt.all(String(roomId).trim());
    return rows.map((r) => {
      try {
        return JSON.parse(r.stroke_data);
      } catch (e) {
        return null;
      }
    }).filter(Boolean);
  } catch (err) {
    console.error(`[SyncKit Database] Error fetching whiteboard strokes:`, err);
    return [];
  }
}

/**
 * Add a stroke to the whiteboard database for a room
 * @param {string} roomId
 * @param {Object} strokeData
 */
function addWhiteboardStroke(roomId, strokeData) {
  if (!db || !roomId || !strokeData) return;
  try {
    const stmt = db.prepare(`
      INSERT INTO whiteboard_strokes (room_id, stroke_data, created_at)
      VALUES (?, ?, ?)
    `);
    stmt.run(String(roomId).trim(), JSON.stringify(strokeData), new Date().toISOString());
  } catch (err) {
    console.error(`[SyncKit Database] Error saving whiteboard stroke:`, err);
  }
}

/**
 * Clear all whiteboard strokes for a room
 * @param {string} roomId
 */
function clearWhiteboardStrokes(roomId) {
  if (!db || !roomId) return;
  try {
    const stmt = db.prepare(`DELETE FROM whiteboard_strokes WHERE room_id = ?`);
    stmt.run(String(roomId).trim());
  } catch (err) {
    console.error(`[SyncKit Database] Error clearing whiteboard strokes:`, err);
  }
}

module.exports = {
  getDiscussions,
  addDiscussion,
  getWhiteboardStrokes,
  addWhiteboardStroke,
  clearWhiteboardStrokes,
};
