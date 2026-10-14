/* =========================================
   FIRE SPEEDOMETER — script.js
   JG-Works Garage compatible
   ========================================= */

let elements = {};
let speedMode = 1; // default MPH (server default)
let indicators = 0;
const ARC_LEN = 173;

const onOrOff = state => state ? 'On' : 'Off';

// ─── Arc RPM ─────────────────────────────────────────────────────────────────
function updateArc(rpmRatio) {
    const el = document.getElementById('rpm-path');
    if (!el) return;
    const offset = ARC_LEN - (Math.min(1, rpmRatio) * ARC_LEN * 0.75);
    el.style.strokeDashoffset = offset.toFixed(2);
}

// ─── Bar sync ─────────────────────────────────────────────────────────────────
function updateFuelBar(pct) {
    const fill = document.getElementById('fuel-fill');
    if (!fill) return;
    fill.style.width = Math.max(0, Math.min(100, pct)) + '%';
    if (pct <= 15) {
        fill.style.background = 'linear-gradient(90deg,#770000,#aa0000)';
        fill.style.boxShadow  = '0 0 7px rgba(160,0,0,0.9)';
    } else if (pct <= 35) {
        fill.style.background = 'linear-gradient(90deg,#cc2200,#ee4400)';
        fill.style.boxShadow  = '0 0 6px rgba(210,40,0,0.7)';
    } else {
        fill.style.background = 'linear-gradient(90deg,#ff2200,#ff6600,#ffdd00)';
        fill.style.boxShadow  = '0 0 6px rgba(255,100,0,0.65)';
    }
}

function updateHealthBar(pct) {
    const fill = document.getElementById('health-fill');
    if (!fill) return;
    fill.style.width = Math.max(0, Math.min(100, pct)) + '%';
    if (pct <= 25) {
        fill.style.background = 'linear-gradient(90deg,#770000,#aa0000)';
        fill.style.boxShadow  = '0 0 7px rgba(160,0,0,0.9)';
    } else if (pct <= 50) {
        fill.style.background = 'linear-gradient(90deg,#cc2200,#ee4400)';
        fill.style.boxShadow  = '0 0 6px rgba(210,40,0,0.7)';
    } else {
        fill.style.background = 'linear-gradient(90deg,#ff2200,#ff6600,#ffdd00)';
        fill.style.boxShadow  = '0 0 6px rgba(255,100,0,0.65)';
    }
}

// ─── Engine dot sync ──────────────────────────────────────────────────────────
function syncEngineDot(text) {
    const dot = document.getElementById('engine-dot');
    if (!dot) return;
    dot.className = 'pill-dot ' + (text === 'On' ? 'on' : 'off');
}

// ─── Speed color ──────────────────────────────────────────────────────────────
function syncSpeedColor() {
    const el = elements.speed;
    if (!el) return;
    const num = parseInt(el.innerText) || 0;
    const max = speedMode === 0 ? 280 : speedMode === 2 ? 150 : 175;
    el.classList.remove('s-slow','s-med','s-fast','s-max');
    if      (num < max * 0.25) el.classList.add('s-slow');
    else if (num < max * 0.55) el.classList.add('s-med');
    else if (num < max * 0.80) el.classList.add('s-fast');
    else                        el.classList.add('s-max');
}

// ─── Gear color ───────────────────────────────────────────────────────────────
function syncGearColor(gear) {
    const el = elements.gear;
    if (!el) return;
    if (gear === 0 || gear === 'N') {
        el.style.color      = '#66aaff';
        el.style.textShadow = '0 0 10px #4488ff,0 0 20px #2255cc';
    } else if (Number(gear) >= 5) {
        el.style.color      = '#ff4400';
        el.style.textShadow = '0 0 10px #ff2200,0 0 20px #cc0000';
    } else {
        el.style.color      = '#ffdd00';
        el.style.textShadow = '0 0 10px #ff6600,0 0 22px #ff2200';
    }
}

// =========================================
// GLOBAL FUNCTIONS — dipanggil server JG-Works
// =========================================

function setEngine(state) {
    elements.engine.innerText = onOrOff(state);
    syncEngineDot(onOrOff(state));
}

function setSpeed(speed) {
    switch(speedMode) {
        case 1:  elements.speed.innerText = `${Math.round(speed * 2.236936)} MPH`;   break;
        case 2:  elements.speed.innerText = `${Math.round(speed * 1.943844)} Knots`; break;
        default: elements.speed.innerText = `${Math.round(speed * 3.6)} KMH`;
    }
    syncSpeedColor();
}

function setRPM(rpm) {
    elements.rpm.innerText = `${rpm.toFixed(4)} RPM`;
    updateArc(rpm);
}

function setFuel(fuel) {
    const pct = (fuel * 100).toFixed(1);
    elements.fuel.innerText = `${pct}%`;
    updateFuelBar(parseFloat(pct));
    if (typeof window.onTelemetryUpdate === 'function') {
        window.onTelemetryUpdate('Fuel', `${pct}%`);
    }
}

function setHealth(health) {
    const pct = (health * 100).toFixed(1);
    elements.health.innerText = `${pct}%`;
    updateHealthBar(parseFloat(pct));
    if (typeof window.onTelemetryUpdate === 'function') {
        window.onTelemetryUpdate('Health', `${pct}%`);
    }
}

function setGear(gear) {
    elements.gear.innerText = String(gear);
    syncGearColor(gear);
}

function setHeadlights(state) {
    switch(state) {
        case 1:  elements.headlights.innerText = 'On';        break;
        case 2:  elements.headlights.innerText = 'High Beam'; break;
        default: elements.headlights.innerText = 'Off';
    }
}

function setLeftIndicator(state) {
    indicators = (indicators & 0b10) | (state ? 0b01 : 0b00);
    elements.indicators.innerText = `${indicators & 0b01 ? 'On' : 'Off'} / ${indicators & 0b10 ? 'On' : 'Off'}`;
}

function setRightIndicator(state) {
    indicators = (indicators & 0b01) | (state ? 0b10 : 0b00);
    elements.indicators.innerText = `${indicators & 0b01 ? 'On' : 'Off'} / ${indicators & 0b10 ? 'On' : 'Off'}`;
}

function setSeatbelts(state) {
    elements.seatbelts.innerText = onOrOff(state);
}

function setSpeedMode(mode) {
    speedMode = mode;
    const badge = document.getElementById('unit-badge');
    if (badge) badge.textContent = ['KM/H','MPH','KTS'][mode] || 'MPH';
}

function setOdometer(distance) {
    elements.odometer.innerText = distance.toFixed(1) + ' Miles';
}

// ─── DOM Ready ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    elements = {
        engine:     document.getElementById('engine'),
        speed:      document.getElementById('speed'),
        rpm:        document.getElementById('rpm'),
        fuel:       document.getElementById('fuel'),
        health:     document.getElementById('health'),
        gear:       document.getElementById('gear'),
        headlights: document.getElementById('headlights'),
        indicators: document.getElementById('indicators'),
        seatbelts:  document.getElementById('seatbelts'),
        odometer:   document.getElementById('odometer'),
    };

    // Dev preview — aktif hanya di browser biasa, mati di FiveM
    if (typeof window.invokeNative === 'undefined') {
        let ps = 0, dir = 1;
        setInterval(() => {
            ps += dir * 5;
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
