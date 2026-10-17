const { io } = require('socket.io-client');

async function runTests() {
  console.log('--- Starting Shared State Verification Tests ---');

  // Generate unique room names per test run to ensure strict test isolation
  // even when testing against an already running server.
  const testRunId = Date.now();
  const roomAlpha = `room-alpha-${testRunId}`;
  const roomBeta = `room-beta-${testRunId}`;

  const client1 = io('http://localhost:3000');
  const client2 = io('http://localhost:3000');
  const client3 = io('http://localhost:3000'); // Will join an isolated room

  await new Promise((res) => {
    let connected = 0;
    const check = () => { if (++connected === 3) res(); };
    client1.on('connect', check);
    client2.on('connect', check);
    client3.on('connect', check);
  });
  console.log('✅ All 3 clients connected.');

  // Test 1: Client 1 joins a new room and receives fresh initial state (count must be 0)
  const state1 = await new Promise((res) => {
    client1.emit('join-room', { roomId: roomAlpha }, (ack) => res(ack));
  });
  console.log(`✅ Test 1: Client 1 joined ${roomAlpha}, initial state:`, state1.state);
  if (state1.state.count !== 0) throw new Error('Initial count should be 0');

  // Test 2: Client 2 joins the same room (receives current state)
  const state2 = await new Promise((res) => {
    client2.emit('join-room', { roomId: roomAlpha }, (ack) => res(ack));
  });
  console.log(`✅ Test 2: Client 2 joined ${roomAlpha}, received state:`, state2.state);

  // Test 3: Client 3 joins a different room (isolated room)
  const state3 = await new Promise((res) => {
    client3.emit('join-room', { roomId: roomBeta }, (ack) => res(ack));
  });
  console.log(`✅ Test 3: Client 3 joined ${roomBeta}, received isolated state:`, state3.state);

  let client3ReceivedUpdate = false;
  client3.on('state-updated', () => {
    client3ReceivedUpdate = true;
  });

  // Test 4: Client 1 updates state in roomAlpha
  const updatePromise = new Promise((resolve) => {
    client2.on('state-updated', (data) => {
      resolve(data);
    });
  });

  client1.emit('update-state', {
    roomId: roomAlpha,
    updates: { count: 42, text: 'Multiplayer rocks!' }
  });

  const updatedData = await updatePromise;
  console.log('✅ Test 4 & 6: Client 2 received broadcasted state update:', updatedData.state);
  if (updatedData.state.count !== 42 || updatedData.state.text !== 'Multiplayer rocks!') {
    throw new Error('State was not updated correctly');
  }
  if (updatedData.state.version !== 2) {
    throw new Error('Version was not incremented');
  }

  // Test 5: Verify room isolation (Client 3 in roomBeta must NOT receive updates from roomAlpha)
  await new Promise((r) => setTimeout(r, 200));
  if (client3ReceivedUpdate) {
    throw new Error(`Room isolation failed: Client 3 received ${roomAlpha} update!`);
  }
  console.log(`✅ Test 5 & 7: Room isolation verified: Client 3 received 0 updates from ${roomAlpha}.`);

  // Test 6: Explicit get-state request
  const fetchedState = await new Promise((res) => {
    client2.emit('get-state', { roomId: roomAlpha }, (ack) => res(ack));
  });
  console.log('✅ Test 8: Client 2 called get-state and received:', fetchedState.state);
  if (fetchedState.state.count !== 42) throw new Error('get-state failed');

  // Test 7: Validation - Client 3 tries to update roomAlpha without joining
  const unauthorizedRes = await new Promise((res) => {
    client3.emit('update-state', { roomId: roomAlpha, updates: { count: 999 } }, (ack) => res(ack));
  });
  console.log('✅ Test 9: Unauthorized room update rejected:', unauthorizedRes);
  if (unauthorizedRes.success !== false) throw new Error('Unauthorized update should be rejected');

  // Test 8: Validation - Dangerous key rejection (__proto__)
  const forbiddenRes = await new Promise((res) => {
    client1.emit('update-state', { roomId: roomAlpha, updates: { __proto__: { admin: true } } }, (ack) => res(ack));
  });
  console.log('✅ Test 10: Forbidden key rejection verified:', forbiddenRes);
  if (forbiddenRes.success !== false) throw new Error('Dangerous keys must be rejected');

  client1.disconnect();
  client2.disconnect();
  client3.disconnect();
  console.log('🎉 ALL TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
