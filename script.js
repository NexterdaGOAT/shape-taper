const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// --- GAME STATE ENVIRONMENT ---
let currentScene = "start"; 

let x = 200;
let y = 350;
let g = 250;
let e = 150;
let posDir = 1;
let sizeDir = 1;

// Separate the X and Y movement axes for accurate bouncing physics
let dxSign = 1;
let dySign = -1;

// --- INSANE MODE DIFFICULTY BALANCING ---
let gameSpeed = 2.5; 

let fillR = 255;
let fillG = 46;
let fillB = 144;

let score = 0;
let highScore = 0;
let particles = [];

let gameTimer = 60 * 60; // 3600 frames total (Exactly 2 minutes at 30 FPS)
let animTimer = 0;       
let bgScrollTimer = 0;   // Controls the scrolling speed of the gameplay stripes
let flashAlpha = 0;      // Controls the opacity of the red miss flash

// --- NEW VARIABLES: COMBO SYSTEM ---
let comboStreak = 0;     // Number of consecutive hits
let comboMultiplier = 1; // Current score multiplier level

// --- WEBAUDIO SYNTHESIZER ENGINE ---
let audioCtx = null;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

function playSound(type) {
    if (!audioCtx) return;
    
    let osc = audioCtx.createOscillator();
    let gainNode = audioCtx.createGain();
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    let now = audioCtx.currentTime;
    
    if (type === "hit") {
        // Pitch ramps slightly higher if player is on an active combo streak!
        let basePitch = 400 + Math.min(400, comboStreak * 25);
        osc.type = "sine";
        osc.frequency.setValueAtTime(basePitch, now);
        osc.frequency.exponentialRampToValueAtTime(basePitch * 2, now + 0.1);
        gainNode.gain.setValueAtTime(0.2, now);
        gainNode.gain.linearRampToValueAtTime(0, now + 0.12);
        osc.start(now);
        osc.stop(now + 0.12);
    } else if (type === "miss") {
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.linearRampToValueAtTime(60, now + 0.2);
        gainNode.gain.setValueAtTime(0.3, now);
        gainNode.gain.linearRampToValueAtTime(0, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
    } else if (type === "record") {
        osc.type = "triangle";
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.setValueAtTime(450, now + 0.08);
        osc.frequency.setValueAtTime(600, now + 0.16);
        osc.frequency.exponentialRampToValueAtTime(1500, now + 0.35);
        gainNode.gain.setValueAtTime(0.25, now);
        gainNode.gain.linearRampToValueAtTime(0, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.4);
    }
}

function map(value, low1, high1, low2, high2) {
    return low2 + (high2 - low2) * (value - low1) / (high1 - low1);
}

function dist(x1, y1, x2, y2) {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

const resetGame = function() {
    x = 200;
    y = 350;
    g = 250;
    e = 150;
    posDir = 1;
    sizeDir = 1;
    dxSign = 1;
    dySign = -1;
    gameSpeed = 2.5; 
    fillR = 255;
    fillG = 46;
    fillB = 144;
    score = 0; 
    gameTimer = 60 * 60; 
    particles = []; 
    bgScrollTimer = 0;
    flashAlpha = 0; 
    comboStreak = 0;
    comboMultiplier = 1;
};

// --- SCENE 1: START SCREEN ---
const drawStartScreen = function() {
    ctx.fillStyle = "rgb(18, 14, 36)";
    ctx.fillRect(0, 0, 400, 400);
    
    animTimer += 0.5; 
    let offset = animTimer % 40;
    
    ctx.strokeStyle = "rgb(35, 28, 66)";
    ctx.lineWidth = 2;
    for (let gridX = -40; gridX < 440; gridX += 40) {
        ctx.beginPath();
        ctx.moveTo(gridX - offset, 0);
        ctx.lineTo(gridX - offset, 400);
        ctx.stroke();
    }
    for (let gridY = 0; gridY < 400; gridY += 40) {
        ctx.beginPath();
        ctx.moveTo(0, gridY);
        ctx.lineTo(400, gridY);
        ctx.stroke();
    }
    
    ctx.fillStyle = "rgb(255, 46, 144)";
    ctx.font = "bold 38px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("SHAPE TAPER", 200, 110);
    
    ctx.font = "bold 16px sans-serif";
    ctx.fillStyle = "rgb(255, 200, 0)";
    ctx.fillText("⚠️ WARNING: INSANE MODE ACTIVE ⚠️", 200, 165);
    
    ctx.font = "14px sans-serif";
    ctx.fillStyle = "rgb(170, 160, 210)";
    ctx.fillText("Maintain streaks to activate the score multiplier!", 200, 200);
    ctx.fillText("Don't miss or your combo clears!", 200, 225);
    
    ctx.fillStyle = "rgb(255, 46, 144)";
    ctx.beginPath();
    ctx.roundRect(125, 270, 150, 50, 12);
    ctx.fill();
    
    ctx.fillStyle = "rgb(255, 255, 255)";
    ctx.font = "bold 20px sans-serif";
    ctx.fillText("BEGIN", 200, 295);
};

// --- SCENE 2: ACTIVE GAMEPLAY ---
const drawActualGame = function() {
    let newRecordActive = score > highScore && highScore > 0;

    if (score > highScore) {
        highScore = score;
    }

    if (gameTimer <= 0) {
        if (newRecordActive || (score > 0 && highScore === score)) {
            currentScene = "highscore";
        } else {
            currentScene = "timesup";
        }
        return;
    }

    ctx.fillStyle = "rgb(18, 14, 36)";
    ctx.fillRect(0, 0, 400, 400);
    gameTimer--;

    bgScrollTimer += 1 * gameSpeed;
    let stripeOffset = bgScrollTimer % 60;
    
    ctx.fillStyle = "rgb(24, 19, 48)"; 
    for (let stripeX = -60; stripeX < 460; stripeX += 60) {
        ctx.fillRect(stripeX + stripeOffset, 0, 20, 400);
    }

    x += dxSign * 4.5 * gameSpeed; 
    y += dySign * 5.5 * gameSpeed; 

    g -= sizeDir * 4.5 * gameSpeed; 
    e -= sizeDir * 3.5 * gameSpeed; 

    if (Math.random() < 0.02) {
        dxSign *= -1;
        if (Math.random() < 0.5) dySign *= -1;
    }

    if (g <= 10 || e <= 10) { sizeDir = -1; }
    if (g >= 250 || e >= 150) { sizeDir = 1; }

    if (x < 30) { x = 30; dxSign = 1; } 
    else if (x > 370) { x = 370; dxSign = -1; }

    if (y < 60) { y = 60; dySign = 1; } 
    else if (y > 370) { y = 370; dySign = -1; }

    fillR = map(g, 20, 250, 100, 255);
    fillG = map(g, 20, 250, 255, 46);
    fillB = map(g, 20, 250, 200, 144);

    let renderX = x;
    let renderY = y;
    if (gameSpeed > 2.2) {
        let shakeIntensity = Math.min(18, (gameSpeed - 2.2) * 6);
        renderX += (Math.random() - 0.5) * shakeIntensity;
        renderY += (Math.random() - 0.5) * shakeIntensity;
    }

    ctx.fillStyle = `rgb(${Math.max(0, Math.min(255, Math.floor(fillR)))}, ${Math.max(0, Math.min(255, Math.floor(fillG)))}, ${Math.max(0, Math.min(255, Math.floor(fillB)))})`;
    ctx.beginPath();
    ctx.ellipse(renderX, renderY, Math.max(2, g / 2), Math.max(2, e / 2), 0, 0, Math.PI * 2);
    ctx.fill();

    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= 5; 
        ctx.fillStyle = `rgba(${Math.floor(p.r)}, ${Math.floor(p.g)}, ${Math.floor(p.b)}, ${p.alpha / 255})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
        if (p.alpha <= 0) { particles.splice(i, 1); }
    }

    let meterWidth = 240;
    let meterX = 80;
    let meterY = 24;
    
    ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
    ctx.beginPath();
    ctx.roundRect(meterX, meterY, meterWidth, 10, 5);
    ctx.fill();

    let fillRatio = highScore > 0 ? score / highScore : 1;
    let computedFillWidth = Math.min(meterWidth, meterWidth * fillRatio);

    if (newRecordActive || (score === highScore && score > 0)) {
        let hue = (performance.now() / 4) % 360;
        ctx.fillStyle = `hsl(${hue}, 100%, 60%)`;
        ctx.shadowColor = `hsl(${hue}, 100%, 65%)`;
        ctx.shadowBlur = 10;
    } else {
        ctx.fillStyle = "rgb(0, 245, 255)";
        ctx.shadowColor = "rgb(0, 245, 255)";
        ctx.shadowBlur = 6;
    }

    if (computedFillWidth > 0) {
        ctx.beginPath();
        ctx.roundRect(meterX, meterY, computedFillWidth, 10, 5);
        ctx.fill();
    }
    ctx.shadowBlur = 0; 

    if (flashAlpha > 0) {
        ctx.fillStyle = `rgba(255, 0, 50, ${flashAlpha})`;
        ctx.fillRect(0, 0, 400, 400);
        flashAlpha -= 0.08; 
    }

    // HUD Text Layer
    ctx.fillStyle = "rgb(255, 255, 255)";
    ctx.font = "bold 16px sans-serif";
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillText("Score: " + score, 15, 20);
    ctx.textAlign = "right";
    ctx.fillText(Math.ceil(gameTimer / 60) + "s", 385, 20);

    // --- NEW RENDER: FLOATING NEON COMBO STREAK DISPLAY ---
    if (comboStreak >= 2) {
        ctx.textAlign = "left";
        let comboHue = (performance.now() / 2) % 360;
        ctx.fillStyle = `hsl(${comboHue}, 100%, 65%)`;
        ctx.font = "italic bold 13px sans-serif";
        ctx.fillText(`Combo x${comboMultiplier} (${comboStreak} Streak!)`, 15, 42);
    }
};
// --- SCENE 3: TIMES UP SCREEN (ANIMATED) ---
const drawTimesUpScreen = function() {
    ctx.fillStyle = "rgb(20, 10, 12)";
    ctx.fillRect(0, 0, 400, 400);
    
    animTimer += 0.5;

    ctx.strokeStyle = "rgba(255, 50, 50, 0.04)";
    ctx.lineWidth = 4;
    let waveOffset = (animTimer * 4) % 80;
    for (let rowY = -80; rowY < 400; rowY += 40) {
        ctx.beginPath();
        ctx.moveTo(0, rowY + waveOffset);
        ctx.lineTo(400, rowY + waveOffset);
        ctx.stroke();
    }

    let pulseVignette = 15 + Math.sin(animTimer * 0.15) * 8;
    ctx.fillStyle = "rgba(255, 0, 50, 0.03)";
    ctx.fillRect(pulseVignette, pulseVignette, 400 - (pulseVignette * 2), 400 - (pulseVignette * 2));

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    
    let textShakeX = 200;
    let textShakeY = 120;
    if (Math.random() < 0.15) {
        textShakeX += (Math.random() - 0.5) * 6;
        textShakeY += (Math.random() - 0.5) * 6;
    }

    ctx.fillStyle = "rgb(255, 60, 80)";
    ctx.font = "bold 42px sans-serif";
    ctx.shadowColor = "rgba(255, 0, 0, 0.6)";
    ctx.shadowBlur = 12;
    ctx.fillText("GAME OVER", textShakeX, textShakeY);
    ctx.shadowBlur = 0; 
    
    ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
    ctx.fillRect(60, 175, 280, 70);

    ctx.fillStyle = "rgb(200, 190, 200)";
    ctx.font = "14px sans-serif";
    ctx.fillText("FINAL SCORE", 200, 195);
    ctx.fillStyle = "rgb(255, 255, 255)";
    ctx.font = "bold 22px sans-serif";
    ctx.fillText(score + " POINTS", 200, 225);
    
    ctx.fillStyle = "rgb(0, 245, 255)";
    ctx.shadowColor = "rgba(0, 245, 255, 0.3)";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.roundRect(125, 285, 150, 50, 15);
    ctx.fill();
    ctx.shadowBlur = 0;
    
    ctx.fillStyle = "rgb(18, 14, 36)";
    ctx.font = "bold 16px sans-serif";
    ctx.fillText("TRY AGAIN", 200, 310);
};

// --- SCENE 4: NEW HIGH SCORE SCREEN (POLISHED) ---
const drawHighScoreScreen = function() {
    ctx.fillStyle = "rgb(9, 18, 16)";
    ctx.fillRect(0, 0, 400, 400);
    
    animTimer += 0.4;
    
    ctx.strokeStyle = "rgba(0, 255, 150, 0.05)";
    ctx.lineWidth = 3;
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
        let beamX = 200 + Math.cos(angle + animTimer * 0.02) * 300;
        let beamY = 110 + Math.sin(angle + animTimer * 0.02) * 300;
        ctx.beginPath();
        ctx.moveTo(200, 110);
        ctx.lineTo(beamX, beamY);
        ctx.stroke();
    }
    
    let pulseScale = 1 + Math.sin(animTimer * 0.1) * 0.04;
    ctx.fillStyle = "rgba(255, 200, 0, 0.1)";
    ctx.beginPath();
    ctx.arc(200, 110, 65 * pulseScale, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = "rgb(0, 255, 150)";
    ctx.font = "bold 34px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    
    ctx.shadowColor = "rgba(0, 255, 150, 0.5)";
    ctx.shadowBlur = 15;
    ctx.fillText("NEW RECORD!", 200, 110);
    ctx.shadowBlur = 0;
    
    ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
    ctx.fillRect(50, 175, 300, 68);
    
    ctx.fillStyle = "rgb(255, 255, 255)";
    ctx.font = "14px sans-serif";
    ctx.fillText("PREVIOUS RECORD CLEARED", 200, 192);
    
    ctx.fillStyle = "rgb(255, 215, 0)"; 
    ctx.font = "bold 28px sans-serif";
    ctx.fillText(score + " PTS", 200, 222);
    
    ctx.fillStyle = "rgb(255, 46, 144)";
    ctx.shadowColor = "rgba(255, 46, 144, 0.4)";
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.roundRect(125, 285, 150, 50, 15);
    ctx.fill();
    ctx.shadowBlur = 0;
    
    ctx.fillStyle = "rgb(255, 255, 255)";
    ctx.font = "bold 16px sans-serif";
    ctx.fillText("CONTINUE", 200, 310);
};

// --- STRICT 30 FPS GAME LOOP CONTROLLER ---
let lastTime = performance.now();
const fpsInterval = 1000 / 30; 

function gameLoop(currentTime) {
    requestAnimationFrame(gameLoop);

    const elapsed = currentTime - lastTime;

    if (elapsed >= fpsInterval) {
        lastTime = currentTime - (elapsed % fpsInterval);

        if (currentScene === "start") {
            drawStartScreen();
        } else if (currentScene === "game") {
            drawActualGame();
        } else if (currentScene === "timesup") {
            drawTimesUpScreen();
        } else if (currentScene === "highscore") {
            drawHighScoreScreen();
        }
    }
}

// --- INTERACTIVE PROCESSING-BASED MOUSE INPUTS ---
canvas.addEventListener("click", function(event) {
    initAudio(); 

    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    if (currentScene === "start") {
        if (mouseX > 125 && mouseX < 275 && mouseY > 260 && mouseY < 310) {
            resetGame();
            currentScene = "game";
        }
    } else if (currentScene === "game") {
        const rx = g / 2;
        const ry = e / 2;
        const dx = mouseX - x;
        const dy = mouseY - y;
        const insideEllipse = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1;

        if (insideEllipse) {
            // --- COMBO MATH SYSTEM BOOST ---
            comboStreak++;
            // Multiplier steps up every 4 clean hits up to a max of 5x
            comboMultiplier = Math.min(5, 1 + Math.floor(comboStreak / 4));

            // Award multiplied points
            score += 10 * comboMultiplier;
            gameSpeed += 0.50; 
            
            if (score > highScore && highScore > 0) {
                playSound("record");
            } else {
                playSound("hit");
            }

            for (let i = 0; i < 20; i++) { 
                particles.push({
                    x: mouseX,
                    y: mouseY,
                    vx: (Math.random() - 0.5) * 12,
                    vy: (Math.random() - 0.5) * 12,
                    size: Math.random() * 5 + 3,
                    alpha: 255,
                    r: fillR,
                    g: fillG,
                    b: fillB
                });
            }
        } else {
            // --- RESET COMBO STATUS ON ERROR ---
            comboStreak = 0;
            comboMultiplier = 1;

            score = Math.max(0, score - 20); 
            gameSpeed = Math.max(0.6, gameSpeed - 0.3); 
            flashAlpha = 0.4; 
            playSound("miss"); 
        }
    } else if (currentScene === "timesup" || currentScene === "highscore") {
        if (mouseX > 125 && mouseX < 275 && mouseY > 285 && mouseY < 335) {
            resetGame();
            currentScene = "game";
        }
    }
});

requestAnimationFrame(gameLoop);
