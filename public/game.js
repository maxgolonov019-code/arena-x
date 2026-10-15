"use strict";

/* =========================================================
   MULTIPLAYER 3D — game.js
   Three.js r128, управление для Android и ПК
   ========================================================= */

const WORLD = {
    width: 240,
    depth: 180
};

const CONFIG = {
    walkSpeed: 7,
    lookSensitivity: 0.012,
    verticalSensitivity: 0.009,
    minPitch: -1.1,
    maxPitch: 1.1,
    cameraHeight: 1.65,
    cameraSmoothness: 14,
    attackCooldown: 450
};

const scene = new THREE.Scene();
scene.background = new THREE.Color("#9bc8e8");
scene.fog = new THREE.Fog("#9bc8e8", 65, 210);

const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    500
);

const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance"
});

renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding;

document.body.style.margin = "0";
document.body.style.overflow = "hidden";
document.body.appendChild(renderer.domElement);

renderer.domElement.style.position = "fixed";
renderer.domElement.style.inset = "0";
renderer.domElement.style.width = "100%";
renderer.domElement.style.height = "100%";
renderer.domElement.style.touchAction = "none";
renderer.domElement.style.zIndex = "0";

/* ---------- ОСВЕЩЕНИЕ ---------- */

scene.add(new THREE.HemisphereLight("#e4f3ff", "#536047", 2));

const sunlight = new THREE.DirectionalLight("#ffffff", 2.1);
sunlight.position.set(50, 90, 35);
scene.add(sunlight);

/* ---------- СОСТОЯНИЕ ИГРЫ ---------- */

let socket = null;
let connected = false;
let joined = false;
let myId = null;

let players = [];
let projectiles = [];

let cameraYaw = 0;
let cameraPitch = -0.12;

let moveX = 0;
let moveY = 0;

let lastAttack = 0;
let lastInputSend = 0;
let lastFrame = performance.now();

let playerData = {
    x: WORLD.width / 2,
    y: 0,
    z: WORLD.depth / 2,
    yaw: 0,
    hp: 100,
    maxHp: 100,
    level: 1,
    xp: 0,
    coins: 0,
    damage: 10,
    speed: CONFIG.walkSpeed
};

const remoteModels = new Map();
const projectileModels = new Map();

const clock = new THREE.Clock();

/* ---------- МАТЕРИАЛЫ ---------- */

const materials = {
    grass: new THREE.MeshStandardMaterial({
        color: "#638b4d",
        roughness: 1
    }),
    dirt: new THREE.MeshStandardMaterial({
        color: "#8a7655",
        roughness: 1
    }),
    tree: new THREE.MeshStandardMaterial({
        color: "#62462d"
    }),
    leaves: new THREE.MeshStandardMaterial({
        color: "#315f35",
        roughness: 1
    }),
    rock: new THREE.MeshStandardMaterial({
        color: "#777d80",
        roughness: 1
    }),
    player: new THREE.MeshStandardMaterial({
        color: "#438bff",
        roughness: 0.8
    }),
    enemy: new THREE.MeshStandardMaterial({
        color: "#e65353",
        roughness: 0.8
    })
};

/* ---------- ЗЕМЛЯ С НЕБОЛЬШИМИ ХОЛМАМИ ---------- */

function terrainHeight(x, z) {
    return (
        Math.sin(x * 0.045) * 0.8 +
        Math.cos(z * 0.052) * 0.7 +
        Math.sin((x + z) * 0.025) * 1.1
    );
}

function createTerrain() {
    const geometry = new THREE.PlaneGeometry(
        WORLD.width,
        WORLD.depth,
        100,
        80
    );

    geometry.rotateX(-Math.PI / 2);

    const positions = geometry.attributes.position;

    for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i);
        const z = positions.getZ(i);

        positions.setY(i, terrainHeight(x, z));
    }

    geometry.computeVertexNormals();

    const ground = new THREE.Mesh(
        geometry,
        materials.grass
    );

    ground.position.set(
        WORLD.width / 2,
        0,
        WORLD.depth / 2
    );

    scene.add(ground);
}

createTerrain();

/* ---------- ДЕРЕВЬЯ ---------- */

function createTree(x, z, scale = 1) {
    const group = new THREE.Group();

    const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(
            0.22 * scale,
            0.34 * scale,
            2.1 * scale,
            7
        ),
        materials.tree
    );

    trunk.position.y = 1.05 * scale;
    group.add(trunk);

    const crown = new THREE.Mesh(
        new THREE.ConeGeometry(
            1.35 * scale,
            3.1 * scale,
            7
        ),
        materials.leaves
    );

    crown.position.y = 3.1 * scale;
    group.add(crown);

    group.position.set(x, terrainHeight(x, z), z);
    scene.add(group);
}

function createNature() {
    for (let i = 0; i < 190; i++) {
        const x = 4 + Math.random() * (WORLD.width - 8);
        const z = 4 + Math.random() * (WORLD.depth - 8);

        if (
            Math.abs(x - WORLD.width / 2) < 13 &&
            Math.abs(z - WORLD.depth / 2) < 13
        ) {
            continue;
        }

        createTree(
            x,
            z,
            0.7 + Math.random() * 0.8
        );
    }

    for (let i = 0; i < 55; i++) {
        const x = 5 + Math.random() * (WORLD.width - 10);
        const z = 5 + Math.random() * (WORLD.depth - 10);

        const rock = new THREE.Mesh(
            new THREE.DodecahedronGeometry(
                0.6 + Math.random() * 1.2,
                0
            ),
            materials.rock
        );

        rock.position.set(
            x,
            terrainHeight(x, z) + 0.4,
            z
        );

        rock.rotation.set(
            Math.random(),
            Math.random() * Math.PI,
            Math.random()
        );

        scene.add(rock);
    }
}

createNature();

/* ---------- ГРАНИЦЫ КАРТЫ ---------- */

function createBoundary() {
    const material = new THREE.MeshBasicMaterial({
        color: "#d7efff",
        transparent: true,
        opacity: 0.35
    });

    const height = 5;
    const thickness = 0.4;

    const walls = [
        {
            x: WORLD.width / 2,
            z: 0,
            sx: WORLD.width,
            sz: thickness
        },
        {
            x: WORLD.width / 2,
            z: WORLD.depth,
            sx: WORLD.width,
            sz: thickness
        },
        {
            x: 0,
            z: WORLD.depth / 2,
            sx: thickness,
            sz: WORLD.depth
        },
        {
            x: WORLD.width,
            z: WORLD.depth / 2,
            sx: thickness,
            sz: WORLD.depth
        }
    ];

    for (const wall of walls) {
        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(
                wall.sx,
                height,
                wall.sz
            ),
            material
        );

        mesh.position.set(
            wall.x,
            height / 2,
            wall.z
        );

        scene.add(mesh);
    }
}

createBoundary();

/* ---------- МОДЕЛЬ ИГРОКА ---------- */

function createPlayerModel(isMe = false) {
    const group = new THREE.Group();

    const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.42, 0.85, 4, 8),
        isMe ? materials.player : materials.enemy
    );

    body.position.y = 1.0;
    group.add(body);

    const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.29, 12, 10),
        new THREE.MeshStandardMaterial({
            color: "#edc5a0"
        })
    );

    head.position.y = 1.8;
    group.add(head);

    const direction = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.13, 0.7),
        new THREE.MeshStandardMaterial({
            color: "#303b4c"
        })
    );

    direction.position.set(0, 1.2, -0.48);
    group.add(direction);

    scene.add(group);
    return group;
}

/* ---------- СНАРЯДЫ ---------- */

function createProjectile() {
    const group = new THREE.Group();

    const orb = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.32, 1),
        new THREE.MeshBasicMaterial({
            color: "#c59aff"
        })
    );

    group.add(orb);

    group.add(
        new THREE.PointLight("#b78aff", 1.5, 5)
    );

    scene.add(group);
    return group;
    }
    /* ---------- МОБИЛЬНЫЙ ИНТЕРФЕЙС ---------- */

const uiStyle = document.createElement("style");

uiStyle.textContent = `
    #gameUI {
        position: fixed;
        inset: 0;
        z-index: 10;
        color: white;
        font-family: Arial, sans-serif;
        pointer-events: none;
        user-select: none;
        -webkit-user-select: none;
    }

    #gameUI * {
        box-sizing: border-box;
    }

    .gamePanel {
        background: rgba(15, 22, 32, .84);
        border: 1px solid rgba(255,255,255,.15);
        border-radius: 13px;
        padding: 12px;
        backdrop-filter: blur(8px);
    }

    .gameButton {
        border: 1px solid #ffffff35;
        background: #26374b;
        color: white;
        padding: 11px 15px;
        border-radius: 10px;
        font-weight: bold;
        font-size: 14px;
        touch-action: none;
    }

    .gameButton:active {
        background: #496da0;
    }

    #gameTop {
        position: absolute;
        top: 10px;
        left: 10px;
        display: flex;
        gap: 8px;
        align-items: flex-start;
    }

    #gameStats {
        min-width: 145px;
        font-size: 13px;
        line-height: 1.7;
    }

    #healthTrack {
        width: 145px;
        height: 9px;
        background: #482c34;
        border-radius: 9px;
        overflow: hidden;
    }

    #healthBar {
        height: 100%;
        width: 100%;
        background: #50dc83;
        transition: width .15s;
    }

    #gameBottom {
        position: absolute;
        inset: 0;
        pointer-events: none;
    }

    #joystick {
        position: absolute;
        left: 22px;
        bottom: 25px;
        width: 124px;
        height: 124px;
        border-radius: 50%;
        background: #ffffff20;
        border: 2px solid #ffffff55;
        pointer-events: auto;
        touch-action: none;
    }

    #joystickStick {
        position: absolute;
        left: 50%;
        top: 50%;
        width: 52px;
        height: 52px;
        margin-left: -26px;
        margin-top: -26px;
        border-radius: 50%;
        background: #dceaffb8;
        border: 2px solid white;
        pointer-events: none;
    }

    #lookZone {
        position: absolute;
        top: 0;
        right: 0;
        width: 62%;
        height: 75%;
        pointer-events: auto;
        touch-action: none;
        background: transparent;
    }

    #attackButton {
        position: absolute;
        right: 25px;
        bottom: 35px;
        width: 78px;
        height: 78px;
        border-radius: 50%;
        background: #7044a8e8;
        border: 2px solid #d9c0ff;
        color: white;
        font-size: 15px;
        font-weight: bold;
        pointer-events: auto;
        touch-action: none;
    }

    #shopButton {
        position: absolute;
        right: 20px;
        top: 12px;
        pointer-events: auto;
    }

    #statusMessage {
        position: absolute;
        left: 50%;
        top: 23%;
        transform: translateX(-50%);
        padding: 10px 15px;
        border-radius: 10px;
        background: #101722d9;
        font-size: 13px;
        text-align: center;
        max-width: 85%;
    }

    #gameMenu {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #101722d9;
        pointer-events: auto;
        padding: 20px;
    }

    #gameMenuCard {
        width: min(360px, 100%);
        text-align: center;
    }

    #gameMenuCard h1 {
        font-size: 29px;
        margin: 5px 0 12px;
    }

    #gameMenuCard p {
        color: #c5d0df;
        line-height: 1.5;
        font-size: 14px;
    }

    #shopPanel {
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        width: min(330px, calc(100% - 30px));
        display: none;
        pointer-events: auto;
    }

    #shopPanel h2 {
        margin-top: 0;
    }

    .shopRow {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        margin: 12px 0;
    }

    #connectionStatus {
        color: #ffda8a;
        font-size: 12px;
    }

    @media (min-width: 800px) {
        #joystick {
            width: 145px;
            height: 145px;
        }

        #lookZone {
            width: 65%;
            height: 85%;
        }
    }
`;

document.head.appendChild(uiStyle);

const ui = document.createElement("div");
ui.id = "gameUI";

ui.innerHTML = `
    <div id="gameTop">
        <div class="gamePanel" id="gameStats">
            <div><b>Уровень:</b> <span id="levelText">1</span></div>
            <div><b>Монеты:</b> <span id="coinsText">0</span></div>
            <div><b>Опыт:</b> <span id="xpText">0</span></div>
            <div id="healthTrack">
                <div id="healthBar"></div>
            </div>
            <div id="healthText">100 / 100 HP</div>
        </div>
        <div id="connectionStatus">Подключение...</div>
    </div>

    <button class="gameButton" id="shopButton">МАГАЗИН</button>

    <div id="lookZone"></div>

    <div id="gameBottom">
        <div id="joystick">
            <div id="joystickStick"></div>
        </div>
        <button id="attackButton">АТАКА</button>
    </div>

    <div id="statusMessage">Загрузка мира...</div>

    <div id="shopPanel" class="gamePanel">
        <h2>Магазин</h2>
        <div>Монеты: <b id="shopCoins">0</b></div>

        <div class="shopRow">
            <span>Урон +5 · 30 монет</span>
            <button class="gameButton" id="buyDamage">Купить</button>
        </div>

        <div class="shopRow">
            <span>Здоровье +25 · 25 монет</span>
            <button class="gameButton" id="buyHealth">Купить</button>
        </div>

        <div class="shopRow">
            <span>Скорость +1 · 40 монет</span>
            <button class="gameButton" id="buySpeed">Купить</button>
        </div>

        <button class="gameButton" id="closeShop">Закрыть</button>
    </div>

    <div id="gameMenu">
        <div class="gamePanel" id="gameMenuCard">
            <h1>WILD ARENA 3D</h1>
            <p>
                Исследуй большую карту, сражайся с игроками,
                получай опыт и улучшай персонажа.
            </p>
            <p id="menuConnection">Подключаемся к серверу...</p>
            <button class="gameButton" id="playButton" disabled>
                ИГРАТЬ
            </button>
        </div>
    </div>
`;

document.body.appendChild(ui);

const $ = id => document.getElementById(id);

function showMessage(text) {
    $("statusMessage").textContent = text;
    $("statusMessage").style.display = "block";

    clearTimeout(showMessage.timer);

    showMessage.timer = setTimeout(() => {
        $("statusMessage").style.display = "none";
    }, 2400);
}

/* ---------- WEBSOCKET ---------- */

function getSocketURL() {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    return protocol + "//" + location.host;
}

function sendMessage(data) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        return;
    }

    socket.send(JSON.stringify(data));
}

function connect() {
    if (!location.host) {
        $("connectionStatus").textContent = "Нет адреса сервера";
        $("menuConnection").textContent =
            "Открой игру через работающий сервер.";
        return;
    }

    try {
        socket = new WebSocket(getSocketURL());
    } catch (error) {
        $("connectionStatus").textContent = "Ошибка подключения";
        return;
    }

    socket.addEventListener("open", () => {
        connected = true;

        $("connectionStatus").textContent = "На связи";
        $("menuConnection").textContent = "Сервер подключён";
        $("playButton").disabled = false;

        $("playButton").textContent = "ИГРАТЬ";
    });

    socket.addEventListener("message", event => {
        let message;

        try {
            message = JSON.parse(event.data);
        } catch (error) {
            return;
        }

        handleServerMessage(message);
    });

    socket.addEventListener("close", () => {
        connected = false;
        joined = false;

        $("connectionStatus").textContent = "Нет соединения";
        $("menuConnection").textContent = "Соединение потеряно";

        $("playButton").disabled = true;

        showMessage("Соединение с сервером потеряно");
    });

    socket.addEventListener("error", () => {
        $("connectionStatus").textContent = "Ошибка сервера";
    });
}

function handleServerMessage(message) {
    if (message.type === "welcome") {
        myId = message.id;

        if (message.player) {
            Object.assign(playerData, message.player);
        }

        joined = true;

        $("gameMenu").style.display = "none";

        showMessage("Добро пожаловать на арену!");

        return;
    }

    if (message.type === "state") {
        const statePlayers = message.players || [];

        players = Array.isArray(statePlayers)
            ? statePlayers
            : Object.values(statePlayers);

        projectiles = message.projectiles || [];

        const me = players.find(
            player => player.id === myId
        );

        if (me) {
            Object.assign(playerData, me);
        }

        if (message.coins !== undefined) {
            playerData.coins = message.coins;
        }

        updateHUD();
        return;
    }

    if (message.type === "hit") {
        showMessage("Попадание!");
        return;
    }

    if (message.type === "levelUp") {
        showMessage("Новый уровень!");
        return;
    }

    if (message.type === "error") {
        showMessage(message.message || "Ошибка");
    }
}

/* ---------- ИГРА И МАГАЗИН ---------- */

$("playButton").addEventListener("click", () => {
    if (!connected) {
        showMessage("Ждём подключения к серверу");
        return;
    }

    sendMessage({
        type: "join"
    });
});

$("shopButton").addEventListener("click", () => {
    $("shopPanel").style.display = "block";
});

$("closeShop").addEventListener("click", () => {
    $("shopPanel").style.display = "none";
});

$("buyDamage").addEventListener("click", () => {
    sendMessage({
        type: "buy",
        item: "damage"
    });
});

$("buyHealth").addEventListener("click", () => {
    sendMessage({
        type: "buy",
        item: "health"
    });
});

$("buySpeed").addEventListener("click", () => {
    sendMessage({
        type: "buy",
        item: "speed"
    });
});

function updateHUD() {
    $("levelText").textContent = playerData.level ?? 1;
    $("coinsText").textContent = playerData.coins ?? 0;
    $("xpText").textContent = playerData.xp ?? 0;
    $("shopCoins").textContent = playerData.coins ?? 0;

    const hp = Math.max(0, playerData.hp ?? 100);
    const maxHp = Math.max(1, playerData.maxHp ?? 100);

    $("healthText").textContent =
        Math.round(hp) + " / " + Math.round(maxHp) + " HP";

    $("healthBar").style.width =
        Math.min(100, hp / maxHp * 100) + "%";
}

/* ---------- ДЖОЙСТИК ---------- */

const joystick = $("joystick");
const joystickStick = $("joystickStick");

let joystickPointer = null;
let joystickCenter = null;

function resetJoystick() {
    joystickPointer = null;
    moveX = 0;
    moveY = 0;

    joystickStick.style.transform = "translate(0px, 0px)";
}

joystick.addEventListener("pointerdown", event => {
    event.preventDefault();

    joystickPointer = event.pointerId;
    joystick.setPointerCapture(event.pointerId);

    const rect = joystick.getBoundingClientRect();

    joystickCenter = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        max: rect.width * 0.34
    };

    updateJoystick(event);
});

function updateJoystick(event) {
    if (event.pointerId !== joystickPointer) {
        return;
    }

    let dx = event.clientX - joystickCenter.x;
    let dy = event.clientY - joystickCenter.y;

    const distance = Math.hypot(dx, dy);
    const max = joystickCenter.max;

    if (distance > max) {
        dx = dx / distance * max;
        dy = dy / distance * max;
    }

    moveX = dx / max;

    // Вверх по экрану означает движение вперёд.
    moveY = dy / max;

    joystickStick.style.transform =
        `translate(${dx}px, ${dy}px)`;
}

joystick.addEventListener("pointermove", updateJoystick);

joystick.addEventListener("pointerup", event => {
    if (event.pointerId === joystickPointer) {
        resetJoystick();
    }
});

joystick.addEventListener("pointercancel", resetJoystick);

joystick.addEventListener("lostpointercapture", () => {
    if (joystickPointer !== null) {
        resetJoystick();
    }
});

/* ---------- ПОВОРОТ КАМЕРЫ НА ANDROID ---------- */

const lookZone = $("lookZone");

let lookPointer = null;
let lastLookX = 0;
let lastLookY = 0;

lookZone.addEventListener("pointerdown", event => {
    if (lookPointer !== null) {
        return;
    }

    // Не начинаем вращение при нажатии на интерфейс.
    if (event.target.closest("button")) {
        return;
    }

    event.preventDefault();

    lookPointer = event.pointerId;

    lastLookX = event.clientX;
    lastLookY = event.clientY;

    lookZone.setPointerCapture(event.pointerId);
});

lookZone.addEventListener("pointermove", event => {
    if (event.pointerId !== lookPointer) {
        return;
    }

    event.preventDefault();

    const dx = event.clientX - lastLookX;
    const dy = event.clientY - lastLookY;

    lastLookX = event.clientX;
    lastLookY = event.clientY;

    // Повышенная чувствительность для сенсорного экрана.
    cameraYaw -= dx * CONFIG.lookSensitivity;
    cameraPitch += dy * CONFIG.verticalSensitivity;

    cameraPitch = Math.max(
        CONFIG.minPitch,
        Math.min(CONFIG.maxPitch, cameraPitch)
    );
});

function endLook(event) {
    if (event.pointerId === lookPointer) {
        lookPointer = null;
    }
}

lookZone.addEventListener("pointerup", endLook);
lookZone.addEventListener("pointercancel", endLook);

lookZone.addEventListener("lostpointercapture", () => {
    lookPointer = null;
});

/* ---------- АТАКА ---------- */

$("attackButton").addEventListener("pointerdown", event => {
    event.preventDefault();

    const now = performance.now();

    if (now - lastAttack < CONFIG.attackCooldown) {
        return;
    }

    lastAttack = now;

    sendMessage({
        type: "attack",
        yaw: cameraYaw,
        pitch: cameraPitch
    });
});

/* ---------- МОДЕЛИ ИГРОКОВ ---------- */

function updatePlayers() {
    const activeIds = new Set();

    for (const player of players) {
        if (player.id === myId) {
            continue;
        }

        activeIds.add(player.id);

        let model = remoteModels.get(player.id);

        if (!model) {
            model = createPlayerModel(false);
            remoteModels.set(player.id, model);
        }

        const targetX = Number(player.x) || 0;
        const targetY = Number(player.y) || 0;
        const targetZ = Number(player.z) || 0;

        model.position.set(
            targetX,
            targetY,
            targetZ
        );

        model.rotation.y = Number(player.yaw) || 0;
    }

    for (const [id, model] of remoteModels) {
        if (!activeIds.has(id)) {
            scene.remove(model);
            remoteModels.delete(id);
        }
    }
}

function updateProjectiles() {
    const activeIds = new Set();

    for (const projectile of projectiles) {
        const id = projectile.id;

        activeIds.add(id);

        let model = projectileModels.get(id);

        if (!model) {
            model = createProjectile();
            projectileModels.set(id, model);
        }

        model.position.set(
            Number(projectile.x) || 0,
            Number(projectile.y) || 0,
            Number(projectile.z) || 0
        );
    }

    for (const [id, model] of projectileModels) {
        if (!activeIds.has(id)) {
            scene.remove(model);
            projectileModels.delete(id);
        }
    }
}

/* ---------- ДВИЖЕНИЕ ОТНОСИТЕЛЬНО КАМЕРЫ ---------- */

function getMovementDirection() {
    /*
       При cameraYaw = 0:
       вперёд = -Z
       вправо = +X

       При повороте камеры направление движения
       автоматически поворачивается вместе с ней.
    */

    const forwardX = -Math.sin(cameraYaw);
    const forwardZ = -Math.cos(cameraYaw);

    const rightX = Math.cos(cameraYaw);
    const rightZ = -Math.sin(cameraYaw);

    let x = forwardX * (-moveY) + rightX * moveX;
    let z = forwardZ * (-moveY) + rightZ * moveX;

    const length = Math.hypot(x, z);

    if (length > 1) {
        x /= length;
        z /= length;
    }

    return { x, z };
}

function sendPlayerInput(now) {
    if (!joined || now - lastInputSend < 50) {
        return;
    }

    lastInputSend = now;

    const direction = getMovementDirection();

    sendMessage({
        type: "input",
        x: direction.x,
        z: direction.z,
        yaw: cameraYaw,
        moveX: moveX,
        moveY: moveY
    });
}

/* ---------- КАМЕРА ---------- */

function updateCamera(deltaTime) {
    const target = players.find(
        player => player.id === myId
    );

    const x = target ? target.x : playerData.x;
    const y = target ? target.y : playerData.y;
    const z = target ? target.z : playerData.z;

    const distance = 6;

    const desiredPosition = new THREE.Vector3(
        x + Math.sin(cameraYaw) * distance,
        y + CONFIG.cameraHeight + 2 + cameraPitch * 2,
        z + Math.cos(cameraYaw) * distance
    );

    const smoothing = 1 - Math.exp(
        -CONFIG.cameraSmoothness * deltaTime
    );

    camera.position.lerp(desiredPosition, smoothing);

    camera.lookAt(
        x,
        y + CONFIG.cameraHeight,
        z
    );
}

/* ---------- ИГРОВОЙ ЦИКЛ ---------- */

function animate(now) {
    requestAnimationFrame(animate);

    const deltaTime = Math.min(
        (now - lastFrame) / 1000,
        0.05
    );

    lastFrame = now;

    sendPlayerInput(now);

    updatePlayers();
    updateProjectiles();
    updateCamera(deltaTime);

    renderer.render(scene, camera);
}

/* ---------- ИЗМЕНЕНИЕ РАЗМЕРА ЭКРАНА ---------- */

window.addEventListener("resize", () => {
    camera.aspect =
        window.innerWidth / window.innerHeight;

    camera.updateProjectionMatrix();

    renderer.setSize(
        window.innerWidth,
        window.innerHeight
    );

    renderer.setPixelRatio(
        Math.min(window.devicePixelRatio || 1, 1.5)
    );
});

/* ---------- ЗАПУСК ---------- */

updateHUD();
connect();
requestAnimationFrame(animate);
