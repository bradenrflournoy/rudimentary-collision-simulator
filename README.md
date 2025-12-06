# rudimentary-collision-simulator
An interactive **2D physics sandbox** that visualizes rigid-body motion and collisions between balls in real time.  
Built with vanilla **HTML, CSS, and JavaScript**, it demonstrates conservation of momentum, kinetic energy, gravity, and air drag.

**Live demo:** https://bradenrflournoy.github.io/rudimentary-collision-simulator/

## Features

### Interactive Controls
- **Start / Stop / Reset** — control simulation playback and restore initial state  
- **Add Ball** — spawn new balls with randomized size, color, mass, and velocity  
- **Restitution (e)** — adjust elasticity (0 = inelastic, 1 = perfectly elastic)  
- **Air Drag + C₍d₎** — toggle quadratic drag and set the coefficient  
- **Gravity** — toggle gravity on/off for microgravity experiments

### Physics Model
- **Impulse-based collisions** (conservation of momentum + restitution)  
- **Gravity** ≈ 9.81 m/s² (when enabled)  
- **Quadratic air resistance:**  
  \( \vec{a}_d = -\frac{1}{2m}\rho C_d A \vec{v}\lVert\vec{v}\rVert \)  
- **Fixed-timestep integration** for stability  
- **Energy tracking** — live potential, kinetic, and total energy

### Visualization
- DOM-based rendering (no canvas dependency)  
- 1 meter = 100 pixels (consistent internal units)  
- Clean UI with position/velocity/energy readouts

## Run Locally

**Option A (no server):**  
Just open `index.html` in your browser.

**Option B (local server, recommended):**
```bash
# from the repo root
python -m http.server 8000
# then visit http://localhost:8000/
