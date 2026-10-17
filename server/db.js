// server/db.js
// SyncKit Database Adapter
// Supports production PostgreSQL via DATABASE_URL (e.g. Render Postgres)
// and built-in Node.js SQLite (via node:sqlite) for zero-config local development and testing.

const fs = require('fs');
const path = require('path');

class DatabaseAdapter {
  constructor() {
    this.type = 'none'; // 'postgres' | 'sqlite'
    this.pgPool = null;
    this.sqliteDb = null;
    this.isReady = false;
    this.dataDir = path.join(__dirname, '..', 'data');
  }

  /**
   * Initialize database connection and run schema migrations
   */
  async init() {
    const databaseUrl = process.env.DATABASE_URL;

    if (databaseUrl && (databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://'))) {
      try {
        const { Pool } = require('pg');
        const isProduction = process.env.NODE_ENV === 'production' || databaseUrl.includes('render.com');

        this.pgPool = new Pool({
          connectionString: databaseUrl,
          ssl: isProduction ? { rejectUnauthorized: false } : false,
          max: 10,
          idleTimeoutMillis: 30000,
        });

        // Test connection
        const client = await this.pgPool.connect();
        client.release();
        this.type = 'postgres';
        console.log('[SyncKit DB] Connected to PostgreSQL database.');
      } catch (err) {
        console.warn(`[SyncKit DB] PostgreSQL connection failed (${err.message}). Falling back to local SQLite storage.`);
        this.type = 'sqlite';
      }
    } else {
      this.type = 'sqlite';
    }

    if (this.type === 'sqlite') {
      try {
        if (!fs.existsSync(this.dataDir)) {
          fs.mkdirSync(this.dataDir, { recursive: true });
        }
        const { DatabaseSync } = require('node:sqlite');
        const dbPath = path.join(this.dataDir, 'synckit.sqlite');
        this.sqliteDb = new DatabaseSync(dbPath);
        console.log(`[SyncKit DB] Using persistent local SQLite storage at: ${dbPath}`);
      } catch (err) {
        console.error('[SyncKit DB] Failed to initialize SQLite storage:', err);
        throw err;
      }
    }

    await this._runMigrations();
    this.isReady = true;
    return this;
  }

  /**
   * Run schema migrations for rooms, notes, and whiteboard
   */
  async _runMigrations() {
    if (this.type === 'postgres') {
      await this.pgPool.query(`
        CREATE TABLE IF NOT EXISTS synckit_rooms (
          room_id VARCHAR(100) PRIMARY KEY,
          created_at VARCHAR(50) NOT NULL,
          last_active VARCHAR(50) NOT NULL
        );

        CREATE TABLE IF NOT EXISTS synckit_notes (
          id VARCHAR(100) PRIMARY KEY,
          room_id VARCHAR(100) NOT NULL,
          title VARCHAR(200) NOT NULL DEFAULT '',
          content TEXT NOT NULL DEFAULT '',
          author_id VARCHAR(100) NOT NULL,
          author_name VARCHAR(100) NOT NULL,
          author_color VARCHAR(30) NOT NULL,
          permission VARCHAR(20) NOT NULL DEFAULT 'public',
          author_key VARCHAR(200) NOT NULL DEFAULT '',
          created_at VARCHAR(50) NOT NULL,
          updated_at VARCHAR(50) NOT NULL,
          updated_by VARCHAR(100) NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_notes_room_id ON synckit_notes(room_id);

        CREATE TABLE IF NOT EXISTS synckit_whiteboards (
          room_id VARCHAR(100) PRIMARY KEY,
          strokes TEXT NOT NULL DEFAULT '[]',
          version INT NOT NULL DEFAULT 1,
          last_updated VARCHAR(50) NOT NULL,
          updated_by VARCHAR(100) NOT NULL
        );
      `);
      console.log('[SyncKit DB] PostgreSQL schema migrations completed successfully.');
    } else if (this.type === 'sqlite') {
      this.sqliteDb.exec(`
        CREATE TABLE IF NOT EXISTS synckit_rooms (
          room_id TEXT PRIMARY KEY,
          created_at TEXT NOT NULL,
          last_active TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS synckit_notes (
          id TEXT PRIMARY KEY,
          room_id TEXT NOT NULL,
          title TEXT NOT NULL DEFAULT '',
          content TEXT NOT NULL DEFAULT '',
          author_id TEXT NOT NULL,
          author_name TEXT NOT NULL,
          author_color TEXT NOT NULL,
          permission TEXT NOT NULL DEFAULT 'public',
          author_key TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          updated_by TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_notes_room_id ON synckit_notes(room_id);

        CREATE TABLE IF NOT EXISTS synckit_whiteboards (
          room_id TEXT PRIMARY KEY,
          strokes TEXT NOT NULL DEFAULT '[]',
          version INTEGER NOT NULL DEFAULT 1,
          last_updated TEXT NOT NULL,
          updated_by TEXT NOT NULL
        );
      `);
      console.log('[SyncKit DB] SQLite schema migrations completed successfully.');
    }
  }

  // ==========================================
  // Room Operations
  // ==========================================

  async touchRoom(roomId) {
    const now = new Date().toISOString();
    if (this.type === 'postgres') {
      await this.pgPool.query(
        `INSERT INTO synckit_rooms (room_id, created_at, last_active)
         VALUES ($1, $2, $2)
         ON CONFLICT (room_id) DO UPDATE SET last_active = EXCLUDED.last_active`,
        [roomId, now]
      );
    } else if (this.type === 'sqlite') {
      const stmt = this.sqliteDb.prepare(
        `INSERT INTO synckit_rooms (room_id, created_at, last_active)
         VALUES (?, ?, ?)
         ON CONFLICT (room_id) DO UPDATE SET last_active = excluded.last_active`
      );
      stmt.run(roomId, now, now);
    }
  }

  // ==========================================
  // Notes Operations
  // ==========================================

  /**
   * Load all notes belonging to a specific room, sorted by createdAt asc
   * @param {string} roomId
   * @returns {Promise<Array>}
   */
  async getRoomNotes(roomId) {
    if (!roomId) return [];
    if (this.type === 'postgres') {
      const res = await this.pgPool.query(
        `SELECT id, room_id AS "roomId", title, content,
                author_id AS "authorId", author_name AS "authorName",
                author_color AS "authorColor", permission, author_key AS "authorKey",
                created_at AS "createdAt", updated_at AS "updatedAt", updated_by AS "updatedBy"
         FROM synckit_notes
         WHERE room_id = $1
         ORDER BY created_at ASC`,
        [roomId]
      );
      return res.rows;
    } else if (this.type === 'sqlite') {
      const stmt = this.sqliteDb.prepare(
        `SELECT id, room_id AS roomId, title, content,
                author_id AS authorId, author_name AS authorName,
                author_color AS authorColor, permission, author_key AS authorKey,
                created_at AS createdAt, updated_at AS updatedAt, updated_by AS updatedBy
         FROM synckit_notes
         WHERE room_id = ?
         ORDER BY created_at ASC`
      );
      return stmt.all(roomId);
    }
    return [];
  }

  /**
   * Save (insert or update) a single note
   * @param {Object} note
   * @returns {Promise<void>}
   */
  async saveNote(note) {
    if (!note || !note.id || !note.roomId) return;
    const now = new Date().toISOString();
    const title = String(note.title || '').slice(0, 200);
    const content = String(note.content || '').slice(0, 50000);
    const authorId = String(note.authorId || 'unknown');
    const authorName = String(note.authorName || 'Member').slice(0, 100);
    const authorColor = String(note.authorColor || '#ef4444');
    const permission = note.permission === 'private' ? 'private' : 'public';
    const authorKey = String(note.authorKey || '');
    const createdAt = note.createdAt || now;
    const updatedAt = note.updatedAt || now;
    const updatedBy = String(note.updatedBy || authorName).slice(0, 100);

    await this.touchRoom(note.roomId);

    if (this.type === 'postgres') {
      await this.pgPool.query(
        `INSERT INTO synckit_notes (
           id, room_id, title, content, author_id, author_name,
           author_color, permission, author_key, created_at, updated_at, updated_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title,
           content = EXCLUDED.content,
           permission = EXCLUDED.permission,
           updated_at = EXCLUDED.updated_at,
           updated_by = EXCLUDED.updated_by`,
        [
          note.id, note.roomId, title, content, authorId, authorName,
          authorColor, permission, authorKey, createdAt, updatedAt, updatedBy
        ]
      );
    } else if (this.type === 'sqlite') {
      const stmt = this.sqliteDb.prepare(
        `INSERT INTO synckit_notes (
           id, room_id, title, content, author_id, author_name,
           author_color, permission, author_key, created_at, updated_at, updated_by
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           title = excluded.title,
           content = excluded.content,
           permission = excluded.permission,
           updated_at = excluded.updated_at,
           updated_by = excluded.updated_by`
      );
      stmt.run(
        note.id, note.roomId, title, content, authorId, authorName,
        authorColor, permission, authorKey, createdAt, updatedAt, updatedBy
      );
    }
  }

  /**
   * Delete a note by ID and roomId
   * @param {string} noteId
   * @param {string} roomId
   */
  async deleteNote(noteId, roomId) {
    if (!noteId || !roomId) return;
    if (this.type === 'postgres') {
      await this.pgPool.query(
        `DELETE FROM synckit_notes WHERE id = $1 AND room_id = $2`,
        [noteId, roomId]
      );
    } else if (this.type === 'sqlite') {
      const stmt = this.sqliteDb.prepare(
        `DELETE FROM synckit_notes WHERE id = ? AND room_id = ?`
      );
      stmt.run(noteId, roomId);
    }
  }

  // ==========================================
  // Whiteboard Operations
  // ==========================================

  /**
   * Retrieve whiteboard strokes and metadata for a room
   * @param {string} roomId
   * @returns {Promise<{ strokes: Array, version: number }>}
   */
  async getWhiteboard(roomId) {
    if (!roomId) return { strokes: [], version: 1 };
    let row = null;
    if (this.type === 'postgres') {
      const res = await this.pgPool.query(
        `SELECT strokes, version, last_updated AS "lastUpdated", updated_by AS "updatedBy"
         FROM synckit_whiteboards
         WHERE room_id = $1`,
        [roomId]
      );
      row = res.rows[0];
    } else if (this.type === 'sqlite') {
      const stmt = this.sqliteDb.prepare(
        `SELECT strokes, version, last_updated AS lastUpdated, updated_by AS updatedBy
         FROM synckit_whiteboards
         WHERE room_id = ?`
      );
      row = stmt.get(roomId);
    }

    if (!row) {
      return { strokes: [], version: 1 };
    }

    try {
      const strokes = typeof row.strokes === 'string' ? JSON.parse(row.strokes) : (row.strokes || []);
      return { strokes: Array.isArray(strokes) ? strokes : [], version: row.version || 1 };
    } catch (e) {
      return { strokes: [], version: row.version || 1 };
    }
  }

  /**
   * Save whiteboard strokes for a room
   * @param {string} roomId
   * @param {Array} strokes
   * @param {number} version
   * @param {string} updatedBy
   */
  async saveWhiteboard(roomId, strokes, version = 1, updatedBy = 'system') {
    if (!roomId) return;
    const now = new Date().toISOString();
    const serializedStrokes = JSON.stringify(Array.isArray(strokes) ? strokes.slice(-1000) : []);

    await this.touchRoom(roomId);

    if (this.type === 'postgres') {
      await this.pgPool.query(
        `INSERT INTO synckit_whiteboards (room_id, strokes, version, last_updated, updated_by)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (room_id) DO UPDATE SET
           strokes = EXCLUDED.strokes,
           version = EXCLUDED.version,
           last_updated = EXCLUDED.last_updated,
           updated_by = EXCLUDED.updated_by`,
        [roomId, serializedStrokes, version, now, updatedBy]
      );
    } else if (this.type === 'sqlite') {
      const stmt = this.sqliteDb.prepare(
        `INSERT INTO synckit_whiteboards (room_id, strokes, version, last_updated, updated_by)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (room_id) DO UPDATE SET
           strokes = excluded.strokes,
           version = excluded.version,
           last_updated = excluded.last_updated,
           updated_by = excluded.updated_by`
      );
      stmt.run(roomId, serializedStrokes, version, now, updatedBy);
    }
  }

  /**
   * Close connections cleanly
   */
  async close() {
    if (this.pgPool) {
      await this.pgPool.end();
      this.pgPool = null;
    }
    if (this.sqliteDb) {
      this.sqliteDb.close();
      this.sqliteDb = null;
    }
    this.isReady = false;
  }
}

// Export singleton instance and class
const db = new DatabaseAdapter();
module.exports = db;
module.exports.DatabaseAdapter = DatabaseAdapter;
