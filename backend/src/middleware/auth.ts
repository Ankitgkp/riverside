import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

// Extend Express Request type to include user
export interface AuthRequest extends Request {
  user?: {
    userId: string;
    email: string;
  };
}

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";

export const generateToken = (userId: string, email: string): string => {
  return jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: "7d" });
};

export const verifyToken = (token: string): { userId: string; email: string } | null => {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: string; email: string };
  } catch {
    return null;
  }
};

// Middleware to protect routes
export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ message: "Unauthorized: No token provided" });
    return;
  }

  const token = authHeader.split(" ")[1];
  const decoded = verifyToken(token);

  if (!decoded) {
    res.status(401).json({ message: "Unauthorized: Invalid token" });
    return;
  }

  req.user = decoded;
  next();
};

// Optional auth - doesn't fail if no token, but attaches user if valid token
export const optionalAuthMiddleware = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    const decoded = verifyToken(token);
    if (decoded) {
      req.user = decoded;
    }
  }

  next();
};
