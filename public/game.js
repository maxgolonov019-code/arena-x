(() => {
    "use strict";

    // ==============================
    // НАСТРОЙКИ
    // ==============================

    const CONFIG = {
        speed: 5,
        mouseSensitivity: 0.004,
        attackCooldown: 550,
        reconnectDelay: 2500
    };

    let scene;
    let camera;
    let renderer;
    let clock;
    let socket = null;

    let myId = null;
    let playerName = "Player";

    let gameStarted = false;
    let connected = false;
    let connecting = false;

    let health = 100;
    let coins = 0;
    let xp = 0;
    let level = 1;

    let damageLevel = 0;
    let healthLevel = 0;
    let speedLevel = 0;

    let lastAttack = 0;
    let reconnectTimer = null;

    let yaw = 0;
    let pitch = 0;

    const players = new Map();
    const keys = {};

    const movement = {
        x: 0,
        z: 0,
        joystickX: 0,
        joystickY: 0
    };

    const look = {
        active: false,
        pointerId: null,
        lastX: 0,
        lastY: 0
    };

    // ==============================
    // ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
    // ==============================

    function el(id) {
        return document.getElementById(id);
    }

    function makeElement(tag, id, parent = document.body) {
        let element = el(id);

        if (!element) {
            element = document.createElement(tag);
            element.id = id;
            parent.appendChild(element);
        }

        return element;
    }

    function send(data) {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            return false;
        }

        try {
            socket.send(JSON.stringify(data));
            return true;
        } catch (error) {
            console.error("Ошибка отправки:", error);
            return false;
        }
    }

    function setText(id, value) {
        const element = el(id);

        if (element) {
            element.textContent = String(value);
        }
    }

    function showMessage(message) {
        const box = el("statusMessage");

        if (box) {
            box.textContent = message;
            box.style.display = "block";

            clearTimeout(showMessage.timer);

            showMessage.timer = setTimeout(() => {
                box.style.display = "none";
            }, 2600);
        }

        console.log("[Игра]", message);
    }

    function setConnectionStatus(message) {
        setText("connectionStatus", message);
        setText("menuConnection", message);
    }

    function hideElement(id) {
        const element = el(id);

        if (element) {
            element.style.display = "none";
        }
    }

    function showElement(id, display = "block") {
        const element = el(id);

        if (element) {
            element.style.display = display;
        }
    }

    // ==============================
    // СТИЛИ И ИНТЕРФЕЙС
    // ==============================

    function createInterface() {
        const style = makeElement("style", "gameStyles", document.head);

        style.textContent = `
            * {
                box-sizing: border-box;
            }

            html, body {
                margin: 0;
                width: 100%;
                height: 100%;
                overflow: hidden;
                font-family: Arial, sans-serif;
                background: #10131b;
                color: white;
                touch-action: none;
            }

            #gameCanvas {
                position: fixed;
                inset: 0;
                width: 100%;
                height: 100%;
                display: block;
            }

            #gameUI {
                position: fixed;
                inset: 0;
                z-index: 5;
                pointer-events: none;
            }

            #gameTop {
                position: absolute;
                top: 12px;
                left: 12px;
                right: 12px;
                display: flex;
                justify-content: space-between;
                gap: 10px;
            }

            #gameStats {
                background: #10131bd9;
                border: 1px solid #ffffff25;
                border-radius: 12px;
                padding: 10px;
                min-width: 155px;
                font-size: 13px;
                line-height: 1.7;
            }

            #healthTrack {
                height: 9px;
                width: 145px;
                max-width: 45vw;
                background: #414653;
                border-radius: 8px;
                overflow: hidden;
            }

            #healthBar {
                width: 100%;
                height: 100%;
                background: #43df7b;
            }

            #connectionStatus {
                height: fit-content;
                background: #10131bd9;
                border-radius: 9px;
                padding: 9px;
                font-size: 12px;
                max-width: 45%;
            }

            #lookZone {
                position: absolute;
                right: 0;
                top: 25%;
                width: 65%;
                height: 55%;
                pointer-events: auto;
                touch-action: none;
            }

            #joystick {
                position: absolute;
                bottom: 24px;
                left: 22px;
                width: 120px;
                height: 120px;
                border-radius: 50%;
                background: #ffffff20;
                border: 2px solid #ffffff65;
                pointer-events: auto;
                touch-action: none;
            }

            #joystickStick {
                position: absolute;
                left: 50%;
                top: 50%;
                width: 48px;
                height: 48px;
                margin: -24px;
                border-radius: 50%;
                background: #91a8ffcc;
                border: 2px solid white;
                pointer-events: none;
            }

            .gameButton {
                border: 1px solid #ffffff45;
                color: white;
                background: #526ff2e8;
                border-radius: 13px;
                padding: 12px 15px;
                font-weight: bold;
                cursor: pointer;
                pointer-events: auto;
                touch-action: manipulation;
            }

            #attackButton {
                position: absolute;
                right: 22px;
                bottom: 32px;
                width: 82px;
                height: 82px;
                border-radius: 50%;
                background: #e84b5b;
            }

            #shopButton {
                position: absolute;
                right: 18px;
                top: 90px;
            }

            #statusMessage {
                display: none;
                position: absolute;
                left: 50%;
                top: 20%;
                transform: translateX(-50%);
                background: #151925ed;
                border: 1px solid #ffffff35;
                border-radius: 12px;
                padding: 12px 18px;
                text-align: center;
                max-width: 85%;
            }

            #gameMenu, #shopPanel {
                position: fixed;
                inset: 0;
                z-index: 20;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 14px;
                padding: 24px;
                background: linear-gradient(145deg, #11172bf5, #202e50f5);
                text-align: center;
                pointer-events: auto;
                touch-action: manipulation;
            }

            #gameMenu h1 {
                margin: 0;
                font-size: clamp(30px, 8vw, 52px);
                color: #9db0ff;
            }

            #gameMenu p {
                color: #c5cce0;
                max-width: 350px;
                line-height: 1.5;
            }

            #playerNameInput {
                width: min(300px, 90%);
                padding: 14px;
                border-radius: 10px;
                border: 1px solid #7587bd;
                background: #101625;
                color: white;
                font-size: 16px;
                touch-action: manipulation;
            }

            #playButton {
                min-width: 180px;
                padding: 15px 25px;
                border: none;
                border-radius: 12px;
                background: #667ff5;
                color: white;
                font-size: 17px;
                font-weight: bold;
                cursor: pointer;
            }

            #shopPanel {
                display: none;
                z-index: 30;
                background: #111725f5;
            }

            .shopItem {
                width: min(320px, 95%);
                padding: 12px;
                border: 1px solid #ffffff25;
                border-radius: 12px;
                background: #ffffff0c;
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 12px;
            }

            @media (max-width: 420px) {
                #gameStats {
                    min-width: 140px;
                    font-size: 12px;
                    padding: 8px;
                }

                #healthTrack {
                    width: 125px;
                }

                #joystick {
                    width: 110px;
                    height: 110px;
                    left: 15px;
                    bottom: 18px;
                }

                #attackButton {
                    right: 16px;
                    bottom: 25px;
                    width: 75px;
                    height: 75px;
                }
            }
        `;

        const ui = makeElement("div", "gameUI");

        ui.innerHTML = `
            <div id="gameTop">
                <div id="gameStats">
                    <div id="healthText">❤️ 100 / 100</div>
                    <div id="healthTrack">
                        <div id="healthBar"></div>
                    </div>
                    <div id="levelText">Уровень: 1</div>
                    <div id="coinsText">Монеты: 0</div>
                    <div id="xpText">Опыт: 0</div>
                </div>

                <div id="connectionStatus">Не подключено</div>
            </div>

            <button id="shopButton" class="gameButton">
                🛒 Магазин
            </button>

            <div id="lookZone"></div>

            <div id="joystick">
                <div id="joystickStick"></div>
            </div>

            <button id="attackButton" class="gameButton">
                АТАКА
            </button>

            <div id="statusMessage"></div>
        `;

        // Меню не удаляем, если оно уже есть в HTML.
        const menu = makeElement("div", "gameMenu");

        if (!menu.querySelector("h1")) {
            const title = document.createElement("h1");
            title.textContent = "MULTIPLAYER";
            menu.appendChild(title);
        }

        if (!menu.querySelector("p")) {
            const description = document.createElement("p");
            description.textContent =
                "Введи имя игрока и нажми «Играть».";
            menu.appendChild(description);
        }

        let input = el("playerNameInput");

        if (!input) {
            input = document.createElement("input");
            input.id = "playerNameInput";
            input.type = "text";
            input.placeholder = "Имя игрока";
            input.maxLength = 20;
            menu.appendChild(input);
        }

        let button = el("playButton");

        if (!button) {
            button = document.createElement("button");
            button.id = "playButton";
            button.textContent = "Играть";
            menu.appendChild(button);
        }

        if (!el("menuConnection")) {
            const status = document.createElement("div");
            status.id = "menuConnection";
            status.textContent = "Готово к запуску";
            menu.appendChild(status);
        }

        menu.style.display = "flex";

        // Магазин создадим отдельно во второй части.
    }

    // ==============================
    // СОЗДАНИЕ 3D-МИРА
    // ==============================

    function createWorld() {
        if (typeof THREE === "undefined") {
            showMessage("Three.js не загружен!");
            return false;
        }

        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x111827);
        scene.fog = new THREE.Fog(0x111827, 25, 110);

        camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            500
        );

        renderer = new THREE.WebGLRenderer({
            antialias: true,
            powerPreference: "high-performance"
        });

        renderer.setPixelRatio(
            Math.min(window.devicePixelRatio || 1, 1.5)
        );

        renderer.setSize(
            window.innerWidth,
            window.innerHeight
        );

        renderer.domElement.id = "gameCanvas";

        document.body.insertBefore(
            renderer.domElement,
            document.body.firstChild
        );

        clock = new THREE.Clock();

        scene.add(new THREE.HemisphereLight(
            0xb7caff,
            0x303344,
            2
        ));

        const light = new THREE.DirectionalLight(0xffffff, 1.7);
        light.position.set(15, 30, 10);
        scene.add(light);

        const ground = new THREE.Mesh(
            new THREE.PlaneGeometry(250, 250),
            new THREE.MeshStandardMaterial({
                color: 0x343b48,
                roughness: 0.95
            })
        );

        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.06;
        scene.add(ground);

        const roadMaterial = new THREE.MeshStandardMaterial({
            color: 0x20242c,
            roughness: 1
        });

        function addRoad(x, z, width, length) {
            const road = new THREE.Mesh(
                new THREE.BoxGeometry(width, 0.04, length),
                roadMaterial
            );

            road.position.set(x, 0, z);
            scene.add(road);
        }

        addRoad(0, 0, 13, 250);
        addRoad(0, 0, 250, 13);

        const lineMaterial = new THREE.MeshBasicMaterial({
            color: 0xf0d879
        });

        for (let i = -110; i <= 110; i += 10) {
            const line = new THREE.Mesh(
                new THREE.BoxGeometry(0.18, 0.045, 4),
                lineMaterial
            );

            line.position.set(0, 0.04, i);
            scene.add(line);

            const line2 = new THREE.Mesh(
                new THREE.BoxGeometry(4, 0.045, 0.18),
                lineMaterial
            );

            line2.position.set(i, 0.04, 0);
            scene.add(line2);
        }

        const buildingColors = [
            0x596579,
            0x6b6076,
            0x4d6973,
            0x77716a,
            0x49566b
        ];

        for (let x = -90; x <= 90; x += 18) {
            for (let z = -90; z <= 90; z += 18) {
                if (Math.abs(x) < 13 || Math.abs(z) < 13) {
                    continue;
                }

                const height = 5 + Math.random() * 15;

                const building = new THREE.Mesh(
                    new THREE.BoxGeometry(
                        7 + Math.random() * 3,
                        height,
                        7 + Math.random() * 3
                    ),
                    new THREE.MeshStandardMaterial({
                        color: buildingColors[
                            Math.floor(Math.random() * buildingColors.length)
                        ],
                        roughness: 0.85
                    })
                );

                building.position.set(
                    x + (Math.random() - 0.5) * 3,
                    height / 2,
                    z + (Math.random() - 0.5) * 3
                );

                scene.add(building);
            }
        }

        camera.position.set(0, 4, 8);

        return true;
    }
       // ==============================
    // МОДЕЛИ ИГРОКОВ
    // ==============================

    function createPlayerModel(color = 0x6688ff) {
        const group = new THREE.Group();

        const body = new THREE.Mesh(
            new THREE.BoxGeometry(0.8, 1.2, 0.45),
            new THREE.MeshStandardMaterial({ color })
        );

        body.position.y = 1.2;
        group.add(body);

        const head = new THREE.Mesh(
            new THREE.SphereGeometry(0.34, 12, 10),
            new THREE.MeshStandardMaterial({ color: 0xf0c7a0 })
        );

        head.position.y = 2.05;
        group.add(head);

        const legsMaterial = new THREE.MeshStandardMaterial({
            color: 0x252d43
        });

        for (const side of [-1, 1]) {
            const leg = new THREE.Mesh(
                new THREE.BoxGeometry(0.27, 0.75, 0.3),
                legsMaterial
            );

            leg.position.set(side * 0.22, 0.38, 0);
            group.add(leg);
        }

        return group;
    }

    function addPlayer(id, data = {}) {
        id = String(id);

        if (players.has(id)) {
            return players.get(id);
        }

        const model = createPlayerModel(
            id === String(myId) ? 0x6688ff : 0xff626c
        );

        scene.add(model);

        const player = {
            id,
            model,
            name: data.name || "Игрок",
            x: Number(data.x) || 0,
            y: Number(data.y) || 0,
            z: Number(data.z) || 0,
            yaw: Number(data.yaw) || 0,
            targetX: Number(data.x) || 0,
            targetZ: Number(data.z) || 0
        };

        model.position.set(player.x, player.y, player.z);
        players.set(id, player);

        return player;
    }

    function removePlayer(id) {
        const player = players.get(String(id));

        if (!player) {
            return;
        }

        scene.remove(player.model);

        player.model.traverse(object => {
            if (object.geometry) {
                object.geometry.dispose();
            }

            if (object.material) {
                object.material.dispose();
            }
        });

        players.delete(String(id));
    }

    function updatePlayerData(data) {
        if (!data || typeof data !== "object") {
            return;
        }

        const id = data.id ?? data.playerId;

        if (id === undefined || id === null) {
            return;
        }

        const player = addPlayer(String(id), data);

        if (Number.isFinite(Number(data.x))) {
            player.targetX = Number(data.x);
        }

        if (Number.isFinite(Number(data.z))) {
            player.targetZ = Number(data.z);
        }

        if (Number.isFinite(Number(data.y))) {
            player.y = Number(data.y);
        }

        if (Number.isFinite(Number(data.yaw))) {
            player.yaw = Number(data.yaw);
        }

        if (data.name) {
            player.name = String(data.name);
        }

        if (player.id === String(myId)) {
            if (data.health !== undefined) {
                health = Number(data.health);
            }

            if (data.coins !== undefined) {
                coins = Number(data.coins);
            }

            if (data.xp !== undefined) {
                xp = Number(data.xp);
            }

            if (data.level !== undefined) {
                level = Number(data.level);
            }

            updateStats();
        }
    }

    // ==============================
    // СТАТИСТИКА
    // ==============================

    function updateStats() {
        const maxHealth = 100 + healthLevel * 25;

        setText(
            "healthText",
            `❤️ ${Math.max(0, health)} / ${maxHealth}`
        );

        setText("levelText", `Уровень: ${level}`);
        setText("coinsText", `Монеты: ${coins}`);
        setText("xpText", `Опыт: ${xp}`);
        setText("shopCoins", `Монеты: ${coins}`);

        const bar = el("healthBar");

        if (bar) {
            const percent = Math.max(
                0,
                Math.min(100, health / maxHealth * 100)
            );

            bar.style.width = percent + "%";

            bar.style.background =
                percent < 30 ? "#ff485b" :
                percent < 60 ? "#ffbf48" :
                "#43df7b";
        }
    }

    // ==============================
    // ПОДКЛЮЧЕНИЕ К СЕРВЕРУ
    // ==============================

    function getWebSocketURL() {
        const protocol =
            location.protocol === "https:" ? "wss:" : "ws:";

        return protocol + "//" + location.host;
    }

    function connectToServer() {
        if (
            connecting ||
            (socket && socket.readyState === WebSocket.OPEN)
        ) {
            return;
        }

        if (socket) {
            try {
                socket.close();
            } catch (_) {}
        }

        connecting = true;
        connected = false;

        setConnectionStatus("Подключение...");

        const serverMeta = document.querySelector(
            'meta[name="game-server"]'
        );

        const url = serverMeta && serverMeta.content.trim()
            ? serverMeta.content.trim()
            : getWebSocketURL();

        try {
            socket = new WebSocket(url);
        } catch (error) {
            connecting = false;
            setConnectionStatus("Ошибка адреса сервера");
            showMessage("Не удалось подключиться.");
            scheduleReconnect();
            return;
        }

        socket.onopen = () => {
            connecting = false;
            connected = true;

            setConnectionStatus("Подключено");

            // Отправляем имя игрока при входе.
            send({
                type: "join",
                name: playerName
            });

            showMessage("Соединение установлено!");
        };

        socket.onmessage = event => {
            let data;

            try {
                data = JSON.parse(event.data);
            } catch (error) {
                console.warn("Ответ сервера не JSON:", event.data);
                return;
            }

            handleServerMessage(data);
        };

        socket.onerror = error => {
            console.warn("Ошибка WebSocket:", error);
            setConnectionStatus("Ошибка соединения");
        };

        socket.onclose = () => {
            connected = false;
            connecting = false;

            setConnectionStatus("Отключено");

            if (gameStarted) {
                showMessage("Связь потеряна. Переподключение...");
                scheduleReconnect();
            }
        };
    }

    function scheduleReconnect() {
        clearTimeout(reconnectTimer);

        reconnectTimer = setTimeout(() => {
            if (gameStarted && !connected && !connecting) {
                connectToServer();
            }
        }, CONFIG.reconnectDelay);
    }

    // ==============================
    // ОБРАБОТКА СООБЩЕНИЙ СЕРВЕРА
    // ==============================

    function handleServerMessage(data) {
        if (!data || typeof data !== "object") {
            return;
        }

        switch (data.type) {
            case "welcome": {
                myId = data.id ?? data.playerId ?? myId;

                if (myId !== null && myId !== undefined) {
                    myId = String(myId);

                    addPlayer(myId, {
                        name: playerName,
                        x: data.x,
                        y: data.y,
                        z: data.z
                    });
                }

                if (data.player) {
                    updatePlayerData({
                        ...data.player,
                        id: data.player.id ?? myId
                    });
                }

                showMessage("Добро пожаловать!");
                break;
            }

            case "state":
            case "update": {
                if (data.players) {
                    const list = Array.isArray(data.players)
                        ? data.players
                        : Object.values(data.players);

                    const seen = new Set();

                    list.forEach(item => {
                        const id = item.id ?? item.playerId;

                        if (id === undefined || id === null) {
                            return;
                        }

                        seen.add(String(id));

                        updatePlayerData({
                            ...item,
                            id: String(id)
                        });
                    });

                    for (const id of players.keys()) {
                        if (
                            id !== String(myId) &&
                            !seen.has(id)
                        ) {
                            removePlayer(id);
                        }
                    }
                }

                if (data.health !== undefined) {
                    health = Number(data.health);
                }

                if (data.coins !== undefined) {
                    coins = Number(data.coins);
                }

                if (data.xp !== undefined) {
                    xp = Number(data.xp);
                }

                if (data.level !== undefined) {
                    level = Number(data.level);
                }

                updateStats();
                break;
            }

            case "playerJoined":
                updatePlayerData(data.player || data);
                break;

            case "playerLeft":
                removePlayer(data.id ?? data.playerId);
                break;

            case "damage":
                if (data.health !== undefined) {
                    health = Number(data.health);
                } else {
                    health = Math.max(
                        0,
                        health - Number(data.amount || 0)
                    );
                }

                updateStats();
                break;

            case "coins":
                if (data.coins !== undefined) {
                    coins = Number(data.coins);
                    updateStats();
                }
                break;

            case "hit":
                showMessage(data.message || "Попадание!");
                break;

            case "error":
                showMessage(data.message || "Ошибка сервера.");
                break;

            default:
                if (data.players) {
                    handleServerMessage({
                        type: "state",
                        players: data.players
                    });
                }
        }
    }

    // ==============================
    // ЗАПУСК ИГРЫ
    // ==============================

    function startGame() {
        if (gameStarted) {
            return;
        }

        const input =
            el("playerNameInput") ||
            el("nameInput") ||
            el("playerName") ||
            document.querySelector(
                'input[name="name"], input[name="playerName"], input[type="text"]'
            );

        playerName = input && input.value.trim()
            ? input.value.trim().slice(0, 20)
            : "Player";

        gameStarted = true;

        if (!scene) {
            if (!createWorld()) {
                gameStarted = false;
                return;
            }
        }

        // Скрываем меню после нажатия «Играть».
        const menu = el("gameMenu");

        if (menu) {
            menu.style.display = "none";
        }

        hideElement("namePanel");

        showElement("gameUI", "block");

        connectToServer();
        updateStats();

        if (!window.gameAnimationStarted) {
            window.gameAnimationStarted = true;
            animate();
        }
    }
       // ==============================
    // УПРАВЛЕНИЕ
    // ==============================

    function setupControls() {
        document.addEventListener("keydown", event => {
            keys[event.code] = true;

            if ([
                "ArrowUp", "ArrowDown",
                "ArrowLeft", "ArrowRight",
                "Space"
            ].includes(event.code)) {
                event.preventDefault();
            }
        });

        document.addEventListener("keyup", event => {
            keys[event.code] = false;
        });

        const joystick = el("joystick");
        const stick = el("joystickStick");

        if (joystick && stick) {
            function moveJoystick(event) {
                const rect = joystick.getBoundingClientRect();

                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;

                let dx = event.clientX - centerX;
                let dy = event.clientY - centerY;

                const maxDistance = rect.width * 0.32;
                const distance = Math.hypot(dx, dy);

                if (distance > maxDistance) {
                    dx = dx / distance * maxDistance;
                    dy = dy / distance * maxDistance;
                }

                movement.joystickX = dx / maxDistance;
                movement.joystickY = dy / maxDistance;

                stick.style.transform =
                    `translate(${dx}px, ${dy}px)`;
            }

            function stopJoystick() {
                movement.joystickX = 0;
                movement.joystickY = 0;
                stick.style.transform = "translate(0, 0)";
            }

            joystick.addEventListener("pointerdown", event => {
                event.preventDefault();

                joystick.setPointerCapture(event.pointerId);
                moveJoystick(event);
            });

            joystick.addEventListener("pointermove", event => {
                if (event.buttons || event.pressure > 0) {
                    moveJoystick(event);
                }
            });

            joystick.addEventListener("pointerup", stopJoystick);
            joystick.addEventListener("pointercancel", stopJoystick);
            joystick.addEventListener(
                "lostpointercapture",
                stopJoystick
            );
        }

        // Поворот камеры касанием экрана.
        const lookZone = el("lookZone");

        if (lookZone) {
            lookZone.addEventListener("pointerdown", event => {
                look.active = true;
                look.pointerId = event.pointerId;
                look.lastX = event.clientX;
                look.lastY = event.clientY;

                try {
                    lookZone.setPointerCapture(event.pointerId);
                } catch (_) {}
            });

            lookZone.addEventListener("pointermove", event => {
                if (
                    !look.active ||
                    event.pointerId !== look.pointerId
                ) {
                    return;
                }

                const dx = event.clientX - look.lastX;
                const dy = event.clientY - look.lastY;

                look.lastX = event.clientX;
                look.lastY = event.clientY;

                yaw -= dx * CONFIG.mouseSensitivity;
                pitch -= dy * CONFIG.mouseSensitivity;

                pitch = Math.max(
                    -1,
                    Math.min(0.7, pitch)
                );
            });

            function stopLook(event) {
                if (event.pointerId === look.pointerId) {
                    look.active = false;
                    look.pointerId = null;
                }
            }

            lookZone.addEventListener("pointerup", stopLook);
            lookZone.addEventListener("pointercancel", stopLook);
        }

        // Атака.
        const attackButton = el("attackButton");

        if (attackButton) {
            attackButton.addEventListener("click", attack);
        }

        // Магазин.
        const shopButton = el("shopButton");

        if (shopButton) {
            shopButton.addEventListener("click", () => {
                showElement("shopPanel", "flex");
                updateStats();
            });
        }

        const closeShop = el("closeShop");

        if (closeShop) {
            closeShop.addEventListener("click", () => {
                hideElement("shopPanel");
            });
        }

        bindShopButton("buyDamage", "damage", 25);
        bindShopButton("buyHealth", "health", 20);
        bindShopButton("buySpeed", "speed", 30);

        // Запуск игры.
        const playButton = el("playButton");

        if (playButton) {
            playButton.onclick = event => {
                event.preventDefault();
                startGame();
            };
        }

        const nameInput =
            el("playerNameInput") ||
            el("nameInput") ||
            el("playerName");

        if (nameInput) {
            nameInput.addEventListener("keydown", event => {
                if (event.key === "Enter") {
                    event.preventDefault();
                    startGame();
                }
            });
        }

        // Изменение размера экрана.
        window.addEventListener("resize", () => {
            if (!camera || !renderer) {
                return;
            }

            camera.aspect =
                window.innerWidth / window.innerHeight;

            camera.updateProjectionMatrix();

            renderer.setSize(
                window.innerWidth,
                window.innerHeight
            );
        });
    }

    // ==============================
    // АТАКА
    // ==============================

    function attack() {
        if (!gameStarted) {
            return;
        }

        const now = performance.now();

        if (now - lastAttack < CONFIG.attackCooldown) {
            return;
        }

        lastAttack = now;

        if (!send({
            type: "attack",
            yaw,
            pitch,
            damage: 10 + damageLevel
        })) {
            showMessage("Нет подключения к серверу.");
            return;
        }

        showMessage("Атака!");
    }

    // ==============================
    // МАГАЗИН
    // ==============================

    function bindShopButton(id, item, price) {
        const button = el(id);

        if (!button) {
            return;
        }

        button.addEventListener("click", () => {
            if (!connected) {
                showMessage("Сначала подключись к серверу.");
                return;
            }

            if (coins < price) {
                showMessage("Недостаточно монет!");
                return;
            }

            const sent = send({
                type: "buy",
                item
            });

            if (sent) {
                showMessage("Запрос на покупку отправлен.");
            }
        });
    }

    // ==============================
    // ДВИЖЕНИЕ ИГРОКА
    // ==============================

    function updateMovement(delta) {
        if (!gameStarted) {
            return;
        }

        let forward = movement.joystickY;
        let side = movement.joystickX;

        if (keys["KeyW"] || keys["ArrowUp"]) forward -= 1;
        if (keys["KeyS"] || keys["ArrowDown"]) forward += 1;
        if (keys["KeyA"] || keys["ArrowLeft"]) side -= 1;
        if (keys["KeyD"] || keys["ArrowRight"]) side += 1;

        const length = Math.hypot(side, forward);

        if (length > 1) {
            side /= length;
            forward /= length;
        }

        movement.x = side;
        movement.z = forward;

        const speed = CONFIG.speed * (1 + speedLevel * 0.1);

        const moveX =
            Math.cos(yaw) * side -
            Math.sin(yaw) * forward;

        const moveZ =
            Math.sin(yaw) * side +
            Math.cos(yaw) * forward;

        send({
            type: "input",
            x: moveX * speed * delta,
            z: moveZ * speed * delta,
            yaw,
            moveX,
            moveY: forward
        });
    }

    // ==============================
    // КАМЕРА
    // ==============================

    function updateCamera() {
        if (!camera || myId === null) {
            return;
        }

        const player = players.get(String(myId));

        if (!player) {
            return;
        }

        const distance = 5;

        const targetX = player.model.position.x;
        const targetZ = player.model.position.z;

        const cameraX = targetX - Math.sin(yaw) * distance;
        const cameraZ = targetZ - Math.cos(yaw) * distance;
        const cameraY = 2.8 + pitch * 2;

        camera.position.lerp(
            new THREE.Vector3(cameraX, cameraY, cameraZ),
            0.18
        );

        camera.lookAt(
            targetX,
            1.4 + pitch,
            targetZ
        );

        player.model.rotation.y = yaw;
    }

    // ==============================
    // ИГРОВОЙ ЦИКЛ
    // ==============================

    function animate() {
        requestAnimationFrame(animate);

        if (!renderer || !scene || !camera) {
            return;
        }

        const delta = Math.min(clock.getDelta(), 0.05);

        if (gameStarted) {
            updateMovement(delta);

            // Плавное движение других игроков.
            for (const player of players.values()) {
                player.model.position.x +=
                    (player.targetX - player.model.position.x) * 0.25;

                player.model.position.z +=
                    (player.targetZ - player.model.position.z) * 0.25;
            }

            updateCamera();
        }

        renderer.render(scene, camera);
    }

    // ==============================
    // ЗАПУСК ПРИЛОЖЕНИЯ
    // ==============================

    function init() {
        createInterface();

        if (typeof THREE !== "undefined") {
            createWorld();
        } else {
            console.error("Three.js не загружен.");
        }

        setupControls();
        updateStats();
        setConnectionStatus("Готово к запуску");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, {
            once: true
        });
    } else {
        init();
    }
})();
   
