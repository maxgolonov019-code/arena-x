
"use strict";

const THREE = window.THREE;

if (!THREE) {
    document.getElementById("connectionText").textContent =
        "Не загрузился Three.js. Проверь подключение к интернету.";
    throw new Error("Three.js не загружен");
}

const worldElement = document.getElementById("world");
const menuScreen = document.getElementById("menuScreen");
const lobbyScreen = document.getElementById("lobbyScreen");
const shopScreen = document.getElementById("shopScreen");

const nameInput = document.getElementById("nameInput");
const playButton = document.getElementById("playButton");
const connectionText = document.getElementById("connectionText");
const gameStatus = document.getElementById("gameStatus");

const coinsElement = document.getElementById("coins");
const levelElement = document.getElementById("level");
const healthFill = document.getElementById("healthFill");
const healthText = document.getElementById("healthText");
const xpFill = document.getElementById("xpFill");
const xpText = document.getElementById("xpText");

const joystick = document.getElementById("joystick");
const joystickKnob = document.getElementById("joystickKnob");

const WORLD = {
    width: 240,
    depth: 180
};

let socket = null;
let myId = null;
let connected = false;
let joined = false;

let players = [];
let projectiles = [];

const remoteModels = new Map();
const projectileModels = new Map();
const obstacleColliders = [];

const input = {
    forward: 0,
    side: 0
};

const cameraControl = {
    yaw: 0,
    pitch: 0
};

const joystickState = {
    active: false,
    pointerId: null,
    x: 0,
    y: 0,
    maxDistance: 38
};

const pointerLook = {
    active: false,
    pointerId: null,
    x: 0,
    y: 0
};

let lastInputTime = 0;
let lastHudTime = 0;
let toastTimer = null;

const scene = new THREE.Scene();
scene.background = new THREE.Color("#a8c9b4");
scene.fog = new THREE.Fog("#a8c9b4", 55, 155);

const camera = new THREE.PerspectiveCamera(
    76,
    window.innerWidth / window.innerHeight,
    0.1,
    260
);

camera.rotation.order = "YXZ";
scene.add(camera);

const renderer = new THREE.WebGLRenderer({
    antialias: window.devicePixelRatio < 2,
    powerPreference: "high-performance"
});

renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.shadowMap.enabled = false;

worldElement.appendChild(renderer.domElement);

// СВЕТ

scene.add(new THREE.HemisphereLight("#e3f5ff", "#526b43", 1.6));

const sunlight = new THREE.DirectionalLight("#fff0d3", 1.5);
sunlight.position.set(-40, 90, 30);
scene.add(sunlight);

// МАТЕРИАЛЫ

const materials = {
    grass: new THREE.MeshStandardMaterial({
        color: "#779e57",
        roughness: 1
    }),
    treeTrunk: new THREE.MeshStandardMaterial({
        color: "#795439",
        roughness: 1
    }),
    rock: new THREE.MeshStandardMaterial({
        color: "#7d8c79",
        roughness: 1
    }),
    cover: new THREE.MeshStandardMaterial({
        color: "#8b7755",
        roughness: 1
    }),
    boundary: new THREE.MeshStandardMaterial({
        color: "#d5dfb2",
        roughness: 1
    }),
    water: new THREE.MeshStandardMaterial({
        color: "#4e9fb6",
        roughness: 0.35,
        metalness: 0.05
    })
};

// ТЕРРЕН

function terrainHeight(x, z) {
    return (
        Math.sin(x * 0.055) * 1.5 +
        Math.cos(z * 0.065) * 1.1 +
        Math.sin((x + z) * 0.035) * 1.3
    );
}

function createTerrain() {
    const geometry = new THREE.PlaneGeometry(
        WORLD.width,
        WORLD.depth,
        120,
        90
    );

    geometry.rotateX(-Math.PI / 2);

    const positions = geometry.attributes.position;
    const colors = [];

    const colorA = new THREE.Color("#7fa85d");
    const colorB = new THREE.Color("#6e994f");
    const colorC = new THREE.Color("#90b56b");

    for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i) + WORLD.width / 2;
        const z = positions.getZ(i) + WORLD.depth / 2;

        positions.setX(i, x);
        positions.setZ(i, z);
        positions.setY(i, terrainHeight(x, z));

        const variation =
            Math.sin(x * 0.08) * Math.cos(z * 0.07);

        let color = colorA;

        if (variation < -0.25) {
            color = colorB;
        } else if (variation > 0.45) {
            color = colorC;
        }

        colors.push(color.r, color.g, color.b);
    }

    geometry.setAttribute(
        "color",
        new THREE.Float32BufferAttribute(colors, 3)
    );

    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 1
    });

    const ground = new THREE.Mesh(geometry, material);
    ground.position.set(0, 0, 0);
    ground.frustumCulled = false;
    scene.add(ground);
}

createTerrain();

// ДЕКОРАТИВНЫЕ ДЕТАЛИ

function seededRandom(seed) {
    let value = seed >>> 0;

    return function () {
        value = (value * 1664525 + 1013904223) >>> 0;
        return value / 4294967296;
    };
}

const random = seededRandom(43129);

function makeMaterial(color, roughness = 1) {
    return new THREE.MeshStandardMaterial({
        color,
        roughness
    });
}

const trunkGeometry = new THREE.CylinderGeometry(
    0.35,
    0.52,
    3.1,
    7
);

const canopyGeometry = new THREE.IcosahedronGeometry(1, 1);
const rockGeometry = new THREE.DodecahedronGeometry(1, 0);
const coverGeometry = new THREE.BoxGeometry(4.2, 2.1, 1.2);

const treeMaterials = [
    makeMaterial("#397749"),
    makeMaterial("#46864b"),
    makeMaterial("#527f42"),
    makeMaterial("#356b40")
];

function addCollider(x, z, radius) {
    obstacleColliders.push({ x, z, radius });
}

function createTree(x, z, radius, shade) {
    const group = new THREE.Group();

    const trunk = new THREE.Mesh(
        trunkGeometry,
        materials.treeTrunk
    );

    trunk.position.y = 1.4;
    group.add(trunk);

    const canopyMaterial = treeMaterials[
        Math.floor(shade * treeMaterials.length)
    ];

    const canopy1 = new THREE.Mesh(
        canopyGeometry,
        canopyMaterial
    );

    canopy1.position.set(0, 3.2, 0);
    canopy1.scale.set(radius * 1.05, radius * 1.1, radius * 1.05);
    group.add(canopy1);

    const canopy2 = new THREE.Mesh(
        canopyGeometry,
        canopyMaterial
    );

    canopy2.position.set(
        radius * 0.55,
        3.1 + radius * 0.3,
        radius * 0.2
    );

    canopy2.scale.setScalar(radius * 0.7);
    group.add(canopy2);

    group.position.set(x, terrainHeight(x, z), z);
    scene.add(group);

    addCollider(x, z, radius * 0.72);
}

function createRock(x, z, radius) {
    const rock = new THREE.Mesh(
        rockGeometry,
        materials.rock
    );

    rock.position.set(
        x,
        terrainHeight(x, z) + radius * 0.35,
        z
    );

    rock.scale.set(
        radius,
        radius * 0.72,
        radius * 0.85
    );

    rock.rotation.set(
        random() * 0.3,
        random() * Math.PI,
        random() * 0.25
    );

    scene.add(rock);
    addCollider(x, z, radius * 0.8);
}

function createCover(x, z, angle) {
    const group = new THREE.Group();

    const box = new THREE.Mesh(
        coverGeometry,
        materials.cover
    );

    box.position.y = 1.05;
    group.add(box);

    const top = new THREE.Mesh(
        new THREE.BoxGeometry(4.35, 0.15, 1.3),
        makeMaterial("#b29a70")
    );

    top.position.y = 2.15;
    group.add(top);

    group.position.set(x, terrainHeight(x, z), z);
    group.rotation.y = angle;

    scene.add(group);
    addCollider(x, z, 2.2);
}

function createNature() {
    for (let i = 0; i < 145; i++) {
        const x = 5 + random() * (WORLD.width - 10);
        const z = 5 + random() * (WORLD.depth - 10);

        createTree(x, z, 1.6 + random() * 1.1, random());
    }

    for (let i = 0; i < 48; i++) {
        const x = 5 + random() * (WORLD.width - 10);
        const z = 5 + random() * (WORLD.depth - 10);

        createRock(x, z, 0.8 + random() * 0.6);
    }

    for (let i = 0; i < 12; i++) {
        const x = 25 + random() * (WORLD.width - 50);
        const z = 25 + random() * (WORLD.depth - 50);

        createCover(x, z, random() * Math.PI);
    }
}

createNature();

// ВОДА И ГРАНИЦА

function createPond() {
    const water = new THREE.Mesh(
        new THREE.CircleGeometry(12, 32),
        materials.water
    );

    water.rotation.x = -Math.PI / 2;
    water.scale.set(1.4, 0.8, 1);
    water.position.set(
        181,
        terrainHeight(181, 35) + 0.1,
        35
    );

    scene.add(water);
}

createPond();

function createBoundaryPost(x, z) {
    const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.35, 1.1, 0.35),
        materials.boundary
    );

    post.position.set(
        x,
        terrainHeight(x, z) + 0.55,
        z
    );

    scene.add(post);
}

function createBoundary() {
    for (let x = 0; x <= WORLD.width; x += 4) {
        createBoundaryPost(x, 0);
        createBoundaryPost(x, WORLD.depth);
    }

    for (let z = 4; z < WORLD.depth; z += 4) {
        createBoundaryPost(0, z);
        createBoundaryPost(WORLD.width, z);
    }
}

createBoundary();

// РУКИ И ОРУЖИЕ

const hands = new THREE.Group();
camera.add(hands);

const armMaterial = makeMaterial("#b87953");
const sleeveMaterial = makeMaterial("#4d7d53");
const weaponMaterial = makeMaterial("#c6d5d7", 0.45);

function createArm(x, y, z, rotationZ) {
    const arm = new THREE.Group();

    const sleeve = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.17, 0.55, 8),
        sleeveMaterial
    );

    sleeve.rotation.z = rotationZ;
    sleeve.position.y = -0.12;
    arm.add(sleeve);

    const hand = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 8, 8),
        armMaterial
    );

    hand.position.y = -0.4;
    arm.add(hand);

    arm.position.set(x, y, z);
    hands.add(arm);

    return arm;
}

const leftArm = createArm(-0.34, -0.38, -0.65, -0.45);
const rightArm = createArm(0.35, -0.37, -0.68, 0.45);

const sword = new THREE.Group();

const swordBlade = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.62, 0.055),
    weaponMaterial
);

swordBlade.position.y = 0.32;
sword.add(swordBlade);

const swordHandle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.045, 0.2, 8),
    makeMaterial("#69452e")
);

swordHandle.position.y = -0.09;
sword.add(swordHandle);

sword.position.set(0.04, -0.12, -0.08);
sword.rotation.z = -0.22;
rightArm.add(sword);

const magicOrb = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.13, 1),
    new THREE.MeshBasicMaterial({ color: "#c69aff" })
);

magicOrb.position.set(0, -0.08, -0.35);
leftArm.add(magicOrb);

// МОДЕЛИ ДРУГИХ ИГРОКОВ

function createRemotePlayer(player) {
    const group = new THREE.Group();

    const color = new THREE.Color(player.color || "#6dd7ff");

    const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.48, 0.8, 3, 7),
        new THREE.MeshStandardMaterial({
            color,
            roughness: 0.8
        })
    );

    body.position.y = 0.9;
    group.add(body);

    const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.31, 10, 8),
        makeMaterial("#e6bd96")
    );

    head.position.y = 1.75;
    group.add(head);

    const helmet = new THREE.Mesh(
        new THREE.SphereGeometry(
            0.34, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.6
        ),
        makeMaterial("#425b42")
    );

    helmet.position.y = 1.86;
    group.add(helmet);

    const weapon = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.9, 0.12),
        weaponMaterial
    );

    weapon.position.set(0.52, 1.0, -0.1);
    weapon.rotation.x = 0.15;
    group.add(weapon);

    const labelCanvas = document.createElement("canvas");
    labelCanvas.width = 256;
    labelCanvas.height = 64;

    const ctx = labelCanvas.getContext("2d");
    ctx.fillStyle = "#14251de8";
    ctx.fillRect(0, 0, 256, 64);
    ctx.font = "bold 28px Arial";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.fillText(player.name || "Игрок", 128, 40);

    const label = new THREE.Sprite(
        new THREE.SpriteMaterial({
            map: new THREE.CanvasTexture(labelCanvas),
            transparent: true,
            depthTest: false
        })
    );

    label.position.y = 2.55;
    label.scale.set(3, 0.75, 1);
    group.add(label);

    group.userData.label = label;

    scene.add(group);
    return group;
}

// СНАРЯДЫ

function createProjectile() {
    const group = new THREE.Group();

    const orb = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.32, 1),
        new THREE.MeshBasicMaterial({ color: "#c59aff" })
    );

    group.add(orb);

    group.add(new THREE.PointLight("#b78aff", 1.5, 5));

    scene.add(group);
    return group;
}

/* ПРОДОЛЖЕНИЕ game.js — вставить сразу после части 1 */

// ПОДКЛЮЧЕНИЕ К МУЛЬТИПЛЕЕРУ

function connect() {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";

    socket = new WebSocket(protocol + "//" + location.host);

    socket.addEventListener("open", () => {
        connected = true;
        playButton.disabled = false;
        playButton.textContent = "ВОЙТИ В МИР";
        connectionText.textContent = "Сервер доступен.";
    });

    socket.addEventListener("message", (event) => {
        let data;

        try {
            data = JSON.parse(event.data);
        } catch {
            return;
        }

        if (data.type === "welcome") {
            myId = data.id;

            if (joined) {
                sendJoin();
            }
        }

        if (data.type === "state") {
            players = data.players || [];
            projectiles = data.projectiles || [];
        }

        if (data.type === "message") {
            showToast(data.text);
        }

        if (data.type === "error") {
            showToast(data.message || "Не удалось выполнить действие");
        }
    });

    socket.addEventListener("close", () => {
        connected = false;
        playButton.disabled = true;
        playButton.textContent = "НЕТ СОЕДИНЕНИЯ";
        connectionText.textContent =
            "Связь потеряна. Перезагрузи страницу.";
        gameStatus.textContent = "Нет соединения с сервером";
    });

    socket.addEventListener("error", () => {
        connectionText.textContent =
            "Не удалось подключиться к серверу.";
    });
}

function send(data) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(data));
    }
}

function sendJoin() {
    if (!connected || !joined) {
        return;
    }

    send({
        type: "join",
        name: nameInput.value.trim().slice(0, 16) || "Игрок"
    });
}

connect();

// МЕНЮ И ЛОББИ

function showScreen(screen) {
    menuScreen.classList.add("hidden");
    lobbyScreen.classList.add("hidden");
    shopScreen.classList.add("hidden");

    if (screen) {
        screen.classList.remove("hidden");
    }

    document.exitPointerLock?.();
}

function enterWorld() {
    if (!connected) {
        connectionText.textContent = "Сервер пока недоступен.";
        return;
    }

    joined = true;
    sendJoin();

    showScreen(null);

    gameStatus.textContent = "Ты в открытом мире";

    if (window.matchMedia("(pointer: fine)").matches) {
        renderer.domElement.requestPointerLock?.();
    }
}

playButton.addEventListener("click", enterWorld);

document.getElementById("lobbyButton").addEventListener("click", () => {
    updateHUD();
    showScreen(lobbyScreen);
});

document.getElementById("menuButton").addEventListener("click", () => {
    updateHUD();
    showScreen(lobbyScreen);
});

document.getElementById("shopButton").addEventListener("click", () => {
    updateHUD();
    showScreen(shopScreen);
});

document.getElementById("returnButton").addEventListener("click", () => {
    if (!joined) {
        enterWorld();
        return;
    }

    showScreen(null);
});

document.getElementById("shopReturnButton").addEventListener("click", () => {
    showScreen(null);
});

document.getElementById("exitButton").addEventListener("click", () => {
    showScreen(menuScreen);
});

document.querySelectorAll("[data-close]").forEach((button) => {
    button.addEventListener("click", () => {
        showScreen(lobbyScreen);
    });
});

document.addEventListener("keydown", (event) => {
    if (
        event.key === "Escape" &&
        menuScreen.classList.contains("hidden") &&
        lobbyScreen.classList.contains("hidden") &&
        shopScreen.classList.contains("hidden")
    ) {
        showScreen(lobbyScreen);
    }
});

// МАГАЗИН

document.querySelectorAll("[data-buy]").forEach((button) => {
    button.addEventListener("click", () => {
        send({
            type: "buy",
            upgrade: button.dataset.buy
        });

        document.getElementById("shopMessage").textContent =
            "Покупка отправлена серверу...";
    });
});

function updateShopPrices(me) {
    const damagePrice = 50 + (me.damage - 20) * 5;
    const healthPrice = 60 + (me.maxHp - 100) * 2;
    const speedPrice = 70 + (me.speed - 10) * 15;

    document.getElementById("damagePrice").textContent =
        me.damage >= 60 ? "МАКСИМУМ" : damagePrice + " ✦";

    document.getElementById("healthPrice").textContent =
        me.maxHp >= 250 ? "МАКСИМУМ" : healthPrice + " ✦";

    document.getElementById("speedPrice").textContent =
        me.speed >= 17 ? "МАКСИМУМ" : speedPrice + " ✦";

    document.getElementById("healPrice").textContent = "25 ✦";

    document.querySelectorAll("[data-buy]").forEach((button) => {
        const upgrade = button.dataset.buy;

        const maxed =
            (upgrade === "damage" && me.damage >= 60) ||
            (upgrade === "health" && me.maxHp >= 250) ||
            (upgrade === "speed" && me.speed >= 17);

        button.disabled = maxed;
        button.textContent = maxed ? "Макс." : "Купить";
    });
}

// HUD

function showToast(message) {
    const toast = document.getElementById("toast");

    toast.textContent = message;
    toast.classList.add("visible");

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
        toast.classList.remove("visible");
    }, 1800);
}

let previousLevel = 1;
let previousCoins = 50;

function updateHUD() {
    const me = players.find((player) => player.id === myId);

    if (!me) {
        return;
    }

    coinsElement.textContent = me.coins;
    levelElement.textContent = me.level;

    healthText.textContent = `${me.hp} / ${me.maxHp}`;

    healthFill.style.width =
        Math.max(0, me.hp / me.maxHp * 100) + "%";

    xpText.textContent = `${me.xp} / ${me.nextXp}`;

    xpFill.style.width =
        Math.max(0, me.xp / me.nextXp * 100) + "%";

    document.getElementById("lobbyLevel").textContent = me.level;
    document.getElementById("lobbyCoins").textContent = me.coins;
    document.getElementById("lobbyDamage").textContent = me.damage;
    document.getElementById("shopCoins").textContent = me.coins;

    if (me.level > previousLevel) {
        showToast("Новый уровень! Уровень " + me.level);
    }

    if (me.coins > previousCoins) {
        showToast("Получены монеты!");
    }

    previousLevel = me.level;
    previousCoins = me.coins;

    if (me.hp <= 0) {
        gameStatus.textContent = "Ты выбыл! Скоро возродишься...";
    } else if (me.hp < 35) {
        gameStatus.textContent = "Мало здоровья — будь осторожен!";
    } else {
        gameStatus.textContent = "Игроков в мире: " + players.length;
    }

    updateShopPrices(me);
}

// УПРАВЛЕНИЕ

const keyState = new Set();

function updateKeyboardInput() {
    if (joystickState.active) {
        return;
    }

    let forward = 0;
    let side = 0;

    if (keyState.has("w") || keyState.has("arrowup")) forward += 1;
    if (keyState.has("s") || keyState.has("arrowdown")) forward -= 1;
    if (keyState.has("a") || keyState.has("arrowleft")) side -= 1;
    if (keyState.has("d") || keyState.has("arrowright")) side += 1;

    input.forward = forward;
    input.side = side;
}

document.addEventListener("keydown", (event) => {
    if (document.activeElement?.tagName === "INPUT") {
        return;
    }

    const key = event.key.toLowerCase();

    if ([
        "w", "a", "s", "d",
        "arrowup", "arrowdown", "arrowleft", "arrowright"
    ].includes(key)) {
        event.preventDefault();
        keyState.add(key);
        updateKeyboardInput();
    }

    if (event.repeat) {
        return;
    }

    if (key === "j") attack("melee");
    if (key === "k") attack("magic");
});

document.addEventListener("keyup", (event) => {
    keyState.delete(event.key.toLowerCase());
    updateKeyboardInput();
});

window.addEventListener("blur", () => {
    keyState.clear();
    input.forward = 0;
    input.side = 0;
    sendInput();
});

function attack(attackType) {
    if (!joined || !connected) {
        return;
    }

    send({
        type: "attack",
        attackType
    });

    if (attackType === "melee") {
        sword.rotation.z = -0.9;

        setTimeout(() => {
            sword.rotation.z = -0.22;
        }, 140);
    } else {
        magicOrb.visible = true;

        setTimeout(() => {
            magicOrb.visible = false;
        }, 180);
    }
}

document.getElementById("meleeButton").addEventListener("pointerdown", (event) => {
    event.preventDefault();
    attack("melee");
});

document.getElementById("magicButton").addEventListener("pointerdown", (event) => {
    event.preventDefault();
    attack("magic");
});

// СЕНСОРНЫЙ ДЖОЙСТИК

function updateJoystick(event) {
    const rect = joystick.getBoundingClientRect();

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    let dx = event.clientX - centerX;
    let dy = event.clientY - centerY;

    const distance = Math.hypot(dx, dy);
    const max = joystickState.maxDistance;

    if (distance > max) {
        dx = dx / distance * max;
        dy = dy / distance * max;
    }

    joystickState.x = dx / max;
    joystickState.y = dy / max;

    joystickKnob.style.left = `calc(50% + ${dx}px)`;
    joystickKnob.style.top = `calc(50% + ${dy}px)`;

    input.forward = -joystickState.y;
    input.side = joystickState.x;
}

function resetJoystick() {
    joystickState.active = false;
    joystickState.pointerId = null;
    joystickState.x = 0;
    joystickState.y = 0;

    input.forward = 0;
    input.side = 0;

    joystickKnob.style.left = "50%";
    joystickKnob.style.top = "50%";

    sendInput();
}

joystick.addEventListener("pointerdown", (event) => {
    event.preventDefault();

    joystickState.active = true;
    joystickState.pointerId = event.pointerId;

    joystick.setPointerCapture(event.pointerId);
    updateJoystick(event);
});

joystick.addEventListener("pointermove", (event) => {
    if (
        !joystickState.active ||
        event.pointerId !== joystickState.pointerId
    ) {
        return;
    }

    event.preventDefault();
    updateJoystick(event);
});

joystick.addEventListener("pointerup", (event) => {
    if (event.pointerId === joystickState.pointerId) {
        resetJoystick();
    }
});

joystick.addEventListener("pointercancel", resetJoystick);

// ОБЗОР КАМЕРЫ

renderer.domElement.addEventListener("click", () => {
    if (
        joined &&
        window.matchMedia("(pointer: fine)").matches &&
        document.pointerLockElement !== renderer.domElement &&
        menuScreen.classList.contains("hidden") &&
        lobbyScreen.classList.contains("hidden") &&
        shopScreen.classList.contains("hidden")
    ) {
        renderer.domElement.requestPointerLock?.();
    }
});

document.addEventListener("mousemove", (event) => {
    if (document.pointerLockElement === renderer.domElement) {
        cameraControl.yaw -= event.movementX * 0.0025;
        cameraControl.pitch -= event.movementY * 0.0022;

        cameraControl.pitch = THREE.MathUtils.clamp(
            cameraControl.pitch,
            -1.15,
            1.15
        );
    }
});

renderer.domElement.addEventListener("pointerdown", (event) => {
    if (
        event.pointerType === "mouse" ||
        event.clientX < window.innerWidth * 0.42 ||
        !menuScreen.classList.contains("hidden") ||
        !lobbyScreen.classList.contains("hidden") ||
        !shopScreen.classList.contains("hidden")
    ) {
        return;
    }

    pointerLook.active = true;
    pointerLook.pointerId = event.pointerId;
    pointerLook.x = event.clientX;
    pointerLook.y = event.clientY;

    renderer.domElement.setPointerCapture(event.pointerId);
});

renderer.domElement.addEventListener("pointermove", (event) => {
    if (
        !pointerLook.active ||
        event.pointerId !== pointerLook.pointerId
    ) {
        return;
    }

    const dx = event.clientX - pointerLook.x;
    const dy = event.clientY - pointerLook.y;

    pointerLook.x = event.clientX;
    pointerLook.y = event.clientY;

    cameraControl.yaw -= dx * 0.006;
    cameraControl.pitch -= dy * 0.004;

    cameraControl.pitch = THREE.MathUtils.clamp(
        cameraControl.pitch,
        -1.15,
        1.15
    );
});

function stopPointerLook() {
    pointerLook.active = false;
    pointerLook.pointerId = null;
}

renderer.domElement.addEventListener("pointerup", stopPointerLook);
renderer.domElement.addEventListener("pointercancel", stopPointerLook);

function sendInput() {
    send({
        type: "input",
        forward: input.forward,
        side: input.side,
        yaw: cameraControl.yaw
    });
}

// ОБНОВЛЕНИЕ ИГРОКОВ

function updatePlayers(dt) {
    const currentIds = new Set();

    for (const player of players) {
        if (player.id === myId) {
            continue;
        }

        currentIds.add(player.id);

        let model = remoteModels.get(player.id);

        if (!model) {
            model = createRemotePlayer(player);
            remoteModels.set(player.id, model);
        }

        model.visible = player.alive;

        if (!player.alive) {
            continue;
        }

        model.position.lerp(
            new THREE.Vector3(player.x, player.y, player.z),
            Math.min(1, dt * 12)
        );

        model.rotation.y = player.yaw;
    }

    for (const [id, model] of remoteModels) {
        if (!currentIds.has(id)) {
            scene.remove(model);
            remoteModels.delete(id);
        }
    }

    for (const projectile of projectiles) {
        let model = projectileModels.get(projectile.id);

        if (!model) {
            model = createProjectile();
            projectileModels.set(projectile.id, model);
        }

        model.position.set(
            projectile.x,
            terrainHeight(projectile.x, projectile.z) + 1.6,
            projectile.z
        );

        model.rotation.y += dt * 3;
    }

    const activeProjectiles = new Set(
        projectiles.map((projectile) => projectile.id)
    );

    for (const [id, model] of projectileModels) {
        if (!activeProjectiles.has(id)) {
            scene.remove(model);
            projectileModels.delete(id);
        }
    }
}

function updateCamera() {
    const me = players.find((player) => player.id === myId);

    if (!me) {
        return;
    }

    camera.position.set(me.x, me.y + 1.65, me.z);
    camera.rotation.order = "YXZ";
    camera.rotation.y = cameraControl.yaw;
    camera.rotation.x = cameraControl.pitch;
}

function updateHands(time) {
    const moving =
        Math.abs(input.forward) + Math.abs(input.side) > 0.1;

    const bob = moving ? Math.sin(time * 10) * 0.025 : 0;

    hands.position.y = bob;
    hands.rotation.z = moving ? Math.sin(time * 5) * 0.025 : 0;
}

// ОСНОВНОЙ ЦИКЛ

let previousFrame = performance.now();

function animate(now) {
    requestAnimationFrame(animate);

    const dt = Math.min((now - previousFrame) / 1000, 0.05);
    previousFrame = now;

    updateCamera();
    updatePlayers(dt);
    updateHands(now / 1000);

    if (now - lastInputTime > 50) {
        sendInput();
        lastInputTime = now;
    }

    if (now - lastHudTime > 150) {
        updateHUD();
        lastHudTime = now;
    }

    renderer.render(scene, camera);
}

requestAnimationFrame(animate);

// ИЗМЕНЕНИЕ РАЗМЕРА ОКНА

window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setPixelRatio(
        Math.min(window.devicePixelRatio || 1, 1.5)
    );

    renderer.setSize(window.innerWidth, window.innerHeight);
});
