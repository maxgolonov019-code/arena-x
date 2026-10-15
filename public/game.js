(() => {
    "use strict";

    const CONFIG = {
        serverUrl: "",
        moveSpeed: 6,
        mouseSensitivity: 0.004,
        touchSensitivity: 0.006,
        attackDistance: 3,
        attackCooldown: 500
    };

    const state = {
        started: false,
        connected: false,
        socket: null,
        myId: null,
        name: "",
        health: 100,
        maxHealth: 100,
        level: 1,
        coins: 0,
        xp: 0,
        damage: 10,
        speed: CONFIG.moveSpeed,
        lastAttack: 0,
        yaw: 0,
        pitch: 0,
        moveX: 0,
        moveZ: 0,
        position: { x: 0, z: 8 },
        players: new Map(),
        keys: {},
        joystickActive: false,
        lookActive: false,
        lastTouchX: 0,
        lastTouchY: 0,
        networkTimer: 0
    };

    let scene;
    let camera;
    let renderer;
    let clock;
    let animationId;

    const $ = id => document.getElementById(id);

    function addStyles() {
        if ($("gameStyles")) return;

        const style = document.createElement("style");
        style.id = "gameStyles";

        style.textContent = `
            * {
                box-sizing: border-box;
                -webkit-tap-highlight-color: transparent;
            }

            html, body {
                width: 100%;
                height: 100%;
                margin: 0;
                overflow: hidden;
                background: #111827;
                color: white;
                font-family: Arial, sans-serif;
                touch-action: none;
                user-select: none;
            }

            #gameCanvas {
                position: fixed;
                inset: 0;
                z-index: 0;
                width: 100%;
                height: 100%;
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
                align-items: flex-start;
            }

            #gameStats {
                min-width: 155px;
                padding: 10px;
                border-radius: 12px;
                background: #10131cdd;
                font-size: 13px;
                line-height: 1.5;
            }

            #healthTrack {
                height: 9px;
                overflow: hidden;
                margin: 5px 0;
                border-radius: 8px;
                background: #444;
            }

            #healthBar {
                height: 100%;
                width: 100%;
                background: #35dc75;
            }

            #connectionStatus {
                margin-top: 4px;
                color: #ffd166;
                font-size: 11px;
            }

            button, input {
                font: inherit;
            }

            button {
                border: 0;
                border-radius: 10px;
                padding: 11px 14px;
                color: white;
                background: #596cff;
                font-weight: bold;
            }

            #shopButton {
                pointer-events: auto;
            }

            #lookZone {
                position: absolute;
                right: 0;
                top: 0;
                width: 60%;
                height: 100%;
                pointer-events: auto;
                touch-action: none;
            }

            #joystick {
                position: absolute;
                left: 22px;
                bottom: 28px;
                width: 116px;
                height: 116px;
                border: 2px solid #ffffff88;
                border-radius: 50%;
                background: #11182799;
                pointer-events: auto;
                touch-action: none;
            }

            #joystickStick {
                position: absolute;
                left: 50%;
                top: 50%;
                width: 46px;
                height: 46px;
                transform: translate(-50%, -50%);
                border: 2px solid white;
                border-radius: 50%;
                background: #8094ffdd;
            }

            #attackButton {
                position: absolute;
                right: 22px;
                bottom: 35px;
                width: 76px;
                height: 76px;
                padding: 0;
                border: 2px solid #ffffffbb;
                border-radius: 50%;
                background: #e84958ee;
                pointer-events: auto;
                touch-action: none;
            }

            #statusMessage {
                position: absolute;
                top: 105px;
                left: 50%;
                transform: translateX(-50%);
                max-width: 90%;
                padding: 9px 13px;
                border-radius: 9px;
                background: #10131cdd;
                text-align: center;
            }

            #gameMenu {
                position: fixed;
                inset: 0;
                z-index: 20;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
                background:
                    radial-gradient(circle at top, #303d78, transparent 60%),
                    #10131c;
            }

            #menuCard {
                width: 100%;
                max-width: 360px;
                padding: 25px;
                border: 1px solid #ffffff25;
                border-radius: 20px;
                background: #171c2bf5;
                text-align: center;
            }

            #menuCard h1 {
                margin-top: 0;
            }

            #menuCard p {
                color: #c5cbe0;
            }

            #playerNameInput {
                display: block;
                width: 100%;
                margin: 20px 0 12px;
                padding: 13px;
                border: 1px solid #596cff;
                border-radius: 10px;
                outline: none;
                background: #0d1120;
                color: white;
                font-size: 16px;
                touch-action: auto;
                user-select: text;
            }

            #playButton {
                width: 100%;
                padding: 14px;
            }

            #menuConnection {
                margin-top: 12px;
                color: #ffd166;
                font-size: 12px;
            }

            #shopPanel {
                position: absolute;
                z-index: 10;
                top: 50%;
                left: 50%;
                width: min(330px, calc(100% - 32px));
                padding: 20px;
                transform: translate(-50%, -50%);
                border: 1px solid #ffffff30;
                border-radius: 16px;
                background: #171c2bf5;
                pointer-events: auto;
            }

            .shopItem {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                margin: 10px 0;
                padding: 10px;
                border-radius: 10px;
                background: #ffffff0d;
            }

            .shopItem button {
                padding: 8px;
            }

            #closeShop {
                width: 100%;
                background: #394052;
            }

            @media (max-width: 420px) {
                #gameStats {
                    min-width: 140px;
                    font-size: 12px;
                }

                #joystick {
                    width: 105px;
                    height: 105px;
                    left: 16px;
                    bottom: 22px;
                }

                #attackButton {
                    right: 16px;
                    bottom: 25px;
                    width: 70px;
                    height: 70px;
                }
            }
        `;

        document.head.appendChild(style);
    }

    function createInterface() {
        addStyles();

        const ui = document.createElement("div");
        ui.id = "gameUI";

        ui.innerHTML = `
            <div id="gameTop">
                <div id="gameStats">
                    <div id="healthText">Здоровье: 100/100</div>
                    <div id="healthTrack">
                        <div id="healthBar"></div>
                    </div>
                    <div id="levelText">Уровень: 1</div>
                    <div id="coinsText">Монеты: 0</div>
                    <div id="xpText">Опыт: 0</div>
                    <div id="connectionStatus">Нет подключения</div>
                </div>
                <button id="shopButton">Магазин</button>
            </div>

            <div id="statusMessage">Добро пожаловать!</div>
            <div id="lookZone"></div>

            <div id="joystick">
                <div id="joystickStick"></div>
            </div>

            <button id="attackButton">АТАКА</button>

            <div id="shopPanel" style="display:none">
                <h2>Магазин</h2>
                <p>Монеты: <b id="shopCoins">0</b></p>

                <div class="shopItem">
                    <span>Урон +5</span>
                    <button id="buyDamage">20 монет</button>
                </div>

                <div class="shopItem">
                    <span>Здоровье +25</span>
                    <button id="buyHealth">15 монет</button>
                </div>

                <div class="shopItem">
                    <span>Скорость +1</span>
                    <button id="buySpeed">25 монет</button>
                </div>

                <button id="closeShop">Закрыть</button>
            </div>
        `;

        document.body.appendChild(ui);

        const menu = document.createElement("div");
        menu.id = "gameMenu";

        menu.innerHTML = `
            <div id="menuCard">
                <h1>3D Multiplayer</h1>
                <p>Введи имя и отправляйся в город!</p>
                <input
                    id="playerNameInput"
                    maxlength="20"
                    placeholder="Твоё имя"
                    autocomplete="nickname"
                >
                <button id="playButton">ИГРАТЬ</button>
                <div id="menuConnection">Подготовка игры...</div>
            </div>
        `;

        document.body.appendChild(menu);
    }

    function showMessage(message, duration = 2200) {
        const element = $("statusMessage");
        if (!element) return;

        element.textContent = message;
        element.style.display = "block";

        clearTimeout(showMessage.timer);

        showMessage.timer = setTimeout(() => {
            element.style.display = "none";
        }, duration);
    }

    function updateInterface() {
        $("healthText").textContent =
            `Здоровье: ${state.health}/${state.maxHealth}`;

        const hp = Math.max(
            0,
            Math.min(100, state.health / state.maxHealth * 100)
        );

        $("healthBar").style.width = hp + "%";

        $("healthBar").style.background =
            hp > 50 ? "#35dc75" :
            hp > 25 ? "#ffd166" : "#ff4757";

        $("levelText").textContent = `Уровень: ${state.level}`;
        $("coinsText").textContent = `Монеты: ${state.coins}`;
        $("xpText").textContent = `Опыт: ${state.xp}`;
        $("shopCoins").textContent = state.coins;

        const text = state.connected
            ? "Сервер подключён"
            : "Одиночный режим / нет сервера";

        $("connectionStatus").textContent = text;

        if (!state.started) {
            $("menuConnection").textContent = text;
        }
    }

    function addBox(x, y, z, width, height, depth, color) {
        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(width, height, depth),
            new THREE.MeshStandardMaterial({
                color,
                roughness: 0.9
            })
        );

        mesh.position.set(x, y + height / 2, z);
        scene.add(mesh);

        return mesh;
    }

    function addRoad(x, z, width, depth) {
        const road = new THREE.Mesh(
            new THREE.PlaneGeometry(width, depth),
            new THREE.MeshStandardMaterial({
                color: 0x343941,
                roughness: 1
            })
        );

        road.rotation.x = -Math.PI / 2;
        road.position.set(x, 0.025, z);
        scene.add(road);
    }

    function addCityBlock(centerX, centerZ) {
        const sidewalkColor = 0xb6b6b0;
        const buildingColors = [
            0x9b9ca5,
            0xb9a38b,
            0x777f8b,
            0xc5c5c0,
            0x8d9996,
            0xa98f87
        ];

        const blockSize = 18;

        // Земля квартала.
        addBox(
            centerX,
            -0.15,
            centerZ,
            blockSize,
            0.3,
            blockSize,
            0x66805a
        );

        // Тротуар вокруг квартала.
        addBox(
            centerX,
            0.02,
            centerZ - 8.5,
            18,
            0.12,
            1.5,
            sidewalkColor
        );

        addBox(
            centerX,
            0.02,
            centerZ + 8.5,
            18,
            0.12,
            1.5,
            sidewalkColor
        );

        addBox(
            centerX - 8.5,
            0.02,
            centerZ,
            1.5,
            0.12,
            18,
            sidewalkColor
        );

        addBox(
            centerX + 8.5,
            0.02,
            centerZ,
            1.5,
            0.12,
            18,
            sidewalkColor
        );

        // Несколько зданий внутри квартала.
        const spots = [
            [-4.5, -4.5],
            [4.5, -4.5],
            [-4.5, 4.5],
            [4.5, 4.5]
        ];

        spots.forEach((spot, index) => {
            const width = 5 + (index % 2);
            const depth = 5;
            const height = 6 + ((index * 7) % 10);
            const bx = centerX + spot[0];
            const bz = centerZ + spot[1];

            addBox(
                bx,
                0,
                bz,
                width,
                height,
                depth,
                buildingColors[index % buildingColors.length]
            );

            // Крыша.
            addBox(
                bx,
                height,
                bz,
                width + 0.2,
                0.25,
                depth + 0.2,
                0x454953
            );

            // Окна на фасаде.
            for (let floor = 1.5; floor < height - 1; floor += 2) {
                for (let column = -1; column <= 1; column++) {
                    const windowMesh = new THREE.Mesh(
                        new THREE.BoxGeometry(0.7, 0.9, 0.08),
                        new THREE.MeshStandardMaterial({
                            color: 0xffd995,
                            emissive: 0x44351b
                        })
                    );

                    windowMesh.position.set(
                        bx + column * 1.3,
                        floor,
                        bz + depth / 2 + 0.06
                    );

                    scene.add(windowMesh);
                }
            }
        });
    }

    function createCity() {
        // Большая территория.
        const ground = new THREE.Mesh(
            new THREE.PlaneGeometry(240, 240),
            new THREE.MeshStandardMaterial({
                color: 0x58784d,
                roughness: 1
            })
        );

        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.03;
        scene.add(ground);

        // Сетка улиц: две основные дороги и несколько кварталов.
        const roadWidth = 10;
        const blockStep = 28;

        for (let i = -3; i <= 3; i++) {
            addRoad(i * blockStep, 0, roadWidth, 220);
            addRoad(0, i * blockStep, 220, roadWidth);
        }

        // Разметка на дорогах.
        const lineMaterial = new THREE.MeshStandardMaterial({
            color: 0xf1d77b,
            emissive: 0x29210c
        });

        for (let z = -105; z <= 105; z += 7) {
            const dash = new THREE.Mesh(
                new THREE.PlaneGeometry(0.18, 3),
                lineMaterial
            );

            dash.rotation.x = -Math.PI / 2;
            dash.position.set(0, 0.045, z);
            scene.add(dash);
        }

        for (let x = -105; x <= 105; x += 7) {
            const dash = new THREE.Mesh(
                new THREE.PlaneGeometry(3, 0.18),
                lineMaterial
            );

            dash.rotation.x = -Math.PI / 2;
            dash.position.set(x, 0.05, 0);
            scene.add(dash);
        }

        // Кварталы по обе стороны дорог.
        for (let x = -2; x <= 2; x++) {
            for (let z = -2; z <= 2; z++) {
                if (x === 0 && z === 0) continue;

                addCityBlock(
                    x * blockStep + (x > 0 ? 0 : 0),
                    z * blockStep + (z > 0 ? 0 : 0)
                );
            }
        }

        // Фонари вдоль главных дорог.
        for (let p = -4; p <= 4; p++) {
            for (const side of [-1, 1]) {
                addStreetLamp(side * 7, p * 22);
                addStreetLamp(p * 22, side * 7);
            }
        }
    }

    function addStreetLamp(x, z) {
        const poleMaterial = new THREE.MeshStandardMaterial({
            color: 0x353a42,
            metalness: 0.6,
            roughness: 0.5
        });

        const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.09, 0.13, 4, 8),
            poleMaterial
        );

        pole.position.set(x, 2, z);
        scene.add(pole);

        const bulb = new THREE.Mesh(
            new THREE.SphereGeometry(0.22, 8, 8),
            new THREE.MeshStandardMaterial({
                color: 0xffe3a1,
                emissive: 0xffb84d,
                emissiveIntensity: 1.2
            })
        );

        bulb.position.set(x, 4.05, z);
        scene.add(bulb);
    }

    function createWorld() {
        if (typeof THREE === "undefined") {
            $("menuConnection").textContent =
                "Ошибка: Three.js не загрузился";
            return false;
        }

        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x9aafc9);
        scene.fog = new THREE.Fog(0x9aafc9, 45, 190);

        camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            500
        );

        camera.position.set(
            state.position.x,
            1.65,
            state.position.z
        );

        camera.rotation.order = "YXZ";

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

        scene.add(
            new THREE.HemisphereLight(0xdceaff, 0x414a35, 2)
        );

        const sun = new THREE.DirectionalLight(0xffffff, 1.5);
        sun.position.set(30, 45, 20);
        scene.add(sun);

        createCity();

        clock = new THREE.Clock();

        return true;
                }
        function createPlayerModel(color = 0xff665c) {
        const group = new THREE.Group();

        const body = new THREE.Mesh(
            new THREE.BoxGeometry(0.65, 1.1, 0.35),
            new THREE.MeshStandardMaterial({ color })
        );

        body.position.y = 0.85;
        group.add(body);

        const head = new THREE.Mesh(
            new THREE.SphereGeometry(0.25, 12, 10),
            new THREE.MeshStandardMaterial({ color: 0xf0c7a0 })
        );

        head.position.y = 1.55;
        group.add(head);

        const legMaterial = new THREE.MeshStandardMaterial({
            color: 0x29334d
        });

        for (const x of [-0.18, 0.18]) {
            const leg = new THREE.Mesh(
                new THREE.BoxGeometry(0.2, 0.55, 0.22),
                legMaterial
            );

            leg.position.set(x, 0.28, 0);
            group.add(leg);
        }

        return group;
    }

    function addPlayer(id, data = {}) {
        if (!scene || id == null) return;

        const key = String(id);

        if (state.myId != null && key === String(state.myId)) {
            return;
        }

        if (state.players.has(key)) {
            updatePlayer(id, data);
            return;
        }

        const model = createPlayerModel();

        model.position.set(
            Number(data.x) || 0,
            0,
            Number(data.z) || 0
        );

        scene.add(model);

        state.players.set(key, {
            model,
            name: data.name || "Игрок",
            health: Number(data.health ?? 100)
        });
    }

    function updatePlayer(id, data = {}) {
        const key = String(id);
        const player = state.players.get(key);

        if (!player) {
            addPlayer(id, data);
            return;
        }

        if (Number.isFinite(Number(data.x))) {
            player.model.position.x = Number(data.x);
        }

        if (Number.isFinite(Number(data.z))) {
            player.model.position.z = Number(data.z);
        }

        if (Number.isFinite(Number(data.rotation))) {
            player.model.rotation.y = Number(data.rotation);
        }

        if (data.name) player.name = data.name;

        if (data.health !== undefined) {
            player.health = Number(data.health) || 0;
        }
    }

    function removePlayer(id) {
        const key = String(id);
        const player = state.players.get(key);

        if (!player) return;

        scene.remove(player.model);
        state.players.delete(key);
    }

    function sendServer(data) {
        if (
            state.socket &&
            state.socket.readyState === WebSocket.OPEN
        ) {
            state.socket.send(JSON.stringify(data));
            return true;
        }

        return false;
    }

    function connectToServer() {
        let url = CONFIG.serverUrl.trim();

        if (!url) {
            const protocol = location.protocol === "https:"
                ? "wss:"
                : "ws:";

            url = `${protocol}//${location.host}`;
        }

        let socket;

        try {
            socket = new WebSocket(url);
        } catch (error) {
            state.connected = false;
            updateInterface();
            showMessage("Не удалось подключиться к серверу");
            return;
        }

        state.socket = socket;
        state.connected = false;
        updateInterface();

        socket.addEventListener("open", () => {
            if (state.socket !== socket) return;

            state.connected = true;

            sendServer({
                type: "join",
                name: state.name
            });

            updateInterface();
            showMessage("Соединение установлено");
        });

        socket.addEventListener("message", event => {
            if (state.socket !== socket) return;

            let data;

            try {
                data = JSON.parse(event.data);
            } catch (_) {
                return;
            }

            handleServerMessage(data);
        });

        socket.addEventListener("close", () => {
            if (state.socket !== socket) return;

            state.connected = false;
            updateInterface();

            if (state.started) {
                showMessage("Связь с сервером потеряна");
            }
        });

        socket.addEventListener("error", () => {
            if (state.socket !== socket) return;

            state.connected = false;
            updateInterface();
        });
    }

    function handleServerMessage(data) {
        if (!data || typeof data !== "object") return;

        switch (data.type) {
            case "welcome": {
                if (data.id != null) {
                    state.myId = data.id;
                }

                if (Number.isFinite(Number(data.x))) {
                    state.position.x = Number(data.x);
                }

                if (Number.isFinite(Number(data.z))) {
                    state.position.z = Number(data.z);
                }

                if (Number.isFinite(Number(data.rotation))) {
                    state.yaw = Number(data.rotation);
                }

                if (data.health !== undefined) {
                    state.health = Number(data.health);
                }

                if (data.maxHealth !== undefined) {
                    state.maxHealth = Number(data.maxHealth) || 100;
                }

                if (data.level !== undefined) {
                    state.level = Number(data.level) || 1;
                }

                if (data.coins !== undefined) {
                    state.coins = Number(data.coins) || 0;
                }

                if (data.xp !== undefined) {
                    state.xp = Number(data.xp) || 0;
                }

                if (Array.isArray(data.players)) {
                    data.players.forEach(player => {
                        if (player.id != null) {
                            addPlayer(player.id, player);
                        }
                    });
                }

                updateInterface();
                break;
            }

            case "state":
            case "update": {
                if (data.health !== undefined) {
                    state.health = Number(data.health) || 0;
                }

                if (data.maxHealth !== undefined) {
                    state.maxHealth = Number(data.maxHealth) || 100;
                }

                if (data.level !== undefined) {
                    state.level = Number(data.level) || 1;
                }

                if (data.coins !== undefined) {
                    state.coins = Number(data.coins) || 0;
                }

                if (data.xp !== undefined) {
                    state.xp = Number(data.xp) || 0;
                }

                const players = Array.isArray(data.players)
                    ? data.players
                    : data.players && typeof data.players === "object"
                        ? Object.entries(data.players).map(([id, player]) => ({
                            id,
                            ...player
                        }))
                        : [];

                players.forEach(player => {
                    if (player.id == null) return;

                    if (
                        state.myId != null &&
                        String(player.id) === String(state.myId)
                    ) {
                        // Не перезаписываем локальное движение:
                        // иначе игрок может дёргаться назад.
                        return;
                    }

                    updatePlayer(player.id, player);
                });

                updateInterface();
                break;
            }

            case "playerJoined": {
                const player = data.player || data;

                if (player.id != null) {
                    addPlayer(player.id, player);
                }

                break;
            }

            case "playerLeft": {
                if (data.id != null) {
                    removePlayer(data.id);
                }

                break;
            }

            case "damage": {
                if (data.health !== undefined) {
                    state.health = Math.max(
                        0,
                        Number(data.health) || 0
                    );
                }

                updateInterface();
                showMessage(data.message || "Получен урон");
                break;
            }

            case "levelUp": {
                if (data.level !== undefined) {
                    state.level = Number(data.level) || state.level;
                }

                updateInterface();
                showMessage("Новый уровень!");
                break;
            }

            case "error": {
                showMessage(data.message || "Ошибка сервера", 4000);
                break;
            }

            default: {
                if (data.id != null) {
                    updatePlayer(data.id, data);
                }
            }
        }
    }

    function startGame() {
        if (state.started) return;

        const input = $("playerNameInput");
        const name = input ? input.value.trim() : "";

        if (!name) {
            $("menuConnection").textContent = "Сначала введи имя";
            input?.focus();
            return;
        }

        state.name = name.slice(0, 20);
        state.started = true;

        $("gameMenu").style.display = "none";
        $("gameUI").style.display = "block";

        camera.position.set(
            state.position.x,
            1.65,
            state.position.z
        );

        camera.rotation.set(state.pitch, state.yaw, 0);

        updateInterface();
        connectToServer();

        showMessage("Добро пожаловать, " + state.name + "!");
    }

    function openShop() {
        if (!state.started) return;

        $("shopPanel").style.display = "block";
        updateInterface();
    }

    function closeShop() {
        $("shopPanel").style.display = "none";
    }

    function buyUpgrade(type, price) {
        if (state.coins < price) {
            showMessage("Недостаточно монет!");
            return;
        }

        if (!state.connected) {
            showMessage("Покупки требуют подключения к серверу");
            return;
        }

        sendServer({
            type: "buy",
            item: type,
            price
        });
                }
        function setupControls() {
        const joystick = $("joystick");
        const joystickKnob = $("joystickKnob");
        const lookZone = $("lookZone");
        const attackButton = $("attackButton");
        const startButton = $("startButton");
        const shopButton = $("shopButton");
        const closeShopButton = $("closeShopButton");

        let joystickPointer = null;
        let lookPointer = null;
        let joystickRect = null;

        function updateJoystick(event) {
            if (joystickPointer !== event.pointerId) return;

            const rect = joystick.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const maxDistance = rect.width * 0.31;

            let dx = event.clientX - centerX;
            let dy = event.clientY - centerY;

            const distance = Math.hypot(dx, dy);

            if (distance > maxDistance) {
                dx = dx / distance * maxDistance;
                dy = dy / distance * maxDistance;
            }

            state.moveX = dx / maxDistance;
            state.moveZ = dy / maxDistance;

            joystickKnob.style.transform =
                `translate(${dx}px, ${dy}px)`;
        }

        function resetJoystick(event) {
            if (
                event &&
                joystickPointer !== null &&
                event.pointerId !== joystickPointer
            ) {
                return;
            }

            joystickPointer = null;
            state.moveX = 0;
            state.moveZ = 0;

            joystickKnob.style.transform = "translate(0, 0)";
        }

        joystick.addEventListener("pointerdown", event => {
            if (joystickPointer !== null) return;

            event.preventDefault();
            joystickPointer = event.pointerId;

            try {
                joystick.setPointerCapture(event.pointerId);
            } catch (_) {}

            updateJoystick(event);
        });

        joystick.addEventListener("pointermove", updateJoystick);
        joystick.addEventListener("pointerup", resetJoystick);
        joystick.addEventListener("pointercancel", resetJoystick);
        joystick.addEventListener("lostpointercapture", resetJoystick);

        lookZone.addEventListener("pointerdown", event => {
            if (!state.started || lookPointer !== null) return;

            if (event.pointerType === "mouse") return;

            lookPointer = event.pointerId;
            state.lastTouchX = event.clientX;
            state.lastTouchY = event.clientY;

            try {
                lookZone.setPointerCapture(event.pointerId);
            } catch (_) {}
        });

        lookZone.addEventListener("pointermove", event => {
            if (lookPointer !== event.pointerId) return;

            const dx = event.clientX - state.lastTouchX;
            const dy = event.clientY - state.lastTouchY;

            state.lastTouchX = event.clientX;
            state.lastTouchY = event.clientY;

            state.yaw -= dx * CONFIG.touchSensitivity;
            state.pitch -= dy * CONFIG.touchSensitivity;

            state.pitch = Math.max(
                -1.35,
                Math.min(1.35, state.pitch)
            );
        });

        function stopLooking(event) {
            if (event && lookPointer !== event.pointerId) return;
            lookPointer = null;
        }

        lookZone.addEventListener("pointerup", stopLooking);
        lookZone.addEventListener("pointercancel", stopLooking);
        lookZone.addEventListener("lostpointercapture", stopLooking);

        document.addEventListener("pointermove", event => {
            if (!state.started) return;
            if (event.pointerType !== "mouse") return;
            if (document.pointerLockElement !== renderer.domElement) return;

            state.yaw -= event.movementX * CONFIG.mouseSensitivity;
            state.pitch -= event.movementY * CONFIG.mouseSensitivity;

            state.pitch = Math.max(
                -1.35,
                Math.min(1.35, state.pitch)
            );
        });

        renderer.domElement.addEventListener("click", () => {
            if (
                state.started &&
                !("ontouchstart" in window) &&
                document.pointerLockElement !== renderer.domElement
            ) {
                renderer.domElement.requestPointerLock?.();
            }
        });

        document.addEventListener("keydown", event => {
            const key = event.key.toLowerCase();

            state.keys[key] = true;

            if (
                ["w", "a", "s", "d", "arrowup", "arrowdown",
                 "arrowleft", "arrowright", " "].includes(key)
            ) {
                event.preventDefault();
            }

            if (key === " " && state.started) {
                attack();
            }

            if (key === "escape") {
                closeShop();
                document.exitPointerLock?.();
            }
        });

        document.addEventListener("keyup", event => {
            state.keys[event.key.toLowerCase()] = false;
        });

        window.addEventListener("blur", () => {
            state.keys = {};
            resetJoystick();
        });

        attackButton.addEventListener("pointerdown", event => {
            event.preventDefault();
            event.stopPropagation();
            attack();
        });

        startButton.addEventListener("click", startGame);
        shopButton.addEventListener("click", openShop);
        closeShopButton.addEventListener("click", closeShop);

        $("buyDamage").addEventListener("click", () => {
            buyUpgrade("damage", 50);
        });

        $("buySpeed").addEventListener("click", () => {
            buyUpgrade("speed", 75);
        });

        $("buyHealth").addEventListener("click", () => {
            buyUpgrade("health", 40);
        });

        $("playerName").addEventListener("keydown", event => {
            if (event.key === "Enter") startGame();
        });

        window.addEventListener("resize", () => {
            if (!renderer || !camera) return;

            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();

            renderer.setSize(
                window.innerWidth,
                window.innerHeight
            );
        });
    }

    function attack() {
        if (!state.started) return;

        const now = performance.now();

        if (now - state.lastAttack < CONFIG.attackCooldown) return;

        state.lastAttack = now;

        if (state.connected) {
            sendServer({
                type: "attack",
                yaw: state.yaw,
                pitch: state.pitch
            });
        } else {
            showMessage("Для нанесения урона нужен сервер");
        }
    }

    function updateMovement(delta) {
        if (!state.started) return;

        let forward = 0;
        let strafe = 0;

        if (state.keys["w"] || state.keys["arrowup"]) forward += 1;
        if (state.keys["s"] || state.keys["arrowdown"]) forward -= 1;
        if (state.keys["d"] || state.keys["arrowright"]) strafe += 1;
        if (state.keys["a"] || state.keys["arrowleft"]) strafe -= 1;

        forward -= state.moveZ;
        strafe += state.moveX;

        const length = Math.hypot(forward, strafe);

        if (length > 1) {
            forward /= length;
            strafe /= length;
        }

        const speed = state.speed * delta;

        state.position.x += (
            -Math.sin(state.yaw) * forward +
            Math.cos(state.yaw) * strafe
        ) * speed;

        state.position.z += (
            -Math.cos(state.yaw) * forward -
            Math.sin(state.yaw) * strafe
        ) * speed;

        camera.position.set(
            state.position.x,
            1.65,
            state.position.z
        );

        camera.rotation.order = "YXZ";
        camera.rotation.y = state.yaw;
        camera.rotation.x = state.pitch;
        camera.rotation.z = 0;

        state.networkTimer += delta;

        if (state.connected && state.networkTimer >= 0.05) {
            state.networkTimer = 0;

            sendServer({
                type: "move",
                x: state.position.x,
                z: state.position.z,
                yaw: state.yaw,
                pitch: state.pitch
            });
        }
    }

    function animate() {
        animationId = requestAnimationFrame(animate);

        if (!renderer || !scene || !camera) return;

        const delta = Math.min(clock.getDelta(), 0.05);

        updateMovement(delta);

        renderer.render(scene, camera);
    }

    function init() {
        addStyles();
        createInterface();
        createWorld();
        setupControls();
        updateInterface();
        animate();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, {
            once: true
        });
    } else {
        init();
    }
})();
