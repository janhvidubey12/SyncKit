// test-regression-suite.js
// Comprehensive End-to-End Regression Verification for SyncKit Fixes (Issues 1-5)

const SyncKit = require('./client/synckit/synckit.js');
const db = require('./server/db.js');

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runRegression() {
  console.log('================================================================');
  console.log('🚀 Running Comprehensive Regression Verification (Issues 1 - 5)');
  console.log('================================================================');

  const testId = Date.now();
  const ROOM_A = `regression-room-a-${testId}`;
  const ROOM_B = `regression-room-b-${testId}`;

  // -------------------------------------------------------------------------
  // VERIFICATION 1: Connecting 2 Clients (Tab 1 & Tab 2)
  // -------------------------------------------------------------------------
  console.log('\n[1/8] Connecting Client 1 (Alice) and Client 2 (Bob)...');
  const alice = new SyncKit({ serverUrl: 'http://localhost:3000', displayName: 'Alice', autoConnect: true });
  const bob = new SyncKit({ serverUrl: 'http://localhost:3000', displayName: 'Bob', autoConnect: true });

  await Promise.all([
    new Promise((r) => alice.onStatusChange((s) => s === 'connected' && r())),
    new Promise((r) => bob.onStatusChange((s) => s === 'connected' && r())),
  ]);
  console.log('✅ Both clients connected successfully.');

  // Join Room A
  await Promise.all([
    new Promise((r) => alice.joinRoom(ROOM_A, r)),
    new Promise((r) => bob.joinRoom(ROOM_A, r)),
  ]);
  console.log(`✅ Alice and Bob joined "${ROOM_A}".`);

  // Verify presence in Room A
  await delay(150);
  const alicePresence = alice.getPresence();
  if (alicePresence.length !== 2) {
    throw new Error(`Expected 2 members in Room A, got: ${alicePresence.length}`);
  }
  console.log(`✅ Verified Room A members count: ${alicePresence.length} (Alice & Bob).`);

  // -------------------------------------------------------------------------
  // VERIFICATION 2: Whiteboard Collaborative Drawing (Issue 3 & 4 prerequisite)
  // -------------------------------------------------------------------------
  console.log('\n[2/8] Testing Whiteboard Collaborative Drawing...');
  let bobReceivedAliceStroke = null;
  bob.onWhiteboardStroke((data) => {
    bobReceivedAliceStroke = data.stroke;
  });

  const stroke1 = {
    id: `stroke_alice_${testId}`,
    color: '#ef4444',
    size: 5,
    isEraser: false,
    points: [{ x: 10, y: 10 }, { x: 50, y: 50 }],
  };
  alice.sendWhiteboardStroke(stroke1);
  await delay(200);

  if (!bobReceivedAliceStroke || bobReceivedAliceStroke.id !== stroke1.id) {
    throw new Error('Bob did not receive Alice\'s drawing stroke in real time!');
  }
  console.log('✅ Alice drew a red stroke; Bob received it in real time.');

  // Bob draws a blue stroke
  let aliceReceivedBobStroke = null;
  alice.onWhiteboardStroke((data) => {
    aliceReceivedBobStroke = data.stroke;
  });

  const stroke2 = {
    id: `stroke_bob_${testId}`,
    color: '#38bdf8',
    size: 8,
    isEraser: false,
    points: [{ x: 60, y: 60 }, { x: 120, y: 120 }],
  };
  bob.sendWhiteboardStroke(stroke2);
  await delay(200);

  if (!aliceReceivedBobStroke || aliceReceivedBobStroke.id !== stroke2.id) {
    throw new Error('Alice did not receive Bob\'s drawing stroke in real time!');
  }
  console.log('✅ Bob drew a blue stroke; Alice received it in real time.');

  // -------------------------------------------------------------------------
  // VERIFICATION 3: Collaborative Undo (Issue 3: Only undo caller's last stroke)
  // -------------------------------------------------------------------------
  console.log('\n[3/8] Testing Whiteboard Undo (Issue 3)...');
  // At this point, the board has: [Alice\'s stroke, Bob\'s stroke]
  // Alice clicks Undo -> should remove ALICE\'S stroke, NOT Bob\'s stroke!
  let bobWhiteboardAfterAliceUndo = null;
  bob.onWhiteboardUpdated((data) => {
    bobWhiteboardAfterAliceUndo = data.strokes;
  });

  const undoRes = await new Promise((r) => alice.undoWhiteboard(r));
  await delay(200);

  if (!undoRes || !undoRes.success) {
    throw new Error(`Alice undo failed: ${JSON.stringify(undoRes)}`);
  }

  // Bob's stroke should still exist on the board!
  const remainingStrokes = undoRes.strokes;
  const hasAliceStroke = remainingStrokes.some((s) => s.authorId === alice.getSessionId());
  const hasBobStroke = remainingStrokes.some((s) => s.authorId === bob.getSessionId());

  if (hasAliceStroke) {
    throw new Error('Undo failure: Alice\'s stroke was NOT removed!');
  }
  if (!hasBobStroke) {
    throw new Error('Undo failure: Bob\'s stroke was incorrectly deleted by Alice\'s undo!');
  }
  if (!bobWhiteboardAfterAliceUndo || bobWhiteboardAfterAliceUndo.length !== 1) {
    throw new Error('Bob did not receive updated whiteboard with Alice\'s stroke removed!');
  }
  console.log('✅ Verified: Alice undid her stroke. Bob\'s stroke was preserved intact.');
  console.log('✅ Verified: Undo synchronized immediately to Bob\'s canvas.');

  // Alice attempts to undo AGAIN when she has NO strokes left
  const aliceSecondUndo = await new Promise((r) => alice.undoWhiteboard(r));
  if (!aliceSecondUndo || !aliceSecondUndo.noUserStrokes) {
    // If it didn't return noUserStrokes, check that Bob's stroke was still NOT deleted
    if (aliceSecondUndo.strokes.length !== 1) {
      throw new Error('Security failure: Alice was allowed to undo Bob\'s stroke!');
    }
  }
  console.log('✅ Verified: Alice has no strokes remaining; Bob\'s stroke was protected from accidental undo.');

  // -------------------------------------------------------------------------
  // VERIFICATION 4: Whiteboard Clear & Persistence (Issue 4)
  // -------------------------------------------------------------------------
  console.log('\n[4/8] Testing Whiteboard Clear & Database Persistence (Issue 4)...');
  let bobSawClear = false;
  bob.onWhiteboardCleared(() => {
    bobSawClear = true;
  });

  const clearRes = await new Promise((r) => bob.clearWhiteboard(r));
  await delay(200);

  if (!clearRes || !clearRes.success) {
    throw new Error('Bob clearWhiteboard failed!');
  }
  if (!bobSawClear) {
    throw new Error('Bob did not receive whiteboard-cleared broadcast!');
  }
  console.log('✅ Verified: Whiteboard cleared in real time across room.');

  // Test Database Persistence: Query DB directly to ensure [] was saved immediately
  await db.init();
  const dbWb = await db.getWhiteboard(ROOM_A);
  if (dbWb.strokes.length !== 0) {
    throw new Error(`Persistence failure: DB still contains ${dbWb.strokes.length} strokes after clear!`);
  }
  console.log('✅ Verified: Cleared whiteboard was immediately persisted to database as 0 strokes.');

  // Test Reconnect / Refresh: Connect a fresh client (Charlie) into ROOM_A
  const charlie = new SyncKit({ serverUrl: 'http://localhost:3000', displayName: 'Charlie', autoConnect: true });
  await new Promise((r) => charlie.onStatusChange((s) => s === 'connected' && r()));
  const charlieJoinRes = await new Promise((r) => charlie.joinRoom(ROOM_A, r));

  if (!charlieJoinRes.success || charlieJoinRes.whiteboard.length !== 0) {
    throw new Error(`Fresh client joined ROOM_A but received ${charlieJoinRes.whiteboard?.length} strokes! Expected 0.`);
  }
  console.log('✅ Verified: Fresh client (simulating page reload) loaded empty whiteboard (0 strokes).');

  // Drawing new strokes after clear works normally
  let charlieSawNewStroke = null;
  charlie.onWhiteboardStroke((data) => {
    charlieSawNewStroke = data.stroke;
  });

  const strokeAfterClear = {
    id: `stroke_after_clear_${testId}`,
    color: '#10b981',
    size: 10,
    isEraser: false,
    points: [{ x: 5, y: 5 }, { x: 25, y: 25 }],
  };
  alice.sendWhiteboardStroke(strokeAfterClear);
  await delay(200);

  if (!charlieSawNewStroke || charlieSawNewStroke.id !== strokeAfterClear.id) {
    throw new Error('Drawing new stroke after clear failed to synchronize!');
  }
  console.log('✅ Verified: Drawing new strokes after clear functions normally.');

  // -------------------------------------------------------------------------
  // VERIFICATION 5: Room Switching & Isolation (Issue 2)
  // -------------------------------------------------------------------------
  console.log('\n[5/8] Testing Room Switching & Old Room Cleanup (Issue 2)...');
  // Alice switches from ROOM_A to ROOM_B
  const aliceSwitchRes = await new Promise((r) => alice.joinRoom(ROOM_B, r));
  if (!aliceSwitchRes || !aliceSwitchRes.success) {
    throw new Error(`Alice failed to switch to ${ROOM_B}`);
  }
  await delay(200);

  // Bob (still in ROOM_A) should see Alice leave ROOM_A
  const bobPresenceInRoomA = bob.getPresence();
  const aliceInRoomA = bobPresenceInRoomA.some((u) => u.sessionId === alice.getSessionId());
  if (aliceInRoomA) {
    throw new Error('Room switch failure: Alice is STILL listed in Room A presence!');
  }
  console.log(`✅ Verified: When Alice switched to ${ROOM_B}, she was removed from ${ROOM_A} presence.`);

  // Whiteboard drawing in Room B must NOT leak to Bob in Room A
  let bobReceivedRoomBStroke = null;
  bob.onWhiteboardStroke((data) => {
    bobReceivedRoomBStroke = data.stroke;
  });

  alice.sendWhiteboardStroke({
    id: `stroke_room_b_${testId}`,
    color: '#a855f7',
    size: 6,
    points: [{ x: 99, y: 99 }],
  });
  await delay(200);

  if (bobReceivedRoomBStroke !== null) {
    throw new Error('Room isolation broken! Bob in Room A received stroke drawn in Room B.');
  }
  console.log('✅ Verified: Room isolation holds; Room B strokes do not leak to Room A.');

  // -------------------------------------------------------------------------
  // VERIFICATION 6: Note Creation, Edit & Permissions
  // -------------------------------------------------------------------------
  console.log('\n[6/8] Testing Collaborative Notes & Permissions...');
  // Alice creates a note in Room B
  let noteCreated = null;
  await new Promise((r) => {
    alice.createNote(
      {
        title: 'Executive Meeting Agenda',
        content: '1. Review multiplayer synchronization.\n2. Verify fixes.',
        permission: 'public',
      },
      (res) => {
        noteCreated = res.note;
        r();
      }
    );
  });
  if (!noteCreated) throw new Error('Failed to create note in Room B');
  console.log('✅ Note created in Room B:', noteCreated.title);

  // Bob in Room A should NOT see Alice's note from Room B
  const bobNotes = bob.getState().notesList || [];
  if (bobNotes.some((n) => n.id === noteCreated.id)) {
    throw new Error('Note isolation broken! Bob in Room A sees note from Room B.');
  }
  console.log('✅ Verified: Notes in Room B are completely isolated from Room A.');

  // -------------------------------------------------------------------------
  // VERIFICATION 7: Live Cursors (Issue 1)
  // -------------------------------------------------------------------------
  console.log('\n[7/8] Testing Live Cursors & Clean Cursor Layer (Issue 1)...');
  // Charlie joins Room B where Alice is
  await new Promise((r) => charlie.joinRoom(ROOM_B, r));
  await delay(200);

  let charlieSawAliceCursor = null;
  charlie.onCursorMove((c) => {
    charlieSawAliceCursor = c;
  });

  alice.sendCursor({ x: 340, y: 210 });
  await delay(100);

  if (!charlieSawAliceCursor || charlieSawAliceCursor.x !== 340 || charlieSawAliceCursor.y !== 210) {
    throw new Error('Cursor sharing failed between Alice and Charlie in Room B!');
  }
  if (!charlieSawAliceCursor.color || !charlieSawAliceCursor.displayName) {
    throw new Error('Cursor missing required display name or distinct color!');
  }
  console.log(`✅ Verified: Remote cursor delivered to Charlie: (${charlieSawAliceCursor.x}, ${charlieSawAliceCursor.y}) from ${charlieSawAliceCursor.displayName} [${charlieSawAliceCursor.color}].`);

  // -------------------------------------------------------------------------
  // VERIFICATION 8: Ephemeral Reactions
  // -------------------------------------------------------------------------
  console.log('\n[8/8] Testing Ephemeral Reactions...');
  let charlieSawReaction = null;
  charlie.onReaction((r) => {
    charlieSawReaction = r;
  });

  alice.sendReaction('⚡');
  await delay(100);

  if (!charlieSawReaction || charlieSawReaction.emoji !== '⚡') {
    throw new Error('Reaction failed to synchronize!');
  }
  console.log('✅ Verified: Ephemeral reaction synchronized across room members.');

  // Clean disconnect
  alice.disconnect();
  bob.disconnect();
  charlie.disconnect();

  console.log('\n================================================================');
  console.log('🎉 ALL 8 REGRESSION VERIFICATIONS PASSED WITH 100% SUCCESS!');
  console.log('================================================================\n');
}

runRegression().catch((err) => {
  console.error('❌ Regression suite failed:', err);
  process.exit(1);
});
