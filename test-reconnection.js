// test-reconnection.js
// Automated test to verify that SyncKit recovers authoritative state after an actual disconnect.

const SyncKit = require('./client/synckit/synckit.js');
const { io } = require('socket.io-client');

async function testReconnectionRecovery() {
  console.log('====================================================');
  console.log('🧪 Starting Actual Disconnect & State Recovery Test');
  console.log('====================================================');

  const ROOM_NAME = `recovery-test-room-${Date.now()}`;

  // 1. Client A initializes and connects
  const clientA = new SyncKit({ serverUrl: 'http://localhost:3000', autoConnect: true });

  await new Promise((resolve) => {
    clientA.onStatusChange((status) => {
      if (status === 'connected') resolve();
    });
  });
  console.log('✅ Client A connected (Initial Socket ID:', clientA.getUserId() + ')');

  // 2. Client A joins the room
  await new Promise((resolve) => {
    clientA.joinRoom(ROOM_NAME, (res) => {
      if (res && res.success) resolve(res);
    });
  });
  console.log(`✅ Client A joined room "${ROOM_NAME}"`);

  // 3. Client A updates initial state to count = 10
  await new Promise((resolve) => {
    clientA.updateState({ count: 10, text: 'Initial value before disconnect' }, (res) => {
      if (res && res.success) resolve(res);
    });
  });
  console.log('✅ Client A set initial state: count = 10');

  // 4. Force an ACTUAL DISCONNECT on Client A
  console.log('⚡ Forcing an ACTUAL DISCONNECT on Client A...');
  const disconnectedPromise = new Promise((resolve) => {
    clientA.onStatusChange((status) => {
      if (status === 'disconnected') resolve();
    });
  });

  clientA.socket.disconnect();
  await disconnectedPromise;
  console.log('✅ Confirmed: Client A is now DISCONNECTED from server.');

  // 5. While Client A is offline, Client B joins and updates the server-authoritative state!
  console.log('👥 Client B connects while Client A is offline and mutates server state...');
  const clientB = new SyncKit({ serverUrl: 'http://localhost:3000', autoConnect: true });
  await new Promise((res) => {
    clientB.onStatusChange((status) => {
      if (status === 'connected') res();
    });
  });

  await new Promise((res) => clientB.joinRoom(ROOM_NAME, res));
  await new Promise((res) => {
    clientB.updateState({ count: 999, text: 'Mutated by Client B while Client A was offline' }, res);
  });
  console.log('✅ Client B updated room state to count = 999 on the authoritative server.');
  clientB.disconnect();

  // 6. Reconnect Client A and verify state recovery
  console.log('🔄 Reconnecting Client A to server...');
  const recoveryPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timeout waiting for state recovery after reconnection'));
    }, 6000);

    clientA.onStateChange((state, meta) => {
      console.log('📥 Client A received state update:', state, 'Meta:', meta);
      if (meta && meta.recovered === true) {
        clearTimeout(timeout);
        resolve({ state, meta });
      }
    });
  });

  // Re-establish connection
  clientA.socket.connect();

  const recovered = await recoveryPromise;
  console.log('====================================================');
  console.log('🎉 RECOVERY VERIFIED!');
  console.log(`Recovered count: ${recovered.state.count} (Expected: 999)`);
  console.log(`Recovered text:  "${recovered.state.text}"`);
  console.log(`Meta: recovered = ${recovered.meta.recovered}`);
  console.log(`New Socket ID:   ${clientA.getUserId()}`);
  console.log('====================================================');

  if (recovered.state.count !== 999) {
    throw new Error(`State count mismatch: expected 999, got ${recovered.state.count}`);
  }

  clientA.disconnect();
  process.exit(0);
}

testReconnectionRecovery().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
