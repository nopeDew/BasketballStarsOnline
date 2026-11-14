const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true } });
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const ENGINE_DIR = path.join(__dirname, "engine-source");
const rooms = new Map();

app.use(express.static(PUBLIC_DIR));
app.get("/health", (_req, res) => res.json({ ok: true, engineReady: fs.existsSync(path.join(ENGINE_DIR, "basketball_legends_2019.min.js")) }));

app.get("/play", (_req, res) => {
  const indexPath = path.join(ENGINE_DIR, "index.html");
  if (!fs.existsSync(indexPath)) return res.status(503).send("The original Basketball Legends 2019 game files have not been downloaded. Check the Render install logs for the engine clone step.");
  let html = fs.readFileSync(indexPath, "utf8");
  // Remove the mirror's redirect to its hosted one-player page; run the bundled engine locally.
  html = html.replace('window.location="https://ubg98.github.io/BasketballStars/";', "");
  // The route is /play (without a trailing slash), so pin relative engine assets to /play/.
  const bootDiagnostics = '<script>(function(){function show(message){var box=document.getElementById("bso-boot-error");if(!box){box=document.createElement("pre");box.id="bso-boot-error";box.style.cssText="position:fixed;z-index:999999;left:12px;right:12px;bottom:12px;max-height:40vh;overflow:auto;white-space:pre-wrap;background:#260d12;color:#fff;border:1px solid #ff6978;border-radius:10px;padding:12px;font:12px monospace";document.body.appendChild(box)}box.textContent=message}window.addEventListener("error",function(e){if(e.message)show("GAME SCRIPT ERROR\\n"+e.message+"\\n"+(e.filename||"")+" : "+(e.lineno||""))},true);window.addEventListener("unhandledrejection",function(e){show("GAME PROMISE ERROR\\n"+String(e.reason&&e.reason.stack||e.reason))});window.addEventListener("DOMContentLoaded",function(){setTimeout(function(){if(!document.querySelector("#content canvas"))show("The original game did not create its canvas. The engine or a startup script failed to load. Reload after the latest Render deploy.")},10000)})})();</script>';
  html = html.replace(/<head([^>]*)>/i, '<head$1><base href="/play/">' + bootDiagnostics);
  html = html.replace(/<script[^>]+src=["']patch\/js\/null\.js[^>]*><\/script>/gi, "");
  html = html.replace(/<script[^>]*>\s*var useEvents[\s\S]*?window\["GD_OPTIONS"\][\s\S]*?<\/script>/i, "");
  html = html.replace(/<script[^>]+src=["']js\/(?:analytics_ubg_v1_4|ubg235_client_v1_1)\.js[^>]*><\/script>/gi, "");
  html = html.replace(/<script[^>]+src=["']patch\/js\/gd-sdk\.js[^>]*><\/script>/gi, "");
  const network = '<script src="/socket.io/socket.io.js"></script><script src="/engine-network.js"></script>';
  const engineScript = /<script[^>]+src=["']basketball_legends_2019\.min\.js[^>]*><\/script>/i;
  if (engineScript.test(html)) {
    html = html.replace(engineScript, (_match) => network + _match + '<script src="/engine-autostart.js"></script><script src="/engine-controller-sync.js"></script><script src="/engine-sync.js"></script>');
  } else {
    html = html.replace("</body>", network + '<script src="/engine-sync.js"></script></body>');
  }
  res.type("html").send(html);
});

// The original game hides local 2-player mode on touch/mobile detection. Keep its native button visible.
app.get("/play/basketball_legends_2019.min.js", (_req, res) => {
  const gamePath = path.join(ENGINE_DIR, "basketball_legends_2019.f.js");
  if (!fs.existsSync(gamePath)) return res.sendStatus(404);
  let js = fs.readFileSync(gamePath, "utf8");
  // Keep the original local 2-player menu option visible in this browser build.
  js = js.replace("this.playBtn2.visible = !1,", "");
  // Prefer Phaser.AUTO so browsers without working WebGL can fall back to Canvas.
  js = js.replace("renderer: Phaser.WEBGL,", "renderer: Phaser.AUTO,");
  // Expose the original game's own match core so the online sync layer can mirror
  // authoritative match state without replacing its graphics, physics, or animations.
  // These are the real export statements in the uploaded Basketball Legends bundle.
  // Expose the classes from the game's webpack module so engine-sync.js can patch them.
  js = js.replace("e.PlayerController2 = T.PlayerController2;", "e.PlayerController2 = T.PlayerController2; window.__BSO_MainGameCore = n.MainGameCore; window.__BSO_Inventory = g.Inventory; window.__BSO_PlayerController = P.PlayerController; window.__BSO_PlayerController2 = T.PlayerController2; window.__BSO_InputManagerClass = i(14).default; window.__BSO_MenuClass = i(32).default; window.__BSO_RandomStateClass = i(26).default;");
  if (!js.includes("renderer: Phaser.AUTO,")) return res.status(500).send("Could not apply the WebGL fallback patch to the original game.");
  if (!js.includes("e.PlayerController2 = T.PlayerController2; window.__BSO_MainGameCore = n.MainGameCore") || !js.includes("window.__BSO_PlayerController = P.PlayerController") || !js.includes("window.__BSO_PlayerController2 = T.PlayerController2") || !js.includes("window.__BSO_InputManagerClass = i(14).default") || !js.includes("window.__BSO_MenuClass = i(32).default") || !js.includes("window.__BSO_RandomStateClass = i(26).default")) return res.status(500).send("Online sync could not find the original game's controller exports. Check the bundled engine version.");
  res.type("application/javascript").send(js);
});

app.use("/play", express.static(ENGINE_DIR, { index: false }));

function cleanName(value) {
  return String(value || "Player").replace(/[<>]/g, "").trim().slice(0, 14) || "Player";
}
function cleanCode(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}
function validSession(value) {
  return typeof value === "string" && value.length >= 12 && value.length <= 100;
}
function makeCode() {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}
function publicRoom(room) {
  return {
    code: room.code,
    started: room.started,
    players: room.players.map(p => ({
      name: p.name, side: p.side, ready: p.ready, online: !!p.socketId
    }))
  };
}
function updateRoom(room) {
  io.to(room.code).emit("engineRoomUpdate", publicRoom(room));
}
function findPlayer(room, socket) {
  return room && room.players.find(p => p.socketId === socket.id);
}
function attachPlayer(room, player, socket) {
  player.socketId = socket.id;
  socket.data.engineRoom = room.code;
  socket.data.engineSession = player.sessionId;
  socket.join(room.code);
}
function removePlayer(room, player) {
  room.players = room.players.filter(p => p !== player);
  if (!room.players.length) rooms.delete(room.code);
  else {
    room.started = false;
    room.players.forEach(p => p.ready = false);
    updateRoom(room);
    const survivor = room.players.find(p => p.socketId);
    if (survivor) io.to(survivor.socketId).emit("engineOpponentLeft");
  }
}

io.on("connection", socket => {
  socket.on("engineCreateRoom", ({ name, sessionId } = {}) => {
    if (!validSession(sessionId)) return socket.emit("engineError", "Could not create a secure player session. Refresh and try again.");
    let code;
    do { code = makeCode(); } while (rooms.has(code));
    const room = {
      code, started: false, seed: crypto.randomBytes(4).readUInt32BE(0),
      players: [{ name: cleanName(name), side: 1, ready: false, sessionId, socketId: null }]
    };
    rooms.set(code, room);
    attachPlayer(room, room.players[0], socket);
    socket.emit("engineRoomJoined", { ...publicRoom(room), side: 1, seed: room.seed });
    updateRoom(room);
  });

  socket.on("engineJoinRoom", ({ name, code, sessionId } = {}) => {
    code = cleanCode(code);
    const room = rooms.get(code);
    if (!validSession(sessionId)) return socket.emit("engineError", "Could not create a secure player session. Refresh and try again.");
    if (!room) return socket.emit("engineError", "Room not found. Check the code.");
    if (room.players.length >= 2) return socket.emit("engineError", "That room is full.");
    const player = { name: cleanName(name), side: 2, ready: false, sessionId, socketId: null };
    room.players.push(player);
    attachPlayer(room, player, socket);
    socket.emit("engineRoomJoined", { ...publicRoom(room), side: 2, seed: room.seed });
    updateRoom(room);
  });

  socket.on("engineResume", ({ code, sessionId } = {}) => {
    const room = rooms.get(cleanCode(code));
    if (!room || !validSession(sessionId)) return socket.emit("engineError", "Your game room expired. Return to the lobby and create or join again.");
    const player = room.players.find(p => p.sessionId === sessionId);
    if (!player) return socket.emit("engineError", "This browser session is not a player in that room.");
    const wasOffline = !player.socketId;
    attachPlayer(room, player, socket);
    socket.emit("engineRoomJoined", { ...publicRoom(room), side: player.side, seed: room.seed });
    if (room.started) socket.emit("engineGameStart", { code: room.code, side: player.side, seed: room.seed });
    updateRoom(room);
    if (wasOffline) {
      const opponent = room.players.find(p => p !== player && p.socketId);
      if (opponent) io.to(opponent.socketId).emit("engineOpponentReconnected");
    }
  });

  socket.on("engineReady", () => {
    const room = rooms.get(socket.data.engineRoom);
    const player = findPlayer(room, socket);
    if (!room || !player || room.started || room.players.length !== 2) return;
    player.ready = true;
    if (room.players.every(p => p.ready && p.socketId)) {
      room.started = true;
      io.to(room.code).emit("engineGameStart", { code: room.code, seed: room.seed });
    }
    updateRoom(room);
  });

  socket.on("engineInput", payload => {
    const room = rooms.get(socket.data.engineRoom);
    const player = findPlayer(room, socket);
    if (!room || !room.started || !player || !payload || typeof payload.actions !== "object") return;
    const allowed = ["left", "right", "jump", "down", "shoot", "super"];
    const actions = {};
    for (const action of allowed) actions[action] = !!payload.actions[action];
    const opponent = room.players.find(p => p !== player);
    if (opponent && opponent.socketId) {
      io.to(opponent.socketId).emit("engineRemoteInput", { side: player.side, actions });
    }
  });

  // Player 1 is the authoritative simulation. Player 2 receives its snapshots.
  socket.on("engineState", state => {
    const room = rooms.get(socket.data.engineRoom);
    const player = findPlayer(room, socket);
    if (!room || !room.started || !player || player.side !== 1 || !state || !Array.isArray(state.objects)) return;
    if (state.objects.length > 250) return;
    const opponent = room.players.find(p => p.side === 2 && p.socketId);
    if (opponent) io.to(opponent.socketId).emit("engineState", state);
  });

  socket.on("engineLeave", () => {
    const room = rooms.get(socket.data.engineRoom);
    const player = findPlayer(room, socket);
    if (!room || !player) return;
    socket.leave(room.code);
    delete socket.data.engineRoom;
    removePlayer(room, player);
  });

  socket.on("disconnect", () => {
    const room = rooms.get(socket.data.engineRoom);
    if (!room) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;
    player.socketId = null;
    const opponent = room.players.find(p => p !== player && p.socketId);
    if (opponent) io.to(opponent.socketId).emit("engineOpponentDisconnected");
    updateRoom(room);
  });
});

server.listen(PORT, () => console.log("Basketball Legends 2019 Online listening on " + PORT));
