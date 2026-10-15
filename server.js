"use strict";

const WebSocket = require("ws");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 32;
const WORLD_WIDTH = 2200;
const WORLD_HEIGHT = 2200;

const server = new WebSocket.Server({
    port: PORT
});

const players = new Map();

function send(socket, data) {
    if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(data));
    }
}

function broadcast(data, except = null) {
    const message = JSON.stringify(data);

    for (const socket of server.clients) {
        if (
            socket !== except &&
            socket.readyState === WebSocket.OPEN
        ) {
            socket.send(message);
        }
    }
}

function getPlayerList() {
    return Array.from(players.values());
}

function cleanName(name) {
    if (typeof name !== "string") {
        return "Игрок";
    }

    return name
        .replace(/[<>]/g, "")
        .trim()
        .slice(0, 16) || "Игрок";
}

function safeNumber(value, min, max, fallback = 0) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return fallback;
    }

    return Math.max(min, Math.min(max, value));
}

server.on("connection", socket => {
    if (players.size >= MAX_PLAYERS) {
        send(socket, {
            type: "error",
            message: "Сервер заполнен"
        });

        socket.close(1008, "Server full");
        return;
    }

    const id = crypto.randomUUID();

    const player = {
        id,
        name: "Игрок",
        x: WORLD_WIDTH / 2,
        y: WORLD_HEIGHT / 2,
        angle: 0,
        health: 100,
        weapon: "pistol",
        connected: true
    };

    players.set(id, player);

    console.log("Подключился:", id);

    send(socket, {
        type: "welcome",
        id,
        world: {
            width: WORLD_WIDTH,
            height: WORLD_HEIGHT
        },
        players: getPlayerList()
    });

    broadcast({
        type: "playerJoined",
        player
    }, socket);

    broadcast({
        type: "playerCount",
        count: players.size
    });

    socket.on("message", raw => {
        let data;

        try {
            data = JSON.parse(raw.toString());
        } catch {
            send(socket, {
                type: "error",
                message: "Некорректное сообщение"
            });
            return;
        }

        if (!data || typeof data.type !== "string") {
            return;
        }

        switch (data.type) {
            case "join": {
                player.name = cleanName(data.name);

                send(socket, {
                    type: "joined",
                    id,
                    name: player.name
                });

                broadcast({
                    type: "playerUpdated",
                    player
                });

                break;
            }

            case "move": {
                player.x = safeNumber(
                    data.x, 0, WORLD_WIDTH, player.x
                );

                player.y = safeNumber(
                    data.y, 0, WORLD_HEIGHT, player.y
                );

                player.angle = safeNumber(
                    data.angle, -100000, 100000, player.angle
                );

                if (typeof data.health === "number") {
                    player.health = safeNumber(
                        data.health, 0, 100, player.health
                    );
                }

                if (typeof data.weapon === "string") {
                    const allowedWeapons = [
                        "pistol",
                        "rifle",
                        "shotgun",
                        "sniper"
                    ];

                    if (allowedWeapons.includes(data.weapon)) {
                        player.weapon = data.weapon;
                    }
                }

                broadcast({
                    type: "playerMoved",
                    player
                }, socket);

                break;
            }

            case "ping": {
                send(socket, {
                    type: "pong",
                    time: Date.now()
                });

                break;
            }

            default: {
                send(socket, {
                    type: "error",
                    message: "Неизвестный тип сообщения"
                });
            }
        }
    });

    socket.on("close", () => {
        players.delete(id);

        console.log("Отключился:", id);

        broadcast({
            type: "playerLeft",
            id
        });

        broadcast({
            type: "playerCount",
            count: players.size
        });
    });

    socket.on("error", error => {
        console.error("Ошибка WebSocket:", error.message);
    });
});

server.on("listening", () => {
    console.log(`Neon Strike server запущен на порту ${PORT}`);
    console.log(`Игроков максимум: ${MAX_PLAYERS}`);
});

server.on("error", error => {
    console.error("Ошибка сервера:", error.message);
});
