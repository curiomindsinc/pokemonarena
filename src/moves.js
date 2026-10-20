// Every move opens with an armored charge (can't be staggered, still takes damage).
// Timings after `charge` are measured from the moment the charge releases.
//
// Per move:
//   tick(f, a, t, dt, w)  runs after release; returns true when the move is over
//   pose(F, dir, a, t)    sprite rect for this moment (t < 0 while charging)
//   fx                    charge-up visuals (glow, orbiting flames, halo, mouth fireball)
//   flash                 [burst scale, screen shake] when the charge releases
//   ai                    range band the rival uses it in; melee moves aren't thrown into armor
// Action flags a move may set: a.rooted (no walking), a.lockFace (no turning).
//   bone                  needs the bone in hand (Cubone line): light swaps to Punch while it's thrown, others lock
//   begin(f, a)           runs as the move starts; cdFor(f, a) overrides the cooldown (Bone Rush combo)
import { FIRE, SUN, DRAGON } from './frames.js';
import { drawSpun } from './fighter.js';

// Grass charge visuals: leaves swirling in, scaled up with the size of the charge.
const LEAF_FX = {
  light: { glow: 0.55, pulse: 0, flames: 2, set: 'leaf', scale: 0.45, orbit: 7, front: 7, spin: 14, halo: 0, ball: 0 },
  heavy: { glow: 0.75, pulse: 14, flames: 3, set: 'leaf', scale: 0.5, orbit: 13, front: 0, spin: 9, halo: 9, ball: 3 },
  special: { glow: 1, pulse: 22, flames: 6, set: 'leaf', scale: 0.5, orbit: 16, front: 0, spin: 6, halo: 14, ball: 5, rise: true },
};

// Water charge visuals: droplets (bubbles for the big ones) swirling in.
const WATER_FX = {
  light: { glow: 0.55, pulse: 0, flames: 2, set: 'drop', scale: 0.45, orbit: 7, front: 7, spin: 14, halo: 0, ball: 0 },
  heavy: { glow: 0.75, pulse: 14, flames: 3, set: 'drop', scale: 0.5, orbit: 13, front: 0, spin: 9, halo: 9, ball: 3 },
  special: { glow: 1, pulse: 22, flames: 6, set: 'bubble', scale: 0.5, orbit: 16, front: 0, spin: 6, halo: 14, ball: 5, rise: true },
};

// Rock charge visuals: pebbles orbiting and pulling in.
const ROCK_FX = {
  light: { glow: 0.5, pulse: 0, flames: 2, set: 'rock', scale: 0.55, orbit: 8, front: 7, spin: 12, halo: 0, ball: 0 },
  heavy: { glow: 0.7, pulse: 12, flames: 4, set: 'rock', scale: 0.6, orbit: 14, front: 0, spin: 7, halo: 10, ball: 0 },
  special: { glow: 0.95, pulse: 18, flames: 7, set: 'rock', scale: 0.6, orbit: 17, front: 0, spin: 5, halo: 16, ball: 0, rise: true },
};

// Ground charge visuals: same pebbles, a little dustier.
const GROUND_FX = {
  light: { ...ROCK_FX.light, spin: 14 },
  heavy: { ...ROCK_FX.heavy },
  special: { ...ROCK_FX.special },
};

// Electric charge visuals: little zigzag sparks crackling in.
const ELEC_FX = {
  light: { glow: 0.6, pulse: 0, flames: 3, set: 'spark', scale: 0.5, orbit: 7, front: 6, spin: 16, halo: 0, ball: 0 },
  heavy: { glow: 0.8, pulse: 18, flames: 4, set: 'spark', scale: 0.55, orbit: 13, front: 0, spin: 10, halo: 9, ball: 3 },
  special: { glow: 1, pulse: 30, flames: 7, set: 'spark', scale: 0.55, orbit: 16, front: 0, spin: 8, halo: 14, ball: 0, rise: true },
};

// Ghost charge visuals: purple wisps drifting in.
const GHOST_FX = {
  light: { glow: 0.6, pulse: 0, flames: 3, set: 'wisp', scale: 0.5, orbit: 7, front: 6, spin: 12, halo: 0, ball: 0 },
  heavy: { glow: 0.8, pulse: 14, flames: 4, set: 'wisp', scale: 0.55, orbit: 13, front: 0, spin: 8, halo: 10, ball: 3 },
  special: { glow: 1, pulse: 20, flames: 7, set: 'wisp', scale: 0.55, orbit: 16, front: 0, spin: 6, halo: 14, ball: 0, rise: true },
};

// Flying charge visuals: feathers tumbling in.
const FLY_FX = {
  light: { glow: 0.5, pulse: 0, flames: 3, set: 'feather', scale: 0.5, orbit: 8, front: 6, spin: 14, halo: 0, ball: 0 },
  heavy: { glow: 0.7, pulse: 12, flames: 4, set: 'feather', scale: 0.55, orbit: 14, front: 0, spin: 9, halo: 10, ball: 0 },
  special: { glow: 0.95, pulse: 18, flames: 7, set: 'feather', scale: 0.55, orbit: 17, front: 0, spin: 7, halo: 14, ball: 0, rise: true },
};

// Dragon charge visuals: glinting scales circling in.
const DRAGON_FX = {
  light: { glow: 0.55, pulse: 0, flames: 3, set: 'scale', scale: 0.5, orbit: 7, front: 6, spin: 14, halo: 0, ball: 0 },
  heavy: { glow: 0.75, pulse: 14, flames: 4, set: 'scale', scale: 0.55, orbit: 13, front: 0, spin: 9, halo: 10, ball: 3 },
  special: { glow: 1, pulse: 22, flames: 7, set: 'scale', scale: 0.55, orbit: 17, front: 0, spin: 6, halo: 14, ball: 0, rise: true },
};

// Psychic charge visuals: pink sparkles drawn in.
const PSY_FX = {
  light: { glow: 0.55, pulse: 0, flames: 3, set: 'psy', scale: 0.5, orbit: 7, front: 6, spin: 14, halo: 0, ball: 0 },
  heavy: { glow: 0.75, pulse: 14, flames: 4, set: 'psy', scale: 0.55, orbit: 13, front: 0, spin: 9, halo: 10, ball: 3 },
  special: { glow: 1, pulse: 22, flames: 7, set: 'psy', scale: 0.55, orbit: 17, front: 0, spin: 6, halo: 14, ball: 0, rise: true },
};

// Hyper Beam / Psystrike: energy ball swelling at the mouth while charging; a thick beam
// with a hot core (`core` colour) while firing, thinning out at the very end.
function drawBigBeam(ctx, f, a, w, m, core) {
  const p = f.mouth();
  const mx = p.x, my = p.y - f.sp.mouthH - f.lift;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  if (!a.released) {
    const r = 2 + 6 * (a.t / m.charge) + Math.sin(w.time * 40);
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = f.skin.tint;
    ctx.beginPath(); ctx.arc(mx, my, r * 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI * 2); ctx.fill();
  } else if (a.firing) {
    const ray = w.beamRay(f, m), half = (m.width * f.size) / 2;
    const k = Math.max(0.35, 1 - Math.max(0, a.t - m.charge - m.fire * 0.7) / (m.fire * 0.3));
    const wob = 1 + 0.12 * Math.sin(w.time * 60);
    ctx.translate(mx, my);
    ctx.rotate(f.face);
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = f.skin.tint;
    ctx.fillRect(0, -half * k * wob - 2, ray.len, (half * k * wob + 2) * 2);
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = core;
    ctx.fillRect(0, -half * k * 0.7, ray.len, half * k * 1.4);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, -half * k * 0.35, ray.len, half * k * 0.7);
    // flare where the beam ends
    ctx.globalAlpha = 0.7 * k;
    ctx.fillStyle = f.skin.tint;
    ctx.beginPath(); ctx.arc(ray.len, 0, half * 1.4 * wob, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// Lean into a dash: tip the sprite toward the way it's flying (sideways facings only).
const tilt = (f, k = 0.45) => (Math.abs(Math.cos(f.face)) < 0.3 ? 0 : Math.sign(Math.cos(f.face)) * k);

// Danger wedge on the floor while a cone move charges: dim red, bright flashing red once the aim locks.
function redCone(ctx, f, a, w, m) {
  const p = a.t / m.charge, locked = a.t >= m.charge - m.lock;
  const pulse = 0.6 + 0.4 * Math.sin(w.time * (locked ? 40 : 10));
  const r = m.reach * f.size;
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.scale(1, 1 / 1.4); // floor is seen at an angle
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, r, f.face - m.arc / 2, f.face + m.arc / 2);
  ctx.closePath();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = (locked ? 0.5 : 0.12 + 0.18 * p) * pulse;
  ctx.fillStyle = '#ff2020';
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = locked ? 0.95 : 0.35 + 0.35 * p;
  ctx.strokeStyle = locked ? '#ff7070' : '#ff3030';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

// Volt Tackle / Wild Charge: wrapped in electricity, charge straight down the locked lane.
// Plows through (each foe hit once), stops early on a wall; recoil if it connected.
function chargeDash(m, f, a, t, dt, w) {
  a.rooted = a.lockFace = true;
  if (a.endAt === undefined) {
    a.rushing = t < m.rush;
    if (a.rushing) {
      const dx = Math.cos(f.face) * m.speed * dt, dy = Math.sin(f.face) * m.speed * dt, ox = f.x, oy = f.y;
      f.moveBy(dx, dy);
      f.afterimage();
      if (w.ram(f, m, (a.hit ??= new Set()))) a.landed = true;
      w.crackle(f, 2);
      w.electrify(f, f.x, f.y);
      if (Math.hypot(f.x - ox, f.y - oy) < Math.hypot(dx, dy) * 0.4) a.rushing = false; // wall or shore
    }
    if (!a.rushing) {
      a.endAt = t;
      if (a.landed) w.recoil(f, m.recoil);
    }
  }
  return a.endAt !== undefined && t >= a.endAt + m.recover;
}

// The cursor, pulled in to at most `range` from the user.
function aimPoint(f, range) {
  let dx = f.target.x - f.x, dy = f.target.y - f.y;
  const d = Math.hypot(dx, dy);
  if (d > range) { dx *= range / d; dy *= range / d; }
  return { x: f.x + dx, y: f.y + dy };
}

// Rock punches: dash in, crumbs fly off the fist when it lands.
function rockPunch(m, f, a, t, dt, w) {
  const s = dashIn(f, a, t, dt, m.dash, () => w.melee(f, m));
  if (s === null) return false;
  if (!a.fired) { a.fired = true; w.debris(f.x + Math.cos(f.face) * m.range * f.size, f.y + Math.sin(f.face) * m.range * f.size - 8, 5, f); }
  return t >= s + m.recover;
}

// Danger lane on the floor while a move charges: dim red, then bright flashing red once the aim locks.
function redLane(ctx, f, a, w, m, x0, y0, len, half) {
  const p = a.t / m.charge, locked = a.t >= m.charge - m.lock;
  const pulse = 0.6 + 0.4 * Math.sin(w.time * (locked ? 40 : 10));
  ctx.save();
  ctx.translate(x0, y0);
  ctx.rotate(f.face);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = (locked ? 0.5 : 0.12 + 0.18 * p) * pulse;
  ctx.fillStyle = '#ff2020';
  ctx.fillRect(0, -half - 3, len, (half + 3) * 2);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = locked ? 0.95 : 0.35 + 0.35 * p;
  ctx.strokeStyle = locked ? '#ff7070' : '#ff3030';
  ctx.lineWidth = 1;
  ctx.strokeRect(0, -half, len, half * 2);
  ctx.restore();
}

// Spinning-shell roll shared by Rapid Spin and Withdraw's counter: slides along the
// facing and clips anyone it brushes (each foe at most every `every` s).
function shellRoll(f, a, dt, w, m) {
  f.moveBy(Math.cos(f.face) * m.speed * dt, Math.sin(f.face) * m.speed * dt);
  f.afterimage();
  w.petalRing(f, m, a);
  if (Math.random() < 0.5) w.drip(f);
}

// Shared dash-in for the physical moves: locks the aim, slides forward and stops
// at first contact (`strike` returns true when it lands). If nothing is touched,
// the swing still happens once at the end of the dash.
// Returns the time the strike happened, or null while still dashing.
function dashIn(f, a, t, dt, dash, strike) {
  if (a.struckAt !== undefined) return a.struckAt;
  if (!a.lunge) { a.lunge = { dx: Math.cos(f.face), dy: Math.sin(f.face) }; a.lockFace = true; }
  a.lunging = a.rooted = true;
  f.moveBy(a.lunge.dx * dash.speed * dt, a.lunge.dy * dash.speed * dt);
  f.afterimage();
  if (strike() || t >= dash.time) { a.struckAt = t; a.lunging = a.rooted = false; }
  return a.struckAt ?? null;
}

export const MOVES = {
  // ================= Charmander =================
  scratch: {
    name: 'Scratch', desc: 'short charge, dash at the cursor, staggers',
    cd: 0.6, charge: 0.12, dash: { time: 0.12, speed: 240 }, recover: 0.1,
    dmg: 7, knock: 230, stop: 0.07, stun: 0.4, range: 9, radius: 11, slow: 0.1,
    fx: { glow: 0.55, pulse: 0, flames: 2, set: 'ember', scale: 0.4, orbit: 6, front: 7, spin: 14, halo: 0, ball: 0 },
    ai: { min: 0, max: 44, melee: true },
    tick(f, a, t, dt, w) {
      const s = dashIn(f, a, t, dt, this.dash, () => w.melee(f, this));
      return s !== null && t >= s + this.recover;
    },
    pose: (F, dir, a) => F.atk1[dir][!a.released ? 0 : a.lunging ? 1 : 2],
  },

  ember: {
    name: 'Ember', desc: 'fireball',
    cd: 1.1, charge: 0.25, fireAt: 0.03, recover: 0.2, slow: 0.3,
    dmg: 10, knock: 150, stop: 0.09, stun: 0.3, speed: 210, life: 0.85, proj: 'ember', hitR: 9,
    fx: { glow: 0.75, pulse: 14, flames: 3, set: 'ember', scale: 0.55, orbit: 13, front: 0, spin: 9, halo: 9, ball: 3 },
    flash: [0.4, 0],
    ai: { min: 30, max: 170, lead: true },
    tick(f, a, t, dt, w) {
      if (!a.fired && t >= this.fireAt) { a.fired = true; w.spawnProjectile(f, this); }
      return t >= this.fireAt + this.recover;
    },
    pose: (F, dir) => F.special[dir][0],
  },

  flame: {
    name: 'Flamethrower', desc: 'press together, steer with mouse',
    cd: 6, charge: 0.6, channel: 0.9, recover: 0.15, every: 0.1, slow: 0.25, chargeSlow: 0.15, turn: 4.5,
    dmg: 3, knock: 45, stop: 0.035, stun: 0.16, length: 84,
    fx: { glow: 1, pulse: 22, flames: 6, set: 'wheel', scale: 0.32, orbit: 15, front: 0, spin: 6, halo: 14, ball: 6, rise: true },
    flash: [0.7, 2.5],
    ai: { min: 0, max: 80, telegraph: 'sidestep' },
    tick(f, a, t, dt, w) {
      a.streaming = t < this.channel;
      a.nextTick ??= 0;
      if (a.streaming && t >= a.nextTick) { a.nextTick += this.every; w.flameTick(f, this); }
      return t >= this.channel + this.recover;
    },
    pose: (F, dir, a) => F.atk2[dir][a.released ? 3 : Math.floor(a.t / 0.1) % 2],
  },

  // ================= Charmeleon =================
  slash: {
    name: 'Slash', desc: 'dash in, two wide claw swipes, second staggers',
    cd: 0.75, charge: 0.08, dash: { time: 0.1, speed: 260 }, gap: 0.16, recover: 0.14, slow: 0.25, reach: 20, arc: 2.4,
    // first swipe holds them in place, second one shoves
    hits: [
      { dmg: 5, knock: 50, stun: 0.25, stop: 0.05 },
      { dmg: 7, knock: 240, stun: 0.4, stop: 0.08 },
    ],
    fx: { glow: 0.5, pulse: 0, flames: 2, set: 'ember', scale: 0.4, orbit: 6, front: 8, spin: 16, halo: 0, ball: 0 },
    ai: { min: 0, max: 48, melee: true },
    tick(f, a, t, dt, w) {
      const s = dashIn(f, a, t, dt, this.dash, () => w.cone(f, { ...this, ...this.hits[0] }));
      if (s === null) return false;
      if (!a.second && t >= s + this.gap) {
        a.second = true;
        f.moveBy(Math.cos(f.face) * 4, Math.sin(f.face) * 4); // second swipe steps in
        w.cone(f, { ...this, ...this.hits[1] });
      }
      return t >= s + this.gap + this.recover;
    },
    pose: (F, dir, a) => F.atk[dir][!a.released ? 0 : a.second ? 2 : 1],
  },

  flameWheel: {
    name: 'Flame Wheel', desc: 'roll forward wrapped in fire',
    cd: 1.5, charge: 0.22, roll: 0.3, speed: 240, recover: 0.15, slow: 0.3,
    dmg: 9, knock: 210, stop: 0.06, stun: 0.35,
    fx: { glow: 0.75, pulse: 14, flames: 3, set: 'ember', scale: 0.55, orbit: 12, front: 0, spin: 10, halo: 9, ball: 0 },
    flash: [0.35, 0],
    ai: { min: 18, max: 75 },
    tick(f, a, t, dt, w) {
      a.lockFace = true;
      a.rolling = a.rooted = t < this.roll;
      if (a.rolling) {
        f.moveBy(Math.cos(f.face) * this.speed * dt, Math.sin(f.face) * this.speed * dt);
        f.afterimage();
        w.ram(f, this, a.hit ??= new Set());
        if (Math.random() < 0.7) w.embers(f.x, f.y - 8 * f.size, 1, f);
      }
      return t >= this.roll + this.recover;
    },
    pose: (F, dir, a) => F.walk[dir][a.rolling ? 1 : 0],
    // spin the whole body like a wheel while rolling
    spin: (f, a) => (a.rolling ? (a.t * 28) * (Math.cos(f.face) >= 0 ? 1 : -1) : 0),
    draw(ctx, f, a, w) {
      if (!a.rolling) return;
      const cx = f.x, cy = f.y - f.lift - 9 * f.size;
      const set = FIRE.ember.slice(2);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = f.skin.tint;
      ctx.beginPath(); ctx.arc(cx, cy, 13 * f.size, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      for (let i = 0; i < 8; i++) {
        const ang = a.t * 18 + (i / 8) * Math.PI * 2;
        const r = set[(Math.floor(w.time * 18) + i) % set.length];
        const x = cx + Math.cos(ang) * 11 * f.size, y = cy + Math.sin(ang) * 11 * f.size;
        ctx.drawImage(f.skin.fire, r.x, r.y, r.w, r.h, Math.round(x - r.w * 0.35), Math.round(y - r.h * 0.35), Math.round(r.w * 0.7), Math.round(r.h * 0.7));
      }
    },
  },

  fireSpin: {
    name: 'Fire Spin', desc: 'big fire vortex at the cursor: slows hard + burns, then the ground keeps burning',
    cd: 8, charge: 0.5, recover: 0.25, slow: 0.3, chargeSlow: 0.15, range: 110,
    zone: { kind: 'fire', r: 28, life: 3, tick: 0.25, dmg: 2, slow: 0.2, after: { kind: 'burn', r: 26, life: 4, tick: 0.4, dmg: 2 } },
    fx: { glow: 0.9, pulse: 18, flames: 5, set: 'ember', scale: 0.6, orbit: 14, front: 0, spin: 8, halo: 12, ball: 4, rise: true },
    flash: [0.6, 1.5],
    ai: { min: 0, max: 110, target: true },
    tick(f, a, t, dt, w) {
      if (!a.fired) {
        a.fired = true;
        // drop the vortex at the cursor, clamped to range
        let dx = f.target.x - f.x, dy = f.target.y - f.y;
        const d = Math.hypot(dx, dy);
        if (d > this.range) { dx *= this.range / d; dy *= this.range / d; }
        w.spawnZone(f, this, f.x + dx, f.y + dy);
      }
      return t >= this.recover;
    },
    pose: (F, dir, a) => F.special[dir][a.released ? 1 : Math.floor(a.t / 0.12) % 2],
  },

  // ================= Charizard =================
  wingAttack: {
    name: 'Wing Attack', desc: 'dash in, wide wing swipe, huge shove',
    cd: 0.9, charge: 0.15, dash: { time: 0.12, speed: 220 }, recover: 0.22, slow: 0.2, reach: 26, arc: 1.9,
    dmg: 8, knock: 300, stop: 0.08, stun: 0.4,
    fx: { glow: 0.55, pulse: 0, flames: 2, set: 'ember', scale: 0.45, orbit: 7, front: 9, spin: 14, halo: 0, ball: 0 },
    ai: { min: 0, max: 58, melee: true },
    tick(f, a, t, dt, w) {
      const s = dashIn(f, a, t, dt, this.dash, () => w.cone(f, this));
      if (s === null) return false;
      if (!a.fired) { a.fired = true; w.gust(f, this); }
      return t >= s + this.recover;
    },
    pose(F, dir, a, t) {
      if (!a.released) return F.atk[dir][0];
      if (a.lunging) return F.atk[dir][1];
      return F.atk[dir][t < a.struckAt + 0.08 ? 2 : 3];
    },
  },

  fireBlast: {
    name: 'Fire Blast', desc: 'slow fireball, explodes in a star',
    cd: 2.4, charge: 0.45, fireAt: 0.04, recover: 0.3, slow: 0.25,
    dmg: 14, knock: 220, stop: 0.1, stun: 0.4, speed: 140, life: 1.2, proj: 'blast', hitR: 11, aoe: 24,
    fx: { glow: 0.85, pulse: 16, flames: 4, set: 'ember', scale: 0.6, orbit: 15, front: 0, spin: 8, halo: 11, ball: 6 },
    flash: [0.6, 1.5],
    ai: { min: 40, max: 170, lead: true },
    tick(f, a, t, dt, w) {
      if (!a.fired && t >= this.fireAt) { a.fired = true; w.spawnProjectile(f, this); }
      return t >= this.fireAt + this.recover;
    },
    pose: (F, dir, a) => F.atk[dir][a.released ? 1 : 0],
  },

  blastBurn: {
    name: 'Blast Burn', desc: 'huge fire ring around you, then exhausted',
    cd: 10, charge: 0.9, wave: 0.35, radius: 54, tired: 0.8, slow: 0, chargeSlow: 0,
    dmg: 22, knock: 320, stop: 0.12, stun: 0.5,
    fx: { glow: 1, pulse: 26, flames: 8, set: 'wheel', scale: 0.34, orbit: 16, front: 0, spin: 5, halo: 20, ball: 0, rise: true },
    flash: [1, 5],
    ai: { min: 0, max: 46, telegraph: 'flee' },
    tick(f, a, t, dt, w) {
      a.rooted = true;
      if (!a.fired) { a.fired = true; w.spawnWave(f, this); }
      // spent: puffs of smoke while catching breath
      if (t > this.wave && Math.random() < 0.15) w.smoke(f.x, f.y - 14 * f.size);
      return t >= this.wave + this.tired;
    },
    pose: (F, dir, a, t) => F.special[dir][a.released && t < 0.35 ? 1 : 0],
  },

  // ================= Bulbasaur =================
  tackle: {
    name: 'Tackle', desc: 'dash in body-first, big shove',
    cd: 0.6, charge: 0.12, dash: { time: 0.13, speed: 240 }, recover: 0.12,
    dmg: 6, knock: 260, stop: 0.07, stun: 0.4, range: 6, radius: 9, slow: 0.1,
    fx: LEAF_FX.light,
    ai: { min: 0, max: 44, melee: true },
    tick(f, a, t, dt, w) {
      const s = dashIn(f, a, t, dt, this.dash, () => w.melee(f, this));
      return s !== null && t >= s + this.recover;
    },
    pose: (F, dir, a) => (!a.released ? F.special[dir][0] : F.walk[dir][a.lunging ? 1 : 2]),
  },

  razorLeaf: {
    name: 'Razor Leaf', desc: 'three spinning leaves in a fan',
    cd: 1.2, charge: 0.25, fireAt: 0.03, recover: 0.2, slow: 0.3, spread: 0.22,
    dmg: 4, knock: 90, stop: 0.04, stun: 0.2, speed: 230, life: 0.6, proj: 'leaf', hitR: 7,
    fx: LEAF_FX.heavy,
    flash: [0.4, 0],
    ai: { min: 20, max: 130, lead: true },
    tick(f, a, t, dt, w) {
      if (!a.fired && t >= this.fireAt) {
        a.fired = true;
        for (const off of [-this.spread, 0, this.spread]) w.spawnProjectile(f, this, off);
      }
      return t >= this.fireAt + this.recover;
    },
    pose: (F, dir, a) => F.special[dir][a.released ? 1 : 0],
  },

  leechSeed: {
    name: 'Leech Seed', desc: 'seed latches on, drains HP to heal you',
    cd: 8, charge: 0.45, fireAt: 0.03, recover: 0.25, slow: 0.3, chargeSlow: 0.2,
    dmg: 2, knock: 40, stop: 0.04, stun: 0.15, speed: 230, life: 0.9, proj: 'seed', hitR: 12, home: 2.5,
    seedTime: 4, seedTick: 0.5, drain: 2,
    fx: LEAF_FX.special,
    flash: [0.6, 1],
    ai: { min: 25, max: 150, lead: true },
    tick(f, a, t, dt, w) {
      if (!a.fired && t >= this.fireAt) { a.fired = true; w.spawnProjectile(f, this); }
      return t >= this.fireAt + this.recover;
    },
    pose: (F, dir, a) => F.special2[dir][a.released ? 1 : 0],
  },

  // ================= Ivysaur =================
  vineWhip: {
    name: 'Vine Whip', desc: 'short dash, long vine lash that knocks them back',
    cd: 0.8, charge: 0.14, dash: { time: 0.07, speed: 220 }, reach: 80, extend: 0.11, retract: 0.14, slow: 0.15,
    dmg: 7, knock: 200, stop: 0.06, stun: 0.35,
    fx: LEAF_FX.light,
    ai: { min: 0, max: 88, melee: true },
    tick(f, a, t, dt, w) {
      const s = dashIn(f, a, t, dt, this.dash, () => false);
      if (s === null) return false;
      const u = t - s;
      a.rooted = true;
      a.vine = u < this.extend ? u / this.extend : Math.max(0, 1 - (u - this.extend) / this.retract);
      // the tip sweeps out; the first foe it reaches is caught
      if (!a.fired && (w.lash(f, this, this.reach * f.size * Math.min(1, u / this.extend)) || u >= this.extend)) a.fired = true;
      return u >= this.extend + this.retract;
    },
    pose: (F, dir, a) => F.special[dir][a.vine !== undefined ? 1 : 0],
    draw(ctx, f, a, w) {
      if (!a.vine) return;
      const m = f.mouth();
      const x0 = m.x, y0 = m.y - f.sp.mouthH - f.lift;
      const len = this.reach * f.size * a.vine;
      const dx = Math.cos(f.face), dy = Math.sin(f.face);
      const vine = f.team === 'blue' ? '#d65ac8' : '#58c23a';
      for (const side of [-1, 1]) {
        // two vines a little apart, with a whip-crack wave
        const pts = [];
        for (let i = 0; i <= 8; i++) {
          const d = (i / 8) * len, wave = Math.sin(i * 1.3 + w.time * 30) * 1.5 * (i / 8) + side * 2;
          pts.push([x0 + dx * d - dy * wave, y0 + dy * d * 0.8 + dx * wave]);
        }
        for (const [col, width] of [['#1f4a14', 3], [vine, 1.5]]) {
          ctx.strokeStyle = col;
          ctx.lineWidth = width;
          ctx.beginPath();
          pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
          ctx.stroke();
        }
        const [tx, ty] = pts[pts.length - 1];
        drawSpun(ctx, f.skin.leaf, tx, ty, f.face, 1);
      }
    },
  },

  poisonPowder: {
    name: 'Poison Powder', desc: 'powder cone: +1 poison stack (stacks to 4)',
    cd: 1.6, charge: 0.3, recover: 0.2, slow: 0.3, reach: 64, arc: 1.9, linger: 0.6,
    dmg: 2, chip: true, col: '#d58cff', poison: 1,
    fx: LEAF_FX.heavy,
    ai: { min: 0, max: 66 },
    tick(f, a, t, dt, w) {
      if (!a.fired) { a.fired = true; w.spawnCloud(f, this); }
      return t >= this.recover;
    },
    pose: (F, dir, a) => F.special2[dir][a.released ? 1 : 0],
  },

  petalDance: {
    name: 'Petal Dance', desc: 'petals whirl round you, you run faster for 2.5s, then dizzy',
    cd: 9, charge: 0.6, dance: 2.5, dizzy: 0.8, radius: 22, every: 0.3, slow: 1.35, chargeSlow: 0.15, // slow > 1: sprinting while dancing
    dmg: 4, knock: 120, stop: 0.03, stun: 0.15,
    fx: { ...LEAF_FX.special, set: 'petal' },
    flash: [0.6, 2],
    ai: { min: 0, max: 50, telegraph: 'flee', chase: true },
    armor: (a) => a.released && a.dancing !== false, // can't be knocked out of the dance; dizzy is fair game
    tick(f, a, t, dt, w) {
      a.dancing = t < this.dance;
      if (a.dancing) w.petalRing(f, this, a);
      else a.rooted = true; // dizzy
      return t >= this.dance + this.dizzy;
    },
    pose(F, dir, a, t) {
      if (!a.released) return F.special2[dir][Math.floor(a.t / 0.12) % 2];
      if (a.dancing) return F.walk[dir][Math.floor(t / 0.1) % 3];
      return F.hurt[dir][0];
    },
    draw(ctx, f, a, w) {
      if (!a.released) return;
      const cy = f.y - f.lift - 8 * f.size;
      if (a.dancing) {
        const r = this.radius * f.size;
        for (let i = 0; i < 14; i++) {
          const ang = w.time * 6 + (i / 14) * Math.PI * 2;
          const rr = r * (0.85 + 0.15 * Math.sin(w.time * 9 + i));
          drawSpun(ctx, f.skin.petal, f.x + Math.cos(ang) * rr, cy + Math.sin(ang) * rr * 0.5, ang * 3, 1.3);
        }
        return;
      }
      // dizzy: little stars circling the head
      for (let i = 0; i < 3; i++) {
        const ang = w.time * 8 + (i / 3) * Math.PI * 2;
        ctx.fillStyle = i % 2 ? '#fff6b0' : '#ffd34d';
        ctx.fillRect(Math.round(f.x + Math.cos(ang) * 7), Math.round(cy - 14 * f.size + Math.sin(ang) * 2), 2, 2);
      }
    },
  },

  // ================= Venusaur =================
  bodySlam: {
    name: 'Body Slam', desc: 'big leap, wide shockwave on landing (no direct hit needed)',
    cd: 1, charge: 0.18, dash: { time: 0.2, speed: 220 }, recover: 0.25, slow: 0.1, aoe: 36,
    dmg: 10, knock: 260, stop: 0.1, stun: 0.4,
    fx: { ...LEAF_FX.light, front: 9 },
    ai: { min: 0, max: 80, melee: true },
    tick(f, a, t, dt, w) {
      const s = dashIn(f, a, t, dt, this.dash, () => w.touching(f));
      f.jz = s === null ? 0.45 * Math.sin(Math.PI * Math.min(1, t / this.dash.time)) : 0; // the hop
      if (s === null) return false;
      if (!a.fired) { a.fired = true; w.slam(f, this); }
      return t >= s + this.recover;
    },
    pose: (F, dir, a) => (!a.released ? F.special[dir][0] : a.lunging ? F.special[dir][1] : F.walk[dir][0]),
  },

  sludgeBomb: {
    name: 'Sludge Bomb', desc: 'lobbed at the cursor: splash + poison puddle',
    cd: 1.8, charge: 0.4, fireAt: 0.03, recover: 0.3, slow: 0.25, range: 140, flight: 0.55, arc: 40,
    dmg: 8, knock: 120, stop: 0.06, stun: 0.25, poison: 1, aoe: 30,
    zone: { kind: 'sludge', r: 28, life: 2.5, tick: 0.5, poison: 1 },
    fx: LEAF_FX.heavy,
    flash: [0.5, 1],
    ai: { min: 40, max: 140, target: true },
    tick(f, a, t, dt, w) {
      if (!a.fired && t >= this.fireAt) {
        a.fired = true;
        let dx = f.target.x - f.x, dy = f.target.y - f.y;
        const d = Math.hypot(dx, dy);
        if (d > this.range) { dx *= this.range / d; dy *= this.range / d; }
        w.spawnLob(f, this, f.x + dx, f.y + dy);
      }
      return t >= this.fireAt + this.recover;
    },
    pose: (F, dir, a) => F.special[dir][a.released ? 1 : 0],
  },

  solarBeam: {
    name: 'Solar Beam', desc: 'long charge, red lane shows the path, beam crosses the arena',
    cd: 10, charge: 1, lock: 0.25, chargeTurn: 1.6, fire: 0.7, recover: 0.4, slow: 0, chargeSlow: 0,
    length: 2000, // effectively unlimited: runs until terrain stops it
    width: 14, dmg: 20, knock: 280, stop: 0.1, stun: 0.45,
    fx: { ...LEAF_FX.special, ball: 0, halo: 16 },
    flash: [0.8, 4],
    ai: { min: 40, max: 400, telegraph: 'sidestep' },
    tick(f, a, t, dt, w) {
      a.rooted = a.lockFace = true;
      a.firing = t < this.fire;
      if (a.firing) w.beamHit(f, this, a.hit ??= new Set());
      return t >= this.fire + this.recover;
    },
    pose: (F, dir, a) => F.special2[dir][a.released ? 1 : Math.floor(a.t / 0.15) % 2],
    drawGround(ctx, f, a, w) {
      if (a.released) return;
      const ray = w.beamRay(f, this);
      redLane(ctx, f, a, w, this, ray.x0, ray.y0, ray.len, (this.width * f.size) / 2);
    },
    // Sun gathering at the mouth while charging; the beam itself while firing.
    draw(ctx, f, a, w) {
      const m = f.mouth();
      const mx = m.x, my = m.y - f.sp.mouthH - f.lift;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      if (!a.released) {
        const r = SUN.orb[0], s = 0.25 + 0.6 * (a.t / this.charge);
        ctx.globalAlpha = 0.9;
        ctx.drawImage(f.skin.sun, r.x, r.y, r.w, r.h, Math.round(mx - (r.w * s) / 2), Math.round(my - (r.h * s) / 2), Math.round(r.w * s), Math.round(r.h * s));
      } else if (a.firing) {
        const ray = w.beamRay(f, this), half = (this.width * f.size) / 2;
        const k = 1 - Math.max(0, a.t - this.charge - this.fire * 0.6) / (this.fire * 0.4); // thins out at the end
        ctx.translate(mx, my);
        ctx.rotate(f.face);
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = f.team === 'blue' ? '#ff8ae8' : '#d8ff7a';
        ctx.fillRect(0, -half * k - 1, ray.len, (half * k + 1) * 2);
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, -half * k * 0.45, ray.len, half * k * 0.9);
      }
      ctx.restore();
    },
  },

  // ================= Squirtle =================
  waterGun: {
    name: 'Water Gun', desc: 'quick jet of water: pushes + soaks',
    cd: 0.5, charge: 0.1, fireAt: 0.02, recover: 0.14, slow: 0.4,
    dmg: 5, knock: 170, stop: 0.05, stun: 0.25, speed: 320, life: 0.32, proj: 'jet', hitR: 7, soak: 1,
    fx: WATER_FX.light,
    ai: { min: 0, max: 100, lead: true },
    tick(f, a, t, dt, w) {
      if (!a.fired && t >= this.fireAt) { a.fired = true; w.spawnProjectile(f, this); }
      return t >= this.fireAt + this.recover;
    },
    pose: (F, dir, a, t) => F.special[dir][!a.released ? 0 : t < 0.08 ? 1 : 2],
  },

  rapidSpin: {
    name: 'Rapid Spin', desc: 'spin through them in your shell; shakes off poison, seeds + soak',
    cd: 1.6, charge: 0.2, roll: 0.38, speed: 230, recover: 0.15, slow: 0.3, radius: 11, every: 0.12,
    dmg: 3, knock: 140, stop: 0.03, stun: 0.25,
    fx: WATER_FX.heavy,
    flash: [0.35, 0],
    ai: { min: 14, max: 80 },
    tick(f, a, t, dt, w) {
      a.lockFace = true;
      if (!a.cleansed) {
        a.cleansed = true;
        if (f.cleanse()) w.texts.push({ x: f.x, y: f.y - 30 * f.size, txt: 'SHOOK IT OFF', col: '#cfefff', t: 0, small: true });
      }
      a.rolling = a.rooted = t < this.roll;
      if (a.rolling) shellRoll(f, a, dt, w, this);
      return t >= this.roll + this.recover;
    },
    pose: (F, dir, a) => (a.rolling ? F.shell[dir][0] : F.walk[dir][0]),
    spin: (f, a) => (a.rolling ? a.t * 30 : 0),
  },

  bubbleBeam: {
    name: 'Bubble Beam', desc: 'spray of bubbles, steer with mouse: they drift to a stop and float as mines',
    cd: 7, charge: 0.45, stream: 0.4, every: 0.022, recover: 0.2, slow: 0.35, chargeSlow: 0.2, spread: 0.22, turn: 3,
    dmg: 4, knock: 70, stop: 0.03, stun: 0.15, speed: 150, drag: 1.6, life: 3.8, proj: 'bubble', hitR: 7, soak: 1, wobble: 30,
    gap: 0.08, cap: 30, // gap: one bubble per target per 0.08 s, so point-blank spray cannot melt; cap: most floating at once
    fx: WATER_FX.special,
    flash: [0.6, 1],
    ai: { min: 20, max: 140, lead: true },
    tick(f, a, t, dt, w) {
      a.next ??= 0;
      if (t < this.stream && t >= a.next) {
        a.next += this.every;
        w.spawnProjectile(f, this, (Math.random() - 0.5) * 2 * this.spread, this.speed * (0.8 + Math.random() * 0.4));
        // too many floating: oldest one pops
        const mine = w.projectiles.filter((p) => p.owner === f && p.m === this && !p.dead);
        if (mine.length > this.cap) { mine[0].dead = true; w.impactFx(mine[0], 0.4, 2); }
      }
      return t >= this.stream + this.recover;
    },
    pose: (F, dir, a, t) => F.special[dir][!a.released ? 0 : 1 + (Math.floor(t / 0.08) % 2)],
  },

  // ================= Wartortle =================
  bite: {
    name: 'Bite', desc: 'dash in and chomp, staggers',
    cd: 0.65, charge: 0.12, dash: { time: 0.12, speed: 250 }, recover: 0.12, slow: 0.1,
    dmg: 8, knock: 210, stop: 0.08, stun: 0.4, range: 10, radius: 11,
    fx: WATER_FX.light,
    ai: { min: 0, max: 46, melee: true },
    tick(f, a, t, dt, w) {
      const s = dashIn(f, a, t, dt, this.dash, () => w.melee(f, this));
      if (s === null) return false;
      if (!a.fired) {
        a.fired = true;
        w.chomp(f.x + Math.cos(f.face) * this.range * f.size, f.y + Math.sin(f.face) * this.range * f.size - 9 * f.size);
      }
      return t >= s + this.recover;
    },
    pose: (F, dir, a) => (!a.released ? F.special[dir][0] : a.lunging ? F.walk[dir][1] : F.special[dir][1]),
  },

  waterPulse: {
    name: 'Water Pulse', desc: 'ring of water that widens as it flies',
    cd: 1.4, charge: 0.28, fireAt: 0.03, recover: 0.22, slow: 0.3,
    dmg: 9, knock: 180, stop: 0.07, stun: 0.3, speed: 175, life: 0.8, proj: 'pulse', hitR: 5, grow: 14, soak: 1,
    fx: WATER_FX.heavy,
    flash: [0.4, 0],
    ai: { min: 25, max: 140, lead: true },
    tick(f, a, t, dt, w) {
      if (!a.fired && t >= this.fireAt) { a.fired = true; w.spawnProjectile(f, this); }
      return t >= this.fireAt + this.recover;
    },
    pose: (F, dir, a) => F.special[dir][a.released ? 1 : 0],
  },

  withdraw: {
    name: 'Withdraw', desc: 'hide in your shell: blocks a hit, then spins back at them',
    cd: 6, charge: 0.08, guardTime: 0.9, recover: 0.35, roll: 0.42, speed: 300, radius: 12, every: 0.5, slow: 0, chargeSlow: 0,
    dmg: 12, knock: 300, stop: 0.08, stun: 0.45,
    fx: WATER_FX.light,
    ai: { min: 0, max: 90, guard: true },
    guard: (a) => !!a.guarding && a.counter === undefined,
    armor: (a) => !!a.rolling,
    tick(f, a, t, dt, w) {
      a.rooted = true;
      if (a.counter === undefined) {
        a.guarding = t < this.guardTime;
        return !a.guarding && t >= this.guardTime + this.recover;
      }
      // blocked something: roll back at whoever threw it
      if (a.spinAt === undefined) { a.spinAt = t; a.guarding = false; f.face = a.counter; a.lockFace = true; w.ring(f.x, f.y - 10 * f.size, '220,245,255'); }
      const u = t - a.spinAt;
      a.rolling = u < this.roll;
      if (a.rolling) shellRoll(f, a, dt, w, this);
      return u >= this.roll + 0.15;
    },
    pose: (F, dir, a) => (a.guarding || a.rolling ? F.shell[dir][0] : !a.released ? F.special[dir][0] : F.walk[dir][0]),
    spin: (f, a) => (a.rolling ? a.t * 32 : 0),
    // shimmering shell outline while the guard is up
    draw(ctx, f, a, w) {
      if (!a.guarding) return;
      const k = f.size, left = 1 - (a.t - this.charge) / this.guardTime;
      ctx.strokeStyle = `rgba(220,245,255,${0.4 + 0.4 * Math.abs(Math.sin(w.time * 14))})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(f.x, f.y - 7 * k, 11 * k, 8 * k * (0.6 + 0.4 * left), 0, 0, Math.PI * 2);
      ctx.stroke();
    },
  },

  // ================= Blastoise =================
  skullBash: {
    name: 'Skull Bash', desc: 'tuck in, then ram head-first: huge shove',
    cd: 1.1, charge: 0.22, dash: { time: 0.16, speed: 235 }, recover: 0.22, slow: 0.1,
    dmg: 11, knock: 330, stop: 0.1, stun: 0.45, range: 13, radius: 14,
    fx: { ...WATER_FX.light, front: 10 },
    ai: { min: 0, max: 62, melee: true },
    tick(f, a, t, dt, w) {
      const s = dashIn(f, a, t, dt, this.dash, () => w.melee(f, this));
      return s !== null && t >= s + this.recover;
    },
    pose: (F, dir, a) => (!a.released || a.lunging ? F.special[dir][0] : F.walk[dir][0]),
  },

  hydroPump: {
    name: 'Hydro Pump', desc: 'lob a hose of water at the cursor, swing it around: soaks + wets the floor',
    cd: 3, charge: 0.35, channel: 1.1, every: 0.04, recover: 0.2, slow: 0, chargeSlow: 0.3, turn: 3.2,
    near: 30, range: 130, reachRate: 170, flight: 0.32, arc: 26, proj: 'glob',
    dmg: 3, knock: 110, stop: 0.03, stun: 0.18, soak: 1, aoe: 11, gap: 0.2,
    zone: { kind: 'wet', r: 15, life: 4, slow: 0.6 },
    fx: { ...WATER_FX.heavy, ball: 0 },
    flash: [0.6, 2],
    ai: { min: 30, max: 130 },
    // landing distance follows the cursor (clamped), eased so the stream sweeps rather than jumps
    want(f) { return Math.max(this.near, Math.min(this.range, Math.hypot(f.target.x - f.x, f.target.y - f.y))); },
    landing(f, a) {
      const d = a.reach ?? this.want(f);
      return { x: f.x + Math.cos(f.face) * d, y: f.y + Math.sin(f.face) * d };
    },
    tick(f, a, t, dt, w) {
      a.rooted = true;
      a.reach ??= this.want(f);
      const step = this.reachRate * dt;
      a.reach += Math.max(-step, Math.min(step, this.want(f) - a.reach));
      if (!a.recoil) { a.recoil = true; f.kvx -= Math.cos(f.face) * 60; f.kvy -= Math.sin(f.face) * 60; }
      a.spraying = t < this.channel;
      a.next ??= 0;
      if (a.spraying && t >= a.next) {
        a.next += this.every;
        const p = this.landing(f, a);
        w.spawnLob(f, this, p.x + (Math.random() - 0.5) * 8, p.y + (Math.random() - 0.5) * 6);
      }
      return t >= this.channel + this.recover;
    },
    pose: (F, dir, a) => F.atk[dir][a.released ? 1 : 0],
    // red splash ring where the hose comes down
    drawGround(ctx, f, a, w) {
      if (a.released && !a.spraying) return;
      const p = this.landing(f, a), r = this.aoe + 4;
      const pulse = 0.6 + 0.4 * Math.sin(w.time * (a.released ? 40 : 10));
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (a.released ? 0.5 : 0.15 + 0.25 * (a.t / this.charge)) * pulse;
      ctx.fillStyle = '#ff2020';
      ctx.beginPath(); ctx.ellipse(p.x, p.y, r, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = a.released ? 0.95 : 0.5;
      ctx.strokeStyle = a.released ? '#ff7070' : '#ff3030';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, r, r * 0.5, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    },
    // spray kicking off the shoulder cannons
    draw(ctx, f, a, w) {
      if (!a.spraying || Math.random() > 0.6) return;
      const m = f.mouth(), cols = w.waterSparks(f);
      const s = 50 + Math.random() * 40, ang = f.face + (Math.random() - 0.5) * 0.6;
      w.particles.push({ x: m.x, y: m.y - f.sp.mouthH - f.lift, vx: Math.cos(ang) * s, vy: Math.sin(ang) * s - 40, g: 220, life: 0.3, max: 0.3, size: 1, col: cols[Math.floor(Math.random() * 3)] });
    },
  },

  surf: {
    name: 'Surf', desc: 'call a wave (red zone) that rolls forward and carries them off',
    cd: 10, charge: 0.85, lock: 0.2, chargeTurn: 2, recover: 0.35, slow: 0, chargeSlow: 0,
    travel: 0.75, speed: 210, width: 70, length: 158,
    dmg: 12, knock: 300, stop: 0.1, stun: 0.5, soak: 2,
    fx: WATER_FX.special,
    flash: [0.9, 4],
    ai: { min: 0, max: 150, telegraph: 'sidestep' },
    tick(f, a, t, dt, w) {
      a.rooted = a.lockFace = true;
      if (!a.fired) { a.fired = true; w.spawnSurf(f, this); }
      return t >= this.recover;
    },
    pose: (F, dir, a) => F.atk[dir][a.released ? 1 : 0],
    drawGround(ctx, f, a, w) {
      if (a.released) return;
      redLane(ctx, f, a, w, this, f.x, f.y, this.length, (this.width * f.size) / 2);
    },
  },
  // ================= Geodude =================
  rockSmash: {
    name: 'Rock Smash', desc: 'dash in, stone fist, staggers',
    cd: 0.6, charge: 0.12, dash: { time: 0.12, speed: 240 }, recover: 0.12, slow: 0.1,
    dmg: 7, knock: 230, stop: 0.08, stun: 0.4, range: 10, radius: 11,
    fx: ROCK_FX.light,
    ai: { min: 0, max: 44, melee: true },
    tick(f, a, t, dt, w) { return rockPunch(this, f, a, t, dt, w); },
    // the swipe frame shows through the lunge and just after the hit
    pose: (F, dir, a, t) => F.atk[dir][!a.released ? 0 : a.lunging || t < a.struckAt + 0.1 ? 1 : 2],
  },

  rockThrow: {
    name: 'Rock Throw', desc: 'lob a boulder at the cursor: shatters where it lands',
    cd: 1.4, charge: 0.3, fireAt: 0.03, recover: 0.25, slow: 0.3, range: 130, flight: 0.5, arc: 36, proj: 'boulder',
    dmg: 10, knock: 190, stop: 0.08, stun: 0.35, aoe: 18,
    fx: ROCK_FX.heavy,
    flash: [0.4, 0.5],
    ai: { min: 30, max: 130, target: true },
    tick(f, a, t, dt, w) {
      if (!a.fired && t >= this.fireAt) {
        a.fired = true;
        const p = aimPoint(f, this.range);
        w.spawnLob(f, this, p.x, p.y);
      }
      return t >= this.fireAt + this.recover;
    },
    pose: (F, dir, a) => F.special[dir][a.released ? 3 : 1],
    drawGround(ctx, f, a, w) {
      if (a.released) return;
      const p = aimPoint(f, this.range);
      w.redRing(ctx, p.x, p.y, this.aoe + 4, a.t / this.charge, false);
    },
  },

  magnitude: {
    name: 'Magnitude', desc: 'leap at the cursor and ground pound where you land: random power 6-10 sets the quake size, trips them',
    cd: 6, charge: 0.25, air: 0.3, hop: 70, recover: 0.3, slow: 0, chargeSlow: 0, speed: 340,
    hinder: { mul: 0.6, t: 1.5 }, // tripped: slowed
    fx: ROCK_FX.special,
    flash: [0.6, 2],
    ai: { min: 20, max: 130 },
    // rolled as the charge starts, so the red ring shows the real size
    mag(a) { return (a.mag ??= 6 + Math.floor(Math.random() * 5)); },
    radius(f, a) { return (30 + this.mag(a) * 7) * f.size; },
    tick(f, a, t, dt, w) {
      a.rooted = a.lockFace = true;
      a.from ??= { x: f.x, y: f.y, to: aimPoint(f, this.hop) };
      if (t < this.air) {
        // the leap: glide toward the locked landing spot, arcing up and down
        const k = Math.min(1, (t + dt) / this.air), { x, y, to } = a.from;
        f.moveBy(x + (to.x - x) * k - f.x, y + (to.y - y) * k - f.y);
        f.jz = 0.6 * Math.sin(Math.PI * k);
        return false;
      }
      f.jz = 0;
      if (!a.fired) {
        a.fired = true;
        const n = this.mag(a);
        w.texts.push({ x: f.x, y: f.y - 34, txt: 'MAGNITUDE ' + n + '!', col: n >= 8 ? '#ff9a5a' : '#ffe0a0', t: 0, small: n < 8 });
        w.spawnQuake(f, { ...this, dmg: 4 + Math.round(n * 1.6), knock: 100 + n * 22, stop: 0.07, stun: 0.25 + n * 0.02 }, this.radius(f, a));
      }
      return t >= this.air + this.recover;
    },
    pose: (F, dir, a, t) => (!a.released ? F.special[dir][Math.floor(a.t / 0.08) % 3] : t < 0.3 ? F.walk[dir][1] : F.special[dir][3]),
    drawGround(ctx, f, a, w) {
      // where it lands + how far the quake will reach
      const p = a.from?.to ?? aimPoint(f, this.hop);
      if (a.fired) return;
      w.redRing(ctx, p.x, p.y, this.radius(f, a), a.released ? 1 : a.t / this.charge, a.released || a.t > this.charge - 0.1);
    },
  },

  // ================= Graveler =================
  megaPunch: {
    name: 'Mega Punch', desc: 'dash in, four-fisted smash: big stagger',
    cd: 0.9, charge: 0.18, dash: { time: 0.13, speed: 235 }, recover: 0.2, slow: 0.1,
    dmg: 10, knock: 280, stop: 0.1, stun: 0.45, range: 11, radius: 13,
    fx: ROCK_FX.light,
    ai: { min: 0, max: 48, melee: true },
    tick(f, a, t, dt, w) { return rockPunch(this, f, a, t, dt, w); },
    pose: (F, dir, a, t) => F.atk[dir][!a.released ? 0 : a.lunging || t < a.struckAt + 0.1 ? 1 : 2],
  },

  rockBlast: {
    name: 'Rock Blast', desc: 'rapid volley of 3-5 rocks, steer with the mouse: each rock hits on its own',
    cd: 1.8, charge: 0.3, every: 0.1, recover: 0.2, slow: 0.3, chargeSlow: 0.3, turn: 4, spread: 0.08,
    dmg: 4, knock: 70, stop: 0.05, stun: 0.25, speed: 250, life: 0.6, proj: 'rockshot', hitR: 7,
    fx: ROCK_FX.heavy,
    flash: [0.4, 0.5],
    ai: { min: 15, max: 130, lead: true },
    // volley size rolled as the charge starts
    count(a) { return (a.count ??= 3 + Math.floor(Math.random() * 3)); },
    tick(f, a, t, dt, w) {
      const n = this.count(a);
      a.shot ??= 0;
      if (a.shot < n && t >= a.shot * this.every) {
        if (!a.shot) w.texts.push({ x: f.x, y: f.y - 30 * f.size, txt: '×' + n, col: '#ffe0a0', t: 0, small: true });
        a.shot++;
        w.spawnProjectile(f, this, (Math.random() - 0.5) * 2 * this.spread);
      }
      return t >= (n - 1) * this.every + this.recover;
    },
    // arms snap out on every throw
    pose: (F, dir, a, t) => F.special[dir][a.released && t % 0.1 < 0.05 ? 1 : 0],
  },

  rockSlide: {
    name: 'Rock Slide', desc: 'boulders rain on red spots ahead of you: every rock that lands on them hits',
    cd: 8, charge: 0.6, lock: 0.2, chargeTurn: 2.2, recover: 0.4, slow: 0, chargeSlow: 0, fall: 0.3, every: 0.06,
    dmg: 6, knock: 60, stop: 0.09, stun: 0.35, aoe: 16, // light shove so the next rocks still land
    width: 50, length: 120, // rough lane, for the rival's sidestep
    spots: [[28, 0], [40, -10], [50, 10], [60, -6], [70, 8], [80, -8], [90, 6], [100, -10], [110, 8], [120, 0]], // [ahead, sideways]
    fx: ROCK_FX.special,
    flash: [0.7, 2.5],
    ai: { min: 20, max: 110, telegraph: 'sidestep' },
    spotsAt(f) {
      const c = Math.cos(f.face), s = Math.sin(f.face);
      return this.spots.map(([d, o]) => ({ x: f.x + c * d * f.size - s * o, y: f.y + s * d * f.size + c * o }));
    },
    tick(f, a, t, dt, w) {
      a.rooted = a.lockFace = true;
      if (!a.fired) {
        a.fired = true;
        this.spotsAt(f).forEach((p, i) => w.spawnDrop(f, this, p.x, p.y, i * this.every, { aoe: this.aoe, heavy: true }));
      }
      return t >= this.recover + this.spots.length * this.every;
    },
    pose: (F, dir, a) => F.special[dir][a.released ? 1 : 0],
    drawGround(ctx, f, a, w) {
      if (a.released) return;
      const locked = a.t >= this.charge - this.lock;
      for (const p of this.spotsAt(f)) w.redRing(ctx, p.x, p.y, this.aoe, a.t / this.charge, locked);
    },
  },

  // ================= Golem =================
  bodyPress: {
    name: 'Body Press', desc: 'short heavy lunge, slams them away',
    cd: 1.1, charge: 0.22, dash: { time: 0.12, speed: 210 }, recover: 0.25, slow: 0.1,
    dmg: 12, knock: 320, stop: 0.11, stun: 0.45, range: 12, radius: 14,
    fx: { ...ROCK_FX.light, front: 10 },
    ai: { min: 0, max: 50, melee: true },
    tick(f, a, t, dt, w) { return rockPunch(this, f, a, t, dt, w); },
    pose: (F, dir, a, t) => F.atk[dir][a.released && (a.lunging || t < a.struckAt + 0.1) ? 1 : 0],
  },

  rollout: {
    name: 'Rollout', desc: 'curl into a boulder, steer with the mouse: builds speed, bounces off what it hits',
    cd: 4, charge: 0.3, roll: 2, recover: 0.35, turn: 2.6, slow: 0, chargeSlow: 0.2, v0: 110, v1: 250, ramp: 1.2,
    radius: 13, every: 0.4, dmg: 6, knock: 170, stop: 0.07, stun: 0.35,
    fx: ROCK_FX.heavy,
    flash: [0.4, 1],
    ai: { min: 0, max: 150, chase: true },
    armor: (a) => !!a.rolling,
    tick(f, a, t, dt, w) {
      a.rooted = true;
      a.rolling = t < this.roll;
      if (!a.rolling) return t >= this.roll + this.recover;
      const k = (a.k = Math.min(1, t / this.ramp)), v = this.v0 + (this.v1 - this.v0) * k;
      const dx = Math.cos(f.face) * v * dt, dy = Math.sin(f.face) * v * dt, ox = f.x, oy = f.y;
      f.moveBy(dx, dy);
      if (Math.hypot(f.x - ox, f.y - oy) < Math.hypot(dx, dy) * 0.4) this.bounce(f, w); // wall or shore
      if (Math.random() < 0.6) w.skid(f.x, f.y);
      // hits harder the faster it's going
      if (w.petalRing(f, { ...this, dmg: Math.round(this.dmg + 8 * k), knock: this.knock + 170 * k }, a)) this.bounce(f, w);
      return false;
    },
    bounce(f, w) {
      f.face += Math.PI;
      w.shake = Math.max(w.shake, 2);
      w.debris(f.x, f.y - 6, 4, f);
    },
    pose: (F, dir, a) => F.atk[dir][a.rolling ? 3 : 2],
    spin: (f, a) => (a.rolling ? a.t * (10 + 14 * (a.k ?? 0)) * (Math.cos(f.face) >= 0 ? 1 : -1) : 0),
  },

  earthquake: {
    name: 'Earthquake', desc: 'stomp: three shockwaves roll out across the ground (jump over them)',
    cd: 11, charge: 0.7, recover: 0.5, slow: 0, chargeSlow: 0, pulses: [0, 0.45, 0.9], radius: 200, speed: 260,
    dmg: 8, knock: 150, stop: 0.07, stun: 0.35,
    fx: ROCK_FX.special,
    flash: [1, 4],
    ai: { min: 0, max: 170 },
    tick(f, a, t, dt, w) {
      a.rooted = true;
      a.n ??= 0;
      while (a.n < this.pulses.length && t >= this.pulses[a.n]) { a.n++; w.spawnQuake(f, this, this.radius); }
      return t >= this.pulses[this.pulses.length - 1] + this.recover;
    },
    // roars on each stomp
    pose: (F, dir, a, t) => F.special[dir][a.released ? (t % 0.45 < 0.15 ? 1 : 0) : Math.floor(a.t / 0.12) % 2],
    drawGround(ctx, f, a, w) {
      if (a.released) return;
      w.redRing(ctx, f.x, f.y, this.radius, a.t / this.charge, a.t > this.charge - 0.2);
    },
  },

  // ================= Cubone line (no bone in hand) =================
  punch: {
    name: 'Punch', desc: 'bone is thrown: weak jab until you catch it',
    cd: 0.45, charge: 0.08, dash: { time: 0.07, speed: 200 }, recover: 0.12, slow: 0.1,
    dmg: 4, knock: 110, stop: 0.05, stun: 0.25, range: 8, radius: 9,
    fx: GROUND_FX.light,
    ai: { min: 0, max: 40, melee: true },
    tick(f, a, t, dt, w) {
      const s = dashIn(f, a, t, dt, this.dash, () => w.melee(f, this));
      return s !== null && t >= s + this.recover;
    },
    pose: (F, dir, a) => (a.released && !a.lunging ? F.special[dir][0] : F.walk[dir][1]),
  },

  // ================= Cubone =================
  boneClub: {
    name: 'Bone Club', desc: 'dash in, bone swing, heavy stagger',
    cd: 0.65, charge: 0.12, dash: { time: 0.12, speed: 240 }, recover: 0.14, slow: 0.1, bone: true,
    dmg: 9, knock: 250, stop: 0.09, stun: 0.42, range: 10, radius: 11,
    fx: GROUND_FX.light,
    ai: { min: 0, max: 44, melee: true },
    tick(f, a, t, dt, w) {
      const s = dashIn(f, a, t, dt, this.dash, () => w.melee(f, this));
      return s !== null && t >= s + this.recover;
    },
    // the arc frame shows through the lunge and just after the hit
    pose: (F, dir, a, t) => F.atk[dir][!a.released ? 0 : a.lunging || t < a.struckAt + 0.1 ? 1 : 2],
  },

  bonemerang: {
    name: 'Bonemerang', desc: 'bone flies to the cursor and back, hits both ways (Punch until you catch it)',
    cd: 1.2, charge: 0.22, fireAt: 0.03, recover: 0.2, slow: 0.3, bone: true,
    range: 110, out: 0.35, hang: 0.12, curve: 0, back: 230, scale: 1, hitR: 8,
    dmg: 7, knock: 80, stop: 0.06, stun: 0.3, // light shove so the trip home can land too
    fx: GROUND_FX.heavy,
    flash: [0.4, 0.5],
    ai: { min: 25, max: 110, target: true },
    tick(f, a, t, dt, w) {
      if (!a.fired && t >= this.fireAt) { a.fired = true; w.throwBone(f, this, aimPoint(f, this.range)); }
      return t >= this.fireAt + this.recover;
    },
    pose: (F, dir, a) => (!a.released ? F.atk[dir][0] : F.special[dir][0]),
  },

  focusEnergy: {
    name: 'Focus Energy', desc: 'armoured charge: next 3 hits deal +50% damage and +40% knockback (6s)',
    cd: 9, charge: 0.6, recover: 0.2, slow: 0.3, chargeSlow: 0.2, hits: 3, time: 6, dmgMul: 1.5, knockMul: 1.4,
    fx: { glow: 1, pulse: 22, flames: 6, set: 'ember', scale: 0.5, orbit: 14, front: 0, spin: 7, halo: 12, ball: 0, rise: true },
    flash: [0.6, 1.5],
    ai: { min: 40, max: 200, buff: true },
    tick(f, a, t, dt, w) {
      if (!a.fired) {
        a.fired = true;
        f.focus = { hits: this.hits, t: this.time, m: this };
        w.texts.push({ x: f.x, y: f.y - 32 * f.size, txt: 'FOCUSED!', col: '#ffb347', t: 0, small: true });
        w.burst(f.x, f.y - 12 * f.size, f.skin, 0.5, 1);
      }
      return t >= this.recover;
    },
    // shaking with effort while charging
    pose: (F, dir, a) => (!a.released ? F.idle[dir][Math.floor(a.t / 0.06) % 2] : F.special[dir][0]),
  },

  // ================= Marowak =================
  boneRush: {
    name: 'Bone Rush', desc: '3-hit bone combo (keep pressing), last hit staggers',
    cd: 0.2, charge: 0.06, dash: { time: 0.07, speed: 220 }, recover: 0.12, slow: 0.1, bone: true, window: 0.7, endCd: 0.75,
    range: 11, radius: 12,
    hits: [
      { dmg: 5, knock: 60, stun: 0.28, stop: 0.05 },
      { dmg: 5, knock: 60, stun: 0.28, stop: 0.05 },
      { dmg: 8, knock: 260, stun: 0.42, stop: 0.09 },
    ],
    fx: GROUND_FX.light,
    ai: { min: 0, max: 46, melee: true },
    // a press soon after the last swing carries the combo on
    begin(f, a) {
      const r = f.rush;
      a.step = r && f.world.time - r.at < this.window && r.step < 2 ? r.step + 1 : 0;
      f.rush = { step: a.step, at: f.world.time };
    },
    cdFor(f, a) { return a.step === 2 ? this.endCd : this.cd; },
    tick(f, a, t, dt, w) {
      const s = dashIn(f, a, t, dt, this.dash, () => w.melee(f, { ...this, ...this.hits[a.step] }));
      if (s === null) return false;
      f.rush.at = w.time;
      return t >= s + this.recover;
    },
    pose: (F, dir, a, t) => F.atk[dir][!a.released ? (a.step === 1 ? 2 : 0) : a.lunging || t < a.struckAt + 0.08 ? 1 : a.step === 1 ? 0 : 2],
  },

  bonemerangPlus: {
    name: 'Bonemerang', desc: 'big bone curves out and back: return hit drags them in (Punch until caught)',
    cd: 1.5, charge: 0.26, fireAt: 0.03, recover: 0.22, slow: 0.3, bone: true,
    range: 150, out: 0.45, hang: 0.1, curve: 0.45, back: 250, scale: 1.3, hitR: 10, pull: 170,
    dmg: 10, knock: 180, stop: 0.07, stun: 0.32,
    fx: GROUND_FX.heavy,
    flash: [0.45, 0.8],
    ai: { min: 30, max: 150, target: true },
    tick(f, a, t, dt, w) {
      if (!a.fired && t >= this.fireAt) { a.fired = true; w.throwBone(f, this, aimPoint(f, this.range)); }
      return t >= this.fireAt + this.recover;
    },
    pose: (F, dir, a) => (!a.released ? F.atk[dir][0] : F.special[dir][0]),
  },

  boneSpikes: {
    name: 'Bone Spike Lane', desc: 'red lane, then bone spikes burst up along it and launch them (jump over)',
    cd: 8, charge: 0.7, lock: 0.2, chargeTurn: 2, recover: 0.35, slow: 0, chargeSlow: 0, bone: true,
    length: 170, width: 22, count: 7, every: 0.06, near: 18, spikeR: 11, life: 0.45,
    dmg: 12, knock: 120, stop: 0.08, stun: 0.45, launch: 0.42,
    fx: GROUND_FX.special,
    flash: [0.7, 2.5],
    ai: { min: 0, max: 170, telegraph: 'sidestep' },
    tick(f, a, t, dt, w) {
      a.rooted = a.lockFace = true;
      if (!a.fired) { a.fired = true; w.spawnSpikes(f, this); }
      return t >= this.recover + this.count * this.every;
    },
    // bone raised while charging, slammed down on release
    pose: (F, dir, a, t) => F.atk[dir][!a.released ? 0 : t < 0.12 ? 1 : 2],
    drawGround(ctx, f, a, w) {
      if (a.released) return;
      redLane(ctx, f, a, w, this, f.x, f.y, this.length * f.size, (this.width * f.size) / 2);
    },
  },

  // ================= Pichu =================
  thunderShock: {
    name: 'Thunder Shock', desc: 'quick zap: +1 static (3 static = paralyzed)',
    cd: 0.5, charge: 0.1, fireAt: 0.02, recover: 0.14, slow: 0.4,
    dmg: 5, knock: 120, stop: 0.05, stun: 0.25, speed: 300, life: 0.32, proj: 'zap', hitR: 7, static: 1,
    fx: ELEC_FX.light,
    ai: { min: 0, max: 100, lead: true },
    tick(f, a, t, dt, w) {
      if (!a.fired && t >= this.fireAt) { a.fired = true; w.spawnProjectile(f, this); }
      return t >= this.fireAt + this.recover;
    },
    pose: (F, dir, a) => (a.released ? F.atk[dir][0] : F.idle[dir][0]),
  },

  nuzzle: {
    name: 'Nuzzle', desc: 'dash in, sparky cheek rub: +2 static',
    cd: 1.4, charge: 0.2, dash: { time: 0.12, speed: 250 }, recover: 0.16, slow: 0.1,
    dmg: 4, knock: 90, stop: 0.08, stun: 0.35, range: 8, radius: 10, static: 2,
    fx: ELEC_FX.heavy,
    ai: { min: 0, max: 44, melee: true },
    tick(f, a, t, dt, w) {
      const s = dashIn(f, a, t, dt, this.dash, () => w.melee(f, this));
      if (s === null) return false;
      if (!a.fired) { a.fired = true; w.crackle(f, 6); }
      return t >= s + this.recover;
    },
    pose: (F, dir, a) => (a.released ? F.atk[dir][0] : F.idle[dir][Math.floor(a.t / 0.06) % 2]),
  },

  voltTackle: {
    name: 'Volt Tackle', desc: 'red lane, then charge down it wrapped in lightning: huge hit, but Pichu takes recoil',
    cd: 8, charge: 0.55, lock: 0.15, chargeTurn: 3, rush: 0.4, speed: 300, recover: 0.3, slow: 0, chargeSlow: 0,
    length: 120, width: 16, // lane = speed × rush
    dmg: 16, knock: 320, stop: 0.12, stun: 0.5, static: 1, recoil: 7,
    fx: ELEC_FX.special,
    flash: [0.7, 2.5],
    ai: { min: 20, max: 120, telegraph: 'sidestep' },
    armor: (a) => !!a.rushing,
    tick(f, a, t, dt, w) { return chargeDash(this, f, a, t, dt, w); },
    pose: (F, dir, a, t) => (!a.released ? F.idle[dir][Math.floor(a.t / 0.05) % 2] : a.rushing ? F.walk[dir][Math.floor(t / 0.05) % 2] : F.atk[dir][0]),
    drawGround(ctx, f, a, w) {
      if (a.released) return;
      redLane(ctx, f, a, w, this, f.x, f.y, this.length, (this.width * f.size) / 2);
    },
    draw(ctx, f, a, w) { if (a.rushing) w.elecAura(ctx, f, 12); },
  },

  // ================= Pikachu =================
  quickAttack: {
    name: 'Quick Attack', desc: 'blink-fast dash at the cursor, hits anything on the way',
    cd: 0.7, charge: 0.08, rush: 0.11, speed: 420, recover: 0.12, slow: 0.1,
    dmg: 6, knock: 210, stop: 0.07, stun: 0.4,
    fx: ELEC_FX.light,
    ai: { min: 0, max: 55, melee: true },
    tick(f, a, t, dt, w) {
      a.lockFace = true;
      a.rushing = a.rooted = t < this.rush;
      if (a.rushing) {
        f.moveBy(Math.cos(f.face) * this.speed * dt, Math.sin(f.face) * this.speed * dt);
        f.afterimage();
        f.afterimage();
        w.ram(f, this, (a.hit ??= new Set()));
      }
      return t >= this.rush + this.recover;
    },
    pose: (F, dir, a) => (a.released && a.rushing ? F.atk[dir][0] : F.idle[dir][0]),
  },

  thunderbolt: {
    name: 'Thunderbolt', desc: 'fast lightning bolt: +1 static',
    cd: 1.3, charge: 0.28, fireAt: 0.03, recover: 0.2, slow: 0.3,
    dmg: 9, knock: 170, stop: 0.07, stun: 0.3, speed: 380, life: 0.45, proj: 'bolt', hitR: 8, static: 1,
    fx: ELEC_FX.heavy,
    flash: [0.45, 0.5],
    ai: { min: 30, max: 160, lead: true },
    tick(f, a, t, dt, w) {
      if (!a.fired && t >= this.fireAt) { a.fired = true; w.spawnProjectile(f, this); }
      return t >= this.fireAt + this.recover;
    },
    pose: (F, dir, a) => F.special[dir][a.released ? 1 : 0],
  },

  thunder: {
    name: 'Thunder', desc: 'red circle at the cursor, then lightning strikes it: big hit + instant paralysis',
    cd: 9, charge: 0.6, recover: 0.3, slow: 0.3, chargeSlow: 0.2, range: 140, delay: 0.5, aoe: 22,
    dmg: 18, knock: 200, stop: 0.12, stun: 0.5, static: 3,
    fx: ELEC_FX.special,
    flash: [0.7, 1.5],
    ai: { min: 30, max: 140, target: true },
    tick(f, a, t, dt, w) {
      if (!a.fired) { a.fired = true; const p = aimPoint(f, this.range); w.spawnStrike(f, this, p.x, p.y); }
      return t >= this.recover;
    },
    pose: (F, dir, a) => F.special[dir][a.released ? 1 : Math.floor(a.t / 0.1) % 2],
    drawGround(ctx, f, a, w) {
      if (a.released) return;
      const p = aimPoint(f, this.range);
      w.redRing(ctx, p.x, p.y, this.aoe, a.t / this.charge, a.t > this.charge - 0.15);
    },
  },

  // ================= Raichu =================
  spark: {
    name: 'Spark', desc: 'long armoured electric dash at the cursor: stops on the first foe it hits, +1 static',
    cd: 1.2, charge: 0.1, rush: 0.25, speed: 440, recover: 0.16, slow: 0.1,
    dmg: 6, knock: 180, stop: 0.07, stun: 0.35, static: 1,
    fx: ELEC_FX.light,
    ai: { min: 0, max: 110, melee: true },
    armor: (a) => !!a.rushing,
    tick(f, a, t, dt, w) {
      a.lockFace = true;
      a.rushing = a.rooted = a.endAt === undefined && t < this.rush;
      if (a.rushing) {
        f.moveBy(Math.cos(f.face) * this.speed * dt, Math.sin(f.face) * this.speed * dt);
        f.afterimage();
        w.crackle(f, 2);
        if (w.ram(f, this, (a.hit ??= new Set()))) { a.endAt = t; a.rushing = a.rooted = false; }
      }
      return t >= (a.endAt ?? this.rush) + this.recover;
    },
    pose: (F, dir, a, t) => (!a.released ? F.special[dir][0] : a.rushing ? F.walk[dir][Math.floor(t / 0.05) % 3] : F.atk[dir][0]),
    draw(ctx, f, a, w) { if (a.rushing) w.elecAura(ctx, f, 12); },
  },

  thunderWave: {
    name: 'Thunder Wave', desc: 'crackling ring of static: +2 static and slows them 40% for 2s',
    cd: 2.5, charge: 0.25, fireAt: 0.03, recover: 0.2, slow: 0.3,
    dmg: 3, knock: 60, stop: 0.04, stun: 0.2, speed: 260, life: 0.6, proj: 'twave', hitR: 9, static: 2,
    hinder: { mul: 0.6, t: 2 },
    fx: ELEC_FX.heavy,
    flash: [0.45, 0.5],
    ai: { min: 30, max: 150, lead: true },
    tick(f, a, t, dt, w) {
      if (!a.fired && t >= this.fireAt) { a.fired = true; w.spawnProjectile(f, this); }
      return t >= this.fireAt + this.recover;
    },
    pose: (F, dir, a) => F.special[dir][a.released ? 1 : 0],
  },

    wildCharge: {
    name: 'Wild Charge', desc: 'red lane, then a long electric charge down it: plows through, recoil if it hits',
    cd: 5, charge: 0.7, lock: 0.2, chargeTurn: 2.5, rush: 0.5, speed: 330, recover: 0.35, slow: 0, chargeSlow: 0,
    length: 165, width: 24,
    dmg: 18, knock: 340, stop: 0.12, stun: 0.5, static: 2, recoil: 6,
    fx: ELEC_FX.special,
    flash: [0.8, 3],
    ai: { min: 20, max: 165, telegraph: 'sidestep' },
    armor: (a) => !!a.rushing,
    tick(f, a, t, dt, w) { return chargeDash(this, f, a, t, dt, w); },
    pose: (F, dir, a, t) => (!a.released ? F.special[dir][Math.floor(a.t / 0.1) % 2] : a.rushing ? F.walk[dir][Math.floor(t / 0.05) % 3] : F.atk[dir][0]),
    drawGround(ctx, f, a, w) {
      if (a.released) return;
      redLane(ctx, f, a, w, this, f.x, f.y, this.length, (this.width * f.size) / 2);
    },
    draw(ctx, f, a, w) { if (a.rushing) w.elecAura(ctx, f, 15); },
  },

  // ================= Gastly =================
  lick: {
    name: 'Lick', desc: 'dart in, slimy tongue: staggers, +1 curse (each curse = +10% damage taken)',
    cd: 0.55, charge: 0.1, dash: { time: 0.1, speed: 230 }, recover: 0.14, slow: 0.1,
    dmg: 5, knock: 160, stop: 0.07, stun: 0.38, range: 9, radius: 10, curse: 1,
    fx: GHOST_FX.light,
    ai: { min: 0, max: 42, melee: true },
    tick(f, a, t, dt, w) {
      const s = dashIn(f, a, t, dt, this.dash, () => w.melee(f, this));
      return s !== null && t >= s + this.recover;
    },
    pose: (F, dir, a) => F.special[dir][a.released ? 1 : 0],
  },

  confuseRay: {
    name: 'Confuse Ray', desc: 'wobbly orb that bends toward them: confused 1.5s (walking + dashing go the wrong way)',
    cd: 2, charge: 0.3, fireAt: 0.03, recover: 0.2, slow: 0.3,
    dmg: 4, knock: 60, stop: 0.05, stun: 0.2, speed: 240, life: 1, proj: 'confuse', hitR: 11, wobble: 10, home: 3.5, confuse: 1.5,
    fx: GHOST_FX.heavy,
    flash: [0.45, 0.5],
    ai: { min: 20, max: 150, lead: true },
    tick(f, a, t, dt, w) {
      if (!a.fired && t >= this.fireAt) { a.fired = true; w.spawnProjectile(f, this); }
      return t >= this.fireAt + this.recover;
    },
    pose: (F, dir, a) => F.walk[dir][a.released ? 2 : Math.floor(a.t / 0.08) % 2],
  },

  hypnosis: {
    name: 'Hypnosis', desc: 'widening hypnotic rings: asleep 2.5s, the hit that wakes them deals +50%',
    cd: 8, charge: 0.35, fireAt: 0.03, recover: 0.25, slow: 0.3, chargeSlow: 0.2,
    dmg: 2, chip: true, col: '#d0a0ff', speed: 170, life: 0.85, proj: 'hypno', hitR: 10, grow: 38, sleep: 2.5,
    fx: GHOST_FX.special,
    flash: [0.6, 1],
    ai: { min: 0, max: 110, lead: true },
    tick(f, a, t, dt, w) {
      if (!a.fired && t >= this.fireAt) { a.fired = true; w.spawnProjectile(f, this); }
      return t >= this.fireAt + this.recover;
    },
    // eyes wide, gas swirling
    pose: (F, dir, a) => F.walk[dir][a.released ? 0 : Math.floor(a.t / 0.06) % 3],
  },

  // ================= Haunter =================
  shadowClaw: {
    name: 'Shadow Claw', desc: 'dash in, two hand slashes: second staggers + curses',
    cd: 0.75, charge: 0.1, dash: { time: 0.1, speed: 250 }, gap: 0.16, recover: 0.16, slow: 0.25, reach: 22, arc: 2.4,
    hits: [
      { dmg: 5, knock: 50, stun: 0.25, stop: 0.05 },
      { dmg: 7, knock: 240, stun: 0.4, stop: 0.08, curse: 1 },
    ],
    fx: GHOST_FX.light,
    ai: { min: 0, max: 48, melee: true },
    tick(f, a, t, dt, w) {
      const s = dashIn(f, a, t, dt, this.dash, () => w.cone(f, { ...this, ...this.hits[0] }));
      if (s === null) return false;
      if (!a.second && t >= s + this.gap) {
        a.second = true;
        f.moveBy(Math.cos(f.face) * 4, Math.sin(f.face) * 4);
        w.cone(f, { ...this, ...this.hits[1] });
      }
      return t >= s + this.gap + this.recover;
    },
    // sheet combo: 1 hands up, 2 left slash, 3 reset, 5 right slash, 6 follow-through
    pose(F, dir, a, t) {
      if (!a.released) return F.atk[dir][1];
      if (!a.second) return F.atk[dir][a.lunging || t < (a.struckAt ?? 0) + 0.08 ? 2 : 3];
      return F.atk[dir][t < a.struckAt + this.gap + 0.08 ? 5 : 6];
    },
  },

  shadowHand: {
    name: 'Shadow Hand', desc: 'fling a floating hand: it homes in, +1 curse',
    cd: 1.3, charge: 0.25, fireAt: 0.03, recover: 0.2, slow: 0.3,
    dmg: 8, knock: 170, stop: 0.07, stun: 0.32, speed: 220, life: 0.9, proj: 'hand', hitR: 8, home: 5, curse: 1,
    fx: GHOST_FX.heavy,
    flash: [0.45, 0.5],
    ai: { min: 25, max: 150, lead: true },
    tick(f, a, t, dt, w) {
      if (!a.fired && t >= this.fireAt) { a.fired = true; w.spawnProjectile(f, this); }
      return t >= this.fireAt + this.recover;
    },
    pose: (F, dir, a) => F.atk[dir][a.released ? 3 : 1],
  },

  phantomForce: {
    name: 'Phantom Force', desc: 'vanish (untouchable), then rise behind them: red circle flashes just before the backstab',
    cd: 8, charge: 0.25, dive: 0.6, lock: 0.25, behind: 4, recover: 0.3, slow: 0, chargeSlow: 0, aoe: 30,
    dmg: 18, knock: 300, stop: 0.12, stun: 0.5, curse: 2,
    fx: GHOST_FX.special,
    flash: [0.6, 1.5],
    ai: { min: 0, max: 200 },
    hidden: (a) => !!a.sunk,
    tick(f, a, t, dt, w) {
      a.rooted = true;
      a.sunk = t < this.dive;
      if (a.sunk) {
        f.phaseT = Math.max(f.phaseT, 0.05);
        // the rise point is picked (and shown) a moment early so it can be dodged
        if (!a.rise && t >= this.dive - this.lock) a.rise = w.ambushPoint(f, this.behind);
        return false;
      }
      if (!a.fired) {
        a.fired = a.lockFace = true;
        f.phaseT = 0;
        const p = a.rise ?? w.ambushPoint(f, this.behind);
        f.x = p.x; f.y = p.y; f.face = p.face;
        w.shadowBurst(f, this, p.x, p.y, this.aoe);
      }
      return t >= this.dive + this.recover;
    },
    pose: (F, dir, a) => (a.released ? F.special[dir][2] : F.idle[dir][0]),
    drawGround(ctx, f, a, w) {
      if (!a.sunk || !a.rise) return;
      w.shadowPool(ctx, a.rise.x, a.rise.y, 12 * f.size);
      w.redRing(ctx, a.rise.x, a.rise.y, this.aoe, 1, true);
    },
  },

  // ================= Gengar =================
  shadowPunch: {
    name: 'Shadow Punch', desc: 'dash in, shadow-charged haymaker: big stagger, +1 curse',
    cd: 0.85, charge: 0.15, dash: { time: 0.13, speed: 240 }, recover: 0.2, slow: 0.1,
    dmg: 11, knock: 290, stop: 0.1, stun: 0.45, range: 12, radius: 13, curse: 1,
    fx: GHOST_FX.light,
    ai: { min: 0, max: 50, melee: true },
    tick(f, a, t, dt, w) {
      const s = dashIn(f, a, t, dt, this.dash, () => w.melee(f, this));
      return s !== null && t >= s + this.recover;
    },
    pose: (F, dir, a, t) => F.atk[dir][!a.released ? 0 : a.lunging || t < a.struckAt + 0.1 ? 1 : 2],
  },

  shadowBall: {
    name: 'Shadow Ball', desc: 'big slow orb, bursts on impact: +1 curse',
    cd: 2.2, charge: 0.4, fireAt: 0.04, recover: 0.3, slow: 0.25,
    dmg: 13, knock: 220, stop: 0.1, stun: 0.4, speed: 150, life: 1.1, proj: 'ball', hitR: 11, aoe: 22, curse: 1,
    fx: GHOST_FX.heavy,
    flash: [0.6, 1.5],
    ai: { min: 35, max: 160, lead: true },
    tick(f, a, t, dt, w) {
      if (!a.fired && t >= this.fireAt) { a.fired = true; w.spawnProjectile(f, this); }
      return t >= this.fireAt + this.recover;
    },
    pose: (F, dir, a) => F.special[dir][a.released ? 1 : 0],
  },

  nightmare: {
    name: 'Nightmare', desc: 'big red circle at the cursor: shadow hands erupt all over it for 1.5s, dragging you in, +1 curse each',
    cd: 10, charge: 0.7, recover: 0.3, slow: 0.3, chargeSlow: 0.15, range: 130, r: 40,
    last: 1.5, every: 0.08, handR: 14, gap: 0.25,
    dmg: 5, knock: 60, stop: 0.05, stun: 0.3, curse: 1,
    fx: GHOST_FX.special,
    flash: [0.8, 2.5],
    ai: { min: 20, max: 130, target: true },
    tick(f, a, t, dt, w) {
      if (!a.fired) { a.fired = true; const p = aimPoint(f, this.range); w.spawnNightmare(f, this, p.x, p.y); }
      return t >= this.recover;
    },
    pose: (F, dir, a) => F.special[dir][a.released ? 2 : Math.floor(a.t / 0.12) % 2],
    drawGround(ctx, f, a, w) {
      if (a.released) return;
      const p = aimPoint(f, this.range);
      w.redRing(ctx, p.x, p.y, this.r, a.t / this.charge, a.t > this.charge - 0.15);
    },
  },

  // ================= Pidgey =================
  peck: {
    name: 'Peck', desc: 'quick dive, beak first: staggers',
    cd: 0.5, charge: 0.08, dash: { time: 0.12, speed: 260 }, recover: 0.12, slow: 0.1,
    dmg: 6, knock: 200, stop: 0.06, stun: 0.38, range: 9, radius: 10,
    fx: FLY_FX.light,
    ai: { min: 0, max: 44, melee: true },
    tick(f, a, t, dt, w) {
      const s = dashIn(f, a, t, dt, this.dash, () => w.melee(f, this));
      return s !== null && t >= s + this.recover;
    },
    pose: (F, dir, a) => F.atk[dir][!a.released ? 0 : a.lunging ? 2 : 0],
    spin: (f, a) => (a.lunging ? tilt(f) : 0),
  },

  gust: {
    name: 'Gust', desc: 'wing beat: wind cone with a big shove, blows their shots away',
    cd: 1.2, charge: 0.22, recover: 0.22, slow: 0.3, reach: 56, arc: 1.5,
    dmg: 5, knock: 270, stop: 0.06, stun: 0.3,
    fx: FLY_FX.heavy,
    flash: [0.4, 0.5],
    ai: { min: 0, max: 56 },
    tick(f, a, t, dt, w) {
      if (!a.fired) { a.fired = true; w.cone(f, this); w.gust(f, this); w.blowAway(f, this); }
      return t >= this.recover;
    },
    pose: (F, dir, a, t) => F.atk[dir][a.released && t < 0.15 ? 2 : 1],
  },

  whirlwind: {
    name: 'Whirlwind', desc: 'red cone, then a gale that hurls them away (ring-out tool)',
    cd: 7, charge: 0.55, lock: 0.15, chargeTurn: 2.5, recover: 0.3, slow: 0, chargeSlow: 0.2, reach: 90, arc: 1.1,
    length: 90, // for the rival's sidestep
    dmg: 4, knock: 460, stop: 0.08, stun: 0.55,
    fx: FLY_FX.special,
    flash: [0.7, 2.5],
    ai: { min: 0, max: 90, telegraph: 'sidestep' },
    tick(f, a, t, dt, w) {
      a.rooted = a.lockFace = true;
      if (!a.fired) { a.fired = true; w.cone(f, this); w.gust(f, this); w.gust(f, this); w.blowAway(f, this); }
      return t >= this.recover;
    },
    pose: (F, dir, a) => F.atk[dir][a.released ? 2 : 1 + (Math.floor(a.t / 0.06) % 2)],
    drawGround(ctx, f, a, w) { if (!a.released) redCone(ctx, f, a, w, this); },
  },

  // ================= Pidgeotto =================
  wingSlash: {
    name: 'Wing Slash', desc: 'dash in, wide wing cut: big shove',
    cd: 0.8, charge: 0.13, dash: { time: 0.11, speed: 240 }, recover: 0.2, slow: 0.2, reach: 24, arc: 2,
    dmg: 9, knock: 280, stop: 0.08, stun: 0.42,
    fx: FLY_FX.light,
    ai: { min: 0, max: 52, melee: true },
    tick(f, a, t, dt, w) {
      const s = dashIn(f, a, t, dt, this.dash, () => w.cone(f, this));
      if (s === null) return false;
      if (!a.fired) { a.fired = true; w.gust(f, this); }
      return t >= s + this.recover;
    },
    pose: (F, dir, a) => F.atk[dir][!a.released ? 1 : a.lunging ? 2 : 0],
    spin: (f, a) => (a.lunging ? tilt(f) : 0),
  },

  airCutter: {
    name: 'Air Cutter', desc: 'two wind blades in a fan',
    cd: 1.3, charge: 0.25, fireAt: 0.03, recover: 0.2, slow: 0.3, spread: 0.06,
    dmg: 5, knock: 140, stop: 0.05, stun: 0.3, speed: 280, life: 0.55, proj: 'blade', hitR: 7,
    fx: FLY_FX.heavy,
    flash: [0.4, 0.5],
    ai: { min: 20, max: 150, lead: true },
    tick(f, a, t, dt, w) {
      if (!a.fired && t >= this.fireAt) {
        a.fired = true;
        for (const off of [-this.spread, this.spread]) w.spawnProjectile(f, this, off);
      }
      return t >= this.fireAt + this.recover;
    },
    pose: (F, dir, a) => F.atk[dir][a.released ? 2 : 1],
  },

  twister: {
    name: 'Twister', desc: 'tornado rolls forward: grabs whoever it touches, spins them along, then flings them',
    cd: 8, charge: 0.5, recover: 0.3, slow: 0.3, chargeSlow: 0.2,
    speed: 110, life: 1.3, r: 14, every: 0.25,
    dmg: 2, knock: 0, stop: 0.02, stun: 0.3, // each spin tick
    fling: { dmg: 7, knock: 300, stop: 0.08, stun: 0.45 },
    fx: FLY_FX.special,
    flash: [0.6, 1.5],
    ai: { min: 15, max: 140 },
    tick(f, a, t, dt, w) {
      if (!a.fired) { a.fired = true; w.spawnTwister(f, this); }
      return t >= this.recover;
    },
    pose: (F, dir, a) => F.atk[dir][a.released ? 2 : 1 + (Math.floor(a.t / 0.08) % 2)],
  },

  // ================= Pidgeot =================
  aerialAce: {
    name: 'Aerial Ace', desc: 'blink to the nearest foe in range and slash: can\'t miss',
    cd: 0.9, charge: 0.1, range: 90, recover: 0.18, slow: 0.1,
    dmg: 7, knock: 220, stop: 0.07, stun: 0.4,
    fx: FLY_FX.light,
    ai: { min: 0, max: 85, melee: true },
    tick(f, a, t, dt, w) {
      if (!a.fired) { a.fired = a.lockFace = true; a.hit = w.aerialAce(f, this); }
      return t >= this.recover;
    },
    pose: (F, dir, a, t) => F.atk[dir][!a.released ? 1 : t < 0.08 ? 2 : 0],
  },

  airSlash: {
    name: 'Air Slash', desc: 'big wind crescent: pierces, staggers',
    cd: 1.6, charge: 0.3, fireAt: 0.03, recover: 0.25, slow: 0.3,
    dmg: 10, knock: 210, stop: 0.08, stun: 0.45, speed: 260, life: 0.7, proj: 'bigblade', hitR: 11, pierce: true,
    fx: FLY_FX.heavy,
    flash: [0.5, 1],
    ai: { min: 25, max: 170, lead: true },
    tick(f, a, t, dt, w) {
      if (!a.fired && t >= this.fireAt) { a.fired = true; w.spawnProjectile(f, this); }
      return t >= this.fireAt + this.recover;
    },
    pose: (F, dir, a) => F.atk[dir][a.released ? 2 : 1],
  },

  hurricane: {
    name: 'Hurricane', desc: 'red circle at the cursor: a 2s storm sucks them in, then flings them out',
    cd: 10, charge: 0.65, recover: 0.3, slow: 0.3, chargeSlow: 0.15, range: 140, r: 44,
    last: 2, every: 0.35, pull: 90,
    dmg: 3, knock: 0, stop: 0.03, stun: 0.25, // each tick
    fling: { dmg: 8, knock: 320, stop: 0.1, stun: 0.5 },
    fx: FLY_FX.special,
    flash: [0.8, 3],
    ai: { min: 20, max: 140, target: true },
    tick(f, a, t, dt, w) {
      if (!a.fired) { a.fired = true; const p = aimPoint(f, this.range); w.spawnHurricane(f, this, p.x, p.y); }
      return t >= this.recover;
    },
    pose: (F, dir, a) => F.atk[dir][a.released ? 2 : 1 + (Math.floor(a.t / 0.08) % 2)],
    drawGround(ctx, f, a, w) {
      if (a.released) return;
      const p = aimPoint(f, this.range);
      w.redRing(ctx, p.x, p.y, this.r, a.t / this.charge, a.t > this.charge - 0.15);
    },
  },

  // ================= Dratini =================
  wrap: {
    name: 'Wrap', desc: 'dash in and coil round them: bound (no walking or dashing) for 0.9s',
    cd: 0.9, charge: 0.12, dash: { time: 0.13, speed: 250 }, recover: 0.14, slow: 0.1,
    dmg: 5, knock: 0, stop: 0.07, stun: 0.2, range: 9, radius: 11, bind: 0.9,
    fx: DRAGON_FX.light,
    ai: { min: 0, max: 44, melee: true },
    tick(f, a, t, dt, w) {
      const s = dashIn(f, a, t, dt, this.dash, () => w.melee(f, this));
      return s !== null && t >= s + this.recover;
    },
    pose: (F, dir, a) => F.atk[dir][a.released ? 1 : 0],
  },

  dragonTwister: {
    name: 'Twister', desc: 'small dragon tornado: pierces, shoves',
    cd: 1.3, charge: 0.25, fireAt: 0.03, recover: 0.2, slow: 0.3,
    dmg: 8, knock: 170, stop: 0.07, stun: 0.32, speed: 170, life: 0.8, proj: 'dtwist', hitR: 9, pierce: true,
    fx: DRAGON_FX.heavy,
    flash: [0.4, 0.5],
    ai: { min: 25, max: 140, lead: true },
    tick(f, a, t, dt, w) {
      if (!a.fired && t >= this.fireAt) { a.fired = true; w.spawnProjectile(f, this); }
      return t >= this.fireAt + this.recover;
    },
    pose: (F, dir, a) => F.special[dir][a.released ? 1 : 0],
  },

  dragonRage: {
    name: 'Dragon Rage', desc: 'red circle at the cursor, then a dragon flare bursts there: always exactly 15 damage',
    cd: 7, charge: 0.45, recover: 0.25, slow: 0.3, chargeSlow: 0.2, range: 130, delay: 0.35, aoe: 18,
    dmg: 15, fixed: true, knock: 160, stop: 0.1, stun: 0.42,
    fx: DRAGON_FX.special,
    flash: [0.6, 1.5],
    ai: { min: 30, max: 130, target: true },
    tick(f, a, t, dt, w) {
      if (!a.fired) { a.fired = true; const p = aimPoint(f, this.range); w.spawnStrike(f, this, p.x, p.y, { kind: 'rage' }); }
      return t >= this.recover;
    },
    pose: (F, dir, a) => F.special[dir][a.released ? 1 : Math.floor(a.t / 0.1) % 2],
    drawGround(ctx, f, a, w) {
      if (a.released) return;
      const p = aimPoint(f, this.range);
      w.redRing(ctx, p.x, p.y, this.aoe, a.t / this.charge, a.t > this.charge - 0.15);
    },
  },

  // ================= Dragonair =================
  dragonTail: {
    name: 'Dragon Tail', desc: 'full-length lunge, tail whip: huge shove (ring-out tool)',
    cd: 0.9, charge: 0.14, dash: { time: 0.14, speed: 270 }, recover: 0.2, slow: 0.15, reach: 24, arc: 2,
    dmg: 9, knock: 380, stop: 0.09, stun: 0.45,
    fx: DRAGON_FX.light,
    ai: { min: 0, max: 54, melee: true },
    tick(f, a, t, dt, w) {
      const s = dashIn(f, a, t, dt, this.dash, () => w.cone(f, this));
      if (s === null) return false;
      if (!a.fired) { a.fired = true; w.clawSwipe(f, this.reach, 3); }
      return t >= s + this.recover;
    },
    pose: (F, dir, a) => F.atk[dir][!a.released ? 0 : a.lunging ? 3 : 2],
  },

  dragonPulse: {
    name: 'Dragon Pulse', desc: 'dragon orb: bursts on contact (or at the end of its flight), hits everything round it',
    cd: 1.5, charge: 0.3, fireAt: 0.03, recover: 0.22, slow: 0.3,
    dmg: 11, knock: 210, stop: 0.08, stun: 0.38, speed: 200, life: 0.75, proj: 'dpulse', hitR: 8, aoe: 20,
    fx: DRAGON_FX.heavy,
    flash: [0.5, 1],
    ai: { min: 25, max: 150, lead: true },
    tick(f, a, t, dt, w) {
      if (!a.fired && t >= this.fireAt) { a.fired = true; w.spawnProjectile(f, this); }
      return t >= this.fireAt + this.recover;
    },
    pose: (F, dir, a) => F.special[dir][a.released ? 1 : 0],
  },

  dragonDance: {
    name: 'Dragon Dance', desc: 'armoured dance: +25% speed and +25% damage for 6s',
    cd: 10, charge: 0.5, recover: 0.2, slow: 0.3, chargeSlow: 0.2, time: 6, speedMul: 1.25, dmgMul: 1.25,
    fx: DRAGON_FX.special,
    flash: [0.6, 1.5],
    ai: { min: 40, max: 200, buff: true },
    tick(f, a, t, dt, w) {
      if (!a.fired) {
        a.fired = true;
        f.dance = { t: this.time, m: this };
        w.texts.push({ x: f.x, y: f.y - 32 * f.size, txt: 'DRAGON DANCE!', col: '#b8a8ff', t: 0, small: true });
        for (let i = 0; i < 3; i++) w.sprites.push({ frames: DRAGON.rings, img: f.skin.dragon, x: f.x, y: f.y - 4 - i * 9 * f.size, t: -i * 0.08, fps: 16, scale: 1.2 * f.size, rise: 20 });
      }
      return t >= this.recover;
    },
    // twisting on the spot while charging
    pose: (F, dir, a) => {
      const order = ['S', 'SW', 'W', 'NW', 'N'];
      return a.released ? F.special[dir][1] : F.walk[order[Math.floor(a.t / 0.07) % order.length]][0];
    },
  },

  // ================= Dragonite =================
  dragonClaw: {
    name: 'Dragon Claw', desc: 'dash in, two dragon claw swipes, second staggers',
    cd: 0.8, charge: 0.1, dash: { time: 0.16, speed: 250 }, gap: 0.16, recover: 0.16, slow: 0.25, reach: 22, arc: 2.3,
    hits: [
      { dmg: 6, knock: 60, stun: 0.25, stop: 0.05 },
      { dmg: 9, knock: 250, stun: 0.42, stop: 0.08 },
    ],
    fx: DRAGON_FX.light,
    ai: { min: 0, max: 50, melee: true },
    tick(f, a, t, dt, w) {
      const s = dashIn(f, a, t, dt, this.dash, () => w.cone(f, { ...this, ...this.hits[0] }));
      if (s === null) return false;
      if (!a.first) { a.first = true; w.clawSwipe(f, this.reach, 0); }
      if (!a.second && t >= s + this.gap) {
        a.second = true;
        f.moveBy(Math.cos(f.face) * 4, Math.sin(f.face) * 4);
        w.cone(f, { ...this, ...this.hits[1] });
        w.clawSwipe(f, this.reach, 1);
      }
      return t >= s + this.gap + this.recover;
    },
    pose: (F, dir, a) => F.atk[dir][!a.released ? 0 : a.second ? 2 : 1],
  },

  hyperBeam: {
    name: 'Hyper Beam', desc: 'red lane, then a huge beam blasts down it: hits everything in the line',
    cd: 6, charge: 0.6, lock: 0.15, chargeTurn: 2.5, fire: 0.3, recover: 0.35, slow: 0, chargeSlow: 0,
    length: 160, width: 18, dmg: 18, knock: 280, stop: 0.1, stun: 0.45,
    fx: { ...DRAGON_FX.special, ball: 0, halo: 16 },
    flash: [0.8, 3],
    ai: { min: 30, max: 160, telegraph: 'sidestep' },
    tick(f, a, t, dt, w) {
      a.rooted = a.lockFace = true;
      a.firing = t < this.fire;
      if (a.firing) w.beamHit(f, this, a.hit ??= new Set());
      return t >= this.fire + this.recover;
    },
    pose: (F, dir, a) => (a.released ? F.special[dir][0] : F.idle[dir][Math.floor(a.t / 0.06) % 2]),
    drawGround(ctx, f, a, w) {
      if (a.released) return;
      const ray = w.beamRay(f, this);
      redLane(ctx, f, a, w, this, ray.x0, ray.y0, ray.len, (this.width * f.size) / 2);
    },
    draw(ctx, f, a, w) { drawBigBeam(ctx, f, a, w, this, '#ffd890'); },
  },

  dracoMeteor: {
    name: 'Draco Meteor', desc: 'red zone at the cursor: 5 meteors rain down on it. Afterwards Dragonite hits 30% softer for 4s',
    cd: 11, charge: 0.7, recover: 0.35, slow: 0.3, chargeSlow: 0.15, range: 130, r: 34, n: 5, delay: 0.4, every: 0.13, aoe: 16, drain: 4, drains: true,
    dmg: 7, knock: 90, stop: 0.08, stun: 0.4, // low knock so the first meteor doesn't push them out of the zone
    fx: DRAGON_FX.special,
    flash: [0.8, 3],
    ai: { min: 30, max: 130, target: true },
    tick(f, a, t, dt, w) {
      if (!a.fired) {
        a.fired = true;
        const p = aimPoint(f, this.range);
        for (let i = 0; i < this.n; i++) {
          // first one dead centre, the rest scattered across the zone
          const ang = Math.random() * Math.PI * 2, d = i ? this.r * (0.35 + 0.65 * Math.random()) : 0;
          w.spawnStrike(f, this, p.x + Math.cos(ang) * d, p.y + Math.sin(ang) * d / 1.4, { kind: 'meteor', d: this.delay + i * this.every, frame: i % 2 });
        }
        f.spent = this.drain;
        w.texts.push({ x: f.x, y: f.y - 34 * f.size, txt: 'DRAINED', col: '#a0a0b0', t: 0.1, small: true });
      }
      return t >= this.recover;
    },
    pose: (F, dir) => F.special[dir][0],
    drawGround(ctx, f, a, w) {
      if (a.released) return;
      const p = aimPoint(f, this.range);
      w.redRing(ctx, p.x, p.y, this.r + this.aoe * 0.5, a.t / this.charge, a.t > this.charge - 0.15);
    },
  },

  // ================= Abra =================
  confusion: {
    name: 'Confusion', desc: 'fast psychic orb: +1 mind (3 mind = Mind Locked: cooldowns frozen for 3s)',
    cd: 0.55, charge: 0.1, fireAt: 0.02, recover: 0.14, slow: 0.4,
    dmg: 6, knock: 130, stop: 0.05, stun: 0.26, speed: 310, life: 0.5, proj: 'psy', hitR: 7, mind: 1,
    fx: PSY_FX.light,
    ai: { min: 20, max: 150, lead: true },
    tick(f, a, t, dt, w) {
      if (!a.fired && t >= this.fireAt) { a.fired = true; w.spawnProjectile(f, this); }
      return t >= this.fireAt + this.recover;
    },
    pose: (F, dir, a) => F.atk[dir][a.released ? 2 : 0],
  },

  teleportStrike: {
    name: 'Teleport Strike', desc: 'blink behind the foe (if in range) and strike: +1 mind',
    cd: 2.4, charge: 0.2, range: 110, recover: 0.22, slow: 0.2,
    dmg: 9, knock: 230, stop: 0.08, stun: 0.42, mind: 1, radius: 12,
    fx: PSY_FX.heavy,
    flash: [0.4, 0.5],
    ai: { min: 30, max: 110 },
    tick(f, a, t, dt, w) {
      a.rooted = true;
      if (!a.fired) {
        a.fired = a.lockFace = true;
        const foe = w.others(f).find((g) => Math.hypot(g.x - f.x, g.y - f.y) <= this.range);
        if (foe) {
          const p = w.ambushPoint(f, 2);
          f.teleport(p.x, p.y);
          f.face = p.face;
          w.melee(f, { ...this, range: f.hurtR + 2 });
        } else {
          f.blink(Math.cos(f.face), Math.sin(f.face), 55); // nobody near: just a blink
        }
      }
      return t >= this.recover;
    },
    pose: (F, dir, a, t) => (!a.released ? F.special[dir][0] : t < 0.12 ? F.atk[dir][1] : F.atk[dir][2]),
  },

  psyshock: {
    name: 'Psyshock', desc: '3 psychic orbs gather round you, then home in one by one: each +1 mind (all 3 = Mind Locked)',
    cd: 7, charge: 0.4, every: 0.1, recover: 0.2, slow: 0.3, chargeSlow: 0.3, n: 3, spread: 0.35,
    dmg: 5, knock: 90, stop: 0.04, stun: 0.2, speed: 240, life: 0.8, proj: 'psy', hitR: 7, home: 3.5, mind: 1,
    fx: { ...PSY_FX.special, flames: 3 },
    flash: [0.5, 1],
    ai: { min: 20, max: 140 },
    tick(f, a, t, dt, w) {
      a.shot ??= 0;
      while (a.shot < this.n && t >= a.shot * this.every) {
        w.spawnProjectile(f, this, (a.shot - 1) * this.spread); // fan out, then curve in
        a.shot++;
      }
      return t >= (this.n - 1) * this.every + this.recover;
    },
    pose: (F, dir, a) => F.special[dir][a.released ? 1 : 0],
    // the orbs circling while charging (the ones not fired yet once released)
    draw(ctx, f, a, w) {
      const left = this.n - (a.shot ?? 0);
      for (let i = 0; i < left; i++) {
        const ang = w.time * 8 + (i / this.n) * Math.PI * 2, r = 12 * f.size;
        const x = f.x + Math.cos(ang) * r, y = f.y - 10 * f.size + Math.sin(ang) * r * 0.45;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = f.skin.tint;
        ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
      }
    },
  },

  // ================= Kadabra =================
  psybeam: {
    name: 'Psybeam', desc: 'quick red lane, then a psychic beam: +1 mind',
    cd: 1, charge: 0.22, lock: 0.08, chargeTurn: 6, fire: 0.12, recover: 0.18, slow: 0, chargeSlow: 0.3,
    length: 120, width: 8, dmg: 7, knock: 160, stop: 0.06, stun: 0.3, mind: 1,
    fx: PSY_FX.light,
    ai: { min: 0, max: 115, telegraph: 'sidestep' },
    tick(f, a, t, dt, w) {
      a.rooted = a.lockFace = true;
      a.firing = t < this.fire;
      if (a.firing) w.beamHit(f, this, a.hit ??= new Set());
      return t >= this.fire + this.recover;
    },
    pose: (F, dir, a) => F.atk[dir][a.released ? 1 : 0],
    drawGround(ctx, f, a, w) {
      if (a.released) return;
      const ray = w.beamRay(f, this);
      redLane(ctx, f, a, w, this, ray.x0, ray.y0, ray.len, (this.width * f.size) / 2);
    },
    draw(ctx, f, a, w) {
      if (!a.firing) return;
      const m = f.mouth(), ray = w.beamRay(f, this), half = (this.width * f.size) / 2;
      ctx.save();
      ctx.translate(m.x, m.y - f.sp.mouthH - f.lift);
      ctx.rotate(f.face);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = f.skin.tint;
      ctx.fillRect(0, -half - 1, ray.len, (half + 1) * 2);
      // rings rippling along the beam
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      for (let x = (w.time * 160) % 12; x < ray.len; x += 12) { ctx.beginPath(); ctx.ellipse(x, 0, 2, half + 1, 0, 0, Math.PI * 2); ctx.stroke(); }
      ctx.restore();
    },
  },

  kinesis: {
    name: 'Kinesis', desc: 'grab a foe in range with your mind and drag them toward the cursor, then fling them',
    cd: 5, charge: 0.3, range: 120, hold: 0.8, pull: 150, recover: 0.25, slow: 0, chargeSlow: 0.3,
    grab: { dmg: 4, knock: 0, stop: 0.05, stun: 0.1 },
    dmg: 6, knock: 230, stop: 0.08, stun: 0.42, mind: 1, // the fling
    fx: PSY_FX.heavy,
    flash: [0.5, 1],
    ai: { min: 0, max: 115 },
    tick(f, a, t, dt, w) {
      a.rooted = true;
      if (!a.fired) {
        a.fired = true;
        a.held = w.others(f).find((g) => Math.hypot(g.x - f.x, g.y - f.y) <= this.range && Math.abs(g.zEff - f.zEff) < 0.5) ?? null;
        if (a.held) { w.hit(f, a.held, { ...this.grab, name: this.name }, 0); w.ring(a.held.x, a.held.y - 10, w.psyRgb(f)); }
        else w.texts.push({ x: f.x, y: f.y - 30 * f.size, txt: 'NOTHING TO GRAB', col: '#c8b8d8', t: 0, small: true });
      }
      const g = a.held;
      if (g && (g.ko || !g.hittable)) a.held = null;
      if (!a.held) return t >= this.recover;
      if (t < this.hold) {
        // held fast: no acting, dragged toward the cursor
        g.action = null; g.dash = null; g.kvx = g.kvy = 0;
        g.hurtT = Math.max(g.hurtT, 0.08);
        const dx = f.target.x - g.x, dy = f.target.y - g.y, d = Math.hypot(dx, dy);
        if (d > 3) { g.moveBy((dx / d) * this.pull * dt, (dy / d) * this.pull * dt); a.dir = Math.atan2(dy, dx); }
        return false;
      }
      if (!a.flung) { a.flung = true; w.hit(f, g, this, a.dir ?? f.face); a.held = null; }
      return true;
    },
    pose: (F, dir, a) => F.special[dir][a.held ? 1 : 0],
    draw(ctx, f, a, w) {
      const g = a.held;
      if (!g) return;
      const m = f.mouth();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = f.skin.tint;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.6;
      ctx.beginPath(); ctx.ellipse(g.x, g.y - 9 * g.size, 11 * g.size, 13 * g.size, 0, 0, Math.PI * 2); ctx.stroke();
      // wavy psychic tether from the caster to the victim
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const x0 = m.x, y0 = m.y - f.sp.mouthH, x1 = g.x, y1 = g.y - 9 * g.size, n = 10;
      for (let i = 0; i <= n; i++) {
        const k = i / n, o = Math.sin(k * Math.PI * 4 + w.time * 20) * 3 * Math.sin(k * Math.PI);
        const px = x0 + (x1 - x0) * k - ((y1 - y0) / (Math.hypot(x1 - x0, y1 - y0) || 1)) * o, py = y0 + (y1 - y0) * k + ((x1 - x0) / (Math.hypot(x1 - x0, y1 - y0) || 1)) * o;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.stroke();
      ctx.restore();
    },
  },

  futureSight: {
    name: 'Future Sight', desc: 'mark a spot at the cursor: a big psychic blast lands there 0.9s later (+2 mind)',
    cd: 8, charge: 0.4, recover: 0.25, slow: 0.3, chargeSlow: 0.2, range: 150, delay: 0.9, aoe: 40,
    dmg: 18, knock: 240, stop: 0.1, stun: 0.45, mind: 2,
    fx: PSY_FX.special,
    flash: [0.6, 1.5],
    ai: { min: 30, max: 150, target: true },
    tick(f, a, t, dt, w) {
      if (!a.fired) { a.fired = true; const p = aimPoint(f, this.range); w.spawnStrike(f, this, p.x, p.y, { kind: 'future' }); }
      return t >= this.recover;
    },
    pose: (F, dir, a) => F.special[dir][a.released ? 1 : 0],
    drawGround(ctx, f, a, w) {
      if (a.released) return;
      const p = aimPoint(f, this.range);
      w.redRing(ctx, p.x, p.y, this.aoe, a.t / this.charge, a.t > this.charge - 0.15);
    },
  },

  // ================= Alakazam =================
  psychoCut: {
    name: 'Psycho Cut', desc: 'psychic blade: pierces, +1 mind',
    cd: 0.8, charge: 0.12, fireAt: 0.02, recover: 0.18, slow: 0.3,
    dmg: 8, knock: 190, stop: 0.07, stun: 0.36, speed: 290, life: 0.45, proj: 'psycut', hitR: 10, pierce: true, mind: 1,
    fx: PSY_FX.light,
    ai: { min: 15, max: 130, lead: true },
    tick(f, a, t, dt, w) {
      if (!a.fired && t >= this.fireAt) { a.fired = true; w.spawnProjectile(f, this); }
      return t >= this.fireAt + this.recover;
    },
    pose: (F, dir, a) => F.atk[dir][a.released ? 1 : 0],
  },

  psychic: {
    name: 'Psychic', desc: 'red circle at the cursor: lifts whoever is in it and slams them down hard',
    cd: 4.5, charge: 0.45, recover: 0.25, slow: 0.3, chargeSlow: 0.2, range: 130, delay: 0.3, aoe: 20,
    dmg: 14, knock: 320, stop: 0.1, stun: 0.5, mind: 1, launch: 0.5,
    fx: PSY_FX.heavy,
    flash: [0.6, 1.5],
    ai: { min: 30, max: 130, target: true },
    tick(f, a, t, dt, w) {
      if (!a.fired) { a.fired = true; const p = aimPoint(f, this.range); w.spawnStrike(f, this, p.x, p.y, { kind: 'psychic' }); }
      return t >= this.recover;
    },
    pose: (F, dir, a) => F.special[dir][a.released ? 1 : 0],
    drawGround(ctx, f, a, w) {
      if (a.released) return;
      const p = aimPoint(f, this.range);
      w.redRing(ctx, p.x, p.y, this.aoe, a.t / this.charge, a.t > this.charge - 0.15);
    },
  },

  psystrike: {
    name: 'Psystrike', desc: 'red lane, then a huge psychic beam blasts down it: +2 mind',
    cd: 8, charge: 0.6, lock: 0.15, chargeTurn: 2.5, fire: 0.3, recover: 0.35, slow: 0, chargeSlow: 0,
    length: 170, width: 16, dmg: 20, knock: 300, stop: 0.1, stun: 0.45, mind: 2,
    fx: { ...PSY_FX.special, ball: 0, halo: 16 },
    flash: [0.8, 3],
    ai: { min: 30, max: 170, telegraph: 'sidestep' },
    tick(f, a, t, dt, w) {
      a.rooted = a.lockFace = true;
      a.firing = t < this.fire;
      if (a.firing) w.beamHit(f, this, a.hit ??= new Set());
      return t >= this.fire + this.recover;
    },
    pose: (F, dir, a) => F.special[dir][a.released ? 1 : 0],
    drawGround(ctx, f, a, w) {
      if (a.released) return;
      const ray = w.beamRay(f, this);
      redLane(ctx, f, a, w, this, ray.x0, ray.y0, ray.len, (this.width * f.size) / 2);
    },
    draw(ctx, f, a, w) { drawBigBeam(ctx, f, a, w, this, '#ffc8f0'); },
  },
};
