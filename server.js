const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true } });
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));
app.get("/health", (_req, res) => res.json({ ok: true }));

const rooms = new Map();
const makeCode = () => crypto.randomBytes(3).toString("hex").toUpperCase();

io.on("connection", socket => {
  socket.on("room:create", ({ name } = {}, reply = () => {}) => {
    let code;
    do { code = makeCode(); } while (rooms.has(code));
    const room = { players: [{ id: socket.id, name: cleanName(name) }], state: null };
    rooms.set(code, room);
    socket.join(code);
    socket.data.room = code;
    socket.data.player = 0;
    reply({ ok: true, code, player: 0 });
  });

  socket.on("room:join", ({ code, name } = {}, reply = () => {}) => {
    code = String(code || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return reply({ ok: false, error: "Lobby not found." });
    if (room.players.length >= 2) return reply({ ok: false, error: "Lobby is full." });
    room.players.push({ id: socket.id, name: cleanName(name) });
    socket.join(code);
    socket.data.room = code;
    socket.data.player = 1;
    io.to(code).emit("room:ready", { players: room.players.map(p => p.name) });
    reply({ ok: true, code, player: 1 });
  });

  // Relay compact input/state packets between the two members of a room.
  // The game client should send inputs, not trust remote score/state updates.
  socket.on("game:input", payload => {
    const code = socket.data.room;
    if (!code || !rooms.has(code)) return;
    socket.to(code).emit("game:input", {
      player: socket.data.player,
      input: sanitizeInput(payload)
    });
  });

  socket.on("room:leave", () => leaveRoom(socket));
  socket.on("disconnect", () => leaveRoom(socket));
});

function cleanName(value) {
  return String(value || "Player").replace(/[<>\u0000-\u001f]/g, "").trim().slice(0, 16) || "Player";
}
function sanitizeInput(value) {
  if (!value || typeof value !== "object") return {};
  const allowed = ["left", "right", "up", "down", "shoot", "steal", "timestamp"];
  const out = {};
  for (const key of allowed) {
    const v = value[key];
    if (typeof v === "boolean" || (key === "timestamp" && Number.isFinite(v))) out[key] = v;
  }
  return out;
}
function leaveRoom(socket) {
  const code = socket.data.room;
  if (!code) return;
  const room = rooms.get(code);
  socket.leave(code);
  socket.to(code).emit("room:opponent-left");
  if (room) {
    room.players = room.players.filter(p => p.id !== socket.id);
    if (!room.players.length) rooms.delete(code);
  }
  socket.data.room = null;
}

server.listen(PORT, () => console.log(`Basketball Stars Online listening on ${PORT}`));
