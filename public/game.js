
"use strict";

(() => {
    const $ = id => document.getElementById(id);
    const canvas = $("game");
    const ctx = canvas.getContext("2d");

    const WORLD = { width: 2200, height: 2200 };
    const SERVER_URL = `ws://${location.hostname || "localhost"}:3000`;

    const weapons = {
        pistol:  { name: "Пистолет", cost: 0,   damage: 25, rate: 0.35, ammo: 12, owned: true },
        rifle:   { name: "Автомат",  cost: 120, damage: 18, rate: 0.12, ammo: 30, owned: false },
        shotgun: { name: "Дробовик", cost: 180, damage: 12, rate: 0.65, ammo: 6,  owned: false },
        sniper:  { name: "Снайперка",cost: 250, damage: 80, rate: 1.1,  ammo: 5,  owned: false }
    };

    const supers = {
        blast: { name: "Энергетический взрыв", cost: 100, owned: false },
        dash:  { name: "Рывок",                cost: 140, owned: false },
        storm: { name: "Энергетический шторм", cost: 220, owned: false }
    };

    const player = {
        id: null,
        name: "Игрок",
        x: WORLD.width / 2,
        y: WORLD.height / 2,
        angle: 0,
        radius: 15,
        speed: 220,
        health: 100,
        coins: 100,
        level: 1,
        xp: 0,
        dead: false,
        weapon: "pistol",
        ammo: 12,
        maxAmmo: 12,
        reloading: false,
        shootTimer: 0,
        super: null,
        superTimer: 0,
        invincible: 0
    };

    let cameraX = 0;
    let cameraY = 0;
    let lastTime = 0;
    let spawnTimer = 0;
    let messageTimer = 0;
    let gameStarted = false;
    let shooting = false;
    let joystickPointer = null;
    let joystickX = 0;
    let joystickY = 0;
    let socket = null;
    let connected = false;
    let reconnectTimer = 0;
    let moveSendTimer = 0;
    let nextShotId = 0;

    const keys = {};
    const bullets = [];
    const enemies = [];
    const particles = [];
    const buildings = [];
    const remotePlayers = new Map();

    function resize() {
        canvas.width = window.innerWidth * devicePixelRatio;
        canvas.height = window.innerHeight * devicePixelRatio;
        ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    }

    window.addEventListener("resize", resize);
    resize();

    function random(min, max) {
        return Math.random() * (max - min) + min;
    }

    function distance(a, b) {
        return Math.hypot(a.x - b.x, a.y - b.y);
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function showMessage(text) {
        const box = $("message");
        box.textContent = text;
        box.style.opacity = "1";
        messageTimer = 2.2;
    }

    function makeWorld() {
        buildings.length = 0;

        for (let x = 100; x < WORLD.width - 180; x += 255) {
            for (let y = 100; y < WORLD.height - 180; y += 255) {
                if (Math.random() < 0.68) {
                    buildings.push({
                        x,
                        y,
                        w: random(90, 145),
                        h: random(85, 145),
                        color: ["#29344b", "#30364b", "#253c49"][Math.floor(Math.random() * 3)]
                    });
                }
            }
        }

        // Свободная площадка для появления игроков.
        for (let i = buildings.length - 1; i >= 0; i--) {
            const b = buildings[i];

            if (
                player.x > b.x - 45 &&
                player.x < b.x + b.w + 45 &&
                player.y > b.y - 45 &&
                player.y < b.y + b.h + 45
            ) {
                buildings.splice(i, 1);
            }
        }
    }

    function circleRectCollision(x, y, r, b) {
        const cx = clamp(x, b.x, b.x + b.w);
        const cy = clamp(y, b.y, b.y + b.h);
        return Math.hypot(x - cx, y - cy) < r;
    }

    function blocked(x, y, r = player.radius) {
        if (x < r || y < r || x > WORLD.width - r || y > WORLD.height - r) {
            return true;
        }

        return buildings.some(b => circleRectCollision(x, y, r, b));
    }

    function movePlayer(dx, dy) {
        const nx = player.x + dx;
        const ny = player.y + dy;

        if (!blocked(nx, player.y)) player.x = nx;
        if (!blocked(player.x, ny)) player.y = ny;
    }

    function spawnEnemy() {
        for (let i = 0; i < 25; i++) {
            const angle = random(0, Math.PI * 2);
            const d = random(350, 650);
            const x = clamp(player.x + Math.cos(angle) * d, 25, WORLD.width - 25);
            const y = clamp(player.y + Math.sin(angle) * d, 25, WORLD.height - 25);

            if (!blocked(x, y, 17)) {
                enemies.push({
                    x, y,
                    radius: 15,
                    health: 60 + player.level * 5,
                    speed: random(45, 75) + player.level * 2,
                    hitTimer: 0
                });
                return;
            }
        }
    }

    function shoot() {
        if (!gameStarted || player.dead || player.reloading) return;
        if (player.shootTimer > 0) return;

        const weapon = weapons[player.weapon];

        if (player.ammo <= 0) {
            showMessage("Нет патронов! Нажми ↻");
            return;
        }

        player.shootTimer = weapon.rate;
        player.ammo--;

        const count = player.weapon === "shotgun" ? 5 : 1;

        for (let i = 0; i < count; i++) {
            const spread = player.weapon === "shotgun" ? random(-0.24, 0.24) : 0;
            const angle = player.angle + spread;

            bullets.push({
                x: player.x + Math.cos(angle) * 23,
                y: player.y + Math.sin(angle) * 23,
                vx: Math.cos(angle) * 620,
                vy: Math.sin(angle) * 620,
                damage: weapon.damage,
                life: 1.1,
                color: player.weapon === "sniper" ? "#a7eaff" : "#ffe48a",
                owner: "local",
                shotId: ++nextShotId
            });
        }

        updateHUD();
    }

    function makeParticles(x, y, color, amount = 8) {
        for (let i = 0; i < amount; i++) {
            const a = random(0, Math.PI * 2);
            const speed = random(30, 150);

            particles.push({
                x, y,
                vx: Math.cos(a) * speed,
                vy: Math.sin(a) * speed,
                life: random(0.2, 0.65),
                color
            });
        }
    }

    function gainXP(amount) {
        player.xp += amount;

        while (player.xp >= player.level * 100) {
            player.xp -= player.level * 100;
            player.level++;
            player.coins += 35;
            player.health = Math.min(100, player.health + 20);
            showMessage("Уровень повышен! +35 монет");
        }

        updateHUD();
    }

    function damageEnemy(enemy, damage) {
        enemy.health -= damage;
        enemy.hitTimer = 0.1;
        makeParticles(enemy.x, enemy.y, "#ff6578", 4);

        if (enemy.health <= 0) {
            const index = enemies.indexOf(enemy);
            if (index !== -1) enemies.splice(index, 1);

            player.coins += 8;
            gainXP(25);
            makeParticles(enemy.x, enemy.y, "#ff6578", 12);
            updateHUD();
        }
    }

    function useSuper() {
        if (!gameStarted || player.dead) return;

        if (!player.super || !supers[player.super].owned) {
            showMessage("Купи способность в магазине!");
            return;
        }

        if (player.superTimer > 0) {
            showMessage("Способность перезаряжается");
            return;
        }

        if (player.super === "blast") {
            for (const enemy of [...enemies]) {
                if (distance(player, enemy) < 240) {
                    damageEnemy(enemy, 100);
                }
            }

            makeParticles(player.x, player.y, "#a86aff", 40);
            player.superTimer = 8;
            showMessage("Энергетический взрыв!");
        } else if (player.super === "dash") {
            const dx = Math.cos(player.angle) * 180;
            const dy = Math.sin(player.angle) * 180;

            for (let i = 0; i < 10; i++) {
                const t = (i + 1) / 10;
                const x = player.x + dx * t;
                const y = player.y + dy * t;
                if (!blocked(x, y)) {
                    player.x = x;
                    player.y = y;
                } else {
                    break;
                }
            }

            player.invincible = 0.5;
            player.superTimer = 5;
            makeParticles(player.x, player.y, "#55ddff", 18);
            showMessage("Рывок!");
        } else if (player.super === "storm") {
            for (const enemy of [...enemies]) {
                if (distance(player, enemy) < 430) {
                    damageEnemy(enemy, 150);
                }
            }

            makeParticles(player.x, player.y, "#6fffe0", 55);
            player.superTimer = 14;
            showMessage("Энергетический шторм!");
        }
    }

    function update(dt) {
        if (player.shootTimer > 0) player.shootTimer -= dt;
        if (player.superTimer > 0) player.superTimer -= dt;
        if (player.invincible > 0) player.invincible -= dt;
        if (messageTimer > 0) {
            messageTimer -= dt;
            if (messageTimer <= 0) $("message").style.opacity = "0";
        }

        if (!gameStarted || player.dead) return;

        let dx = joystickX;
        let dy = joystickY;

        if (keys["w"] || keys["arrowup"]) dy--;
        if (keys["s"] || keys["arrowdown"]) dy++;
        if (keys["a"] || keys["arrowleft"]) dx--;
        if (keys["d"] || keys["arrowright"]) dx++;

        const len = Math.hypot(dx, dy);
        if (len > 0) {
            dx /= len;
            dy /= len;
            movePlayer(dx * player.speed * dt, dy * player.speed * dt);
        }

        if (shooting) shoot();

        spawnTimer += dt;
        if (spawnTimer > Math.max(0.6, 1.8 - player.level * 0.05)) {
            spawnTimer = 0;
            if (enemies.length < 35) spawnEnemy();
        }

        for (const enemy of [...enemies]) {
            enemy.hitTimer = Math.max(0, enemy.hitTimer - dt);

            const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
            const d = distance(player, enemy);

            if (d > player.radius + enemy.radius + 2) {
                const nx = enemy.x + Math.cos(angle) * enemy.speed * dt;
                const ny = enemy.y + Math.sin(angle) * enemy.speed * dt;

                if (!blocked(nx, enemy.y, enemy.radius)) enemy.x = nx;
                if (!blocked(enemy.x, ny, enemy.radius)) enemy.y = ny;
            } else if (player.invincible <= 0) {
                player.health -= 18 * dt;

                if (player.health <= 0) {
                    player.health = 0;
                    player.dead = true;
                    showMessage("Ты проиграл! Нажми «Начать игру» для повтора.");
                }
            }
        }

        for (let i = bullets.length - 1; i >= 0; i--) {
            const b = bullets[i];
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            b.life -= dt;

            if (b.life <= 0 || blocked(b.x, b.y, 3)) {
                bullets.splice(i, 1);
                continue;
            }

            if (b.owner === "local") {
                const enemy = enemies.find(e => distance(b, e) < e.radius + 4);

                if (enemy) {
                    damageEnemy(enemy, b.damage);
                    bullets.splice(i, 1);
                }
            }
        }

        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= dt;
            if (p.life <= 0) particles.splice(i, 1);
        }

        cameraX = clamp(
            player.x - window.innerWidth / 2,
            0,
            Math.max(0, WORLD.width - window.innerWidth)
        );

        cameraY = clamp(
            player.y - window.innerHeight / 2,
            0,
            Math.max(0, WORLD.height - window.innerHeight)
        );

        moveSendTimer += dt;
        if (connected && moveSendTimer >= 0.05) {
            moveSendTimer = 0;

            sendServer({
                type: "move",
                x: player.x,
                y: player.y,
                angle: player.angle,
                health: player.health,
                weapon: player.weapon
            });
        }

        updateHUD();
    }

    function sendServer(data) {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(data));
        }
    }

    function connectServer() {
        if (socket && (
            socket.readyState === WebSocket.OPEN ||
            socket.readyState === WebSocket.CONNECTING
        )) return;

        $("connection").textContent = "● Подключение...";
        $("connection").style.color = "#ffcf6b";

        try {
            socket = new WebSocket(SERVER_URL);
        } catch {
            setConnectionStatus(false);
            return;
        }

        socket.addEventListener("open", () => {
            connected = true;
            $("connection").textContent = "● Онлайн";
            $("connection").style.color = "#6dffa3";

            sendServer({
                type: "join",
                name: player.name
            });

            showMessage("Подключено к серверу!");
        });

        socket.addEventListener("message", event => {
            let data;

            try {
                data = JSON.parse(event.data);
            } catch {
                return;
            }

            switch (data.type) {
                case "welcome":
                    player.id = data.id;

                    if (data.world) {
                        WORLD.width = data.world.width || WORLD.width;
                        WORLD.height = data.world.height || WORLD.height;
                    }

                    remotePlayers.clear();

                    for (const p of data.players || []) {
                        if (p.id !== player.id) {
                            remotePlayers.set(p.id, p);
                        }
                    }

                    updatePlayerCount();
                    break;

                case "joined":
                    player.id = data.id;
                    break;

                case "playerJoined":
                case "playerUpdated":
                case "playerMoved":
                    if (data.player && data.player.id !== player.id) {
                        remotePlayers.set(data.player.id, data.player);
                    }

                    updatePlayerCount();
                    break;

                case "playerLeft":
                    remotePlayers.delete(data.id);
                    updatePlayerCount();
                    break;

                case "playerCount":
                    $("playerCount").textContent = data.count;
                    break;

                case "error":
                    showMessage(data.message || "Ошибка сервера");
                    break;
            }
        });

        socket.addEventListener("close", () => {
            connected = false;
            setConnectionStatus(false);
            remotePlayers.clear();
            updatePlayerCount();

            if (gameStarted) {
                showMessage("Связь с сервером потеряна");
            }
        });

        socket.addEventListener("error", () => {
            connected = false;
            setConnectionStatus(false);
        });
    }

    function setConnectionStatus(isOnline) {
        $("connection").textContent = isOnline
            ? "● Онлайн"
            : "● Офлайн";

        $("connection").style.color = isOnline
            ? "#6dffa3"
            : "#ff8b8b";
    }

    function updatePlayerCount() {
        $("playerCount").textContent =
            connected ? remotePlayers.size + 1 : 1;
    }

    function draw() {
        const w = window.innerWidth;
        const h = window.innerHeight;

        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = "#171f2b";
        ctx.fillRect(0, 0, w, h);

        drawWorld();
        drawBuildings();
        drawBullets();
        drawEnemies();
        drawRemotePlayers();
        drawPlayer();
        drawParticles();
        drawMinimap();
    }

    function drawWorld() {
        ctx.fillStyle = "#1c2932";
        ctx.fillRect(-cameraX, -cameraY, WORLD.width, WORLD.height);

        const grid = 50;
        ctx.strokeStyle = "#ffffff08";
        ctx.lineWidth = 1;
        ctx.beginPath();

        for (let x = 0; x <= WORLD.width; x += grid) {
            ctx.moveTo(x - cameraX, -cameraY);
            ctx.lineTo(x - cameraX, WORLD.height - cameraY);
        }

        for (let y = 0; y <= WORLD.height; y += grid) {
            ctx.moveTo(-cameraX, y - cameraY);
            ctx.lineTo(WORLD.width - cameraX, y - cameraY);
        }

        ctx.stroke();

        ctx.strokeStyle = "#61728c";
        ctx.lineWidth = 4;
        ctx.strokeRect(
            -cameraX,
            -cameraY,
            WORLD.width,
            WORLD.height
        );
    }

    function drawBuildings() {
        for (const b of buildings) {
            const x = b.x - cameraX;
            const y = b.y - cameraY;

            if (
                x + b.w < -20 || y + b.h < -20 ||
                x > window.innerWidth + 20 ||
                y > window.innerHeight + 20
            ) continue;

            ctx.fillStyle = "#0005";
            ctx.fillRect(x + 6, y + 7, b.w, b.h);

            ctx.fillStyle = b.color;
            ctx.fillRect(x, y, b.w, b.h);

            ctx.strokeStyle = "#66738c";
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, b.w, b.h);

            ctx.fillStyle = "#53627a";
            ctx.fillRect(x + 9, y + 9, b.w - 18, 5);

            ctx.fillStyle = "#101923";

            for (let wx = x + 14; wx < x + b.w - 8; wx += 27) {
                for (let wy = y + 25; wy < y + b.h - 8; wy += 30) {
                    ctx.fillRect(wx, wy, 12, 15);
                }
            }
        }
    }

    function drawHealthBar(x, y, health, maxHealth = 100) {
        const width = 36;
        const ratio = clamp(health / maxHealth, 0, 1);

        ctx.fillStyle = "#000a";
        ctx.fillRect(x - width / 2, y, width, 5);

        ctx.fillStyle = ratio > 0.5
            ? "#53e58c"
            : ratio > 0.25
                ? "#ffd15b"
                : "#ff5368";

        ctx.fillRect(x - width / 2, y, width * ratio, 5);
    }

    function drawEnemies() {
        for (const e of enemies) {
            const x = e.x - cameraX;
            const y = e.y - cameraY;

            ctx.fillStyle = e.hitTimer > 0 ? "#ffffff" : "#ff5268";
            ctx.beginPath();
            ctx.arc(x, y, e.radius, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = "#571f36";
            ctx.beginPath();
            ctx.arc(x + 4, y - 3, 4, 0, Math.PI * 2);
            ctx.fill();

            drawHealthBar(
                x,
                y - e.radius - 9,
                e.health,
                60 + player.level * 5
            );
        }
    }

    function drawPlayerShape(x, y, angle, color, radius = 15) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);

        ctx.fillStyle = "#0005";
        ctx.beginPath();
        ctx.ellipse(2, 4, radius + 2, radius, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = "#ffffffbb";
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = "#e5edff";
        ctx.fillRect(4, -4, radius + 10, 8);

        ctx.restore();
    }

    function drawPlayer() {
        const x = player.x - cameraX;
        const y = player.y - cameraY;

        if (
            player.invincible > 0 &&
            Math.floor(performance.now() / 80) % 2
        ) {
            return;
        }

        drawPlayerShape(
            x,
            y,
            player.angle,
            "#6c8cff",
            player.radius
        );

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 12px Arial";
        ctx.textAlign = "center";
        ctx.fillText(player.name, x, y - 25);

        drawHealthBar(x, y - 20, player.health, 100);
    }

    function drawRemotePlayers() {
        for (const p of remotePlayers.values()) {
            const x = p.x - cameraX;
            const y = p.y - cameraY;

            if (
                x < -60 || y < -60 ||
                x > window.innerWidth + 60 ||
                y > window.innerHeight + 60
            ) continue;

            drawPlayerShape(
                x,
                y,
                p.angle || 0,
                "#46e7d1",
                15
            );

            ctx.fillStyle = "#d6fff9";
            ctx.font = "bold 12px Arial";
            ctx.textAlign = "center";
            ctx.fillText(p.name || "Игрок", x, y - 25);

            drawHealthBar(x, y - 20, p.health ?? 100, 100);
        }
    }

    function drawBullets() {
        for (const b of bullets) {
            ctx.fillStyle = b.color || "#ffe48a";
            ctx.beginPath();
            ctx.arc(
                b.x - cameraX,
                b.y - cameraY,
                4,
                0,
                Math.PI * 2
            );
            ctx.fill();
        }
    }

    function drawParticles() {
        for (const p of particles) {
            ctx.globalAlpha = clamp(p.life * 2, 0, 1);
            ctx.fillStyle = p.color;
            ctx.fillRect(
                p.x - cameraX,
                p.y - cameraY,
                4,
                4
            );
        }

        ctx.globalAlpha = 1;
    }

    function drawMinimap() {
        const size = 100;
        const x = window.innerWidth - size - 14;
        const y = 100;

        ctx.fillStyle = "#080c16cc";
        ctx.fillRect(x, y, size, size);

        ctx.strokeStyle = "#7b8eaf";
        ctx.strokeRect(x, y, size, size);

        for (const b of buildings) {
            ctx.fillStyle = "#77839a";
            ctx.fillRect(
                x + b.x / WORLD.width * size,
                y + b.y / WORLD.height * size,
                Math.max(1, b.w / WORLD.width * size),
                Math.max(1, b.h / WORLD.height * size)
            );
        }

        for (const p of remotePlayers.values()) {
            ctx.fillStyle = "#46e7d1";
            ctx.fillRect(
                x + p.x / WORLD.width * size - 2,
                y + p.y / WORLD.height * size - 2,
                4,
                4
            );
        }

        ctx.fillStyle = "#6c8cff";
        ctx.beginPath();
        ctx.arc(
            x + player.x / WORLD.width * size,
            y + player.y / WORLD.height * size,
            3,
            0,
            Math.PI * 2
        );
        ctx.fill();
    }

    function updateHUD() {
        $("health").textContent = Math.ceil(player.health);
        $("coins").textContent = player.coins;
        $("level").textContent = player.level;

        $("weaponName").textContent = weapons[player.weapon].name;
        $("ammo").textContent = player.reloading
            ? "Перезарядка..."
            : `${player.ammo} / ${weapons[player.weapon].ammo}`;

        $("superName").textContent = player.super
            ? supers[player.super].name
            : "Суперспособность";

        $("superStatus").textContent = !player.super
            ? "Не выбрана"
            : !supers[player.super].owned
                ? "Не куплена"
                : player.superTimer > 0
                    ? `Перезарядка: ${player.superTimer.toFixed(1)} с`
                    : "Готова к использованию";
    }

    function renderShop() {
        $("shopCoins").textContent = `Монеты: ${player.coins}`;
        const items = $("shopItems");
        items.innerHTML = "";

        for (const [key, weapon] of Object.entries(weapons)) {
            const row = document.createElement("div");
            row.className = "shopItem";

            const info = document.createElement("div");
            info.className = "itemInfo";

            const title = document.createElement("strong");
            title.textContent = weapon.name;

            const description = document.createElement("small");
            description.textContent =
                `Урон: ${weapon.damage} · Патроны: ${weapon.ammo}`;

            info.append(title, description);

            const button = document.createElement("button");
            button.className = "buyButton";

            if (player.weapon === key) {
                button.textContent = "Выбрано";
                button.disabled = true;
            } else if (weapon.owned) {
                button.textContent = "Выбрать";
            } else {
                button.textContent = `${weapon.cost} 🪙`;
            }

            button.onclick = () => {
                if (weapon.owned) {
                    player.weapon = key;
                    player.ammo = weapon.ammo;
                    player.maxAmmo = weapon.ammo;
                    player.reloading = false;
                    showMessage(`Оружие: ${weapon.name}`);
                } else if (player.coins >= weapon.cost) {
                    player.coins -= weapon.cost;
                    weapon.owned = true;
                    player.weapon = key;
                    player.ammo = weapon.ammo;
                    player.maxAmmo = weapon.ammo;
                    showMessage(`Куплено: ${weapon.name}`);
                } else {
                    showMessage("Недостаточно монет!");
                }

                updateHUD();
                renderShop();
            };

            row.append(info, button);
            items.append(row);
        }

        for (const [key, ability] of Object.entries(supers)) {
            const row = document.createElement("div");
            row.className = "shopItem";

            const info = document.createElement("div");
            info.className = "itemInfo";

            const title = document.createElement("strong");
            title.textContent = ability.name;

            const description = document.createElement("small");
            description.textContent = ability.owned
                ? "Способность разблокирована"
                : "Открой способность для боя";

            info.append(title, description);

            const button = document.createElement("button");
            button.className = "buyButton";

            if (player.super === key && ability.owned) {
                button.textContent = "Выбрана";
                button.disabled = true;
            } else if (ability.owned) {
                button.textContent = "Выбрать";
            } else {
                button.textContent = `${ability.cost} 🪙`;
            }

            button.onclick = () => {
                if (!ability.owned) {
                    if (player.coins < ability.cost) {
                        showMessage("Недостаточно монет!");
                        return;
                    }

                    player.coins -= ability.cost;
                    ability.owned = true;
                }

                player.super = key;
                showMessage(`Выбрано: ${ability.name}`);
                updateHUD();
                renderShop();
            };

            row.append(info, button);
            items.append(row);
        }
    }

    function openShop() {
        $("shop").classList.remove("hidden");
        renderShop();
    }

    function closeShop() {
        $("shop").classList.add("hidden");
    }

    function startGame() {
        if (gameStarted && !player.dead) return;

        player.name = $("playerName").value.trim().slice(0, 16) || "Игрок";

        if (player.dead) {
            player.x = WORLD.width / 2;
            player.y = WORLD.height / 2;
            player.health = 100;
            player.dead = false;
            player.ammo = weapons[player.weapon].ammo;
            player.reloading = false;
            bullets.length = 0;
            enemies.length = 0;
        }

        gameStarted = true;
        $("menu").classList.add("hidden");

        makeWorld();
        connectServer();
        updateHUD();
        showMessage("Удачи в бою!");
    }

    $("startButton").addEventListener("click", startGame);
    $("shopButton").addEventListener("click", openShop);
    $("closeShop").addEventListener("click", closeShop);
    $("superButton").addEventListener("click", useSuper);

    $("shootButton").addEventListener("pointerdown", event => {
        event.preventDefault();
        shooting = true;
        shoot();
    });

    for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) {
        $("shootButton").addEventListener(name, () => {
            shooting = false;
        });
    }

    $("reloadButton").addEventListener("click", () => {
        if (
            player.reloading ||
            player.ammo >= weapons[player.weapon].ammo
        ) return;

        player.reloading = true;
        updateHUD();

        setTimeout(() => {
            player.ammo = weapons[player.weapon].ammo;
            player.reloading = false;
            updateHUD();
        }, 1000);
    });

    const joystick = $("joystick");
    const stick = $("stick");

    function moveStick(event) {
        const rect = joystick.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const max = rect.width * 0.34;

        let dx = event.clientX - cx;
        let dy = event.clientY - cy;
        const len = Math.hypot(dx, dy);

        if (len > max) {
            dx = dx / len * max;
            dy = dy / len * max;
        }

        joystickX = dx / max;
        joystickY = dy / max;

        stick.style.transform = `translate(${dx}px, ${dy}px)`;
    }

    joystick.addEventListener("pointerdown", event => {
        event.preventDefault();
        joystickPointer = event.pointerId;
        joystick.setPointerCapture(event.pointerId);
        moveStick(event);
    });

    joystick.addEventListener("pointermove", event => {
        if (event.pointerId === joystickPointer) {
            moveStick(event);
        }
    });

    function stopStick(event) {
        if (event && event.pointerId !== joystickPointer) return;

        joystickPointer = null;
        joystickX = 0;
        joystickY = 0;
        stick.style.transform = "translate(0, 0)";
    }

    joystick.addEventListener("pointerup", stopStick);
    joystick.addEventListener("pointercancel", stopStick);
    window.addEventListener("blur", () => stopStick());

    canvas.addEventListener("pointerdown", event => {
        if (!gameStarted || player.dead) return;

        const x = event.clientX + cameraX;
        const y = event.clientY + cameraY;

        player.angle = Math.atan2(y - player.y, x - player.x);
    });

    canvas.addEventListener("pointermove", event => {
        if (!gameStarted || player.dead) return;

        const x = event.clientX + cameraX;
        const y = event.clientY + cameraY;

        player.angle = Math.atan2(y - player.y, x - player.x);
    });

    window.addEventListener("keydown", event => {
        keys[event.key.toLowerCase()] = true;

        if (
            ["arrowup", "arrowdown", "arrowleft", "arrowright", " "]
                .includes(event.key.toLowerCase())
        ) {
            event.preventDefault();
        }

        if (event.key.toLowerCase() === "r") {
            $("reloadButton").click();
        }

        if (event.key.toLowerCase() === "e") {
            useSuper();
        }
    });

    window.addEventListener("keyup", event => {
        keys[event.key.toLowerCase()] = false;
    });

    function loop(time) {
        const dt = Math.min((time - lastTime) / 1000 || 0, 0.05);
        lastTime = time;

        update(dt);
        draw();

        requestAnimationFrame(loop);
    }

    makeWorld();
    renderShop();
    updateHUD();
    requestAnimationFrame(loop);
})();
