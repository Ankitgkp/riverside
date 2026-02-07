import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { verifyToken } from "../middleware/auth.js";
import prisma from "../db.js";

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userName?: string;
}

interface RoomParticipant {
  odId: string;
  odName: string;
  odIsMuted: boolean;
  odIsVideoOff: boolean;
  odRole: "HOST" | "GUEST";
}

// Track active participants in rooms
const roomParticipants = new Map<string, Map<string, RoomParticipant>>();

export function setupSocketServer(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  // Authentication middleware
  io.use(async (socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace("Bearer ", "");
    
    if (!token) {
      return next(new Error("Authentication required"));
    }

    try {
      const decoded = verifyToken(token);
      if (!decoded) {
        return next(new Error("Invalid token"));
      }
      socket.userId = decoded.userId;
      
      // Get user name from database
      const user = await prisma.user.findUnique({ 
        where: { id: decoded.userId },
        select: { name: true }
      });
      socket.userName = user?.name || "Anonymous";
      
      next();
    } catch (error) {
      next(new Error("Authentication failed"));
    }
  });

  io.on("connection", (socket: AuthenticatedSocket) => {
    console.log(`User connected: ${socket.userId} (${socket.userName})`);

    // Join room event
    socket.on("join-room", async (data: { roomId: string; roomCode?: string }) => {
      try {
        const roomId = data.roomId;
        
        // Verify room exists and user is a participant
        const room = await prisma.room.findUnique({
          where: { id: roomId },
          include: {
            participants: {
              where: { userId: socket.userId, leftAt: null },
            },
          },
        });

        if (!room) {
          socket.emit("error", { message: "Room not found" });
          return;
        }

        if (!room.isActive) {
          socket.emit("error", { message: "Room is not active" });
          return;
        }

        const participant = room.participants[0];
        if (!participant) {
          socket.emit("error", { message: "You are not a participant in this room" });
          return;
        }

        // Join the socket room
        socket.join(roomId);

        // Initialize room participants map if not exists
        if (!roomParticipants.has(roomId)) {
          roomParticipants.set(roomId, new Map());
        }

        // Add participant to tracking
        const participantData: RoomParticipant = {
          odId: socket.userId!,
          odName: socket.userName!,
          odIsMuted: false,
          odIsVideoOff: !room.videoEnabled,
          odRole: participant.role as "HOST" | "GUEST",
        };
        roomParticipants.get(roomId)!.set(socket.userId!, participantData);

        // Send current participants list to the joining user
        const currentParticipants = Array.from(roomParticipants.get(roomId)!.values());
        socket.emit("room-joined", {
          roomId,
          roomCode: room.code,
          roomTitle: room.title,
          participants: currentParticipants,
          settings: {
            videoEnabled: room.videoEnabled,
            audioOnly: room.audioOnly,
            maxParticipants: room.maxParticipants,
          },
        });

        // Broadcast to others in the room
        socket.to(roomId).emit("participant-joined", {
          odId: socket.userId,
          odName: socket.userName,
          odRole: participant.role,
        });

        console.log(`User ${socket.userName} joined room ${roomId}`);
      } catch (error) {
        console.error("Error joining room:", error);
        socket.emit("error", { message: "Failed to join room" });
      }
    });

    // Leave room event
    socket.on("leave-room", async (data: { roomId: string }) => {
      try {
        const { roomId } = data;

        // Remove from socket room
        socket.leave(roomId);

        // Remove from tracking
        if (roomParticipants.has(roomId)) {
          roomParticipants.get(roomId)!.delete(socket.userId!);
          
          // Clean up empty rooms
          if (roomParticipants.get(roomId)!.size === 0) {
            roomParticipants.delete(roomId);
          }
        }

        // Broadcast to others
        socket.to(roomId).emit("participant-left", {
          userId: socket.userId,
          userName: socket.userName,
        });

        console.log(`User ${socket.userName} left room ${roomId}`);
      } catch (error) {
        console.error("Error leaving room:", error);
        socket.emit("error", { message: "Failed to leave room" });
      }
    });

    // Chat message event
    socket.on("chat-message", async (data: { roomId: string; message: string }) => {
      try {
        const { roomId, message } = data;

        if (!message || message.trim().length === 0) {
          return;
        }

        // Verify user is in the room
        if (!roomParticipants.has(roomId) || !roomParticipants.get(roomId)!.has(socket.userId!)) {
          socket.emit("error", { message: "You are not in this room" });
          return;
        }

        const chatMessage = {
          id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          userId: socket.userId,
          userName: socket.userName,
          message: message.trim(),
          timestamp: new Date().toISOString(),
        };

        // Broadcast to all in room including sender
        io.to(roomId).emit("chat-message", chatMessage);
      } catch (error) {
        console.error("Error sending chat message:", error);
        socket.emit("error", { message: "Failed to send message" });
      }
    });

    // Media state change events
    socket.on("toggle-audio", (data: { roomId: string; isMuted: boolean }) => {
      const { roomId, isMuted } = data;

      if (roomParticipants.has(roomId) && roomParticipants.get(roomId)!.has(socket.userId!)) {
        const participant = roomParticipants.get(roomId)!.get(socket.userId!)!;
        participant.odIsMuted = isMuted;

        socket.to(roomId).emit("participant-audio-changed", {
          odId: socket.userId,
          odIsMuted: isMuted,
        });
      }
    });

    socket.on("toggle-video", (data: { roomId: string; isVideoOff: boolean }) => {
      const { roomId, isVideoOff } = data;

      if (roomParticipants.has(roomId) && roomParticipants.get(roomId)!.has(socket.userId!)) {
        const participant = roomParticipants.get(roomId)!.get(socket.userId!)!;
        participant.odIsVideoOff = isVideoOff;

        socket.to(roomId).emit("participant-video-changed", {
          odId: socket.userId,
          odIsVideoOff: isVideoOff,
        });
      }
    });

    // Host control events
    socket.on("host-mute-participant", async (data: { roomId: string; targetUserId: string }) => {
      try {
        const { roomId, targetUserId } = data;

        // Verify caller is host
        const room = await prisma.room.findUnique({ where: { id: roomId } });
        if (!room || room.hostId !== socket.userId) {
          socket.emit("error", { message: "Only the host can mute participants" });
          return;
        }

        // Update participant state
        if (roomParticipants.has(roomId) && roomParticipants.get(roomId)!.has(targetUserId)) {
          const participant = roomParticipants.get(roomId)!.get(targetUserId)!;
          participant.odIsMuted = true;
        }

        // Notify the muted participant
        io.to(roomId).emit("participant-muted-by-host", {
          odId: targetUserId,
          mutedBy: socket.userName,
        });
      } catch (error) {
        console.error("Error muting participant:", error);
        socket.emit("error", { message: "Failed to mute participant" });
      }
    });

    socket.on("host-remove-participant", async (data: { roomId: string; targetUserId: string }) => {
      try {
        const { roomId, targetUserId } = data;

        // Verify caller is host
        const room = await prisma.room.findUnique({ where: { id: roomId } });
        if (!room || room.hostId !== socket.userId) {
          socket.emit("error", { message: "Only the host can remove participants" });
          return;
        }

        // Can't remove yourself as host
        if (targetUserId === socket.userId) {
          socket.emit("error", { message: "Host cannot remove themselves" });
          return;
        }

        // Update database - mark participant as left
        await prisma.participant.updateMany({
          where: { roomId, userId: targetUserId, leftAt: null },
          data: { leftAt: new Date() },
        });

        // Remove from tracking
        if (roomParticipants.has(roomId)) {
          roomParticipants.get(roomId)!.delete(targetUserId);
        }

        // Notify the removed participant
        io.to(roomId).emit("participant-removed-by-host", {
          odId: targetUserId,
          removedBy: socket.userName,
        });

        // Force disconnect the removed user from the room
        const sockets = await io.in(roomId).fetchSockets();
        for (const s of sockets) {
          const authSocket = s as unknown as AuthenticatedSocket;
          if (authSocket.userId === targetUserId) {
            authSocket.leave(roomId);
            authSocket.emit("you-were-removed", { roomId, removedBy: socket.userName });
          }
        }
      } catch (error) {
        console.error("Error removing participant:", error);
        socket.emit("error", { message: "Failed to remove participant" });
      }
    });

    // Waiting room events (for hosts)
    socket.on("approve-waiting-participant", async (data: { roomId: string; userId: string }) => {
      try {
        const { roomId, userId } = data;

        const room = await prisma.room.findUnique({ where: { id: roomId } });
        if (!room || room.hostId !== socket.userId) {
          socket.emit("error", { message: "Only the host can approve participants" });
          return;
        }

        // Update waiting room status and add as participant
        await prisma.waitingRoom.update({
          where: { userId_roomId: { userId, roomId } },
          data: { status: "APPROVED" },
        });

        await prisma.participant.create({
          data: { userId, roomId, role: "GUEST" },
        });

        // Notify the approved user
        io.to(roomId).emit("waiting-room-approved", { userId });
      } catch (error) {
        console.error("Error approving participant:", error);
        socket.emit("error", { message: "Failed to approve participant" });
      }
    });

    // Handle disconnection
    socket.on("disconnect", () => {
      console.log(`User disconnected: ${socket.userId}`);

      // Remove from all rooms they were in
      roomParticipants.forEach((participants, roomId) => {
        if (participants.has(socket.userId!)) {
          participants.delete(socket.userId!);

          // Notify others
          socket.to(roomId).emit("participant-left", {
            userId: socket.userId,
            userName: socket.userName,
          });

          // Clean up empty rooms
          if (participants.size === 0) {
            roomParticipants.delete(roomId);
          }
        }
      });
    });
  });

  return io;
}
