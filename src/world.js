// Owns the arena, fighters, projectiles and effects; resolves hits.
// Rule: an attack only lands when attacker and target are at the same height.
import { TILE } from './map.js';
import { FIRE, POISON, SUN, ROCK, BONE, DRAGON } from './frames.js';
import { MOVES } from './moves.js';
import { drawSpun, CURSE, SLEEP, RADIUS } from './fighter.js';

const SAME_HEIGHT = 0.5;
const sameHeight = (a, b) => Math.abs(a - b) < SAME_HEIGHT;
const angleDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const HIT_SPARKS = ['#fff', '#fff6b0', '#ffd34d'];
const FIRE_SPARKS = ['#fff6b0', '#ff9a2e', '#ff5a1f'];
const WATER_SPARKS = ['#ffffff', '#cfefff', '#4cb6ff'];
const WATER_SPARKS_BLUE = ['#ffffff', '#fff0c0', '#ffc23a'];
const ROCK_SPARKS = ['#e8e0d0', '#b8a888', '#8a7a62'];
const ROCK_SPARKS_BLUE = ['#f0d0c0', '#d08060', '#a05030'];
const ELEC_SPARKS = ['#ffffff', '#fff6a0', '#ffe23a'];
const ELEC_SPARKS_BLUE = ['#ffffff', '#e0d0ff', '#a878ff'];
const GHOST_SPARKS = ['#ffffff', '#d8b0ff', '#9a50e0'];
const GHOST_SPARKS_BLUE = ['#ffffff', '#b0ffc8', '#3ac070'];
const WIND_SPARKS = ['#ffffff', '#e8f4ff', '#b8d8f0'];
const WIND_SPARKS_BLUE = ['#ffffff', '#ffe8f4', '#f0b8d8'];
const DRAGON_SPARKS = ['#ffffff', '#c8c0ff', '#7a6aff'];
const PSY_SPARKS = ['#ffffff', '#ffc8f0', '#ff70d8'];
const PSY_SPARKS_BLUE = ['#ffffff', '#c8f4ff', '#5ad8ff'];
const DRAGON_SPARKS_BLUE = ['#ffffff', '#ffc8ec', '#ff60c0'];
// Electrified water: electric attacks that touch the moat or a wet floor charge it for a while;
// foes in it (not the caster, not hovering/flying) take chip damage + static every tick.
const SHOCK = { life: 2.5, r: 26, tick: 0.4, dmg: 2, static: 1 };
const SKY_H = 150; // Thunder falls from this far above the ground
const QY = 1.4; // ground circles: y distances count this much more (the floor is seen at an angle)
const FALL_H = 70; // how high falling boulders start
const BONE_REST = 4; // a dropped bone flies home on its own after this long

export class World {
  constructor(arena, assets) {
    this.arena = arena;
    this.assets = assets;
    this.mapCanvas = arena.render(assets.tiles);
    this.fighters = [];
    this.clear();
  }

  clear() {
    this.projectiles = [];
    this.zones = []; // ground zones: Fire Spin vortex + burning ground, sludge puddles, wet floor
    this.waves = []; // Blast Burn rings
    this.clouds = []; // Poison Powder
    this.surfs = []; // Surf walls of water
    this.drops = []; // boulders falling from the sky (Rock Slide)
    this.quakes = []; // Magnitude / Earthquake shock rings
    this.bones = []; // Bonemerangs: flying out, flying back, or lying on the floor
    this.spikes = []; // Bone Spike Lane rows
    this.strikes = []; // Thunder: red circle, then a bolt out of the sky
    this.nightmares = []; // Nightmare: shadow hands erupting inside a red circle
    this.hands = []; // the hands themselves (just for show)
    this.twisters = []; // Twister: rolling tornadoes that grab
    this.hurricanes = []; // Hurricane: storm at a spot that sucks in, then flings
    this.shocks = []; // electrified wet-floor puddles
    this.shockTiles = new Map(); // electrified moat tiles: "c,r" -> { owner, c, r, t }
    this.sprites = [];
    this.particles = [];
    this.texts = [];
    this.shake = 0;
    this.time = 0;
  }

  others(f) { return this.fighters.filter((g) => g !== f && g.hittable); }

  // ---------- attacks ----------

  // Returns true if anything was hit (scratch ends its lunge on contact).
  melee(f, m) {
    const cx = f.x + Math.cos(f.face) * m.range;
    const cy = f.y + Math.sin(f.face) * m.range;
    let landed = false;
    for (const g of this.others(f)) {
      if (Math.hypot(g.x - cx, g.y - cy) > m.radius + g.hurtR) continue;
      if (!sameHeight(f.zEff, g.zEff)) { this.miss(g); continue; }
      this.contact(f, g, m, Math.atan2(g.y - f.y, g.x - f.x));
      landed = true;
    }
    return landed;
  }

  // Wide arc in front (Slash, Wing Attack). Anything hugging the attacker is always caught.
  cone(f, m) {
    let landed = false;
    for (const g of this.others(f)) {
      const d = Math.hypot(g.x - f.x, g.y - f.y);
      if (d > m.reach * f.size + g.hurtR) continue;
      const ang = Math.atan2(g.y - f.y, g.x - f.x);
      if (d > f.hurtR + g.hurtR + 2 && angleDiff(ang, f.face) > m.arc / 2) continue;
      if (!sameHeight(f.zEff, g.zEff)) { this.miss(g); continue; }
      this.contact(f, g, m, ang);
      landed = true;
    }
    return landed;
  }

  // Body contact while rolling (Flame Wheel); each target is hit once per roll. True if anything was hit.
  ram(f, m, hitSet) {
    let landed = false;
    for (const g of this.others(f)) {
      if (hitSet.has(g) || Math.hypot(g.x - f.x, g.y - f.y) > f.hurtR + g.hurtR + 3) continue;
      if (!sameHeight(f.zEff, g.zEff)) { this.miss(g); continue; }
      hitSet.add(g);
      landed = true;
      this.contact(f, g, m, Math.atan2(g.y - f.y, g.x - f.x));
      if (f.sp.element === 'water') this.sparks(g.x, g.y - 10, 6, this.waterSparks(f));
      else if (f.sp.element === 'electric') this.sparks(g.x, g.y - 10, 8, this.elecSparks(f));
      else if (f.sp.element === 'dragon') this.sparks(g.x, g.y - 10, 8, this.dragonSparks(f));
      else if (f.sp.element === 'psychic') this.sparks(g.x, g.y - 10, 8, this.psySparks(f));
      else this.sparks(g.x, g.y - 10, 6, FIRE_SPARKS, this.isBlue(f));
    }
    return landed;
  }

  waterSparks(f) { return this.isBlue(f) ? WATER_SPARKS_BLUE : WATER_SPARKS; }
  elecSparks(f) { return this.isBlue(f) ? ELEC_SPARKS_BLUE : ELEC_SPARKS; }
  dragonSparks(f) { return this.isBlue(f) ? DRAGON_SPARKS_BLUE : DRAGON_SPARKS; }
  psySparks(f) { return this.isBlue(f) ? PSY_SPARKS_BLUE : PSY_SPARKS; }
  psyRgb(f) { return this.isBlue(f) ? '140,230,255' : '255,150,230'; }
  dragonRgb(f) { return this.isBlue(f) ? '255,150,220' : '170,150,255'; }

  // Melee landing: hit + shared hitstop + sparks.
  contact(f, g, m, angle) {
    this.hit(f, g, m, angle);
    f.freeze = Math.max(f.freeze, m.stop); // attacker shares the hitstop on contact
    this.sparks(g.x, g.y - 10 - g.lift, 10, HIT_SPARKS);
  }

  isBlue(f) { return f.team === 'blue'; }

  // Charge finished: flash at the mouth (bigger charge, bigger flash).
  chargeRelease(f, m) {
    if (!m.flash) return;
    const [scale, shake] = m.flash;
    const p = f.mouth();
    const y = p.y - f.sp.mouthH - f.lift;
    if (f.sp.element === 'grass') {
      // burst of leaves flung outward
      for (let i = 0; i < Math.round(10 * scale); i++) {
        const a = Math.random() * Math.PI * 2, s = 50 + Math.random() * 60;
        this.particles.push({ x: p.x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6 - 20, g: 90, life: 0.4, max: 0.4, size: 2, col: this.isBlue(f) ? '#ff9de8' : ['#a8f070', '#58c23a'][i % 2] });
      }
      this.ring(p.x, y, this.isBlue(f) ? '255,150,230' : '170,255,120');
    } else if (f.sp.element === 'water') {
      // droplets thrown off in a splash
      const cols = this.waterSparks(f);
      for (let i = 0; i < Math.round(12 * scale); i++) {
        const a = Math.random() * Math.PI * 2, s = 50 + Math.random() * 70;
        this.particles.push({ x: p.x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6 - 30, g: 200, life: 0.45, max: 0.45, size: 2, col: cols[i % 3] });
      }
      this.ring(p.x, y, this.isBlue(f) ? '255,220,140' : '160,225,255');
    } else if (f.sp.element === 'flying') {
      // a wing beat: air rushing out in a ring
      const cols = this.windSparks(f);
      for (let i = 0; i < Math.round(14 * scale); i++) {
        const a = (i / Math.round(14 * scale)) * Math.PI * 2, s = 90 + Math.random() * 60;
        this.particles.push({ x: p.x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.5, g: 0, life: 0.18, max: 0.18, size: 1, col: cols[i % 3] });
      }
      this.ring(p.x, y, this.isBlue(f) ? '255,200,230' : '230,245,255');
    } else if (f.sp.element === 'psychic') {
      // two rings rippling out + sparkles
      const cols = this.psySparks(f);
      for (let i = 0; i < Math.round(10 * scale); i++) {
        const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 50;
        this.particles.push({ x: p.x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.5, g: 0, life: 0.3, max: 0.3, size: 1, col: cols[i % 3] });
      }
      this.ring(p.x, y, this.psyRgb(f));
      this.sprites.push({ ring: true, x: p.x, y, t: -0.06, rgb: this.psyRgb(f) });
    } else if (f.sp.element === 'dragon') {
      // scales of light spinning off in a ring
      const cols = this.dragonSparks(f), n = Math.round(12 * scale);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, s = 70 + Math.random() * 50;
        this.particles.push({ x: p.x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.5 - 10, g: 40, life: 0.3, max: 0.3, size: 2, col: cols[i % 3] });
      }
      this.ring(p.x, y, this.dragonRgb(f));
    } else if (f.sp.element === 'ghost') {
      this.wisps(p.x, y, Math.round(10 * scale), f);
      this.ring(p.x, y, this.isBlue(f) ? '150,255,180' : '200,150,255');
    } else if (f.sp.element === 'electric') {
      // sparks crackle off in every direction
      const cols = this.elecSparks(f);
      for (let i = 0; i < Math.round(12 * scale); i++) {
        const a = Math.random() * Math.PI * 2, s = 70 + Math.random() * 90;
        this.particles.push({ x: p.x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6, g: 0, life: 0.2, max: 0.2, size: Math.random() < 0.4 ? 2 : 1, col: cols[i % 3] });
      }
      this.ring(p.x, y, this.isBlue(f) ? '200,170,255' : '255,240,120');
    } else if (f.sp.element === 'rock' || f.sp.element === 'ground') {
      // dust ring + chips off the ground
      this.debris(f.x, f.y - 2, Math.round(10 * scale), f);
      for (let i = 0; i < Math.round(4 * scale); i++) this.smoke(f.x + (Math.random() - 0.5) * 16 * f.size, f.y - 2);
      this.ring(f.x, f.y - 6, this.isBlue(f) ? '240,150,110' : '230,210,170');
    } else {
      this.burst(p.x, y, f.skin, scale, 1);
    }
    this.shake = Math.max(this.shake, shake);
  }

  // `spread` fans extra shots off the facing (Razor Leaf).
  // `speed` overrides the move's speed for this shot (Bubble Beam's uneven bubbles).
  spawnProjectile(f, m, spread = 0, speed = m.speed) {
    const p = f.mouth();
    const a = f.face + spread;
    this.projectiles.push({
      owner: f, x: p.x, y: p.y, z: f.zEff, h: f.sp.mouthH,
      vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      life: m.life * (m.drag ? 0.85 + Math.random() * 0.3 : 1), t: 0, m, missed: new Set(), seed: Math.random() * 6,
    });
  }

  // Surf: a wall of water rolls forward from the user, carrying everyone it meets.
  spawnSurf(f, m) {
    const dx = Math.cos(f.face), dy = Math.sin(f.face);
    this.surfs.push({ owner: f, m, x: f.x + dx * 8, y: f.y + dy * 8, dx, dy, z: f.zEff, t: 0, hit: new Set() });
    this.shake = Math.max(this.shake, 3);
  }

  // Bite: two rows of white fangs snapping shut.
  chomp(x, y) {
    this.sprites.push({ chomp: true, x, y, t: 0 });
  }

  // Lobbed shot (Sludge Bomb): arcs to a ground point, ignoring anything in between.
  spawnLob(f, m, tx, ty) {
    const p = f.mouth();
    this.projectiles.push({ owner: f, lob: true, x0: p.x, y0: p.y, x: p.x, y: p.y, tx, ty, z: f.zEff, h: f.sp.mouthH, t: 0, m, missed: new Set() });
  }

  // Sludge Bomb landing: poison splash on everyone near, then a puddle.
  landLob(p) {
    const { m, owner } = p;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      this.sprites.push({ frames: POISON.gas.slice(2), img: owner.skin.poison, x: p.x + Math.cos(a) * 8, y: p.y - 4 + Math.sin(a) * 4, t: -i * 0.03, fps: 22, scale: 0.6 });
    }
    this.shake = Math.max(this.shake, 2.5);
    const z = this.arena.surfaceAt(p.x, p.y) ?? p.z;
    for (const g of this.others(owner)) {
      if (Math.hypot(g.x - p.x, (g.y - p.y) * 1.4) > m.aoe + g.hurtR) continue;
      if (!sameHeight(z, g.zEff)) { this.miss(g); continue; }
      this.hit(owner, g, m, Math.atan2(g.y - p.y, g.x - p.x));
    }
    if (!this.arena.isWaterAt(p.x, p.y)) this.zones.push({ owner, Z: m.zone, x: p.x, y: p.y, z, t: 0, next: m.zone.tick });
  }

  // Hydro Pump glob landing: small splash that soaks and shoves away from the shooter, floor stays wet.
  landSplash(p) {
    const { m, owner } = p;
    if (this.arena.isWaterAt(p.x, p.y)) { this.sprites.push({ ripple: true, x: p.x, y: p.y, t: 0 }); return; }
    const z = this.arena.surfaceAt(p.x, p.y) ?? p.z;
    const cols = this.waterSparks(owner);
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI * (0.15 + 0.7 * Math.random()), sp = 30 + Math.random() * 40;
      this.particles.push({ x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 220, life: 0.35, max: 0.35, size: 1, col: cols[i] });
    }
    for (const g of this.others(owner)) {
      if (Math.hypot(g.x - p.x, (g.y - p.y) * 1.4) > m.aoe + g.hurtR) continue;
      if (!sameHeight(z, g.zEff)) { this.miss(g); continue; }
      if (this.gated(g, m.name, m.gap)) continue;
      this.hit(owner, g, m, Math.atan2(g.y - owner.y, g.x - owner.x));
      this.sparks(g.x, g.y - 10, 4, cols);
    }
    this.wetFloor(owner, m.zone, p.x, p.y, z);
  }

  // Lay a wet patch (merging into one close by), putting out any fire under it.
  wetFloor(owner, Z, x, y, z) {
    const over = (zn, r) => sameHeight(zn.z, z) && Math.hypot(zn.x - x, (zn.y - y) * 1.4) < r;
    this.zones = this.zones.filter((zn) => {
      if ((zn.Z.kind !== 'fire' && zn.Z.kind !== 'burn') || !over(zn, zn.Z.r + Z.r * 0.5)) return true;
      this.fizz(zn.x, zn.y, zn.Z.r);
      return false;
    });
    const near = this.zones.find((zn) => zn.Z.kind === 'wet' && zn.owner === owner && over(zn, Z.r * 0.7));
    if (near) near.t = Math.min(near.t, 0.2);
    else this.zones.push({ owner, Z, x, y, z, t: 0, next: 0 });
  }

  // Fire put out by water: puff of steam.
  fizz(x, y, r) {
    for (let i = 0; i < 6; i++) this.smoke(x + (Math.random() - 0.5) * r, y - 4);
    this.texts.push({ x, y: y - 14, txt: 'FIZZ', col: '#cfefff', t: 0, small: true });
  }

  // Per-target hit throttle for multi-hit sprays: true while `key` hit g less than `gap` s ago.
  gated(g, key, gap) {
    if (!gap) return false;
    g.gates ??= {};
    if (this.time - (g.gates[key] ?? -9) < gap) return true;
    g.gates[key] = this.time;
    return false;
  }

  // Fire Blast detonation: star of bursts, hits everything at that height in the radius.
  explode(p) {
    const { m, owner } = p;
    if (owner.sp.element === 'ghost') { this.shadowBurst(owner, m, p.x, p.y, m.aoe, p.z); return; }
    if (owner.sp.element === 'dragon') { this.dragonBurst(owner, m, p.x, p.y, p.z, p.h); return; }
    const y = p.y - p.h;
    this.burst(p.x, y, owner.skin, 1.2);
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i / 5) * Math.PI * 2;
      // arms pop out a beat after the core, one after another
      this.sprites.push({ frames: FIRE.burst.slice(1), img: owner.skin.fire, x: p.x + Math.cos(a) * 15, y: y + Math.sin(a) * 11, t: -0.04 - i * 0.015, fps: 30, scale: 0.7 });
    }
    this.shake = Math.max(this.shake, 4);
    for (const g of this.others(owner)) {
      if (Math.hypot(g.x - p.x, g.y - p.y) > m.aoe + g.hurtR) continue;
      if (!sameHeight(p.z, g.zEff)) { this.miss(g); continue; }
      this.hit(owner, g, m, Math.atan2(g.y - p.y, g.x - p.x));
    }
  }

  spawnZone(f, m, x, y) {
    const s = this.arena.surfaceAt(x, y);
    const z = s ?? f.z;
    // water always wins: fire cast onto a wet floor goes out at once
    if (this.zones.some((zn) => zn.Z.kind === 'wet' && sameHeight(zn.z, z) && Math.hypot(zn.x - x, (zn.y - y) * 1.4) < m.zone.r + zn.Z.r * 0.5)) {
      this.fizz(x, y, m.zone.r);
      return;
    }
    this.zones.push({ owner: f, Z: m.zone, x, y, z, t: 0, next: 0 });
    this.burst(x, y - 6, f.skin, 0.6, 1);
  }

  spawnWave(f, m) {
    this.waves.push({ owner: f, m, x: f.x, y: f.y, z: f.zEff, t: 0, hit: new Set() });
  }

  // Poison Powder: a cone of powder hanging in front for a moment; each foe is dusted once.
  spawnCloud(f, m) {
    const c = { owner: f, m, x: f.x, y: f.y, z: f.zEff, face: f.face, t: 0, hit: new Set(), puffs: [] };
    const reach = m.reach * f.size;
    for (let i = 0; i < 11; i++) {
      const a = f.face + (Math.random() - 0.5) * m.arc, d = reach * (0.35 + 0.65 * Math.random());
      c.puffs.push({ x: f.x + Math.cos(a) * d, y: f.y - 8 + Math.sin(a) * d * 0.7, delay: Math.random() * 0.12 });
    }
    this.clouds.push(c);
  }

  // Is g inside f's forward cone of radius `reach` and width `arc`?
  inCone(x, y, face, reach, arc, g) {
    const d = Math.hypot(g.x - x, g.y - y);
    if (d > reach + g.hurtR) return false;
    return d < g.hurtR + 6 || angleDiff(Math.atan2(g.y - y, g.x - x), face) <= arc / 2;
  }

  // Vine Whip: a lash along the facing; first foe touched is hit and knocked away.
  lash(f, m, len) {
    const p = f.mouth();
    const seg = { x0: p.x, y0: p.y, x1: p.x + Math.cos(f.face) * len, y1: p.y + Math.sin(f.face) * len };
    for (const g of this.others(f)) {
      if (distToSegment(g.x, g.y, seg) > g.hurtR + 3) continue;
      if (!sameHeight(f.zEff, g.zEff)) { this.miss(g); continue; }
      this.contact(f, g, m, Math.atan2(g.y - f.y, g.x - f.x));
      return true;
    }
    return false;
  }

  // Body Slam landing: shockwave all round the user.
  slam(f, m) {
    const r = m.aoe * f.size;
    this.sprites.push({ ring: true, x: f.x, y: f.y - 2, t: 0, rgb: '230,220,200' });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      this.particles.push({ x: f.x + Math.cos(a) * 6, y: f.y + Math.sin(a) * 3, vx: Math.cos(a) * 70, vy: Math.sin(a) * 30, g: 0, life: 0.35, max: 0.35, size: 2, col: 'rgba(230,220,235,0.8)' });
    }
    this.shake = Math.max(this.shake, 4);
    for (const g of this.others(f)) {
      if (Math.hypot(g.x - f.x, (g.y - f.y) * 1.3) > r + g.hurtR) continue;
      if (!sameHeight(f.zEff, g.zEff)) { this.miss(g); continue; }
      this.contact(f, g, m, Math.atan2(g.y - f.y, g.x - f.x));
    }
  }

  // Any foe pressed against the user's body (Body Slam ends its dash on contact).
  touching(f) {
    return this.others(f).some((g) => sameHeight(f.zEff, g.zEff) && Math.hypot(g.x - f.x, g.y - f.y) <= f.hurtR + g.hurtR + 3);
  }

  // Petal Dance / Rollout: anyone within radius r is hit, each foe at most every `every` s. True if anything was hit.
  petalRing(f, m, a) {
    const r = m.radius * f.size;
    a.lastHit ??= new Map();
    let landed = false;
    for (const g of this.others(f)) {
      if (Math.hypot(g.x - f.x, g.y - f.y) > r + g.hurtR) continue;
      if (this.time - (a.lastHit.get(g) ?? -9) < m.every) continue;
      if (!sameHeight(f.zEff, g.zEff)) { this.miss(g); continue; }
      a.lastHit.set(g, this.time);
      this.hit(f, g, m, Math.atan2(g.y - f.y, g.x - f.x));
      landed = true;
    }
    return landed;
  }

  // Straight lane from the mouth, cut short by terrain (Solar Beam).
  beamRay(f, m) {
    const p = f.mouth();
    const dx = Math.cos(f.face), dy = Math.sin(f.face);
    let len = 0;
    while (len < m.length && !this.arena.blocksAt(p.x + dx * (len + 4), p.y + dy * (len + 4), f.zEff)) len += 4;
    return { x0: p.x, y0: p.y, x1: p.x + dx * len, y1: p.y + dy * len, len };
  }

  // Beam pierces: everything in the lane is hit once per firing.
  beamHit(f, m, hitSet) {
    const ray = this.beamRay(f, m);
    for (const g of this.others(f)) {
      if (hitSet.has(g) || distToSegment(g.x, g.y, ray) > m.width * f.size / 2 + g.hurtR) continue;
      hitSet.add(g);
      if (!sameHeight(f.zEff, g.zEff)) { this.miss(g); continue; }
      this.hit(f, g, m, f.face);
      this.sparks(g.x, g.y - 10, 10, f.sp.element === 'water' ? this.waterSparks(f) : f.sp.element === 'dragon' ? this.dragonSparks(f) : ['#ffffff', '#fff6b0', '#d8ff7a']);
    }
  }

  // Ray from the mouth to where the stream is stopped by terrain (or max length).
  flameRay(f) {
    const m = MOVES.flame;
    const p = f.mouth();
    const dx = Math.cos(f.face), dy = Math.sin(f.face);
    let len = 0;
    while (len < m.length && !this.arena.blocksAt(p.x + dx * (len + 4), p.y + dy * (len + 4), f.zEff)) len += 4;
    return { x0: p.x, y0: p.y, x1: p.x + dx * len, y1: p.y + dy * len, len, blocked: len < m.length };
  }

  flameTick(f, m) {
    const ray = this.flameRay(f);
    for (const g of this.others(f)) {
      if (distToSegment(g.x, g.y, ray) > 9 + g.hurtR * 0.5) continue;
      if (!sameHeight(f.zEff, g.zEff)) { this.miss(g); continue; }
      this.hit(f, g, m, f.face);
      this.sparks(g.x, g.y - 10, 4, FIRE_SPARKS, this.isBlue(f));
    }
  }

  hit(attacker, target, m, angle) {
    // Withdraw's shell eats the whole hit, riders included
    if (!m.chip && target.guards(attacker, angle)) {
      this.ring(target.x, target.y - 10 - target.lift, '220,245,255');
      this.sparks(target.x, target.y - 10, 8, ['#ffffff', '#e8f6ff', '#c8b090']);
      this.texts.push({ x: target.x, y: target.y - 30 * target.size, txt: 'BLOCK', col: '#cfefff', t: 0, small: true });
      if (attacker) attacker.freeze = Math.max(attacker.freeze, 0.08);
      return;
    }
    // Focus Energy: the next few hits land harder
    const focus = attacker?.focus;
    if (focus && !m.chip && m.dmg) {
      m = { ...m, dmg: Math.round(m.dmg * focus.m.dmgMul), knock: m.knock * focus.m.knockMul, col: '#ffb347' };
      if (--focus.hits <= 0) attacker.focus = null;
      this.burst(target.x, target.y - 10 - target.lift, attacker.skin, 0.45, 1);
    }
    // asleep: the hit that wakes them lands harder
    if (target.sleepT > 0 && !m.chip && m.dmg) {
      m = { ...m, dmg: Math.round(m.dmg * SLEEP.wakeMul), col: '#e8b0ff' };
      this.texts.push({ x: target.x, y: target.y - 38 * target.size, txt: 'RUDE AWAKENING', col: '#e8b0ff', t: 0, small: true });
    }
    // Fury / Dragon Dance / Draco Meteor drain (fixed-damage moves ignore all of it)
    if (attacker && !m.chip && !m.fixed && m.dmg) {
      const k = attacker.dmgBoost(m);
      if (k !== 1) m = { ...m, dmg: Math.max(1, Math.round(m.dmg * k)), col: m.col ?? (k > 1 ? '#c8b8ff' : '#a0a0b0') };
    }
    // cursed: everything lands harder
    if (target.curse && m.dmg && !m.fixed) {
      const dmg = Math.round(m.dmg * (1 + CURSE.amp * target.curse.stacks));
      if (dmg !== m.dmg) m = { ...m, dmg, col: m.col ?? '#d0a0ff' };
    }
    const armored = target.takeHit({ dmg: m.dmg, angle, knock: m.knock, stop: m.stop, stun: m.stun, chip: m.chip });
    // knocked about while the bone is out: it drops where it is
    if (!armored && !m.chip && target.bone) this.dropBone(target.bone);
    if (m.launch && !armored && !target.ko) target.launch(m.launch);
    // Fury: the dragon line feeds on landing hits, and loses a stack to every real hit taken
    if (!m.chip && m.dmg) {
      if (target.fury) target.loseFury();
      if (attacker && attacker !== target && attacker.sp.element === 'dragon') attacker.addFury();
    }
    this.texts.push({ x: target.x, y: target.y - 26 * target.size, txt: String(m.dmg), col: m.col ?? (m.chip ? '#ffb347' : '#fff'), t: 0 });
    // status riders land even through armor
    if (!target.ko) {
      if (m.poison) target.addPoison(m.poison);
      if (m.soak) target.addSoak(m.soak);
      if (m.static) target.addStatic(m.static);
      if (m.hinder) {
        target.slowMul = target.slowT > 0 ? Math.min(target.slowMul, m.hinder.mul) : m.hinder.mul;
        target.slowT = Math.max(target.slowT, m.hinder.t);
      }
      if (m.static && attacker?.sp.element === 'electric' && (target.swimming || this.wetZoneAt(target.x, target.y, target.zEff))) this.electrify(attacker, target.x, target.y);
      if (m.curse) target.addCurse(m.curse);
      if (m.confuse) target.confuse(m.confuse);
      if (m.bind && attacker) target.bind(m.bind, attacker);
      if (m.mind) target.addMind(m.mind);
      if (m.sleep) target.fallAsleep(m.sleep);
      if (m.seedTime && attacker) target.plantSeed(attacker, m);
    }
    if (m.chip && !target.ko) return;
    if (armored) {
      // charge shrugs it off: damage only, no stagger
      this.ring(target.x, target.y - 10 - target.lift, '255,190,90');
      if (!target.lastArmor || this.time - target.lastArmor > 0.4) {
        target.lastArmor = this.time;
        this.texts.push({ x: target.x, y: target.y - 36, txt: 'ARMOR', col: '#ffb347', t: 0, small: true });
      }
      return;
    }
    this.shake = Math.max(this.shake, m.dmg >= 7 ? 3 : 1.5);
    this.ring(target.x, target.y - 10 - target.jz * TILE);
    if (target.ko) {
      this.shake = 6;
      this.texts.push({ x: target.x, y: target.y - 40, txt: 'K.O.!', col: '#ffd34d', t: -0.1, big: true });
    }
  }

  // Throttled "wrong height" feedback so players learn the rule.
  miss(target) {
    if (target.lastMiss && this.time - target.lastMiss < 0.5) return;
    target.lastMiss = this.time;
    this.texts.push({ x: target.x, y: target.y - 28, txt: 'MISS — HEIGHT', col: '#9fb4d8', t: 0, small: true });
  }

  // ---------- rock line ----------

  rockSparks(f) { return this.isBlue(f) ? ROCK_SPARKS_BLUE : ROCK_SPARKS; }

  // Stone chips thrown up (punch landings, boulder impacts, bounces).
  debris(x, y, n, f) {
    const cols = this.rockSparks(f);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI * (0.1 + 0.8 * Math.random()), s = 40 + Math.random() * 70;
      this.particles.push({ x: x + (Math.random() - 0.5) * 6, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 320, life: 0.45, max: 0.45, size: Math.random() < 0.5 ? 2 : 1, col: cols[i % 3] });
    }
  }

  // Hits everyone at height z inside a ground circle; returns how many were hit. `gap` throttles repeat hits.
  areaHit(owner, m, x, y, r, z, gap) {
    let n = 0;
    for (const g of this.others(owner)) {
      if (Math.hypot(g.x - x, (g.y - y) * QY) > r + g.hurtR) continue;
      if (!sameHeight(z, g.zEff)) { this.miss(g); continue; }
      if (this.gated(g, m.name, gap)) continue;
      this.hit(owner, g, m, Math.atan2(g.y - y, g.x - x));
      this.sparks(g.x, g.y - 10, 6, this.rockSparks(owner));
      n++;
    }
    return n;
  }

  // A boulder dropping out of the sky onto (x, y) after `delay` s.
  // opts: aoe (hit radius on landing), gap, heavy (big crunch on a hit), hidden (no sprite).
  spawnDrop(f, m, x, y, delay, opts = {}) {
    const z = this.arena.surfaceAt(x, y) ?? f.zEff;
    this.drops.push({ owner: f, m, x, y, z, t: -delay, frame: Math.floor(Math.random() * ROCK.big.length), ...opts });
  }

  landDrop(d) {
    const water = this.arena.isWaterAt(d.x, d.y);
    if (!d.hidden) {
      if (water) { this.sprites.push({ ripple: true, x: d.x, y: d.y, t: 0 }); this.splashBits(d.x, d.y); }
      else { this.debris(d.x, d.y - 3, 6, d.owner); this.sprites.push({ ring: true, x: d.x, y: d.y - 2, t: 0, rgb: '210,190,160' }); }
      this.shake = Math.max(this.shake, 2);
    }
    if (d.aoe && this.areaHit(d.owner, d.m, d.x, d.y, d.aoe, d.z, d.gap) && d.heavy) {
      // rock lands square on someone: bigger shake, shattered chips, dust ring
      this.shake = Math.max(this.shake, 4);
      this.debris(d.x, d.y - 8, 10, d.owner);
      this.sprites.push({ ring: true, x: d.x, y: d.y - 8, t: 0, rgb: '255,235,200' });
    }
  }

  // Rock Throw landing: the boulder shatters, hitting everyone close.
  landRock(p) {
    const { m, owner } = p;
    const z = this.arena.surfaceAt(p.x, p.y) ?? p.z;
    if (this.arena.isWaterAt(p.x, p.y)) { this.sprites.push({ ripple: true, x: p.x, y: p.y, t: 0 }); this.splashBits(p.x, p.y); return; }
    this.debris(p.x, p.y - 3, 12, owner);
    this.sprites.push({ ring: true, x: p.x, y: p.y - 2, t: 0, rgb: '230,210,170' });
    this.shake = Math.max(this.shake, 3);
    this.areaHit(owner, m, p.x, p.y, m.aoe, z);
  }

  splashBits(x, y) {
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI * (0.2 + 0.6 * Math.random()), s = 40 + Math.random() * 50;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 220, life: 0.4, max: 0.4, size: 1, col: i % 2 ? '#cfefff' : '#ffffff' });
    }
  }

  // Shock ring racing out over the ground to radius R. Anyone in the air when it passes is missed.
  spawnQuake(f, m, R) {
    this.quakes.push({ owner: f, m, x: f.x, y: f.y, z: f.z, t: 0, r: 0, R, hit: new Set(), jumped: new Set() });
    this.shake = Math.max(this.shake, 3 + R / 60);
    this.sprites.push({ ring: true, x: f.x, y: f.y - 2, t: 0, rgb: '230,200,160' });
  }

  // Glowing red danger circle on the floor (landing spots, quake reach). Brighter + faster once locked.
  redRing(ctx, x, y, r, p, locked, ry = r / QY) {
    const pulse = 0.6 + 0.4 * Math.sin(this.time * (locked ? 40 : 10));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = (locked ? 0.5 : 0.15 + 0.25 * Math.min(1, p)) * pulse * Math.min(1, 50 / r); // big rings stay see-through
    ctx.fillStyle = '#ff2020';
    ellipse(ctx, x, y, r, ry);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = locked ? 0.95 : 0.5 + 0.3 * pulse;
    ctx.strokeStyle = locked ? '#ff7070' : '#ff3030';
    ctx.lineWidth = r > 60 ? 2 : 1;
    ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.5, r), Math.max(0.5, ry), 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  updateRock(dt) {
    for (const d of this.drops) {
      d.t += dt;
      if (d.t >= d.m.fall) { d.done = true; this.landDrop(d); }
    }
    this.drops = this.drops.filter((d) => !d.done);

    for (const q of this.quakes) {
      q.t += dt;
      const prev = q.r;
      q.r = Math.min(q.R, q.t * q.m.speed);
      for (const g of this.others(q.owner)) {
        if (q.hit.has(g)) continue;
        const d = Math.hypot(g.x - q.x, (g.y - q.y) * QY);
        if (d > q.r + g.hurtR || d < prev - g.hurtR - 6) continue; // only the front of the ring hurts
        if (g.floating) continue; // drifts over it
        if (g.jump || !sameHeight(q.z, g.zEff)) {
          if (!q.jumped.has(g)) { q.jumped.add(g); this.texts.push({ x: g.x, y: g.y - 28, txt: 'JUMPED IT', col: '#cfe8ff', t: 0, small: true }); }
          continue;
        }
        q.hit.add(g);
        this.hit(q.owner, g, q.m, Math.atan2(g.y - q.y, g.x - q.x));
        this.debris(g.x, g.y - 2, 6, q.owner);
      }
      // chips jumping up off the front
      if (q.r < q.R) for (let i = 0; i < 3; i++) {
        const a = Math.random() * Math.PI * 2;
        const x = q.x + Math.cos(a) * q.r, y = q.y + (Math.sin(a) * q.r) / QY;
        if (this.arena.surfaceAt(x, y) !== null) this.particles.push({ x, y, vx: 0, vy: -50 - Math.random() * 50, g: 320, life: 0.3, max: 0.3, size: Math.random() < 0.4 ? 2 : 1, col: this.rockSparks(q.owner)[i] });
      }
    }
    this.quakes = this.quakes.filter((q) => q.t < q.R / q.m.speed + 0.3);
  }

  // Quake ring: red glowing front with dark cracks along it.
  drawQuake(ctx, q) {
    const fade = q.r < q.R ? 1 : Math.max(0, 1 - (q.t - q.R / q.m.speed) / 0.3);
    const r = Math.max(1, q.r), ry = r / QY;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5 * fade;
    ctx.strokeStyle = '#ff3020';
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.ellipse(q.x, q.y, r, ry, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 0.9 * fade;
    ctx.strokeStyle = '#ff9070';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(q.x, q.y, r, ry, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = `rgba(50,30,20,${0.75 * fade})`;
    ctx.lineWidth = 1;
    const n = Math.max(8, Math.round(r / 5));
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, j = ((i * 7) % 5) - 2; // fixed jag per crack
      ctx.moveTo(q.x + Math.cos(a) * (r - 3), q.y + (Math.sin(a) * (r - 3)) / QY);
      ctx.lineTo(q.x + Math.cos(a + 0.05) * (r + j), q.y + (Math.sin(a + 0.05) * (r + j)) / QY);
    }
    ctx.stroke();
  }

  // One rock sprite from `set` (big boulders by default), centred on (x, y).
  drawBoulder(ctx, f, frame, x, y, scale, angle = 0, set = ROCK.big) {
    const r = set[frame % set.length], w = r.w * scale, h = r.h * scale;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    if (angle) ctx.rotate(angle);
    ctx.drawImage(f.skin.rock, r.x, r.y, r.w, r.h, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  // Falling boulder: grows a shadow, drops from above.
  drawDrop(ctx, d) {
    if (d.hidden || d.t < 0) return;
    const k = Math.min(1, d.t / d.m.fall);
    this.drawBoulder(ctx, d.owner, d.frame, d.x, d.y - 9 - FALL_H * (1 - k * k), 1.6, d.t * 6);
  }

  // ---------- ground line ----------

  // Bonemerang: flies out to (aim) along a curve, hangs, then curves back to the thrower.
  throwBone(f, m, aim) {
    const z = f.zEff;
    const dx = aim.x - f.x, dy = aim.y - f.y, len = Math.hypot(dx, dy) || 1;
    const b = { owner: f, m, state: 'out', x: f.x, y: f.y - 2, z, t: 0, spin: 0, x0: f.x, y0: f.y - 2, tx: aim.x, ty: aim.y, hit: new Set() };
    // control point bowed sideways off the straight line (Marowak's throw curves)
    b.cx = (f.x + aim.x) / 2 - (dy / len) * m.curve * len;
    b.cy = (f.y + aim.y) / 2 + (dx / len) * m.curve * len;
    f.bone = b;
    this.bones.push(b);
  }

  // Head home from wherever the bone is (end of the throw, or picked up off the floor).
  returnBone(b) {
    const o = b.owner;
    b.state = 'back';
    b.t = 0;
    b.ax = b.x; b.ay = b.y;
    b.z = o.zEff;
    b.hit = new Set();
    b.dur = Math.max(0.15, Math.hypot(o.x - b.x, o.y - b.y) / b.m.back);
  }

  // Thrower got hit: the bone falls out of the air. Never into the moat: then it flies home.
  dropBone(b) {
    if (b.state === 'ground') return;
    if (this.arena.surfaceAt(b.x, b.y) === null || this.arena.isWaterAt(b.x, b.y)) { if (b.state !== 'back') this.returnBone(b); return; }
    b.state = 'ground';
    b.t = 0;
    b.z = this.arena.surfaceAt(b.x, b.y);
    this.dust(b.x, b.y);
    this.texts.push({ x: b.x, y: b.y - 14, txt: 'BONE DROPPED', col: '#e8dcc8', t: 0, small: true });
  }

  catchBone(b) {
    b.done = true;
    b.owner.bone = null;
    this.ring(b.owner.x, b.owner.y - 10 * b.owner.size, '240,230,210');
  }

  updateBones(dt) {
    for (const b of this.bones) {
      const o = b.owner, m = b.m, px = b.x, py = b.y;
      b.t += dt;
      if (b.state === 'ground') {
        if (o.hittable && !o.jump && Math.hypot(o.x - b.x, o.y - b.y) < o.hurtR + 8) this.catchBone(b);
        else if (b.t >= BONE_REST) this.returnBone(b);
        continue;
      }
      b.spin += dt * 24;
      if (b.state === 'out') {
        const u = Math.min(1, b.t / m.out), k = 1 - (1 - u) * (1 - u); // slows into the turn
        [b.x, b.y] = bez(b.x0, b.y0, b.cx, b.cy, b.tx, b.ty, k);
        if (b.t >= m.out + m.hang) this.returnBone(b);
      } else {
        // bow out the same way on the trip home, chasing wherever the thrower is now
        const ex = o.x, ey = o.y - 2, dx = ex - b.ax, dy = ey - b.ay, len = Math.hypot(dx, dy) || 1;
        const cx = (b.ax + ex) / 2 - (dy / len) * m.curve * len, cy = (b.ay + ey) / 2 + (dx / len) * m.curve * len;
        const u = Math.min(1, b.t / b.dur);
        [b.x, b.y] = bez(b.ax, b.ay, cx, cy, ex, ey, u * u * (3 - 2 * u));
        if (u >= 1 || (b.t > 0.05 && Math.hypot(o.x - b.x, o.y - b.y) < o.hurtR + 4)) { this.catchBone(b); continue; }
      }
      if (Math.random() < 0.5) this.particles.push({ x: b.x, y: b.y - 10 * o.size, vx: 0, vy: 0, g: 0, life: 0.15, max: 0.15, size: 1, col: '#f4ecdc' });
      // hits each foe once per trip; the trip home can drag them in (Marowak)
      const ang = Math.atan2(b.y - py, b.x - px);
      for (const g of this.others(o)) {
        if (b.hit.has(g) || Math.hypot(g.x - b.x, g.y - b.y) > m.hitR * m.scale + g.hurtR) continue;
        if (!sameHeight(b.z, g.zEff)) { this.miss(g); continue; }
        b.hit.add(g);
        const back = b.state === 'back';
        this.hit(o, g, back && m.pull ? { ...m, knock: m.pull } : m, back && m.pull ? Math.atan2(o.y - g.y, o.x - g.x) : ang);
        this.sparks(g.x, g.y - 10, 8, HIT_SPARKS);
        if (b.done || b.state === 'ground') break; // the hit knocked the bone loose
      }
    }
    this.bones = this.bones.filter((b) => !b.done);
  }

  drawBone(ctx, b) {
    const o = b.owner, r = BONE.spin[0], k = b.m.scale;
    const ground = b.state === 'ground';
    const y = b.y - (ground ? 2 : 10 * o.size);
    ctx.save();
    ctx.translate(Math.round(b.x), Math.round(y));
    ctx.rotate(ground ? 0.3 : b.spin);
    ctx.scale(k, k);
    ctx.drawImage(o.skin.body, r.x, r.y, r.w, r.h, -r.w / 2, -r.h / 2, r.w, r.h);
    ctx.restore();
    // lying around: a glint so it reads as something to pick up
    if (ground && Math.floor(this.time * 3) % 2) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(b.x + 3), Math.round(y - 4), 1, 3);
      ctx.fillRect(Math.round(b.x + 2), Math.round(y - 3), 3, 1);
    }
  }

  // Bone Spike Lane: a row of spikes bursting up along the facing, one after another.
  spawnSpikes(f, m) {
    const dx = Math.cos(f.face), dy = Math.sin(f.face), len = m.length * f.size;
    const pts = [];
    for (let i = 0; i < m.count; i++) {
      const d = m.near + (i / (m.count - 1)) * (len - m.near);
      pts.push({ x: f.x + dx * d, y: f.y + dy * d, at: i * m.every });
    }
    this.spikes.push({ owner: f, m, dx, dy, z: f.z, t: 0, n: 0, pts, hit: new Set(), jumped: new Set() });
  }

  updateSpikes(dt) {
    for (const sp of this.spikes) {
      const { m, owner } = sp;
      sp.t += dt;
      while (sp.n < sp.pts.length && sp.t >= sp.pts[sp.n].at) {
        const pt = sp.pts[sp.n++];
        if (this.arena.surfaceAt(pt.x, pt.y) === null || this.arena.isWaterAt(pt.x, pt.y)) { pt.dud = true; continue; }
        this.debris(pt.x, pt.y - 2, 5, owner);
        this.shake = Math.max(this.shake, 1.5);
        for (const g of this.others(owner)) {
          if (sp.hit.has(g) || Math.hypot(g.x - pt.x, (g.y - pt.y) * QY) > m.spikeR + g.hurtR) continue;
          if (g.floating) continue;
          if (g.jump || g.launchT > 0 || !sameHeight(sp.z, g.zEff)) {
            if (!sp.jumped.has(g)) { sp.jumped.add(g); this.texts.push({ x: g.x, y: g.y - 28, txt: 'JUMPED IT', col: '#cfe8ff', t: 0, small: true }); }
            continue;
          }
          sp.hit.add(g);
          this.hit(owner, g, m, Math.atan2(sp.dy, sp.dx));
          this.sparks(g.x, g.y - 10, 10, HIT_SPARKS);
          this.debris(g.x, g.y - 4, 8, owner);
        }
      }
    }
    this.spikes = this.spikes.filter((sp) => sp.t < sp.pts[sp.pts.length - 1].at + sp.m.life);
  }

  // One spike: tip punches up out of a dirt mound, holds, then sinks back.
  drawSpike(ctx, sp, pt) {
    const age = sp.t - pt.at, life = sp.m.life;
    if (age < 0 || pt.dud) return;
    const k = Math.min(1, age / 0.05, (life - age) / 0.12);
    if (k <= 0) return;
    const img = sp.owner.skin.spike, S = 2 * sp.owner.size;
    const h = Math.max(1, Math.round(img.height * k));
    ctx.fillStyle = 'rgba(90,60,40,0.7)';
    ellipse(ctx, pt.x, pt.y, 6 * sp.owner.size, 2.5 * sp.owner.size);
    ctx.drawImage(img, 0, 0, img.width, h, Math.round(pt.x - (img.width * S) / 2), Math.round(pt.y - h * S), Math.round(img.width * S), Math.round(h * S));
  }

  // ---------- electric line ----------

  // Little arcs jumping off a charged / paralyzed body (always yellow: it's the victim's charge).
  crackle(f, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 30 + Math.random() * 50;
      this.particles.push({ x: f.x + (Math.random() - 0.5) * 12 * f.size, y: f.y - f.lift - Math.random() * 18 * f.size, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 0, life: 0.12, max: 0.12, size: 1, col: ELEC_SPARKS[i % 3] });
    }
  }

  // Volt Tackle / Wild Charge connected: the user takes some back.
  recoil(f, dmg) {
    this.hit(null, f, { dmg, chip: true, col: '#ffe23a' }, 0);
    this.texts.push({ x: f.x, y: f.y - 36 * f.size, txt: 'RECOIL', col: '#ffe23a', t: 0, small: true });
  }

  // Thunder: the strike point is locked as the charge releases, the bolt lands `delay` later.
  // opts: kind ('rage' | 'meteor' for the dragon line), d (own delay instead of m.delay).
  spawnStrike(f, m, x, y, opts = {}) {
    this.strikes.push({ owner: f, m, x, y, z: this.arena.surfaceAt(x, y) ?? f.zEff, t: 0, ...opts });
  }

  updateStrikes(dt) {
    for (const st of this.strikes) {
      st.t += dt;
      if (st.fired || st.t < (st.d ?? st.m.delay)) continue;
      st.fired = true;
      if (st.kind) this.strikeFx(st);
      else {
        this.electrifyArea(st.owner, st.x, st.y, st.m.aoe);
        this.shake = Math.max(this.shake, 5);
        this.sparks(st.x, st.y - 4, 16, this.elecSparks(st.owner));
        this.sprites.push({ ring: true, x: st.x, y: st.y - 2, t: 0, rgb: this.isBlue(st.owner) ? '200,170,255' : '255,240,120' });
      }
      for (const g of this.others(st.owner)) {
        if (Math.hypot(g.x - st.x, (g.y - st.y) * QY) > st.m.aoe + g.hurtR) continue;
        if (!sameHeight(st.z, g.zEff)) { this.miss(g); continue; }
        this.hit(st.owner, g, st.m, Math.atan2(g.y - st.y, g.x - st.x));
      }
    }
    this.strikes = this.strikes.filter((st) => st.t < (st.d ?? st.m.delay) + 0.3);
  }

  // ---------- electrified water ----------
  // Moat water is charged tile by tile (this.shockTiles); a wet-floor puddle is charged whole (this.shocks).

  wetZoneAt(x, y, z) {
    return this.zones.find((zn) => zn.Z.kind === 'wet' && sameHeight(zn.z, z) && Math.hypot(zn.x - x, (zn.y - y) * QY) < zn.Z.r);
  }

  // Charge the water at (x, y), if there is any: a wet floor is charged whole, the moat round
  // the touch point tile by tile. Touching charged water refreshes it. Returns true if water was charged.
  electrify(owner, x, y) {
    const zn = this.wetZoneAt(x, y, this.arena.surfaceAt(x, y) ?? owner.zEff);
    if (zn) {
      const old = this.shocks.find((s) => s.zone === zn);
      if (old) { old.owner = owner; old.t = 0; return true; }
      this.shocks.push({ owner, zone: zn, x: zn.x, y: zn.y, z: zn.z, r: zn.Z.r, t: 0 });
      this.shockFx(owner, zn.x, zn.y);
      return true;
    }
    if (!this.arena.isWaterAt(x, y)) return false;
    const c0 = Math.floor(x / TILE), r0 = Math.floor(y / TILE);
    let fresh = false;
    for (let r = r0 - 1; r <= r0 + 1; r++) for (let c = c0 - 1; c <= c0 + 1; c++) {
      if (this.arena.cell(c, r)?.kind !== 'water') continue;
      if (Math.hypot((c + 0.5) * TILE - x, (r + 0.5) * TILE - y) > SHOCK.r + TILE / 2) continue;
      const key = c + ',' + r, old = this.shockTiles.get(key);
      if (!old) fresh = true;
      this.shockTiles.set(key, { owner, c, r, t: 0 });
    }
    if (fresh) this.shockFx(owner, x, y);
    return true;
  }

  shockFx(owner, x, y) {
    this.sparks(x, y - 2, 6, this.elecSparks(owner));
    this.sprites.push({ ring: true, x, y: y - 2, t: 0, rgb: this.isBlue(owner) ? '200,170,255' : '255,240,120' });
  }

  // Thunder: every bit of water inside the strike circle.
  electrifyArea(owner, x, y, r) {
    for (let dy = -r; dy <= r; dy += 12) for (let dx = -r; dx <= r; dx += 12) {
      if (Math.hypot(dx, dy) <= r) this.electrify(owner, x + dx, y + dy / QY);
    }
  }

  // Who charged the water g is in (null if g isn't in charged water, or is above it:
  // hovering, flying, mid-hop). The caster's own charge never hurts them.
  shockOwner(g) {
    if (g.floating || g.jz > 0.2) return null;
    const tile = this.shockTiles.get(Math.floor(g.x / TILE) + ',' + Math.floor(g.y / TILE));
    if (tile && tile.owner !== g && this.arena.isWaterAt(g.x, g.y)) return tile.owner;
    const s = this.shocks.find((s) => s.owner !== g && sameHeight(s.z, g.zEff) && Math.hypot(g.x - s.x, (g.y - s.y) * QY) < s.r + g.hurtR * 0.5);
    return s?.owner ?? null;
  }

  updateShocks(dt) {
    for (const s of this.shocks) {
      s.t += dt;
      if (!this.zones.includes(s.zone)) s.t = SHOCK.life; // puddle dried up
      else { s.x = s.zone.x; s.y = s.zone.y; }
    }
    this.shocks = this.shocks.filter((s) => s.t < SHOCK.life);
    for (const [key, tile] of this.shockTiles) if ((tile.t += dt) >= SHOCK.life) this.shockTiles.delete(key);
    for (const g of this.fighters) {
      if (!g.hittable) continue;
      const owner = this.shockOwner(g);
      if (!owner || this.gated(g, 'shockwater', SHOCK.tick)) continue;
      this.hit(owner, g, { dmg: SHOCK.dmg, chip: true, col: '#ffe23a' }, 0);
      g.addStatic(SHOCK.static);
      this.crackle(g, 4);
    }
  }

  // Charged moat tiles: yellow glow, a red outline round the charged area, arcs skittering across.
  drawShockTiles(ctx) {
    if (!this.shockTiles.size) return;
    const pulse = 0.6 + 0.4 * Math.sin(this.time * 18);
    for (const tile of this.shockTiles.values()) {
      const x = tile.c * TILE, y = tile.r * TILE, fade = Math.min(1, (SHOCK.life - tile.t) * 3);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.22 * fade * pulse;
      ctx.fillStyle = tile.owner.skin.tint;
      ctx.fillRect(x, y, TILE, TILE);
      ctx.restore();
      // red edge only where the neighbour isn't charged, so overlapping charges read as one area
      ctx.save();
      ctx.globalAlpha = 0.9 * fade;
      ctx.strokeStyle = '#ff3030';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const edge = (dc, dr) => !this.shockTiles.has(tile.c + dc + ',' + (tile.r + dr));
      if (edge(0, -1)) { ctx.moveTo(x, y + 0.5); ctx.lineTo(x + TILE, y + 0.5); }
      if (edge(0, 1)) { ctx.moveTo(x, y + TILE - 0.5); ctx.lineTo(x + TILE, y + TILE - 0.5); }
      if (edge(-1, 0)) { ctx.moveTo(x + 0.5, y); ctx.lineTo(x + 0.5, y + TILE); }
      if (edge(1, 0)) { ctx.moveTo(x + TILE - 0.5, y); ctx.lineTo(x + TILE - 0.5, y + TILE); }
      ctx.stroke();
      ctx.restore();
      if (Math.random() < 0.6) {
        ctx.save();
        ctx.globalAlpha = fade;
        const x0 = x + 3 + Math.random() * (TILE - 6), y0 = y + 3 + Math.random() * (TILE - 6), b = Math.random() * Math.PI * 2, l = 5 + Math.random() * 6;
        this.lightning(ctx, x0, y0, x0 + Math.cos(b) * l, y0 + Math.sin(b) * l * 0.6, tile.owner, 1, 2);
        ctx.restore();
      }
    }
  }

  // Charged puddle: red danger ring + arcs of lightning over it.
  drawShock(ctx, s) {
    const fade = Math.min(1, (SHOCK.life - s.t) * 3);
    this.redRing(ctx, s.x, s.y, s.r, 1, true);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.18 * fade;
    ctx.fillStyle = s.owner.skin.tint;
    ellipse(ctx, s.x, s.y, s.r, s.r / QY);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = fade;
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.random() * s.r * 0.8, l = 6 + Math.random() * 8, b = Math.random() * Math.PI * 2;
      const x0 = s.x + Math.cos(a) * d, y0 = s.y + (Math.sin(a) * d) / QY;
      this.lightning(ctx, x0, y0, x0 + Math.cos(b) * l, y0 + (Math.sin(b) * l) / QY, s.owner, 1, 2);
    }
    ctx.restore();
  }

  // Jagged lightning from (x0, y0) to (x1, y1): soft wide glow, bright thin core. Re-jags every frame.
  lightning(ctx, x0, y0, x1, y1, f, width = 1, jag = 4) {
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
    const n = Math.max(2, Math.round(len / 7));
    const pts = [[x0, y0]];
    for (let i = 1; i < n; i++) {
      const k = i / n, o = (Math.random() - 0.5) * 2 * jag;
      pts.push([x0 + dx * k - (dy / len) * o, y0 + dy * k + (dx / len) * o]);
    }
    pts.push([x1, y1]);
    const line = () => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); };
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha *= 0.5;
    ctx.strokeStyle = f.skin.tint;
    ctx.lineWidth = width + 3;
    line();
    ctx.globalAlpha *= 2;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = width;
    line();
    ctx.restore();
  }

  // Body wrapped in electricity while charging through (Volt Tackle, Wild Charge).
  elecAura(ctx, f, r) {
    const cx = f.x, cy = f.y - f.lift - 9 * f.size, rr = r * f.size;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = f.skin.tint;
    ellipse(ctx, cx, cy, rr, rr * 0.8);
    ctx.restore();
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2, b = a + 0.8 + Math.random();
      this.lightning(ctx, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.8, cx + Math.cos(b) * rr, cy + Math.sin(b) * rr * 0.8, f, 1, 3);
    }
  }

  // Thunder before it lands: red circle; after: the bolt from the sky, fading.
  drawStrike(ctx, st) {
    if (!st.fired) {
      this.redRing(ctx, st.x, st.y, st.m.aoe, 1, true);
      if (st.kind === 'future') {
        // countdown: a psychic ring closing in on the spot
        const k = 1 - st.t / (st.d ?? st.m.delay);
        ctx.save();
        ctx.strokeStyle = st.owner.skin.tint;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.9;
        ctx.beginPath(); ctx.ellipse(st.x, st.y, st.m.aoe * (0.15 + 1.6 * k), (st.m.aoe * (0.15 + 1.6 * k)) / QY, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      return;
    }
    if (st.kind) return; // kind strikes are all sprites
    const k = 1 - (st.t - st.m.delay) / 0.3;
    if (k <= 0) return;
    ctx.save();
    ctx.globalAlpha = k;
    this.lightning(ctx, st.x + (Math.random() - 0.5) * 10, st.y - SKY_H, st.x, st.y - 2, st.owner, 2.5, 8);
    if (k > 0.5) this.lightning(ctx, st.x, st.y - SKY_H * 0.6, st.x + (Math.random() - 0.5) * 30, st.y - SKY_H * 0.2, st.owner, 1, 5); // a fork
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5 * k;
    ctx.fillStyle = st.owner.skin.tint;
    const r = st.m.aoe * (1.2 - 0.2 * k);
    ellipse(ctx, st.x, st.y, r, r / QY);
    ctx.restore();
  }

  // ---------- ghost line ----------

  ghostSparks(f) { return this.isBlue(f) ? GHOST_SPARKS_BLUE : GHOST_SPARKS; }

  // Purple wisps drifting up (charge release, curse marks, shadow bursts). `cursed` = always purple (it's the victim's mark).
  wisps(x, y, n, f, cursed = false) {
    const cols = cursed ? GHOST_SPARKS : this.ghostSparks(f);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 20 + Math.random() * 50;
      this.particles.push({ x: x + (Math.random() - 0.5) * 6, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.5 - 25, g: -20, life: 0.4, max: 0.4, size: Math.random() < 0.5 ? 2 : 1, col: cols[1 + (i % 2)] });
    }
  }

  // Phantom Force rising / Shadow Ball bursting: shadow splash that hits everyone in the circle.
  shadowBurst(f, m, x, y, r, z = f.z) {
    this.shake = Math.max(this.shake, 3.5);
    this.wisps(x, y - 6, 16, f);
    this.sprites.push({ ring: true, x, y: y - 4, t: 0, rgb: this.isBlue(f) ? '150,255,180' : '200,150,255' });
    for (let i = 0; i < 5; i++) this.hands.push({ owner: f, x: x + (Math.random() - 0.5) * r * 1.4, y: y + (Math.random() - 0.5) * r * 0.7, t: -i * 0.03, life: 0.35 });
    for (const g of this.others(f)) {
      if (Math.hypot(g.x - x, (g.y - y) * QY) > r + g.hurtR) continue;
      if (!sameHeight(z, g.zEff)) { this.miss(g); continue; }
      this.hit(f, g, m, Math.atan2(g.y - y, g.x - x));
      this.sparks(g.x, g.y - 10, 8, this.ghostSparks(f));
    }
  }

  // Phantom Force: a spot just behind the foe (opposite the way they face), facing them.
  // Walls or water in the way: try further round them. No foe: rise where you are.
  ambushPoint(f, gap) {
    const foe = this.fighters.find((g) => g !== f && !g.ko);
    if (!foe) return { x: f.x, y: f.y, face: f.face };
    const d = foe.hurtR + f.hurtR + gap;
    for (const off of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8, Math.PI]) {
      const a = foe.face + Math.PI + off, x = foe.x + Math.cos(a) * d, y = foe.y + Math.sin(a) * d;
      if (this.arena.fits(x, y, foe.z, RADIUS, f.floating)) return { x, y, face: Math.atan2(foe.y - y, foe.x - x) };
    }
    return { x: f.x, y: f.y, face: f.face };
  }

  // Dark puddle on the floor (Phantom Force's moving shadow, Nightmare's ground).
  shadowPool(ctx, x, y, r) {
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#1a0828';
    ellipse(ctx, x, y, r, r / QY);
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#5a2a8a';
    ellipse(ctx, x, y, r * 0.6, (r * 0.6) / QY);
    ctx.restore();
  }

  spawnNightmare(f, m, x, y) {
    this.nightmares.push({ owner: f, m, x, y, z: this.arena.surfaceAt(x, y) ?? f.z, t: 0, next: 0 });
  }

  updateNightmares(dt) {
    for (const nm of this.nightmares) {
      const { m, owner } = nm;
      nm.t += dt;
      while (nm.t < m.last && nm.t >= nm.next) {
        nm.next += m.every;
        // a hand claws up at a random spot inside the circle
        const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * (m.r - 4);
        const x = nm.x + Math.cos(a) * d, y = nm.y + (Math.sin(a) * d) / QY;
        this.hands.push({ owner, x, y, t: 0, life: 0.3 });
        for (const g of this.others(owner)) {
          if (Math.hypot(g.x - x, (g.y - y) * QY) > m.handR + g.hurtR) continue;
          if (!sameHeight(nm.z, g.zEff)) { this.miss(g); continue; }
          if (this.gated(g, m.name, m.gap)) continue;
          this.hit(owner, g, m, Math.atan2(nm.y - g.y, nm.x - g.x)); // hands drag you toward the middle
          this.sparks(g.x, g.y - 10, 6, this.ghostSparks(owner));
        }
      }
    }
    this.nightmares = this.nightmares.filter((nm) => nm.t < nm.m.last + 0.2);
    for (const h of this.hands) h.t += dt;
    this.hands = this.hands.filter((h) => h.t < h.life);
  }

  drawNightmareGround(ctx, nm) {
    const fade = Math.min(1, nm.t * 8, (nm.m.last + 0.2 - nm.t) * 5);
    ctx.save();
    ctx.globalAlpha = fade;
    this.shadowPool(ctx, nm.x, nm.y, nm.m.r);
    ctx.restore();
    if (nm.t < nm.m.last) this.redRing(ctx, nm.x, nm.y, nm.m.r, 1, true);
  }

  // A shadow hand clawing up out of the floor, then sinking back.
  drawHand(ctx, h) {
    if (h.t < 0) return;
    const k = Math.min(1, h.t / 0.08, (h.life - h.t) / 0.12);
    if (k <= 0) return;
    const img = h.owner.skin.hand, S = 2.2;
    const hh = Math.max(1, Math.round(img.height * k));
    ctx.drawImage(img, 0, 0, img.width, hh, Math.round(h.x - (img.width * S) / 2), Math.round(h.y - hh * S), Math.round(img.width * S), Math.round(hh * S));
  }

  // Night Shade / Shadow Ball: dark core in a soft purple glow.
  drawShadowOrb(ctx, p, y, r) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = p.owner.skin.tint;
    ctx.beginPath(); ctx.arc(p.x, y, r + 3 + Math.sin(p.t * 20), 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#1a0828';
    ctx.beginPath(); ctx.arc(p.x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = this.ghostSparks(p.owner)[1];
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(p.x, y, r, p.t * 6, p.t * 6 + 4); ctx.stroke();
  }

  // ---------- flying line ----------

  windSparks(f) { return this.isBlue(f) ? WIND_SPARKS_BLUE : WIND_SPARKS; }

  // Gust / Whirlwind: enemy shots inside the cone are blown out of the air.
  blowAway(f, m) {
    let n = 0;
    for (const p of this.projectiles) {
      if (p.owner === f || p.dead || p.lob) continue;
      if (!this.inCone(f.x, f.y, f.face, m.reach * f.size, m.arc, { x: p.x, y: p.y, hurtR: 4 })) continue;
      p.dead = true;
      n++;
      this.sparks(p.x, p.y - p.h, 5, this.windSparks(f));
    }
    if (n) this.texts.push({ x: f.x + Math.cos(f.face) * 30, y: f.y - 30, txt: 'BLOWN AWAY', col: '#e8f4ff', t: 0, small: true });
  }

  // Aerial Ace: blink beside the nearest foe in range and slash. Nobody in range: a short forward dart.
  aerialAce(f, m) {
    const x0 = f.x, y0 = f.y;
    let best = null, bd = m.range * f.size;
    for (const g of this.others(f)) {
      const d = Math.hypot(g.x - f.x, g.y - f.y);
      if (d < bd) { bd = d; best = g; }
    }
    if (!best) {
      for (let i = 0; i < 6; i++) { f.moveBy(Math.cos(f.face) * 6, Math.sin(f.face) * 6); f.afterimage(); }
      return false;
    }
    const ang = Math.atan2(best.y - f.y, best.x - f.x), stop = best.hurtR + f.hurtR + 3;
    const tx = best.x - Math.cos(ang) * stop, ty = best.y - Math.sin(ang) * stop;
    // trail of afterimages along the blink
    const steps = Math.max(1, Math.ceil(Math.hypot(tx - f.x, ty - f.y) / 8));
    for (let i = 1; i <= steps; i++) {
      const k = i / steps;
      if (this.arena.fits(x0 + (tx - x0) * k, y0 + (ty - y0) * k, f.z, 4, true)) { f.x = x0 + (tx - x0) * k; f.y = y0 + (ty - y0) * k; }
      f.afterimage();
    }
    f.face = ang;
    this.contact(f, best, m, ang); // can't miss: height doesn't matter
    // the slash: a bright line across the target
    for (let i = 0; i < 8; i++) {
      const k = (i / 7 - 0.5) * 22;
      this.particles.push({ x: best.x + Math.cos(ang + Math.PI / 2) * k, y: best.y - 10 + Math.sin(ang + Math.PI / 2) * k * 0.6, vx: Math.cos(ang) * 30, vy: Math.sin(ang) * 30, g: 0, life: 0.15, max: 0.15, size: 2, col: '#ffffff' });
    }
    return true;
  }

  spawnTwister(f, m) {
    const dx = Math.cos(f.face), dy = Math.sin(f.face);
    this.twisters.push({ owner: f, m, x: f.x + dx * 12, y: f.y + dy * 12, vx: dx * m.speed, vy: dy * m.speed, z: f.zEff, t: 0, caught: null, next: 0 });
  }

  updateTwisters(dt) {
    for (const tw of this.twisters) {
      const { m, owner } = tw;
      tw.t += dt;
      tw.x += tw.vx * dt;
      tw.y += tw.vy * dt;
      const ending = tw.t >= m.life || this.arena.blocksAt(tw.x, tw.y, tw.z);
      if (!tw.caught) {
        for (const g of this.others(owner)) {
          if (Math.hypot(g.x - tw.x, (g.y - tw.y) * QY) > m.r + g.hurtR) continue;
          if (!sameHeight(tw.z, g.zEff)) { this.miss(g); continue; }
          tw.caught = g;
          this.texts.push({ x: g.x, y: g.y - 30 * g.size, txt: 'CAUGHT!', col: '#e8f4ff', t: 0, small: true });
          break;
        }
      }
      const g = tw.caught;
      if (g && !g.hittable) tw.caught = null; // KO'd, dove into shadows, ...
      else if (g) {
        // spun along inside the funnel
        const k = Math.min(1, dt * 14);
        g.moveBy((tw.x - g.x) * k, (tw.y - g.y) * k);
        g.kvx = g.kvy = 0;
        if (tw.t >= tw.next) { tw.next = tw.t + m.every; this.hit(owner, g, m, 0); }
        if (ending) {
          this.hit(owner, g, { ...m, ...m.fling, name: m.name }, Math.atan2(tw.vy, tw.vx));
          this.sparks(g.x, g.y - 10, 10, this.windSparks(owner));
        }
      }
      if (Math.random() < 0.6) this.particles.push({ x: tw.x + (Math.random() - 0.5) * 16, y: tw.y - Math.random() * 6, vx: (Math.random() - 0.5) * 60, vy: -30 - Math.random() * 30, g: 60, life: 0.35, max: 0.35, size: 1, col: 'rgba(200,190,170,0.9)' });
      if (ending) tw.done = true;
    }
    this.twisters = this.twisters.filter((tw) => !tw.done);
  }

  spawnHurricane(f, m, x, y) {
    this.hurricanes.push({ owner: f, m, x, y, z: this.arena.surfaceAt(x, y) ?? f.z, t: 0, next: m.every });
    this.shake = Math.max(this.shake, 3);
  }

  updateHurricanes(dt) {
    for (const h of this.hurricanes) {
      const { m, owner } = h;
      h.t += dt;
      const inside = this.others(owner).filter((g) => Math.hypot(g.x - h.x, (g.y - h.y) * QY) < m.r + g.hurtR && sameHeight(h.z, g.zEff));
      // sucked toward the eye
      for (const g of inside) {
        const dx = h.x - g.x, dy = h.y - g.y, d = Math.hypot(dx, dy);
        if (d > 3) g.moveBy((dx / d) * m.pull * dt, (dy / d) * m.pull * dt);
      }
      if (h.t < m.last && h.t >= h.next) {
        h.next += m.every;
        for (const g of inside) this.hit(owner, g, m, 0);
      }
      if (h.t >= m.last && !h.flung) {
        h.flung = true;
        this.shake = Math.max(this.shake, 4);
        for (const g of inside) {
          this.hit(owner, g, { ...m, ...m.fling }, Math.atan2(g.y - h.y, g.x - h.x) || Math.random() * 6);
          this.sparks(g.x, g.y - 10, 10, this.windSparks(owner));
        }
      }
      // wind streaks spiralling inward
      if (h.t < m.last) for (let i = 0; i < 3; i++) {
        const a = Math.random() * Math.PI * 2, r = m.r * (0.6 + Math.random() * 0.5);
        this.particles.push({ x: h.x + Math.cos(a) * r, y: h.y + (Math.sin(a) * r) / QY - 4, vx: -Math.sin(a) * 90 - Math.cos(a) * 30, vy: (Math.cos(a) * 90 - Math.sin(a) * 30) / QY, g: 0, life: 0.25, max: 0.25, size: 1, col: this.windSparks(owner)[i] });
      }
    }
    this.hurricanes = this.hurricanes.filter((h) => h.t < h.m.last + 0.3);
  }

  // A funnel of spinning air: stacked rings, wider toward the top.
  drawFunnel(ctx, x, y, r, hgt, t, f, alpha = 1) {
    ctx.save();
    ctx.lineWidth = 1.5;
    const n = 7;
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1), rr = r * (0.35 + 0.65 * k), yy = y - k * hgt, wob = Math.sin(t * 9 + i) * 2;
      ctx.globalAlpha = alpha * (0.85 - k * 0.3);
      ctx.strokeStyle = i % 2 ? (f.sp.element === 'dragon' ? this.dragonSparks(f) : this.windSparks(f))[2] : '#ffffff';
      ctx.beginPath();
      ctx.ellipse(x + wob, yy, rr, rr * 0.35, 0, t * 12 + i, t * 12 + i + Math.PI * 1.6);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawTwister(ctx, tw) {
    const fade = Math.min(1, tw.t * 8, (tw.m.life - tw.t) * 6 + 0.3);
    this.drawFunnel(ctx, tw.x, tw.y, 12, 28, tw.t, tw.owner, fade);
  }

  drawHurricaneGround(ctx, h) {
    if (h.t < h.m.last) this.redRing(ctx, h.x, h.y, h.m.r, 1, true);
  }

  drawHurricane(ctx, h) {
    const fade = Math.min(1, h.t * 6, (h.m.last + 0.3 - h.t) * 4);
    this.drawFunnel(ctx, h.x, h.y, 24, 46, h.t, h.owner, fade);
  }

  // Air Cutter / Air Slash: a pale crescent pointing along its flight.
  drawBlade(ctx, p, y, r) {
    ctx.save();
    ctx.translate(p.x, y);
    ctx.rotate(Math.atan2(p.vy, p.vx));
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = p.owner.skin.tint;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(-r * 0.6, 0, r, -1.1, 1.1); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(-r * 0.6, 0, r, -1, 1); ctx.stroke();
    ctx.restore();
  }

  // ---------- psychic line ----------

  // Teleport flash: rings + sparkles where the blink starts and ends.
  psyBlink(f, x0, y0, x1, y1) {
    for (const [x, y] of [[x0, y0], [x1, y1]]) {
      this.ring(x, y - 10 * f.size, this.psyRgb(f));
      this.sparks(x, y - 10 * f.size, 5, this.psySparks(f));
    }
  }

  // Pressed a move whose cooldown is frozen by Mind Lock: pink puff + "LOCKED" (throttled).
  mindFizzle(f) {
    if (f.lastFizzle && this.time - f.lastFizzle < 0.3) return;
    f.lastFizzle = this.time;
    const cols = PSY_SPARKS;
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2, s = 20 + Math.random() * 30;
      this.particles.push({ x: f.x, y: f.y - 14 * f.size, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 15, g: 0, life: 0.35, max: 0.35, size: 2, col: cols[i % 3] });
    }
    this.texts.push({ x: f.x, y: f.y - 36 * f.size, txt: 'LOCKED', col: '#ff9ae8', t: 0, small: true });
  }

  // Future Sight blast / Psychic slam landing on its red circle.
  psyStrikeFx(st) {
    const big = st.kind === 'future';
    for (let i = 0; i < (big ? 3 : 2); i++) this.sprites.push({ ring: true, x: st.x, y: st.y - 6, t: -i * 0.05, rgb: this.psyRgb(st.owner) });
    this.sparks(st.x, st.y - 8, big ? 18 : 10, this.psySparks(st.owner));
    this.shake = Math.max(this.shake, big ? 5 : 3);
  }

  // ---------- dragon line ----------

  // Dragon Pulse popping: purple burst, hits everyone at that height in the radius.
  dragonBurst(owner, m, x, y, z, h = 8) {
    this.sprites.push({ frames: DRAGON.pop, img: owner.skin.dragon, x, y: y - h, t: 0, fps: 20, scale: 2.2 });
    this.sparks(x, y - h, 14, this.dragonSparks(owner));
    this.ring(x, y - h, this.dragonRgb(owner));
    this.shake = Math.max(this.shake, 3);
    for (const g of this.others(owner)) {
      if (Math.hypot(g.x - x, (g.y - y) * QY) > m.aoe + g.hurtR) continue;
      if (!sameHeight(z, g.zEff)) { this.miss(g); continue; }
      this.hit(owner, g, m, Math.atan2(g.y - y, g.x - x));
    }
  }

  // Kind-specific strike landing: Dragon Rage flare, Draco Meteor impact, Future Sight blast, Psychic lift.
  strikeFx(st) {
    if (st.kind === 'future' || st.kind === 'psychic') { this.psyStrikeFx(st); return; }
    const img = st.owner.skin.dragon;
    if (st.kind === 'rage') {
      this.sprites.push({ frames: DRAGON.rage, img, x: st.x, y: st.y - 12, t: 0, fps: 20, scale: 1.3 });
      this.shake = Math.max(this.shake, 3);
    } else {
      this.sprites.push({ frames: DRAGON.boom, img, x: st.x, y: st.y - 10, t: 0, fps: 22, scale: 0.42 });
      this.debris(st.x, st.y - 2, 6, st.owner);
      this.shake = Math.max(this.shake, 4);
    }
    this.sparks(st.x, st.y - 6, 10, this.dragonSparks(st.owner));
  }

  // A meteor dropping onto its red circle (drawn while the strike is still pending).
  drawMeteor(ctx, st) {
    const k = Math.min(1, st.t / (st.d ?? st.m.delay)), fall = (1 - k) * SKY_H;
    const x = st.x + fall * 0.5, y = st.y - 6 - fall;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = st.owner.skin.tint;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x + 14, y - 28); ctx.lineTo(x, y); ctx.stroke();
    ctx.restore();
    const r = DRAGON.meteor[st.frame ?? 0], s = 0.7;
    ctx.drawImage(st.owner.skin.dragon, r.x, r.y, r.w, r.h, Math.round(x - r.w * s / 2), Math.round(y - r.h * s / 2), Math.round(r.w * s), Math.round(r.h * s));
  }

  // Dragon Claw / Dragon Tail: a purple crescent swipe in front of the user.
  clawSwipe(f, reach, frame = 0) {
    const x = f.x + Math.cos(f.face) * reach * 0.6 * f.size, y = f.y - 10 * f.size + Math.sin(f.face) * reach * 0.4 * f.size;
    this.sprites.push({ frames: [DRAGON.claw[frame % DRAGON.claw.length]], img: f.skin.dragon, x, y, t: 0, fps: 6, scale: 0.55 * f.size });
  }

  // ---------- effects ----------

  burst(x, y, skin, scale = 1, from = 0) {
    this.sprites.push({ frames: FIRE.burst.slice(from), img: skin.fire, x, y, t: 0, fps: 30, scale });
  }

  sparks(x, y, n, cols, blue = false) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 90;
      this.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, g: 120,
        life: 0.25 + Math.random() * 0.2, max: 0.45, size: 1 + (Math.random() < 0.4 ? 1 : 0),
        col: blue ? ['#e8f6ff', '#7fd0ff', '#3a7bff'][i % 3] : cols[i % cols.length],
      });
    }
  }

  dust(x, y) {
    for (let i = 0; i < 6; i++) {
      const a = Math.PI + (i / 5) * Math.PI;
      this.particles.push({ x, y, vx: Math.cos(a) * 35, vy: Math.sin(a) * 8, g: 0, life: 0.3, max: 0.3, size: 2, col: 'rgba(230,220,235,0.8)' });
    }
  }

  // Dust kicked up behind feet while being shoved back.
  skid(x, y) {
    this.particles.push({ x: x + (Math.random() - 0.5) * 6, y: y + Math.random() * 2, vx: (Math.random() - 0.5) * 20, vy: -8 - Math.random() * 10, g: 0, life: 0.25, max: 0.25, size: 2, col: 'rgba(230,220,235,0.7)' });
  }

  ring(x, y, rgb = '255,255,255') { this.sprites.push({ ring: true, x, y, t: 0, rgb }); }

  // Air streaks fanning out of a wing swipe.
  gust(f, m) {
    for (let i = 0; i < 12; i++) {
      const a = f.face + (Math.random() - 0.5) * m.arc, s = 140 + Math.random() * 120;
      this.particles.push({
        x: f.x + Math.cos(a) * 8, y: f.y - 8 * f.size + Math.sin(a) * 5, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6, g: 0,
        life: 0.18 + Math.random() * 0.1, max: 0.28, size: Math.random() < 0.5 ? 2 : 1, col: i % 3 ? '#ffffff' : '#cfe0ff',
      });
    }
  }

  // Loose rising embers (fire trails).
  embers(x, y, n, owner) {
    const cols = this.isBlue(owner) ? ['#7fd0ff', '#e8f6ff'] : ['#ffb347', '#fff6b0'];
    for (let i = 0; i < n; i++) {
      this.particles.push({ x: x + (Math.random() - 0.5) * 8, y: y + (Math.random() - 0.5) * 6, vx: (Math.random() - 0.5) * 20, vy: -20 - Math.random() * 20, g: 0, life: 0.35, max: 0.35, size: 1, col: cols[i % 2] });
    }
  }

  // Knocked into the moat: spray, ripple ring, damage number.
  splash(f, x, y, dmg) {
    for (let i = 0; i < 14; i++) {
      const a = -Math.PI * (0.15 + 0.7 * Math.random()), s = 40 + Math.random() * 70;
      this.particles.push({ x: x + (Math.random() - 0.5) * 8, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 220, life: 0.5, max: 0.5, size: Math.random() < 0.5 ? 2 : 1, col: i % 3 ? '#cfefff' : '#ffffff' });
    }
    this.sprites.push({ ring: true, x, y, t: 0, rgb: '190,235,255' });
    this.sprites.push({ ripple: true, x, y, t: 0 });
    this.shake = Math.max(this.shake, 3);
    this.texts.push({ x: f.x, y: f.y - 26 * f.size, txt: 'SPLASH -' + dmg, col: '#9fe0ff', t: 0, small: true });
    if (f.ko) this.texts.push({ x: f.x, y: f.y - 40, txt: 'K.O.!', col: '#ffd34d', t: -0.1, big: true });
  }

  // Lob flight: straight over the ground, height follows an arc; lands when time is up.
  tickLob(p) {
    const k = Math.min(1, p.t / p.m.flight);
    p.x = p.x0 + (p.tx - p.x0) * k;
    p.y = p.y0 + (p.ty - p.y0) * k;
    p.arc = p.m.arc * 4 * k * (1 - k);
    if (p.m.proj === 'glob' && Math.random() < 0.3) {
      this.particles.push({ x: p.x, y: p.y - p.h * (1 - k) - p.arc, vx: 0, vy: 0, g: 160, life: 0.2, max: 0.2, size: 1, col: this.waterSparks(p.owner)[1] });
    }
    if (k >= 1) { p.dead = true; if (p.m.proj === 'glob') this.landSplash(p); else if (p.m.proj === 'boulder') this.landRock(p); else this.landLob(p); }
  }

  // Homing shot (Leech Seed): bends toward the nearest foe ahead, at most `home` rad/s.
  steer(p, dt) {
    const sp = Math.hypot(p.vx, p.vy), ang = Math.atan2(p.vy, p.vx);
    let best = null, bestD = 160;
    for (const g of this.others(p.owner)) {
      const d = Math.hypot(g.x - p.x, g.y - p.y);
      if (d < bestD && angleDiff(Math.atan2(g.y - p.y, g.x - p.x), ang) < 1.6) { best = g; bestD = d; }
    }
    if (!best) return;
    let d = Math.atan2(best.y - p.y, best.x - p.x) - ang;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const step = p.m.home * dt, na = ang + Math.max(-step, Math.min(step, d));
    p.vx = Math.cos(na) * sp;
    p.vy = Math.sin(na) * sp;
  }

  // Little trail behind a flying shot, in the shot's own colours.
  trailFx(p) {
    const kind = p.m.proj, blue = this.isBlue(p.owner);
    const big = kind === 'blast';
    const chance = { blast: 1, ember: 0.6, leaf: 0.25, seed: 0.4, jet: 0.9, bubble: 0.1, pulse: 0.5 }[kind] ?? 0.3;
    if (Math.random() > chance) return;
    if (kind === 'jet' || kind === 'bubble' || kind === 'pulse') {
      const cols = this.waterSparks(p.owner);
      this.particles.push({ x: p.x + (Math.random() - 0.5) * 4, y: p.y - p.h + (Math.random() - 0.5) * 3, vx: -p.vx * 0.15, vy: -5, g: 160, life: 0.25, max: 0.25, size: 1, col: cols[Math.floor(Math.random() * 3)] });
      return;
    }
    if (kind === 'blade' || kind === 'bigblade') {
      if (Math.random() < 0.5) this.particles.push({ x: p.x, y: p.y - p.h, vx: -p.vx * 0.15, vy: 0, g: 0, life: 0.15, max: 0.15, size: 1, col: this.windSparks(p.owner)[1] });
      return;
    }
    if (kind === 'confuse' || kind === 'hypno' || kind === 'ball' || kind === 'hand') {
      if (Math.random() < 0.5) this.particles.push({ x: p.x + (Math.random() - 0.5) * 6, y: p.y - p.h + (Math.random() - 0.5) * 6, vx: -p.vx * 0.1, vy: -12, g: 0, life: 0.3, max: 0.3, size: kind === 'ball' ? 2 : 1, col: this.ghostSparks(p.owner)[1 + (Math.random() < 0.5 ? 1 : 0)] });
      return;
    }
    if (kind === 'zap' || kind === 'bolt' || kind === 'twave') {
      this.particles.push({ x: p.x + (Math.random() - 0.5) * 6, y: p.y - p.h + (Math.random() - 0.5) * 6, vx: (Math.random() - 0.5) * 40, vy: (Math.random() - 0.5) * 40, g: 0, life: 0.12, max: 0.12, size: 1, col: this.elecSparks(p.owner)[Math.floor(Math.random() * 3)] });
      return;
    }
    if (kind === 'psy' || kind === 'psycut') {
      this.particles.push({ x: p.x + (Math.random() - 0.5) * 6, y: p.y - p.h + (Math.random() - 0.5) * 4, vx: -p.vx * 0.1, vy: -6, g: 0, life: 0.22, max: 0.22, size: 1, col: this.psySparks(p.owner)[1 + (Math.random() < 0.5 ? 1 : 0)] });
      return;
    }
    if (kind === 'dpulse' || kind === 'dtwist') {
      this.particles.push({ x: p.x + (Math.random() - 0.5) * 8, y: p.y - p.h + (Math.random() - 0.5) * 6, vx: -p.vx * 0.1, vy: -10, g: 0, life: 0.25, max: 0.25, size: kind === 'dpulse' ? 2 : 1, col: this.dragonSparks(p.owner)[1 + (Math.random() < 0.5 ? 1 : 0)] });
      return;
    }
    if (kind === 'rockshot') {
      this.particles.push({ x: p.x, y: p.y - p.h, vx: -p.vx * 0.1, vy: 5, g: 120, life: 0.2, max: 0.2, size: 1, col: this.rockSparks(p.owner)[1] });
      return;
    }
    const col = kind === 'leaf' || kind === 'seed' ? (blue ? '#ff9de8' : '#a8f070') : blue ? '#7fd0ff' : '#ffb347';
    this.particles.push({ x: p.x + (Math.random() - 0.5) * (big ? 8 : 3), y: p.y - p.h + (Math.random() - 0.5) * (big ? 8 : 3), vx: -p.vx * 0.1, vy: -15, g: 0, life: 0.25, max: 0.25, size: big ? 2 : 1, col });
  }

  // Shot ends: fire bursts, grass shots scatter green bits.
  impactFx(p, scale, from = 1) {
    if (p.m.proj === 'ember' || p.m.proj === 'blast') { this.burst(p.x, p.y - p.h, p.owner.skin, scale, from); return; }
    const blue = this.isBlue(p.owner);
    if (p.owner.sp.element === 'rock' || p.owner.sp.element === 'ground') {
      this.debris(p.x, p.y - p.h, 6, p.owner);
      this.ring(p.x, p.y - p.h, blue ? '240,150,110' : '230,210,170');
      return;
    }
    if (p.owner.sp.element === 'flying') {
      this.sparks(p.x, p.y - p.h, 7, this.windSparks(p.owner));
      this.ring(p.x, p.y - p.h, blue ? '255,200,230' : '230,245,255');
      return;
    }
    if (p.owner.sp.element === 'psychic') {
      this.sparks(p.x, p.y - p.h, 7, this.psySparks(p.owner));
      this.ring(p.x, p.y - p.h, this.psyRgb(p.owner));
      return;
    }
    if (p.owner.sp.element === 'dragon') {
      this.sprites.push({ frames: DRAGON.pop, img: p.owner.skin.dragon, x: p.x, y: p.y - p.h, t: 0, fps: 24, scale: 1 });
      this.sparks(p.x, p.y - p.h, 6, this.dragonSparks(p.owner));
      return;
    }
    if (p.owner.sp.element === 'ghost') {
      this.wisps(p.x, p.y - p.h, 8, p.owner);
      this.ring(p.x, p.y - p.h, blue ? '150,255,180' : '200,150,255');
      return;
    }
    if (p.owner.sp.element === 'electric') {
      this.sparks(p.x, p.y - p.h, 8, this.elecSparks(p.owner));
      this.ring(p.x, p.y - p.h, blue ? '200,170,255' : '255,240,120');
      return;
    }
    if (p.owner.sp.element === 'water') {
      this.sparks(p.x, p.y - p.h, 7, this.waterSparks(p.owner));
      this.ring(p.x, p.y - p.h, blue ? '255,220,140' : '160,225,255');
      return;
    }
    this.sparks(p.x, p.y - p.h, 6, blue ? ['#ff9de8', '#ffd6f4'] : ['#a8f070', '#58c23a', '#fff6b0']);
  }

  // Soaked: water dripping off the body.
  drip(f) {
    this.particles.push({ x: f.x + (Math.random() - 0.5) * 10 * f.size, y: f.y - 6 - Math.random() * 12 * f.size, vx: 0, vy: 10, g: 160, life: 0.3, max: 0.3, size: 1, col: '#7fd4ff' });
  }

  // Poisoned: purple bubbles rising off the body.
  bubbles(f) {
    const b = POISON.bubbles;
    this.sprites.push({ frames: [b[Math.floor(Math.random() * 3)]], img: f.skin.poison, x: f.x + (Math.random() - 0.5) * 10 * f.size, y: f.y - 10 * f.size - Math.random() * 8, t: 0, fps: 4, scale: 0.4, rise: 14 });
  }

  // Leech Seed drain: green motes flowing from the seeded target to the seeder.
  drainFx(from, to) {
    for (let i = 0; i < 5; i++) {
      const s = 0.35 + Math.random() * 0.15;
      this.particles.push({ x: from.x, y: from.y - 10, vx: (to.x - from.x) / s, vy: (to.y - from.y) / s - 10, g: 0, life: s, max: s, size: 2, col: i % 2 ? '#8dff6a' : '#d8ffb0' });
    }
  }

  // Grey puff (Blast Burn exhaustion).
  smoke(x, y) {
    this.particles.push({ x: x + (Math.random() - 0.5) * 10, y, vx: (Math.random() - 0.5) * 8, vy: -14, g: 0, life: 0.6, max: 0.6, size: 3, col: 'rgba(120,110,130,0.6)' });
  }

  // ---------- update ----------

  update(dt) {
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt * 20);

    for (const p of this.projectiles) {
      p.t += dt;
      if (p.lob) { this.tickLob(p); continue; }
      if (p.m.home) this.steer(p, dt);
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.m.wobble) p.y += Math.sin(p.t * 9 + p.seed) * p.m.wobble * dt; // bubbles drift
      if (p.m.drag) {
        // slow to a stop, then hang there drifting lazily
        const k = Math.exp(-p.m.drag * dt);
        p.vx *= k; p.vy *= k;
        p.x += Math.sin(p.t * 1.3 + p.seed) * 6 * dt;
      }
      this.trailFx(p);
      if (p.owner.sp.element === 'electric' && (!p.shockAt || Math.hypot(p.x - p.shockAt.x, p.y - p.shockAt.y) > 14)) {
        if (this.electrify(p.owner, p.x, p.y)) p.shockAt = { x: p.x, y: p.y };
      }
      let boom = this.arena.blocksAt(p.x, p.y, p.z) || p.life <= 0;
      for (const g of this.others(p.owner)) {
        if (boom) break;
        if (Math.hypot(g.x - p.x, g.y - p.y) > p.m.hitR + (p.m.grow ?? 0) * p.t + g.hurtR * 0.5) continue;
        if (!sameHeight(p.z, g.zEff)) {
          if (!p.missed.has(g)) { p.missed.add(g); this.miss(g); }
          continue;
        }
        if (p.m.aoe) { boom = true; break; }
        if (this.gated(g, p.m.name, p.m.gap)) continue;
        if (p.m.pierce) {
          p.hitSet ??= new Set();
          if (p.hitSet.has(g)) continue;
          p.hitSet.add(g);
          this.hit(p.owner, g, p.m, Math.atan2(p.vy, p.vx));
          this.impactFx(p, 0.8);
          continue;
        }
        // floating bubbles push away from where they sat
        const ang = Math.hypot(p.vx, p.vy) > 20 ? Math.atan2(p.vy, p.vx) : Math.atan2(g.y - p.y, g.x - p.x);
        this.hit(p.owner, g, p.m, ang);
        this.impactFx(p, 0.8);
        p.dead = true;
        break;
      }
      if (p.dead || !boom) continue;
      p.dead = true;
      if (p.m.aoe) this.explode(p);
      else this.impactFx(p, p.life <= 0 ? 0.4 : 0.6, p.life <= 0 ? 2 : 1);
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead);

    // Ground zones (Fire Spin vortex + burning ground, Sludge Bomb puddle, wet floor): tick for anyone standing in them at their height
    const born = [];
    for (const zn of this.zones) {
      const Z = zn.Z;
      zn.t += dt;
      const standing = (g) => !g.flying && Math.hypot(g.x - zn.x, (g.y - zn.y) * 1.4) < Z.r + g.hurtR && sameHeight(zn.z, g.zEff);
      if (Z.kind === 'wet') {
        // water types run faster on it (owner too), everyone else bogs down
        for (const g of this.fighters) {
          if (!g.hittable || !standing(g)) continue;
          if (g.sp.element === 'water') g.wetBoostT = 0.1;
          else if (g !== zn.owner) { g.slowMul = g.slowT > 0 ? Math.min(g.slowMul, Z.slow) : Z.slow; g.slowT = 0.1; }
        }
        if (Math.random() < 0.015) this.sprites.push({ ripple: true, x: zn.x + (Math.random() - 0.5) * Z.r, y: zn.y + (Math.random() - 0.5) * Z.r * 0.4, t: 0 });
        if (zn.t >= Z.life) zn.done = true;
        continue;
      }
      const inside = this.others(zn.owner).filter(standing);
      if (Z.slow) for (const g of inside) { g.slowT = 0.1; g.slowMul = Z.slow; }
      if (zn.t >= zn.next) {
        zn.next += Z.tick;
        for (const g of inside) {
          if (Z.dmg) this.hit(zn.owner, g, { dmg: Z.dmg, chip: true }, 0);
          if (Z.poison) g.addPoison(Z.poison);
        }
      }
      if (Z.kind === 'fire' && Math.random() < 0.5) this.embers(zn.x, zn.y - 4, 1, zn.owner);
      if (Z.kind === 'burn' && Math.random() < 0.3) this.embers(zn.x + (Math.random() - 0.5) * Z.r * 1.4, zn.y + (Math.random() - 0.5) * Z.r * 0.5, 1, zn.owner);
      if (zn.t >= Z.life) {
        zn.done = true;
        // the vortex dies down into burning ground
        if (Z.after) born.push({ owner: zn.owner, Z: Z.after, x: zn.x, y: zn.y, z: zn.z, t: 0, next: Z.after.tick });
      }
    }
    this.zones = this.zones.filter((zn) => !zn.done).concat(born);

    // Poison Powder clouds: dust each foe in the cone once while the powder hangs
    for (const c of this.clouds) {
      c.t += dt;
      for (const g of this.others(c.owner)) {
        if (c.hit.has(g) || !this.inCone(c.x, c.y, c.face, c.m.reach * c.owner.size, c.m.arc, g)) continue;
        c.hit.add(g);
        if (!sameHeight(c.z, g.zEff)) { this.miss(g); continue; }
        this.hit(c.owner, g, c.m, c.face);
      }
    }
    this.clouds = this.clouds.filter((c) => c.t < c.m.linger);

    // Blast Burn: ring expands and catches each target once as it passes
    for (const w of this.waves) {
      w.t += dt;
      const r = w.m.radius * w.owner.size * Math.min(1, w.t / w.m.wave);
      for (const g of this.others(w.owner)) {
        if (w.hit.has(g) || Math.hypot(g.x - w.x, (g.y - w.y) * 1.4) > r + g.hurtR) continue;
        w.hit.add(g);
        if (!sameHeight(w.z, g.zEff)) { this.miss(g); continue; }
        this.hit(w.owner, g, w.m, Math.atan2(g.y - w.y, g.x - w.x));
        this.sparks(g.x, g.y - 10, 10, FIRE_SPARKS, this.isBlue(w.owner));
      }
    }
    this.waves = this.waves.filter((w) => w.t < w.m.wave + 0.35);

    // Surf: the wall moves forward; anyone in its band is hit once and carried along
    for (const sf of this.surfs) {
      const m = sf.m, half = (m.width * sf.owner.size) / 2;
      sf.t += dt;
      const rolling = sf.t < m.travel;
      if (rolling) { sf.x += sf.dx * m.speed * dt; sf.y += sf.dy * m.speed * dt; }
      for (const g of this.others(sf.owner)) {
        if (!rolling || sf.hit.has(g)) continue;
        const rx = g.x - sf.x, ry = g.y - sf.y;
        const along = rx * sf.dx + ry * sf.dy, side = -rx * sf.dy + ry * sf.dx;
        if (Math.abs(side) > half + g.hurtR || along < -12 || along > 6 + g.hurtR) continue;
        sf.hit.add(g);
        if (!sameHeight(sf.z, g.zEff)) { this.miss(g); continue; }
        this.hit(sf.owner, g, m, Math.atan2(sf.dy, sf.dx));
        this.sparks(g.x, g.y - 10, 10, this.waterSparks(sf.owner));
        if (!g.armored) (sf.carry ??= new Set()).add(g);
      }
      // riders are kept moving at least as fast as the wave, then flung off when it breaks
      if (sf.carry) for (const g of sf.carry) {
        if (!rolling && sf.broke) continue;
        const want = rolling ? m.speed * 1.1 : m.knock;
        const v = g.kvx * sf.dx + g.kvy * sf.dy;
        if (v < want) { g.kvx += sf.dx * (want - v); g.kvy += sf.dy * (want - v); }
      }
      if (!rolling) sf.broke = true;
      // spray off the crest
      if (rolling) for (let i = 0; i < 3; i++) {
        const o = (Math.random() - 0.5) * 2 * half;
        this.particles.push({ x: sf.x - sf.dy * o, y: sf.y + sf.dx * o - 10, vx: sf.dx * m.speed * 0.6, vy: -30 - Math.random() * 30, g: 220, life: 0.35, max: 0.35, size: Math.random() < 0.5 ? 2 : 1, col: this.waterSparks(sf.owner)[i] });
      }
    }
    this.surfs = this.surfs.filter((sf) => sf.t < sf.m.travel + 0.3);

    this.updateRock(dt);
    this.updateBones(dt);
    this.updateSpikes(dt);
    this.updateStrikes(dt);
    this.updateShocks(dt);
    this.updateNightmares(dt);
    this.updateTwisters(dt);
    this.updateHurricanes(dt);

    for (const s of this.sprites) s.t += dt;
    this.sprites = this.sprites.filter((s) => (s.ring ? s.t < 0.16 : s.ripple ? s.t < 0.7 : s.chomp ? s.t < 0.2 : s.t * s.fps < s.frames.length));

    for (const p of this.particles) {
      p.life -= dt;
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    for (const t of this.texts) t.t += dt;
    this.texts = this.texts.filter((t) => t.t < (t.big ? 1.4 : 0.75));

    this.separate();
  }

  // Keep same-height fighters from overlapping.
  separate() {
    const [a, b] = this.fighters;
    if (!a || !b || !sameHeight(a.zEff, b.zEff) || a.jump?.hop || b.jump?.hop) return;
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
    const min = a.hurtR + b.hurtR;
    if (d >= min || d === 0) return;
    const push = (min - d) / 2, nx = dx / d, ny = dy / d;
    a.moveBy(-nx * push, -ny * push);
    b.moveBy(nx * push, ny * push);
  }

  // ---------- drawing ----------

  draw(ctx) {
    ctx.save();
    if (this.shake > 0) ctx.translate(Math.round((Math.random() - 0.5) * this.shake), Math.round((Math.random() - 0.5) * this.shake));
    ctx.drawImage(this.mapCanvas, 0, 0);
    this.drawWater(ctx);

    // shadows + team markers on the ground
    for (const f of this.fighters) {
      if (f.sunkT > 0 || f.swimming) continue;
      const k = (1 - Math.min(0.6, f.jz)) * f.size;
      ctx.fillStyle = `rgba(20,0,40,${0.35 * k / f.size})`;
      ellipse(ctx, f.x, f.y, 7 * k, 3 * k);
      ctx.strokeStyle = f.markerColor;
      ctx.globalAlpha = f.ko ? 0.2 : 0.65;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(f.x, f.y, 9 * f.size, 4 * f.size, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    for (const p of this.projectiles) {
      const g = this.arena.groundAt(p.x, p.y, p.z);
      const big = p.m.proj === 'blast' || (p.lob && p.m.proj !== 'glob');
      ctx.fillStyle = 'rgba(20,0,40,0.3)';
      ellipse(ctx, p.x, p.y + Math.max(0, p.z - g) * TILE, big ? 7 : 4, big ? 3 : 2);
    }
    for (const b of this.bones) {
      if (b.state === 'ground') continue;
      ctx.fillStyle = 'rgba(20,0,40,0.3)';
      ellipse(ctx, b.x, b.y, 4 * b.m.scale, 2);
    }
    for (const zn of this.zones) this.drawZoneGround(ctx, zn);
    // move telegraphs painted on the ground (Solar Beam's red lane)
    for (const f of this.fighters) if (f.action) MOVES[f.action.move].drawGround?.(ctx, f, f.action, this);
    for (const q of this.quakes) this.drawQuake(ctx, q);
    for (const st of this.strikes) if (!st.fired) this.drawStrike(ctx, st);
    this.drawShockTiles(ctx);
    for (const s of this.shocks) this.drawShock(ctx, s);
    for (const nm of this.nightmares) this.drawNightmareGround(ctx, nm);
    for (const h of this.hurricanes) this.drawHurricaneGround(ctx, h);
    // red landing spots under falling boulders and thrown rocks
    for (const d of this.drops) if (!d.hidden) this.redRing(ctx, d.x, d.y, d.aoe ?? 8, 1, true);
    for (const p of this.projectiles) if (p.lob && p.m.proj === 'boulder') this.redRing(ctx, p.tx, p.ty, p.m.aoe, 1, true);
    for (const d of this.drops) {
      if (d.hidden || d.t < 0) continue;
      const k = Math.min(1, d.t / d.m.fall);
      ctx.fillStyle = `rgba(20,0,40,${0.15 + 0.25 * k})`;
      ellipse(ctx, d.x, d.y, 3 + 6 * k, 1.5 + 2.5 * k);
    }
    for (const w of this.waves) this.drawWave(ctx, w, false);
    for (const sf of this.surfs) this.drawSurf(ctx, sf);

    // y-sorted bodies
    const drawables = [
      ...this.fighters.map((f) => ({ y: f.y, draw: () => f.draw(ctx) })),
      ...this.projectiles.map((p) => ({ y: p.y, draw: () => this.drawProjectile(ctx, p) })),
      ...this.zones.map((zn) => ({ y: zn.y + 4, draw: () => this.drawZone(ctx, zn) })),
      ...this.drops.map((d) => ({ y: d.y, draw: () => this.drawDrop(ctx, d) })),
      ...this.bones.map((b) => ({ y: b.y, draw: () => this.drawBone(ctx, b) })),
      ...this.hands.map((h) => ({ y: h.y, draw: () => this.drawHand(ctx, h) })),
      ...this.twisters.map((tw) => ({ y: tw.y + 2, draw: () => this.drawTwister(ctx, tw) })),
      ...this.hurricanes.map((h) => ({ y: h.y + 2, draw: () => this.drawHurricane(ctx, h) })),
      ...this.spikes.flatMap((sp) => sp.pts.map((pt) => ({ y: pt.y, draw: () => this.drawSpike(ctx, sp, pt) }))),
    ].sort((a, b) => a.y - b.y);
    for (const d of drawables) d.draw();

    for (const f of this.fighters) if (f.action?.streaming) this.drawFlame(ctx, f);
    for (const w of this.waves) this.drawWave(ctx, w, true);
    for (const c of this.clouds) this.drawCloud(ctx, c);
    for (const st of this.strikes) if (st.fired) this.drawStrike(ctx, st);
    for (const st of this.strikes) if (!st.fired && st.kind === 'meteor') this.drawMeteor(ctx, st);

    for (const s of this.sprites) {
      if (s.t < 0) continue;
      if (s.ripple) {
        // two rings spreading on the water surface
        ctx.strokeStyle = `rgba(220,245,255,${0.8 * (1 - s.t / 0.7)})`;
        ctx.lineWidth = 1;
        for (const k of [1, 0.55]) {
          const r = 3 + s.t * 30 * k;
          ctx.beginPath(); ctx.ellipse(s.x, s.y, r, r * 0.45, 0, 0, Math.PI * 2); ctx.stroke();
        }
        continue;
      }
      if (s.chomp) {
        // upper and lower fang rows closing, then fading
        const p = Math.min(1, s.t / 0.08), gap = 7 * (1 - p);
        ctx.globalAlpha = 1 - Math.max(0, (s.t - 0.1) / 0.1);
        ctx.fillStyle = '#ffffff';
        for (const [dir, yy] of [[1, s.y - 2 - gap], [-1, s.y + 2 + gap]]) {
          for (const ox of [-5, -1, 3]) {
            ctx.beginPath();
            ctx.moveTo(s.x + ox, yy); ctx.lineTo(s.x + ox + 3, yy); ctx.lineTo(s.x + ox + 1.5, yy + dir * 4);
            ctx.fill();
          }
        }
        ctx.globalAlpha = 1;
        continue;
      }
      if (s.ring) {
        const p = s.t / 0.16;
        ctx.strokeStyle = `rgba(${s.rgb},${1 - p})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 4 + p * 14, 0, Math.PI * 2);
        ctx.stroke();
        continue;
      }
      const r = s.frames[Math.min(s.frames.length - 1, Math.floor(s.t * s.fps))];
      const w = r.w * s.scale, h = r.h * s.scale;
      const y = s.y - (s.rise ? s.t * s.rise : 0);
      ctx.drawImage(s.img, r.x, r.y, r.w, r.h, Math.round(s.x - w / 2), Math.round(y - h / 2), Math.round(w), Math.round(h));
    }
    for (const p of this.particles) {
      ctx.globalAlpha = Math.min(1, p.life / p.max * 1.5);
      ctx.fillStyle = p.col;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    ctx.globalAlpha = 1;
    this.drawTexts(ctx);
    ctx.restore();
  }

  drawWater(ctx) {
    const a = 0.06 + 0.05 * Math.sin(this.time * 2.2);
    ctx.fillStyle = `rgba(200,230,255,${a})`;
    this.arena.forEach((cell, c, r) => {
      if (cell.kind !== 'water') return;
      const off = Math.sin(this.time * 3 + c * 0.9 + r * 1.3) * 3;
      ctx.fillRect(c * TILE + 4 + off, r * TILE + 6, 8, 1);
      ctx.fillRect(c * TILE + 12 - off, r * TILE + 16, 6, 1);
    });
  }

  drawProjectile(ctx, p) {
    const kind = p.m.proj, skin = p.owner.skin;
    const y = p.y - p.h - (p.arc ?? 0);
    if (p.lob && kind === 'glob') {
      // Hydro Pump: droplet falling along its arc, sinking to the ground as it lands
      const k = Math.min(1, p.t / p.m.flight);
      const gy = p.y - p.h * (1 - k) - (p.arc ?? 0);
      const vx = (p.tx - p.x0) / p.m.flight, vy = (p.ty - p.y0) / p.m.flight + (p.h - p.m.arc * 4 * (1 - 2 * k)) / p.m.flight;
      drawSpun(ctx, skin.drop, p.x, gy, Math.atan2(vy, vx) - Math.PI / 2, 1.4);
      return;
    }
    if (p.lob && kind === 'boulder') {
      this.drawBoulder(ctx, p.owner, 0, p.x, y, 1.4, p.t * 9);
      return;
    }
    if (p.lob) {
      // Sludge Bomb: purple gunk ball wobbling through its arc
      const r = POISON.gunk[Math.floor(p.t * 12) % POISON.gunk.length];
      const s = 0.55;
      ctx.drawImage(skin.poison, r.x, r.y, r.w, r.h, Math.round(p.x - r.w * s / 2), Math.round(y - r.h * s / 2), Math.round(r.w * s), Math.round(r.h * s));
      return;
    }
    if (kind === 'rockshot') { this.drawBoulder(ctx, p.owner, Math.floor(p.seed), p.x, y, 1.1, p.t * 14, ROCK.round); return; }
    if (kind === 'ball') { this.drawShadowOrb(ctx, p, y, 7); return; }
    if (kind === 'blade' || kind === 'bigblade') { this.drawBlade(ctx, p, y, kind === 'bigblade' ? 11 : 7); return; }
    if (kind === 'confuse') {
      // Confuse Ray: a flickering will-o'-wisp cycling colours
      const cols = ['#ffd0f0', '#fff6b0', '#b0e8ff', '#d8b0ff'];
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = cols[Math.floor(p.t * 12) % 4];
      ctx.beginPath(); ctx.arc(p.x, y, 6 + Math.sin(p.t * 25), 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(p.x, y, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      return;
    }
    if (kind === 'hypno') {
      // Hypnosis: wavy rings widening as they fly
      const r = p.m.hitR + p.m.grow * p.t;
      ctx.save();
      ctx.lineWidth = 1.5;
      for (const k of [1, 0.65, 0.3]) {
        ctx.strokeStyle = k === 1 ? p.owner.skin.tint : k === 0.65 ? '#f0e0ff' : '#ffffff';
        ctx.globalAlpha = 0.9 - k * 0.3;
        ctx.beginPath();
        for (let i = 0; i <= 24; i++) {
          const a = (i / 24) * Math.PI * 2, rr = Math.max(1, r * k + Math.sin(a * 6 + p.t * 20) * 1.2);
          const x = p.x + Math.cos(a) * rr, yy = y + Math.sin(a) * rr * 0.75;
          i ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy);
        }
        ctx.stroke();
      }
      ctx.restore();
      return;
    }
    if (kind === 'hand') { drawSpun(ctx, skin.hand, p.x, y, Math.atan2(p.vy, p.vx) + Math.PI / 2, 2); return; }
    if (kind === 'zap' || kind === 'bolt') {
      // jagged streak trailing the head of the shot
      const v = Math.hypot(p.vx, p.vy), tail = Math.min(kind === 'bolt' ? 26 : 14, v * p.t);
      this.lightning(ctx, p.x - (p.vx / v) * tail, y - (p.vy / v) * tail, p.x, y, p.owner, kind === 'bolt' ? 2 : 1, kind === 'bolt' ? 4 : 3);
      return;
    }
    if (kind === 'twave') {
      // a little ring of lightning, spinning as it flies
      const r = 6 + Math.sin(p.t * 30), n = 5;
      for (let i = 0; i < n; i++) {
        const a0 = p.t * 10 + (i / n) * Math.PI * 2, a1 = a0 + (Math.PI * 2) / n;
        this.lightning(ctx, p.x + Math.cos(a0) * r, y + Math.sin(a0) * r * 0.6, p.x + Math.cos(a1) * r, y + Math.sin(a1) * r * 0.6, p.owner, 1, 2);
      }
      return;
    }
    if (kind === 'psy') {
      // glowing psychic orb with a wobbling ring
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = skin.tint;
      ctx.beginPath(); ctx.arc(p.x, y, 5 + Math.sin(p.t * 30), 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(p.x, y, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = skin.tint;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(p.x, y, 7, 3, p.t * 12, 0, Math.PI * 2); ctx.stroke();
      return;
    }
    if (kind === 'psycut') { this.drawBlade(ctx, p, y, 10); return; }
    if (kind === 'dpulse') {
      const r = DRAGON.pulse[Math.floor(p.t * 20) % DRAGON.pulse.length];
      ctx.drawImage(skin.dragon, r.x, r.y, r.w, r.h, Math.round(p.x - r.ax), Math.round(y - r.ay), r.w, r.h);
      return;
    }
    if (kind === 'dtwist') { this.drawFunnel(ctx, p.x, p.y, 7, 18, p.t, p.owner); return; }
    if (kind === 'leaf') { drawSpun(ctx, skin.leaf, p.x, y, p.t * 30, 1.3); return; }
    if (kind === 'seed') { drawSpun(ctx, skin.seed, p.x, y, p.t * 14, 1.4); return; }
    if (kind === 'bubble') { drawSpun(ctx, skin.bubble, p.x, y, 0, 1.3 + 0.15 * Math.sin(p.t * 12 + p.seed)); return; }
    if (kind === 'jet') {
      // droplet pointing along its flight, with a short spray tail
      drawSpun(ctx, skin.drop, p.x, y, Math.atan2(p.vy, p.vx) - Math.PI / 2, 1.2);
      ctx.fillStyle = this.waterSparks(p.owner)[1];
      ctx.globalAlpha = 0.6;
      ctx.fillRect(Math.round(p.x - p.vx * 0.02), Math.round(y - p.vy * 0.02), 2, 2);
      ctx.globalAlpha = 1;
      return;
    }
    if (kind === 'pulse') {
      // Water Pulse: rings widening as the pulse flies
      const r = p.m.hitR + p.m.grow * p.t;
      const rgb = this.isBlue(p.owner) ? '255,210,120' : '120,210,255';
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = `rgb(${rgb})`;
      ellipse(ctx, p.x, y, r * 0.8, r * 0.8);
      ctx.restore();
      ctx.lineWidth = 1.5;
      for (const k of [1, 0.6]) {
        ctx.strokeStyle = k === 1 ? `rgba(${rgb},0.95)` : 'rgba(255,255,255,0.9)';
        ctx.beginPath(); ctx.arc(p.x, y, Math.max(1, r * k * (0.9 + 0.1 * Math.sin(p.t * 30))), 0, Math.PI * 2); ctx.stroke();
      }
      return;
    }
    const frames = FIRE.ember.slice(2);
    const r = frames[Math.floor(p.t * 18) % frames.length];
    if (kind !== 'blast') {
      ctx.drawImage(skin.fire, r.x, r.y, r.w, r.h, Math.round(p.x - r.ax), Math.round(y - r.ay), r.w, r.h);
      return;
    }
    // Fire Blast: big glowing core with a doubled flame
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = skin.tint;
    ctx.beginPath(); ctx.arc(p.x, y, 10 + Math.sin(p.t * 30), 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    const w = Math.round(r.w * 1.6), h = Math.round(r.h * 1.6);
    ctx.drawImage(skin.fire, r.x, r.y, r.w, r.h, Math.round(p.x - w / 2), Math.round(y - h / 2), w, h);
  }

  // Zone on the ground: scorched glow (Fire Spin), charred burning patch, purple sludge pool or wet floor.
  drawZoneGround(ctx, zn) {
    const Z = zn.Z;
    const fade = Math.min(1, zn.t * 6, (Z.life - zn.t) * 3);
    ctx.save();
    if (Z.kind === 'wet') {
      const blue = this.isBlue(zn.owner);
      ctx.globalAlpha = 0.5 * fade;
      ctx.fillStyle = blue ? '#e0a030' : '#3a9af0';
      ellipse(ctx, zn.x, zn.y, Z.r, Z.r * 0.5);
      // glints sliding across the surface
      ctx.globalAlpha = 0.55 * fade;
      ctx.fillStyle = blue ? '#fff0c0' : '#cfefff';
      const o = Math.sin(this.time * 2 + zn.x) * Z.r * 0.3;
      ctx.fillRect(Math.round(zn.x - Z.r * 0.4 + o), Math.round(zn.y - Z.r * 0.15), 5, 1);
      ctx.fillRect(Math.round(zn.x + Z.r * 0.1 - o), Math.round(zn.y + Z.r * 0.12), 3, 1);
    } else if (Z.kind === 'burn') {
      ctx.globalAlpha = 0.45 * fade;
      ctx.fillStyle = '#2a1418';
      ellipse(ctx, zn.x, zn.y, Z.r, Z.r * 0.5);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.22 * fade * (0.7 + 0.3 * Math.sin(this.time * 9 + zn.x));
      ctx.fillStyle = zn.owner.skin.tint;
      ellipse(ctx, zn.x, zn.y, Z.r * 0.8, Z.r * 0.4);
    } else if (Z.kind === 'sludge') {
      ctx.globalAlpha = 0.55 * fade;
      ctx.fillStyle = this.isBlue(zn.owner) ? '#5b3a8a' : '#7a3a9a';
      ellipse(ctx, zn.x, zn.y, Z.r, Z.r * 0.5);
      ctx.globalAlpha = 0.5 * fade;
      ctx.fillStyle = '#c47ae0';
      ellipse(ctx, zn.x - Z.r * 0.25, zn.y - Z.r * 0.1, Z.r * 0.45, Z.r * 0.18);
    } else {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.3 * fade * (0.85 + 0.15 * Math.sin(this.time * 12));
      ctx.fillStyle = zn.owner.skin.tint;
      ellipse(ctx, zn.x, zn.y, Z.r, Z.r * 0.5);
    }
    ctx.restore();
  }

  drawZone(ctx, zn) {
    const kind = zn.Z.kind;
    if (kind === 'sludge') this.drawPuddle(ctx, zn);
    else if (kind === 'burn') this.drawBurning(ctx, zn);
    else if (kind === 'fire') this.drawVortex(ctx, zn);
  }

  // Burning ground: small flames flickering at fixed spots across the patch.
  drawBurning(ctx, zn) {
    const Z = zn.Z;
    const fade = Math.min(1, zn.t * 6, (Z.life - zn.t) * 2);
    const set = FIRE.ember.slice(2);
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4, rr = Z.r * 0.85 * ((i * 0.37 + 0.2) % 1);
      const x = zn.x + Math.cos(a) * rr, y = zn.y + Math.sin(a) * rr * 0.5;
      const r = set[(Math.floor(this.time * 14) + i * 2) % set.length];
      const s = (0.45 + 0.12 * Math.sin(this.time * 11 + i)) * (0.6 + 0.4 * fade);
      ctx.globalAlpha = fade;
      ctx.drawImage(zn.owner.skin.fire, r.x, r.y, r.w, r.h, Math.round(x - r.w * s / 2), Math.round(y - r.h * s), Math.round(r.w * s), Math.round(r.h * s));
    }
    ctx.globalAlpha = 1;
  }

  // Sludge puddle: bubbles popping across the pool.
  drawPuddle(ctx, zn) {
    const Z = zn.Z;
    const fade = Math.min(1, zn.t * 6, (Z.life - zn.t) * 3);
    const b = POISON.bubbles;
    for (let i = 0; i < 5; i++) {
      const ph = (zn.t * 1.3 + i * 0.37) % 1;
      const a = i * 2.4, rr = Z.r * 0.7 * ((i * 0.31) % 1);
      const x = zn.x + Math.cos(a) * rr, y = zn.y + Math.sin(a) * rr * 0.5 - ph * 6;
      const r = b[Math.min(b.length - 1, Math.floor(ph * 4))];
      ctx.globalAlpha = fade * (1 - ph * 0.7);
      ctx.drawImage(zn.owner.skin.poison, r.x, r.y, r.w, r.h, Math.round(x - r.w * 0.2), Math.round(y - r.h * 0.4), Math.round(r.w * 0.4), Math.round(r.h * 0.4));
    }
    ctx.globalAlpha = 1;
  }

  // Poison Powder: sparkly clusters drifting in the cone, fading as it settles.
  drawCloud(ctx, c) {
    const P = POISON.powder;
    for (const puff of c.puffs) {
      const t = c.t - puff.delay;
      if (t < 0) continue;
      const k = t / (c.m.linger - puff.delay);
      const r = P[Math.min(P.length - 1, Math.floor(k * P.length))];
      ctx.globalAlpha = Math.max(0, 1 - k * 0.8);
      ctx.drawImage(c.owner.skin.poison, r.x, r.y, r.w, r.h, Math.round(puff.x - r.w * 0.3), Math.round(puff.y - r.h * 0.3 - k * 4), Math.round(r.w * 0.6), Math.round(r.h * 0.6));
    }
    ctx.globalAlpha = 1;
  }

  // Fire Spin: flames whirling around an ellipse, rising and shrinking as they climb.
  drawVortex(ctx, zn) {

    const Z = zn.Z;
    const fade = Math.min(1, zn.t * 6, (Z.life - zn.t) * 3);
    const set = FIRE.ember.slice(2);
    for (let i = 0; i < 18; i++) {
      const climb = (zn.t * 1.8 + i / 18) % 1;
      const ang = zn.t * 7 + (i / 18) * Math.PI * 2 + climb * 2;
      const rr = Z.r * (1 - climb * 0.35);
      const x = zn.x + Math.cos(ang) * rr, y = zn.y + Math.sin(ang) * rr * 0.5 - climb * 22;
      const r = set[(Math.floor(this.time * 18) + i) % set.length];
      const s = 0.8 - climb * 0.35;
      ctx.globalAlpha = fade * (1 - climb * 0.5);
      ctx.drawImage(zn.owner.skin.fire, r.x, r.y, r.w, r.h, Math.round(x - r.w * s / 2), Math.round(y - r.h * s), Math.round(r.w * s), Math.round(r.h * s));
    }
    ctx.globalAlpha = 1;
  }

  // Blast Burn: a ring of big flames racing outward. Back half under bodies, front half over.
  drawWave(ctx, w, front) {
    const m = w.m;
    const p = Math.min(1, w.t / m.wave);
    const r = m.radius * w.owner.size * p;
    const fade = w.t < m.wave ? 1 : 1 - (w.t - m.wave) / 0.35;
    if (!front) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5 * fade;
      ctx.strokeStyle = w.owner.skin.tint;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.ellipse(w.x, w.y, Math.max(1, r), Math.max(0.5, r * 0.5), 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    const n = 20;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2;
      if ((Math.sin(ang) >= 0) !== front) continue;
      const fr = FIRE.wheel[(Math.floor(this.time * 20) + i) % FIRE.wheel.length];
      const s = 0.45 + 0.25 * p;
      const x = w.x + Math.cos(ang) * r, y = w.y + Math.sin(ang) * r * 0.5;
      ctx.globalAlpha = fade;
      ctx.drawImage(w.owner.skin.fire, fr.x, fr.y, fr.w, fr.h, Math.round(x - fr.w * s / 2), Math.round(y - fr.h * s), Math.round(fr.w * s), Math.round(fr.h * s));
    }
    ctx.globalAlpha = 1;
  }

  // Surf: a crest of water with foam on its leading edge, fading as it breaks.
  drawSurf(ctx, sf) {
    const m = sf.m, half = (m.width * sf.owner.size) / 2;
    const fade = sf.t < m.travel ? Math.min(1, sf.t * 8) : 1 - (sf.t - m.travel) / 0.3;
    const blue = this.isBlue(sf.owner);
    ctx.save();
    ctx.translate(sf.x, sf.y - 4);
    ctx.rotate(Math.atan2(sf.dy, sf.dx));
    ctx.globalAlpha = 0.55 * fade;
    ctx.fillStyle = blue ? '#c88a2a' : '#2a7ad8';
    ctx.fillRect(-16, -half, 16, half * 2); // body of the wave
    ctx.globalAlpha = 0.85 * fade;
    ctx.fillStyle = blue ? '#ffc23a' : '#4cb6ff';
    ctx.fillRect(-7, -half, 7, half * 2);
    ctx.fillStyle = '#ffffff';
    for (let o = -half; o < half; o += 4) {
      const lip = 2 + Math.round(1.5 + 1.5 * Math.sin(o * 0.7 + this.time * 20));
      ctx.fillRect(-1, o, lip, 3); // foam
    }
    ctx.restore();
  }

  drawFlame(ctx, f) {
    const ray = this.flameRay(f);
    const img = f.skin.fire;
    const n = Math.max(1, Math.floor(ray.len / 9));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = this.isBlue(f) ? '#3a7bff' : '#ff6a00';
    ctx.beginPath();
    ctx.arc(ray.x1, ray.y1 - f.sp.mouthH, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    for (let i = n; i >= 0; i--) {
      const t = i / n;
      const x = ray.x0 + (ray.x1 - ray.x0) * t;
      const y = ray.y0 + (ray.y1 - ray.y0) * t - f.sp.mouthH;
      const r = FIRE.wheel[(Math.floor(this.time * 24) + i * 3) % FIRE.wheel.length];
      const s = 0.35 + 0.65 * t;
      const w = Math.round(r.w * s), h = Math.round(r.h * s);
      ctx.drawImage(img, r.x, r.y, r.w, r.h, Math.round(x - w / 2), Math.round(y - h / 2), w, h);
    }
    if (ray.blocked) {
      const r = FIRE.burst[2 + (Math.floor(this.time * 20) % 4)];
      const w = Math.round(r.w * 0.6), h = Math.round(r.h * 0.6);
      ctx.drawImage(img, r.x, r.y, r.w, r.h, Math.round(ray.x1 - w / 2), Math.round(ray.y1 - f.sp.mouthH - h / 2), w, h);
    }
  }

  drawTexts(ctx) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      if (t.t < 0) continue;
      const rise = t.big ? Math.min(1, t.t * 4) * 8 : t.t * 26;
      const alpha = Math.min(1, ((t.big ? 1.4 : 0.75) - t.t) * 4);
      ctx.globalAlpha = alpha;
      ctx.font = t.big ? 'bold 16px "Trebuchet MS", sans-serif' : t.small ? 'bold 8px "Trebuchet MS", sans-serif' : 'bold 11px "Trebuchet MS", sans-serif';
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#1a0d2e';
      ctx.strokeText(t.txt, Math.round(t.x), Math.round(t.y - rise));
      ctx.fillStyle = t.col;
      ctx.fillText(t.txt, Math.round(t.x), Math.round(t.y - rise));
    }
    ctx.globalAlpha = 1;
  }
}

function ellipse(ctx, x, y, rx, ry) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, Math.PI * 2);
  ctx.fill();
}

// Quadratic Bezier point at t.
function bez(x0, y0, cx, cy, x1, y1, t) {
  const u = 1 - t;
  return [u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1];
}

function distToSegment(px, py, { x0, y0, x1, y1 }) {
  const dx = x1 - x0, dy = y1 - y0;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - x0) * dx + (py - y0) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x0 + dx * t), py - (y0 + dy * t));
}
