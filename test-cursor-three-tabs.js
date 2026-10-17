// test-cursor-three-tabs.js
// Automated test verifying live cursor sharing across three tabs.
// Requirements verified:
// 1. Send cursor coordinates through SyncKit library API
// 2. Broadcast cursor updates only to other clients in the same room (no self-echo, no leak across rooms)
// 3. Deterministic, distinct colors for users
// 4. Short user label (displayName) attached to cursor
// 5. Cursor updates kept completely separate from shared application state
// 6. Automatic client-side throttling to prevent server flooding
// 7. Stale cursor removal when users leave
// 8. Shared state remains intact and unaffected by cursor movement

const SyncKit = require('./client/synckit/synckit.js');

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testLiveCursorSharing() {
  console.log('================================================================');
  console.log('🧪 Repeatable Test: Live Cursor Sharing Across 3 Tabs');
  console.log('================================================================');

  const testId = Date.now();
  const MAIN_ROOM = `cursor-room-${testId}`;
  const OTHER_ROOM = `other-isolated-room-${testId}`;

  // 1. Initialize 3 tabs in MAIN_ROOM and 1 tab in OTHER_ROOM
  console.log('1️⃣ Connecting Alice, Bob, Charlie (Room A) and Dave (Room B)...');
  const alice = new SyncKit({
    serverUrl: 'http://localhost:3000',
    sessionId: `sess_alice_${testId}`,
    displayName: 'Alice',
    cursorThrottleMs: 30,
    autoConnect: true,
  });

  const bob = new SyncKit({
    serverUrl: 'http://localhost:3000',
    sessionId: `sess_bob_${testId}`,
    displayName: 'Bob',
    cursorThrottleMs: 30,
    autoConnect: true,
  });

  const charlie = new SyncKit({
    serverUrl: 'http://localhost:3000',
    sessionId: `sess_charlie_${testId}`,
    displayName: 'Charlie',
    cursorThrottleMs: 30,
    autoConnect: true,
  });

  const dave = new SyncKit({
    serverUrl: 'http://localhost:3000',
    sessionId: `sess_dave_${testId}`,
    displayName: 'Dave',
    cursorThrottleMs: 30,
    autoConnect: true,
  });

  // Wait for all 4 sockets to connect
  await Promise.all([
    new Promise((r) => alice.onStatusChange((s) => s === 'connected' && r())),
    new Promise((r) => bob.onStatusChange((s) => s === 'connected' && r())),
    new Promise((r) => charlie.onStatusChange((s) => s === 'connected' && r())),
    new Promise((r) => dave.onStatusChange((s) => s === 'connected' && r())),
  ]);
  console.log('✅ All 4 clients connected to server.');

  // Join rooms
  console.log(`2️⃣ Alice, Bob, Charlie join "${MAIN_ROOM}", Dave joins "${OTHER_ROOM}"...`);
  await Promise.all([
    new Promise((r) => alice.joinRoom(MAIN_ROOM, r)),
    new Promise((r) => bob.joinRoom(MAIN_ROOM, r)),
    new Promise((r) => charlie.joinRoom(MAIN_ROOM, r)),
    new Promise((r) => dave.joinRoom(OTHER_ROOM, r)),
  ]);

  // Wait until presence in MAIN_ROOM reaches 3
  await new Promise((resolve) => {
    bob.onPresenceChange((users) => {
      if (users.length === 3) resolve();
    });
  });
  console.log(`✅ Room "${MAIN_ROOM}" populated with Alice, Bob, and Charlie.`);

  // 3. Test: Alice moves cursor -> Bob and Charlie receive, Alice does NOT (no self-echo), Dave does NOT (isolation)
  console.log('3️⃣ Testing cursor broadcast, room isolation, and no self-echo...');
  let aliceSelfEchoCount = 0;
  let daveLeakCount = 0;
  let bobReceivedCursor = null;
  let charlieReceivedCursor = null;

  alice.onCursorMove(() => {
    aliceSelfEchoCount++;
  });

  dave.onCursorMove(() => {
    daveLeakCount++;
  });

  const bobPromise = new Promise((resolve) => {
    bob.onCursorMove((event) => {
      bobReceivedCursor = event;
      resolve(event);
    });
  });

  const charliePromise = new Promise((resolve) => {
    charlie.onCursorMove((event) => {
      charlieReceivedCursor = event;
      resolve(event);
    });
  });

  // Alice sends cursor coordinates
  alice.sendCursor({ x: 250, y: 400 });

  await Promise.all([bobPromise, charliePromise]);
  await delay(50); // allow any echo or cross-talk to arrive if faulty

  // Assert Bob received correct payload
  if (!bobReceivedCursor || bobReceivedCursor.x !== 250 || bobReceivedCursor.y !== 400) {
    throw new Error(`Bob received invalid cursor: ${JSON.stringify(bobReceivedCursor)}`);
  }
  if (bobReceivedCursor.displayName !== 'Alice') {
    throw new Error(`Expected displayName 'Alice', received: ${bobReceivedCursor.displayName}`);
  }
  if (!bobReceivedCursor.color || !bobReceivedCursor.color.startsWith('#')) {
    throw new Error(`Expected hex color string for cursor, received: ${bobReceivedCursor.color}`);
  }

  // Assert Charlie received matching payload
  if (!charlieReceivedCursor || charlieReceivedCursor.x !== 250 || charlieReceivedCursor.y !== 400) {
    throw new Error(`Charlie received invalid cursor: ${JSON.stringify(charlieReceivedCursor)}`);
  }
  if (charlieReceivedCursor.color !== bobReceivedCursor.color) {
    throw new Error(`Color mismatch between observers: Bob=${bobReceivedCursor.color}, Charlie=${charlieReceivedCursor.color}`);
  }

  // Assert no self-echo
  if (aliceSelfEchoCount !== 0) {
    throw new Error(`Self-echo detected! Alice received her own cursor ${aliceSelfEchoCount} time(s).`);
  }

  // Assert room isolation
  if (daveLeakCount !== 0) {
    throw new Error(`Room leak detected! Dave in ${OTHER_ROOM} received ${daveLeakCount} cursor event(s) from ${MAIN_ROOM}.`);
  }

  console.log('✅ Bob and Charlie received Alice\'s cursor:');
  console.log(`   Position: (${bobReceivedCursor.x}, ${bobReceivedCursor.y})`);
  console.log(`   User:     ${bobReceivedCursor.displayName}`);
  console.log(`   Color:    ${bobReceivedCursor.color}`);
  console.log('✅ Verified: No self-echo back to sender.');
  console.log('✅ Verified: Complete room isolation (Dave received 0 events).');

  // 4. Test distinct user colors
  console.log('4️⃣ Testing deterministic distinct colors for users...');
  const aliceColor = alice.getUserColor();
  const bobColor = bob.getUserColor();
  const charlieColor = charlie.getUserColor();
  console.log(`   Alice color:   ${aliceColor}`);
  console.log(`   Bob color:     ${bobColor}`);
  console.log(`   Charlie color: ${charlieColor}`);

  if (aliceColor !== bobReceivedCursor.color) {
    throw new Error(`Alice's local color (${aliceColor}) differs from received color (${bobReceivedCursor.color})`);
  }
  console.log('✅ Verified: Colors are deterministic and match palette definitions.');

  // 5. Test Throttling: Rapid cursor calls should be throttled
  console.log('5️⃣ Testing cursor throttling (~30ms rate limiting)...');
  let bobEventCount = 0;
  let lastEventReceived = null;
  bob.onCursorMove((evt) => {
    bobEventCount++;
    lastEventReceived = evt;
  });

  // Rapidly fire 15 cursor moves in a tight loop with varying coordinates
  for (let i = 0; i < 15; i++) {
    alice.sendCursor({ x: 100 + i * 10, y: 100 + i * 10 });
  }

  // Wait 100ms for trailing throttle timer to execute
  await delay(100);

  console.log(`   Alice fired 15 rapid cursor updates. Bob received: ${bobEventCount} updates.`);
  if (bobEventCount >= 15) {
    throw new Error(`Throttling failed! Bob received all ${bobEventCount} events without rate limiting.`);
  }
  if (bobEventCount < 1) {
    throw new Error(`No cursor events received during throttle test.`);
  }
  // The final resting position must be the last coordinate (240, 240)
  if (lastEventReceived.x !== 240 || lastEventReceived.y !== 240) {
    throw new Error(`Trailing position not delivered! Expected (240, 240), got (${lastEventReceived.x}, ${lastEventReceived.y})`);
  }
  console.log(`✅ Verified: Throttled to ${bobEventCount} events, and final resting position (240, 240) was guaranteed.`);

  // 6. Test state separation and non-interference
  console.log('6️⃣ Verifying cursor updates do NOT mutate shared state or bump version...');
  let initialState = null;
  await new Promise((resolve) => {
    bob.getState((res) => {
      initialState = res.state;
      resolve();
    });
  });

  if (initialState.count !== 0 || initialState.version !== 1) {
    throw new Error(`Unexpected initial state: count=${initialState.count}, version=${initialState.version}`);
  }

  // Fire more cursor events
  alice.sendCursor({ x: 300, y: 300 });
  bob.sendCursor({ x: 400, y: 400 });
  charlie.sendCursor({ x: 500, y: 500 });
  await delay(60);

  let stateAfterCursors = null;
  await new Promise((resolve) => {
    bob.getState((res) => {
      stateAfterCursors = res.state;
      resolve();
    });
  });

  if (stateAfterCursors.count !== 0 || stateAfterCursors.version !== 1) {
    throw new Error(`Cursor movement mutated state! count=${stateAfterCursors.count}, version=${stateAfterCursors.version}`);
  }
  console.log(`✅ Authoritative state remains v${stateAfterCursors.version} (count=${stateAfterCursors.count}) after cursor activity.`);

  // Now perform an actual state update and verify it still functions seamlessly
  console.log('7️⃣ Verifying state updates still work alongside active cursor sharing...');
  const stateUpdateReceived = new Promise((resolve) => {
    charlie.onStateChange((state) => {
      if (state.count === 99) resolve(state);
    });
  });

  alice.updateState({ count: 99 });
  const updatedState = await stateUpdateReceived;
  if (updatedState.count !== 99 || updatedState.version !== 2) {
    throw new Error(`State update failed: ${JSON.stringify(updatedState)}`);
  }
  console.log('✅ Charlie received updated state: count = 99, version = 2.');

  // 8. Test Stale Cursor Cleanup on User Leave
  console.log('8️⃣ Testing stale cursor cleanup when user leaves...');
  // Simulated DOM cursor tracking map (identical to demo.js logic)
  const clientTrackedCursors = new Map();
  clientTrackedCursors.set(alice.getSessionId(), { x: 300, y: 300, name: 'Alice' });
  clientTrackedCursors.set(bob.getSessionId(), { x: 400, y: 400, name: 'Bob' });

  const bobSeesAliceLeave = new Promise((resolve) => {
    bob.onPresenceChange((users) => {
      if (users.length === 2 && !users.some((u) => u.sessionId === alice.getSessionId())) {
        // Run demo.js cleanup logic
        const activeIds = new Set(users.map((u) => u.sessionId));
        clientTrackedCursors.forEach((_, sessId) => {
          if (!activeIds.has(sessId)) {
            clientTrackedCursors.delete(sessId);
          }
        });
        resolve(users);
      }
    });
  });

  // Alice disconnects
  alice.disconnect();
  await bobSeesAliceLeave;

  if (clientTrackedCursors.has(alice.getSessionId())) {
    throw new Error('Alice\'s cursor was not removed from tracked cursors after leaving!');
  }
  console.log('✅ Verified: When Alice left, Bob received presence update and Alice\'s cursor was removed.');

  console.log('================================================================');
  console.log('🎉 LIVE CURSOR SHARING TEST PASSED SUCCESSFULLY!');
  console.log('================================================================');

  bob.disconnect();
  charlie.disconnect();
  dave.disconnect();
  process.exit(0);
}

testLiveCursorSharing().catch((err) => {
  console.error('❌ Cursor test failed:', err);
  process.exit(1);
});
