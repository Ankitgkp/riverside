import express from "express";
import { createServer } from "http";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import roomRoutes from "./routes/rooms.js";
import recordingRoutes from "./routes/recordings.js";
import { setupSocketServer } from "./socket/index.js";

dotenv.config();

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Set up Socket.io
const io = setupSocketServer(httpServer);

app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/rooms", roomRoutes);
app.use("/api/recordings", recordingRoutes);

httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`WebSocket server`);
});
