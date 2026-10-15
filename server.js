
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const WebSocket = require("ws");

const PORT = Number(process.env.PORT) || 10000;
const ROOT = __dirname;

const players = new Map();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

// Раздаём файлы игры через тот же сервер
const httpServer = http.createServer((req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;

  if (pathname === "/ws") {
    res.writeHead(426, {
      "Content-Type": "text/plain; charset=utf-8",
      "Upgrade": "websocket"
    });
    res.end("Подключайся к /ws через WebSocket.");
    return;
  }

  const requestedFile = pathname === "/"
    ? "index.html"
    : path.basename(decodeURIComponent(pathname));

  const allowedFiles = new Set([
    "index.html",
    "game.js",
    "style.css"
  ]);

  if (!allowedFiles.has(requestedFile)) {
    res.writeHead(404);
    res.end("Файл не найден");
    return;
  }

  const filePath = path.join(ROOT, requestedFile);

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, {
        "Content-Type": "text/plain; charset=utf-8"
      });
      res.end("Не удалось открыть " + requestedFile);
      return;
    }

    res.writeHead(200, {
      "Content-Type":
        mimeTypes[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-cache"
    });

    res.end(data);
  });
});

// WebSocket работает на том же HTTP-порту
const wss = new WebSocket.Server({
  server: httpServer,
  path: "/ws"
});

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function broadcast(data, exceptId = null) {
  const message = JSON.stringify(data);

  for (const [id, player] of players) {
    if (id !== exceptId && player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(message);
    }
  }
}

wss.on("connection", (ws) => {
  const id = crypto.randomUUID();

  const player = {
    id,
    name: "Игрок",
    x: 200 + Math.random() * 300,
    y: 200 + Math.random() * 200,
    health: 100,
    weapon: "pistol",
    level: 1,
    ws
  };

  players.set(id, player);

  const publicPlayer = (p) => ({
    id: p.id,
    name: p.name,
    x: p.x,
    y: p.y,
    health: p.health,
    weapon: p.weapon,
    level: p.level
  });

  send(ws, {
    type: "welcome",
    id,
    players: [...players.values()].map(publicPlayer)
  });

  broadcast({
    type: "playerJoined",
    player: publicPlayer(player)
  }, id);

  ws.on("message", (raw) => {
    let message;

    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (!message || typeof message.type !== "string") return;

    if (message.type === "join") {
      if (typeof message.name === "string") {
        player.name = message.name.trim().slice(0, 20) || "Игрок";
      }
    }

    if (
      message.type === "move" ||
      message.type === "update" ||
      message.type === "playerUpdate"
    ) {
      if (Number.isFinite(message.x)) {
        player.x = Math.max(0, Math.min(5000, message.x));
      }

      if (Number.isFinite(message.y)) {
        player.y = Math.max(0, Math.min(5000, message.y));
      }

      if (Number.isFinite(message.health)) {
        player.health = Math.max(0, Math.min(100, message.health));
      }

      if (typeof message.weapon === "string") {
        player.weapon = message.weapon.slice(0, 30);
      }

      if (Number.isFinite(message.level)) {
        player.level = Math.max(1, Math.min(999, message.level));
      }

      broadcast({
        type: "playerUpdated",
        player: publicPlayer(player)
      }, id);
    }

    // Передаём другим игрокам события игры
    if (
      message.type === "shoot" ||
      message.type === "reload" ||
      message.type === "super"
    ) {
      broadcast({
        type: message.type,
        playerId: id,
        x: player.x,
        y: player.y
      }, id);
    }
  });

  ws.on("close", () => {
    players.delete(id);
    broadcast({ type: "playerLeft", id });
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error.message);
  });
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Game server started on port ${PORT}`);
});
      
