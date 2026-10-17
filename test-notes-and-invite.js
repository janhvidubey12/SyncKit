// test-notes-and-invite.js
// Automated test suite for SyncKit Multi-Member Shared Room Notes & Invite Links
//
// Verifies:
// A. Two clients in the same room can see each other's notes.
// B. Editing a note updates the other client.
// C. Creating or deleting a note updates all clients in the room.
// D. Different rooms have separate note collections.
// E. Switching rooms does not leak notes.
// F. Reconnecting restores the latest notes.
// G. Invite links join the correct room.
// (H. Verified by running the existing test suites)

const SyncKit = require('./client/synckit/synckit.js');

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Invite link parser helper (mirrors demo.js URL parameter logic)
function parseRoomFromInviteUrl(urlStr) {
  try {
    const url = new URL(urlStr);
    const roomParam = url.searchParams.get('room');
    if (roomParam && roomParam.trim()) {
      return roomParam.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'room-1';
    }
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'room' && parts[1]) {
      return decodeURIComponent(parts[1]).trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'room-1';
    }
  } catch (e) {
    const match = urlStr.match(/[?&]room=([^&#]+)/);
    if (match) return decodeURIComponent(match[1]).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
  }
  return 'room-1';
}

async function runNotesAndInviteTests() {
  console.log('================================================================');
  console.log('🧪 Repeatable Test: Multi-Member Shared Notes & Invite Links');
  console.log('================================================================');

  const testId = Date.now();
  const ROOM_A = `room-multi-a-${testId}`;
  const ROOM_B = `room-multi-b-${testId}`;
  const INVITE_ROOM = `invited-team-${testId}`;

  // 1. Connect Client 1 (Alice), Client 2 (Bob), and Client 3 (Charlie)
  console.log('1️⃣ Connecting Client 1 (Alice), Client 2 (Bob), and Client 3 (Charlie)...');
  const client1 = new SyncKit({ serverUrl: 'http://localhost:3000', displayName: 'Alice', autoConnect: true });
  const client2 = new SyncKit({ serverUrl: 'http://localhost:3000', displayName: 'Bob', autoConnect: true });
  const client3 = new SyncKit({ serverUrl: 'http://localhost:3000', displayName: 'Charlie', autoConnect: true });

  await Promise.all([
    new Promise((r) => client1.onStatusChange((s) => s === 'connected' && r())),
    new Promise((r) => client2.onStatusChange((s) => s === 'connected' && r())),
    new Promise((r) => client3.onStatusChange((s) => s === 'connected' && r())),
  ]);
  console.log('✅ All 3 clients connected to SyncKit server.');

  // Join initial rooms
  console.log(`2️⃣ Client 1 & 2 join "${ROOM_A}", Client 3 joins "${ROOM_B}"...`);
  await Promise.all([
    new Promise((r) => client1.joinRoom(ROOM_A, r)),
    new Promise((r) => client2.joinRoom(ROOM_A, r)),
    new Promise((r) => client3.joinRoom(ROOM_B, r)),
  ]);
  console.log('✅ Room memberships established.');

  // ==========================================
  // Test A: Two clients in the same room can see each other's notes
  // ==========================================
  console.log('3️⃣ [Test A] Verifying two clients in same room see each other\'s notes...');
  let aliceNoteId = null;
  let bobNoteId = null;

  // Alice creates a note
  const bobSeesAliceNotePromise = new Promise((resolve) => {
    client2.onStateChange((state) => {
      const list = state.notesList || [];
      const found = list.find((n) => n.authorName === 'Alice' && n.content.includes('Frontend UI tasks'));
      if (found) resolve(found);
    });
  });

  client1.createNote({ title: "Alice's Sprint Note", content: 'Frontend UI tasks & responsive polish' });
  const receivedAliceNote = await bobSeesAliceNotePromise;
  aliceNoteId = receivedAliceNote.id;

  if (!aliceNoteId || receivedAliceNote.authorName !== 'Alice') {
    throw new Error('Test A Failed: Bob did not receive Alice\'s note correctly!');
  }

  // Bob creates a note
  const aliceSeesBobNotePromise = new Promise((resolve) => {
    client1.onStateChange((state) => {
      const list = state.notesList || [];
      const found = list.find((n) => n.authorName === 'Bob' && n.content.includes('Backend Socket.IO architecture'));
      if (found) resolve(found);
    });
  });

  const bobCreatePromise = new Promise((resolve) => {
    client2.createNote({ title: "Bob's System Note", content: 'Backend Socket.IO architecture & state recovery' }, resolve);
  });
  const [receivedBobNote] = await Promise.all([aliceSeesBobNotePromise, bobCreatePromise]);
  bobNoteId = receivedBobNote.id;

  // Verify both clients see both notes in room A
  const aliceNotes = client1.getNotesList();
  const bobNotes = client2.getNotesList();

  if (aliceNotes.length !== 2 || bobNotes.length !== 2) {
    throw new Error(`Test A Failed: Expected 2 notes in room, got Alice=${aliceNotes.length}, Bob=${bobNotes.length}`);
  }
  console.log('✅ [Test A Passed] Both clients see each other\'s notes in the same room.');

  // ==========================================
  // Test B: Editing a note updates the other client
  // ==========================================
  console.log('4️⃣ [Test B] Verifying editing a note updates the other client...');
  const bobSeesAliceEditPromise = new Promise((resolve) => {
    client2.onStateChange((state) => {
      const list = state.notesList || [];
      const updated = list.find((n) => n.id === aliceNoteId && n.content.includes('Frontend UI completed 100%'));
      if (updated) resolve(updated);
    });
  });

  client1.editNote(aliceNoteId, { title: "Alice's Sprint Note (Done)", content: 'Frontend UI completed 100% and verified!' });
  const editedNote = await bobSeesAliceEditPromise;

  if (editedNote.content !== 'Frontend UI completed 100% and verified!') {
    throw new Error('Test B Failed: Note content was not updated on Bob\'s client!');
  }
  console.log('✅ [Test B Passed] Editing note updated other client in real time.');

  // ==========================================
  // Test C: Creating or deleting a note updates all clients in the room
  // ==========================================
  console.log('5️⃣ [Test C] Verifying deleting a note updates all clients in the room...');
  const aliceSeesBobNoteDeletedPromise = new Promise((resolve) => {
    client1.onStateChange((state) => {
      const list = state.notesList || [];
      const bobNoteStillThere = list.some((n) => n.id === bobNoteId);
      if (!bobNoteStillThere && list.length === 1) {
        resolve(list);
      }
    });
  });

  client2.deleteNote(bobNoteId);
  const remainingNotes = await aliceSeesBobNoteDeletedPromise;

  if (remainingNotes.length !== 1 || remainingNotes[0].id !== aliceNoteId) {
    throw new Error('Test C Failed: Bob\'s note was not deleted from Alice\'s view!');
  }
  console.log('✅ [Test C Passed] Deleting a note synchronized across all clients in the room.');

  // ==========================================
  // Test D: Different rooms have separate note collections
  // ==========================================
  console.log('6️⃣ [Test D] Verifying different rooms have completely separate note collections...');
  let roomBReceivedRoomALeak = false;
  client3.onStateChange(() => {
    roomBReceivedRoomALeak = true;
  });

  // Client 1 creates another note in Room A
  client1.createNote({ title: 'Room A Secret', content: 'Confidential to Room A' });
  await delay(60);

  if (roomBReceivedRoomALeak) {
    throw new Error('Test D Failed: Room B client received an update from Room A!');
  }

  // Charlie creates a note in Room B
  const charlieNotePromise = new Promise((resolve) => {
    client3.onStateChange((state) => {
      const list = state.notesList || [];
      if (list.some((n) => n.content.includes('Room B only research'))) {
        resolve(list);
      }
    });
  });

  client3.createNote({ title: "Charlie's Note", content: 'Room B only research plan' });
  await charlieNotePromise;

  // Alice and Bob in Room A must NOT have Charlie's note
  const roomANotes = client1.getNotesList();
  if (roomANotes.some((n) => n.content.includes('Room B only research plan'))) {
    throw new Error('Test D Failed: Room A received Room B notes!');
  }
  console.log('✅ [Test D Passed] Different rooms maintain strictly isolated note collections.');

  // ==========================================
  // Test E: Switching rooms does not leak notes
  // ==========================================
  console.log('7️⃣ [Test E] Verifying switching rooms does not leak notes...');
  const aliceSwitchedToRoomBPromise = new Promise((resolve) => {
    client1.onStateChange((state, meta) => {
      if (meta.roomId === ROOM_B) {
        resolve(state);
      }
    });
  });

  client1.joinRoom(ROOM_B);
  const aliceSwitchedState = await aliceSwitchedToRoomBPromise;
  const switchedList = aliceSwitchedState.notesList || [];

  if (switchedList.some((n) => n.content.includes('Confidential to Room A'))) {
    throw new Error('Test E Failed: Room A notes leaked into Room B on room switch!');
  }
  if (!switchedList.some((n) => n.content.includes('Room B only research plan'))) {
    throw new Error('Test E Failed: Switched room did not load Room B notes!');
  }
  console.log('✅ [Test E Passed] Room switching loaded Room B notes without leaking Room A notes.');

  // ==========================================
  // Test F: Reconnecting restores the latest notes
  // ==========================================
  console.log('8️⃣ [Test F] Verifying reconnection restores latest notes...');
  // Switch Alice back to Room A
  await new Promise((r) => client1.joinRoom(ROOM_A, r));

  // Disconnect Bob (Client 2 in Room A)
  const disconnectPromise = new Promise((resolve) => {
    client2.onStatusChange((s) => s === 'disconnected' && resolve());
  });
  client2.disconnect();
  await disconnectPromise;
  console.log('   Bob disconnected (offline).');

  // Alice creates a note while Bob is offline
  const offlineCreatedContent = 'Created by Alice while Bob was offline!';
  client1.createNote({ title: 'Offline Note', content: offlineCreatedContent });
  await delay(60);

  // Bob reconnects
  console.log('   Reconnecting Bob...');
  const recoveryPromise = new Promise((resolve) => {
    client2.onStateChange((state, meta) => {
      const list = state.notesList || [];
      const found = list.find((n) => n.content.includes(offlineCreatedContent));
      if (found && meta.recovered) {
        resolve(list);
      }
    });
  });

  client2.connect();
  const recoveredList = await recoveryPromise;

  if (!recoveredList.some((n) => n.content.includes(offlineCreatedContent))) {
    throw new Error('Test F Failed: Bob did not recover Alice\'s note created while offline!');
  }
  console.log('✅ [Test F Passed] Reconnecting restored the latest authoritative room notes.');

  // ==========================================
  // Test G: Invite links join the correct room
  // ==========================================
  console.log('9️⃣ [Test G] Verifying invite links join correct room & sync notes...');
  const simulatedInviteUrl1 = `http://localhost:3000/demo?room=${INVITE_ROOM}`;
  const simulatedInviteUrl2 = `http://localhost:3000/room/${INVITE_ROOM}`;

  const parsedRoom1 = parseRoomFromInviteUrl(simulatedInviteUrl1);
  const parsedRoom2 = parseRoomFromInviteUrl(simulatedInviteUrl2);

  if (parsedRoom1 !== INVITE_ROOM || parsedRoom2 !== INVITE_ROOM) {
    throw new Error(`Test G Failed: Invite URL parsing error: "${parsedRoom1}" vs "${parsedRoom2}"`);
  }

  const inviteClient1 = new SyncKit({ serverUrl: 'http://localhost:3000', displayName: 'Invited-1', autoConnect: true });
  const inviteClient2 = new SyncKit({ serverUrl: 'http://localhost:3000', displayName: 'Invited-2', autoConnect: true });

  await Promise.all([
    new Promise((r) => inviteClient1.onStatusChange((s) => s === 'connected' && r())),
    new Promise((r) => inviteClient2.onStatusChange((s) => s === 'connected' && r())),
  ]);

  await Promise.all([
    new Promise((r) => inviteClient1.joinRoom(parsedRoom1, r)),
    new Promise((r) => inviteClient2.joinRoom(parsedRoom2, r)),
  ]);

  const inviteExchangePromise = new Promise((resolve) => {
    inviteClient2.onStateChange((state) => {
      const list = state.notesList || [];
      if (list.some((n) => n.content.includes('Collaborating via invite link!'))) {
        resolve(list);
      }
    });
  });

  inviteClient1.createNote({ title: 'Welcome', content: 'Collaborating via invite link!' });
  const inviteNotes = await inviteExchangePromise;

  if (!inviteNotes.some((n) => n.content.includes('Collaborating via invite link!'))) {
    throw new Error('Test G Failed: Notes not exchanged between invite-linked clients!');
  }
  console.log('✅ [Test G Passed] Clients joining via invite links connected to same room and synchronized notes.');

  console.log('================================================================');
  console.log('🎉 ALL MULTI-MEMBER NOTES, ISOLATION & INVITE TESTS PASSED!');
  console.log('================================================================');

  client1.disconnect();
  client2.disconnect();
  client3.disconnect();
  inviteClient1.disconnect();
  inviteClient2.disconnect();
  process.exit(0);
}

runNotesAndInviteTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
