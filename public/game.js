(() => {
    "use strict";

    const CONFIG = {
        serverUrl: "",
        moveSpeed: 5,
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
        players: new Map(),
        keys: {},
        joystickActive: false,
        lookActive: false,
        lastTouchX: 0,
        lastTouchY: 0
    };

    let scene;
    let camera;
    let renderer;
    let clock;
    let ground;
    let playerBody;
    let animationId;

    const $ = (id) => document.getElementById(id);

    function createElement(tag, id, parent = document.body) {
        let element = $(id);

        if (!element) {
            element = document.createElement(tag);
            element.id = id;
            parent.appendChild(element);
        }

        return element;
    }

    function addStyles() {
        if ($("gameStyles")) return;

        const style = document.createElement("style");
        style.id = "gameStyles";

        style.textContent = `
            #gameUI {
                position: fixed;
                inset: 0;
                z-index: 5;
                pointer-events: none;
                color: white;
                font-family: Arial, sans-serif;
                user-select: none;
            }

            #gameTop {
                position: absolute;
                top: 12px;
                left: 12px;
                right: 12px;
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                gap: 10px;
            }

            #gameStats {
                padding: 10px;
                border-radius: 12px;
                background: #10131cce;
                min-width: 150px;
                font-size: 13px;
            }

            #healthTrack {
                height: 9px;
                margin: 6px 0;
                border-radius: 8px;
                overflow: hidden;
                background: #444;
            }

            #healthBar {
                width: 100%;
                height: 100%;
                background: #35dc75;
                transition: width 0.15s;
            }

            #connectionStatus {
                margin-top: 6px;
                color: #ffd166;
                font-size: 11px;
            }

            #shopButton,
            .gameButton {
                border: 0;
                border-radius: 10px;
                padding: 11px 15px;
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
                width: 65%;
                height: 100%;
                pointer-events: auto;
                touch-action: none;
            }

            #joystick {
                position: absolute;
                left: 24px;
                bottom: 28px;
                width: 120px;
                height: 120px;
                border-radius: 50%;
                border: 2px solid #ffffff80;
                background: #11182788;
                pointer-events: auto;
                touch-action: none;
            }

            #joystickStick {
                position: absolute;
                left: 50%;
                top: 50%;
                width: 48px;
                height: 48px;
                border-radius: 50%;
                background: #aebcffdd;
                border: 2px solid white;
                transform: translate(-50%, -50%);
            }

            #attackButton {
                position: absolute;
                right: 25px;
                bottom: 35px;
                width: 82px;
                height: 82px;
                border: 2px solid #ffffffbb;
                border-radius: 50%;
                background: #ed4755dd;
                color: white;
                font-size: 15px;
                font-weight: bold;
                pointer-events: auto;
                touch-action: none;
            }

            #statusMessage {
                position: absolute;
                top: 100px;
                left: 50%;
                transform: translateX(-50%);
                padding: 9px 14px;
                border-radius: 9px;
                background: #10131cbb;
                text-align: center;
                max-width: 90%;
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
                color: white;
                font-family: Arial, sans-serif;
            }

            #menuCard {
                width: 100%;
                max-width: 360px;
                padding: 25px;
                border: 1px solid #ffffff25;
                border-radius: 20px;
                background: #171c2bed;
                box-shadow: 0 15px 50px #0008;
                text-align: center;
            }

            #menuCard h1 {
                margin: 0 0 10px;
                font-size: 28px;
            }

            #menuCard p {
                color: #c5cbe0;
                line-height: 1.5;
            }

            #playerNameInput {
                display: block;
                width: 100%;
                margin: 18px 0 12px;
                padding: 13px;
                border: 1px solid #596cff;
                border-radius: 10px;
                outline: none;
                background: #0d1120;
                color: white;
                font-size: 16px;
            }

            #playButton {
                width: 100%;
                padding: 14px;
                border: 0;
                border-radius: 10px;
                background: #596cff;
                color: white;
                font-weight: bold;
                font-size: 16px;
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

            #shopPanel h2 {
                margin-top: 0;
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
                padding: 8px 10px;
                border: 0;
                border-radius: 8px;
                background: #596cff;
                color: white;
            }

            #closeShop {
                width: 100%;
                margin-top: 8px;
                padding: 10px;
                border: 0;
                border-radius: 8px;
                background: #394052;
                color: white;
            }

            @media (max-width: 420px) {
                #gameStats {
                    min-width: 135px;
                    font-size: 12px;
                }

                #joystick {
                    left: 18px;
                    bottom: 24px;
                    width: 108px;
                    height: 108px;
                }

                #attackButton {
                    right: 18px;
                    bottom: 28px;
                    width: 72px;
                    height: 72px;
                }
            }
        `;

        document.head.appendChild(style);
    }

    function createInterface() {
        addStyles();

        const ui = createElement("div", "gameUI");
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
                    <button id="buyDamage">Купить · 20</button>
                </div>

                <div class="shopItem">
                    <span>Здоровье +25</span>
                    <button id="buyHealth">Купить · 15</button>
                </div>

                <div class="shopItem">
                    <span>Скорость +1</span>
                    <button id="buySpeed">Купить · 25</button>
                </div>

                <button id="closeShop">Закрыть</button>
            </div>
        `;

        const menu = createElement("div", "gameMenu");

        menu.innerHTML = `
            <div id="menuCard">
                <h1>3D Multiplayer</h1>
                <p>Введи имя и заходи в игровой мир.</p>
                <input
                    id="playerNameInput"
                    type="text"
                    maxlength="20"
                    placeholder="Твоё имя"
                    autocomplete="nickname"
                >
                <button id="playButton">ИГРАТЬ</button>
                <div id="menuConnection">
                    Подготовка игры...
                </div>
            </div>
        `;

        $("shopPanel").style.display = "none";
        menu.style.display = "flex";
    }

    function showMessage(message, duration = 2200) {
        const element = $("statusMessage");

        if (!element) return;

        element.textContent = message;
        element.style.display = "block";

        clearTimeout(showMessage.timer);

        showMessage.timer = setTimeout(() => {
            if (element) {
                element.style.display = "none";
            }
        }, duration);
    }

    function updateInterface() {
        if ($("healthText")) {
            $("healthText").textContent =
                `Здоровье: ${state.health}/${state.maxHealth}`;
        }

        if ($("healthBar")) {
            const percent = state.maxHealth > 0
                ? Math.max(0, state.health / state.maxHealth * 100)
                : 0;

            $("healthBar").style.width = `${percent}%`;

            $("healthBar").style.background =
                percent > 50 ? "#35dc75" :
                percent > 25 ? "#ffd166" : "#ff4757";
        }

        if ($("levelText")) {
            $("levelText").textContent = `Уровень: ${state.level}`;
        }

        if ($("coinsText")) {
            $("coinsText").textContent = `Монеты: ${state.coins}`;
        }

        if ($("xpText")) {
            $("xpText").textContent = `Опыт: ${state.xp}`;
        }

        if ($("shopCoins")) {
            $("shopCoins").textContent = state.coins;
        }

        const connectionText = state.connected
            ? "Подключено"
            : "Нет подключения к серверу";

        if ($("connectionStatus")) {
            $("connectionStatus").textContent = connectionText;
        }

        if ($("menuConnection") && !state.started) {
            $("menuConnection").textContent = connectionText;
        }
    }

    function createWorld() {
        if (typeof THREE === "undefined") {
            showMessage("Не удалось загрузить Three.js", 5000);
            return false;
        }

        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x9bb8d8);
        scene.fog = new THREE.Fog(0x9bb8d8, 25, 100);

        camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            500
        );

        camera.position.set(0, 1.65, 5);
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

        const ambient = new THREE.HemisphereLight(
            0xdceaff,
            0x424b36,
            2
        );

        scene.add(ambient);

        const sunlight = new THREE.DirectionalLight(
            0xffffff,
            1.5
        );

        sunlight.position.set(20, 30, 10);
        scene.add(sunlight);

        const groundGeometry = new THREE.PlaneGeometry(200, 200);

        const groundMaterial = new THREE.MeshStandardMaterial({
            color: 0x507b48,
            roughness: 1
        });

        ground = new THREE.Mesh(
            groundGeometry,
            groundMaterial
        );

        ground.rotation.x = -Math.PI / 2;
        ground.position.y = 0;
        scene.add(ground);

        createBuildings();

        clock = new THREE.Clock();

        return true;
    }

    function createBuildings() {
        const materials = [
            new THREE.MeshStandardMaterial({ color: 0x858b98 }),
            new THREE.MeshStandardMaterial({ color: 0xb5a28b }),
            new THREE.MeshStandardMaterial({ color: 0x747e91 }),
            new THREE.MeshStandardMaterial({ color: 0xc1c7cf })
        ];

        for (let i = 0; i < 32; i++) {
            const width = 3 + Math.random() * 5;
            const depth = 3 + Math.random() * 5;
            const height = 4 + Math.random() * 15;

            const geometry = new THREE.BoxGeometry(
                width,
                height,
                depth
            );

            const building = new THREE.Mesh(
                geometry,
                materials[i % materials.length]
            );

            const angle = i / 32 * Math.PI * 2;
            const radius = 17 + Math.random() * 22;

            building.position.set(
                Math.cos(angle) * radius,
                height / 2,
                Math.sin(angle) * radius
            );

            scene.add(building);

            const windowMaterial = new THREE.MeshStandardMaterial({
                color: 0xffdf91,
                emissive: 0x55401c
            });

            for (let floor = 1; floor < height / 2; floor++) {
                for (let column = 0; column < 2; column++) {
                    const windowMesh = new THREE.Mesh(
                        new THREE.BoxGeometry(0.45, 0.55, 0.06),
                        windowMaterial
                    );

                    windowMesh.position.set(
                        building.position.x +
                            (column === 0 ? -width * 0.22 : width * 0.22),
                        floor * 1.5,
                        building.position.z + depth / 2 + 0.04
                    );

                    scene.add(windowMesh);
                }
            }
        }
        }
        function createPlayerModel(color = 0x4f79ff) {
        const group = new THREE.Group();

        const material = new THREE.MeshStandardMaterial({
            color,
            roughness: 0.8
        });

        const body = new THREE.Mesh(
            new THREE.BoxGeometry(0.65, 1.1, 0.35),
            material
        );

        body.position.y = 0.85;
        group.add(body);

        const head = new THREE.Mesh(
            new THREE.SphereGeometry(0.25, 12, 10),
            new THREE.MeshStandardMaterial({ color: 0xf0c7a0 })
        );

        head.position.y = 1.55;
        group.add(head);

        const legsMaterial = new THREE.MeshStandardMaterial({
            color: 0x29334d
        });

        for (const x of [-0.18, 0.18]) {
            const leg = new THREE.Mesh(
                new THREE.BoxGeometry(0.2, 0.55, 0.22),
                legsMaterial
            );

            leg.position.set(x, 0.28, 0);
            group.add(leg);
        }

        return group;
    }

    function addPlayer(id, data = {}) {
        if (!scene || id == null) return;

        if (String(id) === String(state.myId)) return;

        if (state.players.has(String(id))) {
            updatePlayer(id, data);
            return;
        }

        const model = createPlayerModel(0xff665c);

        model.position.set(
            Number(data.x) || 0,
            0,
            Number(data.z) || 0
        );

        scene.add(model);

        state.players.set(String(id), {
            model,
            name: data.name || "Игрок",
            health: data.health ?? 100
        });
    }

    function updatePlayer(id, data = {}) {
        const player = state.players.get(String(id));

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

        if (data.name) {
            player.name = data.name;
        }

        if (data.health !== undefined) {
            player.health = Number(data.health) || 0;
        }
    }

    function removePlayer(id) {
        const key = String(id);
        const player = state.players.get(key);

        if (!player) return;

        scene.remove(player.model);

        player.model.traverse((object) => {
            if (object.geometry) object.geometry.dispose();
            if (object.material) {
                if (Array.isArray(object.material)) {
                    object.material.forEach(material => material.dispose());
                } else {
                    object.material.dispose();
                }
            }
        });

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
        if (state.socket) {
            try {
                state.socket.close();
            } catch (_) {}
        }

        let url = CONFIG.serverUrl.trim();

        if (!url) {
            const protocol = location.protocol === "https:"
                ? "wss:"
                : "ws:";

            url = `${protocol}//${location.host}`;
        }

        if (
            location.protocol === "https:" &&
            url.startsWith("ws://")
        ) {
            showMessage(
                "Для HTTPS нужен защищённый WebSocket (wss://)",
                4000
            );
            return;
        }

        let socket;

        try {
            socket = new WebSocket(url);
        } catch (error) {
            state.connected = false;
            updateInterface();
            showMessage("Не удалось создать подключение", 3000);
            return;
        }

        state.socket = socket;
        state.connected = false;
        updateInterface();

        socket.addEventListener("open", () => {
            if (state.socket !== socket) return;

            state.connected = true;
            updateInterface();

            sendServer({
                type: "join",
                name: state.name
            });

            showMessage("Соединение с сервером установлено");
        });

        socket.addEventListener("message", (event) => {
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
                showMessage("Связь с сервером потеряна", 4000);
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
                if (data.id !== undefined) {
                    state.myId = data.id;
                }

                if (data.health !== undefined) {
                    state.health = Number(data.health) || state.health;
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

                if (Number.isFinite(Number(data.x))) {
                    state.position.x = Number(data.x);
                }

                if (Number.isFinite(Number(data.z))) {
                    state.position.z = Number(data.z);
                }

                if (Number.isFinite(Number(data.rotation))) {
                    state.yaw = Number(data.rotation);
                }

                updateInterface();

                if (Array.isArray(data.players)) {
                    data.players.forEach(player => {
                        if (player.id != null) {
                            addPlayer(player.id, player);
                        }
                    });
                }

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

                    if (String(player.id) === String(state.myId)) {
                        if (Number.isFinite(Number(player.x))) {
                            state.position.x = Number(player.x);
                        }

                        if (Number.isFinite(Number(player.z))) {
                            state.position.z = Number(player.z);
                        }

                        if (Number.isFinite(Number(player.health))) {
                            state.health = Number(player.health);
                        }

                        return;
                    }

                    updatePlayer(player.id, player);
                });

                updateInterface();
                break;
            }

            case "playerJoined": {
                if (data.player && data.player.id != null) {
                    addPlayer(data.player.id, data.player);
                } else if (data.id != null) {
                    addPlayer(data.id, data);
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

                    updateInterface();
                }

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
                if (data.id != null && data.id !== state.myId) {
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
            showMessage("Сначала введи имя", 2500);

            if (input) input.focus();

            return;
        }

        if (name.length > 20) {
            showMessage("Имя должно быть не длиннее 20 символов");
            return;
        }

        if (!scene || !camera || !renderer) {
            showMessage("Игровой мир ещё не готов", 3000);
            return;
        }

        state.name = name;
        state.started = true;

        $("gameMenu").style.display = "none";
        $("gameUI").style.display = "block";

        state.position.set(0, 0, 5);

        camera.position.set(
            state.position.x,
            1.65,
            state.position.z
        );

        camera.rotation.order = "YXZ";
        camera.rotation.set(state.pitch, state.yaw, 0);

        connectToServer();
        updateInterface();

        showMessage("Добро пожаловать, " + state.name + "!");
    }

    function openShop() {
        if (!state.started) return;

        const panel = $("shopPanel");

        if (panel) {
            panel.style.display = "block";
            updateInterface();
        }
    }

    function closeShop() {
        const panel = $("shopPanel");

        if (panel) {
            panel.style.display = "none";
        }
    }

    function buyUpgrade(type, price) {
        if (state.coins < price) {
            showMessage("Недостаточно монет!");
            return;
        }

        if (!state.connected) {
            showMessage("Магазин доступен после подключения к серверу");
            return;
        }

        const sent = sendServer({
            type: "buy",
            item: type,
            price
        });

        if (!sent) {
            showMessage("Не удалось отправить покупку");
        }
            }
        function setupControls() {
        const joystick = $("joystick");
        const stick = $("joystickStick");
        const lookZone = $("lookZone");
        const attackButton = $("attackButton");

        if (!joystick || !stick || !lookZone || !attackButton) {
            return;
        }

        function updateJoystick(event) {
            const rect = joystick.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;

            let dx = event.clientX - centerX;
            let dy = event.clientY - centerY;

            const maxDistance = rect.width * 0.34;
            const distance = Math.hypot(dx, dy);

            if (distance > maxDistance) {
                dx = dx / distance * maxDistance;
                dy = dy / distance * maxDistance;
            }

            state.moveX = dx / maxDistance;
            state.moveZ = dy / maxDistance;

            stick.style.left =
                `calc(50% + ${dx}px)`;

            stick.style.top =
                `calc(50% + ${dy}px)`;
        }

        function resetJoystick() {
            state.moveX = 0;
            state.moveZ = 0;
            state.joystickActive = false;

            stick.style.left = "50%";
            stick.style.top = "50%";
        }

        joystick.addEventListener("pointerdown", event => {
            event.preventDefault();

            state.joystickActive = true;

            try {
                joystick.setPointerCapture(event.pointerId);
            } catch (_) {}

            updateJoystick(event);
        });

        joystick.addEventListener("pointermove", event => {
            if (!state.joystickActive) return;

            event.preventDefault();
            updateJoystick(event);
        });

        joystick.addEventListener("pointerup", resetJoystick);
        joystick.addEventListener("pointercancel", resetJoystick);
        joystick.addEventListener("lostpointercapture", resetJoystick);

        lookZone.addEventListener("pointerdown", event => {
            if (!state.started) return;
            if (event.pointerType === "mouse" && event.button !== 0) return;

            event.preventDefault();

            state.lookActive = true;
            state.lastTouchX = event.clientX;
            state.lastTouchY = event.clientY;

            try {
                lookZone.setPointerCapture(event.pointerId);
            } catch (_) {}
        });

        lookZone.addEventListener("pointermove", event => {
            if (!state.lookActive || !state.started) return;

            event.preventDefault();

            const dx = event.clientX - state.lastTouchX;
            const dy = event.clientY - state.lastTouchY;

            state.lastTouchX = event.clientX;
            state.lastTouchY = event.clientY;

            const sensitivity = event.pointerType === "mouse"
                ? CONFIG.mouseSensitivity
                : CONFIG.touchSensitivity;

            state.yaw -= dx * sensitivity;
            state.pitch -= dy * sensitivity;

            const limit = Math.PI / 2 - 0.05;

            state.pitch = Math.max(
                -limit,
                Math.min(limit, state.pitch)
            );
        });

        function stopLooking() {
            state.lookActive = false;
        }

        lookZone.addEventListener("pointerup", stopLooking);
        lookZone.addEventListener("pointercancel", stopLooking);
        lookZone.addEventListener("lostpointercapture", stopLooking);

        document.addEventListener("keydown", event => {
            state.keys[event.key.toLowerCase()] = true;

            if (
                ["w", "a", "s", "d", "arrowup", "arrowdown",
                    "arrowleft", "arrowright", " "].includes(
                    event.key.toLowerCase()
                )
            ) {
                event.preventDefault();
            }

            if (event.key.toLowerCase() === "e") {
                const panel = $("shopPanel");

                if (panel && panel.style.display === "none") {
                    openShop();
                } else {
                    closeShop();
                }
            }

            if (event.code === "Space") {
                attack();
            }
        });

        document.addEventListener("keyup", event => {
            state.keys[event.key.toLowerCase()] = false;
        });

        window.addEventListener("blur", () => {
            state.keys = {};
            resetJoystick();
            stopLooking();
        });

        attackButton.addEventListener("pointerdown", event => {
            event.preventDefault();
            attack();
        });

        $("shopButton").addEventListener("click", openShop);
        $("closeShop").addEventListener("click", closeShop);

        $("buyDamage").addEventListener("click", () => {
            buyUpgrade("damage", 20);
        });

        $("buyHealth").addEventListener("click", () => {
            buyUpgrade("health", 15);
        });

        $("buySpeed").addEventListener("click", () => {
            buyUpgrade("speed", 25);
        });

        $("playButton").addEventListener("click", startGame);

        $("playerNameInput").addEventListener("keydown", event => {
            if (event.key === "Enter") {
                startGame();
            }
        });

        window.addEventListener("resize", () => {
            if (!camera || !renderer) return;

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

        if (now - state.lastAttack < CONFIG.attackCooldown) {
            return;
        }

        state.lastAttack = now;

        let nearestId = null;
        let nearestDistance = CONFIG.attackDistance;

        const forward = new THREE.Vector3(
            -Math.sin(state.yaw),
            0,
            -Math.cos(state.yaw)
        );

        for (const [id, player] of state.players) {
            const offset = new THREE.Vector3(
                player.model.position.x - state.position.x,
                0,
                player.model.position.z - state.position.z
            );

            const distance = offset.length();

            if (distance > nearestDistance || distance < 0.001) {
                continue;
            }

            offset.normalize();

            if (forward.dot(offset) < 0.45) {
                continue;
            }

            nearestId = id;
            nearestDistance = distance;
        }

        if (nearestId !== null) {
            sendServer({
                type: "attack",
                target: nearestId,
                damage: state.damage
            });

            showMessage("Атака отправлена");
        } else {
            sendServer({
                type: "attack",
                damage: state.damage
            });

            showMessage("Удар!");
        }
    }

    function updateMovement(delta) {
        if (!state.started || !state.position) return;

        let forward = 0;
        let strafe = 0;

        if (state.keys["w"] || state.keys["arrowup"]) {
            forward += 1;
        }

        if (state.keys["s"] || state.keys["arrowdown"]) {
            forward -= 1;
        }

        if (state.keys["a"] || state.keys["arrowleft"]) {
            strafe -= 1;
        }

        if (state.keys["d"] || state.keys["arrowright"]) {
            strafe += 1;
        }

        forward -= state.moveZ;
        strafe += state.moveX;

        const length = Math.hypot(forward, strafe);

        if (length > 1) {
            forward /= length;
            strafe /= length;
        }

        const speed = state.speed * delta;

        const dx =
            -Math.sin(state.yaw) * forward * speed +
            Math.cos(state.yaw) * strafe * speed;

        const dz =
            -Math.cos(state.yaw) * forward * speed -
            Math.sin(state.yaw) * strafe * speed;

        state.position.x += dx;
        state.position.z += dz;

        // Камера находится на уровне глаз игрока.
        camera.position.set(
            state.position.x,
            1.65,
            state.position.z
        );

        camera.rotation.order = "YXZ";
        camera.rotation.set(
            state.pitch,
            state.yaw,
            0
        );

        // Не отправляем координаты каждый кадр.
        state.networkTimer = (state.networkTimer || 0) + delta;

        if (state.networkTimer >= 0.05) {
            state.networkTimer = 0;

            sendServer({
                type: "input",
                x: state.position.x,
                z: state.position.z,
                rotation: state.yaw,
                forward,
                strafe
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
        createInterface();

        if (!createWorld()) {
            $("menuConnection").textContent =
                "Ошибка загрузки 3D-движка";
            return;
        }

        // Координаты игрока хранятся отдельно от камеры.
        state.position = new THREE.Vector3(0, 0, 5);

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
