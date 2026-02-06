import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { CreateUserSchema } from "./schemas.js";

export const validateUser = async (req: Request, res: Response, next: NextFunction) => {
    const result = CreateUserSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ message: "Invalid request", errors: result.error.errors });
        return;
    }
    next();
};