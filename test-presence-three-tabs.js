// test-presence-three-tabs.js
// Automated test verifying room presence across three tabs, including custom display names,
// disconnect cleanup, and reconnection deduplication.

const SyncKit = require('./client/synckit/synckit.js');

async function testPresenceAcrossThreeTabs() {
  console.log('================================================================');
  console.log('🧪 Repeatable Test: Room Presence with 3 Tabs');
  console.log('================================================================');

  const testId = Date.now();
  const ROOM = `presence-room-${testId}`;

  // 1. Initialize three tabs with unique session IDs and custom display names
  console.log('1️⃣ Connecting Alice, Bob, and Charlie...');
  const alice = new SyncKit({
    serverUrl: 'http://localhost:3000',
    sessionId: `sess_alice_${testId}`,
    displayName: 'Alice',
    autoConnect: true,
  });

  const bob = new SyncKit({
    serverUrl: 'http://localhost:3000',
    sessionId: `sess_bob_${testId}`,
    displayName: 'Bob',
    autoConnect: true,
  });

  const charlie = new SyncKit({
    serverUrl: 'http://localhost:3000',
    sessionId: `sess_charlie_${testId}`,
    displayName: 'Charlie',
    autoConnect: true,
  });

  await Promise.all([
    new Promise((r) => alice.onStatusChange((s) => s === 'connected' && r())),
    new Promise((r) => bob.onStatusChange((s) => s === 'connected' && r())),
    new Promise((r) => charlie.onStatusChange((s) => s === 'connected' && r())),
  ]);
  console.log('✅ Alice, Bob, and Charlie connected.');

  // 2. All three join the same room
  console.log(`2️⃣ All three tabs join room "${ROOM}"...`);
  await Promise.all([
    new Promise((r) => alice.joinRoom(ROOM, r)),
    new Promise((r) => bob.joinRoom(ROOM, r)),
    new Promise((r) => charlie.joinRoom(ROOM, r)),
  ]);

  // Wait for all 3 tabs to see all 3 members
  const checkInitialPresence = (tab) =>
    new Promise((resolve) => {
      if (tab.getPresence().length === 3) return resolve(tab.getPresence());
      tab.onPresenceChange((users) => {
        if (users.length === 3) resolve(users);
      });
    });

  const [aliceListInit, bobListInit, charlieListInit] = await Promise.all([
    checkInitialPresence(alice),
    checkInitialPresence(bob),
    checkInitialPresence(charlie),
  ]);

  console.log('Online users seen by Alice:', aliceListInit.map((u) => u.displayName));
  console.log('Online users seen by Charlie:', charlieListInit.map((u) => u.displayName));

  const names = aliceListInit.map((u) => u.displayName).sort();
  if (JSON.stringify(names) !== JSON.stringify(['Alice', 'Bob', 'Charlie'])) {
    throw new Error(`Presence names mismatch: ${JSON.stringify(names)}`);
  }
  console.log('✅ Presence verified: Alice, Bob, and Charlie are all visible.');

  // 3. Disconnect Bob (Tab 2)
  console.log('3️⃣ Disconnecting Bob (Tab 2)...');
  const waitForBobLeave = (tab) =>
    new Promise((resolve) => {
      tab.onPresenceChange((users) => {
        if (users.length === 2 && !users.some((u) => u.displayName === 'Bob')) {
          resolve(users);
        }
      });
    });

  const aliceSeesBobLeave = waitForBobLeave(alice);
  const charlieSeesBobLeave = waitForBobLeave(charlie);

  bob.disconnect();
  const [aliceAfterLeave, charlieAfterLeave] = await Promise.all([
    aliceSeesBobLeave,
    charlieSeesBobLeave,
  ]);

  console.log('Alice sees active users:', aliceAfterLeave.map((u) => u.displayName));
  console.log('Charlie sees active users:', charlieAfterLeave.map((u) => u.displayName));
  console.log('✅ Verified: Bob was removed immediately upon disconnection for all remaining tabs.');

  // 4. Alice updates her display name to "Alice (Lead)"
  console.log('4️⃣ Alice updates her display name to "Alice (Lead)"...');
  const charlieSeesNameChange = new Promise((resolve) => {
    charlie.onPresenceChange((users) => {
      const updated = users.find((u) => u.sessionId === alice.getSessionId());
      if (updated && updated.displayName === 'Alice (Lead)') {
        resolve(users);
      }
    });
  });

  alice.setDisplayName('Alice (Lead)');
  await charlieSeesNameChange;
  console.log('✅ Charlie received Alice\'s updated display name in real-time.');

  // 5. Reconnect Bob with his existing session identifier
  console.log('5️⃣ Reconnecting Bob (Tab 2)...');
  const waitForBobReturn = (tab) =>
    new Promise((resolve) => {
      tab.onPresenceChange((users) => {
        if (users.length === 3 && users.some((u) => u.displayName === 'Bob')) {
          resolve(users);
        }
      });
    });

  const aliceSeesBobReturn = waitForBobReturn(alice);
  const charlieSeesBobReturn = waitForBobReturn(charlie);
  const bobSeesAllThree = waitForBobReturn(bob);

  bob.connect();
  const [finalAlice, finalCharlie, finalBob] = await Promise.all([
    aliceSeesBobReturn,
    charlieSeesBobReturn,
    bobSeesAllThree,
  ]);

  console.log('6️⃣ Verifying final presence across all 3 tabs:');
  console.log('Alice sees:', finalAlice.map((u) => u.displayName));
  console.log('Bob sees:', finalBob.map((u) => u.displayName));
  console.log('Charlie sees:', finalCharlie.map((u) => u.displayName));

  // Check that Bob does not appear twice (Requirement 6: Deduplication)
  const bobCountInPresence = finalAlice.filter((u) => u.sessionId === bob.getSessionId()).length;
  if (bobCountInPresence !== 1) {
    throw new Error(`Duplicate entry found for Bob! Count = ${bobCountInPresence}`);
  }
  console.log('✅ Verified: No duplicate presence entries after reconnection.');

  if (finalAlice.length !== 3 || finalBob.length !== 3 || finalCharlie.length !== 3) {
    throw new Error('Presence count mismatch across tabs');
  }

  console.log('================================================================');
  console.log('🎉 PRESENCE TEST PASSED SUCCESSFULLY!');
  console.log('================================================================');

  alice.disconnect();
  bob.disconnect();
  charlie.disconnect();
  process.exit(0);
}

testPresenceAcrossThreeTabs().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
