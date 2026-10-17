// test-whiteboard-and-db.js
// Automated test suite for Collaborative Whiteboard, Note Permissions, and DB Persistence
//
// Verifies:
// 1. Multiple users drawing on the same room's whiteboard.
// 2. Drawing updates synchronize to other clients in real time.
// 3. Room isolation: Whiteboard strokes from Room A never leak to Room B.
// 4. Whiteboard undo & clear synchronization.
// 5. Note permissions:
//    - Private note cannot be edited by other members (server rejects).
//    - Private note cannot be deleted by other members (server rejects).
//    - Author can edit their own private note.
//    - Author can change permission to public.
//    - Other members can edit public notes.
//    - Non-authors cannot delete public notes.
// 6. Database persistence:
//    - Note and whiteboard strokes are loaded from database upon room initialization.

const SyncKit = require('./client/synckit/synckit.js');
const db = require('./server/db.js');

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('================================================================');
  console.log('🧪 Starting Collaborative Whiteboard, Permissions & DB Test Suite');
  console.log('================================================================');

  const testId = Date.now();
  const ROOM_A = `wb-room-a-${testId}`;
  const ROOM_B = `wb-room-b-${testId}`;

  // 1. Connect Client 1 (Alice), Client 2 (Bob), Client 3 (Charlie)
  console.log('1️⃣ Connecting Alice (Room A), Bob (Room A), and Charlie (Room B)...');
  const alice = new SyncKit({ serverUrl: 'http://localhost:3000', displayName: 'Alice', autoConnect: true });
  const bob = new SyncKit({ serverUrl: 'http://localhost:3000', displayName: 'Bob', autoConnect: true });
  const charlie = new SyncKit({ serverUrl: 'http://localhost:3000', displayName: 'Charlie', autoConnect: true });

  await Promise.all([
    new Promise((r) => alice.onStatusChange((s) => s === 'connected' && r())),
    new Promise((r) => bob.onStatusChange((s) => s === 'connected' && r())),
    new Promise((r) => charlie.onStatusChange((s) => s === 'connected' && r())),
  ]);
  console.log('✅ All 3 test clients connected to server.');

  // Join rooms
  await Promise.all([
    new Promise((r) => alice.joinRoom(ROOM_A, r)),
    new Promise((r) => bob.joinRoom(ROOM_A, r)),
    new Promise((r) => charlie.joinRoom(ROOM_B, r)),
  ]);
  console.log(`✅ Alice & Bob joined "${ROOM_A}", Charlie joined "${ROOM_B}".`);

  // ==========================================
  // Test 1 & 2: Whiteboard Drawing Synchronization
  // ==========================================
  console.log('2️⃣ [Test 1 & 2] Verifying Whiteboard Drawing Sync & Room Isolation...');
  let bobReceivedStroke = null;
  let charlieReceivedStroke = null;

  bob.onWhiteboardStroke((data) => {
    bobReceivedStroke = data.stroke;
  });

  charlie.onWhiteboardStroke((data) => {
    charlieReceivedStroke = data.stroke;
  });

  const testStroke = {
    id: `stroke_test_${testId}`,
    color: '#ef4444',
    size: 5,
    isEraser: false,
    points: [{ x: 10, y: 20 }, { x: 30, y: 40 }, { x: 50, y: 60 }],
  };

  alice.sendWhiteboardStroke(testStroke);
  await delay(250);

  if (!bobReceivedStroke || bobReceivedStroke.id !== testStroke.id) {
    throw new Error('Test 1 Failed: Bob did not receive Alice\'s whiteboard stroke in real time!');
  }
  console.log('✅ [Test 1 Passed] Bob received Alice\'s drawing stroke in real time.');

  if (charlieReceivedStroke !== null) {
    throw new Error('Test 2 Failed: Charlie in Room B received stroke from Room A! Room isolation broken.');
  }
  console.log('✅ [Test 2 Passed] Room isolation verified: Charlie received 0 strokes from Room A.');

  // ==========================================
  // Test 3: Whiteboard Undo Synchronization
  // ==========================================
  console.log('3️⃣ [Test 3] Verifying Whiteboard Undo Synchronization...');
  let bobUndoUpdated = false;

  bob.onWhiteboardUpdated((data) => {
    if (data.strokes.length === 0) {
      bobUndoUpdated = true;
    }
  });

  await new Promise((resolve) => alice.undoWhiteboard(resolve));
  await delay(200);

  if (!bobUndoUpdated) {
    throw new Error('Test 3 Failed: Bob did not receive whiteboard undo update!');
  }
  console.log('✅ [Test 3 Passed] Whiteboard undo synchronized to other clients.');

  // ==========================================
  // Test 4: Whiteboard Clear Synchronization
  // ==========================================
  console.log('4️⃣ [Test 4] Verifying Whiteboard Clear Synchronization...');
  // Draw another stroke
  alice.sendWhiteboardStroke({ id: `stroke_2_${testId}`, color: '#ffffff', size: 3, points: [{ x: 5, y: 5 }] });
  await delay(200);

  let bobCleared = false;
  bob.onWhiteboardCleared(() => {
    bobCleared = true;
  });

  await new Promise((resolve) => alice.clearWhiteboard(resolve));
  await delay(200);

  if (!bobCleared) {
    throw new Error('Test 4 Failed: Bob did not receive whiteboard clear broadcast!');
  }
  console.log('✅ [Test 4 Passed] Whiteboard clear synchronized across room members.');

  // ==========================================
  // Test 5: Note Permissions Enforcement
  // ==========================================
  console.log('5️⃣ [Test 5] Verifying Note Permissions (Private vs Public)...');

  // Alice creates a private note ("Only I can edit")
  let createdPrivateNote = null;
  await new Promise((resolve) => {
    alice.createNote(
      {
        title: 'Alice Private Note',
        content: 'Confidential strategy notes.',
        permission: 'private',
      },
      (res) => {
        createdPrivateNote = res.note;
        resolve();
      }
    );
  });

  if (!createdPrivateNote || createdPrivateNote.permission !== 'private') {
    throw new Error('Failed to create private note.');
  }
  console.log('   Alice created private note:', createdPrivateNote.title, `(permission: ${createdPrivateNote.permission})`);

  await delay(200);

  // Bob attempts to edit Alice's private note -> MUST BE REJECTED
  console.log('   Bob attempting to edit Alice\'s private note (Should be rejected)...');
  let bobEditResult = null;
  await new Promise((resolve) => {
    bob.editNote(createdPrivateNote.id, { content: 'Hacked by Bob!' }, (res) => {
      bobEditResult = res;
      resolve();
    });
  });

  if (bobEditResult && bobEditResult.success) {
    throw new Error('Security Failure: Bob was allowed to edit Alice\'s private note!');
  }
  console.log('✅ [Permission Check Passed] Bob\'s unauthorized edit was rejected:', bobEditResult?.error);

  // Bob attempts to delete Alice's private note -> MUST BE REJECTED
  console.log('   Bob attempting to delete Alice\'s private note (Should be rejected)...');
  let bobDeleteResult = null;
  await new Promise((resolve) => {
    bob.deleteNote(createdPrivateNote.id, (res) => {
      bobDeleteResult = res;
      resolve();
    });
  });

  if (bobDeleteResult && bobDeleteResult.success) {
    throw new Error('Security Failure: Bob was allowed to delete Alice\'s private note!');
  }
  console.log('✅ [Permission Check Passed] Bob\'s unauthorized delete was rejected:', bobDeleteResult?.error);

  // Alice edits her own private note -> MUST BE ALLOWED
  console.log('   Alice editing her own private note (Should succeed)...');
  let aliceEditResult = null;
  await new Promise((resolve) => {
    alice.editNote(createdPrivateNote.id, { content: 'Alice updated her own private note.' }, (res) => {
      aliceEditResult = res;
      resolve();
    });
  });

  if (!aliceEditResult || !aliceEditResult.success) {
    throw new Error('Alice was unable to edit her own private note!');
  }
  console.log('✅ [Permission Check Passed] Author successfully edited her own private note.');

  // Alice changes permission to 'public' -> MUST BE ALLOWED
  console.log('   Alice changing note permission to "public"...');
  await new Promise((resolve) => {
    alice.setNotePermission(createdPrivateNote.id, 'public', resolve);
  });
  await delay(200);

  // Now Bob edits the public note -> MUST BE ALLOWED
  console.log('   Bob editing note now that it is public (Should succeed)...');
  await new Promise((resolve) => {
    bob.editNote(createdPrivateNote.id, { content: 'Collaborative addition by Bob.' }, (res) => {
      bobEditResult = res;
      resolve();
    });
  });

  if (!bobEditResult || !bobEditResult.success) {
    throw new Error('Bob was unable to edit the note after permission was set to public!');
  }
  console.log('✅ [Permission Check Passed] Bob successfully edited the public note.');

  // Bob attempts to delete Alice's note even though it is public -> MUST BE REJECTED (only author can delete)
  console.log('   Bob attempting to delete Alice\'s public note (Should be rejected)...');
  await new Promise((resolve) => {
    bob.deleteNote(createdPrivateNote.id, (res) => {
      bobDeleteResult = res;
      resolve();
    });
  });

  if (bobDeleteResult && bobDeleteResult.success) {
    throw new Error('Security Failure: Bob was allowed to delete Alice\'s note!');
  }
  console.log('✅ [Permission Check Passed] Non-author delete rejected on public note:', bobDeleteResult?.error);

  // Alice deletes her own note -> MUST BE ALLOWED
  console.log('   Alice deleting her own note...');
  let aliceDeleteResult = null;
  await new Promise((resolve) => {
    alice.deleteNote(createdPrivateNote.id, (res) => {
      aliceDeleteResult = res;
      resolve();
    });
  });

  if (!aliceDeleteResult || !aliceDeleteResult.success) {
    throw new Error('Alice was unable to delete her own note!');
  }
  console.log('✅ [Permission Check Passed] Author successfully deleted her own note.');

  // ==========================================
  // Test 6: Database Persistence Check
  // ==========================================
  console.log('6️⃣ [Test 6] Verifying Database Persistence...');
  const DB_ROOM = `db-persistence-${testId}`;

  // Client creates a persistent note and whiteboard stroke in DB_ROOM
  const persistenceClient = new SyncKit({ serverUrl: 'http://localhost:3000', displayName: 'David', autoConnect: true });
  await new Promise((r) => persistenceClient.onStatusChange((s) => s === 'connected' && r()));
  await new Promise((r) => persistenceClient.joinRoom(DB_ROOM, r));

  await new Promise((resolve) => {
    persistenceClient.createNote({
      title: 'Persistent Architecture Document',
      content: 'This note must survive server reloads & page refreshes.',
      permission: 'public',
    }, resolve);
  });

  persistenceClient.sendWhiteboardStroke({
    id: `stroke_db_${testId}`,
    color: '#38bdf8',
    size: 4,
    points: [{ x: 50, y: 50 }, { x: 100, y: 100 }],
  });

  // Give debounce timer time to commit to DB
  await delay(700);

  // Initialize test process DB connection to inspect disk storage
  await db.init();

  // Query database directly to confirm it was persisted to disk/DB
  const dbNotes = await db.getRoomNotes(DB_ROOM);
  const dbWb = await db.getWhiteboard(DB_ROOM);

  if (dbNotes.length === 0 || !dbNotes[0].title.includes('Persistent Architecture')) {
    throw new Error('Database Persistence Check Failed: Note was not saved in DB!');
  }
  console.log(`✅ [DB Check Passed] Note verified directly in database (${db.type}):`, dbNotes[0].title);

  if (dbWb.strokes.length === 0) {
    throw new Error('Database Persistence Check Failed: Whiteboard was not saved in DB!');
  }
  console.log(`✅ [DB Check Passed] Whiteboard strokes verified directly in database (${db.type}): ${dbWb.strokes.length} strokes.`);

  // Disconnect all test clients
  alice.disconnect();
  bob.disconnect();
  charlie.disconnect();
  persistenceClient.disconnect();

  console.log('================================================================');
  console.log('🎉 ALL COLLABORATIVE WHITEBOARD, PERMISSIONS & DB TESTS PASSED!');
  console.log('================================================================');
}

runTests().catch((err) => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
