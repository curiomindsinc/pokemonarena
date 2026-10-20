// Arena layout, height queries and static rendering.
//
// Legend:
//   #  outer wall          .  floor (tier 0)     ~  water (tier 0, not walkable)
//   1  plateau tier 1      2  plateau tier 2
//   F  cliff face, tier 0 -> 1     G  cliff face, tier 1 -> 2
//   S  stairs, tier 0 -> 1         T  stairs, tier 1 -> 2
// Stairs and faces sit on the south edge of a plateau; climbing is northward.
import { TILES } from './frames.js';

export const TILE = 24;

// Flat island ringed by a 3-tile water moat (tiers parked for now; the legend still parses them).
const LAYOUT = [
  '####################################',
  '#~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~#',
  '#~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~#',
  '#~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~#',
  '#~~~............................~~~#',
  '#~~~............................~~~#',
  '#~~~............................~~~#',
  '#~~~............................~~~#',
  '#~~~............................~~~#',
  '#~~~............................~~~#',
  '#~~~............................~~~#',
  '#~~~............................~~~#',
  '#~~~............................~~~#',
  '#~~~............................~~~#',
  '#~~~............................~~~#',
  '#~~~............................~~~#',
  '#~~~............................~~~#',
  '#~~~............................~~~#',
  '#~~~............................~~~#',
  '#~~~............................~~~#',
  '#~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~#',
  '#~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~#',
  '#~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~#',
  '####################################',
];

function parseCell(ch) {
  switch (ch) {
    case '#': return { kind: 'wall', layer: -1 };
    case '.': return { kind: 'floor', h: 0, layer: 0 };
    case '1': return { kind: 'floor', h: 1, layer: 1 };
    case '2': return { kind: 'floor', h: 2, layer: 2 };
    case '~': return { kind: 'water', layer: 0 };
    case 'F': return { kind: 'face', base: 0, layer: 0 };
    case 'G': return { kind: 'face', base: 1, layer: 1 };
    case 'S': return { kind: 'stairs', base: 0, layer: 0 };
    case 'T': return { kind: 'stairs', base: 1, layer: 1 };
    default: throw new Error('bad map char ' + ch);
  }
}

export class Arena {
  constructor() {
    this.rows = LAYOUT.length;
    this.cols = LAYOUT[0].length;
    this.width = this.cols * TILE;
    this.height = this.rows * TILE;
    this.cells = LAYOUT.map((line) => [...line].map(parseCell));
  }

  cell(c, r) {
    if (r < 0 || c < 0 || r >= this.rows || c >= this.cols) return null;
    return this.cells[r][c];
  }

  cellAt(x, y) {
    return this.cell(Math.floor(x / TILE), Math.floor(y / TILE));
  }

  isWaterAt(x, y) { return this.cellAt(x, y)?.kind === 'water'; }

  static standable(cell) {
    return !!cell && (cell.kind === 'floor' || cell.kind === 'stairs');
  }

  // Walkable surface height at a point, or null if you cannot stand there.
  surfaceAt(x, y) {
    const cell = this.cellAt(x, y);
    if (!Arena.standable(cell)) return null;
    if (cell.kind === 'floor') return cell.h;
    const fy = (y - Math.floor(y / TILE) * TILE) / TILE;
    return cell.base + Math.min(1, Math.max(0, 1 - fy));
  }

  // Does terrain at (x,y) stop something travelling at height z (projectiles, flame)?
  blocksAt(x, y, z) {
    const cell = this.cellAt(x, y);
    if (!cell || cell.kind === 'wall') return true;
    if (cell.kind === 'water') return false;
    if (cell.kind === 'face') return cell.base + 1 > z + 0.35;
    return this.surfaceAt(x, y) > z + 0.35;
  }

  // Ground height used for drawing shadows under airborne things.
  groundAt(x, y, fallback) {
    const s = this.surfaceAt(x, y);
    if (s !== null) return s;
    const cell = this.cellAt(x, y);
    if (cell && cell.kind === 'face') return cell.base + 1;
    if (cell && cell.kind === 'water') return 0;
    return fallback;
  }

  // Circle-ish footprint test: every probe point must be standable at about height z.
  // `swim`: water counts as tier-0 ground (water monsters).
  fits(x, y, z, r, swim = false) {
    const probes = [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r * 0.6]];
    for (const [dx, dy] of probes) {
      const s = this.surfaceAt(x + dx, y + dy) ?? (swim && this.isWaterAt(x + dx, y + dy) ? 0 : null);
      if (s === null || Math.abs(s - z) > 0.45) return false;
    }
    return true;
  }

  // Ledge hop: scan forward for the first standable spot at a different height
  // (or the same height past a gap). Returns {x, y, z} or null.
  findHop(x, y, z, dx, dy, r) {
    let crossedGap = false;
    for (let d = 6; d <= 66; d += 3) {
      const px = x + dx * d, py = y + dy * d;
      const cell = this.cellAt(px, py);
      if (!cell || cell.kind === 'wall') return null;
      const s = this.surfaceAt(px, py);
      if (s === null) { crossedGap = true; continue; }
      const diff = s - z;
      if (Math.abs(diff) < 0.4 && !crossedGap) continue;
      if (diff > 1.2) return null;
      for (let extra = 6; extra <= 18; extra += 3) {
        const lx = x + dx * (d + extra), ly = y + dy * (d + extra);
        const ls = this.surfaceAt(lx, ly);
        if (ls !== null && this.fits(lx, ly, ls, r)) return { x: lx, y: ly, z: ls };
      }
      return null;
    }
    return null;
  }

  // Line of sight for an attack travelling at height z.
  clearLine(x0, y0, x1, y1, z) {
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.ceil(dist / 4);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (this.blocksAt(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z)) return false;
    }
    return true;
  }

  // ---------- rendering ----------

  render(tilesImg) {
    const c = document.createElement('canvas');
    c.width = this.width;
    c.height = this.height;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const put = (rect, col, row) =>
      ctx.drawImage(tilesImg, rect.x, rect.y, rect.w, rect.h, col * TILE, row * TILE, TILE, TILE);

    // Seeded RNG so decoration is stable between restarts.
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

    // 9-slice picker from 4-neighbour membership.
    const nine = (set, col, row, inRegion) => {
      const L = inRegion(col - 1, row), R = inRegion(col + 1, row);
      const U = inRegion(col, row - 1), D = inRegion(col, row + 1);
      const tc = !L ? 0 : !R ? 2 : 1;
      const tr = !U ? 0 : !D ? 2 : 1;
      put(set[tr][tc], col, row);
    };

    // 1. ground everywhere
    for (let r = 0; r < this.rows; r++) for (let col = 0; col < this.cols; col++) {
      put(TILES.ground[1][1], col, r);
      const cell = this.cells[r][col];
      if (cell.kind === 'floor' && cell.h === 0 && rand() < 0.06) put(TILES.groundDeco[rand() < 0.5 ? 0 : 1], col, r);
    }

    // 2. water
    const isWater = (cc, rr) => this.cell(cc, rr)?.kind === 'water';
    this.forEach((cell, col, r) => { if (cell.kind === 'water') nine(TILES.water, col, r, isWater); });

    // 3. raised layers (drop shadow first, then the plateau top)
    for (const layer of [1, 2]) {
      const inLayer = (cc, rr) => {
        const k = this.cell(cc, rr);
        return !!k && k.kind !== 'wall' && k.layer >= layer;
      };
      // shadow cast to the east/south-east on the lower layer
      ctx.fillStyle = 'rgba(20,10,40,0.28)';
      this.forEach((cell, col, r) => {
        if (!inLayer(col, r)) return;
        if (!inLayer(col + 1, r) && this.cell(col + 1, r)?.kind !== 'wall') ctx.fillRect((col + 1) * TILE, r * TILE + 3, 4, TILE);
      });
      const set = layer === 1 ? TILES.stone : TILES.cracked;
      this.forEach((cell, col, r) => { if (inLayer(col, r)) nine(set, col, r, inLayer); });
      // brighten higher tiers slightly so height reads at a glance
      if (layer === 2) {
        ctx.fillStyle = 'rgba(255,250,230,0.10)';
        this.forEach((cell, col, r) => { if (cell.kind === 'floor' && cell.h === 2) ctx.fillRect(col * TILE, r * TILE, TILE, TILE); });
      }
    }

    // 4. cliff faces + stairs
    this.forEach((cell, col, r) => {
      if (cell.kind === 'face') {
        const arch = rand() < 0.2;
        put((arch ? TILES.faceArch : TILES.face)[col % 2], col, r);
        const g = ctx.createLinearGradient(0, r * TILE, 0, (r + 1) * TILE);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(10,0,30,0.35)');
        ctx.fillStyle = g;
        ctx.fillRect(col * TILE, r * TILE, TILE, TILE);
      } else if (cell.kind === 'stairs') {
        this.drawStairs(ctx, col, r);
      }
      // contact shadow on the ground just below a face/stairs
      const below = this.cell(col, r + 1);
      if ((cell.kind === 'face' || cell.kind === 'stairs') && below && below.kind !== 'face' && below.kind !== 'stairs') {
        const g = ctx.createLinearGradient(0, (r + 1) * TILE, 0, (r + 1) * TILE + 7);
        g.addColorStop(0, 'rgba(20,0,40,0.45)');
        g.addColorStop(1, 'rgba(20,0,40,0)');
        ctx.fillStyle = g;
        ctx.fillRect(col * TILE, (r + 1) * TILE, TILE, 7);
      }
    });

    // 5. outer walls
    const isWall = (cc, rr) => { const k = this.cell(cc, rr); return !k || k.kind === 'wall'; };
    this.forEach((cell, col, r) => { if (cell.kind === 'wall') nine(TILES.stoneAlt, col, r, isWall); });
    ctx.fillStyle = 'rgba(16,8,40,0.45)';
    this.forEach((cell, col, r) => { if (cell.kind === 'wall') ctx.fillRect(col * TILE, r * TILE, TILE, TILE); });

    return c;
  }

  drawStairs(ctx, col, r) {
    const x = col * TILE, y = r * TILE;
    ctx.fillStyle = '#4f5d68';
    ctx.fillRect(x, y, TILE, TILE);
    const steps = 4, sh = TILE / steps;
    for (let i = 0; i < steps; i++) {
      const sy = y + i * sh;
      const shade = 200 + i * 8;
      ctx.fillStyle = `rgb(${shade - 10},${shade},${shade + 18})`;
      ctx.fillRect(x + 3, sy, TILE - 6, sh - 2);
      ctx.fillStyle = '#6d7f8c';
      ctx.fillRect(x + 3, sy + sh - 2, TILE - 6, 2);
    }
    ctx.fillStyle = '#3b4650';
    ctx.fillRect(x, y, 3, TILE);
    ctx.fillRect(x + TILE - 3, y, 3, TILE);
  }

  forEach(fn) {
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) fn(this.cells[r][c], c, r);
  }

  // Cell graph for AI pathing: walk edges plus ledge-hop edges.
  buildGraph(radius) {
    const nodes = new Map();
    const key = (c, r) => r * this.cols + c;
    const center = (c, r) => [c * TILE + TILE / 2, r * TILE + TILE / 2];
    this.forEach((cell, c, r) => {
      if (Arena.standable(cell)) nodes.set(key(c, r), { c, r, cell, edges: [] });
    });
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const node of nodes.values()) {
      const [cx, cy] = center(node.c, node.r);
      for (const [dc, dr] of dirs) {
        const nb = nodes.get(key(node.c + dc, node.r + dr));
        if (nb && this.walkLink(node, nb, dc, dr)) node.edges.push({ to: key(nb.c, nb.r), cost: 1 });
      }
      if (node.cell.kind !== 'floor') continue;
      for (const [dc, dr] of dirs) {
        const hop = this.findHop(cx, cy, node.cell.h, dc, dr, radius);
        if (!hop) continue;
        const to = key(Math.floor(hop.x / TILE), Math.floor(hop.y / TILE));
        if (nodes.has(to) && !node.edges.some((e) => e.to === to)) node.edges.push({ to, cost: 3, hop: [dc, dr] });
      }
    }
    return { nodes, key, center };
  }

  walkLink(a, b, dc, dr) {
    const A = a.cell, B = b.cell;
    if (A.kind === 'floor' && B.kind === 'floor') return A.h === B.h;
    if (dc !== 0) return false; // stairs only connect north/south
    if (A.kind === 'floor' && B.kind === 'stairs') return dr === -1 ? A.h === B.base : A.h === B.base + 1;
    if (A.kind === 'stairs' && B.kind === 'floor') return dr === -1 ? B.h === A.base + 1 : B.h === A.base;
    return false;
  }
}
