
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

const WORLD = {
    width: 2400,
    height: 1800
};

const players = new Map();
const projectiles = new Map();

let nextPlayerId = 1;
let nextProjectileId = 1;

app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (req, res) => {
    res.json({ status: "ok" });
});

function randomSpawn() {
    return {
        x: 200 + Math.random() * (WORLD.width - 400),
        y: 200 + Math.random() * (WORLD.height - 400)
    };
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
        y: player.y,
        hp: player.hp,
        maxHp: player.maxHp,
        facing: player.facing,
        color: player.color,
        attacking: player.attackEffect > 0,
        attackType: player.attackType
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

wss.on("connection", (socket) => {
    const id = String(nextPlayerId++);
    const spawn = randomSpawn();

    const player = {
        id,
        name: "Игрок " + id,
        x: spawn.x,
        y: spawn.y,
        hp: 100,
        maxHp: 100,
        speed: 230,
        facing: 0,
        color: ["#5cc8ff", "#ffbd59", "#d49aff", "#7de0a1"][
            Math.floor(Math.random() * 4)
        ],
        input: { up: false, down: false, left: false, right: false },
        attackEffect: 0,
        attackType: "",
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
            const input = data.input || {};

            player.input = {
                up: input.up === true,
                down: input.down === true,
                left: input.left === true,
                right: input.right === true
            };

            return;
        }

        if (data.type === "attack") {
            if (player.hp <= 0) {
                return;
            }

            if (data.attackType === "melee") {
                meleeAttack(player);
            } else if (data.attackType === "magic") {
                magicAttack(player);
            }
        }
    });

    socket.on("close", () => {
        players.delete(id);
    });

    socket.on("error", () => {
        players.delete(id);
    });
});

function meleeAttack(attacker) {
    if (attacker.meleeCooldown > 0) {
        return;
    }

    attacker.meleeCooldown = 0.55;
    attacker.attackEffect = 0.22;
    attacker.attackType = "melee";

    const range = 88;
    const halfAngle = Math.PI / 2.5;

    for (const target of players.values()) {
        if (target.id === attacker.id || target.hp <= 0) {
            continue;
        }

        const dx = target.x - attacker.x;
        const dy = target.y - attacker.y;
        const distance = Math.hypot(dx, dy);

        if (distance > range || distance === 0) {
            continue;
        }

        const angleToTarget = Math.atan2(dy, dx);
        const difference = Math.atan2(
            Math.sin(angleToTarget - attacker.facing),
            Math.cos(angleToTarget - attacker.facing)
        );

        if (Math.abs(difference) <= halfAngle) {
            damagePlayer(target, 25);
        }
    }
}

function magicAttack(attacker) {
    if (attacker.magicCooldown > 0) {
        return;
    }

    attacker.magicCooldown = 0.8;
    attacker.attackEffect = 0.25;
    attacker.attackType = "magic";

    const speed = 540;

    const projectile = {
        id: String(nextProjectileId++),
        ownerId: attacker.id,
        x: attacker.x + Math.cos(attacker.facing) * 35,
        y: attacker.y + Math.sin(attacker.facing) * 35,
        vx: Math.cos(attacker.facing) * speed,
        vy: Math.sin(attacker.facing) * speed,
        life: 1.8,
        radius: 13
    };

    projectiles.set(projectile.id, projectile);
}

function damagePlayer(target, damage) {
    if (target.hp <= 0) {
        return;
    }

    target.hp = Math.max(0, target.hp - damage);

    if (target.hp === 0) {
        target.respawnTimer = 2.5;
    }
}

function update(dt) {
    for (const player of players.values()) {
        player.meleeCooldown = Math.max(
            0,
            player.meleeCooldown - dt
        );

        player.magicCooldown = Math.max(
            0,
            player.magicCooldown - dt
        );

        player.attackEffect = Math.max(
            0,
            player.attackEffect - dt
        );

        if (player.hp <= 0) {
            player.respawnTimer -= dt;

            if (player.respawnTimer <= 0) {
                const spawn = randomSpawn();

                player.x = spawn.x;
                player.y = spawn.y;
                player.hp = player.maxHp;
            }

            continue;
        }

        let dx = 0;
        let dy = 0;

        if (player.input.left) dx -= 1;
        if (player.input.right) dx += 1;
        if (player.input.up) dy -= 1;
        if (player.input.down) dy += 1;

        if (dx !== 0 || dy !== 0) {
            const length = Math.hypot(dx, dy);

            dx /= length;
            dy /= length;

            player.x += dx * player.speed * dt;
            player.y += dy * player.speed * dt;
            player.facing = Math.atan2(dy, dx);
        }

        player.x = Math.max(
            24,
            Math.min(WORLD.width - 24, player.x)
        );

        player.y = Math.max(
            24,
            Math.min(WORLD.height - 24, player.y)
        );
    }

    for (const [id, projectile] of projectiles) {
        projectile.x += projectile.vx * dt;
        projectile.y += projectile.vy * dt;
        projectile.life -= dt;

        let remove = projectile.life <= 0;

        if (
            projectile.x < 0 ||
            projectile.y < 0 ||
            projectile.x > WORLD.width ||
            projectile.y > WORLD.height
        ) {
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

            const distance = Math.hypot(
                target.x - projectile.x,
                target.y - projectile.y
            );

            if (distance < projectile.radius + 22) {
                damagePlayer(target, 18);
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
            y: p.y
        }))
    });
}, 50);

server.listen(PORT, "0.0.0.0", () => {
    console.log(`ARENA X запущена на порту ${PORT}`);
});
  
