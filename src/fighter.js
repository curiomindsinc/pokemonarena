// A monster on the field. Driven by an intent object each frame
// ({mx, my, aim, tx, ty, move, dash, jump}) from either the player or the AI.
// `move` is a slot ('light' | 'heavy' | 'special'); the species kit maps it to a move.
import { TILE } from './map.js';
import { FIRE, POISON as POISON_FX, ROCK, BONE } from './frames.js';
import { MOVES } from './moves.js';
import { SPECIES } from './species.js';

const DASH = { cd: 0.8, dur: 0.15, speed: 330 };
const JUMP = { dur: 0.42, peak: 0.6, cd: 0.1 };
export const RADIUS = 6; // wall collision + pathing; hurtboxes are per species
const SPLASH_SPEED = 90; // knockback speed that carries you over the shore
const WATER = { dmg: 10, sink: 0.45, inland: 14, invuln: 0.8 };
const POISON = { max: 4, time: 3, tick: 0.5, proofMax: 2, proofMul: 0.5 };
const LAUNCH_PEAK = 0.8; // Bone Spike Lane: how high a launched foe flies (tiers)
// Soaked: each stack slows you and makes you fly further when hit.
const SOAK = { max: 3, time: 3, slow: 0.12, knock: 0.18 };
// Static: electric hits build charge; at max stacks the target is paralyzed (can't act),
// then briefly can't build charge again so it can't be chain-locked. Soaked targets take +1 per hit.
const STATIC = { max: 3, time: 3, para: 0.6, immune: 1.2 };
// Curse: ghost hits mark you; every stack makes all damage you take hit harder.
export const CURSE = { max: 3, time: 4, amp: 0.1 };
// Hypnosis: asleep until the time runs out or a real hit wakes you (that hit lands harder);
// afterwards you can't be put back to sleep for a moment.
export const SLEEP = { wakeMul: 1.5, immune: 2 };
// Fury (dragon line): every hit you land adds a stack on YOU (each +8% damage + speed);
// any real hit you take knocks one off. Landing a hit refreshes the timer.
export const FURY = { max: 3, time: 4, amp: 0.08 };
// Mind Lock (psychic line): psychic hits stack; at max the target's move cooldowns stop
// recharging for a moment, then it can't be locked again for a while.
export const MIND = { max: 3, time: 6, lock: 3, immune: 2 };
// Teleport (psychic line passive): the dash is an instant blink, intangible for a blink of time.
const BLINK = { range: 55, cd: 1, phase: 0.15 };
const PHASE = 0.25; // ghosts' dash: intangible this long
const HOVER = 4; // levitating monsters float this many px above their shadow
const FLY_HOVER = 10; // birds fly higher
const FLAP = [0, 1, 2, 1]; // attack frames: wings tucked, raised, spread, raised
const WET_BOOST = 1.25; // water types on a wet floor (Hydro Pump)
const SWIM = { speed: 0.6, cooldown: 1 / 1.5, line: 6 }; // line: how much of the body sits under water

const SECTORS = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
const SHEET_DIR = { E: ['W', true], SE: ['SW', true], NE: ['NW', true], S: ['S', false], SW: ['SW', false], W: ['W', false], NW: ['NW', false], N: ['N', false] };

export class Fighter {
  constructor({ name, team, species, x, y, world }) {
    this.name = name;
    this.team = team; // 'red' (player palette) | 'blue' (hue-shifted rival)
    this.world = world;
    this.spawn = { x, y };
    this.setSpecies(species);
  }

  setSpecies(id) {
    this.species = id;
    this.sp = SPECIES[id];
    this.frames = this.sp.frames;
    this.skin = this.world.assets.skin(this.sp.sheet, this.sp.element, this.team);
    this.reset();
  }

  reset() {
    this.x = this.spawn.x;
    this.y = this.spawn.y;
    this.z = this.world.arena.surfaceAt(this.x, this.y);
    this.jz = 0;
    this.face = Math.PI / 2;
    this.hp = this.sp.hp;
    this.ko = false;
    this.koT = 0;
    this.action = null;
    this.hurtT = 0;
    this.heavy = false;
    this.freeze = 0;
    this.glow = 0;
    this.slowT = 0;
    this.slowMul = 1;
    this.wetBoostT = 0;
    this.sunkT = 0; // under water after a splash
    this.invulnT = 0; // blinking after climbing back out
    this.dash = null;
    this.jump = null;
    this.kvx = 0;
    this.kvy = 0;
    this.walkT = 0;
    this.moving = false;
    this.trail = [];
    this.poison = null; // { stacks, t, next } — stacking damage over time
    this.seed = null; // { t, next, by } — Leech Seed drain
    this.soak = null; // { stacks, t }
    this.static = null; // { stacks, t } — builds toward paralysis
    this.paraT = 0; // paralyzed: frozen in place, sparking
    this.paraImmuneT = 0;
    this.curse = null; // { stacks, t } — takes extra damage
    this.phaseT = 0; // intangible: attacks pass through (ghost dash, Phantom Force)
    this.sleepT = 0; // Hypnosis: out cold until hit
    this.sleepImmuneT = 0;
    this.confuseT = 0; // Confuse Ray: walking controls reversed
    this.bone = null; // Bonemerang in flight or lying on the floor (Cubone line)
    this.focus = null; // { hits, t, m } — Focus Energy buff
    this.fury = null; // { stacks, t } — dragon line: builds as it lands hits
    this.dance = null; // { t, m } — Dragon Dance: faster + harder hits
    this.spent = 0; // Draco Meteor aftermath: hits are weaker this long
    this.bindT = 0; // Wrap: can't walk or dash (can still attack)
    this.bindBy = null;
    this.mind = null; // { stacks, t } — psychic hits build toward Mind Lock
    this.lockT = 0; // Mind Locked: move cooldowns frozen
    this.mindImmuneT = 0;
    this.rush = null; // { step, at } — Bone Rush combo position
    this.launchT = 0; // flung up by a bone spike
    this.gates = {}; // per-move hit throttles (world.gated); world time restarts with the match
    this.target = { x: this.x, y: this.y };
    this.cd = { light: 0, heavy: 0, special: 0, dash: 0, jump: 0 };
    this.cdMax = {}; // cooldown each slot started from (moves with a varying cooldown)
  }

  get maxHp() { return this.sp.hp; }
  get size() { return this.sp.size; }
  get hurtR() { return this.sp.hurtR; }
  get lift() { return this.jz * TILE; }
  get zEff() { return this.z + this.jz; }
  get busy() { return !!this.action || this.hurtT > 0 || this.paraT > 0 || this.sleepT > 0 || !!this.dash || !!this.jump || this.ko || this.sunkT > 0; }
  get swimming() { return !!this.sp.swim && !this.jump && this.world.arena.isWaterAt(this.x, this.y); }
  get hittable() { return !this.ko && this.sunkT <= 0 && this.invulnT <= 0 && this.phaseT <= 0; }
  get floating() { return !!this.sp.float || !!this.sp.fly; } // over the moat, quakes + spikes
  get flying() { return !!this.sp.fly; } // ...and above ground zones too
  get charging() { const a = this.action; return !!a && a.t < MOVES[a.move].charge; }
  // Armored while charging, or while a move says so (Petal Dance): damage lands, nothing else does.
  get armored() {
    const a = this.action;
    return !this.ko && (this.charging || !!(a && MOVES[a.move].armor?.(a)));
  }
  chargeFrac() { return this.charging ? this.action.t / MOVES[this.action.move].charge : 0; }
  // Move id a slot fires right now: bone moves can't be used while the bone is thrown
  // (light falls back to Punch, the rest are locked = null).
  kitMove(slot) {
    const id = this.sp.kit[slot];
    if (this.bone && MOVES[id]?.bone) return slot === 'light' ? 'punch' : null;
    return id;
  }
  locked(slot) { return this.kitMove(slot) === null; }
  moveFor(slot) { return MOVES[this.kitMove(slot) ?? this.sp.kit[slot]]; }
  ready(slot) { return this.cd[slot] <= 0 && !this.locked(slot); }
  cooldownFrac(slot) {
    if (this.locked(slot)) return 1;
    const total = this.cdMax[slot] ?? (this.sp.kit[slot] ? this.moveFor(slot).cd : slot === 'dash' ? DASH.cd : JUMP.cd);
    return Math.min(1, Math.max(0, this.cd[slot] / total));
  }

  // Returns true if the intent's move was accepted (so input can clear its buffer).
  update(dt, intent) {
    this.glow = Math.max(0, this.glow - dt);
    if (this.sunkT > 0) {
      this.sunkT -= dt;
      if (this.sunkT <= 0) this.surface();
      return false;
    }
    if (!this.ko) this.tickStatus(dt);
    if (this.freeze > 0) { this.freeze -= dt; return false; }
    const cdRate = this.swimming ? SWIM.cooldown : 1;
    for (const k in this.cd) {
      if (this.lockT > 0 && k !== 'dash' && k !== 'jump') continue; // Mind Locked
      this.cd[k] = Math.max(0, this.cd[k] - dt * cdRate);
    }
    this.slowT = Math.max(0, this.slowT - dt);
    this.wetBoostT = Math.max(0, this.wetBoostT - dt);
    this.invulnT = Math.max(0, this.invulnT - dt);
    this.phaseT = Math.max(0, this.phaseT - dt);
    this.trail = this.trail.filter((t) => (t.life -= dt) > 0);
    if (intent.tx !== undefined) this.target = { x: intent.tx, y: intent.ty };

    if (this.ko) {
      this.koT += dt;
      this.applyKnockback(dt);
      return false;
    }
    this.paraImmuneT = Math.max(0, this.paraImmuneT - dt);
    this.sleepImmuneT = Math.max(0, this.sleepImmuneT - dt);
    if (this.paraT > 0 || this.sleepT > 0) {
      // paralyzed / asleep: can still be shoved, can't do anything
      if (this.paraT > 0) this.paraT -= dt;
      if (this.sleepT > 0 && (this.sleepT -= dt) <= 0) this.wake();
      this.applyKnockback(dt);
      return false;
    }
    if (this.confuseT > 0) {
      this.confuseT -= dt;
      intent = { ...intent, mx: -intent.mx, my: -intent.my }; // walks (and dashes) the wrong way
    }

    let accepted = false;
    if (this.hurtT > 0) this.hurtT -= dt;
    const free = this.hurtT <= 0 && !this.dash && !this.action && !this.jump;

    // facing
    const act = this.action;
    const am = act && MOVES[act.move];
    const turnTo = (rate) => {
      let d = intent.aim - this.face;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const step = rate * dt;
      this.face += Math.max(-step, Math.min(step, d));
    };
    if (act?.lockFace) {
      // committed direction (lunges, rolls)
    } else if (am?.turn && act.released) {
      turnTo(am.turn);
    } else if (am?.chargeTurn && !act.released) {
      // aimed charge: slow turning, then the aim locks just before release
      if (act.t < am.charge - am.lock) turnTo(am.chargeTurn);
    } else if (this.hurtT <= 0 && !this.dash) {
      this.face = intent.aim;
    }

    // start things
    if (free && intent.move && this.ready(intent.move)) {
      this.startAction(intent.move);
      accepted = true;
    } else if (free && intent.dash && this.ready('dash') && this.bindT <= 0) {
      let dx = intent.mx, dy = intent.my;
      if (!dx && !dy) { dx = Math.cos(this.face); dy = Math.sin(this.face); }
      const l = Math.hypot(dx, dy);
      if (this.sp.blink) {
        this.blink(dx / l, dy / l, BLINK.range);
        this.cd.dash = this.cdMax.dash = BLINK.cd;
        this.phaseT = BLINK.phase;
      } else {
        this.dash = { t: 0, dx: dx / l, dy: dy / l };
        this.cd.dash = DASH.cd;
        if (this.sp.phase) this.phaseT = PHASE;
      }
    } else if (free && intent.jump && this.ready('jump')) {
      this.startJump(intent);
    }

    // action progress
    if (this.action) this.tickAction(dt);

    // movement
    let mult = this.slowT > 0 ? this.slowMul : 1;
    if (this.soak) mult *= 1 - SOAK.slow * this.soak.stacks;
    if (this.swimming) mult *= SWIM.speed;
    if (this.wetBoostT > 0) mult *= WET_BOOST;
    if (this.fury) mult *= 1 + FURY.amp * this.fury.stacks;
    if (this.dance) mult *= this.dance.m.speedMul;
    if (this.bindT > 0) mult = 0;
    if (this.action) {
      const m = MOVES[this.action.move];
      mult *= this.action.rooted ? 0 : this.charging && m.chargeSlow !== undefined ? m.chargeSlow : m.slow;
    }
    this.moving = false;
    if (this.dash) {
      this.dash.t += dt;
      this.moveBy(this.dash.dx * DASH.speed * dt, this.dash.dy * DASH.speed * dt);
      this.afterimage();
      if (this.dash.t >= DASH.dur) this.dash = null;
    } else if (this.jump?.hop) {
      // position is scripted by the hop
    } else if (this.hurtT <= 0 && mult > 0 && (intent.mx || intent.my)) {
      this.moveBy(intent.mx * this.sp.speed * mult * dt, intent.my * this.sp.speed * mult * dt);
      this.moving = true;
    }
    this.applyKnockback(dt);

    if (this.jump) this.tickJump(dt);
    if (this.launchT > 0) this.tickLaunch(dt);
    if (!this.jump?.hop) {
      const s = this.world.arena.surfaceAt(this.x, this.y);
      if (s !== null) this.z = s;
    }
    this.walkT = this.moving ? this.walkT + dt : 0;
    return accepted;
  }

  startAction(slot) {
    const move = this.kitMove(slot);
    const m = MOVES[move];
    this.action = { move, slot, t: 0, fired: false, released: false };
    m.begin?.(this, this.action);
    this.cd[slot] = this.cdMax[slot] = m.cdFor?.(this, this.action) ?? m.cd;
  }

  tickAction(dt) {
    const a = this.action;
    const m = MOVES[a.move];
    a.t += dt;
    if (a.t < m.charge) return;
    if (!a.released) { a.released = true; this.world.chargeRelease(this, m); }
    if (m.tick(this, a, a.t - m.charge, dt, this.world)) this.action = null;
  }

  afterimage() {
    this.trail.push({ x: this.x, y: this.y, jz: this.jz, life: 0.18, frame: this.frame(), spin: this.spinAngle() });
  }

  // Teleport up to `range` along (dx, dy): the furthest spot that's solid ground. Returns true if it moved.
  blink(dx, dy, range) {
    const A = this.world.arena;
    for (let d = range; d >= 8; d -= 4) {
      const x = this.x + dx * d, y = this.y + dy * d;
      if (!A.fits(x, y, this.z, RADIUS) || A.isWaterAt(x, y)) continue;
      this.teleport(x, y);
      return true;
    }
    return false;
  }

  teleport(x, y) {
    this.world.psyBlink(this, this.x, this.y, x, y);
    for (let i = 1; i <= 3; i++) this.trail.push({ x: this.x + (x - this.x) * i * 0.25, y: this.y + (y - this.y) * i * 0.25, jz: this.jz, life: 0.06 * i + 0.06, frame: this.frame(), spin: 0 });
    this.x = x;
    this.y = y;
    this.kvx = this.kvy = 0;
  }

  startJump(intent) {
    this.cd.jump = JUMP.cd;
    let hop = null;
    if (intent.mx || intent.my) {
      const l = Math.hypot(intent.mx, intent.my);
      const target = this.world.arena.findHop(this.x, this.y, this.z, intent.mx / l, intent.my / l, RADIUS);
      if (target) hop = { x0: this.x, y0: this.y, z0: this.z, ...{ x1: target.x, y1: target.y, z1: target.z } };
    }
    this.jump = { t: 0, hop };
  }

  tickJump(dt) {
    const j = this.jump;
    j.t += dt;
    const p = Math.min(1, j.t / JUMP.dur);
    const arc = JUMP.peak * 4 * p * (1 - p);
    if (j.hop) {
      const h = j.hop;
      this.x = h.x0 + (h.x1 - h.x0) * p;
      this.y = h.y0 + (h.y1 - h.y0) * p;
      // ground height eases between levels; arc rides on top
      const zLin = h.z0 + (h.z1 - h.z0) * p;
      this.z = zLin;
      this.jz = arc + Math.max(0, h.z1 - h.z0) * 0.5 * Math.sin(Math.PI * p);
    } else {
      this.jz = arc;
    }
    if (p >= 1) {
      if (j.hop) this.z = j.hop.z1;
      this.jz = 0;
      this.jump = null;
      this.world.dust(this.x, this.y);
    }
  }

  // Flung straight up (Bone Spike Lane): in the air, so nothing at ground height can hit it.
  launch(dur) {
    this.launchT = this.launchDur = dur;
  }

  tickLaunch(dt) {
    this.launchT -= dt;
    const p = 1 - Math.max(0, this.launchT) / this.launchDur;
    this.jz = LAUNCH_PEAK * 4 * p * (1 - p);
    if (this.launchT <= 0) { this.jz = 0; this.world.dust(this.x, this.y); }
  }

  moveBy(dx, dy) {
    const A = this.world.arena;
    const swim = !!this.sp.swim || this.floating;
    if (dx && A.fits(this.x + dx, this.y, this.z, RADIUS, swim)) this.x += dx;
    if (dy && A.fits(this.x, this.y + dy, this.z, RADIUS, swim)) this.y += dy;
  }

  applyKnockback(dt) {
    if (Math.abs(this.kvx) + Math.abs(this.kvy) < 1) { this.kvx = this.kvy = 0; return; }
    // shoved hard against the shore: over the edge into the moat
    const sp = Math.hypot(this.kvx, this.kvy);
    if (sp > SPLASH_SPEED && !this.ko && !this.jump && !this.sp.swim && !this.floating) {
      const ex = this.x + (this.kvx / sp) * (RADIUS + 3), ey = this.y + (this.kvy / sp) * (RADIUS + 3);
      if (this.world.arena.isWaterAt(ex, ey)) { this.fall(ex, ey); return; }
    }
    if (!this.jump?.hop) this.moveBy(this.kvx * dt, this.kvy * dt);
    if (Math.hypot(this.kvx, this.kvy) > 80 && !this.jump && Math.random() < 0.5) this.world.skid(this.x, this.y);
    const k = Math.exp(-9 * dt);
    this.kvx *= k;
    this.kvy *= k;
  }

  // Interrupts whatever we were doing: freeze, glow, flinch.
  // While charging we're armored: damage lands but nothing else does. Returns true if armored.
  // `chip` damage (burn ticks) never interrupts.
  takeHit({ dmg, angle, knock, stop, stun, chip }) {
    this.hp = Math.max(0, this.hp - dmg);
    if (this.sleepT > 0 && !chip) this.wake();
    if (this.soak) knock *= 1 + SOAK.knock * this.soak.stacks;
    knock *= this.sp.knockMul ?? 1;
    if ((this.armored || chip) && this.hp > 0) { this.glow = Math.max(this.glow, 0.1); return this.armored; }
    this.glow = 0.22;
    this.heavy = stun >= 0.35;
    this.freeze = Math.max(this.freeze, stop);
    this.hurtT = Math.max(this.hurtT, stun);
    this.action = null;
    this.dash = null;
    if (!this.jump) this.jz = 0; // knocked out of a move's hop (Body Slam)
    this.launchT = 0;
    this.kvx = Math.cos(angle) * knock;
    this.kvy = Math.sin(angle) * knock;
    if (this.hp <= 0) {
      this.ko = true;
      this.freeze = 0.3;
      this.kvx *= 1.6;
      this.kvy *= 1.6;
    }
    return false;
  }

  // ---------- status effects ----------

  // Each poison hit adds a stack (max 4) and refreshes the timer; every stack deals 1 per tick.
  // Poison-proof monsters hold at most 2 stacks and take half (the odd half point carries over).
  addPoison(n = 1) {
    if (this.ko) return;
    if (!this.poison) this.poison = { stacks: 0, t: 0, next: POISON.tick, owed: 0 };
    this.poison.stacks = Math.min(this.sp.poisonProof ? POISON.proofMax : POISON.max, this.poison.stacks + n);
    this.poison.t = POISON.time;
  }

  addSoak(n = 1) {
    if (this.ko) return;
    this.soak ??= { stacks: 0, t: 0 };
    this.soak.stacks = Math.min(SOAK.max, this.soak.stacks + n);
    this.soak.t = SOAK.time;
  }

  // Electric hits charge you up; the hit that fills the meter paralyzes (even through armor).
  addStatic(n = 1) {
    if (this.ko || this.paraImmuneT > 0) return;
    if (this.soak) n++; // water conducts
    this.static ??= { stacks: 0, t: 0 };
    this.static.stacks += n;
    this.static.t = STATIC.time;
    if (this.static.stacks >= STATIC.max) this.paralyze();
  }

  paralyze() {
    this.static = null;
    this.paraT = STATIC.para;
    this.paraImmuneT = STATIC.para + STATIC.immune;
    this.action = null;
    this.dash = null;
    this.jump = null;
    this.launchT = 0;
    this.jz = 0;
    this.world.texts.push({ x: this.x, y: this.y - 32 * this.size, txt: 'PARALYZED!', col: '#ffe23a', t: 0, small: true });
  }

  // Hypnosis landed. Returns false if they were still groggy from the last one.
  fallAsleep(t) {
    if (this.ko || this.sleepT > 0 || this.sleepImmuneT > 0) return false; // no stacking it longer
    this.sleepT = t;
    this.action = null;
    this.dash = null;
    this.jump = null;
    this.launchT = 0;
    this.jz = 0;
    this.world.texts.push({ x: this.x, y: this.y - 32 * this.size, txt: 'ASLEEP!', col: '#d0a0ff', t: 0, small: true });
    return true;
  }

  wake() {
    this.sleepT = 0;
    this.sleepImmuneT = SLEEP.immune;
  }

  confuse(t) {
    if (this.ko) return;
    if (this.confuseT <= 0) this.world.texts.push({ x: this.x, y: this.y - 32 * this.size, txt: 'CONFUSED!', col: '#ffd0f0', t: 0, small: true });
    this.confuseT = Math.max(this.confuseT, t);
  }

  addCurse(n = 1) {
    if (this.ko) return;
    this.curse ??= { stacks: 0, t: 0 };
    this.curse.stacks = Math.min(CURSE.max, this.curse.stacks + n);
    this.curse.t = CURSE.time;
  }

  addFury(n = 1) {
    if (this.ko) return;
    this.fury ??= { stacks: 0, t: 0 };
    const before = this.fury.stacks;
    this.fury.stacks = Math.min(FURY.max, this.fury.stacks + n);
    this.fury.t = FURY.time;
    if (this.fury.stacks === FURY.max && before < FURY.max) this.world.texts.push({ x: this.x, y: this.y - 34 * this.size, txt: 'FURY MAX!', col: '#b8a8ff', t: 0, small: true });
  }

  addMind(n = 1) {
    if (this.ko || this.mindImmuneT > 0) return;
    this.mind ??= { stacks: 0, t: 0 };
    this.mind.stacks += n;
    this.mind.t = MIND.time;
    if (this.mind.stacks < MIND.max) return;
    this.mind = null;
    this.lockT = MIND.lock;
    this.mindImmuneT = MIND.lock + MIND.immune;
    this.world.texts.push({ x: this.x, y: this.y - 32 * this.size, txt: 'MIND LOCKED!', col: '#ff9ae8', t: 0, small: true });
  }

  loseFury() {
    if (!this.fury) return;
    if (--this.fury.stacks <= 0) this.fury = null;
  }

  // Damage multiplier on this fighter's hits (Fury, Dragon Dance, Draco Meteor's drain).
  // m.drains: the move that caused the drain (its own meteors still land at full power).
  dmgBoost(m) {
    let k = 1;
    if (this.fury) k *= 1 + FURY.amp * this.fury.stacks;
    if (this.dance) k *= this.dance.m.dmgMul;
    if (this.spent > 0 && !m?.drains) k *= 0.7;
    return k;
  }

  bind(t, by) {
    if (this.ko) return;
    this.bindT = Math.max(this.bindT, t);
    this.bindBy = by;
    this.dash = null;
    this.kvx = this.kvy = 0;
  }

  // Withdraw: a raised shell eats a hit and answers it. Returns true if the hit was blocked.
  guards(attacker, angle) {
    const a = this.action;
    const m = a && MOVES[a.move];
    if (!m?.guard || !m.guard(a)) return false;
    // spin back at the attacker (or the way the hit came from, if there's nobody to aim at)
    a.counter = attacker ? Math.atan2(attacker.y - this.y, attacker.x - this.x) : angle + Math.PI;
    return true;
  }

  // Rapid Spin shakes off seeds, poison, water, static and curses.
  cleanse() {
    const had = this.poison || this.seed || this.soak || this.static || this.curse || this.mind;
    this.poison = this.seed = this.soak = this.static = this.curse = this.mind = null;
    return !!had;
  }

  plantSeed(by, m) {
    if (this.ko) return;
    this.seed = { t: m.seedTime, next: m.seedTick, by, m };
  }

  heal(n) {
    if (this.ko) return;
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + n);
    if (this.hp > before) this.world.texts.push({ x: this.x, y: this.y - 26 * this.size, txt: '+' + Math.round(this.hp - before), col: '#8dff6a', t: 0, small: true });
  }

  tickStatus(dt) {
    const p = this.poison;
    if (p) {
      p.t -= dt;
      p.next -= dt;
      if (p.next <= 0) {
        p.next += POISON.tick;
        p.owed += p.stacks * (this.sp.poisonProof ? POISON.proofMul : 1);
        const dmg = Math.floor(p.owed);
        p.owed -= dmg;
        if (dmg) this.world.hit(null, this, { dmg, chip: true, col: '#d58cff' }, 0);
      }
      if (Math.random() < 0.08 * p.stacks) this.world.bubbles(this);
      if (p.t <= 0 || this.ko) this.poison = null;
    }
    if (this.soak) {
      this.soak.t -= dt;
      if (Math.random() < 0.06 * this.soak.stacks) this.world.drip(this);
      if (this.soak.t <= 0 || this.ko) this.soak = null;
    }
    if (this.static) {
      this.static.t -= dt;
      if (Math.random() < 0.05 * this.static.stacks) this.world.crackle(this, 1);
      if (this.static.t <= 0 || this.ko) this.static = null;
    }
    if (this.paraT > 0 && Math.random() < 0.5) this.world.crackle(this, 2);
    if (this.curse) {
      this.curse.t -= dt;
      if (Math.random() < 0.04 * this.curse.stacks) this.world.wisps(this.x, this.y - 8 * this.size, 1, this, true);
      if (this.curse.t <= 0 || this.ko) this.curse = null;
    }
    if (this.fury) {
      this.fury.t -= dt;
      if (this.fury.t <= 0 || this.ko) this.fury = null;
    }
    if (this.dance) {
      this.dance.t -= dt;
      if (Math.random() < 0.3) this.world.sparks(this.x + (Math.random() - 0.5) * 10 * this.size, this.y - 4, 1, this.world.dragonSparks(this));
      if (this.dance.t <= 0 || this.ko) this.dance = null;
    }
    if (this.spent > 0) this.spent -= dt;
    if (this.mind && ((this.mind.t -= dt) <= 0 || this.ko)) this.mind = null;
    if (this.lockT > 0) this.lockT -= dt;
    if (this.mindImmuneT > 0) this.mindImmuneT -= dt;
    if (this.bindT > 0 && ((this.bindT -= dt) <= 0 || this.ko)) { this.bindT = 0; this.bindBy = null; }
    if (this.focus) {
      this.focus.t -= dt;
      if (Math.random() < 0.25) this.world.embers(this.x, this.y - 10 * this.size, 1, this);
      if (this.focus.t <= 0 || this.ko) this.focus = null;
    }
    const s = this.seed;
    if (s) {
      s.t -= dt;
      s.next -= dt;
      if (s.next <= 0) {
        s.next += s.m.seedTick;
        this.world.hit(null, this, { dmg: s.m.drain, chip: true, col: '#8dff6a' }, 0);
        if (!s.by.ko) { s.by.heal(s.m.drain); this.world.drainFx(this, s.by); }
      }
      if (s.t <= 0 || this.ko) this.seed = null;
    }
  }

  // Knocked into the water: sink, take damage, then climb back out a little inland.
  fall(wx, wy) {
    this.action = null;
    this.dash = null;
    this.hurtT = 0;
    this.kvx = this.kvy = 0;
    this.takeHit({ dmg: WATER.dmg, angle: 0, knock: 0, stop: 0, stun: 0, chip: true });
    if (this.bone) this.world.dropBone(this.bone);
    if (!this.ko) this.sunkT = WATER.sink;
    this.world.splash(this, wx, wy, WATER.dmg);
  }

  surface() {
    // step inland (toward the arena middle) until there's solid room to stand
    const A = this.world.arena;
    const dx = A.width / 2 - this.x, dy = A.height / 2 - this.y, l = Math.hypot(dx, dy) || 1;
    for (let d = WATER.inland; d < 80; d += 2) {
      const x = this.x + (dx / l) * d, y = this.y + (dy / l) * d;
      if (A.fits(x, y, this.z, RADIUS + 4)) { this.x = x; this.y = y; break; }
    }
    this.invulnT = WATER.invuln;
    this.world.dust(this.x, this.y);
  }

  dirInfo() {
    const s = SECTORS[((Math.round(this.face / (Math.PI / 4)) % 8) + 8) % 8];
    if (this.sp.dirs8) return { dir: s, flip: false };
    const [dir, flip] = SHEET_DIR[s];
    return { dir, flip };
  }

  // Current sprite frame: {rect, flip}. A rect flagged `mirror` is a west view standing in for east.
  frame() {
    const fr = this.rawFrame();
    return fr.rect.mirror ? { rect: fr.rect, flip: !fr.flip } : fr;
  }

  rawFrame() {
    const F = this.frames;
    const { dir, flip } = this.dirInfo();
    if (this.ko) return { rect: F.sleep[Math.floor(this.koT * 2) % 2], flip };
    if (this.sleepT > 0) return { rect: F.sleep[Math.floor(this.world.time * 1.5) % 2], flip };
    if (this.hurtT > 0 || this.paraT > 0) return { rect: F.hurt[dir][0], flip };
    const a = this.action;
    if (a) {
      const m = MOVES[a.move];
      return { rect: m.pose(F, dir, a, a.t - m.charge), flip };
    }
    const walk = F.walk[dir];
    if (this.flying) {
      // always on the wing: flap (faster while moving), glide with wings spread through dashes + hops
      if (this.jump || this.dash) return { rect: F.atk[dir][2], flip };
      const fps = this.moving ? 12 : 6;
      return { rect: F.atk[dir][FLAP[Math.floor(this.world.time * fps) % 4]], flip };
    }
    if (this.jump || this.dash) return { rect: walk[1], flip };
    if (!this.moving) return { rect: F.idle ? F.idle[dir][Math.floor(this.world.time * 2.5) % F.idle[dir].length] : walk[0], flip };
    const seq = [0, 1, 2, 1];
    return { rect: walk[seq[Math.floor(this.walkT / 0.12) % 4] % walk.length], flip }; // 2-frame walks (Pichu) alternate
  }

  spinAngle() {
    const a = this.action;
    return a ? MOVES[a.move].spin?.(this, a) ?? 0 : 0;
  }

  // Where breath attacks come out of, in map space.
  mouth() {
    const [mx, my] = this.sp.mouth;
    return { x: this.x + Math.cos(this.face) * mx, y: this.y + Math.sin(this.face) * my };
  }

  draw(ctx) {
    if (this.sunkT > 0) return;
    if (this.invulnT > 0 && Math.floor(this.invulnT * 12) % 2) return; // blink
    if (this.action && MOVES[this.action.move].hidden?.(this.action)) return; // sunk into the shadows
    const { body, white } = this.skin;
    // dash afterimages
    for (const t of this.trail) {
      ctx.globalAlpha = (t.life / 0.18) * 0.35;
      drawFrame(ctx, white, t.frame, t.x, t.y - t.jz * TILE, t.spin);
    }
    ctx.globalAlpha = 1;
    let ox = 0, oy = 0;
    if (this.freeze > 0 && this.glow > 0) { ox = Math.random() < 0.5 ? -1 : 1; oy = Math.random() < 0.5 ? -1 : 0; }
    else if (this.heavy && this.hurtT > 0 && !this.ko) ox = Math.round(Math.sin(this.hurtT * 50) * 1.2); // stagger wobble
    const f = this.frame();
    const hover = this.ko ? 0 : this.flying ? FLY_HOVER + Math.sin(this.world.time * 6) * 1.5 : this.floating ? HOVER + Math.sin(this.world.time * 3) * 1.5 : 0;
    const sx = Math.round(this.x + ox), sy = Math.round(this.y - this.lift - hover + oy);
    const ghost = this.phaseT > 0 ? 0.35 : 1; // intangible: see-through
    const spin = this.spinAngle();
    const fx = this.charging ? MOVES[this.action.move].fx : null;
    const swim = this.swimming;
    if (swim) {
      // only the top of the body shows above the water line
      ctx.save();
      ctx.beginPath();
      ctx.rect(sx - 60, sy - 120, 120, 120 - SWIM.line * this.size);
      ctx.clip();
    }
    if (fx) this.drawChargeBack(ctx, fx, sx, sy);
    ctx.globalAlpha = this.ko ? Math.max(0.35, 1 - this.koT * 0.5) : ghost;
    drawFrame(ctx, body, f, sx, sy, spin);
    ctx.globalAlpha = 1;
    if (fx) this.drawChargeFront(ctx, fx, f, sx, sy);
    if (this.paraT > 0 && Math.floor(this.world.time * 20) % 2) {
      ctx.globalAlpha = 0.6;
      drawFrame(ctx, this.skin.para, f, sx, sy, spin);
      ctx.globalAlpha = 1;
    }
    if (this.glow > 0) {
      // flicker between strong and soft white
      ctx.globalAlpha = Math.floor(this.glow * 45) % 2 ? 0.95 : 0.45;
      drawFrame(ctx, white, f, sx, sy, spin);
    }
    ctx.globalAlpha = 1;
    if (swim) {
      ctx.restore();
      const wl = sy - SWIM.line * this.size, k = this.size;
      const wob = Math.sin(this.world.time * 6) * 0.6;
      ctx.strokeStyle = 'rgba(220,245,255,0.85)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(sx, wl, 9 * k + wob, 3 * k, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(220,245,255,0.35)';
      ctx.beginPath(); ctx.ellipse(sx, wl, 13 * k - wob, 4.5 * k, 0, 0, Math.PI * 2); ctx.stroke();
    }
    const a = this.action;
    if (a) MOVES[a.move].draw?.(ctx, this, a, this.world);
    if (!this.ko) this.drawStatus(ctx, sx, sy);
  }

  // Ground halo + the flames orbiting behind the body.
  drawChargeBack(ctx, fx, sx, sy) {
    const p = this.chargeFrac();
    if (fx.halo) {
      const r = fx.halo * this.size * (0.6 + 0.4 * p);
      const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, r);
      g.addColorStop(0, this.skin.tint);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.35 + 0.4 * p;
      ctx.translate(this.x, this.y);
      ctx.scale(1, 0.45);
      ctx.translate(-this.x, -this.y);
      ctx.fillStyle = g;
      ctx.fillRect(this.x - r, this.y - r, r * 2, r * 2);
      ctx.restore();
    }
    this.drawChargeFlames(ctx, fx, sx, sy, false);
  }

  // Orange body glow, front flames and the gathering fireball at the mouth.
  drawChargeFront(ctx, fx, f, sx, sy) {
    const p = this.chargeFrac();
    const pulse = fx.pulse ? 0.8 + 0.2 * Math.sin(this.world.time * fx.pulse) : 1;
    const a = fx.glow * (0.3 + 0.7 * p) * pulse;
    ctx.save();
    ctx.globalAlpha = a * 0.45;
    drawFrame(ctx, this.skin.glow, f, sx, sy);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a * 0.6;
    drawFrame(ctx, this.skin.glow, f, sx, sy);
    if (fx.ball) {
      const m = this.mouth();
      const mx = m.x, my = m.y - this.sp.mouthH - this.lift;
      const r = (1 + fx.ball * this.size * p) * (0.85 + 0.15 * Math.sin(this.world.time * 40));
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = this.skin.tint;
      ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff6d0';
      ctx.beginPath(); ctx.arc(mx, my, r * 0.45, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    this.drawChargeFlames(ctx, fx, sx, sy, true);
  }

  // Small fire.png flames circling the body and pulling inward as the charge fills.
  drawChargeFlames(ctx, fx, sx, sy, front) {
    const p = this.chargeFrac(), time = this.world.time, k = this.size;
    if (fx.set === 'leaf' || fx.set === 'petal' || fx.set === 'drop' || fx.set === 'bubble' || fx.set === 'spark' || fx.set === 'wisp' || fx.set === 'feather' || fx.set === 'scale' || fx.set === 'psy') { this.drawChargeLeaves(ctx, fx, sx, sy, front); return; }
    const rock = fx.set === 'rock';
    const set = rock ? ROCK.round : fx.set === 'ember' ? FIRE.ember.slice(2) : FIRE.wheel;
    const img = rock ? this.skin.rock : this.skin.fire;
    const cx = sx + Math.cos(this.face) * fx.front * k, cy = sy - 9 * k + Math.sin(this.face) * fx.front * k * 0.5;
    for (let i = 0; i < fx.flames; i++) {
      const ang = time * fx.spin + (i / fx.flames) * Math.PI * 2;
      if ((Math.sin(ang) >= 0) !== front) continue;
      const lift = fx.rise ? (time * 1.6 + i / fx.flames) % 1 : 0;
      const r = fx.orbit * k * (1 - 0.55 * p) * (1 - lift * 0.5);
      const x = cx + Math.cos(ang) * r;
      const y = cy + Math.sin(ang) * r * 0.45 + (fx.rise ? 6 * k : 0) - lift * 18 * k;
      const fr = set[(rock ? i : Math.floor(time * 18) + i) % set.length]; // pebbles keep their shape
      const s = fx.scale * k * (0.7 + 0.5 * p);
      const w = Math.max(1, Math.round(fr.w * s)), h = Math.max(1, Math.round(fr.h * s));
      ctx.globalAlpha = fx.rise ? 0.9 * (1 - lift * 0.6) : 0.9;
      ctx.drawImage(img, fr.x, fr.y, fr.w, fr.h, Math.round(x - w / 2), Math.round(y - h / 2), w, h);
    }
    ctx.globalAlpha = 1;
  }

  // Grass / water charge: leaves, petals, droplets or bubbles swirling inward, tumbling as they go.
  drawChargeLeaves(ctx, fx, sx, sy, front) {
    const p = this.chargeFrac(), time = this.world.time, k = this.size;
    const img = this.skin[fx.set];
    const cx = sx + Math.cos(this.face) * fx.front * k, cy = sy - 9 * k + Math.sin(this.face) * fx.front * k * 0.5;
    for (let i = 0; i < fx.flames; i++) {
      const ang = time * fx.spin + (i / fx.flames) * Math.PI * 2;
      if ((Math.sin(ang) >= 0) !== front) continue;
      const lift = fx.rise ? (time * 1.6 + i / fx.flames) % 1 : 0;
      const r = fx.orbit * k * (1 - 0.55 * p) * (1 - lift * 0.5);
      const x = cx + Math.cos(ang) * r;
      const y = cy + Math.sin(ang) * r * 0.45 + (fx.rise ? 6 * k : 0) - lift * 18 * k;
      ctx.globalAlpha = fx.rise ? 0.95 * (1 - lift * 0.6) : 0.95;
      drawSpun(ctx, img, x, y, ang * 2 + i, fx.scale * 2 * (0.8 + 0.4 * p));
    }
    ctx.globalAlpha = 1;
  }

  // Status markers: poison skull + stack count over the head, seed vines wrapped round the body.
  drawStatus(ctx, sx, sy) {
    const k = this.size, top = sy - 24 * k - 6;
    if (this.seed) {
      ctx.strokeStyle = '#3f9a2a';
      ctx.lineWidth = 1;
      for (const off of [0, 2.1]) {
        ctx.beginPath();
        ctx.ellipse(sx, sy - 7 * k, 8 * k, 3 * k, Math.sin(this.world.time * 3 + off) * 0.4, 0, Math.PI * 2);
        ctx.stroke();
      }
      drawSpun(ctx, this.skin.leaf, sx + 7 * k, sy - 9 * k, this.world.time * 2, 1);
    }
    if (this.soak) {
      const ox = this.poison ? -14 : 0;
      drawSpun(ctx, this.skin.soakIcon, sx - 4 + ox, top - 3, 0, 1.4);
      statusCount(ctx, '×' + this.soak.stacks, sx + 1 + ox, top - 3, '#7fd4ff');
    }
    if (this.static) {
      const ox = this.poison || this.soak ? 14 : 0;
      drawSpun(ctx, this.skin.staticIcon, sx - 4 + ox, top - 3, 0, 1.3);
      statusCount(ctx, '×' + this.static.stacks, sx + 1 + ox, top - 3, '#ffe23a');
    }
    if (this.sleepT > 0) {
      ctx.font = 'bold 8px "Trebuchet MS", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#e8d8ff';
      const b = (this.world.time * 1.2) % 1;
      ctx.globalAlpha = 1 - b;
      ctx.fillText('z', Math.round(sx + 6 + b * 4), Math.round(sy - 16 * k - b * 10));
      ctx.globalAlpha = 1;
      ctx.fillText('Z', Math.round(sx + 9), Math.round(sy - 22 * k - ((this.world.time * 1.2 + 0.5) % 1) * 6));
    }
    if (this.confuseT > 0) {
      for (let i = 0; i < 3; i++) {
        const ang = this.world.time * 7 + (i / 3) * Math.PI * 2;
        ctx.fillStyle = ['#ffd0f0', '#fff6b0', '#b0e8ff'][i];
        ctx.fillRect(Math.round(sx + Math.cos(ang) * 8), Math.round(sy - 22 * k + Math.sin(ang) * 2.5), 2, 2);
      }
    }
    if (this.curse) {
      const ox = (this.static ? 14 : 0) + (this.poison || this.soak ? 14 : 0);
      drawSpun(ctx, this.skin.curseIcon, sx - 4 + ox, top - 3, 0, 1.3);
      statusCount(ctx, '×' + this.curse.stacks, sx + 1 + ox, top - 3, '#d0a0ff');
    }
    if (this.poison) {
      const r = POISON_FX.skull[0];
      ctx.drawImage(this.skin.poison, r.x, r.y, r.w, r.h, Math.round(sx - 8), Math.round(top - 8), 10, 10);
      statusCount(ctx, '×' + this.poison.stacks, sx + 3, top - 3, '#d58cff');
    }
    if (this.bone) {
      // bone thrown: crossed-out bone over the head
      const r = BONE.spin[0], bx = sx + 13, by = top - 3;
      ctx.drawImage(this.skin.body, r.x, r.y, r.w, r.h, Math.round(bx - r.w / 2), Math.round(by - r.h / 2), r.w, r.h);
      ctx.strokeStyle = '#ff3a3a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(bx - 5, by - 4); ctx.lineTo(bx + 5, by + 4);
      ctx.moveTo(bx + 5, by - 4); ctx.lineTo(bx - 5, by + 4);
      ctx.stroke();
    }
    if (this.bindT > 0) {
      // coils of the binder's body wrapped round the middle
      ctx.strokeStyle = this.bindBy?.skin.tint ?? '#8a70ff';
      ctx.lineWidth = 2;
      for (const off of [0, 1.6, 3.2]) {
        ctx.beginPath();
        ctx.ellipse(sx, sy - (5 + off * 1.6) * k, 9 * k, 3 * k, Math.sin(this.world.time * 6 + off) * 0.25, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    if (this.mind) {
      // one sparkle per Mind stack, circling the head
      const n = this.mind.stacks;
      for (let i = 0; i < n; i++) {
        const a = this.world.time * 3 + (i / n) * Math.PI * 2;
        drawSpun(ctx, this.skin.mindIcon, sx + Math.cos(a) * 8, top - 10 + Math.sin(a) * 2, a, 1.2);
      }
    }
    if (this.lockT > 0) {
      // locked: big pink padlock over the head inside a ring that counts down
      const cx = sx, cy = top - 12, k = this.lockT / MIND.lock;
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#2a0d2e';
      ctx.beginPath(); ctx.arc(cx, cy, 9, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#ff70d8';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke();
      ctx.strokeStyle = '#ffe0f8';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy - 2, 2.5, Math.PI, 0); ctx.stroke(); // shackle
      ctx.fillStyle = '#ff70d8';
      ctx.fillRect(Math.round(cx - 4), Math.round(cy - 2), 8, 6); // body
      ctx.fillStyle = '#2a0d2e';
      ctx.fillRect(Math.round(cx - 0.5), Math.round(cy), 1, 2); // keyhole
      ctx.restore();
    }
    if (this.fury) {
      // one scale per Fury stack, floating over the head
      const n = this.fury.stacks;
      for (let i = 0; i < n; i++) drawSpun(ctx, this.skin.furyIcon, sx + (i - (n - 1) / 2) * 7, top - 12 + Math.sin(this.world.time * 6 + i) * 1, 0, 1.2);
    }
    if (this.dance) {
      // rings turning round the feet
      ctx.strokeStyle = this.skin.tint;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(this.world.time * 12);
      ctx.beginPath();
      ctx.ellipse(sx, sy + this.lift - 1, 11 * k, 4 * k, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (this.focus) {
      // one flame pip per boosted hit left
      const set = FIRE.ember.slice(2), n = this.focus.hits;
      for (let i = 0; i < n; i++) {
        const fr = set[(Math.floor(this.world.time * 16) + i) % set.length];
        const x = sx + (i - (n - 1) / 2) * 6, y = top - 12;
        ctx.drawImage(this.skin.fire, fr.x, fr.y, fr.w, fr.h, Math.round(x - fr.w * 0.2), Math.round(y - fr.h * 0.4), Math.round(fr.w * 0.4), Math.round(fr.h * 0.4));
      }
    }
  }
}

function statusCount(ctx, txt, x, y, col) {
  ctx.font = 'bold 7px "Trebuchet MS", sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#1a0d2e';
  ctx.strokeText(txt, Math.round(x), Math.round(y));
  ctx.fillStyle = col;
  ctx.fillText(txt, Math.round(x), Math.round(y));
}

// Draws a whole small canvas rotated about its centre (leaves, petals, seeds).
export function drawSpun(ctx, img, x, y, angle, scale = 1) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  ctx.restore();
}

// `spin` rotates the sprite about its middle (Flame Wheel).
export function drawFrame(ctx, img, { rect, flip }, x, y, spin = 0) {
  if (!flip && !spin) {
    ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h, x - rect.ax, y - rect.ay, rect.w, rect.h);
    return;
  }
  ctx.save();
  if (spin) {
    ctx.translate(x, y - rect.h / 2);
    ctx.rotate(spin);
    ctx.translate(0, rect.h / 2);
  } else {
    ctx.translate(x, y);
  }
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h, -rect.ax, -rect.ay, rect.w, rect.h);
  ctx.restore();
}
