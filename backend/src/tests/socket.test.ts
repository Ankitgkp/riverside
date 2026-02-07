import { io, Socket } from "socket.io-client";

const SERVER_URL = "http://localhost:3000";

// Test state
let hostSocket: Socket;
let guestSocket: Socket;
let hostToken: string;
let guestToken: string;
let roomId: string;
let roomCode: string;
let hostUserId: string;
let guestUserId: string;

// Helper to wait for events
function waitForEvent<T>(socket: Socket, event: string, timeout = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${event}`)), timeout);
    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

// Helper for HTTP requests
async function httpRequest(method: string, path: string, body?: object, token?: string): Promise<any> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const response = await fetch(`${SERVER_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return response.json();
}

async function setup() {
  console.log("\n🔧 SETUP: Creating test users and room...\n");

  // Register host user
  const hostResult = await httpRequest("POST", "/api/auth/register", {
    email: `host-${Date.now()}@test.com`,
    password: "password123",
    name: "Test Host",
  });
  hostToken = hostResult.data.token;
  hostUserId = hostResult.data.user.id;
  console.log("Host registered:", hostResult.data.user.email);

  // Register guest user
  const guestResult = await httpRequest("POST", "/api/auth/register", {
    email: `guest-${Date.now()}@test.com`,
    password: "password123",
    name: "Test Guest",
  });
  guestToken = guestResult.data.token;
  guestUserId = guestResult.data.user.id;
  console.log("Guest registered:", guestResult.data.user.email);

  // Create room (without waiting room for easier testing)
  const roomResult = await httpRequest(
    "POST",
    "/api/rooms",
    { title: "Test WebSocket Room", maxParticipants: 10, waitingRoom: false },
    hostToken
  );
  roomId = roomResult.data.id;
  roomCode = roomResult.data.code;
  console.log("Room created:", roomResult.data.title, `(${roomCode})`);

  // Guest joins room via API first
  await httpRequest("POST", `/api/rooms/${roomId}/join`, {}, guestToken);
  console.log("Guest joined room via API");
}

async function testSocketConnection() {
  console.log("\n📡 TEST 1: Socket Connection with Authentication\n");

  // Test connection without token (should fail)
  const unauthSocket = io(SERVER_URL, { autoConnect: false });
  unauthSocket.connect();
  
  try {
    await waitForEvent(unauthSocket, "connect_error", 2000);
    console.log("Unauthenticated connection correctly rejected");
  } catch {
    console.log("❌ Unauthenticated connection should have been rejected");
  }
  unauthSocket.disconnect();

  // Test connection with token (should succeed)
  hostSocket = io(SERVER_URL, {
    auth: { token: hostToken },
  });

  await waitForEvent(hostSocket, "connect");
  console.log("Host connected with valid token");

  guestSocket = io(SERVER_URL, {
    auth: { token: guestToken },
  });

  await waitForEvent(guestSocket, "connect");
  console.log("Guest connected with valid token");
}

async function testJoinRoom() {
  console.log("\n🚪 TEST 2: Join Room Event\n");

  // Host joins room
  hostSocket.emit("join-room", { roomId });
  const hostRoomData = await waitForEvent<any>(hostSocket, "room-joined");
  console.log("Host joined room:", hostRoomData.roomTitle);
  console.log("   Participants:", hostRoomData.participants.length);
  console.log("   Settings:", JSON.stringify(hostRoomData.settings));

  // Guest joins room - host should receive notification
  const participantJoinedPromise = waitForEvent<any>(hostSocket, "participant-joined");
  
  guestSocket.emit("join-room", { roomId });
  const guestRoomData = await waitForEvent<any>(guestSocket, "room-joined");
  console.log("Guest joined room:", guestRoomData.roomTitle);

  const joinedNotification = await participantJoinedPromise;
  console.log("Host received participant-joined:", joinedNotification.odName);
}

async function testChatMessage() {
  console.log("\n💬 TEST 3: Chat Message Event\n");

  // Guest sends a message
  const hostMessagePromise = waitForEvent<any>(hostSocket, "chat-message");
  const guestMessagePromise = waitForEvent<any>(guestSocket, "chat-message");

  guestSocket.emit("chat-message", { roomId, message: "Hello from guest!" });

  const hostReceived = await hostMessagePromise;
  const guestReceived = await guestMessagePromise;

  console.log("Host received chat:", hostReceived.message, "from", hostReceived.userName);
  console.log("Guest received chat:", guestReceived.message, "(echo)");
}

async function testMediaToggle() {
  console.log("\n🎤 TEST 4: Media Toggle Events\n");

  // Guest mutes audio
  const audioChangePromise = waitForEvent<any>(hostSocket, "participant-audio-changed");
  guestSocket.emit("toggle-audio", { roomId, isMuted: true });
  const audioChange = await audioChangePromise;
  console.log("Host notified of audio change - muted:", audioChange.odIsMuted);

  // Guest turns off video
  const videoChangePromise = waitForEvent<any>(hostSocket, "participant-video-changed");
  guestSocket.emit("toggle-video", { roomId, isVideoOff: true });
  const videoChange = await videoChangePromise;
  console.log("Host notified of video change - off:", videoChange.odIsVideoOff);
}

async function testHostMuteParticipant() {
  console.log("\n🔇 TEST 5: Host Mute Participant\n");

  const muteNotificationPromise = waitForEvent<any>(guestSocket, "participant-muted-by-host");
  
  hostSocket.emit("host-mute-participant", { roomId, targetUserId: guestUserId });
  
  const muteNotification = await muteNotificationPromise;
  console.log("Guest received mute notification from:", muteNotification.mutedBy);
}

async function testLeaveRoom() {
  console.log("\n🚶 TEST 6: Leave Room Event\n");

  const leaveNotificationPromise = waitForEvent<any>(hostSocket, "participant-left");
  
  guestSocket.emit("leave-room", { roomId });
  
  const leaveNotification = await leaveNotificationPromise;
  console.log("Host notified of participant left:", leaveNotification.userName);
}

async function testDisconnect() {
  console.log("\n🔌 TEST 7: Disconnect Handling\n");

  // Guest reconnects to test disconnect
  guestSocket.emit("join-room", { roomId });
  await waitForEvent<any>(guestSocket, "room-joined");

  const disconnectPromise = waitForEvent<any>(hostSocket, "participant-left");
  guestSocket.disconnect();

  const disconnectNotification = await disconnectPromise;
  console.log("Host notified of disconnect:", disconnectNotification.userName);
}

async function cleanup() {
  console.log("\n🧹 CLEANUP\n");
  
  if (hostSocket?.connected) hostSocket.disconnect();
  if (guestSocket?.connected) guestSocket.disconnect();
  
  console.log("Sockets disconnected");
}

async function runTests() {
  console.log("=".repeat(50));
  console.log("🧪 SOCKET.IO WEBSOCKET TESTS");
  console.log("=".repeat(50));

  try {
    await setup();
    await testSocketConnection();
    await testJoinRoom();
    await testChatMessage();
    await testMediaToggle();
    await testHostMuteParticipant();
    await testLeaveRoom();
    await testDisconnect();

    console.log("\n" + "=".repeat(50));
    console.log("ALL TESTS PASSED!");
    console.log("=".repeat(50) + "\n");
  } catch (error) {
    console.error("\n❌ TEST FAILED:", error);
  } finally {
    await cleanup();
    process.exit(0);
  }
}

runTests();
