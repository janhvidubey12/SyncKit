// test-new-features.js
// Verification test for:
// 1. Live room reactions working properly
// 2. Note editable or not option & author locking
// 3. Persistent SQLite database for room discussions
// 4. Whiteboard drawing with pen and eraser & clearing

const SyncKit = require('./client/synckit/synckit.js');
const db = require('./server/database.js');

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('================================================================');
  console.log('🧪 Starting Verification Tests for New Features');
  console.log('================================================================');

  const testId = Date.now();
  const ROOM_A = `test-feat-room-a-${testId}`;
  const ROOM_B = `test-feat-room-b-${testId}`;

  // Step 1: Connect 2 clients in Room A, 1 in Room B
  console.log('1️⃣ Connecting clients: Alice (Room A), Bob (Room A), and Charlie (Room B)...');
  const alice = new SyncKit({ serverUrl: 'http://localhost:3000', displayName: 'Alice', autoConnect: true });
  const bob = new SyncKit({ serverUrl: 'http://localhost:3000', displayName: 'Bob', autoConnect: true });
  const charlie = new SyncKit({ serverUrl: 'http://localhost:3000', displayName: 'Charlie', autoConnect: true });

  await Promise.all([
    new Promise((r) => alice.onStatusChange((s) => s === 'connected' && r())),
    new Promise((r) => bob.onStatusChange((s) => s === 'connected' && r())),
    new Promise((r) => charlie.onStatusChange((s) => s === 'connected' && r())),
  ]);

  await Promise.all([
    new Promise((r) => alice.joinRoom(ROOM_A, r)),
    new Promise((r) => bob.joinRoom(ROOM_A, r)),
    new Promise((r) => charlie.joinRoom(ROOM_B, r)),
  ]);
  console.log('✅ Clients connected and rooms joined.');

  // ==========================================
  // Test 1: Live Room Reactions are working
  // ==========================================
  console.log('\n2️⃣ [Test 1] Testing Live Room Reactions...');
  const reactionsReceivedByBob = [];
  bob.onReaction((r) => reactionsReceivedByBob.push(r.emoji));

  alice.sendReaction('❤️');
  alice.sendReaction('🔥');
  alice.sendReaction('🎉');

  await delay(150);
  if (reactionsReceivedByBob.length !== 3 || !reactionsReceivedByBob.includes('❤️') || !reactionsReceivedByBob.includes('🔥')) {
    throw new Error(`Test 1 Failed: Expected Bob to receive 3 reactions, got: ${JSON.stringify(reactionsReceivedByBob)}`);
  }
  console.log('✅ [Test 1 Passed] Live room reactions working in real time across room members!');

  // ==========================================
  // Test 2: Note Editable or Not Option & Lock Enforcement
  // ==========================================
  console.log('\n3️⃣ [Test 2] Testing Note Editable Option and Author Locking...');

  // Alice creates a locked note (editable: false)
  let lockedNoteId = null;
  const bobSeesNotePromise = new Promise((resolve) => {
    bob.onStateChange((state) => {
      const found = (state.notesList || []).find((n) => n.title === 'Alice Secret Spec');
      if (found) resolve(found);
    });
  });

  await new Promise((resolve) => {
    alice.createNote({
      title: 'Alice Secret Spec',
      content: 'Sensitive project requirements - do not edit!',
      editable: false,
    }, resolve);
  });

  const lockedNote = await bobSeesNotePromise;
  lockedNoteId = lockedNote.id;
  if (!lockedNote || lockedNote.editable !== false) {
    throw new Error('Test 2 Failed: Note was not saved with editable: false!');
  }
  console.log('  ✓ Note created with editable: false.');

  // Bob tries to edit Alice's locked note -> must be rejected
  const bobEditResult = await new Promise((resolve) => {
    bob.editNote(lockedNoteId, { content: 'Bob hacking note!' }, resolve);
  });

  if (bobEditResult && bobEditResult.success) {
    throw new Error('Test 2 Failed: Bob was able to edit Alice\'s locked note!');
  }
  console.log('  ✓ Bob\'s attempt to edit locked note was correctly rejected:', bobEditResult?.error);

  // Alice (the author) CAN edit her own locked note
  const aliceEditResult = await new Promise((resolve) => {
    alice.editNote(lockedNoteId, { content: 'Alice updated her own locked note.' }, resolve);
  });

  if (!aliceEditResult || !aliceEditResult.success) {
    throw new Error('Test 2 Failed: Alice could not edit her own note! Details: ' + JSON.stringify(aliceEditResult));
  }
  console.log('  ✓ Alice successfully edited her own locked note.');

  // Alice unlocks the note (editable: true)
  const aliceUnlockResult = await new Promise((resolve) => {
    alice.toggleNoteEditable(lockedNoteId, resolve);
  });
  if (!aliceUnlockResult || !aliceUnlockResult.success) {
    throw new Error('Test 2 Failed: Alice could not toggle note editable status!');
  }

  await delay(100);
  // Now Bob CAN edit the unlocked note
  const bobSecondEditResult = await new Promise((resolve) => {
    bob.editNote(lockedNoteId, { content: 'Bob collaborative contribution now allowed!' }, resolve);
  });
  if (!bobSecondEditResult || !bobSecondEditResult.success) {
    throw new Error('Test 2 Failed: Bob could not edit note after it was unlocked!');
  }
  console.log('  ✓ Bob successfully edited note after author unlocked it.');
  console.log('✅ [Test 2 Passed] Note editable/lock option and permission control fully verified!');

  // ==========================================
  // Test 3: Persistent SQLite Database for Room Discussions
  // ==========================================
  console.log('\n4️⃣ [Test 3] Testing SQLite Database for Room Discussions...');

  const bobReceivedDiscussionPromise = new Promise((resolve) => {
    bob.onDiscussion((msg) => {
      if (msg.message.includes('Roadmap discussion Q4')) {
        resolve(msg);
      }
    });
  });

  // Alice posts discussion message
  const sendRes = await new Promise((resolve) => {
    alice.sendDiscussion('Let us review the Roadmap discussion Q4 today in room A.', resolve);
  });

  if (!sendRes || !sendRes.success || !sendRes.discussion.id) {
    throw new Error('Test 3 Failed: Discussion message was not saved with database ID!');
  }

  const receivedDiscussion = await bobReceivedDiscussionPromise;
  if (!receivedDiscussion || receivedDiscussion.authorName !== 'Alice') {
    throw new Error('Test 3 Failed: Bob did not receive discussion event!');
  }
  console.log('  ✓ Real-time discussion message received by Bob in Room A.');

  // Verify direct database query from SQLite
  const dbMessages = db.getDiscussions(ROOM_A);
  const foundInDb = dbMessages.find((m) => m.message.includes('Roadmap discussion Q4'));
  if (!foundInDb || foundInDb.authorName !== 'Alice') {
    throw new Error(`Test 3 Failed: Message not found in SQLite discussions table! Found: ${JSON.stringify(dbMessages)}`);
  }
  console.log(`  ✓ Verified persistent SQLite storage: ${dbMessages.length} message(s) stored for "${ROOM_A}".`);

  // Verify room isolation: Room B has 0 messages from Room A
  const roomBMessages = db.getDiscussions(ROOM_B);
  if (roomBMessages.length !== 0) {
    throw new Error(`Test 3 Failed: Room B received leaked messages from Room A in database!`);
  }
  console.log('  ✓ Room isolation verified: Room B has 0 discussion messages from Room A.');
  console.log('✅ [Test 3 Passed] Persistent SQLite room discussion database verified!');

  // ==========================================
  // Test 4: Whiteboard Pen & Eraser Synchronization
  // ==========================================
  console.log('\n5️⃣ [Test 4] Testing Collaborative Whiteboard (Pen, Eraser, Clear)...');

  const bobStrokePromise = new Promise((resolve) => {
    bob.onDrawStroke((stroke) => {
      resolve(stroke);
    });
  });

  // Alice draws with Pen
  alice.sendDrawStroke({
    x0: 50,
    y0: 50,
    x1: 120,
    y1: 120,
    pctX0: 0.1,
    pctY0: 0.1,
    pctX1: 0.3,
    pctY1: 0.3,
    color: '#ef4444',
    size: 4,
    tool: 'pen',
  });

  const bobReceivedStroke = await bobStrokePromise;
  if (!bobReceivedStroke || bobReceivedStroke.tool !== 'pen' || bobReceivedStroke.color !== '#ef4444') {
    throw new Error(`Test 4 Failed: Bob did not receive pen stroke correctly!`);
  }
  console.log('  ✓ Pen stroke synchronized to Bob in real time.');

  // Bob erases with Eraser
  const aliceEraserPromise = new Promise((resolve) => {
    alice.onDrawStroke((stroke) => {
      if (stroke.tool === 'eraser') resolve(stroke);
    });
  });

  bob.sendDrawStroke({
    x0: 60,
    y0: 60,
    x1: 80,
    y1: 80,
    pctX0: 0.12,
    pctY0: 0.12,
    pctX1: 0.18,
    pctY1: 0.18,
    color: '#ffffff',
    size: 8,
    tool: 'eraser',
  });

  const aliceReceivedEraser = await aliceEraserPromise;
  if (!aliceReceivedEraser || aliceReceivedEraser.tool !== 'eraser') {
    throw new Error('Test 4 Failed: Alice did not receive eraser stroke!');
  }
  console.log('  ✓ Eraser stroke synchronized to Alice in real time.');

  // Clear whiteboard test
  const bobClearPromise = new Promise((resolve) => {
    bob.onWhiteboardClear(resolve);
  });

  alice.clearWhiteboard();
  await bobClearPromise;
  console.log('  ✓ Clear whiteboard broadcast synchronized.');

  // Disconnect clients
  alice.disconnect();
  bob.disconnect();
  charlie.disconnect();

  console.log('\n================================================================');
  console.log('🎉 ALL NEW FEATURE TESTS PASSED SUCCESSFULLY! 🎉');
  console.log('================================================================');
}

// Allow running standalone or as part of test runner
if (require.main === module) {
  runTests().catch((err) => {
    console.error('❌ Test execution failed:', err);
    process.exit(1);
  });
}

module.exports = runTests;
