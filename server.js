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
// A short transport interruption should not immediately destroy a live match.
const DISCONNECT_GRACE_MS = 30000;

app.use(express.static(PUBLIC_DIR));
app.get("/health", (_req, res) => {
  const engineReady = fs.existsSync(path.join(ENGINE_DIR, "basketball_legends_2019.min.js"));
  const sourcePath = path.join(ENGINE_DIR, "basketball_legends_2019.f.js");
  const sourceExists = fs.existsSync(sourcePath);
  const source = sourceExists ? fs.readFileSync(sourcePath, "utf8") : "";
  const onlinePatched = source.includes("BSO_ONLINE_SOURCE_PATCH") &&
    source.includes("BSO_ONLINE_AUTOSTART_MENU") &&
    source.includes("BSO_ONLINE_SELECTION_READY") &&
    source.includes("BSO_ONLINE_REMATCH_READY") &&
    source.includes("BSO_ONLINE_P2_CONTROLLER") &&
    source.includes("BSO_ONLINE_SELECT_PLAYER_SYNC") &&
    source.includes("BSO_ONLINE_GAMEPLAY_STATE");
  res.json({ ok: true, engineReady, sourceExists, onlinePatched });
});

app.get("/play", (_req, res) => {
  const indexPath = path.join(ENGINE_DIR, "index.html");
  if (!fs.existsSync(indexPath)) return res.status(503).send("The original Basketball Legends 2019 game files have not been downloaded. Check the Render build logs for the source extraction and patch step.");
  let html = fs.readFileSync(indexPath, "utf8");
  // Remove the mirror's redirect to its hosted one-player page; run the bundled engine locally.
  html = html.replace('window.location="https://ubg98.github.io/BasketballStars/";', "");
  // The route is /play (without a trailing slash), so pin relative engine assets to /play/.
  const bootDiagnostics = '<script>(function(){function show(message){var box=document.getElementById("bso-boot-error");if(!box){box=document.createElement("pre");box.id="bso-boot-error";box.style.cssText="position:fixed;z-index:999999;left:12px;right:12px;bottom:12px;max-height:40vh;overflow:auto;white-space:pre-wrap;background:#260d12;color:#fff;border:1px solid #ff6978;border-radius:10px;padding:12px;font:12px monospace";document.body.appendChild(box)}box.textContent=message}window.addEventListener("error",function(e){if(e.message)show("GAME SCRIPT ERROR\
"+e.message+"\
"+(e.filename||"")+" : "+(e.lineno||""))},true);window.addEventListener("unhandledrejection",function(e){show("GAME PROMISE ERROR\
"+String(e.reason&&e.reason.stack||e.reason))});window.addEventListener("DOMContentLoaded",function(){setTimeout(function(){if(!document.querySelector("#content canvas"))show("The original game did not create its canvas. The engine or a startup script failed to load. Reload after the latest Render deploy.")},10000)})})();</script>';
  html = html.replace(/<head([^>]*)>/i, '<head$1><base href="/play/">' + bootDiagnostics);
  html = html.replace(/<script[^>]+src=["']patch\/js\/null\.js[^>]*><\/script>/gi, "");
  html = html.replace(/<script[^>]*>\s*var useEvents[\s\S]*?window\["GD_OPTIONS"\][\s\S]*?<\/script>/i, "");
  html = html.replace(/<script[^>]+src=["']js\/(?:analytics_ubg_v1_4|ubg235_client_v1_1)\.js[^>]*><\/script>/gi, "");
  html = html.replace(/<script[^>]+src=["']patch\/js\/gd-sdk\.js[^>]*><\/script>/gi, "");
  const network = '<script src="/socket.io/socket.io.js"></script><script src="/engine-network.js"></script>';
  const engineScript = /<script[^>]+src=["']basketball_legends_2019\.min\.js[^>]*><\/script>/i;
  if (engineScript.test(html)) {
    html = html.replace(engineScript, (_match) => network + _match + '<script src="/engine-sync.js"></script>');
  } else {
    html = html.replace("</body>", network + '<script src="/engine-sync.js"></script></body>');
  }
  res.type("html").send(html);
});

// The original game hides local 2-player mode on touch/mobile detection. Keep its native button visible.
app.get("/play/basketball_legends_2019.min.js", (_req, res) => {
  const gamePath = path.join(ENGINE_DIR, "basketball_legends_2019.f.js");
  if (!fs.existsSync(gamePath)) return res.sendStatus(404);
  const js = fs.readFileSync(gamePath, "utf8");
  // The postinstall patch modifies the actual original game bundle before the server starts.
  // Do not silently serve a disconnected stock game if that patch did not run.
  const requiredMarkers = [
    "BSO_ONLINE_SOURCE_PATCH",
    "window.__BSO_INSTALL_INPUT_MANAGER(r)",
    "window.__BSO_MainGameCore = n.MainGameCore",
    "BSO_ONLINE_AUTOSTART_MENU",
    "BSO_ONLINE_SELECTION_READY",
    "BSO_ONLINE_REMATCH_READY",
    "BSO_ONLINE_P2_CONTROLLER",
    "BSO_ONLINE_SELECT_PLAYER_SYNC",
    "BSO_ONLINE_GAMEPLAY_STATE",
    "window.__BSO_GameplayState = e",
    "renderer: Phaser.WEBGL,"
  ];
  const missing = requiredMarkers.filter(marker => !js.includes(marker));
  if (missing.length) {
    return res.status(500).type("text").send(
      "The original game source was not patched during install. Missing: " + missing.join(", ") +
      ". Check Render build logs and redeploy."
    );
  }
  res.type("application/javascript").send(js);
});

app.use("/play", express.static(ENGINE_DIR, { index: false }));

function cleanName(value) {
  return String(value || "Player").replace(/[<>]/g, "").trim().slice(0, 14) || "Player";
}
function cleanCode(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}
function cleanSelection(value) {
  if (!value || typeof value !== "object") return null;
  const team = Number(value.team);
  const player = Number(value.player);
  if (!Number.isInteger(team) || team < 1 || team > 17 ||
      !Number.isInteger(player) || player < 0 || player > 1) return null;
  return { team, player };
}
function roomSelections(room) {
  return room.players.slice().sort((a, b) => a.side - b.side).map(player => player.selection || null);
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
      name: p.name, side: p.side, ready: p.ready, selectionReady: !!p.selectionReady, online: !!p.socketId
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
  if (player.disconnectTimer) clearTimeout(player.disconnectTimer);
  player.disconnectTimer = null;
  player.socketId = socket.id;
  socket.data.engineRoom = room.code;
  socket.data.engineSession = player.sessionId;
  socket.join(room.code);
}
function removePlayer(room, player) {
  if (player.disconnectTimer) clearTimeout(player.disconnectTimer);
  player.disconnectTimer = null;
  room.players = room.players.filter(p => p !== player);
  if (!room.players.length) rooms.delete(room.code);
  else {
    room.started = false;
    room.players.forEach(p => { p.ready = false; p.selectionReady = false; p.selection = null; });
    room.selectionStarted = false;
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
      code, started: false, selectionStarted: false, seed: crypto.randomBytes(4).readUInt32BE(0),
      players: [{ name: cleanName(name), side: 1, ready: false, selectionReady: false, sessionId, socketId: null }]
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
    const player = { name: cleanName(name), side: 2, ready: false, selectionReady: false, sessionId, socketId: null };
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
    if (room.selectionStarted) socket.emit("engineSelectionStart", { code: room.code, selections: roomSelections(room) });
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
      room.selectionStarted = false;
      room.players.forEach(p => { p.selectionReady = false; p.selection = null; });
      io.to(room.code).emit("engineGameStart", { code: room.code, seed: room.seed });
    }
    updateRoom(room);
  });

  socket.on("engineCharacterSelection", payload => {
    const room = rooms.get(socket.data.engineRoom);
    const player = findPlayer(room, socket);
    if (!room || !room.started || !player || room.selectionStarted) return;
    const selection = cleanSelection(payload && payload.selection);
    if (!selection) return;
    player.selection = selection;
    io.to(room.code).emit("engineCharacterSelectionUpdate", { side: player.side, selection });
  });

  socket.on("engineSelectionOpened", () => {
    const room = rooms.get(socket.data.engineRoom);
    const player = findPlayer(room, socket);
    if (!room || !room.started || !player || room.players.length !== 2) return;
    // The previous match completed its selection handshake. Reopen that handshake
    // once when either player enters the native selector for the next game.
    if (room.selectionStarted) {
      room.selectionStarted = false;
      room.players.forEach(p => { p.selectionReady = false; });
      io.to(room.code).emit("engineSelectionProgress", { ready: 0 });
      updateRoom(room);
    }
  });

  socket.on("engineSelectionReady", payload => {
    const room = rooms.get(socket.data.engineRoom);
    const player = findPlayer(room, socket);
    if (!room || !room.started || !player || room.players.length !== 2 || room.selectionStarted) return;
    const finalSelection = cleanSelection(payload && payload.selection);
    if (finalSelection) player.selection = finalSelection;
    player.selectionReady = true;
    const readyCount = room.players.filter(p => p.selectionReady).length;
    io.to(room.code).emit("engineSelectionProgress", { ready: readyCount });
    if (readyCount === 2 && room.players.every(p => !!p.socketId)) {
      room.selectionStarted = true;
      io.to(room.code).emit("engineSelectionStart", { code: room.code, selections: roomSelections(room) });
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
    // Drop obsolete state under network pressure instead of building a queue behind live gameplay.
    if (opponent) io.to(opponent.socketId).volatile.emit("engineState", state);
  });

  socket.on("engineLeave", acknowledge => {
    const room = rooms.get(socket.data.engineRoom);
    const player = findPlayer(room, socket);
    if (!room || !player) {
      if (typeof acknowledge === "function") acknowledge({ ok: true });
      return;
    }
    socket.leave(room.code);
    delete socket.data.engineRoom;
    removePlayer(room, player);
    if (typeof acknowledge === "function") acknowledge({ ok: true });
  });

  socket.on("disconnect", reason => {
    const room = rooms.get(socket.data.engineRoom);
    if (!room) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;

    // Mark the slot offline but retain the room and match state temporarily.
    // Socket.IO will reconnect automatically and engineResume will reclaim this
    // same session/side. Ignore stale disconnect callbacks from replaced sockets.
    player.socketId = null;
    updateRoom(room);

    const opponent = room.players.find(p => p !== player && p.socketId);
    if (opponent) {
      io.to(opponent.socketId).emit("engineOpponentConnectionLost", {
        gracePeriodMs: DISCONNECT_GRACE_MS,
        reason: String(reason || "connection lost")
      });
    }

    if (player.disconnectTimer) clearTimeout(player.disconnectTimer);
    player.disconnectTimer = setTimeout(() => {
      // A reconnect clears the timer in attachPlayer. Only expire the same
      // still-offline player in the same room.
      if (rooms.get(room.code) !== room || !room.players.includes(player) || player.socketId) return;
      player.disconnectTimer = null;
      removePlayer(room, player);
    }, DISCONNECT_GRACE_MS);
  });
});

server.listen(PORT, () => console.log("Basketball Legends 2019 Online listening on " + PORT));
