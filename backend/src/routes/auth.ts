import { Router, Request, Response } from "express";
import bcrypt from "bcrypt";
import prisma from "../db.js";
import { RegisterSchema, LoginSchema } from "../schemas.js";
import { generateToken, authMiddleware, AuthRequest } from "../middleware/auth.js";

const router = Router();

// Register new user
router.post("/register", async (req: Request, res: Response) => {
  const result = RegisterSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ message: "Invalid request", errors: result.error.errors });
    return;
  }

  const { email, name, password } = result.data;

  try {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      res.status(409).json({ message: "User with this email already exists" });
      return;
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        name,
        password: hashedPassword,
      },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        createdAt: true,
      },
    });

    // Generate JWT token
    const token = generateToken(user.id, user.email);

    res.status(201).json({
      message: "User registered successfully",
      data: {
        user,
        token,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ message: "Failed to register user" });
  }
});

// Login user
router.post("/login", async (req: Request, res: Response) => {
  const result = LoginSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ message: "Invalid request", errors: result.error.errors });
    return;
  }

  const { email, password } = result.data;

  try {
    // Find user by email
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.status(401).json({ message: "Invalid email or password" });
      return;
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      res.status(401).json({ message: "Invalid email or password" });
      return;
    }

    // Generate JWT token
    const token = generateToken(user.id, user.email);

    res.json({
      message: "Login successful",
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatarUrl: user.avatarUrl,
          createdAt: user.createdAt,
        },
        token,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Failed to login" });
  }
});

// Get current user (protected route)
router.get("/me", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        createdAt: true,
        _count: {
          select: {
            hostedRooms: true,
            recordings: true,
          },
        },
      },
    });

    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    res.json({ data: user });
  } catch (error) {
    console.error("Get me error:", error);
    res.status(500).json({ message: "Failed to get user" });
  }
});

// Change password (protected route)
router.post("/change-password", authMiddleware, async (req: AuthRequest, res: Response) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    res.status(400).json({ message: "Current password and new password are required" });
    return;
  }

  if (newPassword.length < 8) {
    res.status(400).json({ message: "New password must be at least 8 characters" });
    return;
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      res.status(401).json({ message: "Current password is incorrect" });
      return;
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await prisma.user.update({
      where: { id: req.user!.userId },
      data: { password: hashedPassword },
    });

    res.json({ message: "Password changed successfully" });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({ message: "Failed to change password" });
  }
});

export default router;
