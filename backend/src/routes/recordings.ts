import { Router, Request, Response } from "express";
import prisma from "../db.js";
import { CreateRecordingSchema, UpdateRecordingSchema } from "../schemas.js";

const router = Router();

router.get("/", async (_req: Request, res: Response) => {
  try {
    const recordings = await prisma.recording.findMany({
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

router.get("/room/:roomId", async (req: Request<{ roomId: string }>, res: Response) => {
  try {
    const recordings = await prisma.recording.findMany({
      where: { roomId: req.params.roomId },
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

router.get("/:id", async (req: Request<{ id: string }>, res: Response) => {
  try {
    const recording = await prisma.recording.findUnique({
      where: { id: req.params.id },
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

router.post("/", async (req: Request, res: Response) => {
  const result = CreateRecordingSchema.safeParse(req.body);
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
        userId: result.data.userId,
        status: "UPLOADING",
      },
    });
    res.status(201).json({ message: "Recording created", data: recording });
  } catch (error) {
    res.status(500).json({ message: "Failed to create recording" });
  }
});

router.patch("/:id", async (req: Request<{ id: string }>, res: Response) => {
  const result = UpdateRecordingSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ message: "Invalid request", errors: result.error.errors });
    return;
  }

  try {
    const recording = await prisma.recording.update({
      where: { id: req.params.id },
      data: result.data,
    });
    res.json({ message: "Recording updated", data: recording });
  } catch (error) {
    res.status(500).json({ message: "Failed to update recording" });
  }
});

router.delete("/:id", async (req: Request<{ id: string }>, res: Response) => {
  try {
    await prisma.recording.delete({
      where: { id: req.params.id },
    });
    res.json({ message: "Recording deleted" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete recording" });
  }
});

export default router;
