/* =========================================
   FIRE SPEEDOMETER — script.js
   Compatible with JG-Works Garage custom speedometer system
   ========================================= */
'use strict';

const ARC_LEN = 173;

// DOM
let speedEl, rpmPathEl, rpmValEl, gearValEl;
let fuelFill, fuelPctEl, engFill, engPctEl;
let engineDot, engineLbl, unitBadge;
let speedo;

// State
let speedMode = 0; // 0=KMH, 1=MPH, 2=Knots
let curSpd    = 0;
let tgtSpd    = 0;
let rafId     = null;

// ─── Arc ─────────────────────────────────────────────────────────────────────
function updateArc(rpmRatio) {
    if (!rpmPathEl) return;
    const sweep  = ARC_LEN * 0.75;
    const offset = ARC_LEN - (Math.min(1, rpmRatio) * sweep);
    rpmPathEl.style.strokeDashoffset = offset.toFixed(2);
}

// ─── Speed color ─────────────────────────────────────────────────────────────
function applySpeedColor(spd) {
    if (!speedEl) return;
    const max = speedMode === 0 ? 280 : speedMode === 1 ? 175 : 150;
    speedEl.classList.remove('s-slow','s-med','s-fast','s-max');
    if      (spd < max * 0.25) speedEl.classList.add('s-slow');
    else if (spd < max * 0.55) speedEl.classList.add('s-med');
    else if (spd < max * 0.80) speedEl.classList.add('s-fast');
    else                        speedEl.classList.add('s-max');
}

// ─── Bar helper ───────────────────────────────────────────────────────────────
function updateBar(fillEl, pctEl, pct) {
    if (!fillEl || !pctEl) return;
    const v = Math.max(0, Math.min(100, pct));
    fillEl.style.width = v + '%';
    pctEl.textContent  = v.toFixed(0) + '%';
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

// ─── RAF smooth speed ─────────────────────────────────────────────────────────
function rafTick() {
    const diff = tgtSpd - curSpd;
    curSpd += Math.abs(diff) > 0.4 ? diff * 0.17 : diff;
    const disp = Math.round(curSpd);
    if (speedEl) speedEl.textContent = disp;
    applySpeedColor(disp);
    rafId = requestAnimationFrame(rafTick);
}

function startRAF() {
    if (!rafId) rafId = requestAnimationFrame(rafTick);
}

// ─── Show / Hide speedo ───────────────────────────────────────────────────────
function showSpeedo() {
    if (speedo) speedo.classList.remove('hidden');
    startRAF();
}

function hideSpeedo() {
    if (speedo) speedo.classList.add('hidden');
    tgtSpd = 0;
}

// =========================================
// GLOBAL FUNCTIONS — called by JG-Works server
// =========================================

/**
 * Engine state: true = on, false = off
 */
window.setEngine = function(state) {
    showSpeedo();
    if (!engineDot || !engineLbl) return;
    engineDot.className   = 'pill-dot ' + (state ? 'on' : 'off');
    engineLbl.textContent = 'ENGINE ' + (state ? 'ON' : 'OFF');
};

/**
 * Speed in m/s — server sends raw m/s, we convert based on mode
 */
window.setSpeed = function(speed) {
    showSpeedo();
    switch (speedMode) {
        case 1:  tgtSpd = speed * 2.236936; break; // MPH
        case 2:  tgtSpd = speed * 1.943844; break; // Knots
        default: tgtSpd = speed * 3.6;             // KMH
    }
};

/**
 * RPM: 0.0 to 1.0
 */
window.setRPM = function(rpm) {
    updateArc(rpm);
    if (rpmValEl) rpmValEl.textContent = Math.round(rpm * 9000).toLocaleString();
};

/**
 * Fuel: 0.0 to 1.0
 */
window.setFuel = function(fuel) {
    updateBar(fuelFill, fuelPctEl, fuel * 100);
};

/**
 * Health: 0.0 to 1.0
 */
window.setHealth = function(health) {
    updateBar(engFill, engPctEl, health * 100);
};

/**
 * Gear: number, 0 = neutral
 */
window.setGear = function(gear) {
    if (!gearValEl) return;
    gearValEl.textContent = gear === 0 ? 'N' : String(gear);
    if (gear === 0) {
        gearValEl.style.color      = '#66aaff';
        gearValEl.style.textShadow = '0 0 10px #4488ff,0 0 20px #2255cc';
    } else if (gear >= 5) {
        gearValEl.style.color      = '#ff4400';
        gearValEl.style.textShadow = '0 0 10px #ff2200,0 0 20px #cc0000';
    } else {
        gearValEl.style.color      = '#ffdd00';
        gearValEl.style.textShadow = '0 0 10px #ff6600,0 0 22px #ff2200';
    }
};

/**
 * Headlights: 0=off, 1=on, 2=high beam
 */
window.setHeadlights = function(state) {
    // optional — bisa ditampilkan di badge jika diperlukan
};

/**
 * Left indicator
 */
window.setLeftIndicator = function(state) {
    // optional
};

/**
 * Right indicator
 */
window.setRightIndicator = function(state) {
    // optional
};

/**
 * Seatbelt
 */
window.setSeatbelts = function(state) {
    // optional
};

/**
 * Speed mode: 0=KMH, 1=MPH, 2=Knots
 */
window.setSpeedMode = function(mode) {
    speedMode = mode;
    if (unitBadge) {
        const labels = ['KM/H', 'MPH', 'KTS'];
        unitBadge.textContent = labels[mode] || 'KM/H';
    }
};

/**
 * Odometer: distance in miles
 */
window.setOdometer = function(distance) {
    // optional — bisa tambahkan elemen ODO jika perlu
};

// ─── Also support NUI message (fallback / dev mode) ───────────────────────────
window.addEventListener('message', function(e) {
    const d = e.data;
    if (!d || !d.action) return;
    if (d.action === 'hide') hideSpeedo();
});

// ─── DOM Ready ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
    speedo     = document.getElementById('speedo');
    speedEl    = document.getElementById('speed-val');
    rpmPathEl  = document.getElementById('rpm-path');
    rpmValEl   = document.getElementById('rpm-val');
    gearValEl  = document.getElementById('gear-val');
    fuelFill   = document.getElementById('fuel-fill');
    fuelPctEl  = document.getElementById('fuel-pct');
    engFill    = document.getElementById('eng-fill');
    engPctEl   = document.getElementById('eng-pct');
    engineDot  = document.getElementById('engine-dot');
    engineLbl  = document.getElementById('engine-lbl');
    unitBadge  = document.getElementById('unit-badge');

    // Dev preview — aktif hanya di browser biasa
    if (typeof window.invokeNative === 'undefined') {
        showSpeedo();
        let ps = 0, dir = 1;
        setInterval(function() {
            ps += dir * 5;
            if (ps >= 260) dir = -1;
            if (ps <= 0)   dir =  1;
            window.setEngine(true);
            window.setSpeed(ps / 3.6);
            window.setRPM(Math.min(1, ps / 260));
            window.setGear(Math.min(6, Math.max(1, Math.floor(ps / 43))));
            window.setFuel(0.65);
            window.setHealth(0.88);
            window.setSpeedMode(0);
        }, 50);
    }
});
