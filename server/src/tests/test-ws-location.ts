import { io, Socket } from 'socket.io-client';
import redis from '../shared/lib/redis';

const BASE_URL = 'http://localhost:3000';

interface AuthResponse {
  success: boolean;
  accessToken: string;
  userId: number;
  [key: string]: unknown;
}

interface ConnectResponse {
  range: number;
  expiresAt: string;
  error?: string;
}

async function runTest(): Promise<void> {
  console.log('🔧 Connecting to Redis...');
  await redis.connect();

  const deviceId = `test-device-${Date.now()}`;

  // Step 1: Authenticate
  console.log('\n🔧 Step 1: Authenticate via device endpoint...');
  const authRes = await fetch(`${BASE_URL}/api/auth/device`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId }),
  });
  const authData = (await authRes.json()) as AuthResponse;
  if (!authData.success) {
    throw new Error(`Auth failed: ${JSON.stringify(authData)}`);
  }
  const { accessToken, userId } = authData;
  console.log(`   ✅ Got access token for user ${userId}`);

  // Step 2: Connect to location sharing
  console.log('\n📍 Step 2: Connect to location sharing...');
  const connectRes = await fetch(`${BASE_URL}/api/location/connect`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ range: 1000, durationMinutes: 30 }),
  });
  const connectData = (await connectRes.json()) as ConnectResponse;
  if (connectData.error) {
    throw new Error(`Connect failed: ${JSON.stringify(connectData)}`);
  }
  console.log('   ✅ Connected:', connectData);

  // Shorten TTL to 5s for testing
  const sessionKey = `location:session:${userId}`;
  await redis.expire(sessionKey, 5);
  console.log('   ⏱️  Set TTL to 5s for quick expiry test');

  // Step 3: Open WebSocket
  console.log('\n🌐 Step 3: Open WebSocket connection...');
  const socket: Socket = io(BASE_URL, {
    auth: { token: accessToken },
    transports: ['websocket'],
  });

  let sessionExpiredReceived = false;
  let usersReceived = false;

  socket.on('connect', () => {
    console.log('   ✅ WebSocket connected');

    // Step 4: Emit location:update
    console.log('\n📤 Step 4: Emit location:update...');
    socket.emit('location:update', { latitude: 37.38, longitude: -5.99 });
    console.log('   ✅ Emitted location update');
  });

  socket.on('connect_error', (err: Error) => {
    console.error('   ❌ WS connect error:', err.message);
  });

  socket.on('location:users', (users: unknown) => {
    usersReceived = true;
    console.log('   📥 Received location:users:', users);
  });

  socket.on('location:session_expired', () => {
    sessionExpiredReceived = true;
    console.log('   ⏰ Received location:session_expired');
  });

  // Step 5: Wait for session expiry
  console.log('\n⏳ Step 5: Waiting for session expiry (~7s)...');
  await new Promise((resolve) => setTimeout(resolve, 8000));

  // Verify
  console.log('\n📋 Verification:');
  console.log('   Users event received:', usersReceived ? '✅ YES' : '⚠️ NO (might be empty)');
  console.log('   Session expired event received:', sessionExpiredReceived ? '✅ YES' : '❌ NO');

  if (!sessionExpiredReceived) {
    console.error('\n❌ FAIL: location:session_expired was not received');
  } else {
    console.log('\n✅ PASS: Session expiry event fired correctly');
  }

  // Cleanup
  socket.disconnect();
  await redis.del(sessionKey);
  await redis.zrem('geo:connected_users', String(userId));
  await redis.quit();

  process.exit(sessionExpiredReceived ? 0 : 1);
}

runTest().catch((err) => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});
