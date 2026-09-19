const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));

let gameInterval = null;
let currentScene = "start"; 
let gameTimer = 60 * 60; // 2 minutes at 30 FPS
let gameSpeed = 2.2;
let highScore = 0;

// Separate targets for each player side to hit independently
let p1Ball = { x: 150, y: 200, g: 120, e: 80, dxSign: 1, dySign: -1, sizeDir: 1, minX: 30, maxX: 270 };
let p2Ball = { x: 450, y: 200, g: 120, e: 80, dxSign: 1, dySign: 1, sizeDir: 1, minX: 330, maxX: 570 };

let players = {}; 

function resetGameServer() {
    gameTimer = 60 * 60;
    gameSpeed = 2.2;
    p1Ball = { x: 150, y: 200, g: 120, e: 80, dxSign: 1, dySign: -1, sizeDir: 1, minX: 30, maxX: 270 };
    p2Ball = { x: 450, y: 200, g: 120, e: 80, dxSign: 1, dySign: 1, sizeDir: 1, minX: 330, maxX: 570 };
    Object.values(players).forEach(p => {
        p.score = 0; p.combo = 0; p.mult = 1;
    });
}

function startServerLoop() {
    if (gameInterval) clearInterval(gameInterval);
    gameInterval = setInterval(() => {
        if (currentScene !== "game") return;

        gameTimer--;
        if (gameTimer <= 0) {
            currentScene = "gameover";
            io.emit('gameStateUpdate', { currentScene, gameTimer, p1Ball, p2Ball, players, highScore });
            return;
        }

        // Move Player 1's shape
        p1Ball.x += p1Ball.dxSign * 4.2 * gameSpeed; p1Ball.y += p1Ball.dySign * 4.8 * gameSpeed;
        p1Ball.g -= p1Ball.sizeDir * 3.8 * gameSpeed; p1Ball.e -= p1Ball.sizeDir * 2.8 * gameSpeed;
        if (p1Ball.g <= 15 || p1Ball.e <= 15) p1Ball.sizeDir = -1;
        if (p1Ball.g >= 120 || p1Ball.e >= 90) p1Ball.sizeDir = 1;
        if (p1Ball.x < p1Ball.minX) { p1Ball.x = p1Ball.minX; p1Ball.dxSign = 1; }
        if (p1Ball.x > p1Ball.maxX) { p1Ball.x = p1Ball.maxX; p1Ball.dxSign = -1; }
        if (p1Ball.y < 60) { p1Ball.y = 60; p1Ball.dySign = 1; }
        if (p1Ball.y > 370) { p1Ball.y = 370; p1Ball.dySign = -1; }

        // Move Player 2's shape
        p2Ball.x += p2Ball.dxSign * 4.2 * gameSpeed; p2Ball.y += p2Ball.dySign * 4.8 * gameSpeed;
        p2Ball.g -= p2Ball.sizeDir * 3.8 * gameSpeed; p2Ball.e -= p2Ball.sizeDir * 2.8 * gameSpeed;
        if (p2Ball.g <= 15 || p2Ball.e <= 15) p2Ball.sizeDir = -1;
        if (p2Ball.g >= 120 || p2Ball.e >= 90) p2Ball.sizeDir = 1;
        if (p2Ball.x < p2Ball.minX) { p2Ball.x = p2Ball.minX; p2Ball.dxSign = 1; }
        if (p2Ball.x > p2Ball.maxX) { p2Ball.x = p2Ball.maxX; p2Ball.dxSign = -1; }
        if (p2Ball.y < 60) { p2Ball.y = 60; p2Ball.dySign = 1; }
        if (p2Ball.y > 370) { p2Ball.y = 370; p2Ball.dySign = -1; }

        io.emit('gameStateUpdate', { currentScene, gameTimer, p1Ball, p2Ball, players, highScore });
    }, 1000 / 30);
}

io.on('connection', (socket) => {
    let playerRole = "spectator";
    const activePlayerCount = Object.values(players).filter(p => p.role !== "spectator").length;
    if (activePlayerCount === 0) playerRole = "Player 1 (Red)";
    else if (activePlayerCount === 1) playerRole = "Player 2 (Blue)";

    players[socket.id] = { id: socket.id, role: playerRole, score: 0, combo: 0, mult: 1 };
    socket.emit('initRole', playerRole);
    io.emit('gameStateUpdate', { currentScene, gameTimer, p1Ball, p2Ball, players, highScore });

    socket.on('startGame', () => {
        resetGameServer();
        currentScene = "game";
        startServerLoop();
    });

    socket.on('playerClick', (mouseData) => {
        if (currentScene !== "game") return;
        let p = players[socket.id];
        if (p.role === "spectator") return;

        let targetBall = p.role.includes("Player 1") ? p1Ball : p2Ball;
        const rx = targetBall.g / 2; const ry = targetBall.e / 2;
        const dx = mouseData.x - targetBall.x; const dy = mouseData.y - targetBall.y;
        const isHit = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1;

        if (isHit) {
            p.combo++;
            p.mult = Math.min(5, 1 + Math.floor(p.combo / 3));
            p.score += 10 * p.mult;
            if (p.score > highScore) highScore = p.score;
            gameSpeed += 0.08;
            io.emit('playAudio', { type: 'hit', pId: socket.id, mouseX: mouseData.x, mouseY: mouseData.y });
        } else {
            p.combo = 0; p.mult = 1;
            p.score = Math.max(0, p.score - 20);
            socket.emit('flashScreen'); 
            io.emit('playAudio', { type: 'miss', pId: socket.id });
        }
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        if (Object.keys(players).length === 0) clearInterval(gameInterval);
    });
});

http.listen(PORT, () => console.log('Versus Server running on port ' + PORT));
const socket = io();
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
canvas.width = 600;
canvas.height = 400;

let myRole = "Connecting...";
let serverState = { currentScene: "start", gameTimer: 0, p1Ball: {}, p2Ball: {}, players: {}, highScore: 0 };
let particles = [];
let animTimer = 0;
let bgScrollTimer = 0;
let flashAlpha = 0;

let audioCtx = null;
function initAudio() { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }

function triggerSynth(type, comboCount = 0) {
    if (!audioCtx) return;
    let osc = audioCtx.createOscillator(); let gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    let now = audioCtx.currentTime;
    if (type === "hit") {
        let pitch = 450 + Math.min(400, comboCount * 25);
        osc.frequency.setValueAtTime(pitch, now); gain.gain.setValueAtTime(0.15, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.1); osc.start(now); osc.stop(now + 0.1);
    } else if (type === "miss") {
        osc.type = "sawtooth"; osc.frequency.setValueAtTime(130, now); gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.15); osc.start(now); osc.stop(now + 0.15);
    }
}

socket.on('initRole', (role) => { myRole = role; });
socket.on('flashScreen', () => { flashAlpha = 0.4; });

socket.on('playAudio', (data) => {
    let p = serverState.players[data.pId];
    triggerSynth(data.type, p ? p.combo : 0);
    if (data.type === 'hit' && p) {
        let isP1 = p.role.includes("Player 1");
        for (let i = 0; i < 15; i++) {
            particles.push({
                x: data.mouseX, y: data.mouseY,
                vx: (Math.random() - 0.5) * 10, vy: (Math.random() - 0.5) * 10,
                size: Math.random() * 4 + 2, alpha: 255,
                r: isP1 ? 255 : 0, g: isP1 ? 46 : 245, b: isP1 ? 144 : 255
            });
        }
    }
});

socket.on('gameStateUpdate', (state) => { serverState = state; });

function render() {
    requestAnimationFrame(render);
    ctx.clearRect(0, 0, 600, 400);
    const scene = serverState.currentScene;

    if (scene === "start") {
        ctx.fillStyle = "rgb(18, 14, 36)"; ctx.fillRect(0, 0, 600, 400);
        animTimer += 0.5; let offset = animTimer % 40;
        ctx.strokeStyle = "rgb(35, 28, 66)"; ctx.lineWidth = 1.5;
        for (let gX = -40; gX < 640; gX += 40) { ctx.beginPath(); ctx.moveTo(gX - offset, 0); ctx.lineTo(gX - offset, 400); ctx.stroke(); }
        
        ctx.fillStyle = "rgb(255, 46, 144)"; ctx.font = "bold 42px sans-serif"; ctx.textAlign = "center";
        ctx.fillText("SHAPE TAPER: VERSUS", 300, 110);
        ctx.fillStyle = "white"; ctx.font = "bold 16px sans-serif";
        ctx.fillText(`YOU ARE: ${myRole.toUpperCase()}`, 300, 170);
        ctx.fillStyle = "rgb(170, 160, 210)"; ctx.font = "14px sans-serif";
        ctx.fillText("Left Side: Player 1 (Red) | Right Side: Player 2 (Blue)", 300, 210);
        
        ctx.fillStyle = "rgb(255, 46, 144)"; ctx.beginPath(); ctx.roundRect(225, 270, 150, 50, 12); ctx.fill();
        ctx.fillStyle = "white"; ctx.font = "bold 18px sans-serif"; ctx.fillText("START LOBBY", 300, 302);
    } 
    else if (scene === "game") {
        ctx.fillStyle = "rgb(18, 14, 36)"; ctx.fillRect(0, 0, 600, 400);
        
        bgScrollTimer += 2; let stripeOffset = bgScrollTimer % 60;
        ctx.fillStyle = "rgb(24, 19, 48)"; 
        for (let sX = -60; sX < 660; sX += 60) { ctx.fillRect(sX + stripeOffset, 0, 20, 400); }

        // Draw Court Divider Line
        ctx.strokeStyle = "rgba(255, 255, 255, 0.15)"; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(300, 0); ctx.lineTo(300, 400); ctx.stroke();

        // Render targets
        const b1 = serverState.p1Ball;
        ctx.fillStyle = "rgb(255, 46, 144)";
        ctx.beginPath(); ctx.ellipse(b1.x, b1.y, Math.max(2, b1.g / 2), Math.max(2, b1.e / 2), 0, 0, Math.PI * 2); ctx.fill();

        const b2 = serverState.p2Ball;
        ctx.fillStyle = "rgb(0, 245, 255)";
        ctx.beginPath(); ctx.ellipse(b2.x, b2.y, Math.max(2, b2.g / 2), Math.max(2, b2.e / 2), 0, 0, Math.PI * 2); ctx.fill();

        // Process particles
        for (let i = particles.length - 1; i >= 0; i--) {
            let pt = particles[i]; pt.x += pt.vx; pt.y += pt.vy; pt.alpha -= 8;
            ctx.fillStyle = `rgba(${pt.r}, ${pt.g}, ${pt.b}, ${pt.alpha / 255})`;
            ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size / 2, 0, Math.PI * 2); ctx.fill();
            if (pt.alpha <= 0) particles.splice(i, 1);
        }

        // Isolated flash effects routing
        if (flashAlpha > 0) {
            ctx.fillStyle = `rgba(255, 0, 50, ${flashAlpha})`;
            ctx.fillRect(myRole.includes("Player 1") ? 0 : 300, 0, 300, 400);
            flashAlpha -= 0.08;
        }

        // --- HUD HIGH SCORE METRIC PROGRESS BAR ---
        let meterWidth = 240; let meterX = 180; let meterY = 24;
        ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
        ctx.beginPath(); ctx.roundRect(meterX, meterY, meterWidth, 10, 5); ctx.fill();

        // Find max active room score to test progress bar fullness
        let pList = Object.values(serverState.players);
        let leadScore = pList.length > 0 ? Math.max(...pList.map(pl => pl.score)) : 0;
        let fillRatio = serverState.highScore > 0 ? leadScore / serverState.highScore : 1;
        let computedFillWidth = Math.min(meterWidth, meterWidth * fillRatio);

        if (leadScore >= serverState.highScore && leadScore > 0) {
            let hue = (performance.now() / 4) % 360;
            ctx.fillStyle = `hsl(${hue}, 100%, 60%)`;
        } else {
            ctx.fillStyle = "rgb(0, 245, 255)";
        }
        if (computedFillWidth > 0) {
            ctx.beginPath(); ctx.roundRect(meterX, meterY, computedFillWidth, 10, 5); ctx.fill();
        }

        // Render Player Scores & Combo Displays
        ctx.fillStyle = "white"; ctx.font = "bold 16px sans-serif"; ctx.textBaseline = "top";
        let p1Obj = pList.find(pl => pl.role.includes("Player 1"));
        let p2Obj = pList.find(pl => pl.role.includes("Player 2"));

        ctx.textAlign = "left";
        ctx.fillText(`P1: ${p1Obj ? p1Obj.score : 0}`, 20, 20);
        if (p1Obj && p1Obj.combo >= 2) {
            ctx.fillStyle = "rgb(255, 46, 144)"; ctx.font = "italic bold 12px sans-serif";
            ctx.fillText(`Combo x${p1Obj.mult} (${p1Obj.combo} Streak!)`, 20, 42);
            ctx.fillStyle = "white"; ctx.font = "bold 16px sans-serif";
        }

        ctx.textAlign = "right";
        ctx.fillText(`P2: ${p2Obj ? p2Obj.score : 0}`, 580, 20);
        if (p2Obj && p2Obj.combo >= 2) {
            ctx.fillStyle = "rgb(0, 245, 255)"; ctx.font = "italic bold 12px sans-serif";
            ctx.fillText(`Combo x${p2Obj.mult} (${p2Obj.combo} Streak!)`, 580, 42);
            ctx.fillStyle = "white"; ctx.font = "bold 16px sans-serif";
        }

        ctx.textAlign = "center";
        ctx.fillText(`${Math.ceil(serverState.gameTimer / 30)}s`, 300, 20);
    } 
    else if (scene === "gameover") {
        ctx.fillStyle = "rgb(12, 10, 24)"; ctx.fillRect(0, 0, 600, 400);
        animTimer += 0.4;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.03)"; ctx.lineWidth = 2;
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 10) {
            let bX = 300 + Math.cos(a + animTimer * 0.01) * 400; let bY = 130 + Math.sin(a + animTimer * 0.01) * 400;
            ctx.beginPath(); ctx.moveTo(300, 130); ctx.lineTo(bX, bY); ctx.stroke();
        }

        let pList = Object.values(serverState.players).filter(p => p.role !== "spectator");
        let p1S = pList.find(pl => pl.role.includes("Player 1"))?.score || 0;
        let p2S = pList.find(pl => pl.role.includes("Player 2"))?.score || 0;
        let winTxt = "IT'S A DRAW!";
        if (p1S > p2S) winTxt = "PLAYER 1 (RED) WINS!";
        if (p2S > p1S) winTxt = "PLAYER 2 (BLUE) WINS!";

        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillStyle = "rgb(255, 200, 0)"; ctx.font = "bold 38px sans-serif"; ctx.fillText(winTxt, 300, 120);

        ctx.fillStyle = "rgba(255, 255, 255, 0.05)"; ctx.fillRect(100, 180, 400, 70);
        ctx.fillStyle = "rgb(200, 190, 210)"; ctx.font = "13px sans-serif"; ctx.fillText("FINAL SCORES", 300, 198);
        ctx.fillStyle = "white"; ctx.font = "bold 20px sans-serif"; ctx.fillText(`Player 1: ${p1S} PTS   |   Player 2: ${p2S} PTS`, 300, 230);

        ctx.fillStyle = "rgb(255, 46, 144)"; ctx.beginPath(); ctx.roundRect(225, 290, 150, 48, 12); ctx.fill();
        ctx.fillStyle = "white"; ctx.font = "bold 16px sans-serif"; ctx.fillText("REMATCH", 300, 314);
    }
}

canvas.addEventListener("click", function(event) {
    initAudio();
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    if (serverState.currentScene === "start") {
        if (mouseX > 225 && mouseX < 375 && mouseY > 270 && mouseY < 320) socket.emit('startGame');
    } else if (serverState.currentScene === "game") {
        socket.emit('playerClick', { x: mouseX, y: mouseY });
    } else if (serverState.currentScene === "gameover") {
        if (mouseX > 225 && mouseX < 375 && mouseY > 290 && mouseY < 338) socket.emit('startGame');
    }
});

requestAnimationFrame(render);
