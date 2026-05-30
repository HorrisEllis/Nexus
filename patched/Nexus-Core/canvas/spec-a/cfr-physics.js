// ═══════════════════════════════════════════════════
// NEXUS — CFR Physics shim
// canvas/spec-a/cfr-physics.js
//
// Re-exports cfr-kernel/physics.js from spatial-v2
// as CommonJS. The original is an ES module.
//
// In browser builds the bundler resolves the real path.
// In Node test environments this shim provides the same
// API surface so tests don't need a bundler.
//
// §5.5 — no external dependencies. cfr-kernel is in
//         this repository (spatial-v2 package).
// ═══════════════════════════════════════════════════
'use strict';

// ── Inline CPU particle world ─────────────────────
// Exact port of cfr-kernel/physics.js to CJS.
// Keep in sync with spatial-v2/packages/kernel/src/modules/cfr-kernel/physics.js

const DEFAULT_CONFIG = {
  n:      10000,
  bound:  9.0,
  boundZ: 5.0,
  depth:  3.0,
  wallK:  0.11,
  wallZ:  1.4,
  vmax:   0.17,
};

function h21(x, y) {
  const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return v - Math.floor(v);
}
function sn(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  return h21(ix, iy) + (h21(ix+1, iy) - h21(ix, iy)) * ux +
         (h21(ix, iy+1) - h21(ix, iy)) * uy +
         (h21(ix, iy) - h21(ix+1, iy) - h21(ix, iy+1) + h21(ix+1, iy+1)) * ux * uy;
}
function curlNoise(x, y, z, t) {
  const e = 0.08;
  return {
    cx:  (sn(x + z*0.2 + t*0.05, y + e) - sn(x + z*0.2 + t*0.05, y - e)) / (2*e),
    cy: -(sn(x + e, y + z*0.3 + t*0.07) - sn(x - e, y + z*0.3 + t*0.07)) / (2*e),
    cz:  (sn(y + e, z + x*0.15 + t*0.04) - sn(y - e, z + x*0.15 + t*0.04)) / (2*e) * 0.4,
  };
}

function createWorld(opts = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...opts };
  const N   = Math.max(100, Math.min(500000, cfg.n));
  const posX = new Float32Array(N), posY = new Float32Array(N), posZ = new Float32Array(N);
  const velX = new Float32Array(N), velY = new Float32Array(N), velZ = new Float32Array(N);
  const pSpeed = new Float32Array(N);
  const BXY = cfg.bound * 0.9, BZ = cfg.boundZ * cfg.depth * 0.9;
  for (let i = 0; i < N; i++) {
    posX[i] = (Math.random() - 0.5) * 2 * BXY;
    posY[i] = (Math.random() - 0.5) * 2 * BXY;
    posZ[i] = (Math.random() - 0.5) * 2 * BZ;
    velX[i] = (Math.random() - 0.5) * 0.025;
    velY[i] = (Math.random() - 0.5) * 0.025;
    velZ[i] = (Math.random() - 0.5) * 0.012;
    pSpeed[i] = 0.15 + Math.random() * 0.15;
  }
  return {
    cfg, N, posX, posY, posZ, velX, velY, velZ, pSpeed,
    field: { structure: 0.5, entropy: 0.2, attention: 0.5, damping: 0.12, curl: 0.6, speed: 1.0 },
    attractors: [], stresses: [], clusters: [], regime: 'stable', _t: 0,
  };
}

function stepWorld(w, dt) {
  const { N, posX, posY, posZ, velX, velY, velZ, pSpeed, field, cfg } = w;
  const dtF = Math.min(dt, 0.033) * 60 * field.speed;
  const t   = w._t; w._t += dt * 0.1;
  const VMAX = cfg.vmax, BXY = cfg.bound, BZ = cfg.boundZ * cfg.depth;
  const WK = cfg.wallK, WZ = cfg.wallZ;
  const HB = BXY + 0.4, HBZ = BZ + 0.4;

  for (let i = 0; i < N; i++) {
    let px = posX[i], py = posY[i], pz = posZ[i];
    let vx = velX[i], vy = velY[i], vz = velZ[i];
    if (!isFinite(px)) { posX[i]=posY[i]=posZ[i]=velX[i]=velY[i]=velZ[i]=0; continue; }
    if (field.curl > 0.001) {
      const { cx, cy, cz } = curlNoise(px*0.32, py*0.32, pz*0.18, t);
      vx += cx*field.curl*0.011*dtF; vy += cy*field.curl*0.011*dtF; vz += cz*field.curl*0.005*dtF;
    }
    for (const at of w.attractors) {
      const dx = at.x-px, dy = at.y-py, dz = at.z-pz;
      const d2 = dx*dx + dy*dy + dz*dz + 0.4, d = Math.sqrt(d2);
      const f = at.mass * field.structure * field.attention * 0.016 / d2;
      vx += dx/d*f*dtF; vy += dy/d*f*dtF; vz += dz/d*f*dtF*0.35;
    }
    vx += (Math.random()-0.5)*field.entropy*0.016*dtF;
    vy += (Math.random()-0.5)*field.entropy*0.016*dtF;
    vz += (Math.random()-0.5)*field.entropy*0.005*dtF;
    for (const st of w.stresses) {
      const dx = px-st.x, dy = py-st.y, dz = pz-st.z;
      const d2 = dx*dx+dy*dy+dz*dz+0.01, d = Math.sqrt(d2);
      if (d < st.radius*3) { const f=st.strength*st.life/(d2*14); vx+=dx/d*f*dtF; vy+=dy/d*f*dtF; vz+=dz/d*f*dtF*0.25; }
    }
    const dxw = BXY-Math.abs(px), dyw = BXY-Math.abs(py), dzw = BZ-Math.abs(pz);
    if (dxw<WZ) vx += Math.sign(-px)*WK*(WZ-dxw)*dtF;
    if (dyw<WZ) vy += Math.sign(-py)*WK*(WZ-dyw)*dtF;
    if (dzw<WZ) vz += Math.sign(-pz)*WK*(WZ-dzw)*dtF;
    const dk = 1 - field.damping*0.8; vx*=dk; vy*=dk; vz*=dk;
    const vm = Math.sqrt(vx*vx+vy*vy+vz*vz);
    if (vm > VMAX) { const sc=VMAX/vm; vx*=sc; vy*=sc; vz*=sc; }
    px += vx*dtF; py += vy*dtF; pz += vz*dtF;
    if (px> HB){px= HB;vx*=-0.3;} if (px<-HB){px=-HB;vx*=-0.3;}
    if (py> HB){py= HB;vy*=-0.3;} if (py<-HB){py=-HB;vy*=-0.3;}
    if (pz> HBZ){pz= HBZ;vz*=-0.3;} if (pz<-HBZ){pz=-HBZ;vz*=-0.3;}
    posX[i]=px; posY[i]=py; posZ[i]=pz; velX[i]=vx; velY[i]=vy; velZ[i]=vz;
    pSpeed[i] = Math.min(1, Math.sqrt(vx*vx+vy*vy+vz*vz)*5.5);
  }
  for (const st of w.stresses) st.life *= 0.91;
  w.stresses = w.stresses.filter(s => s.life > 0.015);
}

function injectStress(world, x, y, z, strength = 500, radius = 4) {
  world.stresses.push({ x: x ?? 0, y: y ?? 0, z: z ?? 0, strength, radius, life: 1 });
}

function upsertAttractor(world, { id, x, y, z = 0, mass = 1, ...rest }) {
  const idx = world.attractors.findIndex(a => a.id === id);
  const node = { id, x, y, z, mass, ...rest };
  if (idx >= 0) world.attractors[idx] = node;
  else world.attractors.push(node);
}

function removeAttractor(world, id) {
  world.attractors = world.attractors.filter(a => a.id !== id);
}

module.exports = { createWorld, stepWorld, injectStress, upsertAttractor, removeAttractor, DEFAULT_CONFIG };
