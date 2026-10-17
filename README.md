# ⚡ SyncKit

A lightweight, reusable JavaScript library and real-time server to make webpages multiplayer. Built with **HTML**, **CSS**, **JavaScript**, **Node.js**, **Socket.IO**, and **PostgreSQL / SQLite**.

SyncKit features an executive **Black and Red** collaborative workspace with a real-time **Collaborative Whiteboard**, **Wide Multi-Member Room Notes with Granular Permissions**, **Multiplayer Live Reactions**, **Persistent Database Storage**, **Shareable Invite Links**, and **Live Remote Cursors**.

---

## 📂 Project Structure

```text
codec/
├── client/
│   ├── demo/
│   │   ├── index.html            # Premium collaborative workspace demo
│   │   ├── style.css             # Black & Red competition-ready theme
│   │   └── demo.js               # Demo UI logic consuming SyncKit client API
│   ├── synckit/
│   │   └── synckit.js            # Reusable SyncKit client library
│   └── minimal-example.html      # Minimal standalone usage example (~25 lines)
├── server/
│   ├── server.js                 # Node.js + Express + Socket.IO real-time server
│   └── db.js                     # PostgreSQL & Node.js SQLite persistence adapter
├── test-state.js                 # Shared state validation & room isolation tests
├── test-reconnection.js          # Disconnect & state recovery test
├── test-three-tabs-recovery.js   # 3-tab concurrent reconnection & recovery test
├── test-presence-three-tabs.js   # 3-tab presence tracking & deduplication test
├── test-cursor-three-tabs.js     # Live cursor throttling & isolation test
├── test-notes-and-invite.js      # Multi-member shared notes, invite & isolation tests
├── test-reactions.js             # Real-time ephemeral reactions & room isolation tests
├── test-whiteboard-and-db.js     # Whiteboard sync, note permissions & DB persistence test
├── .gitignore                    # Ignores node_modules, local data, and log files
├── package.json                  # Project metadata, dependencies, and test scripts
└── README.md                     # Documentation, setup, and deployment guide
```

---

## 🎨 New Features & Workspace Architecture

### 1. 🎨 Collaborative Whiteboard
- **Multi-user Freehand Drawing**: Draw smoothly with mouse or touchscreens with round caps and joins.
- **Tools**: Toggle easily between **Pen** and **Eraser** (`#08080c` matching board background).
- **Color Palette**: 7 vibrant colors (White `#f8fafc`, Red `#ef4444`, Crimson `#dc2626`, Amber Yellow `#fbbf24`, Emerald Green `#10b981`, Sky Blue `#38bdf8`, Violet Purple `#a855f7`).
- **Adjustable Thickness**: 2px (Fine), 5px (Medium), 10px (Thick), and 20px (Marker).
- **Synchronized Drawing**: Strokes and erasures broadcast across members in the same room in real time.
- **Reliable Undo**: Undo removes the last stroke created by the user and updates all room members.
- **Clear Board Confirmation**: Clear board action includes a confirmation step (`confirm()`) to avoid accidental wipes.
- **Room Isolation**: Whiteboard data is strictly partitioned per room.

### 2. 📝 Wide Multi-Member Room Notes
- **Spacious Rectangular Cards**: Wide rectangular note cards displaying note titles, author name, color avatar, timestamp, and formatted content.
- **Side-by-Side Workspace**: Room notes sit comfortably beside the collaborative whiteboard on desktop, stacking smoothly on mobile viewports.
- **Inline Editing**: Double-click or click "Edit" to modify note titles and contents without page reloads.

### 3. 🛡️ Note-Editing Permissions
Each room note supports two author-controlled permission modes:
1. `🌐 Anyone in this room can edit` (**Public**): All connected members in the same room can edit the note's title and content.
2. `🔒 Only I can edit` (**Private**): All members can read the note, but only the original author can modify its content or title.
- **Author Retention**: In either mode, **only the author** can delete the note or change its permission setting.
- **Server-Side Enforcement**: Permissions are validated authoritatively on the server. Unauthorized edits and deletion attempts are rejected with error messages.

### 4. ⚡ Live Ephemeral Room Reactions
- Clickable emoji reactions:
  - ❤️ Love
  - 🔥 Fire
  - 😂 Laugh
  - 👍 Like
  - 🎉 Celebrate
  - ⚡ Wow
- **Floating Pop-up Animation**: Clicking a reaction spawns a floating bubble that pops up, floats upward, and fades away after ~1 second.
- **Multiplayer Synchronized**: All room members see reactions pop up live with the sender's name tag.

### 5. 💾 Database Persistence (PostgreSQL & SQLite)
- **Production PostgreSQL**: When `DATABASE_URL` is set, SyncKit connects to PostgreSQL, runs automatic migrations, and stores notes, rooms, and whiteboard data permanently.
- **Built-in SQLite Fallback**: When `DATABASE_URL` is not set (e.g. local development or offline hackathons), SyncKit seamlessly uses Node.js 24's built-in `node:sqlite` (`data/synckit.sqlite`).
- **Debounced Save Strategy**: Fast user typing and drawing strokes are debounced (~300–400ms) to disk/DB to prevent I/O bottlenecks while maintaining sub-millisecond multiplayer broadcasts.
- **Persistence Across Restarts**: Whiteboard drawings and room notes survive browser reloads, page refreshes, and server restarts.

### 6. 🔄 Automatic 7-Second Background Sync
- Operates over real-time WebSockets for instant updates.
- In the background every 7 seconds, a lightweight version check verifies that local state matches the authoritative server.
- Protects user input: if a user is actively typing in a note or drawing on the whiteboard, local uncommitted input is never overwritten.
- Automatically cleans up intervals when the page is closed or rooms change.

---

## 🛠️ SyncKit Public API Reference

```javascript
// 1. Initialize
const sync = new SyncKit({ autoConnect: true });

// 2. Join a Room
sync.joinRoom('design-sprint', (res) => {
  console.log('Joined room:', res.roomId, 'State:', res.state);
});

// 3. Multi-Member Shared Notes & Permissions
// Create note with permission ('public' or 'private')
sync.createNote({
  title: 'Architecture Blueprint',
  content: 'PostgreSQL database connected with Socket.IO.',
  permission: 'public',
});

// Edit note (server enforces author permissions)
sync.editNote(noteId, { title: 'Updated Title', content: 'New content' });

// Change permission (author only)
sync.setNotePermission(noteId, 'private');

// Delete note (author only)
sync.deleteNote(noteId);

// 4. Collaborative Whiteboard API
sync.sendWhiteboardStroke({
  id: 'stroke_1',
  points: [{ x: 10, y: 10 }, { x: 20, y: 30 }],
  color: '#ef4444',
  size: 5,
  isEraser: false,
});

sync.onWhiteboardStroke(({ stroke }) => {
  console.log('Remote stroke received:', stroke);
});

sync.undoWhiteboard();
sync.clearWhiteboard();

// 5. Ephemeral Reactions
sync.sendReaction('🔥');
sync.onReaction(({ emoji, displayName }) => {
  console.log(`${displayName} reacted with ${emoji}`);
});

// 6. Presence & Live Cursors
sync.sendCursor({ x: 250, y: 400 });
sync.onCursorMove(({ userId, displayName, x, y, color }) => { ... });
sync.setDisplayName('Alice');
sync.onPresenceChange((activeUsersList) => { ... });
```

---

## 💻 Minimal Standalone Example

Here is how any webpage can use SyncKit with minimal code:

```html
<!DOCTYPE html>
<html>
<head>
  <title>Minimal SyncKit</title>
</head>
<body>
  <h1>Room: <span id="room-name">...</span></h1>
  <button id="react-btn">🔥 React</button>

  <script src="/socket.io/socket.io.js"></script>
  <script src="/synckit/synckit.js"></script>
  <script>
    const sync = new SyncKit();
    sync.joinRoom('alpha-team', (res) => {
      document.getElementById('room-name').textContent = res.roomId;
    });

    document.getElementById('react-btn').addEventListener('click', () => {
      sync.sendReaction('🔥');
    });

    sync.onReaction(({ emoji, displayName }) => {
      alert(`${displayName} reacted with ${emoji}`);
    });
  </script>
</body>
</html>
```

---

## ⚙️ Environment Variables

| Variable | Description | Default |
| :--- | :--- | :--- |
| `PORT` | HTTP/WebSocket listening port | `3000` |
| `DATABASE_URL` | PostgreSQL connection string (e.g. on Render) | *None* (falls back to local SQLite) |
| `NODE_ENV` | Application environment (`development` / `production`) | `development` |

---

## 🚀 Local Setup & Running Instructions

### 1. Install Dependencies
```powershell
npm install
```

### 2. Start Server
```powershell
npm start
```
*The server automatically boots with persistent SQLite storage in `./data/synckit.sqlite` if `DATABASE_URL` is not provided.*

### 3. Open in Browser
* **Workspace Demo:** [http://localhost:3000/demo](http://localhost:3000/demo)
* **Direct Room URL:** [http://localhost:3000/room/hackathon-collab](http://localhost:3000/room/hackathon-collab)
* **Server Health:** [http://localhost:3000/health](http://localhost:3000/health)

---

## 🧪 Automated Test Suites

SyncKit includes 8 comprehensive automated test suites:

```powershell
# 1. Whiteboard Drawing, Undo, Clear, Permissions & DB Persistence
npm run test:whiteboard

# 2. Multi-Member Shared Notes, Invite Links & Isolation
npm run test:notes

# 3. Real-Time Ephemeral Reactions & Room Isolation
npm run test:reactions

# 4. Authoritative State & Validation
npm test

# 5. Actual Socket Disconnect & State Recovery
npm run test:reconnect

# 6. 3-Tab Concurrent Disconnect & Recovery
npm run test:3tabs

# 7. 3-Tab Room Presence & Deduplication
npm run test:presence

# 8. Live Cursor Sharing & Throttling
npm run test:cursor
```

---

## ☁️ Deploying on Render

### Step 1: Create a PostgreSQL Database on Render (Optional but Recommended)
1. In the Render Dashboard, click **New +** → **PostgreSQL**.
2. Give it a name (e.g. `synckit-db`).
3. After creation, copy the **Internal Database URL** (or External Database URL).

### Step 2: Deploy SyncKit as a Web Service
1. Click **New +** → **Web Service** and connect your GitHub repository:
   `https://github.com/janhvidubey12/SyncKit`
2. Configure settings:
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
3. Under **Environment Variables**:
   - `DATABASE_URL`: Paste the PostgreSQL connection URL from Step 1.
   - `NODE_ENV`: `production`
4. Click **Deploy Web Service**.
5. Once deployed, verify health at `https://<your-service>.onrender.com/health`.
   The response will show:
   ```json
   {
     "status": "ok",
     "database": "postgres",
     "databaseReady": true
   }
   ```
*(Note: If no PostgreSQL database is attached, SyncKit will automatically run with persistent local SQLite storage).*

---

## 🔒 Security & Identity Model

- **Author Ownership**: SyncKit generates a device-stable cryptographic author key (`authorKey`) stored in `localStorage`.
- **Permission Enforcement**: When a note is set to `"Only I can edit"`, the server compares the incoming `authorKey` against the stored author token. Unmatched edit or delete requests are rejected server-side with `UNAUTHORIZED_NOTE_EDIT` or `UNAUTHORIZED_NOTE_DELETE`.
- **Public Note Protection**: Even for notes set to `"Anyone in this room can edit"`, note deletion is strictly reserved for the author.
- **Architectural Transparency**: In this lightweight hackathon architecture, author keys are managed client-side without requiring mandatory email registration or passwords, ensuring frictionless collaboration while preventing client display name spoofing.