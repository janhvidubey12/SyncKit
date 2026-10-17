// test-reactions.js
// Automated test suite for SyncKit Real-Time Reactions & Room Isolation
//
// Verifies:
// 1. Clicking a reaction in Tab A displays it in Tab B in real time.
// 2. Clicking a reaction in Tab B displays it in Tab A.
// 3. Reactions do NOT leak into different rooms (strict room isolation).
// 4. All 6 required reactions work (❤️, 🔥, 😂, 👍, 🎉, ⚡).
// 5. Rapid multiple clicks are handled cleanly.
// 6. Reactions are ephemeral (do not pollute or bump authoritative shared state).

const SyncKit = require('./client/synckit/synckit.js');

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runReactionsTest() {
  console.log('================================================================');
  console.log('🧪 Repeatable Test: Real-Time Reactions & Room Isolation');
  console.log('================================================================');

  const testId = Date.now();
  const ROOM_A = `reactions-room-a-${testId}`;
  const ROOM_B = `reactions-room-b-${testId}`;

  // 1. Connect Tab 1 (Alice), Tab 2 (Bob), and Tab 3 (Charlie)
  console.log('1️⃣ Connecting Tab 1 (Alice), Tab 2 (Bob), and Tab 3 (Charlie)...');
  const client1 = new SyncKit({ serverUrl: 'http://localhost:3000', displayName: 'Alice', autoConnect: true });
  const client2 = new SyncKit({ serverUrl: 'http://localhost:3000', displayName: 'Bob', autoConnect: true });
  const client3 = new SyncKit({ serverUrl: 'http://localhost:3000', displayName: 'Charlie', autoConnect: true });

  await Promise.all([
    new Promise((r) => client1.onStatusChange((s) => s === 'connected' && r())),
    new Promise((r) => client2.onStatusChange((s) => s === 'connected' && r())),
    new Promise((r) => client3.onStatusChange((s) => s === 'connected' && r())),
  ]);
  console.log('✅ All 3 tabs connected to SyncKit server.');

  // Join rooms
  console.log(`2️⃣ Tab 1 & Tab 2 join "${ROOM_A}", Tab 3 joins isolated "${ROOM_B}"...`);
  await Promise.all([
    new Promise((r) => client1.joinRoom(ROOM_A, r)),
    new Promise((r) => client2.joinRoom(ROOM_A, r)),
    new Promise((r) => client3.joinRoom(ROOM_B, r)),
  ]);
  console.log('✅ Room memberships established.');

  // Track if Tab 3 receives any leak
  let charlieReceivedLeak = false;
  client3.onReaction(() => {
    charlieReceivedLeak = true;
  });

  // ==========================================
  // Test 1: Tab A sends reaction; Tab B receives it
  // ==========================================
  console.log('3️⃣ [Test 1] Clicking reaction in Tab A displays it in Tab B...');
  const bobReactionPromise = new Promise((resolve) => {
    client2.onReaction((event) => {
      resolve(event);
    });
  });

  client1.sendReaction('❤️');
  const receivedByBob = await bobReactionPromise;

  if (receivedByBob.emoji !== '❤️' || receivedByBob.displayName !== 'Alice') {
    throw new Error(`Test 1 Failed: Expected { emoji: '❤️', displayName: 'Alice' }, got: ${JSON.stringify(receivedByBob)}`);
  }
  console.log('✅ [Test 1 Passed] Tab B received Alice\'s ❤️ reaction in real time.');

  // ==========================================
  // Test 2: Tab B sends reaction; Tab A receives it
  // ==========================================
  console.log('4️⃣ [Test 2] Clicking reaction in Tab B displays it in Tab A...');
  const aliceReactionPromise = new Promise((resolve) => {
    client1.onReaction((event) => {
      resolve(event);
    });
  });

  client2.sendReaction('🔥');
  const receivedByAlice = await aliceReactionPromise;

  if (receivedByAlice.emoji !== '🔥' || receivedByAlice.displayName !== 'Bob') {
    throw new Error(`Test 2 Failed: Expected { emoji: '🔥', displayName: 'Bob' }, got: ${JSON.stringify(receivedByAlice)}`);
  }
  console.log('✅ [Test 2 Passed] Tab A received Bob\'s 🔥 reaction in real time.');

  // ==========================================
  // Test 3: Room Isolation (Tab 3 in Room B must NOT receive Room A reactions)
  // ==========================================
  console.log('5️⃣ [Test 3] Verifying room isolation (Tab 3 receives 0 reactions from Room A)...');
  await delay(100);
  if (charlieReceivedLeak) {
    throw new Error('Test 3 Failed: Charlie in Room B received reactions from Room A!');
  }
  console.log('✅ [Test 3 Passed] Room isolation verified: 0 reaction leaks to Room B.');

  // ==========================================
  // Test 4: Verify all 6 required reactions
  // ❤️ Love, 🔥 Fire, 😂 Laugh, 👍 Like, 🎉 Celebrate, ⚡ Wow
  // ==========================================
  console.log('6️⃣ [Test 4] Verifying all 6 required emoji reactions...');
  const REQUIRED_REACTIONS = ['❤️', '🔥', '😂', '👍', '🎉', '⚡'];
  const receivedList = [];

  const allReactionsPromise = new Promise((resolve) => {
    const unsub = client2.onReaction((data) => {
      receivedList.push(data.emoji);
      if (receivedList.length === REQUIRED_REACTIONS.length) {
        unsub();
        resolve(receivedList);
      }
    });
  });

  for (const emoji of REQUIRED_REACTIONS) {
    client1.sendReaction(emoji);
    await delay(20);
  }

  const allReceived = await allReactionsPromise;
  const missing = REQUIRED_REACTIONS.filter((r) => !allReceived.includes(r));
  if (missing.length > 0) {
    throw new Error(`Test 4 Failed: Missing reactions: ${missing.join(', ')}`);
  }
  console.log(`✅ [Test 4 Passed] All 6 reactions verified: ${REQUIRED_REACTIONS.join(' ')}`);

  // ==========================================
  // Test 5: Rapid multiple clicks handled smoothly
  // ==========================================
  console.log('7️⃣ [Test 5] Testing rapid multiple clicks...');
  let rapidCount = 0;
  const rapidPromise = new Promise((resolve) => {
    client2.onReaction(() => {
      rapidCount++;
      if (rapidCount >= 5) resolve();
    });
  });

  for (let i = 0; i < 5; i++) {
    client1.sendReaction('🎉');
  }
  await rapidPromise;
  console.log(`✅ [Test 5 Passed] Successfully handled ${rapidCount} rapid reaction events.`);

  // ==========================================
  // Test 6: Verify reactions do not pollute or mutate authoritative state
  // ==========================================
  console.log('8️⃣ [Test 6] Verifying reactions do not mutate authoritative state...');
  const state = client1.getState();
  if (state.reactions !== undefined) {
    throw new Error('Test 6 Failed: Reactions must not be permanently stored in state!');
  }
  console.log('✅ [Test 6 Passed] Ephemeral broadcast verified: State remains clean.');

  console.log('================================================================');
  console.log('🎉 ALL REACTION TESTS PASSED SUCCESSFULLY!');
  console.log('================================================================');

  client1.disconnect();
  client2.disconnect();
  client3.disconnect();
  process.exit(0);
}

runReactionsTest().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
