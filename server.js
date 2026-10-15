
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const WebSocket = require("ws");

const PORT = Number(process.env.PORT) || 10000;
const ROOT = path.join(__dirname, "public");
const players = new Map();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function publicPlayer(player) {
  return {
    id: player.id,
    name: player.name,
    x: player.x,
    y: player.y,
    health: player.health,
    weapon: player.weapon,
    level: player.level
  };
}

function broadcast(data, exceptId = null) {
  const message = JSON.stringify(data);

  for (const [id, player] of players) {
    if (
      id !== exceptId &&
      player.ws.readyState === WebSocket.OPEN
    ) {
      player.ws.send(message);
    }
  }
}

// HTTP: отдаём файлы из папки public
const server = http.createServer((req, res) => {
  let pathname;

  try {
    pathname = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname
    );
  } catch {
    res.writeHead(400);
    res.end("Некорректный адрес");
    return;
  }

  const filename = pathname === "/"
    ? "index.html"
    : path.basename(pathname);

  const allowedFiles = new Set([
    "index.html",
    "game.js",
    "style.css"
  ]);

  if (!allowedFiles.has(filename)) {
    res.writeHead(404);
    res.end("Файл не найден");
    return;
  }

  const filePath = path.join(ROOT, filename);

  fs.readFile(filePath, (error, data) => {
    if (error) {
      console.error("Не удалось прочитать:", filePath);
      console.error(error.message);

      res.writeHead(500, {
        "Content-Type": "text/plain; charset=utf-8"
      });

      res.end("Не удалось открыть " + filename);
      return;
    }

    res.writeHead(200, {
      "Content-Type":
        mimeTypes[path.extname(filename)] ||
        "application/octet-stream",
      "Cache-Control": "no-cache"
    });

    res.end(data);
  });
});

// WebSocket: тот же сервер, отдельный путь /ws
const wss = new WebSocket.Server({
  server,
  path: "/ws"
});

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

    if (!message || typeof message.type !== "string") {
      return;
    }

    if (message.type === "join") {
      if (typeof message.name === "string") {
        player.name =
          message.name.trim().slice(0, 20) || "Игрок";
      }

      broadcast({
        type: "playerUpdated",
        player: publicPlayer(player)
      }, id);

      return;
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
        player.health = Math.max(
          0,
          Math.min(100, message.health)
        );
      }

      if (typeof message.weapon === "string") {
        player.weapon = message.weapon.slice(0, 30);
      }

      if (Number.isFinite(message.level)) {
        player.level = Math.max(
          1,
          Math.min(999, message.level)
        );
      }

      broadcast({
        type: "playerUpdated",
        player: publicPlayer(player)
      }, id);

      return;
    }

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
    console.error("WebSocket:", error.message);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("Сервер запущен на порту " + PORT);
  console.log("Папка игры: " + ROOT);
});
                                 
