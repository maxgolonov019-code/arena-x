
(() => {
    "use strict";

    const canvas = document.getElementById("game");
    const ctx = canvas.getContext("2d");
    const $ = id => document.getElementById(id);

    const CONFIG = {
        worldWidth: 2200,
        worldHeight: 2200,
        enemySpawnTime: 1.8,
        serverUrl: ""
    };

    const weapons = {
        pistol: {
            name: "Пистолет",
            price: 0,
            damage: 25,
            delay: 0.32,
            speed: 650,
            spread: 0.025,
            pellets: 1,
            color: "#ffe18a",
            description: "Надёжное начальное оружие",
            owned: true
        },
        rifle: {
            name: "Автомат",
            price: 120,
            damage: 15,
            delay: 0.12,
            speed: 850,
            spread: 0.07,
            pellets: 1,
            color: "#8eeaff",
            description: "Быстрая стрельба",
            owned: false
        },
        shotgun: {
            name: "Дробовик",
            price: 180,
            damage: 13,
            delay: 0.65,
            speed: 600,
            spread: 0.48,
            pellets: 6,
            color: "#ffb56b",
            description: "Шесть снарядов за выстрел",
            owned: false
        },
        sniper: {
            name: "Снайперка",
            price: 250,
            damage: 75,
            delay: 1.1,
            speed: 1200,
            spread: 0.005,
            pellets: 1,
            color: "#c7a5ff",
            description: "Большой урон и точность",
            owned: false
        }
    };

    const supers = {
        blast: {
            name: "Суперудар",
            price: 100,
            description: "Урон всем врагам поблизости",
            owned: false,
            cooldown: 8
        },
        dash: {
            name: "Рывок",
            price: 140,
            description: "Быстрый рывок и защита",
            owned: false,
            cooldown: 6
        },
        storm: {
            name: "Электрошок",
            price: 220,
            description: "Мощный удар по врагам",
            owned: false,
            cooldown: 12
        }
    };

    const player = {
        x: CONFIG.worldWidth / 2,
        y: CONFIG.worldHeight / 2,
        radius: 17,
        speed: 230,
        health: 100,
        maxHealth: 100,
        damageBonus: 0,
        coins: 100,
        level: 1,
        xp: 0,
        xpNext: 100,
        weapon: "pistol",
        angle: 0,
        fireTimer: 0,
        superTimer: 0,
        dashTimer: 0,
        invulnerable: 0,
        dead: false
    };

    let cameraX = 0;
    let cameraY = 0;
    let lastTime = 0;
    let spawnTimer = 0;
    let shooting = false;
    let joystickPointer = null;
    let joystickX = 0;
    let joystickY = 0;
    let aimPointer = null;
    let aimX = 0;
    let aimY = 0;
    let messageTimer = 0;
    let socket = null;
    let online = false;
    let gameStarted = false;

    const keys = {};
    const bullets = [];
    const enemies = [];
    const particles = [];
    const decorations = [];
    const buildings = [];

    function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        canvas.width = Math.floor(innerWidth * dpr);
        canvas.height = Math.floor(innerHeight * dpr);
        canvas.style.width = innerWidth + "px";
        canvas.style.height = innerHeight + "px";

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    window.addEventListener("resize", resize);
    resize();

    function random(min, max) {
        return min + Math.random() * (max - min);
    }

    function distance(a, b) {
        return Math.hypot(a.x - b.x, a.y - b.y);
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function showMessage(text) {
        const element = $("message");

        element.textContent = text;
        element.style.opacity = "1";
        messageTimer = 2.2;
    }

    function makeWorld() {
        for (let i = 0; i < 450; i++) {
            decorations.push({
                x: random(0, CONFIG.worldWidth),
                y: random(0, CONFIG.worldHeight),
                size: random(2, 7),
                color: Math.random() > 0.5 ? "#263d36" : "#30463c"
            });
        }

        const blockSize = 175;
        const gap = 80;

        for (
            let x = 100;
            x < CONFIG.worldWidth - blockSize;
            x += blockSize + gap
        ) {
            for (
                let y = 100;
                y < CONFIG.worldHeight - blockSize;
                y += blockSize + gap
            ) {
                if (Math.random() < 0.25) continue;

                buildings.push({
                    x,
                    y,
                    w: random(95, blockSize),
                    h: random(95, blockSize),
                    color: ["#41495a", "#4c5364", "#3c4657"][
                        Math.floor(Math.random() * 3)
                    ]
                });
            }
        }
    }

    function circleRectCollision(x, y, radius, rect) {
        const nearestX = clamp(x, rect.x, rect.x + rect.w);
        const nearestY = clamp(y, rect.y, rect.y + rect.h);

        return Math.hypot(x - nearestX, y - nearestY) < radius;
    }

    function blocked(x, y, radius) {
        if (
            x < radius ||
            y < radius ||
            x > CONFIG.worldWidth - radius ||
            y > CONFIG.worldHeight - radius
        ) {
            return true;
        }

        return buildings.some(building =>
            circleRectCollision(x, y, radius, building)
        );
    }

    function movePlayer(dx, dy) {
        const nextX = player.x + dx;
        const nextY = player.y + dy;

        if (!blocked(nextX, player.y, player.radius)) {
            player.x = nextX;
        }

        if (!blocked(player.x, nextY, player.radius)) {
            player.y = nextY;
        }
    }

    function spawnEnemy() {
        if (enemies.length >= 35) return;

        let x = player.x;
        let y = player.y;

        for (let i = 0; i < 20; i++) {
            const angle = random(0, Math.PI * 2);
            const radius = random(330, 550);

            x = clamp(
                player.x + Math.cos(angle) * radius,
                30,
                CONFIG.worldWidth - 30
            );

            y = clamp(
                player.y + Math.sin(angle) * radius,
                30,
                CONFIG.worldHeight - 30
            );

            if (!blocked(x, y, 16)) break;
        }

        const tough = Math.random() < 0.18;
        const hp = tough ? 90 : 45;

        enemies.push({
            x,
            y,
            radius: tough ? 19 : 15,
            health: hp,
            maxHealth: hp,
            speed: tough ? 75 : random(65, 100),
            damage: tough ? 13 : 7,
            attackTimer: 0,
            color: tough ? "#c45bff" : "#ff596b",
            xp: tough ? 30 : 15,
            coins: tough ? 18 : 8
        });
    }

    function shoot() {
        if (!gameStarted || player.dead) return;

        const weapon = weapons[player.weapon];

        if (player.fireTimer > 0) return;

        player.fireTimer = weapon.delay;

        for (let i = 0; i < weapon.pellets; i++) {
            const angle = player.angle + random(
                -weapon.spread,
                weapon.spread
            );

            bullets.push({
                x: player.x + Math.cos(angle) * 24,
                y: player.y + Math.sin(angle) * 24,
                vx: Math.cos(angle) * weapon.speed,
                vy: Math.sin(angle) * weapon.speed,
                damage: weapon.damage + player.damageBonus,
                radius: weapon.pellets > 1 ? 4 : 5,
                life: 1.5,
                color: weapon.color
            });
        }

        makeParticles(
            player.x + Math.cos(player.angle) * 24,
            player.y + Math.sin(player.angle) * 24,
            weapon.color,
            4
        );
    }

    function makeParticles(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            const angle = random(0, Math.PI * 2);
            const speed = random(30, 160);

            particles.push({
                x,
                y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: random(0.15, 0.4),
                color,
                radius: random(2, 5)
            });
        }
    }

    function gainXP(amount) {
        player.xp += amount;

        while (player.xp >= player.xpNext) {
            player.xp -= player.xpNext;
            player.level++;
            player.xpNext = Math.floor(player.xpNext * 1.35);
            player.maxHealth += 10;
            player.health = player.maxHealth;

            showMessage("Новый уровень: " + player.level + "!");
        }
    }

    function damageEnemy(enemy, damage) {
        enemy.health -= damage;

        makeParticles(enemy.x, enemy.y, enemy.color, 5);

        if (enemy.health <= 0) {
            const index = enemies.indexOf(enemy);

            if (index !== -1) enemies.splice(index, 1);

            player.coins += enemy.coins;
            gainXP(enemy.xp);

            makeParticles(enemy.x, enemy.y, "#ffd66e", 12);
            showMessage("+" + enemy.coins + " монет");
        }
    }

    function useSuper() {
        if (!gameStarted || player.dead) return;

        const active = Object.keys(supers).find(
            key => supers[key].owned
        );

        if (!active) {
            showMessage("Купи суперспособность в магазине!");
            return;
        }

        if (player.superTimer > 0) {
            showMessage("Способность ещё перезаряжается");
            return;
        }

        if (active === "blast") {
            for (const enemy of [...enemies]) {
                if (distance(player, enemy) < 260) {
                    damageEnemy(enemy, 100 + player.damageBonus);
                }
            }

            makeParticles(player.x, player.y, "#bc66ff", 45);
            showMessage("СУПЕРУДАР!");
        }

        if (active === "dash") {
            player.dashTimer = 0.35;
            player.invulnerable = 1;

            makeParticles(player.x, player.y, "#5fffe1", 25);
            showMessage("РЫВОК!");
        }

        if (active === "storm") {
            for (const enemy of [...enemies]) {
                if (distance(player, enemy) < 520) {
                    damageEnemy(enemy, 180 + player.damageBonus);
                    makeParticles(enemy.x, enemy.y, "#63caff", 14);
                }
            }

            makeParticles(player.x, player.y, "#63caff", 60);
            showMessage("ЭЛЕКТРОШОК!");
        }

        player.superTimer = supers[active].cooldown;
        updateHUD();
    }

    function update(dt) {
        if (!gameStarted || player.dead) return;

        player.fireTimer = Math.max(0, player.fireTimer - dt);
        player.superTimer = Math.max(0, player.superTimer - dt);
        player.invulnerable = Math.max(0, player.invulnerable - dt);

        if (player.dashTimer > 0) {
            player.dashTimer -= dt;

            movePlayer(
                Math.cos(player.angle) * 900 * dt,
                Math.sin(player.angle) * 900 * dt
            );
        } else {
            let dx = 0;
            let dy = 0;

            if (keys.w || keys.arrowup) dy -= 1;
            if (keys.s || keys.arrowdown) dy += 1;
            if (keys.a || keys.arrowleft) dx -= 1;
            if (keys.d || keys.arrowright) dx += 1;

            dx += joystickX;
            dy += joystickY;

            const length = Math.hypot(dx, dy);

            if (length > 1) {
                dx /= length;
                dy /= length;
            }

            movePlayer(
                dx * player.speed * dt,
                dy * player.speed * dt
            );
        }

        if (shooting || keys[" "]) shoot();

        spawnTimer += dt;

        if (spawnTimer >= CONFIG.enemySpawnTime) {
            spawnTimer = 0;
            spawnEnemy();
        }

        for (const enemy of [...enemies]) {
            const dx = player.x - enemy.x;
            const dy = player.y - enemy.y;
            const dist = Math.hypot(dx, dy) || 1;

            if (dist > enemy.radius + player.radius + 3) {
                const speed = enemy.speed * dt;
                const nx = enemy.x + dx / dist * speed;
                const ny = enemy.y + dy / dist * speed;

                if (!blocked(nx, enemy.y, enemy.radius)) {
                    enemy.x = nx;
                }

                if (!blocked(enemy.x, ny, enemy.radius)) {
                    enemy.y = ny;
                }
            } else {
                enemy.attackTimer -= dt;

                if (enemy.attackTimer <= 0 && player.invulnerable <= 0) {
                    enemy.attackTimer = 0.8;
                    player.health -= enemy.damage;

                    makeParticles(player.x, player.y, "#ff596b", 5);

                    if (player.health <= 0) {
                        player.health = 0;
                        player.dead = true;
                        shooting = false;

                        showMessage("Ты проиграл!");
                        $("menu").classList.remove("hidden");
                        $("startButton").textContent = "ИГРАТЬ СНОВА";
                    }
                }
            }
        }

        for (let i = bullets.length - 1; i >= 0; i--) {
            const bullet = bullets[i];

            bullet.x += bullet.vx * dt;
            bullet.y += bullet.vy * dt;
            bullet.life -= dt;

            let remove = bullet.life <= 0 ||
                blocked(bullet.x, bullet.y, bullet.radius);

            if (!remove) {
                for (const enemy of [...enemies]) {
                    if (
                        distance(bullet, enemy) <
                        enemy.radius + bullet.radius
                    ) {
                        damageEnemy(enemy, bullet.damage);
                        remove = true;
                        break;
                    }
                }
            }

            if (remove) bullets.splice(i, 1);
        }

        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];

            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= dt;

            if (p.life <= 0) particles.splice(i, 1);
        }

        cameraX = clamp(
            player.x - innerWidth / 2,
            0,
            CONFIG.worldWidth - innerWidth
        );

        cameraY = clamp(
            player.y - innerHeight / 2,
            0,
            CONFIG.worldHeight - innerHeight
        );

        if (messageTimer > 0) {
            messageTimer -= dt;

            if (messageTimer <= 0) {
                $("message").style.opacity = "0";
            }
        }

        updateHUD();
    }

    function draw() {
        const w = innerWidth;
        const h = innerHeight;

        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = "#263b32";
        ctx.fillRect(0, 0, w, h);

        ctx.save();
        ctx.translate(-cameraX, -cameraY);

        drawWorld();
        drawBuildings();
        drawEnemies();
        drawBullets();
        drawPlayer();
        drawParticles();

        ctx.restore();

        drawMinimap();
    }

    function drawWorld() {
        ctx.fillStyle = "#30483b";
        ctx.fillRect(0, 0, CONFIG.worldWidth, CONFIG.worldHeight);

        ctx.fillStyle = "#3b414b";

        for (let x = 0; x < CONFIG.worldWidth; x += 255) {
            ctx.fillRect(x, 0, 75, CONFIG.worldHeight);
        }

        for (let y = 0; y < CONFIG.worldHeight; y += 255) {
            ctx.fillRect(0, y, CONFIG.worldWidth, 75);
        }

        ctx.strokeStyle = "#d3bf70";
        ctx.lineWidth = 3;
        ctx.setLineDash([18, 20]);

        for (let x = 0; x < CONFIG.worldWidth; x += 255) {
            ctx.beginPath();
            ctx.moveTo(x + 37, 0);
            ctx.lineTo(x + 37, CONFIG.worldHeight);
            ctx.stroke();
        }

        for (let y = 0; y < CONFIG.worldHeight; y += 255) {
            ctx.beginPath();
            ctx.moveTo(0, y + 37);
            ctx.lineTo(CONFIG.worldWidth, y + 37);
            ctx.stroke();
        }

        ctx.setLineDash([]);

        for (const d of decorations) {
            ctx.fillStyle = d.color;
            ctx.beginPath();
            ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function drawBuildings() {
        for (const b of buildings) {
            ctx.fillStyle = "#20252d";
            ctx.fillRect(b.x + 7, b.y + 9, b.w, b.h);

            ctx.fillStyle = b.color;
            ctx.fillRect(b.x, b.y, b.w, b.h);

            ctx.fillStyle = "#66778b";

            for (let x = b.x + 14; x < b.x + b.w - 10; x += 29) {
                for (let y = b.y + 14; y < b.y + b.h - 10; y += 29) {
                    ctx.fillRect(x, y, 13, 12);
                }
            }

            ctx.fillStyle = "#272e3a";
            ctx.fillRect(b.x + b.w / 2 - 10, b.y + b.h - 25, 20, 25);
        }
    }

    function drawHealthBar(x, y, width, health, maxHealth) {
        ctx.fillStyle = "#181b22";
        ctx.fillRect(x - width / 2, y, width, 5);

        ctx.fillStyle = "#53e18c";
        ctx.fillRect(
            x - width / 2,
            y,
            width * clamp(health / maxHealth, 0, 1),
            5
        );
    }

    function drawEnemies() {
        for (const enemy of enemies) {
            ctx.fillStyle = "#16192388";
            ctx.beginPath();
            ctx.ellipse(
                enemy.x,
                enemy.y + 5,
                enemy.radius + 5,
                enemy.radius * 0.7,
                0,
                0,
                Math.PI * 2
            );
            ctx.fill();

            ctx.fillStyle = enemy.color;
            ctx.beginPath();
            ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = "#fff";
            ctx.beginPath();
            ctx.arc(enemy.x - 5, enemy.y - 3, 3, 0, Math.PI * 2);
            ctx.arc(enemy.x + 5, enemy.y - 3, 3, 0, Math.PI * 2);
            ctx.fill();

            drawHealthBar(
                enemy.x,
                enemy.y - enemy.radius - 11,
                36,
                enemy.health,
                enemy.maxHealth
            );
        }
    }

    function drawPlayer() {
        ctx.save();
        ctx.translate(player.x, player.y);
        ctx.rotate(player.angle);

        ctx.fillStyle = "#151a26";
        ctx.beginPath();
        ctx.arc(0, 0, player.radius + 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = player.invulnerable > 0
            ? "#5fffe1"
            : "#6e91ff";

        ctx.beginPath();
        ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#dce7ff";
        ctx.fillRect(5, -5, 25, 10);

        ctx.fillStyle = "#26365f";
        ctx.fillRect(5, -3, 20, 6);

        ctx.restore();

        drawHealthBar(
            player.x,
            player.y - 31,
            48,
            player.health,
            player.maxHealth
        );
    }

    function drawBullets() {
        for (const b of bullets) {
            ctx.fillStyle = b.color;
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function drawParticles() {
        for (const p of particles) {
            ctx.globalAlpha = clamp(p.life * 3, 0, 1);
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.globalAlpha = 1;
    }

    function drawMinimap() {
        const size = 105;
        const x = innerWidth - size - 12;
        const y = 64;

        ctx.fillStyle = "#101522dd";
        ctx.fillRect(x, y, size, size);

        const sx = size / CONFIG.worldWidth;
        const sy = size / CONFIG.worldHeight;

        ctx.fillStyle = "#6d7787";

        for (const b of buildings) {
            ctx.fillRect(
                x + b.x * sx,
                y + b.y * sy,
                Math.max(1, b.w * sx),
                Math.max(1, b.h * sy)
            );
        }

        ctx.fillStyle = "#75a0ff";
        ctx.beginPath();
        ctx.arc(
            x + player.x * sx,
            y + player.y * sy,
            3,
            0,
            Math.PI * 2
        );
        ctx.fill();

        ctx.fillStyle = "#ff596b";

        for (const enemy of enemies) {
            ctx.fillRect(
                x + enemy.x * sx - 1,
                y + enemy.y * sy - 1,
                3,
                3
            );
        }
    }

    function updateHUD() {
        $("health").textContent =
            Math.ceil(player.health) + " / " + player.maxHealth;

        $("coins").textContent = player.coins;
        $("level").textContent = "Ур. " + player.level;
        $("shopCoins").textContent = player.coins;

        $("weaponName").textContent = weapons[player.weapon].name;
        $("ammo").textContent = "Бесконечные патроны";

        const active = Object.values(supers).find(item => item.owned);

        $("superName").textContent = active
            ? active.name
            : "Суперспособность";

        $("superStatus").textContent = !active
            ? "Не куплено"
            : player.superTimer > 0
                ? "Перезарядка: " + player.superTimer.toFixed(1) + " с"
                : "Готово!";

        $("superButton").style.opacity =
            active && player.superTimer <= 0 ? "1" : ".75";
    }

    function renderShop() {
        const container = $("shopItems");
        container.innerHTML = "";

        function addItem(name, description, price, action, owned) {
            const row = document.createElement("div");
            row.className = "shopItem";

            const info = document.createElement("div");
            const title = document.createElement("strong");
            const desc = document.createElement("small");

            title.textContent = name;
            desc.textContent = description;

            info.append(title, desc);

            const button = document.createElement("button");
            button.textContent = owned ? "КУПЛЕНО" : price + " 🪙";
            button.disabled = owned;
            button.style.opacity = owned ? ".55" : "1";

            button.addEventListener("click", () => {
                if (!owned) action();
            });

            row.append(info, button);
            container.appendChild(row);
        }

        Object.entries(weapons).forEach(([id, weapon]) => {
            addItem(
                weapon.name,
                weapon.description,
                weapon.price,
                () => {
                    if (player.coins < weapon.price) {
                        showMessage("Недостаточно монет!");
                        return;
                    }

                    player.coins -= weapon.price;
                    weapon.owned = true;
                    player.weapon = id;

                    renderShop();
                    updateHUD();
                    showMessage("Оружие куплено!");
                },
                weapon.owned
            );
        });

        addItem(
            "Улучшение урона",
            "+5 урона за выстрел",
            80,
            () => {
                if (player.coins < 80) {
                    showMessage("Недостаточно монет!");
                    return;
                }

                player.coins -= 80;
                player.damageBonus += 5;

                renderShop();
                updateHUD();
                showMessage("Урон увеличен!");
            },
            false
        );

        addItem(
            "Улучшение здоровья",
            "+25 к максимальному здоровью",
            70,
            () => {
                if (player.coins < 70) {
                    showMessage("Недостаточно монет!");
                    return;
                }

                player.coins -= 70;
                player.maxHealth += 25;
                player.health = Math.min(
                    player.maxHealth,
                    player.health + 25
                );

                renderShop();
                updateHUD();
                showMessage("Здоровье увеличено!");
            },
            false
        );

        addItem(
            "Ускорение",
            "+25 к скорости движения",
            90,
            () => {
                if (player.coins < 90) {
                    showMessage("Недостаточно монет!");
                    return;
                }

                player.coins -= 90;
                player.speed += 25;

                renderShop();
                updateHUD();
                showMessage("Скорость увеличена!");
            },
            false
        );

        Object.entries(supers).forEach(([id, ability]) => {
            addItem(
                "⚡ " + ability.name,
                ability.description + " · Перезарядка " +
                    ability.cooldown + " с",
                ability.price,
                () => {
                    if (player.coins < ability.price) {
                        showMessage("Недостаточно монет!");
                        return;
                    }

                    player.coins -= ability.price;
                    ability.owned = true;

                    renderShop();
                    updateHUD();
                    showMessage("Суперспособность куплена!");
                },
                ability.owned
            );
        });
    }

    function openShop() {
        $("shop").classList.remove("hidden");
        renderShop();
    }

    function closeShop() {
        $("shop").classList.add("hidden");
    }

    function startGame() {
        if (gameStarted && !player.dead) {
            $("menu").classList.add("hidden");
            return;
        }

        if (player.dead) {
            player.x = CONFIG.worldWidth / 2;
            player.y = CONFIG.worldHeight / 2;
            player.health = player.maxHealth;
            player.dead = false;

            bullets.length = 0;
            enemies.length = 0;
            particles.length = 0;
        }

        gameStarted = true;

        const name = $("playerName").value.trim();
        player.name = name || "Игрок";

        $("menu").classList.add("hidden");
        updateHUD();

        if (CONFIG.serverUrl) connectServer();
    }

    function connectServer() {
        try {
            socket = new WebSocket(CONFIG.serverUrl);

            socket.addEventListener("open", () => {
                online = true;

                socket.send(JSON.stringify({
                    type: "join",
                    name: player.name
                }));

                showMessage("Подключено к серверу");
            });

            socket.addEventListener("close", () => {
                online = false;
                showMessage(
                    "Сервер отключён. Игра продолжается локально."
                );
            });

            socket.addEventListener("error", () => {
                online = false;
                showMessage("Сервер недоступен");
            });
        } catch (error) {
            online = false;
            showMessage("Не удалось подключиться к серверу");
        }
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

    $("shootButton").addEventListener("pointerup", () => {
        shooting = false;
    });

    $("shootButton").addEventListener("pointercancel", () => {
        shooting = false;
    });

    $("shootButton").addEventListener("lostpointercapture", () => {
        shooting = false;
    });

    $("reloadButton").addEventListener("click", () => {
        showMessage("У этого оружия бесконечные патроны");
    });

    const joystick = $("joystick");
    const stick = $("stick");

    function moveStick(event) {
        if (joystickPointer !== event.pointerId) return;

        const rect = joystick.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const max = rect.width * 0.34;

        let dx = event.clientX - cx;
        let dy = event.clientY - cy;
        const length = Math.hypot(dx, dy);

        if (length > max) {
            dx = dx / length * max;
            dy = dy / length * max;
        }

        joystickX = dx / max;
        joystickY = dy / max;
        stick.style.transform = `translate(${dx}px, ${dy}px)`;
    }

    function stopStick(event) {
        if (event && event.pointerId !== joystickPointer) return;

        joystickPointer = null;
        joystickX = 0;
        joystickY = 0;
        stick.style.transform = "translate(0, 0)";
    }

    joystick.addEventListener("pointerdown", event => {
        event.preventDefault();

        if (joystickPointer !== null) return;

        joystickPointer = event.pointerId;

        try {
            joystick.setPointerCapture(event.pointerId);
        } catch (_) {}

        moveStick(event);
    });

    joystick.addEventListener("pointermove", moveStick);
    joystick.addEventListener("pointerup", stopStick);
    joystick.addEventListener("pointercancel", stopStick);
    joystick.addEventListener("lostpointercapture", stopStick);

    canvas.addEventListener("pointerdown", event => {
        if (!gameStarted || player.dead) return;

        aimPointer = event.pointerId;

        const rect = canvas.getBoundingClientRect();
        aimX = event.clientX - rect.left;
        aimY = event.clientY - rect.top;

        player.angle = Math.atan2(
            aimY + cameraY - player.y,
            aimX + cameraX - player.x
        );

        if (event.pointerType === "mouse") {
            shooting = event.button === 0;

            if (shooting) shoot();
        }
    });

    canvas.addEventListener("pointermove", event => {
        if (!gameStarted) return;

        const rect = canvas.getBoundingClientRect();
        aimX = event.clientX - rect.left;
        aimY = event.clientY - rect.top;

        player.angle = Math.atan2(
            aimY + cameraY - player.y,
            aimX + cameraX - player.x
        );
    });

    canvas.addEventListener("pointerup", event => {
        if (event.pointerId === aimPointer) aimPointer = null;

        if (event.pointerType === "mouse") shooting = false;
    });

    canvas.addEventListener("pointercancel", () => {
        aimPointer = null;
        shooting = false;
    });

    window.addEventListener("keydown", event => {
        keys[event.key.toLowerCase()] = true;

        if (event.code === "Space") {
            event.preventDefault();
            shooting = true;
            shoot();
        }

        if (event.key === "Escape") closeShop();
    });

    window.addEventListener("keyup", event => {
        keys[event.key.toLowerCase()] = false;

        if (event.code === "Space") shooting = false;
    });

    window.addEventListener("blur", () => {
        shooting = false;

        for (const key in keys) keys[key] = false;

        stopStick();
    });

    function loop(time) {
        const dt = Math.min((time - lastTime) / 1000 || 0, 0.04);
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
