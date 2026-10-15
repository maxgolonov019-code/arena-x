
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

const WORLD = {
    width: 240,
    depth: 180
};

const players = new Map();
const projectiles = new Map();

let nextPlayerId = 1;
let nextProjectileId = 1;

app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (req, res) => {
    res.json({ status: "ok" });
});

// Одинаковый генератор случайных чисел на сервере и клиенте.
function seededRandom(seed) {
    let value = seed >>> 0;

    return function () {
        value = (value * 1664525 + 1013904223) >>> 0;
        return value / 4294967296;
    };
}

// Генерируем одинаковые препятствия на сервере и клиенте.
const random = seededRandom(43129);
const obstacles = [];

for (let i = 0; i < 145; i++) {
    obstacles.push({
        x: 5 + random() * (WORLD.width - 10),
        z: 5 + random() * (WORLD.depth - 10),
        radius: 1.6 + random() * 1.1,
        type: "tree"
    });
}

for (let i = 0; i < 48; i++) {
    obstacles.push({
        x: 5 + random() * (WORLD.width - 10),
        z: 5 + random() * (WORLD.depth - 10),
        radius: 0.8 + random() * 0.6,
        type: "rock"
    });
}

for (let i = 0; i < 12; i++) {
    obstacles.push({
        x: 25 + random() * (WORLD.width - 50),
        z: 25 + random() * (WORLD.depth - 50),
        radius: 2.2,
        type: "cover"
    });
}

function terrainHeight(x, z) {
    return (
        Math.sin(x * 0.055) * 1.5 +
        Math.cos(z * 0.065) * 1.1 +
        Math.sin((x + z) * 0.035) * 1.3
    );
}

function randomSpawn() {
    for (let attempt = 0; attempt < 40; attempt++) {
        const x = 8 + Math.random() * (WORLD.width - 16);
        const z = 8 + Math.random() * (WORLD.depth - 16);

        if (!isBlocked(x, z, 2.5)) {
            return { x, z };
        }
    }

    return { x: WORLD.width / 2, z: WORLD.depth / 2 };
}

function isBlocked(x, z, radius) {
    for (const obstacle of obstacles) {
        const dx = x - obstacle.x;
        const dz = z - obstacle.z;
        const minDistance = radius + obstacle.radius;

        if (dx * dx + dz * dz < minDistance * minDistance) {
            return true;
        }
    }

    return false;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function send(socket, data) {
    if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(data));
    }
}

function publicPlayer(player) {
    return {
        id: player.id,
        name: player.name,
        x: player.x,
        y: terrainHeight(player.x, player.z),
        z: player.z,
        yaw: player.yaw,
        hp: player.hp,
        maxHp: player.maxHp,
        level: player.level,
        xp: player.xp,
        nextXp: player.level * 100,
        coins: player.coins,
        damage: player.damage,
        speed: player.speed,
        color: player.color,
        alive: player.hp > 0,
        attackEffect: player.attackEffect
    };
}

function broadcast(data) {
    const message = JSON.stringify(data);

    for (const socket of wss.clients) {
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(message);
        }
    }
}

function addExperience(player, amount) {
    player.xp += amount;

    while (player.xp >= player.level * 100) {
        player.xp -= player.level * 100;
        player.level++;

        player.maxHp += 10;
        player.hp = Math.min(player.maxHp, player.hp + 25);
        player.coins += 10;
    }
}

function damagePlayer(target, amount, attackerId) {
    if (target.hp <= 0) {
        return;
    }

    target.hp = Math.max(0, target.hp - amount);

    if (target.hp === 0) {
        target.respawnTimer = 3;

        const attacker = players.get(attackerId);

        if (attacker && attacker.id !== target.id) {
            attacker.coins += 20;
            addExperience(attacker, 35);
        }
    }
}

function startMelee(player) {
    if (player.hp <= 0 || player.meleeCooldown > 0) {
        return;
    }

    player.meleeCooldown = 0.55;
    player.attackEffect = 0.25;

    const range = 3.6;
    const directionX = Math.sin(player.yaw);
    const directionZ = -Math.cos(player.yaw);

    for (const target of players.values()) {
        if (target.id === player.id || target.hp <= 0) {
            continue;
        }

        const dx = target.x - player.x;
        const dz = target.z - player.z;
        const distance = Math.hypot(dx, dz);

        if (distance > range || distance < 0.01) {
            continue;
        }

        const dot = (
            dx / distance * directionX +
            dz / distance * directionZ
        );

        if (dot > 0.35) {
            damagePlayer(target, player.damage, player.id);
        }
    }
}

function startMagic(player) {
    if (player.hp <= 0 || player.magicCooldown > 0) {
        return;
    }

    player.magicCooldown = 0.8;
    player.attackEffect = 0.3;

    const directionX = Math.sin(player.yaw);
    const directionZ = -Math.cos(player.yaw);

    const projectile = {
        id: String(nextProjectileId++),
        ownerId: player.id,
        x: player.x + directionX * 1.4,
        z: player.z + directionZ * 1.4,
        vx: directionX * 24,
        vz: directionZ * 24,
        life: 2,
        damage: Math.round(player.damage * 0.75)
    };

    projectiles.set(projectile.id, projectile);
}

function buyUpgrade(player, upgrade) {
    const prices = {
        damage: 50 + (player.damage - 20) * 5,
        health: 60 + (player.maxHp - 100) * 2,
        speed: 70 + (player.speed - 10) * 15,
        heal: 25
    };

    if (!Object.hasOwn(prices, upgrade)) {
        return;
    }

    const price = prices[upgrade];

    if (player.coins < price) {
        return;
    }

    if (upgrade === "damage" && player.damage >= 60) {
        return;
    }

    if (upgrade === "health" && player.maxHp >= 250) {
        return;
    }

    if (upgrade === "speed" && player.speed >= 17) {
        return;
    }

    if (upgrade === "heal" && player.hp >= player.maxHp) {
        return;
    }

    player.coins -= price;

    if (upgrade === "damage") {
        player.damage += 5;
    } else if (upgrade === "health") {
        player.maxHp += 20;
        player.hp = Math.min(player.maxHp, player.hp + 20);
    } else if (upgrade === "speed") {
        player.speed += 1;
    } else if (upgrade === "heal") {
        player.hp = player.maxHp;
    }
}

wss.on("connection", (socket) => {
    const id = String(nextPlayerId++);
    const spawn = randomSpawn();

    const player = {
        id,
        name: "Игрок " + id,
        x: spawn.x,
        z: spawn.z,
        yaw: 0,
        hp: 100,
        maxHp: 100,
        level: 1,
        xp: 0,
        coins: 50,
        damage: 20,
        speed: 10,
        color: ["#6dd7ff", "#ffbf69", "#d6a2ff", "#91e7a7"][
            Math.floor(Math.random() * 4)
        ],
        input: {
            forward: 0,
            side: 0
        },
        attackEffect: 0,
        meleeCooldown: 0,
        magicCooldown: 0,
        respawnTimer: 0
    };

    players.set(id, player);

    send(socket, {
        type: "welcome",
        id,
        world: WORLD
    });

    socket.on("message", (raw) => {
        let data;

        try {
            data = JSON.parse(raw.toString());
        } catch {
            return;
        }

        if (!data || typeof data.type !== "string") {
            return;
        }

        if (data.type === "join") {
            const name = String(data.name || "")
                .replace(/[<>]/g, "")
                .trim()
                .slice(0, 16);

            player.name = name || "Игрок " + id;
            return;
        }

        if (data.type === "input") {
            const forward = Number(data.forward);
            const side = Number(data.side);
            const yaw = Number(data.yaw);

            if (
                Number.isFinite(forward) &&
                Number.isFinite(side) &&
                Number.isFinite(yaw)
            ) {
                player.input.forward = clamp(forward, -1, 1);
                player.input.side = clamp(side, -1, 1);
                player.yaw = yaw;
            }

            return;
        }

        if (data.type === "attack") {
            if (data.attackType === "melee") {
                startMelee(player);
            } else if (data.attackType === "magic") {
                startMagic(player);
            }

            return;
        }

        if (data.type === "buy") {
            buyUpgrade(player, data.upgrade);
        }
    });

    socket.on("close", () => {
        players.delete(id);
    });

    socket.on("error", () => {
        players.delete(id);
    });
});

function update(dt) {
    for (const player of players.values()) {
        player.meleeCooldown = Math.max(0, player.meleeCooldown - dt);
        player.magicCooldown = Math.max(0, player.magicCooldown - dt);
        player.attackEffect = Math.max(0, player.attackEffect - dt);

        if (player.hp <= 0) {
            player.respawnTimer -= dt;

            if (player.respawnTimer <= 0) {
                const spawn = randomSpawn();

                player.x = spawn.x;
                player.z = spawn.z;
                player.hp = player.maxHp;
            }

            continue;
        }

        const forward = player.input.forward;
        const side = player.input.side;
        const length = Math.hypot(forward, side) || 1;

        const f = forward / length;
        const s = side / length;

        // yaw = 0 смотрит вдоль -Z, как камера Three.js.
        const dx = Math.sin(player.yaw) * f + Math.cos(player.yaw) * s;
        const dz = -Math.cos(player.yaw) * f + Math.sin(player.yaw) * s;

        const moveX = dx * player.speed * dt;
        const moveZ = dz * player.speed * dt;

        const nextX = clamp(player.x + moveX, 2, WORLD.width - 2);
        const nextZ = clamp(player.z + moveZ, 2, WORLD.depth - 2);

        // Раздельная проверка осей позволяет скользить вдоль укрытий.
        if (!isBlocked(nextX, player.z, 0.7)) {
            player.x = nextX;
        }

        if (!isBlocked(player.x, nextZ, 0.7)) {
            player.z = nextZ;
        }
    }

    for (const [id, projectile] of projectiles) {
        projectile.x += projectile.vx * dt;
        projectile.z += projectile.vz * dt;
        projectile.life -= dt;

        let remove = (
            projectile.life <= 0 ||
            projectile.x < 0 ||
            projectile.z < 0 ||
            projectile.x > WORLD.width ||
            projectile.z > WORLD.depth
        );

        if (isBlocked(projectile.x, projectile.z, 0.25)) {
            remove = true;
        }

        for (const target of players.values()) {
            if (
                remove ||
                target.id === projectile.ownerId ||
                target.hp <= 0
            ) {
                continue;
            }

            if (
                Math.hypot(
                    target.x - projectile.x,
                    target.z - projectile.z
                ) < 1.25
            ) {
                damagePlayer(
                    target,
                    projectile.damage,
                    projectile.ownerId
                );

                remove = true;
            }
        }

        if (remove) {
            projectiles.delete(id);
        }
    }
}

let previousTime = Date.now();

setInterval(() => {
    const now = Date.now();
    const dt = Math.min((now - previousTime) / 1000, 0.05);

    previousTime = now;
    update(dt);

    broadcast({
        type: "state",
        players: Array.from(players.values(), publicPlayer),
        projectiles: Array.from(projectiles.values()).map((p) => ({
            id: p.id,
            x: p.x,
            z: p.z
        }))
    });
}, 50);

server.listen(PORT, "0.0.0.0", () => {
    console.log(`ARENA X 3D запущена на порту ${PORT}`);
});
            
