/* =============================================
   FIRE SPEEDOMETER — script.js
   JG-Works Garage compatible
   ============================================= */

let elements = {};
let speedMode = 1; // 1 = MPH (default server)
let indicators = 0;

const onOrOff = state => state ? 'On' : 'Off';

// =============================================
// GLOBAL FUNCTIONS — dipanggil langsung oleh server JG-Works
// =============================================

function setEngine(state) {
    if (elements.engine) elements.engine.innerText = onOrOff(state);
}

function setSpeed(speed) {
    if (!elements.speed) return;
    switch (speedMode) {
        case 1:  elements.speed.innerText = `${Math.round(speed * 2.236936)}`; break; // MPH
        case 2:  elements.speed.innerText = `${Math.round(speed * 1.943844)}`; break; // Knots
        default: elements.speed.innerText = `${Math.round(speed * 3.6)}`;             // KMH
    }
    // Update speed color
    const num = parseInt(elements.speed.innerText) || 0;
    const max = speedMode === 0 ? 280 : speedMode === 2 ? 150 : 175;
    elements.speed.style.color = num < max * 0.3 ? '#ffffff'
        : num < max * 0.6 ? '#ffd060'
        : num < max * 0.85 ? '#ff7700'
        : '#ff3300';
    elements.speed.style.textShadow = num >= max * 0.85
        ? '0 0 20px #ff2200, 0 0 40px #ff0000'
        : '0 0 10px rgba(255,110,0,0.9), 0 0 25px rgba(255,60,0,0.6)';
}

function setRPM(rpm) {
    if (elements.rpm) elements.rpm.innerText = `${rpm.toFixed(4)} RPM`;
}

function setFuel(fuel) {
    const fuelPercent = (fuel * 100).toFixed(1);
    if (elements.fuel) elements.fuel.innerText = `${fuelPercent}%`;
    if (typeof window.onTelemetryUpdate === 'function') {
        window.onTelemetryUpdate('Fuel', `${fuelPercent}%`);
    }
}

function setHealth(health) {
    const healthPercent = (health * 100).toFixed(1);
    if (elements.health) elements.health.innerText = `${healthPercent}%`;
    if (typeof window.onTelemetryUpdate === 'function') {
        window.onTelemetryUpdate('Health', `${healthPercent}%`);
    }
}

function setGear(gear) {
    if (!elements.gear) return;
    elements.gear.innerText = String(gear === 0 ? 'N' : gear);
    elements.gear.style.color = gear === 0 ? '#66aaff'
        : gear >= 5 ? '#ff4400'
        : '#ffdd00';
    elements.gear.style.textShadow = gear === 0
        ? '0 0 10px #4488ff, 0 0 20px #2255cc'
        : gear >= 5
        ? '0 0 10px #ff2200, 0 0 20px #cc0000'
        : '0 0 10px #ff6600, 0 0 22px #ff2200';
}

function setHeadlights(state) {
    if (!elements.headlights) return;
    switch (state) {
        case 1:  elements.headlights.innerText = 'On';        break;
        case 2:  elements.headlights.innerText = 'High Beam'; break;
        default: elements.headlights.innerText = 'Off';
    }
}

function setLeftIndicator(state) {
    indicators = (indicators & 0b10) | (state ? 0b01 : 0b00);
    if (elements.indicators)
        elements.indicators.innerText = `${indicators & 0b01 ? 'On' : 'Off'} / ${indicators & 0b10 ? 'On' : 'Off'}`;
}

function setRightIndicator(state) {
    indicators = (indicators & 0b01) | (state ? 0b10 : 0b00);
    if (elements.indicators)
        elements.indicators.innerText = `${indicators & 0b01 ? 'On' : 'Off'} / ${indicators & 0b10 ? 'On' : 'Off'}`;
}

function setSeatbelts(state) {
    if (elements.seatbelts) elements.seatbelts.innerText = onOrOff(state);
}

function setSpeedMode(mode) {
    speedMode = mode;
    const label = document.querySelector('.speed-unit-label');
    if (label) label.textContent = ['KMH', 'MPH', 'KTS'][mode] || 'MPH';
}

function setOdometer(distance) {
    if (elements.odometer) elements.odometer.innerText = distance.toFixed(1) + ' Miles';
}

// =============================================
// DOM Ready
// =============================================
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

    // Dev preview — aktif hanya di browser biasa
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
