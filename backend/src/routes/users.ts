import { Router, Request, Response } from "express";
import prisma from "../db.js";
import { CreateUserSchema, UpdateUserSchema } from "../schemas.js";
import bcrypt from "bcrypt";
const router = Router();

router.get("/", async (_req: Request, res: Response) => {
    try {
        const users = await prisma.user.findMany({
            include: {
                hostedRooms: true,
                _count: {
                    select: { recordings: true, participants: true },
                },
            },
        });
        res.json({ data: users });
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch users" });
    }
});

router.get("/:id", async (req: Request<{ id: string }>, res: Response) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.params.id },
            include: {
                hostedRooms: true,
                recordings: true,
                participants: {
                    include: { room: true },
                },
            },
        });
        if (!user) {
            res.status(404).json({ message: "User not found" });
            return;
        }
        res.json({ data: user });
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch user" });
    }
});

router.post("/", async (req: Request, res: Response) => {
    const result = CreateUserSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ message: "Invalid request", errors: result.error.errors });
        return;
    }

    try {
        const user = await prisma.user.create({
            data: {
                ...result.data,
                password: await bcrypt.hash(result.data.password, 10),
            },
        });
        res.status(201).json({ message: "User created", data: user });
    } catch (error) {
        console.error("Failed to create user:", error);
        res.status(500).json({ message: "Failed to create user" });
    }
});

router.patch("/:id", async (req: Request<{ id: string }>, res: Response) => {
    const result = UpdateUserSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ message: "Invalid request", errors: result.error.errors });
        return;
    }

    try {
        const user = await prisma.user.update({
            where: { id: req.params.id },
            data: result.data,
        });
        res.json({ message: "User updated", data: user });
    } catch (error) {
        res.status(500).json({ message: "Failed to update user" });
    }
});

router.delete("/:id", async (req: Request<{ id: string }>, res: Response) => {
    try {
        await prisma.user.delete({
            where: { id: req.params.id },
        });
        res.json({ message: "User deleted" });
    } catch (error) {
        res.status(500).json({ message: "Failed to delete user" });
    }
});

export default router;
