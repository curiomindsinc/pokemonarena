// Rival controller. Produces the same intent shape as PlayerInput.
// Paths across tiers (stairs + ledge hops) to reach the foe's height, then
// spaces, strafes, picks moves by range, and sometimes dodges.
import { TILE } from './map.js';
import { RADIUS } from './fighter.js';
import { MOVES } from './moves.js';

// Normal is the original tuning; Easy and Hard scale around it.
export const DIFFICULTY = {
  easy: {
    label: 'Easy', reaction: 0.38, think: 0.3, heavyChance: 0.2, specialChance: 0.08,
    lead: 0, aimError: 0.22, dodge: 0.15, speed: 0.8, punish: 0.3, hesitate: 0.35, dodgeFlame: 0,
  },
  normal: {
    label: 'Normal', reaction: 0.16, think: 0.12, heavyChance: 0.45, specialChance: 0.25,
    lead: 0.5, aimError: 0, dodge: 0.55, speed: 1, punish: 1, hesitate: 0, dodgeFlame: 0,
  },
  hard: {
    label: 'Hard', reaction: 0.08, think: 0.07, heavyChance: 0.7, specialChance: 0.4,
    lead: 0.9, aimError: 0, dodge: 0.85, speed: 1, punish: 1, hesitate: 0, dodgeFlame: 0.8,
  },
};

export class RivalAI {
  constructor(me, foe, world) {
    this.me = me;
    this.foe = foe;
    this.world = world;
    this.graph = world.arena.buildGraph(RADIUS);
    this.level = DIFFICULTY.normal;
    this.reset();
  }

  setDifficulty(name) {
    this.level = DIFFICULTY[name] ?? DIFFICULTY.normal;
  }

  reset() {
    this.path = null;
    this.repathT = 0;
    this.thinkT = 0;
    this.plan = null; // queued move waiting out the reaction delay
    this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.strafeT = 0;
    this.dodged = new WeakSet();
    this.stuckT = 0;
    this.lastPos = { x: this.me.x, y: this.me.y };
    this.pauseT = 0;
    this.pauseCheckT = 1;
  }

  cellKey(x, y) {
    return this.graph.key(Math.floor(x / TILE), Math.floor(y / TILE));
  }

  // Dijkstra from my cell; goal = closest-to-foe cell on the foe's level.
  findPath() {
    const { nodes } = this.graph;
    const start = this.cellKey(this.me.x, this.me.y);
    if (!nodes.has(start)) return null;
    const dist = new Map([[start, 0]]);
    const prev = new Map();
    const open = [start];
    while (open.length) {
      open.sort((a, b) => dist.get(a) - dist.get(b));
      const cur = open.shift();
      for (const e of nodes.get(cur).edges) {
        const nd = dist.get(cur) + e.cost;
        if (nd < (dist.get(e.to) ?? Infinity)) {
          dist.set(e.to, nd);
          prev.set(e.to, { from: cur, edge: e });
          open.push(e.to);
        }
      }
    }
    const fc = Math.floor(this.foe.x / TILE), fr = Math.floor(this.foe.y / TILE);
    let best = null, bestScore = Infinity;
    for (const [k, d] of dist) {
      const n = nodes.get(k);
      if (n.cell.kind !== 'floor' || Math.abs(n.cell.h - this.foe.z) > 0.5) continue;
      const score = d + 1.5 * (Math.abs(n.c - fc) + Math.abs(n.r - fr));
      if (score < bestScore) { bestScore = score; best = k; }
    }
    if (best === null) return null;
    const steps = [];
    for (let k = best; k !== start; k = prev.get(k).from) steps.unshift({ key: k, edge: prev.get(k).edge });
    return steps;
  }

  update(dt) {
    const me = this.me, foe = this.foe;
    const intent = { mx: 0, my: 0, aim: me.face, move: null, dash: false, jump: false };
    if (me.ko || foe.ko) return intent;

    const dx = foe.x - me.x, dy = foe.y - me.y;
    const dist = Math.hypot(dx, dy);
    const toFoe = Math.atan2(dy, dx);
    intent.aim = toFoe;
    intent.tx = foe.x; // Fire Spin drops on the foe
    intent.ty = foe.y;
    const level = Math.abs(me.z - foe.z) < 0.5;
    const sight = level && this.world.arena.clearLine(me.x, me.y, foe.x, foe.y, me.zEff);

    const L = this.level;
    const evade = this.dodge(level, dist);

    // finish a decided move after reaction delay
    if (this.plan) {
      this.plan.t -= dt;
      if (this.plan.t <= 0) {
        intent.move = this.plan.move;
        const m = me.moveFor(intent.move);
        if (m.ai.lead) intent.aim = this.leadAim(m.speed);
        this.aimErr = (Math.random() * 2 - 1) * L.aimError;
        intent.aim += this.aimErr;
        this.plan = null;
      }
    }

    if (!level || !sight) {
      this.navigate(dt, intent);
    } else {
      this.path = null;
      this.fight(dt, intent, dist, toFoe);
    }
    // bone knocked out of our hands: go pick it up
    const bone = me.bone;
    if (bone?.state === 'ground' && !me.busy) {
      const bx = bone.x - me.x, by = bone.y - me.y, d = Math.hypot(bx, by);
      if (d > 2) { intent.mx = bx / d; intent.my = by / d; }
    }
    // walk out of hazards on the ground (Fire Spin, burning ground, sludge, wet floor unless it helps us)
    for (const zn of this.world.zones) {
      if (zn.owner === me || Math.abs(zn.z - me.z) > 0.5) continue;
      if (zn.Z.kind === 'wet' && me.sp.element === 'water') continue;
      const zx = me.x - zn.x, zy = me.y - zn.y, d = Math.hypot(zx, zy);
      if (d < zn.Z.r + 10 && d > 0) { intent.mx = zx / d; intent.my = zy / d; }
    }
    // ...and out of electrified water: swim for land, or step off a charged puddle
    if (this.world.shockOwner(me)) {
      const s = this.world.shocks.find((s) => Math.hypot(me.x - s.x, (me.y - s.y) * 1.4) < s.r + me.hurtR);
      const A = this.world.arena;
      const zx = s ? me.x - s.x : A.width / 2 - me.x, zy = s ? me.y - s.y : A.height / 2 - me.y, d = Math.hypot(zx, zy) || 1;
      intent.mx = zx / d; intent.my = zy / d;
    }
    // ...and out of Nightmare circles while the hands are still coming
    for (const nm of this.world.nightmares) {
      if (nm.owner === me || nm.t >= nm.m.last) continue;
      const zx = me.x - nm.x, zy = (me.y - nm.y) * 1.4, d = Math.hypot(zx, zy);
      if (d < nm.m.r + 10 && d > 0) { intent.mx = zx / d; intent.my = (me.y - nm.y) / d; }
    }
    // ...and out of a Hurricane before it can suck us in
    for (const h of this.world.hurricanes) {
      if (h.owner === me || h.t >= h.m.last) continue;
      const zx = me.x - h.x, zy = me.y - h.y, d = Math.hypot(zx, zy * 1.4);
      if (d < h.m.r + 14 && d > 0) { const l = Math.hypot(zx, zy); intent.mx = zx / l; intent.my = zy / l; }
    }
    // Easy rival sometimes just stands there for a moment.
    this.pauseCheckT -= dt;
    if (this.pauseCheckT <= 0) {
      this.pauseCheckT = 1;
      if (Math.random() < L.hesitate) this.pauseT = 0.4 + Math.random() * 0.5;
    }
    if (this.pauseT > 0) {
      this.pauseT -= dt;
      intent.mx = intent.my = 0;
      intent.move = null;
    }
    intent.mx *= L.speed;
    intent.my *= L.speed;
    if (evade) Object.assign(intent, evade, { move: null });
    return intent;
  }

  fight(dt, intent, dist, toFoe) {
    const me = this.me;
    this.strafeT -= dt;
    if (this.strafeT <= 0) { this.strafe *= -1; this.strafeT = 0.8 + Math.random() * 1.2; }

    if (!this.plan && !me.busy) {
      this.thinkT -= dt;
      if (this.thinkT <= 0) {
        const L = this.level;
        this.thinkT = L.think;
        // light first when in reach (no point swinging into an armored charge), then special, then heavy
        const chance = { light: 1, heavy: L.heavyChance, special: L.specialChance };
        const move = ['light', 'special', 'heavy'].find((slot) => {
          const m = me.moveFor(slot);
          if (!me.ready(slot) || dist < m.ai.min || dist > m.ai.max) return false;
          if (m.ai.melee && this.foe.armored) return false;
          if (m.ai.buff && (me.focus || me.dance)) return false; // already buffed
          // Withdraw only pays off when something is coming
          if (m.ai.guard && !(this.foe.action?.released || this.world.projectiles.some((p) => p.owner === this.foe))) return false;
          return Math.random() < chance[slot];
        });
        if (move) this.plan = { move, t: L.reaction };
      }
    }

    // spacing: close in when the light move is ready and foe is busy, otherwise hover at the species' range
    if (this.foe.busy && this.punishRoll === undefined) this.punishRoll = Math.random() < this.level.punish;
    if (!this.foe.busy) this.punishRoll = undefined;
    const reach = me.moveFor('light').ai.max;
    let want = me.ready('light') && ((this.foe.busy && this.punishRoll) || Math.random() < 0.002) ? reach * 0.7 : me.sp.hover;
    if (this.foe.armored) want = Math.max(want, 80); // back off a charging foe instead of trading into it
    const mine = me.action && MOVES[me.action.move];
    if (mine?.ai.chase && me.action.released) want = 0; // Petal Dance: run them down
    let ax = 0, ay = 0;
    const ux = Math.cos(toFoe), uy = Math.sin(toFoe);
    if (dist > want + 10) { ax += ux; ay += uy; } else if (dist < want - 10) { ax -= ux; ay -= uy; }
    ax += -uy * this.strafe * 0.7;
    ay += ux * this.strafe * 0.7;
    const l = Math.hypot(ax, ay);
    if (l > 0) { intent.mx = ax / l; intent.my = ay / l; }
    // keep leading the target while a projectile charges, since it fires along the final facing
    const am = me.action && MOVES[me.action.move];
    if (am?.ai.lead && me.charging) intent.aim = this.leadAim(am.speed) + (this.aimErr || 0);
  }

  navigate(dt, intent) {
    const me = this.me;
    this.repathT -= dt;
    const moved = Math.hypot(me.x - this.lastPos.x, me.y - this.lastPos.y);
    this.stuckT = moved < 0.2 && !me.busy ? this.stuckT + dt : 0;
    this.lastPos = { x: me.x, y: me.y };
    if (!this.path || this.repathT <= 0 || this.stuckT > 0.6) {
      this.path = this.findPath();
      this.repathT = 0.5;
      this.stuckT = 0;
    }
    if (!this.path || !this.path.length) return;
    if (me.jump) return; // mid-hop

    const step = this.path[0];
    const node = this.graph.nodes.get(step.key);
    const [tx, ty] = this.graph.center(node.c, node.r);
    if (step.edge.hop) {
      // walk to the centre of the take-off cell, then hop
      const here = this.cellKey(me.x, me.y);
      const from = this.graph.nodes.get(here);
      const [fx, fy] = this.graph.center(from.c, from.r);
      const ddx = fx - me.x, ddy = fy - me.y;
      if (Math.hypot(ddx, ddy) > 3) {
        const l = Math.hypot(ddx, ddy);
        intent.mx = ddx / l; intent.my = ddy / l;
      } else {
        [intent.mx, intent.my] = step.edge.hop;
        intent.jump = true;
        this.path.shift();
      }
      return;
    }
    const ddx = tx - me.x, ddy = ty - me.y, l = Math.hypot(ddx, ddy);
    if (l < 5) { this.path.shift(); return; }
    intent.mx = ddx / l;
    intent.my = ddy / l;
  }

  // Leads the target a little so embers aren't trivially strafed.
  leadAim(speed) {
    const me = this.me, foe = this.foe;
    const t = Math.hypot(foe.x - me.x, foe.y - me.y) / speed;
    const vx = (foe.x - (foe.prevX ?? foe.x)) / (1 / 60), vy = (foe.y - (foe.prevY ?? foe.y)) / (1 / 60);
    const k = this.level.lead;
    return Math.atan2(foe.y + vy * t * k - me.y, foe.x + vx * t * k - me.x);
  }

  // Returns intent overrides when an incoming ember is worth evading.
  dodge(level, dist) {
    const me = this.me, foe = this.foe;
    if (!level || me.busy) return null;
    // big charge about to release (rolled once per cast, just before it goes off):
    // sidestep a flamethrower aimed at us, dash straight away from Blast Burn
    const fa = foe.action;
    const fm = fa && MOVES[fa.move];
    if (fm?.ai.telegraph && fa.t >= fm.charge - 0.12 && !fa.aiRolled) {
      fa.aiRolled = true;
      const away = Math.atan2(me.y - foe.y, me.x - foe.x);
      if (fm.ai.telegraph === 'sidestep' && dist < (fm.length ?? 100)) {
        // inside the lane? (sideways distance from the aim line vs lane half-width)
        const off = Math.atan2(Math.sin(away - foe.face), Math.cos(away - foe.face));
        const side = Math.abs(Math.sin(off)) * dist, ahead = Math.cos(off) > 0;
        const halfLane = fm.width ? (fm.width * foe.size) / 2 : dist * Math.sin(0.5);
        // beams are telegraphed in red, so even Normal reads them; flamethrower needs Hard reflexes
        const chance = fm.width ? Math.max(this.level.dodge, this.level.dodgeFlame) : this.level.dodgeFlame;
        if (ahead && side < halfLane + me.hurtR + 4 && Math.random() < chance) {
          const s = Math.random() < 0.5 ? 1 : -1;
          return { dash: true, mx: -Math.sin(foe.face) * s, my: Math.cos(foe.face) * s };
        }
      } else if (fm.ai.telegraph === 'flee' && dist < fm.radius * foe.size + 20 && Math.random() < this.level.dodge) {
        return { dash: true, mx: Math.cos(away), my: Math.sin(away) };
      }
    }
    // Phantom Force's red circle just appeared behind us: dash clear (rolled once per dive).
    // Harder to read than a lane, so even Hard only escapes it sometimes.
    const rise = fa?.sunk && fa.rise;
    if (rise && !fa.aiRolledRise) {
      fa.aiRolledRise = true;
      if (Math.hypot(me.x - rise.x, (me.y - rise.y) * 1.4) < fm.aoe + me.hurtR + 8 && Math.random() < this.level.dodge * 0.6) {
        const away = Math.atan2(me.y - rise.y, me.x - rise.x);
        return { dash: true, mx: Math.cos(away), my: Math.sin(away) };
      }
    }
    // standing in a Thunder circle: dash out of it (rolled once per strike)
    for (const st of this.world.strikes) {
      if (st.owner === me || st.fired || this.dodged.has(st)) continue;
      const ox = me.x - st.x, oy = (me.y - st.y) * 1.4, d = Math.hypot(ox, oy);
      if (d > st.m.aoe + me.hurtR + 4) continue;
      this.dodged.add(st);
      if (Math.random() < this.level.dodge) {
        const a = d > 1 ? Math.atan2(me.y - st.y, ox) : Math.random() * Math.PI * 2;
        return { dash: true, mx: Math.cos(a), my: Math.sin(a) };
      }
    }
    // quake ring about to reach us: hop over it (rolled once per ring)
    for (const q of this.world.quakes) {
      if (q.owner === me || this.dodged.has(q)) continue;
      const d = Math.hypot(me.x - q.x, (me.y - q.y) * 1.4);
      if (d > q.r && d - q.r < 24 && d < q.R + me.hurtR) {
        this.dodged.add(q);
        if (Math.random() < this.level.dodge) return { jump: true, mx: 0, my: 0 };
      }
    }
    // shots and rolling tornadoes alike
    for (const p of [...this.world.projectiles, ...this.world.twisters]) {
      if (p.owner === me || this.dodged.has(p) || p.lob) continue;
      const rx = me.x - p.x, ry = me.y - p.y;
      const d = Math.hypot(rx, ry);
      const closing = (rx * p.vx + ry * p.vy) / (d * Math.hypot(p.vx, p.vy));
      if (d < 70 && closing > 0.9) {
        this.dodged.add(p);
        if (Math.random() < this.level.dodge) {
          // in-place hop lifts us above the ember's height; otherwise sidestep
          if (Math.random() < 0.5) return { jump: true, mx: 0, my: 0 };
          const s = Math.random() < 0.5 ? 1 : -1, v = Math.hypot(p.vx, p.vy);
          return { dash: true, mx: (-p.vy / v) * s, my: (p.vx / v) * s };
        }
      }
    }
    return null;
  }
}
