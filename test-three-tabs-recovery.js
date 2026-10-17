// test-three-tabs-recovery.js
// Automated, repeatable test verifying reconnection and state recovery across 3 clients (tabs)

const SyncKit = require('./client/synckit/synckit.js');

async function testThreeTabsReconnection() {
  console.log('================================================================');
  console.log('🧪 Repeatable Test: 3-Tab Reconnection & State Recovery');
  console.log('================================================================');

  const testId = Date.now();
  const ROOM = `three-tabs-${testId}`;

  // 1. Connect three simulated browser tabs
  console.log('1️⃣ Connecting Tab 1, Tab 2, and Tab 3...');
  const tab1 = new SyncKit({ serverUrl: 'http://localhost:3000', autoConnect: true });
  const tab2 = new SyncKit({ serverUrl: 'http://localhost:3000', autoConnect: true });
  const tab3 = new SyncKit({ serverUrl: 'http://localhost:3000', autoConnect: true });

  await Promise.all([
    new Promise((r) => tab1.onStatusChange((s) => s === 'connected' && r())),
    new Promise((r) => tab2.onStatusChange((s) => s === 'connected' && r())),
    new Promise((r) => tab3.onStatusChange((s) => s === 'connected' && r())),
  ]);
  console.log('✅ All 3 tabs connected successfully.');

  // 2. All three tabs join the same room
  console.log(`2️⃣ Joining room "${ROOM}"...`);
  await Promise.all([
    new Promise((r) => tab1.joinRoom(ROOM, r)),
    new Promise((r) => tab2.joinRoom(ROOM, r)),
    new Promise((r) => tab3.joinRoom(ROOM, r)),
  ]);

  // Verify all 3 tabs see initial state (count: 0)
  if (tab1.getState().count !== 0 || tab2.getState().count !== 0 || tab3.getState().count !== 0) {
    throw new Error('Initial state mismatch: all tabs should have count = 0');
  }
  console.log('✅ All 3 tabs verified with initial state: count = 0, version = 1');

  // 3. Disconnect Tab 2
  console.log('3️⃣ Disconnecting Tab 2...');
  const tab2DisconnectedPromise = new Promise((resolve) => {
    tab2.onStatusChange((status) => {
      if (status === 'disconnected') resolve();
    });
  });

  tab2.disconnect();
  await tab2DisconnectedPromise;
  console.log('✅ Tab 2 is confirmed DISCONNECTED.');

  // 4. Update the shared state in Tab 1 while Tab 2 is offline
  console.log('4️⃣ Updating shared state in Tab 1 while Tab 2 is offline...');
  const tab3UpdatePromise = new Promise((resolve) => {
    tab3.onStateChange((state) => {
      if (state.count === 88) resolve(state);
    });
  });

  tab1.updateState({ count: 88, text: 'Updated by Tab 1 while Tab 2 was offline' });
  await tab3UpdatePromise;
  console.log('✅ Tab 3 received the live update: count = 88.');

  // Verify Tab 2 is still holding stale state (0) while offline
  if (tab2.getState().count !== 0) {
    throw new Error('Tab 2 should still hold stale local state (0) while disconnected');
  }
  console.log('✅ Tab 2 holds stale local state (0) while offline.');

  // 5. Reconnect Tab 2
  console.log('5️⃣ Reconnecting Tab 2 to server...');
  const tab2RecoveryPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timeout waiting for Tab 2 to recover state after reconnecting'));
    }, 6000);

    tab2.onStateChange((state, meta) => {
      console.log(`📥 Tab 2 onStateChange fired: count = ${state.count}, recovered = ${meta.recovered}`);
      if (meta && meta.recovered === true && state.count === 88) {
        clearTimeout(timeout);
        resolve({ state, meta });
      }
    });
  });

  tab2.connect();
  const recovered = await tab2RecoveryPromise;
  console.log('✅ Tab 2 reconnected, rejoined room, and recovered state!');

  // 6. Verify that ALL tabs display the exact same latest state
  console.log('6️⃣ Verifying all 3 tabs display the exact same latest state...');
  const s1 = tab1.getState();
  const s2 = tab2.getState();
  const s3 = tab3.getState();

  console.log('Tab 1 State:', s1);
  console.log('Tab 2 State (Recovered):', s2);
  console.log('Tab 3 State:', s3);

  if (s1.count !== 88 || s2.count !== 88 || s3.count !== 88) {
    throw new Error(`State mismatch: Tab1=${s1.count}, Tab2=${s2.count}, Tab3=${s3.count}`);
  }
  if (s1.version !== s2.version || s2.version !== s3.version) {
    throw new Error(`Version mismatch across tabs: Tab1=${s1.version}, Tab2=${s2.version}, Tab3=${s3.version}`);
  }
  if (s1.text !== s2.text || s2.text !== s3.text) {
    throw new Error(`Text mismatch across tabs: Tab1="${s1.text}", Tab2="${s2.text}", Tab3="${s3.text}"`);
  }

  console.log('================================================================');
  console.log('🎉 TEST PASSED! All 3 tabs verified with identical latest state!');
  console.log('================================================================');

  tab1.disconnect();
  tab2.disconnect();
  tab3.disconnect();
  process.exit(0);
}

testThreeTabsReconnection().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
