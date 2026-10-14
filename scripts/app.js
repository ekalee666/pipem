/* =============================================
   SKULL FIRE SPEEDOMETER — app.js
   Compatible: JG-Works Garage custom speedometer
   ============================================= */

'use strict';

// ─── Constants ───────────────────────────────────────────────────────────────
const DEG           = Math.PI / 180;
const TWO_PI        = Math.PI * 2;
const SPEED_DECAY   = 7.5;
const RPM_DECAY     = 7.5;
const LERP_THRESHOLD = 0.15;
const BASE_W        = 310;
const BASE_H        = 180;

// Speedometer dial geometry
const S_CX = 110, S_CY = 112;
const S_MAIN_R   = 88;
const S_ARC_R    = 80.7;
const S_TICK_OUT = 88;
const S_TICK_MAJ = 79.2;
const S_TICK_MIN = 80.7;
const S_LABEL_R  = 67;
const S_NEEDLE_L = 77;
const S_CAP_OUT  = 7.3;
const S_CAP_IN   = 3.7;
const S_NEEDLE_W = 2.57;

// RPM dial geometry
const R_CX = 235, R_CY = 90;
const R_MAIN_R   = 60;
const R_ARC_R    = 52.5;
const R_TICK_OUT = 60;
const R_TICK_IN  = 54;
const R_LABEL_R  = 46;
const R_NEEDLE_L = 56;
const R_CAP_OUT  = 7.5;
const R_CAP_IN   = 3.75;
const R_NEEDLE_W = 2.1;
const R_UNIT_Y   = 123.75;
const R_MULT_Y   = 132.75;

// ─── State ───────────────────────────────────────────────────────────────────
let currentSpeed    = 0;
let currentRpm      = 0;
let currentFuel     = 1.0;
let currentHealth   = 1.0;
let currentGear     = 0;
let currentEngine   = false;
let currentHeadlights = 0;
let leftIndicator   = false;
let rightIndicator  = false;
let seatbeltFastened = false;
let currentOdometer = 0;

let targetSpeedAngle  = -110;
let displaySpeedAngle = -110;
let targetRpmAngle    = -110;
let displayRpmAngle   = -110;
let animRunning = false;
let lastFrame   = 0;
let renderDirty = true;

let mainCanvas, mainCtx, bgCanvas, bgCtx;
let dashboardEl = null;
let currentScale = 1.0;

const EL = {};
const blinkTimers = {};

// ─── Speed background stages ─────────────────────────────────────────────────
// Use CSS gradient overlays as fire "stages" — no external PNG needed.
// Each stage changes the background color wash behind the dials.
const FIRE_STAGES = [
    { max: 1,        color: 'rgba(0,0,0,0)'           },
    { max: 30,       color: 'rgba(80,10,0,0.18)'      },
    { max: 60,       color: 'rgba(140,30,0,0.22)'     },
    { max: 90,       color: 'rgba(200,60,0,0.26)'     },
    { max: 120,      color: 'rgba(230,90,0,0.30)'     },
    { max: Infinity, color: 'rgba(255,120,0,0.36)'    },
];
let currentFireStage = -1;

function applyFireStage(mph) {
    const idx = FIRE_STAGES.findIndex(s => mph <= s.max);
    if (idx === currentFireStage) return;
    currentFireStage = idx;
    const layer = document.getElementById('speed-bg-speed');
    if (!layer) return;
    layer.style.background = FIRE_STAGES[idx].color;
    layer.classList.add('active');
}

// ─── Sound Engine ─────────────────────────────────────────────────────────────
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;
let engineGain = null;
let engineOsc  = null;
let lastGearForSound = -1;

function initAudio() {
    if (audioCtx) return;
    try {
        audioCtx = new AudioCtx();
        // Master gain
        engineGain = audioCtx.createGain();
        engineGain.gain.value = 0;
        engineGain.connect(audioCtx.destination);
    } catch (e) {
        console.warn('[SKULL SPEEDO] Web Audio not available:', e);
    }
}

function resumeAudio() {
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}

// Engine rumble sound — pitch follows RPM
function updateEngineSound(rpm, engineOn) {
    if (!audioCtx) return;
    resumeAudio();

    if (!engineOn) {
        if (engineGain) engineGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.3);
        if (engineOsc) {
            try { engineOsc.stop(); } catch (_) {}
            engineOsc = null;
        }
        return;
    }

    const freq      = 40 + rpm * 160;   // 40–200 Hz
    const vol       = 0.04 + rpm * 0.1; // subtle

    if (!engineOsc) {
        engineOsc = audioCtx.createOscillator();
        engineOsc.type = 'sawtooth';
        engineOsc.frequency.value = freq;

        // Distortion for grittiness
        const waveShaper = audioCtx.createWaveShaper();
        const curve = new Float32Array(256);
        for (let i = 0; i < 256; i++) {
            const x = (i * 2) / 256 - 1;
            curve[i] = (Math.PI + 80) * x / (Math.PI + 80 * Math.abs(x));
        }
        waveShaper.curve = curve;

        // Low-pass filter to soften
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 400;
        filter.Q.value = 1.2;

        engineOsc.connect(waveShaper);
        waveShaper.connect(filter);
        filter.connect(engineGain);
        engineOsc.start();
    }

    engineOsc.frequency.setTargetAtTime(freq, audioCtx.currentTime, 0.08);
    engineGain.gain.setTargetAtTime(vol, audioCtx.currentTime, 0.1);
}

// Gear shift click sound
function playGearShift(up) {
    if (!audioCtx) return;
    resumeAudio();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.connect(g);
    g.connect(audioCtx.destination);
    o.type = 'square';
    o.frequency.setValueAtTime(up ? 520 : 320, audioCtx.currentTime);
    o.frequency.exponentialRampToValueAtTime(up ? 180 : 120, audioCtx.currentTime + 0.06);
    g.gain.setValueAtTime(0.15, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
    o.start();
    o.stop(audioCtx.currentTime + 0.12);
}

// Redline warning beep
function playRedlineBeep() {
    if (!audioCtx) return;
    resumeAudio();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.connect(g);
    g.connect(audioCtx.destination);
    o.type = 'sine';
    o.frequency.value = 1200;
    g.gain.setValueAtTime(0.12, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
    o.start();
    o.stop(audioCtx.currentTime + 0.09);
}

// Seatbelt warning chime
function playSeatbeltChime() {
    if (!audioCtx) return;
    resumeAudio();
    [880, 1100, 880].forEach((freq, i) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.connect(g);
        g.connect(audioCtx.destination);
        o.type = 'sine';
        o.frequency.value = freq;
        const t = audioCtx.currentTime + i * 0.18;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.1, t + 0.05);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        o.start(t);
        o.stop(t + 0.17);
    });
}

let redlinePlayed = false;

// ─── Canvas helpers ───────────────────────────────────────────────────────────
function d2c(dialDeg) { return (dialDeg - 90) * DEG; }

function drawDialBg(ctx, cx, cy, r) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TWO_PI);
    ctx.fillStyle = 'rgba(8,2,0,0.72)';
    ctx.fill();
}

function drawZoneArcs(ctx, cx, cy, arcR, zones, lw) {
    ctx.lineCap = 'round';
    ctx.lineWidth = lw;
    zones.forEach(z => {
        ctx.beginPath();
        ctx.arc(cx, cy, arcR, d2c(z.start), d2c(z.end), false);
        ctx.strokeStyle = z.color;
        ctx.globalAlpha = z.alpha;
        ctx.stroke();
    });
    ctx.globalAlpha = 1;
}

function drawTicks(ctx, cx, cy, outerR, majIn, minIn, ticks) {
    ticks.forEach(t => {
        const rad = t.angle * DEG;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rad);
        ctx.beginPath();
        ctx.moveTo(0, -outerR);
        ctx.lineTo(0, -(t.major ? majIn : minIn));
        ctx.strokeStyle = t.major ? 'rgba(255,180,100,0.55)' : 'rgba(255,100,50,0.25)';
        ctx.lineWidth   = t.major ? 1.47 : 0.73;
        ctx.lineCap = 'butt';
        ctx.stroke();
        ctx.restore();
    });
}

function drawLabels(ctx, cx, cy, labelR, labels, font, defColor) {
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    labels.forEach(l => {
        const rad = l.angle * DEG;
        const lx  = cx + labelR * Math.sin(rad);
        const ly  = cy - labelR * Math.cos(rad);
        ctx.fillStyle = l.color || defColor;
        ctx.fillText(l.text, lx, ly);
    });
}

// ─── Draw skull on canvas ─────────────────────────────────────────────────────
function drawSkull(ctx, cx, cy, size, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);

    const s = size;

    // Skull cranium
    ctx.beginPath();
    ctx.arc(0, -s * 0.05, s * 0.42, Math.PI, 0, false);
    ctx.lineTo(s * 0.28,  s * 0.32);
    ctx.lineTo(s * 0.12,  s * 0.32);
    ctx.lineTo(s * 0.12,  s * 0.18);
    ctx.lineTo(-s * 0.12, s * 0.18);
    ctx.lineTo(-s * 0.12, s * 0.32);
    ctx.lineTo(-s * 0.28, s * 0.32);
    ctx.closePath();

    const grad = ctx.createRadialGradient(0, -s * 0.1, s * 0.05, 0, -s * 0.05, s * 0.44);
    grad.addColorStop(0,   'rgba(255,160,80,0.9)');
    grad.addColorStop(0.5, 'rgba(220,80,20,0.7)');
    grad.addColorStop(1,   'rgba(150,30,0,0.4)');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,100,0,0.6)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Left eye socket
    ctx.beginPath();
    ctx.ellipse(-s * 0.14, -s * 0.06, s * 0.1, s * 0.12, -0.1, 0, TWO_PI);
    ctx.fillStyle = 'rgba(5,0,0,0.92)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,60,0,0.5)';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // Right eye socket
    ctx.beginPath();
    ctx.ellipse(s * 0.14, -s * 0.06, s * 0.1, s * 0.12, 0.1, 0, TWO_PI);
    ctx.fillStyle = 'rgba(5,0,0,0.92)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,60,0,0.5)';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // Eye glow (inner flame)
    const eyeGlow = ctx.createRadialGradient(-s*0.14, -s*0.06, 0, -s*0.14, -s*0.06, s*0.08);
    eyeGlow.addColorStop(0,   'rgba(255,200,0,0.7)');
    eyeGlow.addColorStop(0.5, 'rgba(255,80,0,0.4)');
    eyeGlow.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.beginPath();
    ctx.ellipse(-s*0.14, -s*0.06, s*0.07, s*0.09, -0.1, 0, TWO_PI);
    ctx.fillStyle = eyeGlow;
    ctx.fill();

    const eyeGlow2 = ctx.createRadialGradient(s*0.14, -s*0.06, 0, s*0.14, -s*0.06, s*0.08);
    eyeGlow2.addColorStop(0,   'rgba(255,200,0,0.7)');
    eyeGlow2.addColorStop(0.5, 'rgba(255,80,0,0.4)');
    eyeGlow2.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.beginPath();
    ctx.ellipse(s*0.14, -s*0.06, s*0.07, s*0.09, 0.1, 0, TWO_PI);
    ctx.fillStyle = eyeGlow2;
    ctx.fill();

    // Nose cavity
    ctx.beginPath();
    ctx.moveTo(0, s * 0.08);
    ctx.lineTo(-s * 0.06, s * 0.18);
    ctx.lineTo(s * 0.06, s * 0.18);
    ctx.closePath();
    ctx.fillStyle = 'rgba(5,0,0,0.85)';
    ctx.fill();

    // Teeth (3 pairs)
    const teethY = s * 0.28;
    for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.rect(i * s * 0.09 - s * 0.035, teethY - s * 0.04, s * 0.07, s * 0.1);
        ctx.fillStyle = 'rgba(255,220,180,0.7)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(200,80,0,0.5)';
        ctx.lineWidth = 0.6;
        ctx.stroke();
    }

    ctx.restore();
}

// ─── Draw static buffer (background layer) ───────────────────────────────────
function drawStaticBuffer() {
    if (!bgCtx) return;
    bgCtx.clearRect(0, 0, BASE_W, BASE_H);

    // === Speedometer dial BG ===
    drawDialBg(bgCtx, S_CX, S_CY, S_MAIN_R);

    // Dial rim
    bgCtx.beginPath();
    bgCtx.arc(S_CX, S_CY, S_MAIN_R, 0, TWO_PI);
    bgCtx.strokeStyle = 'rgba(0,0,0,0.75)';
    bgCtx.lineWidth = 2.6;
    bgCtx.stroke();
    bgCtx.strokeStyle = 'rgba(255,100,30,0.35)';
    bgCtx.lineWidth = 1.6;
    bgCtx.stroke();

    // Skull in center
    drawSkull(bgCtx, S_CX, S_CY - 10, 26, 0.22);

    // Zone arcs
    drawZoneArcs(bgCtx, S_CX, S_CY, S_ARC_R, [
        { start: -110, end:  20, color: '#ff4400', alpha: 0.45 },
        { start:   20, end:  70, color: '#ff7700', alpha: 0.55 },
        { start:   70, end: 110, color: '#ff0000', alpha: 0.80 },
    ], 2.93);

    // Ticks
    const sTicks = [];
    for (let mph = 0; mph <= 200; mph += 20)
        sTicks.push({ angle: mph * 1.1 - 110, major: mph % 40 === 0 });
    drawTicks(bgCtx, S_CX, S_CY, S_TICK_OUT, S_TICK_MAJ, S_TICK_MIN, sTicks);

    // Labels
    const sLabels = [];
    for (let mph = 0; mph <= 200; mph += 40)
        sLabels.push({ angle: mph * 1.1 - 110, text: '' + mph });
    drawLabels(bgCtx, S_CX, S_CY, S_LABEL_R, sLabels,
        'bold 7px Orbitron, monospace', 'rgba(255,150,80,0.6)');

    // === RPM dial (clipped outside speedo circle) ===
    bgCtx.save();
    bgCtx.beginPath();
    bgCtx.rect(0, 0, BASE_W, BASE_H);
    bgCtx.arc(S_CX, S_CY, S_MAIN_R, 0, TWO_PI, true);
    bgCtx.clip();

    drawDialBg(bgCtx, R_CX, R_CY, R_MAIN_R);

    bgCtx.beginPath();
    bgCtx.arc(R_CX, R_CY, R_MAIN_R, 0, TWO_PI);
    bgCtx.strokeStyle = 'rgba(0,0,0,0.75)';
    bgCtx.lineWidth = 2.6;
    bgCtx.stroke();
    bgCtx.strokeStyle = 'rgba(255,80,20,0.3)';
    bgCtx.lineWidth = 1.6;
    bgCtx.stroke();

    // Skull (small, in RPM dial)
    drawSkull(bgCtx, R_CX, R_CY - 8, 16, 0.18);

    drawZoneArcs(bgCtx, R_CX, R_CY, R_ARC_R, [
        { start: 70, end: 110, color: '#ff0000', alpha: 0.85 },
    ], 2.25);

    const rTicks = [];
    for (let v = 0; v <= 11; v++)
        rTicks.push({ angle: v * 20 - 110, major: true });
    drawTicks(bgCtx, R_CX, R_CY, R_TICK_OUT, R_TICK_IN, R_TICK_IN, rTicks);

    const rLabels = [];
    for (let v = 3; v <= 11; v++)
        rLabels.push({ angle: v * 20 - 110, text: '' + v, color: v >= 8 ? '#ff3300' : undefined });
    drawLabels(bgCtx, R_CX, R_CY, R_LABEL_R, rLabels,
        'bold 7px Orbitron, monospace', 'rgba(255,130,60,0.55)');

    bgCtx.font = 'bold 7px Orbitron, monospace';
    bgCtx.fillStyle = 'rgba(255,120,50,0.65)';
    bgCtx.textAlign = 'center';
    bgCtx.textBaseline = 'middle';
    bgCtx.fillText('RPM', R_CX, R_UNIT_Y);
    bgCtx.font = '5px Orbitron, monospace';
    bgCtx.fillStyle = 'rgba(255,100,40,0.35)';
    bgCtx.fillText('x1000', R_CX, R_MULT_Y);

    bgCtx.restore();
}

// ─── Draw fire needle ─────────────────────────────────────────────────────────
function drawNeedle(ctx, cx, cy, angleDeg, len, strokeW, capOut, capIn) {
    const rad = angleDeg * DEG;

    // Needle glow
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rad);
    ctx.shadowColor  = 'rgba(255,80,0,0.9)';
    ctx.shadowBlur   = 8;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -len);
    ctx.strokeStyle = 'url(#needleGrad)';

    // Fire gradient along needle
    const ng = ctx.createLinearGradient(0, 0, 0, -len);
    ng.addColorStop(0,   '#ff8800');
    ng.addColorStop(0.5, '#ff4400');
    ng.addColorStop(1,   '#ffcc00');
    ctx.strokeStyle = ng;
    ctx.lineWidth   = strokeW;
    ctx.lineCap     = 'round';
    ctx.stroke();
    ctx.restore();

    // Cap outer
    ctx.beginPath();
    ctx.arc(cx, cy, capOut, 0, TWO_PI);
    ctx.fillStyle = '#0e0500';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,100,30,0.35)';
    ctx.lineWidth = 0.75;
    ctx.stroke();

    // Cap inner (fire dot)
    ctx.beginPath();
    ctx.arc(cx, cy, capIn, 0, TWO_PI);
    const capGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, capIn);
    capGrad.addColorStop(0,   '#ffcc00');
    capGrad.addColorStop(0.5, '#ff6600');
    capGrad.addColorStop(1,   '#ff2200');
    ctx.fillStyle = capGrad;
    ctx.fill();
}

// ─── Render frame ─────────────────────────────────────────────────────────────
function renderFrame() {
    if (!renderDirty || !bgCanvas) return;
    renderDirty = false;

    mainCtx.clearRect(0, 0, BASE_W, BASE_H);
    mainCtx.drawImage(bgCanvas, 0, 0, BASE_W, BASE_H);

    // RPM needle (clipped outside speedo)
    mainCtx.save();
    mainCtx.beginPath();
    mainCtx.rect(0, 0, BASE_W, BASE_H);
    mainCtx.arc(S_CX, S_CY, S_MAIN_R, 0, TWO_PI, true);
    mainCtx.clip();
    drawNeedle(mainCtx, R_CX, R_CY, displayRpmAngle, R_NEEDLE_L, R_NEEDLE_W, R_CAP_OUT, R_CAP_IN);
    mainCtx.restore();

    // Gear in center of speedo
    mainCtx.save();
    mainCtx.font = '900 18px Orbitron, monospace';
    mainCtx.textAlign = 'center';
    mainCtx.textBaseline = 'middle';
    mainCtx.shadowColor = 'rgba(255,80,0,0.9)';
    mainCtx.shadowBlur  = 10;
    const g = currentGear;
    const gText = g === 0 ? 'N' : (g === -1 ? 'R' : g.toString());
    mainCtx.fillStyle = g === 0 ? '#66aaff' : g >= 5 ? '#ff3300' : '#ffdd00';
    mainCtx.fillText(gText, S_CX, S_CY + 55);
    mainCtx.restore();

    // Speed needle
    drawNeedle(mainCtx, S_CX, S_CY, displaySpeedAngle, S_NEEDLE_L, S_NEEDLE_W, S_CAP_OUT, S_CAP_IN);
}

// ─── Animation loop ───────────────────────────────────────────────────────────
function animateNeedles(ts) {
    const dt    = Math.min((ts - lastFrame) / 1000, 0.1);
    lastFrame   = ts;
    let dirty   = false;

    const sf    = SPEED_DECAY * dt / (1 + SPEED_DECAY * dt);
    const sd    = targetSpeedAngle - displaySpeedAngle;
    if (Math.abs(sd) > LERP_THRESHOLD) { displaySpeedAngle += sd * sf; dirty = true; }
    else if (displaySpeedAngle !== targetSpeedAngle) { displaySpeedAngle = targetSpeedAngle; dirty = true; }

    const rf    = RPM_DECAY * dt / (1 + RPM_DECAY * dt);
    const rd    = targetRpmAngle - displayRpmAngle;
    if (Math.abs(rd) > LERP_THRESHOLD) { displayRpmAngle += rd * rf; dirty = true; }
    else if (displayRpmAngle !== targetRpmAngle) { displayRpmAngle = targetRpmAngle; dirty = true; }

    if (dirty) { renderDirty = true; renderFrame(); requestAnimationFrame(animateNeedles); }
    else animRunning = false;
}

function startAnim() {
    if (!animRunning) {
        animRunning = true;
        lastFrame   = performance.now();
        requestAnimationFrame(animateNeedles);
    }
}

// ─── Blink helpers ────────────────────────────────────────────────────────────
function startBlink(el, ms) {
    if (!el || blinkTimers[el.id]) return;
    let v = true;
    blinkTimers[el.id] = setInterval(() => {
        v = !v;
        el.style.opacity = v ? '1' : '0.15';
    }, ms);
}

function stopBlink(el) {
    if (!el || !blinkTimers[el.id]) return;
    clearInterval(blinkTimers[el.id]);
    delete blinkTimers[el.id];
    el.style.opacity = '';
}

// ─── Speed display helper ─────────────────────────────────────────────────────
function updateSpeedDisplay(mph) {
    if (!EL.speedDisplay) return;
    EL.speedDisplay.textContent = mph;

    // Color state
    EL.speedDisplay.classList.remove('s-slow','s-med','s-fast','s-max');
    if      (mph < 50)  EL.speedDisplay.classList.add('s-slow');
    else if (mph < 100) EL.speedDisplay.classList.add('s-med');
    else if (mph < 150) EL.speedDisplay.classList.add('s-fast');
    else                EL.speedDisplay.classList.add('s-max');

    // Redline sound
    if (mph >= 150 && !redlinePlayed) {
        playRedlineBeep();
        redlinePlayed = true;
    } else if (mph < 140) {
        redlinePlayed = false;
    }

    applyFireStage(mph);
}

// ─── Bar helper ───────────────────────────────────────────────────────────────
function updateBar(fillEl, textEl, ratio) {
    if (!fillEl || !textEl) return;
    const pct = Math.max(0, Math.min(1, ratio));
    fillEl.style.width = (pct * 100).toFixed(1) + '%';
    textEl.textContent = Math.round(pct * 100) + '%';
    if (pct <= 0.15) fillEl.classList.add('low');
    else             fillEl.classList.remove('low');
}

// =============================================
// GLOBAL FUNCTIONS — JG-Works calls these
// =============================================

function setEngine(state) {
    initAudio();
    currentEngine = !!state;
    if (EL.indicatorEngine) EL.indicatorEngine.classList.toggle('on', currentEngine);
    updateEngineSound(currentRpm, currentEngine);
}

function setSpeed(speed) {
    initAudio();
    currentSpeed = Number(speed) || 0;
    const mph    = Math.round(currentSpeed * 2.236936);
    updateSpeedDisplay(mph);
    const angle  = Math.min(Math.max(mph, 0), 200) * 1.1 - 110;
    targetSpeedAngle = isNaN(angle) ? -110 : angle;
    startAnim();
}

function setRPM(rpm) {
    currentRpm = Number(rpm) || 0;
    const angle = Math.min(Math.max(currentRpm * 10, 0), 11) * 20 - 110;
    targetRpmAngle = isNaN(angle) ? -110 : angle;
    updateEngineSound(currentRpm, currentEngine);
    startAnim();
}

function setFuel(fuel) {
    const n = Number(fuel);
    currentFuel = isNaN(n) ? 0 : (n > 1 ? n / 100 : n);
    updateBar(EL.fuelFill, EL.fuelText, currentFuel);
}

function setHealth(health) {
    const n = Number(health);
    currentHealth = isNaN(n) ? 0 : (n > 1 ? n / 100 : n);
    updateBar(EL.healthFill, EL.healthText, currentHealth);
}

function setGear(gear) {
    const g = Number(gear) || 0;
    if (g !== currentGear) {
        const up = g > currentGear;
        if (currentGear !== -1) playGearShift(up);
    }
    currentGear = g;
    renderDirty = true;
    renderFrame();
}

function setHeadlights(state) {
    currentHeadlights = Number(state) || 0;
    if (!EL.indicatorHeadlights) return;
    EL.indicatorHeadlights.classList.remove('on', 'glow-high');
    if (currentHeadlights === 1)      EL.indicatorHeadlights.classList.add('on');
    else if (currentHeadlights >= 2)  EL.indicatorHeadlights.classList.add('glow-high');
}

function setLeftIndicator(state) {
    leftIndicator = !!state;
    if (!EL.indicatorLeft) return;
    EL.indicatorLeft.classList.toggle('on', leftIndicator);
    leftIndicator ? startBlink(EL.indicatorLeft, 500) : stopBlink(EL.indicatorLeft);
}

function setRightIndicator(state) {
    rightIndicator = !!state;
    if (!EL.indicatorRight) return;
    EL.indicatorRight.classList.toggle('on', rightIndicator);
    rightIndicator ? startBlink(EL.indicatorRight, 500) : stopBlink(EL.indicatorRight);
}

function setSeatbelts(state) {
    seatbeltFastened = !!state;
    if (!EL.indicatorSeatbelt) return;
    // Warning when NOT fastened
    const warn = !seatbeltFastened;
    EL.indicatorSeatbelt.classList.toggle('on', warn);
    if (warn) { startBlink(EL.indicatorSeatbelt, 600); playSeatbeltChime(); }
    else       stopBlink(EL.indicatorSeatbelt);
}

function setSpeedMode(mode) {
    // mode 0=KMH 1=MPH 2=Knots — update unit label
    const labels = ['kmh','mph','kts'];
    if (EL.speedUnit) EL.speedUnit.textContent = labels[mode] || 'mph';
}

function setOdometer(distance) {
    currentOdometer = Number(distance) || 0;
    if (EL.odometer) EL.odometer.textContent = currentOdometer.toFixed(1) + ' mi';
}

// ─── Also accept postMessage / NUI SendNUIMessage (FiveM fallback) ────────────
function toBool(v) {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number')  return v !== 0;
    if (typeof v === 'string') {
        const s = v.trim().toLowerCase();
        return !['false','0','off','no'].includes(s);
    }
    return Boolean(v);
}

function applyTelemetry(data) {
    if (!data || typeof data !== 'object') return;
    const d = data.data && typeof data.data === 'object' ? data.data : data;

    if (d.speed    !== undefined) { let s = Number(d.speed); const u = String(d.speedUnit||d.unit||'').toLowerCase(); if (u==='km/h'||u==='kmh'||u==='kph') s/=3.6; else if(u==='mph') s/=2.236936; setSpeed(s); }
    if (d.rpm      !== undefined) setRPM(d.rpm);
    if (d.fuel     !== undefined) setFuel(d.fuel);
    if (d.health   !== undefined) setHealth(d.health);
    if (d.gear     !== undefined) setGear(d.gear);
    if (d.engine   !== undefined) setEngine(toBool(d.engine));
    if (d.headlights !== undefined) setHeadlights(Number(d.headlights)||0);
    if (d.leftIndicator  !== undefined || d.left  !== undefined) setLeftIndicator(toBool(d.leftIndicator??d.left));
    if (d.rightIndicator !== undefined || d.right !== undefined) setRightIndicator(toBool(d.rightIndicator??d.right));
    if (d.seatbelt !== undefined || d.seatbeltFastened !== undefined) setSeatbelts(toBool(d.seatbelt??d.seatbeltFastened));
    if (d.odometer !== undefined) setOdometer(d.odometer);
}

window.addEventListener('message', e => {
    try {
        const data = e && e.data;
        if (!data) return;
        if (typeof data === 'string') { try { applyTelemetry(JSON.parse(data)); } catch(_){} return; }
        const action = typeof data.action === 'string' ? data.action.toLowerCase() : '';
        if (['vehicle','speedometer','update','telemetry'].includes(action) ||
            data.speed !== undefined || data.rpm !== undefined) {
            applyTelemetry(data);
        }
    } catch(e) { console.error('[SKULL SPEEDO] Message error:', e); }
});

// ─── Scale & drag ─────────────────────────────────────────────────────────────
function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const ts  = currentScale * dpr;
    mainCanvas.width  = Math.round(BASE_W * ts);
    mainCanvas.height = Math.round(BASE_H * ts);
    mainCanvas.style.width  = BASE_W + 'px';
    mainCanvas.style.height = BASE_H + 'px';
    bgCanvas.width  = Math.round(BASE_W * ts);
    bgCanvas.height = Math.round(BASE_H * ts);
    mainCtx.scale(ts, ts);
    bgCtx.scale(ts, ts);
    drawStaticBuffer();
    renderDirty = true;
    renderFrame();
}

function saveSettings() {
    if (!dashboardEl) return;
    const s = window.getComputedStyle(dashboardEl);
    localStorage.setItem('skull_speedo', JSON.stringify({
        scale: currentScale,
        left:  parseFloat(s.left)  || dashboardEl.offsetLeft,
        top:   parseFloat(s.top)   || dashboardEl.offsetTop,
    }));
}

function loadSettings() {
    dashboardEl = document.getElementById('speedometer');
    if (!dashboardEl) return;
    try {
        const s = JSON.parse(localStorage.getItem('skull_speedo'));
        if (s) {
            currentScale = typeof s.scale === 'number' ? s.scale : 1.0;
            if (typeof s.left === 'number' && typeof s.top === 'number') {
                dashboardEl.style.left   = s.left + 'px';
                dashboardEl.style.top    = s.top  + 'px';
                dashboardEl.style.bottom = 'auto';
                dashboardEl.style.right  = 'auto';
            }
            dashboardEl.style.transform       = 'scale(' + currentScale + ')';
            dashboardEl.style.transformOrigin = 'bottom right';
        }
    } catch(_) {}
}

function setupControls() {
    document.getElementById('btn-scale-up')?.addEventListener('click', e => {
        e.stopPropagation();
        currentScale = Math.min(currentScale + 0.1, 2.0);
        dashboardEl.style.transform = 'scale(' + currentScale + ')';
        saveSettings();
    });
    document.getElementById('btn-scale-down')?.addEventListener('click', e => {
        e.stopPropagation();
        currentScale = Math.max(currentScale - 0.1, 0.5);
        dashboardEl.style.transform = 'scale(' + currentScale + ')';
        saveSettings();
    });
    document.getElementById('btn-reset')?.addEventListener('click', e => {
        e.stopPropagation();
        currentScale = 1.0;
        dashboardEl.style.cssText = '';
        localStorage.removeItem('skull_speedo');
        resizeCanvas();
    });
}

function setupDrag() {
    const el = document.getElementById('speedometer');
    if (!el) return;
    let drag = false, sx = 0, sy = 0, ix = 0, iy = 0, raf = null;
    el.addEventListener('pointerdown', e => {
        if (e.target.closest('.no-drag') || e.target.closest('button')) return;
        drag = true; ix = el.offsetLeft; iy = el.offsetTop; sx = e.clientX; sy = e.clientY;
        el.setPointerCapture(e.pointerId); el.style.cursor = 'grabbing'; e.preventDefault();
    });
    el.addEventListener('pointermove', e => {
        if (!drag) return;
        const nx = e.clientX, ny = e.clientY;
        if (raf) return;
        raf = requestAnimationFrame(() => {
            el.style.left   = (ix + nx - sx) + 'px';
            el.style.top    = (iy + ny - sy) + 'px';
            el.style.bottom = 'auto'; el.style.right = 'auto'; raf = null;
        });
    });
    el.addEventListener('pointerup', e => {
        drag = false; el.releasePointerCapture(e.pointerId);
        el.style.cursor = ''; saveSettings();
    });
}

// ─── DOM Ready ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    EL.speedDisplay       = document.getElementById('speed-display');
    EL.speedUnit          = document.getElementById('speed-unit');
    EL.odometer           = document.getElementById('odometer');
    EL.fuelFill           = document.getElementById('fuel-fill');
    EL.fuelText           = document.getElementById('fuel-text');
    EL.healthFill         = document.getElementById('health-fill');
    EL.healthText         = document.getElementById('health-text');
    EL.indicatorLeft      = document.getElementById('indicator-left');
    EL.indicatorRight     = document.getElementById('indicator-right');
    EL.indicatorHeadlights= document.getElementById('indicator-headlights');
    EL.indicatorSeatbelt  = document.getElementById('indicator-seatbelt');
    EL.indicatorEngine    = document.getElementById('indicator-engine');

    mainCanvas = document.getElementById('speedo-canvas');
    mainCtx    = mainCanvas.getContext('2d');
    bgCanvas   = document.createElement('canvas');
    bgCtx      = bgCanvas.getContext('2d');

    document.fonts.ready.then(() => {
        resizeCanvas();
        setEngine(false); setSpeed(0); setRPM(0);
        setFuel(1); setHealth(1); setGear(0);
        setHeadlights(0); setSeatbelts(true);
        setOdometer(0);
    });

    loadSettings();
    setupControls();
    setupDrag();

    // Init audio on first user interaction
    document.addEventListener('click',     initAudio, { once: true });
    document.addEventListener('pointerdown', initAudio, { once: true });

    // Dev preview
    if (typeof window.invokeNative === 'undefined') {
        initAudio();
        let ps = 0, dir = 1;
        setInterval(() => {
            ps += dir * 4;
            if (ps >= 240) dir = -1;
            if (ps <= 0)   dir =  1;
            setEngine(true);
            setSpeed(ps / 3.6);
            setRPM(Math.min(1, ps / 240));
            setGear(Math.min(6, Math.max(1, Math.floor(ps / 40))));
            setFuel(0.65);
            setHealth(0.88);
            setOdometer(372.1);
        }, 50);
    }
});

// Expose API
window.SAMCSpeedo = { setSpeed, setRPM, setFuel, setHealth, setGear, setEngine, setHeadlights, setLeftIndicator, setRightIndicator, setSeatbelts, setOdometer, setSpeedMode };
