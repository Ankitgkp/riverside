import { Router, Response } from "express";
import prisma from "../db.js";
import { CreateRecordingSchema, UpdateRecordingSchema } from "../schemas.js";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";

const router = Router();

// Protected: Get all recordings (user's own recordings)
router.get("/", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const recordings = await prisma.recording.findMany({
      where: { userId: req.user!.userId },
      include: {
        room: { select: { id: true, title: true } },
        user: { select: { id: true, name: true, avatarUrl: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ data: recordings });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch recordings" });
  }
});

// Protected: Get recordings by room
router.get("/room/:roomId", authMiddleware, async (req: AuthRequest, res: Response) => {
  const roomId = req.params.roomId as string;
  try {
    const recordings = await prisma.recording.findMany({
      where: { roomId },
      include: {
        user: { select: { id: true, name: true, avatarUrl: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ data: recordings });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch recordings" });
  }
});

// Protected: Get recording by ID
router.get("/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
  const recordingId = req.params.id as string;
  try {
    const recording = await prisma.recording.findUnique({
      where: { id: recordingId },
      include: {
        room: true,
        user: true,
      },
    });
    if (!recording) {
      res.status(404).json({ message: "Recording not found" });
      return;
    }
    res.json({ data: recording });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch recording" });
  }
});

// Protected: Create recording (uses authenticated user)
router.post("/", authMiddleware, async (req: AuthRequest, res: Response) => {
  const result = CreateRecordingSchema.omit({ userId: true }).safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ message: "Invalid request", errors: result.error.errors });
    return;
  }

  try {
    const recording = await prisma.recording.create({
      data: {
        fileName: result.data.fileName,
        mimeType: result.data.mimeType,
        roomId: result.data.roomId,
        userId: req.user!.userId, // Use authenticated user
        status: "UPLOADING",
      },
    });
    res.status(201).json({ message: "Recording created", data: recording });
  } catch (error) {
    res.status(500).json({ message: "Failed to create recording" });
  }
});

// Protected: Update recording (owner only)
router.patch("/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
  const result = UpdateRecordingSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ message: "Invalid request", errors: result.error.errors });
    return;
  }

  const recordingId = req.params.id as string;

  try {
    // Check if user owns this recording
    const recording = await prisma.recording.findUnique({ where: { id: recordingId } });
    if (!recording) {
      res.status(404).json({ message: "Recording not found" });
      return;
    }
    if (recording.userId !== req.user!.userId) {
      res.status(403).json({ message: "You can only update your own recordings" });
      return;
    }

    const updatedRecording = await prisma.recording.update({
      where: { id: recordingId },
      data: result.data,
    });
    res.json({ message: "Recording updated", data: updatedRecording });
  } catch (error) {
    res.status(500).json({ message: "Failed to update recording" });
  }
});

// Protected: Delete recording (owner only)
router.delete("/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
  const recordingId = req.params.id as string;

  try {
    // Check if user owns this recording
    const recording = await prisma.recording.findUnique({ where: { id: recordingId } });
    if (!recording) {
      res.status(404).json({ message: "Recording not found" });
      return;
    }
    if (recording.userId !== req.user!.userId) {
      res.status(403).json({ message: "You can only delete your own recordings" });
      return;
    }

    await prisma.recording.delete({
      where: { id: recordingId },
    });
    res.json({ message: "Recording deleted" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete recording" });
  }
});

export default router;
