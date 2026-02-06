import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import userRoutes from "./routes/users.js";
import roomRoutes from "./routes/rooms.js";
import recordingRoutes from "./routes/recordings.js";
dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/users", userRoutes);
app.use("/api/rooms", roomRoutes);
app.use("/api/recordings", recordingRoutes);

app.listen(PORT, () => {
    console.log(`Server running on 3000`);
});
