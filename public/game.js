
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const nameScreen = document.getElementById("nameScreen");
const nameForm = document.getElementById("nameForm");
const nameInput = document.getElementById("nameInput");
const playButton = document.getElementById("playButton");
const connectionText = document.getElementById("connectionText");

const onlineCount = document.getElementById("onlineCount");
const playerNameElement = document.getElementById("playerName");
const hpText = document.getElementById("hpText");
const healthFill = document.getElementById("healthFill");
const statusText = document.getElementById("statusText");

const movementButtons = document.querySelectorAll("[data-move]");
const meleeButton = document.getElementById("meleeButton");
const magicButton = document.getElementById("magicButton");

let socket = null;
let myId = null;
let world = { width: 2400, height: 1800 };
let players = [];
let projectiles = [];
let joined = false;
let connectionReady = false;
let lastInputSent = 0;

const input = {
    up: false,
    down: false,
    left: false,
    right: false
};

const camera = {
    x: 0,
    y: 0
};

const view = {
    width: window.innerWidth,
    height: window.innerHeight,
    dpr: 1
};

const keys = {
    w: "up",
    ArrowUp: "up",
    s: "down",
    ArrowDown: "down",
    a: "left",
    ArrowLeft: "left",
    d: "right",
    ArrowRight: "right"
};

function resizeCanvas() {
    view.width = window.innerWidth;
    view.height = window.innerHeight;
    view.dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.round(view.width * view.dpr);
    canvas.height = Math.round(view.height * view.dpr);

    canvas.style.width = view.width + "px";
    canvas.style.height = view.height + "px";

    ctx.setTransform(
        view.dpr,
        0,
        0,
        view.dpr,
        0,
        0
    );
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

function setConnectionText(message) {
    connectionText.textContent = message;
}

function connect() {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    socket = new WebSocket(protocol + "//" + location.host);

    socket.addEventListener("open", () => {
        connectionReady = true;
        playButton.disabled = false;
        setConnectionText("Сервер доступен. Можно входить!");
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
            world = data.world || world;

            if (joined) {
                sendJoin();
            }
        }

        if (data.type === "state") {
            players = data.players || [];
            projectiles = data.projectiles || [];
            updateHUD();
        }
    });

    socket.addEventListener("close", () => {
        connectionReady = false;
        playButton.disabled = true;
        setConnectionText("Соединение потеряно. Обнови страницу.");
        statusText.textContent = "Нет соединения с сервером";
    });

    socket.addEventListener("error", () => {
        setConnectionText("Не удалось подключиться к серверу.");
    });
}

function send(data) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(data));
    }
}

function sendJoin() {
    if (!connectionReady || !joined) {
        return;
    }

    send({
        type: "join",
        name: nameInput.value.trim().slice(0, 16)
    });

    nameScreen.classList.add("hidden");
}

nameForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const name = nameInput.value.trim();

    if (!name) {
        setConnectionText("Введи имя персонажа.");
        return;
    }

    if (!connectionReady) {
        setConnectionText("Сначала дождись подключения к серверу.");
        return;
    }

    joined = true;
    playerNameElement.textContent = name;
    sendJoin();
});

playButton.disabled = true;
nameInput.value = "Игрок";
connect();

function updateHUD() {
    onlineCount.textContent = players.length + " игроков";

    const me = players.find((player) => player.id === myId);

    if (!me) {
        return;
    }

    playerNameElement.textContent = me.name;
    hpText.textContent = me.hp + " / " + me.maxHp;

    const healthPercent = Math.max(
        0,
        Math.min(100, (me.hp / me.maxHp) * 100)
    );

    healthFill.style.width = healthPercent + "%";

    if (me.hp <= 0) {
        statusText.textContent = "Ты выбыл! Скоро возродишься...";
    } else if (me.hp < 35) {
        statusText.textContent = "Осторожно! Мало здоровья";
    } else {
        statusText.textContent = "Ты в открытом мире";
    }
}

function sendInput() {
    send({
        type: "input",
        input: { ...input }
    });
}

function setMovement(direction, pressed) {
    input[direction] = pressed;

    movementButtons.forEach((button) => {
        if (button.dataset.move === direction) {
            button.classList.toggle("pressed", pressed);
        }
    });

    sendInput();
}

window.addEventListener("keydown", (event) => {
    if (keys[event.key]) {
        event.preventDefault();
        setMovement(keys[event.key], true);
    }

    if (event.repeat) {
        return;
    }

    if (event.key.toLowerCase() === "j") {
        attack("melee");
    }

    if (event.key.toLowerCase() === "k") {
        attack("magic");
    }
});

window.addEventListener("keyup", (event) => {
    if (keys[event.key]) {
        event.preventDefault();
        setMovement(keys[event.key], false);
    }
});

window.addEventListener("blur", () => {
    for (const direction of Object.keys(input)) {
        input[direction] = false;
    }

    movementButtons.forEach((button) => {
        button.classList.remove("pressed");
    });

    sendInput();
});

movementButtons.forEach((button) => {
    const direction = button.dataset.move;

    button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        setMovement(direction, true);
    });

    const stop = (event) => {
        event.preventDefault();
        setMovement(direction, false);
    };

    button.addEventListener("pointerup", stop);
    button.addEventListener("pointercancel", stop);
    button.addEventListener("lostpointercapture", () => {
        setMovement(direction, false);
    });
});

function attack(attackType) {
    if (!joined || !connectionReady) {
        return;
    }

    send({
        type: "attack",
        attackType
    });
}

meleeButton.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    attack("melee");
});

magicButton.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    attack("magic");
});

setInterval(() => {
    if (joined && connectionReady) {
        sendInput();
    }
}, 50);

// Генерация декоративных деталей карты.
// Они одинаково выглядят у всех клиентов.
function seededRandom(seed) {
    let value = seed >>> 0;

    return function () {
        value = (value * 1664525 + 1013904223) >>> 0;
        return value / 4294967296;
    };
}

const random = seededRandom(43129);
const grassDetails = [];
const trees = [];
const rocks = [];

for (let i = 0; i < 1400; i++) {
    grassDetails.push({
        x: random() * world.width,
        y: random() * world.height,
        size: 2 + random() * 5,
        shade: random()
    });
}

for (let i = 0; i < 145; i++) {
    trees.push({
        x: 45 + random() * (world.width - 90),
        y: 45 + random() * (world.height - 90),
        size: 22 + random() * 17,
        shade: random()
    });
}

for (let i = 0; i < 48; i++) {
    rocks.push({
        x: 40 + random() * (world.width - 80),
        y: 40 + random() * (world.height - 80),
        size: 8 + random() * 12
    });
}

function drawGround() {
    ctx.fillStyle = "#6c9c59";
    ctx.fillRect(0, 0, world.width, world.height);

    for (const detail of grassDetails) {
        if (!isVisible(detail.x, detail.y, 12)) {
            continue;
        }

        ctx.globalAlpha = 0.14 + detail.shade * 0.17;
        ctx.fillStyle = detail.shade > 0.5 ? "#d3e89a" : "#244e35";
        ctx.beginPath();
        ctx.ellipse(
            detail.x,
            detail.y,
            detail.size * 1.5,
            detail.size * 0.7,
            detail.shade,
            0,
            Math.PI * 2
        );
        ctx.fill();
    }

    ctx.globalAlpha = 1;

    // Извилистая светлая дорожка.
    ctx.beginPath();
    ctx.moveTo(0, 1050);
    ctx.bezierCurveTo(480, 940, 390, 640, 900, 720);
    ctx.bezierCurveTo(1250, 770, 1260, 1040, 1660, 940);
    ctx.bezierCurveTo(1940, 870, 2110, 600, 2400, 660);
    ctx.lineWidth = 105;
    ctx.strokeStyle = "#b5a47a";
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, 1050);
    ctx.bezierCurveTo(480, 940, 390, 640, 900, 720);
    ctx.bezierCurveTo(1250, 770, 1260, 1040, 1660, 940);
    ctx.bezierCurveTo(1940, 870, 2110, 600, 2400, 660);
    ctx.lineWidth = 4;
    ctx.setLineDash([13, 15]);
    ctx.strokeStyle = "#e0cca0";
    ctx.stroke();
    ctx.setLineDash([]);

    // Небольшой пруд.
    ctx.fillStyle = "#4d9fba";
    ctx.beginPath();
    ctx.ellipse(1810, 350, 150, 92, -0.25, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#9cd9dd";
    ctx.lineWidth = 5;
    ctx.stroke();

    ctx.fillStyle = "#a9dce0";
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.ellipse(1785, 330, 65, 15, -0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Граница мира.
    ctx.strokeStyle = "#d1e5a0";
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, world.width - 8, world.height - 8);
}

function isVisible(x, y, margin = 50) {
    return (
        x >= camera.x - margin &&
        y >= camera.y - margin &&
        x <= camera.x + view.width + margin &&
        y <= camera.y + view.height + margin
    );
}

function drawTree(tree) {
    if (!isVisible(tree.x, tree.y, tree.size * 2)) {
        return;
    }

    const s = tree.size;

    // Тень.
    ctx.fillStyle = "#203e2b40";
    ctx.beginPath();
    ctx.ellipse(
        tree.x + 8,
        tree.y + 13,
        s * 1.05,
        s * 0.65,
        0.2,
        0,
        Math.PI * 2
    );
    ctx.fill();

    // Ствол.
    ctx.fillStyle = "#75563b";
    ctx.beginPath();
    ctx.ellipse(tree.x, tree.y + s * 0.32, s * 0.3, s * 0.52, 0, 0, Math.PI * 2);
    ctx.fill();

    // Крона из нескольких округлых частей.
    const base = tree.shade > 0.5 ? "#316d43" : "#3c7d49";
    ctx.fillStyle = base;

    ctx.beginPath();
    ctx.arc(tree.x - s * 0.34, tree.y - s * 0.12, s * 0.62, 0, Math.PI * 2);
    ctx.arc(tree.x + s * 0.28, tree.y - s * 0.22, s * 0.7, 0, Math.PI * 2);
    ctx.arc(tree.x, tree.y - s * 0.57, s * 0.65, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#79b967";
    ctx.globalAlpha = 0.8;

    ctx.beginPath();
    ctx.arc(tree.x - s * 0.18, tree.y - s * 0.58, s * 0.32, 0, Math.PI * 2);
    ctx.arc(tree.x + s * 0.35, tree.y - s * 0.35, s * 0.25, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 1;
}

function drawRock(rock) {
    if (!isVisible(rock.x, rock.y, rock.size + 10)) {
        return;
    }

    ctx.fillStyle = "#344a38";
    ctx.beginPath();
    ctx.ellipse(
        rock.x + 3,
        rock.y + 5,
        rock.size * 1.1,
        rock.size * 0.75,
        0.3,
        0,
        Math.PI * 2
    );
    ctx.fill();

    ctx.fillStyle = "#8b9884";
    ctx.beginPath();
    ctx.ellipse(
        rock.x,
        rock.y,
        rock.size,
        rock.size * 0.7,
        -0.2,
        0,
        Math.PI * 2
    );
    ctx.fill();

    ctx.strokeStyle = "#c0cbb3";
    ctx.lineWidth = 2;
    ctx.stroke();
}

function drawPlayer(player) {
    if (!isVisible(player.x, player.y, 80)) {
        return;
    }

    const isMe = player.id === myId;
    const angle = player.facing || 0;

    ctx.save();
    ctx.translate(player.x, player.y);

    // Тень под персонажем.
    ctx.fillStyle = "#203d2d55";
    ctx.beginPath();
    ctx.ellipse(3, 11, 23, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    // Направление взгляда и оружие.
    ctx.rotate(angle);

    ctx.strokeStyle = "#392d28";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(9, 3);
    ctx.lineTo(28, 3);
    ctx.stroke();

    ctx.strokeStyle = "#f2e7b0";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(22, -5);
    ctx.lineTo(34, 3);
    ctx.lineTo(22, 11);
    ctx.stroke();

    // Тело.
    ctx.fillStyle = player.color;
    ctx.beginPath();
    ctx.ellipse(0, 1, 17, 19, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = isMe ? "#f2ffd9" : "#ffffffb0";
    ctx.lineWidth = isMe ? 3 : 1.5;
    ctx.stroke();

    // Лицо.
    ctx.fillStyle = "#f2c89b";
    ctx.beginPath();
    ctx.arc(5, -5, 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#344135";
    ctx.beginPath();
    ctx.arc(9, -7, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Имя над персонажем.
    ctx.font = "bold 12px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";

    const nameWidth = ctx.measureText(player.name).width;
    const labelWidth = Math.max(46, nameWidth + 14);
    const labelY = player.y - 36;

    ctx.fillStyle = "#17251dde";
    ctx.beginPath();
    ctx.roundRect(
        player.x - labelWidth / 2,
        labelY - 16,
        labelWidth,
        20,
        7
    );
    ctx.fill();

    ctx.fillStyle = isMe ? "#d5ff9b" : "#ffffff";
    ctx.fillText(player.name, player.x, labelY);

    // Маленькая полоска здоровья.
    const barWidth = 42;
    const health = Math.max(0, player.hp / player.maxHp);

    ctx.fillStyle = "#263b2c";
    ctx.fillRect(player.x - barWidth / 2, player.y - 12, barWidth, 4);

    ctx.fillStyle = health > 0.35 ? "#83e878" : "#ff6e64";
    ctx.fillRect(
        player.x - barWidth / 2,
        player.y - 12,
        barWidth * health,
        4
    );

    // Вспышка атаки.
    if (player.attacking && player.attackType === "melee") {
        ctx.save();
        ctx.translate(player.x, player.y);
        ctx.rotate(player.facing);

        ctx.strokeStyle = "#fff1a3";
        ctx.lineWidth = 5;
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.arc(0, 0, 52, -0.75, 0.75);
        ctx.stroke();

        ctx.restore();
        ctx.globalAlpha = 1;
    }
}

function drawProjectile(projectile) {
    if (!isVisible(projectile.x, projectile.y, 25)) {
        return;
    }

    ctx.save();

    ctx.shadowColor = "#d6a4ff";
    ctx.shadowBlur = 20;

    ctx.fillStyle = "#c99bff";
    ctx.beginPath();
    ctx.arc(projectile.x, projectile.y, 11, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = "#fff3ff";
    ctx.beginPath();
    ctx.arc(projectile.x - 3, projectile.y - 3, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

function updateCamera() {
    const me = players.find((player) => player.id === myId);

    if (!me) {
        return;
    }

    const targetX = me.x - view.width / 2;
    const targetY = me.y - view.height / 2;

    camera.x += (targetX - camera.x) * 0.12;
    camera.y += (targetY - camera.y) * 0.12;

    camera.x = Math.max(
        0,
        Math.min(world.width - view.width, camera.x)
    );

    camera.y = Math.max(
        0,
        Math.min(world.height - view.height, camera.y)
    );
}

function render() {
    ctx.setTransform(
        view.dpr,
        0,
        0,
        view.dpr,
        0,
        0
    );

    ctx.clearRect(0, 0, view.width, view.height);

    updateCamera();

    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    drawGround();

    for (const rock of rocks) {
        drawRock(rock);
    }

    // Рисуем дальние деревья до персонажей.
    for (const tree of trees) {
        if (tree.y < 0) {
            continue;
        }

        drawTree(tree);
    }

    for (const projectile of projectiles) {
        drawProjectile(projectile);
    }

    const orderedPlayers = [...players].sort((a, b) => a.y - b.y);

    for (const player of orderedPlayers) {
        if (player.hp > 0) {
            drawPlayer(player);
        }
    }

    ctx.restore();

    requestAnimationFrame(render);
}

requestAnimationFrame(render);
  
