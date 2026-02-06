import { z } from "zod";

// Auth schemas
export const RegisterSchema = z.object({
    email: z.string().email(),
    name: z.string().min(1),
    password: z.string().min(8, "Password must be at least 8 characters"),
});

export const LoginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
});

export const CreateUserSchema = z.object({
    email: z.string().email(),
    name: z.string().min(1),
    avatarUrl: z.string().url().optional(),
    password: z.string().min(8),
});

export const UpdateUserSchema = CreateUserSchema.partial();

export const CreateRoomSchema = z.object({
    title: z.string().min(1),
    description: z.string().optional(),
    hostId: z.string().uuid(),
    scheduledAt: z.string().datetime().optional(),
    // Room settings
    maxParticipants: z.number().int().min(2).max(50).optional().default(10),
    videoEnabled: z.boolean().optional().default(true),
    audioOnly: z.boolean().optional().default(false),
    waitingRoom: z.boolean().optional().default(false),
});

export const UpdateRoomSchema = z.object({
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    isActive: z.boolean().optional(),
    scheduledAt: z.string().datetime().optional(),
    // Room settings
    maxParticipants: z.number().int().min(2).max(50).optional(),
    videoEnabled: z.boolean().optional(),
    audioOnly: z.boolean().optional(),
    waitingRoom: z.boolean().optional(),
});

export const JoinRoomSchema = z.object({
    userId: z.string().uuid(),
    roomId: z.string().uuid(),
});
export const CreateRecordingSchema = z.object({
    fileName: z.string().min(1),
    roomId: z.string().uuid(),
    userId: z.string().uuid(),
    mimeType: z.string().optional(),
});

export const UpdateRecordingSchema = z.object({
    fileUrl: z.string().url().optional(),
    fileSize: z.number().int().positive().optional(),
    duration: z.number().int().positive().optional(),
    status: z.enum(["UPLOADING", "PROCESSING", "READY", "FAILED"]).optional(),
});

export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;
export type CreateRoomInput = z.infer<typeof CreateRoomSchema>;
export type UpdateRoomInput = z.infer<typeof UpdateRoomSchema>;
export type JoinRoomInput = z.infer<typeof JoinRoomSchema>;
export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type CreateRecordingInput = z.infer<typeof CreateRecordingSchema>;
export type UpdateRecordingInput = z.infer<typeof UpdateRecordingSchema>;
