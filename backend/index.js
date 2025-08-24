// index.js
import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import { SessionManager } from "./sessions.js";
import os from "os";

const PORT = parseInt(process.env.PORT || "3010", 10);
const SESSIONS_DIR = process.env.SESSIONS_DIR || "/app/sessions";
const PUPPETEER_EXECUTABLE_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium";
const CHROMIUM_FLAGS = process.env.CHROMIUM_FLAGS || "";

const app = express();
app.use(cors());
app.use(express.json({ limit: "25mb" })); // allow bigger base64 payloads

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST", "DELETE"] } });

const manager = new SessionManager({
  sessionsDir: SESSIONS_DIR,
  chromiumPath: PUPPETEER_EXECUTABLE_PATH,
  chromiumFlags: CHROMIUM_FLAGS
});

io.on("connection", (socket) => {
  socket.on("join", ({ id }) => {
    if (!id) return;
    socket.join(id);
    const found = manager.list().find((s) => s.id === id);
    if (found) io.to(id).emit("status", { id, status: found.status });
  });
});
manager.on("status", ({ id, status }) => io.to(id).emit("status", { id, status }));

// ---- REST ----
app.get("/api/health", (req, res) => res.json({ ok: true, host: os.hostname(), sessions: manager.list() }));

app.post("/api/sessions", async (req, res) => {
  try {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ ok: false, error: "id required" });
    await manager.create(id);
    res.json({ ok: true, id });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post("/api/sessions/:id/start", async (req, res) => {
  try { res.json({ ok: true, ...(await manager.start(io, req.params.id)) }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post("/api/sessions/:id/logout", async (req, res) => {
  try { res.json({ ok: true, ...(await manager.logout(req.params.id)) }); }
  catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});

app.delete("/api/sessions/:id", async (req, res) => {
  try { res.json({ ok: true, ...(await manager.delete(req.params.id)) }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post("/api/sessions/:id/sendText", async (req, res) => {
  try {
    const { to, message } = req.body || {};
    if (!to || !message) return res.status(400).json({ ok: false, error: "to and message required" });
    res.json({ ok: true, ...(await manager.sendText(req.params.id, to, message)) });
  } catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});

// updated: accepts single OR multiple items
app.post("/api/sessions/:id/sendMedia", async (req, res) => {
  try { res.json({ ok: true, ...(await manager.sendMedia(req.params.id, req.body || {})) }); }
  catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});

app.post("/api/sessions/:id/sendLocation", async (req, res) => {
  try { res.json({ ok: true, ...(await manager.sendLocation(req.params.id, req.body || {})) }); }
  catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});

app.post("/api/sessions/:id/broadcastText", async (req, res) => {
  try {
    const { numbers, message, delayMs } = req.body || {};
    if (!Array.isArray(numbers) || !message) return res.status(400).json({ ok: false, error: "numbers[] and message required" });
    res.json({ ok: true, ...(await manager.broadcastText(req.params.id, numbers, message, typeof delayMs === "number" ? delayMs : undefined)) });
  } catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});

app.post("/api/sessions/:id/broadcastMedia", async (req, res) => {
  try {
    const { numbers, item, delayMs } = req.body || {};
    if (!Array.isArray(numbers) || !item) return res.status(400).json({ ok: false, error: "numbers[] and item required" });
    res.json({ ok: true, ...(await manager.broadcastMedia(req.params.id, numbers, item, typeof delayMs === "number" ? delayMs : undefined)) });
  } catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});

server.listen(PORT, () => console.log(`wa-backend listening on :${PORT}`));
