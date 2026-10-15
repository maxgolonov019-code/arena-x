
"use strict";

(() => {
    const $ = id => document.getElementById(id);

    const canvas = $("game");
    const ctx = canvas.getContext("2d");

    // Render: WSS для HTTPS, WS для HTTP.
    // Предполагается, что сайт и WebSocket-сервер находятся
    // на одном адресе Render.
    const SERVER_URL =
        `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}`;

    const WORLD = { width: 2200, height: 2200 };
    const MAX_ENEMIES = 18;

    let socket = null;
    let connected = false;
    let gameStarted = false;
    let lastTime = 0;
    let lastServerUpdate = 0;
    let messageTimer = 0;
    let cameraX = 0;
    let cameraY = 0;
    let shooting = false;
    let joystickX = 0;
    let joystickY = 0;
    let joystickPointer = null;
    let keys = {};
    let enemySpawnTimer = 0;

    const remotePlayers = new Map();
    const buildings = [];
    const bullets = [];
    const enemies = [];
    const particles = [];

    const player = {
        id: null,
        name: "Игрок",
        x: 1100,
        y: 1100,
        angle: 0,
        radius: 15,
        speed: 230,
        health: 100,
        coins: 0,
        level: 1,
        kills: 0,
        weapon: "pistol",
        ammo: 12,
        maxAmmo: 12,
        reloading: false,
        reloadTimer: 0,
        fireTimer: 0,
        invincible: 0,
        dead: false,
        super: null,
        superTimer: 0
    };

    const weapons = {
        pistol: {
            name: "Пистолет",
            damage: 20,
            speed: 650,
            delay: 0.3,
            ammo: 12,
            cost: 0,
            owned: true,
            spread: 0.035,
            count: 1,
            color: "#ffe38a"
        },
        smg: {
            name: "ПП",
            damage: 10,
            speed: 700,
            delay: 0.09,
            ammo: 35,
            cost: 100,
            owned: false,
            spread: 0.12,
            count: 1,
            color: "#83eaff"
        },
        shotgun: {
            name: "Дробовик",
            damage: 13,
            speed: 570,
            delay: 0.65,
            ammo: 8,
            cost: 180,
            owned: false,
            spread: 0.48,
            count: 6,
            color: "#ffb36b"
        },
        rifle: {
            name: "Автомат",
            damage: 24,
            speed: 850,
            delay: 0.19,
            ammo: 30,
            cost: 300,
            owned: false,
            spread: 0.055,
            count: 1,
            color: "#b6ff89"
        },
        sniper: {
            name: "Снайперка",
            damage: 70,
            speed: 1100,
            delay: 0.9,
            ammo: 5,
            cost: 450,
            owned: false,
            spread: 0.008,
            count: 1,
            color: "#ff91e8"
        }
    };

    const supers = {
        dash: {
            name: "Рывок",
            cost: 100,
            owned: false,
            cooldown: 5
        },
        heal: {
            name: "Лечение",
            cost: 150,
            owned: false,
            cooldown: 12
        },
        blast: {
            name: "Взрыв",
            cost: 220,
            owned: false,
            cooldown: 10
        }
    };

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function random(min, max) {
        return min + Math.random() * (max - min);
    }

    function distance(a, b) {
        return Math.hypot(a.x - b.x, a.y - b.y);
    }

    function showMessage(text) {
        const box = $("message");
        if (!box) return;

        box.textContent = text;
        box.classList.remove("hidden");

        clearTimeout(messageTimer);
        messageTimer = setTimeout(() => {
            box.classList.add("hidden");
        }, 2200);
    }

    function resizeCanvas() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        canvas.width = Math.floor(window.innerWidth * dpr);
        canvas.height = Math.floor(window.innerHeight * dpr);

        canvas.style.width = window.innerWidth + "px";
        canvas.style.height = window.innerHeight + "px";

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();

    function makeWorld() {
        buildings.length = 0;

        for (let i = 0; i < 48; i++) {
            const w = random(100, 210);
            const h = random(90, 180);
            const x = random(40, WORLD.width - w - 40);
            const y = random(40, WORLD.height - h - 40);

            if (Math.hypot(x + w / 2 - player.x,
                y + h / 2 - player.y) < 250) {
                continue;
            }

            const overlaps = buildings.some(b =>
                x < b.x + b.w + 35 &&
                x + w + 35 > b.x &&
                y < b.y + b.h + 35 &&
                y + h + 35 > b.y
            );

            if (!overlaps) {
                buildings.push({
                    x, y, w, h,
                    color: ["#354357", "#3b4658", "#303e50"][
                        Math.floor(Math.random() * 3)
                    ]
                });
            }
        }
    }

    function circleHitsBuilding(x, y, radius) {
        return buildings.some(b => {
            const nx = clamp(x, b.x, b.x + b.w);
            const ny = clamp(y, b.y, b.y + b.h);

            return Math.hypot(x - nx, y - ny) < radius;
        });
    }

    function movePlayer(dx, dy) {
        const nx = clamp(
            player.x + dx,
            player.radius,
            WORLD.width - player.radius
        );

        const ny = clamp(
            player.y + dy,
            player.radius,
            WORLD.height - player.radius
        );

        if (!circleHitsBuilding(nx, player.y, player.radius)) {
            player.x = nx;
        }

        if (!circleHitsBuilding(player.x, ny, player.radius)) {
            player.y = ny;
        }
    }

    function spawnEnemy() {
        if (enemies.length >= MAX_ENEMIES || player.dead) return;

        for (let tries = 0; tries < 30; tries++) {
            const angle = random(0, Math.PI * 2);
            const dist = random(350, 600);
            const x = clamp(
                player.x + Math.cos(angle) * dist,
                30,
                WORLD.width - 30
            );
            const y = clamp(
                player.y + Math.sin(angle) * dist,
                30,
                WORLD.height - 30
            );

            if (
                !circleHitsBuilding(x, y, 16) &&
                Math.hypot(x - player.x, y - player.y) > 240
            ) {
                enemies.push({
                    x, y,
                    radius: 15,
                    health: 60 + player.level * 5,
                    speed: random(55, 85) + player.level * 2,
                    damage: 8,
                    attackTimer: random(0.2, 0.8),
                    hitTimer: 0
                });

                return;
            }
        }
    }

    function addParticles(x, y, color, amount = 7) {
        for (let i = 0; i < amount; i++) {
            particles.push({
                x, y,
                vx: random(-100, 100),
                vy: random(-100, 100),
                life: random(0.2, 0.6),
                color
            });
        }
    }

    function shoot() {
        if (!gameStarted || player.dead || player.reloading) return;
        if (player.fireTimer > 0) return;

        const weapon = weapons[player.weapon];

        if (player.ammo <= 0) {
            showMessage("Нажми перезарядку!");
            player.fireTimer = 0.2;
            return;
        }

        player.ammo--;
        player.fireTimer = weapon.delay;

        for (let i = 0; i < weapon.count; i++) {
            const angle = player.angle + random(
                -weapon.spread,
                weapon.spread
            );

            bullets.push({
                x: player.x + Math.cos(angle) * 23,
                y: player.y + Math.sin(angle) * 23,
                vx: Math.cos(angle) * weapon.speed,
                vy: Math.sin(angle) * weapon.speed,
                damage: weapon.damage,
                life: 1.3,
                color: weapon.color
            });
        }

        addParticles(
            player.x + Math.cos(player.angle) * 25,
            player.y + Math.sin(player.angle) * 25,
            weapon.color,
            3
        );

        updateHUD();
    }

    function reload() {
        if (
            player.dead ||
            player.reloading ||
            player.ammo >= weapons[player.weapon].ammo
        ) return;

        player.reloading = true;
        player.reloadTimer = 1.1;
        updateHUD();
    }

    function useSuper() {
        if (!player.super || player.dead) {
            showMessage("Сначала выбери суперспособность в магазине!");
            return;
        }

        const ability = supers[player.super];

        if (!ability || !ability.owned) {
            showMessage("Способность не куплена!");
            return;
        }

        if (player.superTimer > 0) {
            showMessage("Способность перезаряжается!");
            return;
        }

        if (player.super === "dash") {
            const dx = Math.cos(player.angle) * 180;
            const dy = Math.sin(player.angle) * 180;

            movePlayer(dx, dy);
            player.invincible = 0.7;
            addParticles(player.x, player.y, "#65eaff", 20);
        }

        if (player.super === "heal") {
            player.health = Math.min(100, player.health + 40);
            addParticles(player.x, player.y, "#65ff9b", 18);
            showMessage("Здоровье восстановлено!");
        }

        if (player.super === "blast") {
            for (const e of enemies) {
                if (distance(player, e) < 230) {
                    e.health -= 90;
                    e.hitTimer = 0.15;
                    addParticles(e.x, e.y, "#ff7cda", 12);
                }
            }

            addParticles(player.x, player.y, "#ff7cda", 32);
            showMessage("Взрыв!");
        }

        player.superTimer = ability.cooldown;
        updateHUD();
    }

    function damagePlayer(amount) {
        if (player.invincible > 0 || player.dead) return;

        player.health = Math.max(0, player.health - amount);
        player.invincible = 0.35;

        addParticles(player.x, player.y, "#ff5268", 8);

        if (player.health <= 0) {
            player.dead = true;
            shooting = false;
            showMessage("Ты проиграл! Нажми «Начать игру», чтобы возродиться.");
        }

        updateHUD();
    }

    function killEnemy(index) {
        const e = enemies[index];

        addParticles(e.x, e.y, "#ff5268", 15);
        enemies.splice(index, 1);

        player.kills++;
        player.coins += 10;
        player.level = 1 + Math.floor(player.kills / 5);

        showMessage("+10 монет!");
        updateHUD();
    }

    function update(dt) {
        if (!gameStarted || player.dead) {
            updateCamera();
            return;
        }

        player.fireTimer = Math.max(0, player.fireTimer - dt);
        player.invincible = Math.max(0, player.invincible - dt);
        player.superTimer = Math.max(0, player.superTimer - dt);

        if (player.reloading) {
            player.reloadTimer -= dt;

            if (player.reloadTimer <= 0) {
                player.ammo = weapons[player.weapon].ammo;
                player.maxAmmo = player.ammo;
                player.reloading = false;
                showMessage("Перезарядка завершена");
                updateHUD();
            }
        }

        let dx = joystickX;
        let dy = joystickY;

        if (keys["w"] || keys["arrowup"]) dy -= 1;
        if (keys["s"] || keys["arrowdown"]) dy += 1;
        if (keys["a"] || keys["arrowleft"]) dx -= 1;
        if (keys["d"] || keys["arrowright"]) dx += 1;

        const len = Math.hypot(dx, dy);

        if (len > 0) {
            dx /= len;
            dy /= len;

            movePlayer(
                dx * player.speed * dt,
                dy * player.speed * dt
            );

            if (!joystickPointer) {
                player.angle = Math.atan2(dy, dx);
            }
        }

        if (shooting || keys[" "]) shoot();

        updateBullets(dt);
        updateEnemies(dt);
        updateParticles(dt);

        enemySpawnTimer -= dt;

        if (enemySpawnTimer <= 0) {
            spawnEnemy();
            enemySpawnTimer = random(0.7, 1.5);
        }

        updateCamera();
        updateHUD();

        if (connected && performance.now() - lastServerUpdate > 50) {
            lastServerUpdate = performance.now();

            sendServer({
                type: "move",
                x: player.x,
                y: player.y,
                angle: player.angle,
                health: player.health,
                weapon: player.weapon
            });
        }
    }

    function updateBullets(dt) {
        for (let i = bullets.length - 1; i >= 0; i--) {
            const b = bullets[i];

            b.x += b.vx * dt;
            b.y += b.vy * dt;
            b.life -= dt;

            if (
                b.life <= 0 ||
                b.x < 0 || b.y < 0 ||
                b.x > WORLD.width || b.y > WORLD.height ||
                circleHitsBuilding(b.x, b.y, 3)
            ) {
                bullets.splice(i, 1);
                continue;
            }

            let hit = false;

            for (let j = enemies.length - 1; j >= 0; j--) {
                const e = enemies[j];

                if (Math.hypot(b.x - e.x, b.y - e.y) <
                    e.radius + 4) {
                    e.health -= b.damage;
                    e.hitTimer = 0.12;
                    addParticles(b.x, b.y, b.color, 4);
                    bullets.splice(i, 1);
                    hit = true;

                    if (e.health <= 0) killEnemy(j);
                    break;
                }
            }

            if (hit) continue;
        }
    }

    function updateEnemies(dt) {
        for (let i = enemies.length - 1; i >= 0; i--) {
            const e = enemies[i];

            e.hitTimer = Math.max(0, e.hitTimer - dt);
            e.attackTimer -= dt;

            const dx = player.x - e.x;
            const dy = player.y - e.y;
            const dist = Math.hypot(dx, dy) || 1;

            if (dist > player.radius + e.radius + 4) {
                const mx = dx / dist * e.speed * dt;
                const my = dy / dist * e.speed * dt;

                const nx = e.x + mx;
                const ny = e.y + my;

                if (!circleHitsBuilding(nx, e.y, e.radius)) {
                    e.x = nx;
                }

                if (!circleHitsBuilding(e.x, ny, e.radius)) {
                    e.y = ny;
                }
            } else if (e.attackTimer <= 0) {
                damagePlayer(e.damage);
                e.attackTimer = 0.8;
            }

            if (e.health <= 0) killEnemy(i);
        }
    }

    function updateParticles(dt) {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];

            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= dt;
            p.vx *= 0.96;
            p.vy *= 0.96;

            if (p.life <= 0) particles.splice(i, 1);
        }
    }

    function updateCamera() {
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

        if (player.dead) {
            ctx.fillStyle = "#080b12b8";
            ctx.fillRect(0, 0, w, h);

            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 32px Arial";
            ctx.textAlign = "center";
            ctx.fillText("ПОРАЖЕНИЕ", w / 2, h / 2);
        }
    }

    function drawWorld() {
        ctx.fillStyle = "#1c2932";
        ctx.fillRect(
            -cameraX,
            -cameraY,
            WORLD.width,
            WORLD.height
        );

        ctx.strokeStyle = "#ffffff08";
        ctx.lineWidth = 1;
        ctx.beginPath();

        for (let x = 0; x <= WORLD.width; x += 50) {
            ctx.moveTo(x - cameraX, -cameraY);
            ctx.lineTo(x - cameraX, WORLD.height - cameraY);
        }

        for (let y = 0; y <= WORLD.height; y += 50) {
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
        ) return;

        drawPlayerShape(
            x, y, player.angle, "#6c8cff", player.radius
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
                x, y, p.angle || 0, "#46e7d1", 15
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
                4, 4
            );
        }

        ctx.fillStyle = "#6c8cff";
        ctx.beginPath();
        ctx.arc(
            x + player.x / WORLD.width * size,
            y + player.y / WORLD.height * size,
            3, 0, Math.PI * 2
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
                } else if (player.coins >= weapon.cost) {
                    player.coins -= weapon.cost;
                    weapon.owned = true;
                    player.weapon = key;
                } else {
                    showMessage("Недостаточно монет!");
                    return;
                }

                player.ammo = weapon.ammo;
                player.maxAmmo = weapon.ammo;
                player.reloading = false;

                showMessage(`Оружие: ${weapon.name}`);
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

    function sendServer(data) {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(data));
        }
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

    function connectServer() {
        if (socket && (
            socket.readyState === WebSocket.OPEN ||
            socket.readyState === WebSocket.CONNECTING
        )) return;

        $("connection").textContent = "● Подключение...";
        $("connection").style.color = "#ffcf6b";

        try {
            socket = new WebSocket(SERVER_URL);
        } catch (error) {
            connected = false;
            setConnectionStatus(false);
            showMessage("Не удалось создать подключение");
            return;
        }

        socket.addEventListener("open", () => {
            connected = true;
            setConnectionStatus(true);

            sendServer({
                type: "join",
                name: player.name
            });

            sendServer({
                type: "move",
                x: player.x,
                y: player.y,
                angle: player.angle,
                health: player.health,
                weapon: player.weapon
            });

            updatePlayerCount();
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

    function startGame() {
        if (gameStarted && !player.dead) return;

        player.name =
            $("playerName").value.trim().slice(0, 16) || "Игрок";

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

    for (const name of [
        "pointerup",
        "pointercancel",
        "lostpointercapture"
    ]) {
        $("shootButton").addEventListener(name, () => {
            shooting = false;
        });
    }

    $("reloadButton").addEventListener("click", reload);

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

    window.addEventListener("blur", () => {
        stopStick();
        shooting = false;
        keys = {};
    });

    canvas.addEventListener("pointerdown", event => {
        if (!gameStarted || player.dead) return;

        player.angle = Math.atan2(
            event.clientY + cameraY - player.y,
            event.clientX + cameraX - player.x
        );
    });

    canvas.addEventListener("pointermove", event => {
        if (!gameStarted || player.dead) return;

        player.angle = Math.atan2(
            event.clientY + cameraY - player.y,
            event.clientX + cameraX - player.x
        );
    });

    window.addEventListener("keydown", event => {
        const key = event.key.toLowerCase();
        keys[key] = true;

        if (
            ["arrowup", "arrowdown", "arrowleft", "arrowright", " "]
                .includes(key)
        ) {
            event.preventDefault();
        }

        if (key === "r") reload();
        if (key === "e") useSuper();
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
    updateCamera();
    setConnectionStatus(false);
    updatePlayerCount();

    requestAnimationFrame(loop);
})();
