import { Router, Response } from "express";
import prisma from "../db.js";
import { CreateRoomSchema, UpdateRoomSchema } from "../schemas.js";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";

const router = Router();

function generateRoomCode(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const segments = [];
  for (let i = 0; i < 3; i++) {
    let segment = "";
    for (let j = 0; j < 3; j++) {
      segment += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    segments.push(segment);
  }
  return segments.join("-");
}

async function getUniqueRoomCode(): Promise<string> {
  let code = generateRoomCode();
  let exists = await prisma.room.findUnique({ where: { code } });
  while (exists) {
    code = generateRoomCode();
    exists = await prisma.room.findUnique({ where: { code } });
  }
  return code;
}

router.get("/", async (_req: AuthRequest, res: Response) => {
  try {
    const rooms = await prisma.room.findMany({
      include: {
        host: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
        _count: {
          select: { participants: true, recordings: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ data: rooms });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch rooms" });
  }
});


router.get("/active", async (_req: AuthRequest, res: Response) => {
  try {
    const rooms = await prisma.room.findMany({
      where: { isActive: true },
      include: {
        host: {
          select: { id: true, name: true, avatarUrl: true },
        },
        participants: {
          include: {
            user: { select: { id: true, name: true, avatarUrl: true } },
          },
        },
      },
    });
    res.json({ data: rooms });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch active rooms" });
  }
});


router.get("/:id", async (req: AuthRequest, res: Response) => {
  const roomId = req.params.id as string;
  try {
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: {
        host: true,
        participants: {
          include: { user: true },
        },
        recordings: true,
      },
    });
    if (!room) {
      res.status(404).json({ message: "Room not found" });
      return;
    }
    res.json({ data: room });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch room" });
  }
});
router.get("/code/:code", async (req: AuthRequest, res: Response) => {
  const code = req.params.code as string;
  try {
    const room = await prisma.room.findUnique({
      where: { code },
      include: {
        host: { select: { id: true, name: true, avatarUrl: true } },
        _count: { select: { participants: { where: { leftAt: null } } } },
      },
    });
    if (!room) {
      res.status(404).json({ message: "Room not found" });
      return;
    }
    res.json({ data: room });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch room" });
  }
});

router.post("/code/:code/join", authMiddleware, async (req: AuthRequest, res: Response) => {
  const code = req.params.code as string;

  try {
    const room = await prisma.room.findUnique({ 
      where: { code },
      include: {
        _count: { select: { participants: { where: { leftAt: null } } } }
      }
    });
    if (!room) {
      res.status(404).json({ message: "Room not found" });
      return;
    }
    if (!room.isActive) {
      res.status(400).json({ message: "Room is not active" });
      return;
    }

    // Check capacity
    if (room._count.participants >= room.maxParticipants) {
      res.status(400).json({ message: "Room is full" });
      return;
    }

    // Check if waiting room is enabled
    if (room.waitingRoom && room.hostId !== req.user!.userId) {
      const waitingEntry = await prisma.waitingRoom.upsert({
        where: {
          userId_roomId: {
            userId: req.user!.userId,
            roomId: room.id,
          },
        },
        update: { status: "PENDING" },
        create: {
          userId: req.user!.userId,
          roomId: room.id,
          status: "PENDING",
        },
        include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
      });
      res.status(202).json({ message: "Added to waiting room", data: waitingEntry });
      return;
    }

    const participant = await prisma.participant.upsert({
      where: {
        userId_roomId: {
          userId: req.user!.userId,
          roomId: room.id,
        },
      },
      update: { leftAt: null },
      create: {
        userId: req.user!.userId,
        roomId: room.id,
        role: "GUEST",
      },
      include: { user: true, room: true },
    });

    res.status(201).json({ message: "Joined room", data: participant });
  } catch (error) {
    res.status(500).json({ message: "Failed to join room" });
  }
});

// Protected: Create room (uses authenticated user as host)
router.post("/", authMiddleware, async (req: AuthRequest, res: Response) => {
  const result = CreateRoomSchema.omit({ hostId: true }).safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ message: "Invalid request", errors: result.error.errors });
    return;
  }

  try {
    const code = await getUniqueRoomCode();
    
    const room = await prisma.room.create({
      data: {
        title: result.data.title,
        description: result.data.description,
        scheduledAt: result.data.scheduledAt ? new Date(result.data.scheduledAt) : null,
        hostId: req.user!.userId,
        code: code,
        maxParticipants: result.data.maxParticipants ?? 10,
        videoEnabled: result.data.videoEnabled ?? true,
        audioOnly: result.data.audioOnly ?? false,
        waitingRoom: result.data.waitingRoom ?? false,
      },
      include: { host: true },
    });

    await prisma.participant.create({
      data: {
        userId: req.user!.userId,
        roomId: room.id,
        role: "HOST",
      },
    });

    res.status(201).json({ message: "Room created", data: room });
  } catch (error) {
    res.status(500).json({ message: "Failed to create room" });
  }
});

// Protected: Update room (host only)
router.patch("/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
  const result = UpdateRoomSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ message: "Invalid request", errors: result.error.errors });
    return;
  }

  const roomId = req.params.id as string;

  try {
    // Check if user is the host
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) {
      res.status(404).json({ message: "Room not found" });
      return;
    }
    if (room.hostId !== req.user!.userId) {
      res.status(403).json({ message: "Only the host can update this room" });
      return;
    }

    const updatedRoom = await prisma.room.update({
      where: { id: roomId },
      data: {
        ...result.data,
        scheduledAt: result.data.scheduledAt ? new Date(result.data.scheduledAt) : undefined,
      },
    });
    res.json({ message: "Room updated", data: updatedRoom });
  } catch (error) {
    res.status(500).json({ message: "Failed to update room" });
  }
});

// Protected: Join room by ID
router.post("/:id/join", authMiddleware, async (req: AuthRequest, res: Response) => {
  const roomId = req.params.id as string;

  try {
    const room = await prisma.room.findUnique({ 
      where: { id: roomId },
      include: {
        _count: { select: { participants: { where: { leftAt: null } } } }
      }
    });
    if (!room) {
      res.status(404).json({ message: "Room not found" });
      return;
    }
    if (!room.isActive) {
      res.status(400).json({ message: "Room is not active" });
      return;
    }

    // Check capacity
    if (room._count.participants >= room.maxParticipants) {
      res.status(400).json({ message: "Room is full" });
      return;
    }

    // Check if waiting room is enabled
    if (room.waitingRoom && room.hostId !== req.user!.userId) {
      // Add to waiting room instead of directly joining
      const waitingEntry = await prisma.waitingRoom.upsert({
        where: {
          userId_roomId: {
            userId: req.user!.userId,
            roomId: roomId,
          },
        },
        update: { status: "PENDING" },
        create: {
          userId: req.user!.userId,
          roomId: roomId,
          status: "PENDING",
        },
        include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
      });
      res.status(202).json({ message: "Added to waiting room", data: waitingEntry });
      return;
    }

    const participant = await prisma.participant.upsert({
      where: {
        userId_roomId: {
          userId: req.user!.userId,
          roomId: roomId,
        },
      },
      update: { leftAt: null },
      create: {
        userId: req.user!.userId,
        roomId: roomId,
        role: "GUEST",
      },
      include: { user: true, room: true },
    });

    res.status(201).json({ message: "Joined room", data: participant });
  } catch (error) {
    res.status(500).json({ message: "Failed to join room" });
  }
});

// Protected: Leave room
router.post("/:id/leave", authMiddleware, async (req: AuthRequest, res: Response) => {
  const roomId = req.params.id as string;

  try {
    const participant = await prisma.participant.update({
      where: {
        userId_roomId: { userId: req.user!.userId, roomId },
      },
      data: { leftAt: new Date() },
    });
    res.json({ message: "Left room", data: participant });
  } catch (error) {
    res.status(500).json({ message: "Failed to leave room" });
  }
});

// Protected: End room (host only)
router.post("/:id/end", authMiddleware, async (req: AuthRequest, res: Response) => {
  const roomId = req.params.id as string;

  try {
    // Check if user is the host
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) {
      res.status(404).json({ message: "Room not found" });
      return;
    }
    if (room.hostId !== req.user!.userId) {
      res.status(403).json({ message: "Only the host can end this room" });
      return;
    }

    const updatedRoom = await prisma.room.update({
      where: { id: roomId },
      data: { isActive: false },
    });

    await prisma.participant.updateMany({
      where: { roomId: roomId, leftAt: null },
      data: { leftAt: new Date() },
    });

    res.json({ message: "Room ended", data: updatedRoom });
  } catch (error) {
    res.status(500).json({ message: "Failed to end room" });
  }
});

router.delete("/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
  const roomId = req.params.id as string;

  try {
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) {
      res.status(404).json({ message: "Room not found" });
      return;
    }
    if (room.hostId !== req.user!.userId) {
      res.status(403).json({ message: "Only the host can delete this room" });
      return;
    }

    await prisma.room.delete({
      where: { id: roomId },
    });
    res.json({ message: "Room deleted" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete room" });
  }
});

router.get("/:id/waiting-room", authMiddleware, async (req: AuthRequest, res: Response) => {
  const roomId = req.params.id as string;

  try {
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) {
      res.status(404).json({ message: "Room not found" });
      return;
    }
    if (room.hostId !== req.user!.userId) {
      res.status(403).json({ message: "Only the host can view the waiting room" });
      return;
    }

    const waitingList = await prisma.waitingRoom.findMany({
      where: { roomId, status: "PENDING" },
      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
      orderBy: { createdAt: "asc" },
    });

    res.json({ data: waitingList });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch waiting room" });
  }
});

router.post("/:id/waiting-room/:userId/approve", authMiddleware, async (req: AuthRequest, res: Response) => {
  const roomId = req.params.id as string;
  const userId = req.params.userId as string;

  try {
    const room = await prisma.room.findUnique({ 
      where: { id: roomId },
      include: { _count: { select: { participants: { where: { leftAt: null } } } } }
    });
    if (!room) {
      res.status(404).json({ message: "Room not found" });
      return;
    }
    if (room.hostId !== req.user!.userId) {
      res.status(403).json({ message: "Only the host can approve participants" });
      return;
    }


    if (room._count.participants >= room.maxParticipants) {
      res.status(400).json({ message: "Room is full" });
      return;
    }

    // Update waiting room entry
    await prisma.waitingRoom.update({
      where: { userId_roomId: { userId, roomId } },
      data: { status: "APPROVED" },
    });

    // Add as participant
    const participant = await prisma.participant.create({
      data: {
        userId: userId,
        roomId: roomId,
        role: "GUEST",
      },
      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    });

    res.json({ message: "Participant approved", data: participant });
  } catch (error) {
    res.status(500).json({ message: "Failed to approve participant" });
  }
});


router.post("/:id/waiting-room/:userId/reject", authMiddleware, async (req: AuthRequest, res: Response) => {
  const roomId = req.params.id as string;
  const userId = req.params.userId as string;

  try {
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) {
      res.status(404).json({ message: "Room not found" });
      return;
    }
    if (room.hostId !== req.user!.userId) {
      res.status(403).json({ message: "Only the host can reject participants" });
      return;
    }

    await prisma.waitingRoom.update({
      where: { userId_roomId: { userId, roomId } },
      data: { status: "REJECTED" },
    });

    res.json({ message: "Participant rejected" });
  } catch (error) {
    res.status(500).json({ message: "Failed to reject participant" });
  }
});

export default router;
