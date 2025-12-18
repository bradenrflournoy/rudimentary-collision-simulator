const GRAVITY = 9.81;   // m/s^2
const AIR_RHO = 1.225;  // kg/m^3

// ----------------------- DOM -----------------------
const container = document.getElementById("container");
const startButton = document.getElementById("startButton");
const stopButton = document.getElementById("stopButton");

const energyOut = document.getElementById("energy");
const speedOut = document.getElementById("speed");
const posOut = document.getElementById("position");
const timeOut = document.getElementById("time");
const scaleLabel = document.getElementById("scaleLabel");

const blueBallSE = document.getElementById("blueBall");
const redBallSE = document.getElementById("redBall");
const greenBallSE = document.getElementById("greenBall");

// ----------------------- World sizing -----------------------
let WIDTH_PX = 0;
let HEIGHT_PX = 0;
let SCALE = 100;  // px per meter (dynamic)
let WORLD_W = 0;  // meters
let WORLD_H = 0;  // meters

// The sim scales to fit the container.
const METERS_ACROSS = 12;

function px(m){ return m * SCALE; }
function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }

function updateWorldSize(){
  WIDTH_PX = container.clientWidth;
  HEIGHT_PX = container.clientHeight;

  // Scale so METERS_ACROSS fills the container width.
  SCALE = Math.max(10, WIDTH_PX / METERS_ACROSS);

  WORLD_W = WIDTH_PX / SCALE;
  WORLD_H = HEIGHT_PX / SCALE;

  // Update the CSS grid to match 1m steps.
  container.style.setProperty("--grid-step", `${SCALE}px`);

  if (scaleLabel) scaleLabel.textContent = `${Math.round(SCALE)} pixels = 1 meter`;

  // Rerender after resizes so balls stay positioned correctly.
  renderAll();
}

window.addEventListener("resize", updateWorldSize);

// ----------------------- Controls panel -----------------------
const scene = container; // attach UI inside the simulation area
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
  controls.style.color = "black";
  controls.style.fontFamily = "system-ui, sans-serif";
  controls.style.fontSize = "14px";
  controls.style.userSelect = "none";
  controls.style.boxShadow = "0 4px 16px rgba(0,0,0,0.12)";
  controls.style.backdropFilter = "blur(4px)";
  controls.style.zIndex = "9999"; // on top
  scene.appendChild(controls);
}

controls.innerHTML = `
  <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:center; max-width: 1000px;">
    <button id="resetBtn" type="button">Reset</button>
    <button id="addBallBtn" type="button">Add Ball</button>
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
const dragVal = document.getElementById("dragVal");
const gravityToggle = document.getElementById("gravityToggle");

// ----------------------- Body -----------------------
class Body {
  constructor({mass, radius_m, x_m, y_m, vx, vy, useGravity = true, el}) {
    this.m = mass;
    this.r = radius_m;
    this.x = x_m; // meters
    this.y = y_m; // meters (up is +y)
    this.vx = vx; // m/s
    this.vy = vy; // m/s
    this.useGravity = useGravity;
    this.el = el || createBallElement();
    this.el.style.zIndex = "0";
  }
}

function randomColor(){
  const hues = [200, 0, 120, 40, 260, 320];
  const h = hues[Math.floor(Math.random()*hues.length)];
  return `hsl(${h} 70% 55%)`;
}

function createBallElement(){
  const el = document.createElement("div");
  el.className = "ball";
  el.style.background = randomColor();
  el.style.zIndex = "0";
  scene.appendChild(el);
  return el;
}

// ----------------------- State -----------------------
let RESTITUTION = 1.0;
let DRAG_ENABLED = false;
let CD = 0.47;
let GRAVITY_ENABLED = true;

const initialBodies = [
  new Body({ mass: 0.049, radius_m: 0.125, x_m: 2,  y_m: 2,   vx: 4,  vy: 0, el: blueBallSE }),
  new Body({ mass: 0.442, radius_m: 0.375, x_m: 5,  y_m: 3,   vx: -2, vy: 0, el: redBallSE  }),
  new Body({ mass: 0.196, radius_m: 0.25,  x_m: 10, y_m: 2.5, vx: -1, vy: 0, el: greenBallSE})
];

let bodies = [];
const initialEls = new Set();

function cloneInitial(){
  if (initialEls.size === 0) {
    for (const b of initialBodies) if (b.el) initialEls.add(b.el);
  }
  bodies = initialBodies.map(b => new Body({
    mass: b.m,
    radius_m: b.r,
    x_m: b.x,
    y_m: b.y,
    vx: b.vx,
    vy: b.vy,
    useGravity: b.useGravity,
    el: b.el
  }));
  renderAll();
}

// ----------------------- Rendering -----------------------
function renderBody(b){
  const size = px(2*b.r);
  const leftPx = px(b.x - b.r);
  const topPxFromBottom = px(b.y - b.r);
  const cssTop = HEIGHT_PX - topPxFromBottom - size;

  b.el.style.width = `${size}px`;
  b.el.style.height = `${size}px`;
  b.el.style.left = `${clamp(leftPx, 0, WIDTH_PX - size)}px`;
  b.el.style.top  = `${clamp(cssTop, 0, HEIGHT_PX - size)}px`;
}

function renderAll(){
  if (!WIDTH_PX || !HEIGHT_PX) return;
  bodies.forEach(renderBody);
}

// ----------------------- Physics -----------------------
function integrate(b, dt){
  let ax = 0;
  let ay = (GRAVITY_ENABLED && b.useGravity) ? -GRAVITY : 0;

  if (DRAG_ENABLED){
    // a = -(1/(2m)) * rho * Cd * A * v * |v|
    const v = Math.hypot(b.vx, b.vy);
    if (v > 1e-6){
      const A = Math.PI * b.r * b.r;
      const k = 0.5 * AIR_RHO * CD * A / b.m;
      const scale = -k * v;
      ax += scale * b.vx;
      ay += scale * b.vy;
    }
  }

  b.vx += ax * dt;
  b.vy += ay * dt;
  b.x  += b.vx * dt;
  b.y  += b.vy * dt;
}

function collideWalls(b){
  if (b.x - b.r < 0)       { b.x = b.r;           b.vx = -b.vx * RESTITUTION; }
  if (b.x + b.r > WORLD_W) { b.x = WORLD_W - b.r; b.vx = -b.vx * RESTITUTION; }
  if (b.y - b.r < 0)       { b.y = b.r;           b.vy = -b.vy * RESTITUTION; }
  if (b.y + b.r > WORLD_H) { b.y = WORLD_H - b.r; b.vy = -b.vy * RESTITUTION; }
}

function collidePair(a, b){
  const nx = a.x - b.x;
  const ny = a.y - b.y;
  const dist = Math.hypot(nx, ny);
  const minDist = a.r + b.r;
  if (dist === 0 || dist >= minDist) return;

  const ux = nx / dist;
  const uy = ny / dist;

  // Separate overlap (mass-weighted)
  const penetration = minDist - dist;
  const totalMass = a.m + b.m;
  const corrA = penetration * (b.m / totalMass);
  const corrB = penetration * (a.m / totalMass);
  a.x += ux * corrA; a.y += uy * corrA;
  b.x -= ux * corrB; b.y -= uy * corrB;

  // Impulse
  const rvx = a.vx - b.vx;
  const rvy = a.vy - b.vy;
  const relNormal = rvx * ux + rvy * uy;
  if (relNormal > 0) return;

  const j = -(1 + RESTITUTION) * relNormal / (1/a.m + 1/b.m);
  const jx = j * ux;
  const jy = j * uy;

  a.vx += jx / a.m; a.vy += jy / a.m;
  b.vx -= jx / b.m; b.vy -= jy / b.m;
}

function collideAll(){
  for (let i = 0; i < bodies.length; i++){
    for (let j = i + 1; j < bodies.length; j++){
      collidePair(bodies[i], bodies[j]);
    }
  }
}

// ----------------------- Readouts -----------------------
function totalEnergy(){
  let U = 0, K = 0;
  for (const b of bodies){
    U += b.m * GRAVITY * Math.max(0, b.y);
    K += 0.5 * b.m * (b.vx*b.vx + b.vy*b.vy);
  }
  return {U, K, E: U + K};
}

function updateReadouts(simTime){
  const {U, K, E} = totalEnergy();
  energyOut.textContent = `U: ${U.toFixed(2)}  K: ${K.toFixed(2)}  Total: ${E.toFixed(2)}`;
  speedOut.textContent = bodies.map((b,i)=>`#${i+1}:${Math.hypot(b.vx,b.vy).toFixed(2)}`).join("  ");
  posOut.textContent = bodies.map((b,i)=>`#${i+1}:(${b.x.toFixed(2)},${b.y.toFixed(2)})`).join("  ");
  timeOut.textContent = simTime.toFixed(2);
}

// ----------------------- Loop -----------------------
let running = false;
let rafId = null;
let accumulator = 0;
const FIXED_DT = 0.01;
let lastT = 0;
let simTime = 0;

function step(dt){
  accumulator += dt;
  while (accumulator >= FIXED_DT){
    for (const b of bodies) integrate(b, FIXED_DT);
    for (const b of bodies) collideWalls(b);
    collideAll();
    simTime += FIXED_DT;
    accumulator -= FIXED_DT;
  }
}

function frame(tMs){
  if (!running) return;
  if (!lastT) lastT = tMs;
  const dt = Math.min(0.05, (tMs - lastT) / 1000);
  lastT = tMs;

  step(dt);
  renderAll();
  updateReadouts(simTime);
  rafId = requestAnimationFrame(frame);
}

function start(){
  if (running) return;
  running = true;
  lastT = 0;
  rafId = requestAnimationFrame(frame);
}

function stop(){
  running = false;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
}

// ----------------------- Add Ball & Reset -----------------------
function addRandomBall(){
  const r = 0.12 + Math.random() * (0.35 - 0.12);
  const density = 3.0; // tuned to match original mass scale
  const m = (4/3) * Math.PI * r*r*r * density;

  // Spawn without overlapping existing balls
  let x, y, attempts = 0;
  const margin = r + 0.05;
  do{
    x = margin + Math.random() * (WORLD_W - 2*margin);
    y = margin + Math.random() * (WORLD_H - 2*margin);
    attempts++;
    if (attempts > 200) break;
  } while (bodies.some(b => Math.hypot(b.x - x, b.y - y) < b.r + r + 0.01));

  const speed = 0.5 + Math.random() * 3.5;
  const ang = Math.random() * Math.PI * 2;
  const vx = Math.cos(ang) * speed;
  const vy = Math.sin(ang) * speed;

  const body = new Body({ mass: m, radius_m: r, x_m: x, y_m: y, vx, vy });
  bodies.push(body);
  renderBody(body);
}

function resetSim(){
  stop();
  // remove dynamically added balls from DOM
  for (const b of bodies){
    if (!initialEls.has(b.el) && b.el && b.el.remove) b.el.remove();
  }
  cloneInitial();
  simTime = 0; accumulator = 0; lastT = 0;
  updateReadouts(0);
}

// ----------------------- UI wiring -----------------------
startButton.addEventListener("click", start);
stopButton.addEventListener("click", stop);
resetBtn.addEventListener("click", resetSim);
addBallBtn.addEventListener("click", addRandomBall);

restSlider.addEventListener("input", () => {
  RESTITUTION = parseFloat(restSlider.value);
  restVal.textContent = RESTITUTION.toFixed(2);
});

dragToggle.addEventListener("change", () => {
  DRAG_ENABLED = !!dragToggle.checked;
});

dragCoeffSlider.addEventListener("input", () => {
  CD = parseFloat(dragCoeffSlider.value);
  dragVal.textContent = CD.toFixed(2);
});

gravityToggle.addEventListener("change", () => {
  GRAVITY_ENABLED = !!gravityToggle.checked;
});

// ----------------------- Boot -----------------------
updateWorldSize();
cloneInitial();
updateReadouts(0);
