/* =========================================
   FIRE SPEEDOMETER — script.js
   ========================================= */
'use strict';

const ARC_LEN = 173; // half-ellipse path length for viewBox 120x70, r≈55

// DOM
const speedo     = document.getElementById('speedo');
const speedEl    = document.getElementById('speed-val');
const rpmPathEl  = document.getElementById('rpm-path');
const rpmValEl   = document.getElementById('rpm-val');
const rpmWrap    = document.getElementById('rpm-wrap');
const gearValEl  = document.getElementById('gear-val');
const gearWrap   = document.getElementById('gear-wrap');
const fuelFill   = document.getElementById('fuel-fill');
const fuelPct    = document.getElementById('fuel-pct');
const engFill    = document.getElementById('eng-fill');
const engPct     = document.getElementById('eng-pct');
const engineDot  = document.getElementById('engine-dot');
const engineLbl  = document.getElementById('engine-lbl');
const unitBadge  = document.getElementById('unit-badge');

// State
let visible   = false;
let useMetric = true;
let showRpm   = true;
let showGear  = true;

let curSpd    = 0;
let tgtSpd    = 0;
let rafId     = null;

// ─── Helpers ────────────────────────────────────────────────────────────────

function mpsToDisplay(mps) {
    return useMetric ? mps * 3.6 : mps * 2.237;
}

function setSpeedColor(spd) {
    const max = useMetric ? 280 : 175;
    speedEl.classList.remove('s-slow','s-med','s-fast','s-max');
    if      (spd < max * 0.25) speedEl.classList.add('s-slow');
    else if (spd < max * 0.55) speedEl.classList.add('s-med');
    else if (spd < max * 0.80) speedEl.classList.add('s-fast');
    else                        speedEl.classList.add('s-max');
}

function updateArc(rpmRatio) {
    // 270° sweep = 75% of arc
    const sweep  = ARC_LEN * 0.75;
    const offset = ARC_LEN - (Math.min(1, rpmRatio) * sweep);
    rpmPathEl.style.strokeDashoffset = offset.toFixed(2);
}

function updateBar(fillEl, pctEl, value, type) {
    const v = Math.max(0, Math.min(100, value));
    fillEl.style.width  = v + '%';
    pctEl.textContent   = v + '%';

    // colour shift when low
    if (v <= 15) {
        fillEl.style.background = 'linear-gradient(90deg,#770000,#aa0000)';
        fillEl.style.boxShadow  = '0 0 7px rgba(160,0,0,0.9)';
    } else if (v <= 35) {
        fillEl.style.background = 'linear-gradient(90deg,#cc2200,#ee4400)';
        fillEl.style.boxShadow  = '0 0 6px rgba(210,40,0,0.7)';
    } else {
        fillEl.style.background = 'linear-gradient(90deg,#ff2200,#ff6600,#ffdd00)';
        fillEl.style.boxShadow  = '0 0 6px rgba(255,100,0,0.65)';
    }
}

// ─── Smooth speed ────────────────────────────────────────────────────────────

function rafTick() {
    const diff = tgtSpd - curSpd;
    curSpd += Math.abs(diff) > 0.4 ? diff * 0.17 : diff;
    const disp = Math.round(curSpd);
    speedEl.textContent = disp;
    setSpeedColor(disp);
    rafId = requestAnimationFrame(rafTick);
}

// ─── Show / Hide ─────────────────────────────────────────────────────────────

function show() {
    visible = true;
    speedo.classList.remove('hidden');
    if (!rafId) rafId = requestAnimationFrame(rafTick);
}

function hide() {
    visible = false;
    speedo.classList.add('hidden');
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    tgtSpd = 0;
}

// ─── Update from Lua ─────────────────────────────────────────────────────────

function onShow(d) {
    show();

    useMetric = !!d.isMetric;
    unitBadge.textContent = useMetric ? 'KM/H' : 'MPH';

    // Speed (m/s → display unit)
    tgtSpd = mpsToDisplay(d.speed || 0);

    // RPM (0.0–1.0)
    if (d.rpm !== null && d.rpm !== undefined) {
        const rpmRaw = Math.round(d.rpm * 9000);
        rpmValEl.textContent = rpmRaw.toLocaleString();
        updateArc(d.rpm);
        rpmWrap.style.display = '';
    } else {
        rpmWrap.style.display = 'none';
        updateArc(0);
    }

    // Gear
    if (d.gear !== null && d.gear !== undefined) {
        const g = d.gear;
        gearValEl.textContent = g === 0 ? 'N' : String(g);
        if (g === 0) {
            gearValEl.style.color      = '#66aaff';
            gearValEl.style.textShadow = '0 0 10px #4488ff,0 0 20px #2255cc';
        } else if (g >= 5) {
            gearValEl.style.color      = '#ff4400';
            gearValEl.style.textShadow = '0 0 10px #ff2200,0 0 20px #cc0000';
        } else {
            gearValEl.style.color      = '#ffdd00';
            gearValEl.style.textShadow = '0 0 10px #ff6600,0 0 22px #ff2200';
        }
        gearWrap.style.display = '';
    } else {
        gearWrap.style.display = 'none';
    }

    // Fuel
    updateBar(fuelFill, fuelPct, d.fuel || 0, 'fuel');

    // Engine health (0–100 range after /10 in lua)
    updateBar(engFill,  engPct,  d.engineHealth || 0, 'engine');

    // Engine status pill
    const on = (d.speed || 0) > 0 || (d.gear || 0) > 0;
    engineDot.className  = 'pill-dot ' + (on ? 'on' : 'off');
    engineLbl.textContent = 'ENGINE ' + (on ? 'ON' : 'OFF');
}

function onUpdate(d) {
    if (d.showRpm  !== undefined) rpmWrap.style.display  = d.showRpm  ? '' : 'none';
    if (d.showGear !== undefined) gearWrap.style.display = d.showGear ? '' : 'none';
    if (d.useMetric !== undefined) {
        useMetric = d.useMetric;
        unitBadge.textContent = useMetric ? 'KM/H' : 'MPH';
    }
}

// ─── NUI listener ────────────────────────────────────────────────────────────

window.addEventListener('message', function(e) {
    const d = e.data;
    if (!d || !d.action) return;
    switch (d.action) {
        case 'show':   onShow(d);   break;
        case 'hide':   hide();      break;
        case 'update': onUpdate(d); break;
    }
});

// ─── Dev preview (browser only) ──────────────────────────────────────────────

if (typeof window.invokeNative === 'undefined') {
    show();
    let ps = 0, dir = 1;
    setInterval(function() {
        ps += dir * 5;
        if (ps >= 260) dir = -1;
        if (ps <= 0)   dir =  1;
        onShow({
            isMetric:     true,
            speed:        ps / 3.6,       // m/s
            rpm:          Math.min(1, ps / 250),
            gear:         Math.min(6, Math.max(1, Math.floor(ps / 43))),
            fuel:         65,
            engineHealth: 88,
        });
    }, 50);
}
