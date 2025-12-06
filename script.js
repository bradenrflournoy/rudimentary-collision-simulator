// uses SI units internally; converts to px for drawing

const SCALE = 100; // px per meter
const WIDTH_PX = 1260;
const HEIGHT_PX = 540;
const WORLD_W = WIDTH_PX / SCALE;
const WORLD_H = HEIGHT_PX / SCALE;
const GRAVITY = 9.81; // m/s^2
const AIR_RHO = 1.225; // kg/m^3

// ----------------------- dom -----------------------
const startButton = document.getElementById("startButton");
const stopButton = document.getElementById("stopButton");
const energyOut = document.getElementById("energy");
const speedOut = document.getElementById("speed");
const posOut = document.getElementById("position");
const timeOut = document.getElementById("time");
const blueBallSE = document.getElementById("blueBall");
const redBallSE = document.getElementById("redBall");
const greenBallSE = document.getElementById("greenBall");

// container to attach new balls and controls to
const scene = (blueBallSE && blueBallSE.parentElement) || document.body;

// control panel
let controls = document.getElementById("controlsPanel");
if (!controls) {
  controls = document.createElement("div");
  controls.id = "controlsPanel";
  controls.style.position = "absolute";
  controls.style.left = "12px";
  controls.style.top = "12px";
  controls.style.padding = "10px 12px";
  controls.style.background = "rgba(255,255,255,0.85)";
  controls.style.borderRadius = "10px";
  controls.style.fontFamily = "system-ui, sans-serif";
  controls.style.fontSize = "14px";
  controls.style.userSelect = "none";
  controls.style.boxShadow = "0 4px 16px rgba(0,0,0,0.12)";
  controls.style.backdropFilter = "blur(4px)";
  controls.style.zIndex = "9999"; // keep panel visually on top
  scene.appendChild(controls);
}

controls.innerHTML = `
  <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:center; max-width: 1000px;">
    <button id="resetBtn">Reset</button>
    <button id="addBallBtn">Add Ball</button>
    <label style="display:flex; gap:6px; align-items:center;">
      <input id="gravityToggle" type="checkbox" checked> Gravity
    </label>
    <label style="display:flex; gap:6px; align-items:center;">
      e (restitution)
      <input id="restSlider" type="range" min="0" max="1" step="0.01" value="1">
      <span id="restVal">1.00</span>
    </label>
    <label style="display:flex; gap:6px; align-items:center;">
      <input id="dragToggle" type="checkbox"> Air drag
    </label>
    <label style="display:flex; gap:6px; align-items:center;">
      C<sub>d</sub>
      <input id="dragCoeff" type="range" min="0" max="1.5" step="0.01" value="0.47">
      <span id="dragVal">0.47</span>
    </label>
  </div>
`;

const resetBtn = document.getElementById("resetBtn");
const addBallBtn = document.getElementById("addBallBtn");
const restSlider = document.getElementById("restSlider");
const restVal = document.getElementById("restVal");
const dragToggle = document.getElementById("dragToggle");
const dragCoeffSlider = document.getElementById("dragCoeff");
const gravityToggle = document.getElementById("gravityToggle");
const dragVal = document.getElementById("dragVal");

// ----------------------- helpers -----------------------
function px(m) { return m * SCALE; }
function m(pxv) { return pxv / SCALE; }
function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }

// ----------------------- body -----------------------
class Body {
  constructor({mass, radius_m, x_m, y_m, vx, vy, useGravity = true, el, color}) {
    this.m = mass;
    this.r = radius_m;
    this.x = x_m; // meters, left is 0
    this.y = y_m; // meters, up is +y
    this.vx = vx; // m/s
    this.vy = vy; // m/s
    this.useGravity = useGravity;
    this.el = el || createBallElement(color || randomColor());
    this.color = color || this.el.dataset.color || randomColor();
  }
}

function createBallElement(color) {
  const el = document.createElement("div");
  el.className = "ball";
  el.style.position = "absolute";
  el.style.borderRadius = "50%";
  el.style.background = color || randomColor();
  el.style.boxShadow = "inset 0 0 12px rgba(0,0,0,0.25), 0 6px 12px rgba(0,0,0,0.15)";
  el.style.zIndex = "0"; // balls render behind control panel
  el.dataset.color = el.style.background;
  scene.appendChild(el);
  return el;
}

function randomColor() {
  const hues = [200, 0, 120, 40, 260, 320];
  const h = hues[Math.floor(Math.random()*hues.length)];
  return `hsl(${h} 70% 55%)`;
}

// ----------------------- state -----------------------
let RESTITUTION = 1.0; // runtime adjustable
let DRAG_ENABLED = false;
let CD = 0.47; // true drag coefficient
let GRAVITY_ENABLED = true; // global toggle

const initialBodies = [
  new Body({ mass: 0.049, radius_m: 0.125, x_m: 2,  y_m: 2,   vx: 4,  vy: 0, el: blueBallSE, color: "#3b82f6" }),
  new Body({ mass: 0.442, radius_m: 0.375, x_m: 5,  y_m: 3,   vx: -2, vy: 0, el: redBallSE,  color: "#ef4444" }),
  new Body({ mass: 0.196, radius_m: 0.25,  x_m: 10, y_m: 2.5, vx: -1, vy: 0, el: greenBallSE,color: "#22c55e" })
];

let bodies = [];
const initialEls = new Set();
function cloneInitial() {
  // on first boot, capture which dom nodes are originals
  if (initialEls.size === 0) {
    for (const b of initialBodies) if (b.el) initialEls.add(b.el);
  }
  bodies.forEach(b => b.el && b.el.classList && b.el.classList.remove("dead"));
  bodies = initialBodies.map(b => new Body({
    mass: b.m,
    radius_m: b.r,
    x_m: b.x,
    y_m: b.y,
    vx: b.vx,
    vy: b.vy,
    useGravity: b.useGravity,
    el: b.el,
    color: b.color,
  }));
  renderAll();
}

// ----------------------- rendering -----------------------
function renderBody(b) {
  const leftPx = px(b.x - b.r);
  const topPxFromBottom = px(b.y - b.r);
  const cssTop = HEIGHT_PX - topPxFromBottom - px(2*b.r);
  const size = px(2*b.r);
  b.el.style.width = `${size}px`;
  b.el.style.height = `${size}px`;
  b.el.style.left = `${clamp(leftPx, 0, WIDTH_PX - size)}px`;
  b.el.style.top = `${clamp(cssTop, 0, HEIGHT_PX - size)}px`;
  b.el.style.zIndex = "0"; // ensure balls stay behind controls
}
function renderAll(){ bodies.forEach(renderBody); }

// ----------------------- physics -----------------------
function integrate(b, dt) {
  let ax = 0;
  let ay = (GRAVITY_ENABLED && b.useGravity) ? -GRAVITY : 0;

  if (DRAG_ENABLED) {
    // physical quadratic drag using per-ball area & mass:
    // a = -(1/(2m)) * rho * C_d * A * v * |v|
    const v = Math.hypot(b.vx, b.vy);
    if (v > 1e-6) {
      const A = Math.PI * b.r * b.r; // cross-sectional area
      const k = 0.5 * AIR_RHO * CD * A / b.m; // per-ball factor
      const scale = -k * v; // multiply by velocity components below
      ax += scale * b.vx;
      ay += scale * b.vy;
    }
  }

  b.vx += ax * dt;
  b.vy += ay * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
}

function collideWalls(b) {
  if (b.x - b.r < 0) { b.x = b.r; b.vx = -b.vx * RESTITUTION; }
  if (b.x + b.r > WORLD_W) { b.x = WORLD_W - b.r; b.vx = -b.vx * RESTITUTION; }
  if (b.y - b.r < 0) { b.y = b.r; b.vy = -b.vy * RESTITUTION; }
  if (b.y + b.r > WORLD_H) { b.y = WORLD_H - b.r; b.vy = -b.vy * RESTITUTION; }
}

function collidePair(a, b) {
  const nx = a.x - b.x;
  const ny = a.y - b.y;
  const dist = Math.hypot(nx, ny);
  const minDist = a.r + b.r;
  if (dist === 0 || dist >= minDist) return;

  const ux = nx / dist;
  const uy = ny / dist;

  // positional correction (mass-weighted)
  const penetration = minDist - dist;
  const totalMass = a.m + b.m;
  const corrA = penetration * (b.m / totalMass);
  const corrB = penetration * (a.m / totalMass);
  a.x += ux * corrA; a.y += uy * corrA;
  b.x -= ux * corrB; b.y -= uy * corrB;

  // relative velocity along normal
  const rvx = a.vx - b.vx;
  const rvy = a.vy - b.vy;
  const relNormal = rvx * ux + rvy * uy;
  if (relNormal > 0) return; // separating

  const j = -(1 + RESTITUTION) * relNormal / (1/a.m + 1/b.m);
  const jx = j * ux;
  const jy = j * uy;
  a.vx += jx / a.m; a.vy += jy / a.m;
  b.vx -= jx / b.m; b.vy -= jy / b.m;
}

function collideAll() {
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      collidePair(bodies[i], bodies[j]);
    }
  }
}

// ----------------------- energy and readouts -----------------------
function totalEnergy() {
  let U = 0, K = 0;
  for (const b of bodies) {
    U += b.m * GRAVITY * Math.max(0, b.y); // reference at floor
    K += 0.5 * b.m * (b.vx*b.vx + b.vy*b.vy);
  }
  return {U, K, E: U + K};
}

function updateReadouts(simTime) {
  const {U, K, E} = totalEnergy();
  energyOut.textContent = `U: ${U.toFixed(2)}  K: ${K.toFixed(2)}  Total: ${E.toFixed(2)}`;
  speedOut.textContent = bodies.map((b,i)=>`#${i+1}:${Math.hypot(b.vx,b.vy).toFixed(2)}`).join("  ");
  posOut.textContent = bodies.map((b,i)=>`#${i+1}:(${b.x.toFixed(2)},${b.y.toFixed(2)})`).join("  ");
  timeOut.textContent = simTime.toFixed(2);
}

// ----------------------- main loop -----------------------
let running = false;
let rafId = null;
let accumulator = 0;
const FIXED_DT = 0.01; // 10ms
let lastT = 0;
let simTime = 0;

function step(dt) {
  accumulator += dt;
  while (accumulator >= FIXED_DT) {
    for (const b of bodies) integrate(b, FIXED_DT);
    for (const b of bodies) collideWalls(b);
    collideAll();
    // balls can pass behind the control panel
    simTime += FIXED_DT;
    accumulator -= FIXED_DT;
  }
}

function frame(tMs) {
  if (!running) return;
  if (!lastT) lastT = tMs;
  const dt = Math.min(0.05, (tMs - lastT) / 1000);
  lastT = tMs;
  step(dt);
  renderAll();
  updateReadouts(simTime);
  rafId = requestAnimationFrame(frame);
}

function start() { if (running) return; running = true; lastT = 0; rafId = requestAnimationFrame(frame); }
function stop()  { running = false; if (rafId) cancelAnimationFrame(rafId); rafId = null; }

// ----------------------- add ball and reset -----------------------
function addRandomBall() {
  // reasonable sizes: radius 0.12–0.35 m, mass from density approx. 350 kg/m^3
  const r = 0.12 + Math.random() * (0.35 - 0.12);
  const density = 3.0; // kg/m^3, chosen to match mass scale of original balls
  const m = (4/3) * Math.PI * r*r*r * density;

  // try to pick a non-overlapping spawn location
  let x, y; let attempts = 0;
  const margin = r + 0.05;
  do {
    x = margin + Math.random() * (WORLD_W - 2*margin);
    y = margin + Math.random() * (WORLD_H - 2*margin);
    attempts++;
    if (attempts > 200) break;
  } while (bodies.some(b => Math.hypot(b.x - x, b.y - y) < b.r + r + 0.01));

  const speed = 0.5 + Math.random() * 3.5;
  const ang = Math.random() * Math.PI * 2;
  const vx = Math.cos(ang) * speed;
  const vy = Math.sin(ang) * speed;

  const body = new Body({ mass: m, radius_m: r, x_m: x, y_m: y, vx, vy }); // added via add ball button
  bodies.push(body);
  renderBody(body);
}

function resetSim() {
  stop();
  // remove dynamically added balls from dom
  for (const b of bodies) {
    if (!initialEls.has(b.el) && b.el && b.el.remove) {
      b.el.remove();
    }
  }
  cloneInitial();
  simTime = 0; accumulator = 0; lastT = 0;
  renderAll();
  updateReadouts(0);
}

// ----------------------- ui wiring -----------------------
startButton.onclick = start;
stopButton.onclick = stop;
resetBtn.onclick = resetSim;
addBallBtn.onclick = addRandomBall;

restSlider.addEventListener('input', () => {
  RESTITUTION = parseFloat(restSlider.value);
  restVal.textContent = RESTITUTION.toFixed(2);
});

dragToggle.addEventListener('change', () => {
  DRAG_ENABLED = !!dragToggle.checked;
});

dragCoeffSlider.addEventListener('input', () => {
  CD = parseFloat(dragCoeffSlider.value);
  dragVal.textContent = CD.toFixed(2);
});

gravityToggle.addEventListener('change', () => {
  GRAVITY_ENABLED = !!gravityToggle.checked;
});

// ----------------------- boot -----------------------
cloneInitial();
renderAll();
updateReadouts(0);
