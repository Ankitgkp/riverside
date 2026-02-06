import { Router, Request, Response } from "express";
import prisma from "../db.js";
import { CreateRoomSchema, UpdateRoomSchema, JoinRoomSchema } from "../schemas.js";

const router = Router();

router.get("/", async (_req: Request, res: Response) => {
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


router.get("/active", async (_req: Request, res: Response) => {
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

router.get("/:id", async (req: Request<{ id: string }>, res: Response) => {
  try {
    const room = await prisma.room.findUnique({
      where: { id: req.params.id },
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

router.post("/", async (req: Request, res: Response) => {
  const result = CreateRoomSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ message: "Invalid request", errors: result.error.errors });
    return;
  }

  try {
    const room = await prisma.room.create({
      data: {
        title: result.data.title,
        description: result.data.description,
        scheduledAt: result.data.scheduledAt ? new Date(result.data.scheduledAt) : null,
        hostId: result.data.hostId,
      },
      include: { host: true },
    });

    await prisma.participant.create({
      data: {
        userId: result.data.hostId,
        roomId: room.id,
        role: "HOST",
      },
    });

    res.status(201).json({ message: "Room created", data: room });
  } catch (error) {
    res.status(500).json({ message: "Failed to create room" });
  }
});

router.patch("/:id", async (req: Request<{ id: string }>, res: Response) => {
  const result = UpdateRoomSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ message: "Invalid request", errors: result.error.errors });
    return;
  }

  try {
    const room = await prisma.room.update({
      where: { id: req.params.id },
      data: {
        ...result.data,
        scheduledAt: result.data.scheduledAt ? new Date(result.data.scheduledAt) : undefined,
      },
    });
    res.json({ message: "Room updated", data: room });
  } catch (error) {
    res.status(500).json({ message: "Failed to update room" });
  }
});

router.post("/:id/join", async (req: Request<{ id: string }>, res: Response) => {
  const roomId = req.params.id;
  const parseResult = JoinRoomSchema.safeParse({ ...req.body, roomId });
  
  if (!parseResult.success) {
    res.status(400).json({ message: "Invalid request", errors: parseResult.error.errors });
    return;
  }

  try {
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) {
      res.status(404).json({ message: "Room not found" });
      return;
    }
    if (!room.isActive) {
      res.status(400).json({ message: "Room is not active" });
      return;
    }

    const participant = await prisma.participant.upsert({
      where: {
        userId_roomId: {
          userId: parseResult.data.userId,
          roomId: roomId,
        },
      },
      update: { leftAt: null },
      create: {
        userId: parseResult.data.userId,
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

router.post("/:id/leave", async (req: Request<{ id: string }>, res: Response) => {
  const { userId } = req.body;
  const roomId = req.params.id;

  if (!userId) {
    res.status(400).json({ message: "userId is required" });
    return;
  }

  try {
    const participant = await prisma.participant.update({
      where: {
        userId_roomId: { userId, roomId },
      },
      data: { leftAt: new Date() },
    });
    res.json({ message: "Left room", data: participant });
  } catch (error) {
    res.status(500).json({ message: "Failed to leave room" });
  }
});

router.post("/:id/end", async (req: Request<{ id: string }>, res: Response) => {
  const roomId = req.params.id;
  try {
    const room = await prisma.room.update({
      where: { id: roomId },
      data: { isActive: false },
    });

    await prisma.participant.updateMany({
      where: { roomId: roomId, leftAt: null },
      data: { leftAt: new Date() },
    });

    res.json({ message: "Room ended", data: room });
  } catch (error) {
    res.status(500).json({ message: "Failed to end room" });
  }
});

router.delete("/:id", async (req: Request<{ id: string }>, res: Response) => {
  try {
    await prisma.room.delete({
      where: { id: req.params.id },
    });
    res.json({ message: "Room deleted" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete room" });
  }
});

export default router;
