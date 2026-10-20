// Slices the irregular ripper sprite sheets into frame rects + anchors.
// Output: src/frames.js (ES module). Run: node tools/slice.js
const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
// Sheets live in sprites/: monsters + portraits in char/, move FX in attacks/.
const CHAR_FILES = new Set(['charmander.png', 'bulbasaur.png', 'squirtle.png', 'geodude.png', 'cubone.png', 'pichu.png', 'gastly.png', 'gastly.packed.png', 'pidgey.png', 'dratini.png', 'abra.png', 'protraits.png']);
const spritePath = (f) => (f === 'tile.png' ? 'sprites/' : CHAR_FILES.has(f) ? 'sprites/char/' : 'sprites/attacks/') + f;
const load = (f) => PNG.sync.read(fs.readFileSync(path.join(ROOT, spritePath(f))));

function components(img, rx, ry, rw, rh, minPx = 16) {
  const { width: W, data: d } = img;
  const bg = [d[0], d[1], d[2]];
  const fg = (x, y) => {
    const i = (y * W + x) * 4;
    return d[i + 3] > 0 && !(d[i] === bg[0] && d[i + 1] === bg[1] && d[i + 2] === bg[2]);
  };
  const seen = new Uint8Array(rw * rh);
  const out = [];
  for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
    if (seen[y * rw + x] || !fg(rx + x, ry + y)) continue;
    const b = { x0: x, y0: y, x1: x, y1: y, n: 0 };
    const st = [[x, y]];
    seen[y * rw + x] = 1;
    while (st.length) {
      const [cx, cy] = st.pop();
      b.n++;
      b.x0 = Math.min(b.x0, cx); b.x1 = Math.max(b.x1, cx);
      b.y0 = Math.min(b.y0, cy); b.y1 = Math.max(b.y1, cy);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= rw || ny >= rh) continue;
        const k = ny * rw + nx;
        if (!seen[k] && fg(rx + nx, ry + ny)) { seen[k] = 1; st.push([nx, ny]); }
      }
    }
    if (b.n >= minPx) out.push({ x: rx + b.x0, y: ry + b.y0, w: b.x1 - b.x0 + 1, h: b.y1 - b.y0 + 1 });
  }
  return out;
}

// Anchor: feet = bbox bottom; x = centroid of body pixels (ignores white/blue slash FX).
function anchor(img, r) {
  const { width: W, data: d } = img;
  const bg = [d[0], d[1], d[2]];
  let sx = 0, n = 0;
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
    const i = (y * W + x) * 4;
    const R = d[i], G = d[i + 1], B = d[i + 2];
    if (R === bg[0] && G === bg[1] && B === bg[2]) continue;
    if (R > 170 && G > 170 && B > 170) continue; // slash / highlight
    if (B > R + 40) continue; // bluish slash
    sx += x; n++;
  }
  const cx = n ? Math.round(sx / n) : r.x + (r.w >> 1);
  return { ...r, ax: cx - r.x, ay: r.h };
}

function rows(boxes, tol = 12) {
  boxes.sort((a, b) => a.y - b.y);
  const out = [];
  for (const b of boxes) {
    const row = out.find((r) => Math.abs(r[0].y - b.y) <= tol);
    row ? row.push(b) : out.push([b]);
  }
  out.forEach((r) => r.sort((a, b) => a.x - b.x));
  return out;
}

const DIRS = ['S', 'N', 'W', 'SW', 'NW'];

// ---- Charmander (top section of sheet) ----
const ch = load('charmander.png');
const byDir = (rowList, perRow) => {
  const o = {};
  if (rowList.length !== 5) throw new Error('expected 5 dir rows, got ' + rowList.length);
  rowList.forEach((r, i) => {
    if (perRow && r.length !== perRow) throw new Error(`row ${i}: expected ${perRow} frames, got ${r.length}`);
    o[DIRS[i]] = r.map((b) => anchor(ch, b));
  });
  return o;
};

const charmander = {
  walk: byDir(rows(components(ch, 55, 30, 70, 120)), 3),
  atk1: byDir(rows(components(ch, 126, 14, 71, 126)), 3),
  atk2: byDir(rows(components(ch, 198, 14, 104, 126)), 4),
};
// Special: first two boxes share a row (S, N), then W, SW, NW.
{
  const sp = components(ch, 318, 14, 52, 110).sort((a, b) => a.y - b.y || a.x - b.x);
  const top = sp.slice(0, 2).sort((a, b) => a.x - b.x);
  const list = [...top, ...sp.slice(2)];
  if (list.length !== 5) throw new Error('special: expected 5, got ' + list.length);
  charmander.special = Object.fromEntries(DIRS.map((d, i) => [d, [anchor(ch, list[i])]]));
}
// Hurt: (S, N) side by side, then W, SW, NW stacked.
{
  const hu = components(ch, 0, 98, 56, 102).sort((a, b) => a.y - b.y || a.x - b.x);
  const top = hu.slice(0, 2).sort((a, b) => a.x - b.x);
  const list = [...top, ...hu.slice(2)];
  if (list.length !== 5) throw new Error('hurt: expected 5, got ' + list.length);
  charmander.hurt = Object.fromEntries(DIRS.map((d, i) => [d, [anchor(ch, list[i])]]));
}
// Asleep (used for KO): 2 frames.
charmander.sleep = components(ch, 0, 60, 56, 25).sort((a, b) => a.x - b.x).map((b) => anchor(ch, b));

// ---- Charmeleon / Charizard (middle + bottom sections) ----
// Tiny boxes are label text and underline marks, not sprites.
const blobs = (...r) => components(ch, ...r).filter((b) => b.w >= 10 && b.h >= 10);
const perDir = (rowList, n, what) => {
  if (rowList.length !== 5) throw new Error(`${what}: expected 5 dir rows, got ${rowList.length}`);
  return Object.fromEntries(rowList.map((r, i) => {
    if (n && r.length !== n) throw new Error(`${what} row ${i}: expected ${n} frames, got ${r.length}`);
    return [DIRS[i], r.map((b) => anchor(ch, b))];
  }));
};
// Hurt columns: (S, N) side by side, then W, SW, NW stacked.
const hurtList = (boxes) => {
  const list = rows(boxes).flat();
  if (list.length !== 5) throw new Error('hurt: expected 5, got ' + list.length);
  return Object.fromEntries(DIRS.map((d, i) => [d, [anchor(ch, list[i])]]));
};
const sleepList = (r) => blobs(...r).sort((a, b) => a.x - b.x).map((b) => anchor(ch, b));

const charmeleon = {
  idle: perDir(rows(blobs(58, 218, 55, 145)), 2, 'meleon idle'),
  walk: perDir(rows(blobs(114, 218, 74, 130)), 3, 'meleon walk'),
  atk: perDir(rows(blobs(190, 214, 98, 155)), 3, 'meleon atk'),
  special: perDir(rows(blobs(292, 214, 72, 150)), 2, 'meleon special'),
  hurt: hurtList(blobs(0, 306, 58, 116)),
  sleep: sleepList([0, 262, 58, 32]),
};
const charizard = {
  walk: perDir(rows(blobs(76, 455, 96, 165)), 3, 'zard walk'),
  atk: perDir(rows(blobs(172, 440, 148, 170)), 4, 'zard atk'),
  special: perDir(rows(blobs(324, 440, 72, 165)), 2, 'zard special'),
  hurt: hurtList(blobs(0, 538, 72, 140)),
  sleep: sleepList([0, 490, 66, 40]),
};

// ---- Bulbasaur line (bulbasaur.png): 32px cells on a 33px pitch, magenta grid ----
// 8 direction rows per monster, already drawn for every facing (no mirroring).
const DIRS8 = ['S', 'SW', 'W', 'NW', 'N', 'NE', 'E', 'SE'];
const bu = load('bulbasaur.png');
const BU_BG = [[0, 127, 151], [0, 103, 111]];
// Anchor inside one cell: feet = lowest sprite pixel, x = centroid (ignores white sweat marks).
function cellFrame(img, x, y) {
  const { width: W, data: d } = img;
  let x0 = 99, x1 = -1, y0 = 99, y1 = -1, sx = 0, n = 0;
  for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) {
    const k = ((y + j) * W + x + i) * 4;
    const R = d[k], G = d[k + 1], B = d[k + 2];
    if (BU_BG.some(([r, g, b]) => R === r && G === g && B === b)) continue;
    x0 = Math.min(x0, i); x1 = Math.max(x1, i); y0 = Math.min(y0, j); y1 = Math.max(y1, j);
    if (R > 230 && G > 230 && B > 230) continue;
    sx += i; n++;
  }
  if (x1 < 0) throw new Error(`empty cell at ${x},${y}`);
  const cx = n ? Math.round(sx / n) : (x0 + x1) >> 1;
  return { x: x + x0, y: y + y0, w: x1 - x0 + 1, h: y1 - y0 + 1, ax: cx - x0, ay: y1 - y0 + 1 };
}
// cols: sheet x of each frame column; row0: y of the S row
const gridDirs = (cols, row0) => Object.fromEntries(DIRS8.map((dir, r) => [dir, cols.map((x) => cellFrame(bu, x, row0 + 33 * r))]));
const sleepCells = (xs, y) => xs.map((x) => cellFrame(bu, x, y));

const bulbasaur = {
  walk: gridDirs([2, 35, 68], 35),
  special: gridDirs([134, 167], 35),
  special2: gridDirs([233, 266], 35),
  hurt: gridDirs([332], 35),
  sleep: sleepCells([398, 431], 35),
};
const ivysaur = {
  idle: gridDirs([2, 35, 68], 336),
  walk: gridDirs([134, 167, 200], 336),
  special: gridDirs([266, 299], 336),
  special2: gridDirs([365, 398], 336),
  hurt: gridDirs([464], 336),
  sleep: sleepCells([530, 563], 336),
};
// male Venusaur (bottom section)
const venusaur = {
  walk: gridDirs([2, 35, 68], 938),
  special: gridDirs([134, 167], 938),
  special2: gridDirs([233, 266], 938),
  hurt: gridDirs([332], 938),
  sleep: sleepCells([398, 431], 938),
};

// ---- Squirtle line (squirtle.png): same ripper layout as charmander.png ----
// The bodies are blue, so the anchor can't skip bluish pixels like the fire one does.
const sq = load('squirtle.png');
function bodyAnchor(r) {
  const { width: W, data: d } = sq;
  let sx = 0, n = 0;
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
    const i = (y * W + x) * 4;
    if (d[i] === 0 && d[i + 1] === 128 && d[i + 2] === 128) continue;
    sx += x; n++;
  }
  return { ...r, ax: Math.round(sx / n) - r.x, ay: r.h };
}
const sqBlobs = (...r) => components(sq, ...r).filter((b) => b.w >= 10 && b.h >= 10);
const sqDirs = (r, n, what, dirs = DIRS) => {
  const list = rows(sqBlobs(...r));
  if (list.length !== dirs.length) throw new Error(`${what}: expected ${dirs.length} dir rows, got ${list.length}`);
  return Object.fromEntries(list.map((row, i) => {
    if (n && row.length !== n) throw new Error(`${what} row ${i}: expected ${n} frames, got ${row.length}`);
    return [dirs[i], row.map(bodyAnchor)];
  }));
};
// One frame per facing: (S, N) side by side, then W, SW, NW stacked (hurt, shell).
const sqSingles = (r, what) => {
  const list = rows(sqBlobs(...r)).flat();
  if (list.length !== 5) throw new Error(`${what}: expected 5, got ${list.length}`);
  return Object.fromEntries(DIRS.map((d, i) => [d, [bodyAnchor(list[i])]]));
};
const sqSleep = (r) => sqBlobs(...r).sort((a, b) => a.x - b.x).map(bodyAnchor);

const squirtle = {
  walk: sqDirs([50, 45, 85, 115], 3, 'squirtle walk'),
  special: sqDirs([138, 15, 80, 110], 3, 'squirtle special'),
  shell: sqSingles([255, 18, 45, 60], 'squirtle shell'),
  hurt: sqSingles([0, 100, 52, 90], 'squirtle hurt'),
  sleep: sqSleep([0, 60, 52, 22]),
};

// Wartortle is drawn for all 8 facings, rows ordered S, N, W, E, SW, SE, NW, NE
// (idle packs those as pairs). Hurt + shell only have the 5 west-side views, so the
// east side reuses them flagged `mirror`.
const WT_DIRS = ['S', 'N', 'W', 'E', 'SW', 'SE', 'NW', 'NE'];
const mirrorEast = (o) => ({ ...o, E: o.W.map((r) => ({ ...r, mirror: true })), SE: o.SW.map((r) => ({ ...r, mirror: true })), NE: o.NW.map((r) => ({ ...r, mirror: true })) });
const wtIdle = rows(sqBlobs(58, 205, 50, 115)).flat();
if (wtIdle.length !== 8) throw new Error('wartortle idle: expected 8, got ' + wtIdle.length);
const wartortle = {
  idle: Object.fromEntries(WT_DIRS.map((d, i) => [d, [bodyAnchor(wtIdle[i])]])),
  walk: sqDirs([112, 222, 80, 210], 3, 'wartortle walk', WT_DIRS),
  special: sqDirs([195, 210, 110, 220], 4, 'wartortle special', WT_DIRS),
  shell: mirrorEast(sqSingles([325, 212, 40, 70], 'wartortle shell')),
  hurt: mirrorEast(sqSingles([0, 295, 55, 100], 'wartortle hurt')),
  sleep: sqSleep([0, 252, 55, 30]),
};

const blastoise = {
  idle: sqDirs([100, 448, 65, 150], 2, 'blastoise idle'),
  walk: sqDirs([168, 448, 92, 150], 3, 'blastoise walk'),
  atk: sqDirs([262, 448, 64, 150], 2, 'blastoise atk'),
  special: sqSingles([340, 448, 70, 115], 'blastoise special'), // hunched / withdrawing
  shell: sqSingles([20, 560, 55, 90], 'blastoise shell'),
  sleep: sqSleep([0, 490, 65, 40]),
};
blastoise.hurt = blastoise.shell; // the sheet's hurt pose is the shell

// ---- Geodude line (geodude.png): same ripper layout, 5 facing rows ----
// Grey bodies with white punch swipes fused onto some attack frames, so the
// anchor centroid skips near-white pixels.
const ge = load('geodude.png');
function rockAnchor(r) {
  const { width: W, data: d } = ge;
  let sx = 0, n = 0;
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
    const i = (y * W + x) * 4;
    if (d[i] === 0 && d[i + 1] === 128 && d[i + 2] === 128) continue;
    if (d[i] > 200 && d[i + 1] > 200 && d[i + 2] > 200) continue;
    sx += x; n++;
  }
  return { ...r, ax: Math.round(sx / n) - r.x, ay: r.h };
}
const geBlobs = (...r) => components(ge, ...r).filter((b) => b.w >= 10 && b.h >= 10);
const geDirs = (r, n, what) => {
  const list = rows(geBlobs(...r));
  if (list.length !== 5) throw new Error(`${what}: expected 5 dir rows, got ${list.length}`);
  return Object.fromEntries(list.map((row, i) => {
    if (n && row.length !== n) throw new Error(`${what} row ${i}: expected ${n} frames, got ${row.length}`);
    return [DIRS[i], row.map(rockAnchor)];
  }));
};
// Hurt column: (S, N) side by side, then W, SW, NW stacked.
const geSingles = (r, what) => {
  const list = rows(geBlobs(...r)).flat();
  if (list.length !== 5) throw new Error(`${what}: expected 5, got ${list.length}`);
  return Object.fromEntries(DIRS.map((d, i) => [d, [rockAnchor(list[i])]]));
};
const geSleep = (r) => geBlobs(...r).sort((a, b) => a.x - b.x).map(rockAnchor);

const geodude = {
  idle: geSingles([60, 15, 60, 85], 'geodude idle'), // one frame per facing, laid out like hurt
  walk: geDirs([118, 15, 85, 112], 3, 'geodude walk'),
  atk: geDirs([203, 15, 100, 160], 3, 'geodude atk'),
  special: geDirs([303, 15, 130, 120], 4, 'geodude special'),
  hurt: geSingles([0, 105, 58, 82], 'geodude hurt'),
  sleep: geSleep([0, 62, 58, 25]),
};
const graveler = {
  idle: geDirs([62, 205, 60, 145], 2, 'graveler idle'),
  walk: geDirs([122, 205, 88, 145], 3, 'graveler walk'),
  atk: geDirs([210, 205, 90, 145], 3, 'graveler atk'),
  special: geDirs([300, 205, 90, 145], 2, 'graveler special'),
  hurt: geSingles([0, 288, 58, 103], 'graveler hurt'),
  sleep: geSleep([0, 250, 58, 25]),
};
// Golem's 4th attack frame is the curled-up boulder (Rollout).
const golem = {
  idle: geDirs([66, 410, 60, 135], 2, 'golem idle'),
  walk: geDirs([128, 410, 87, 135], 3, 'golem walk'),
  atk: geDirs([215, 410, 115, 135], 4, 'golem atk'),
  special: geDirs([335, 410, 70, 135], 2, 'golem special'),
  hurt: geSingles([0, 500, 58, 104], 'golem hurt'),
  sleep: geSleep([0, 457, 58, 28]),
};

// ---- Cubone line (cubone.png): ripper layout, 8 facing rows like Wartortle ----
// Rows S, N, W, E, SW, SE, NW, NE; special packs them as pairs. Hurt only has the
// 5 west-side views (east = mirrored). White skulls and swing arcs are skipped by
// the anchor, so the centroid follows the brown body.
const cu = load('cubone.png');
function boneAnchor(r) {
  const { width: W, data: d } = cu;
  let sx = 0, n = 0;
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
    const i = (y * W + x) * 4;
    if (d[i] === 0 && d[i + 1] === 128 && d[i + 2] === 128) continue;
    if (d[i] > 190 && d[i + 1] > 180) continue; // skull, bone, swing arc
    sx += x; n++;
  }
  return { ...r, ax: Math.round(sx / n) - r.x, ay: r.h };
}
// Tight box of the sprite pixels inside r (splits blobs that touch across rows).
function tighten(img, r) {
  const { width: W, data: d } = img;
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
    const i = (y * W + x) * 4;
    if (d[i] === 0 && d[i + 1] === 128 && d[i + 2] === 128) continue;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
const cuBlobs = (...r) => components(cu, ...r).filter((b) => b.w >= 10 && b.h >= 10);
const cuDirs = (list, n, what) => {
  if (list.length !== 8) throw new Error(`${what}: expected 8 dir rows, got ${list.length}`);
  return Object.fromEntries(list.map((row, i) => {
    if (n && row.length !== n) throw new Error(`${what} row ${i}: expected ${n} frames, got ${row.length}`);
    return [WT_DIRS[i], row.map(boneAnchor)];
  }));
};
const cuPairs = (r, what) => {
  const list = rows(cuBlobs(...r)).flat();
  if (list.length !== 8) throw new Error(`${what}: expected 8, got ${list.length}`);
  return Object.fromEntries(WT_DIRS.map((d, i) => [d, [boneAnchor(list[i])]]));
};
const cuHurt = (r, what, fix = (b) => b) => {
  const list = rows(cuBlobs(...r)).flat().map(fix);
  if (list.length !== 5) throw new Error(`${what}: expected 5, got ${list.length}`);
  return mirrorEast(Object.fromEntries(DIRS.map((d, i) => [d, [boneAnchor(list[i])]])));
};
const cuSleep = (r) => cuBlobs(...r).sort((a, b) => a.x - b.x).map(boneAnchor);

const cubone = {
  idle: cuDirs(rows(cuBlobs(70, 18, 50, 195)), 2, 'cubone idle'),
  walk: cuDirs(rows(cuBlobs(135, 18, 77, 195)), 3, 'cubone walk'),
  atk: cuDirs(rows(cuBlobs(220, 15, 82, 210)), 3, 'cubone atk'),
  special: cuPairs([320, 22, 56, 100], 'cubone special'), // empty-handed throw pose
  // the SW view has its knocked-loose bone fused on top: keep just the body
  hurt: cuHurt([0, 118, 60, 127], 'cubone hurt', (b) => (b.h > 26 ? tighten(cu, { ...b, y: b.y + b.h - 21, h: 21 }) : b)),
  sleep: cuSleep([0, 62, 58, 28]),
};
// Marowak's W and E swing frames touch (the E arc reaches up): split them at y 368.
const maAtk = rows(cuBlobs(224, 268, 96, 258));
{
  const i = maAtk.findIndex((row) => row.some((b) => b.h > 40));
  const j = maAtk[i].findIndex((b) => b.h > 40), big = maAtk[i][j];
  maAtk[i][j] = tighten(cu, { ...big, h: 368 - big.y });
  maAtk[i + 1].push(tighten(cu, { ...big, y: 368, h: big.y + big.h - 368 }));
  maAtk[i + 1].sort((a, b) => a.x - b.x);
}
const marowak = {
  idle: cuDirs(rows(cuBlobs(64, 268, 56, 240)), 2, 'marowak idle'),
  walk: cuDirs(rows(cuBlobs(130, 268, 82, 240)), 3, 'marowak walk'),
  atk: cuDirs(maAtk, 3, 'marowak atk'),
  special: cuPairs([342, 272, 60, 130], 'marowak special'),
  hurt: cuHurt([0, 362, 60, 113], 'marowak hurt'),
  sleep: cuSleep([0, 312, 58, 30]),
};
// Thrown bone: one of the loose bones flying off Cubone's hurt poses.
const bone = { spin: [{ ...tighten(cu, { x: 15, y: 111, w: 17, h: 11 }) }].map((b) => ({ ...b, ax: b.w >> 1, ay: b.h >> 1 })) };

// ---- Pichu line (pichu.png): ripper layout, 8 facing rows S, N, W, E, SW, SE, NW, NE ----
// Sections: Pichu y 0-369, Pikachu 370-655 (male; the female copy below is unused),
// Raichu 942-1288 (male). Single-frame poses (attack, hurt) pack the facings as pairs.
const pi = load('pichu.png');
function elecAnchor(r) {
  const { width: W, data: d } = pi;
  let sx = 0, n = 0;
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
    const i = (y * W + x) * 4;
    if (d[i] === 0 && d[i + 1] === 128 && d[i + 2] === 128) continue;
    sx += x; n++;
  }
  return { ...r, ax: Math.round(sx / n) - r.x, ay: r.h };
}
const piBlobs = (...r) => components(pi, ...r).filter((b) => b.w >= 10 && b.h >= 10);
const piDirs = (r, n, what) => {
  const list = rows(piBlobs(...r));
  if (list.length !== 8) throw new Error(`${what}: expected 8 dir rows, got ${list.length}`);
  return Object.fromEntries(list.map((row, i) => {
    if (n && row.length !== n) throw new Error(`${what} row ${i}: expected ${n} frames, got ${row.length}`);
    return [WT_DIRS[i], row.map(elecAnchor)];
  }));
};
const piPairs = (r, what) => {
  const list = rows(piBlobs(...r)).flat();
  if (list.length !== 8) throw new Error(`${what}: expected 8, got ${list.length}`);
  return Object.fromEntries(WT_DIRS.map((d, i) => [d, [elecAnchor(list[i])]]));
};
const piSleep = (r) => piBlobs(...r).sort((a, b) => a.x - b.x).map(elecAnchor);
// Pikachu's "Idle/Attack" column: left frame of each row is idle, right is the pounce.
const piColumn = (o, i) => Object.fromEntries(Object.entries(o).map(([d, f]) => [d, [f[i]]]));

const pichu = {
  idle: piDirs([5, 70, 65, 270], 2, 'pichu idle'),
  walk: piDirs([160, 26, 70, 282], 2, 'pichu walk'),
  atk: piPairs([75, 35, 70, 128], 'pichu atk'),
  hurt: piPairs([72, 236, 70, 110], 'pichu hurt'),
  sleep: piSleep([80, 182, 60, 30]),
};
const pikaIdleAtk = piDirs([66, 405, 82, 250], 2, 'pikachu idle/atk');
const pikachu = {
  idle: piColumn(pikaIdleAtk, 0),
  atk: piColumn(pikaIdleAtk, 1),
  walk: piDirs([148, 392, 105, 260], 3, 'pikachu walk'),
  special: piDirs([270, 392, 75, 260], 2, 'pikachu special'),
  hurt: piPairs([0, 512, 65, 125], 'pikachu hurt'),
  sleep: piSleep([0, 450, 60, 30]),
};
const raichu = {
  walk: piDirs([90, 990, 120, 295], 3, 'raichu walk'),
  atk: piDirs([212, 980, 58, 280], 1, 'raichu atk'),
  special: piDirs([276, 980, 92, 295], 2, 'raichu special'),
  hurt: piPairs([5, 1130, 85, 140], 'raichu hurt'),
  sleep: piSleep([5, 1048, 80, 35]),
};

// ---- Gastly line (gastly.png): ripper layout, 5 facing rows S, N, W, SW, NW ----
// Gas wisps, Haunter's floating hands and slash arcs are loose pieces that sit between
// frames, so a plain bounding box would grab bits of the neighbours. Each loose piece is
// given to the nearest body blob, and every frame's own pixels are copied into a clean
// generated atlas (sprites/char/gastly.packed.png) that the game draws from instead.
const ga = load('gastly.png');
function ghostPieces(r) {
  const [rx, ry, rw, rh] = r;
  const { width: W, data: d } = ga;
  const fg = (x, y) => { const i = (y * W + x) * 4; return !(d[i] === 0 && d[i + 1] === 128 && d[i + 2] === 128); };
  const seen = new Uint8Array(rw * rh), out = [];
  for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
    if (seen[y * rw + x] || !fg(rx + x, ry + y)) continue;
    const c = { px: [], x0: 1e9, y0: 1e9, x1: -1, y1: -1 }, st = [[x, y]];
    seen[y * rw + x] = 1;
    while (st.length) {
      const [cx, cy] = st.pop();
      c.px.push([rx + cx, ry + cy]);
      c.x0 = Math.min(c.x0, rx + cx); c.x1 = Math.max(c.x1, rx + cx); c.y0 = Math.min(c.y0, ry + cy); c.y1 = Math.max(c.y1, ry + cy);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= rw || ny >= rh) continue;
        const k = ny * rw + nx;
        if (!seen[k] && fg(rx + nx, ry + ny)) { seen[k] = 1; st.push([nx, ny]); }
      }
    }
    c.cx = (c.x0 + c.x1) / 2; c.cy = (c.y0 + c.y1) / 2;
    out.push(c);
  }
  return out;
}
// Frames in a region as rows (top to bottom) of frames (left to right).
// minCore: pixel count that makes a blob a body; reach: loose pieces further than this are dropped (label text).
function ghostRows(r, minCore, what, reach = 26) {
  const all = ghostPieces(r);
  const cores = all.filter((c) => c.px.length >= minCore).map((c) => ({ core: c, px: [...c.px] }));
  for (const p of all) {
    if (p.px.length >= minCore) continue;
    let best = null, bd = reach;
    for (const f of cores) {
      const c = f.core, dx = Math.max(c.x0 - p.cx, 0, p.cx - c.x1), dy = Math.max(c.y0 - p.cy, 0, p.cy - c.y1);
      const dd = Math.hypot(dx, dy);
      if (dd < bd) { bd = dd; best = f; }
    }
    if (best) best.px.push(...p.px);
  }
  const list = [];
  for (const f of cores.sort((a, b) => a.core.cy - b.core.cy)) {
    const row = list.find((rw) => Math.abs(rw[0].core.cy - f.core.cy) <= 14);
    row ? row.push(f) : list.push([f]);
  }
  list.forEach((rw) => rw.sort((a, b) => a.core.cx - b.core.cx));
  if (!list.length) throw new Error(what + ': nothing found');
  return list;
}
// Packs a frame's pixels into the atlas; anchor = bottom of the body blob, x at its pixel centroid.
const GA_ATLAS = { W: 512, x: 0, y: 0, rowH: 0, items: [] };
function ghostPack(f) {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (const [x, y] of f.px) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const w = x1 - x0 + 1, h = y1 - y0 + 1, A = GA_ATLAS;
  if (A.x + w + 1 > A.W) { A.x = 0; A.y += A.rowH + 1; A.rowH = 0; }
  const at = { x: A.x, y: A.y };
  A.x += w + 1; A.rowH = Math.max(A.rowH, h);
  A.items.push({ f, x0, y0, at });
  const c = f.core, cx = Math.round(c.px.reduce((s, [x]) => s + x, 0) / c.px.length);
  return { x: at.x, y: at.y, w, h, ax: cx - x0, ay: c.y1 - y0 + 1 };
}
const gaDirs = (r, n, what, minCore = 60, reach) => {
  const list = ghostRows(r, minCore, what, reach);
  if (list.length !== 5) throw new Error(`${what}: expected 5 dir rows, got ${list.length}`);
  return Object.fromEntries(list.map((row, i) => {
    if (n && row.length !== n) throw new Error(`${what} row ${i}: expected ${n} frames, got ${row.length}`);
    return [DIRS[i], row.map(ghostPack)];
  }));
};
// One frame per facing: (S, N) side by side, then W, SW, NW stacked (hurt).
const gaSingles = (r, what, minCore = 60) => {
  const list = ghostRows(r, minCore, what).flat();
  if (list.length !== 5) throw new Error(`${what}: expected 5, got ${list.length}`);
  return Object.fromEntries(DIRS.map((d, i) => [d, [ghostPack(list[i])]]));
};
const gaSleep = (r, what) => {
  const list = ghostRows(r, 60, what).flat();
  if (list.length !== 2) throw new Error(`${what}: expected 2, got ${list.length}`);
  return list.map(ghostPack);
};

// Gastly's one 3-frame set is idle, walk and attack at once.
const gastly = {
  walk: gaDirs([85, 55, 100, 160], 3, 'gastly walk'),
  special: gaDirs([200, 25, 70, 150], 2, 'gastly lick'),
  hurt: gaSingles([0, 120, 75, 135], 'gastly hurt'),
  sleep: gaSleep([0, 65, 60, 30], 'gastly sleep'),
};
gastly.idle = gastly.walk; // the gas keeps swirling while it hovers
const haunter = {
  idle: gaDirs([75, 285, 60, 155], 2, 'haunter idle'),
  walk: gaDirs([148, 285, 90, 155], 3, 'haunter walk'),
  atk: gaDirs([252, 285, 300, 220], 7, 'haunter atk', 250, 20), // claw combo: hands + slash arcs ride along
  special: gaDirs([552, 285, 105, 150], 3, 'haunter lick'),
  hurt: gaSingles([0, 375, 70, 135], 'haunter hurt'),
  sleep: gaSleep([0, 322, 70, 35], 'haunter sleep'),
};
// Gengar's "Idle/Special Attack" set: frame 0 is idle, 1-2 the tongue coming out.
const gengar = {
  special: gaDirs([85, 555, 90, 135], 3, 'gengar idle/lick', 150),
  walk: gaDirs([190, 535, 90, 125], 3, 'gengar walk', 150),
  atk: gaDirs([288, 535, 112, 160], 3, 'gengar atk', 150),
  hurt: gaSingles([0, 632, 70, 126], 'gengar hurt', 150), // starts under the "Hurt" label
  sleep: gaSleep([0, 575, 60, 40], 'gengar sleep'),
};
gengar.idle = Object.fromEntries(Object.entries(gengar.special).map(([d, f]) => [d, [f[0]]]));
{
  const A = GA_ATLAS, out = new PNG({ width: A.W, height: A.y + A.rowH + 1 });
  for (let i = 0; i < out.data.length; i += 4) { out.data[i] = 0; out.data[i + 1] = 128; out.data[i + 2] = 128; out.data[i + 3] = 255; }
  for (const { f, x0, y0, at } of A.items) for (const [x, y] of f.px) {
    const s = (y * ga.width + x) * 4, o = ((at.y + y - y0) * A.W + at.x + x - x0) * 4;
    for (let k = 0; k < 4; k++) out.data[o + k] = ga.data[s + k];
  }
  fs.writeFileSync(path.join(ROOT, 'sprites/char/gastly.packed.png'), PNG.sync.write(out));
}

// ---- Pidgey line (pidgey.png): ripper layout, 5 facing rows S, N, W, SW, NW ----
// Sections: Pidgey y 0-187, Pidgeotto 188-411, Pidgeot 412-662. The "Special Attack"
// columns are copies of the first two attack frames, so they're skipped. The attack
// set (wings tucked, raised, spread) doubles as the flight flap.
const pg = load('pidgey.png');
function pgAnchor(r) {
  const { width: W, data: d } = pg;
  let sx = 0, n = 0;
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
    const i = (y * W + x) * 4;
    if (d[i] === 0 && d[i + 1] === 128 && d[i + 2] === 128) continue;
    sx += x; n++;
  }
  return { ...r, ax: Math.round(sx / n) - r.x, ay: r.h };
}
// Flap frames: wings up / spread change the box height, so pin the body's centre instead of
// the box bottom (keeps the bird steady mid-air while the wings beat).
const FLY_PIN = 9; // px from the body centre down to the draw point
function pgFlyAnchor(r) {
  const { width: W, data: d } = pg;
  let sx = 0, sy = 0, n = 0;
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
    const i = (y * W + x) * 4;
    if (d[i] === 0 && d[i + 1] === 128 && d[i + 2] === 128) continue;
    sx += x; sy += y; n++;
  }
  return { ...r, ax: Math.round(sx / n) - r.x, ay: Math.round(sy / n) - r.y + FLY_PIN };
}
const pgBlobs = (...r) => components(pg, ...r).filter((b) => b.w >= 10 && b.h >= 10);
const pgDirs = (r, n, what, anchor = pgAnchor) => {
  const list = rows(pgBlobs(...r));
  if (list.length !== 5) throw new Error(`${what}: expected 5 dir rows, got ${list.length}`);
  return Object.fromEntries(list.map((row, i) => {
    if (n && row.length !== n) throw new Error(`${what} row ${i}: expected ${n} frames, got ${row.length}`);
    return [DIRS[i], row.map(anchor)];
  }));
};
// One frame per facing: (S, N) side by side, then W, SW, NW stacked.
const pgSingles = (r, what) => {
  const list = rows(pgBlobs(...r)).flat();
  if (list.length !== 5) throw new Error(`${what}: expected 5, got ${list.length}`);
  return Object.fromEntries(DIRS.map((d, i) => [d, [pgAnchor(list[i])]]));
};
const pgSleep = (r) => pgBlobs(...r).sort((a, b) => a.x - b.x).map(pgAnchor);

const pidgey = {
  idle: pgDirs([62, 18, 45, 108], 2, 'pidgey idle'),
  walk: pgDirs([118, 18, 65, 108], 3, 'pidgey walk'),
  atk: pgDirs([198, 20, 75, 112], 3, 'pidgey atk', pgFlyAnchor),
  hurt: pgSingles([5, 102, 45, 82], 'pidgey hurt'),
  sleep: pgSleep([5, 64, 45, 20]),
};
const pidgeotto = {
  idle: pgSingles([70, 208, 35, 102], 'pidgeotto idle'),
  walk: pgDirs([118, 208, 80, 125], 3, 'pidgeotto walk'),
  atk: pgDirs([212, 208, 85, 130], 3, 'pidgeotto atk', pgFlyAnchor),
  hurt: pgSingles([0, 290, 60, 105], 'pidgeotto hurt'), // starts under the "Hurt" label
  sleep: pgSleep([0, 255, 55, 20]),
};
const pidgeot = {
  idle: pgSingles([85, 432, 40, 110], 'pidgeot idle'),
  walk: pgDirs([135, 432, 85, 135], 3, 'pidgeot walk'),
  atk: pgDirs([228, 432, 90, 140], 3, 'pidgeot atk', pgFlyAnchor),
  hurt: pgSingles([0, 520, 75, 140], 'pidgeot hurt'), // under the label, above the bottom border
  sleep: pgSleep([0, 478, 55, 25]),
};

// ---- Dratini line (dratini.png): ripper layout, 5 facing rows S, N, W, SW, NW ----
// Sections: Dratini y 0-232, Dragonair 234-492, Dragonite 494+. Serpent poses vary a lot in
// height (Dragonair's 4th attack frame is a full-length lunge), so rows are grouped by box
// centre instead of box top.
const dr = load('dratini.png');
function drAnchor(r) {
  const { width: W, data: d } = dr;
  let sx = 0, n = 0;
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
    const i = (y * W + x) * 4;
    if (d[i] === 0 && d[i + 1] === 128 && d[i + 2] === 128) continue;
    sx += x; n++;
  }
  return { ...r, ax: Math.round(sx / n) - r.x, ay: r.h };
}
// Throws if a sprite touches the edge of its region (the region is clipping it).
const drBlobs = (rx, ry, rw, rh) => components(dr, rx, ry, rw, rh).filter((b) => b.w >= 10 && b.h >= 10).map((b) => {
  if (b.x === rx || b.y === ry || b.x + b.w === rx + rw || b.y + b.h === ry + rh) throw new Error(`dratini.png: sprite at ${b.x},${b.y} is clipped by region ${[rx, ry, rw, rh]}`);
  return b;
});
function centreRows(boxes, tol = 14) {
  const cy = (b) => b.y + b.h / 2;
  boxes.sort((a, b) => cy(a) - cy(b));
  const out = [];
  for (const b of boxes) {
    const row = out.find((r) => Math.abs(cy(r[0]) - cy(b)) <= tol);
    row ? row.push(b) : out.push([b]);
  }
  out.forEach((r) => r.sort((a, b) => a.x - b.x));
  return out;
}
const drDirs = (r, n, what) => {
  const list = centreRows(drBlobs(...r));
  if (list.length !== 5) throw new Error(`${what}: expected 5 dir rows, got ${list.length}`);
  return Object.fromEntries(list.map((row, i) => {
    if (n && row.length !== n) throw new Error(`${what} row ${i}: expected ${n} frames, got ${row.length}`);
    return [DIRS[i], row.map(drAnchor)];
  }));
};
// One frame per facing: (S, N) side by side, then W, SW, NW stacked.
const drSingles = (r, what) => {
  const list = rows(drBlobs(...r)).flat();
  if (list.length !== 5) throw new Error(`${what}: expected 5, got ${list.length}`);
  return Object.fromEntries(DIRS.map((d, i) => [d, [drAnchor(list[i])]]));
};
const drSleep = (r) => drBlobs(...r).sort((a, b) => a.x - b.x).map(drAnchor);

const dratini = {
  walk: drDirs([68, 38, 80, 136], 3, 'dratini walk'),
  atk: drDirs([152, 20, 54, 140], 2, 'dratini atk'),
  special: drDirs([235, 20, 65, 150], 2, 'dratini special'),
  hurt: drSingles([0, 108, 52, 122], 'dratini hurt'),
  sleep: drSleep([0, 62, 48, 26]),
};
const dragonair = {
  walk: drDirs([66, 268, 124, 192], 3, 'dragonair walk'),
  atk: drDirs([190, 255, 190, 236], 4, 'dragonair atk'), // frame 3 = full-length lunge
  special: drDirs([395, 255, 100, 214], 2, 'dragonair special'),
  hurt: drSingles([0, 352, 62, 140], 'dragonair hurt'),
  sleep: drSleep([0, 296, 56, 40]),
};
const dragonite = {
  idle: drDirs([84, 515, 94, 188], 3, 'dragonite idle'),
  walk: drDirs([193, 515, 94, 188], 3, 'dragonite walk'),
  atk: drDirs([298, 515, 98, 188], 3, 'dragonite atk'), // frame 2 = forward lunge
  special: drSingles([415, 515, 70, 140], 'dragonite special'),
  hurt: drSingles([0, 615, 70, 155], 'dragonite hurt'),
  sleep: drSleep([0, 560, 64, 38]),
};

// ---- Abra line (abra.png): ripper layout ----
// Sections: Abra y 0-212, Kadabra 214-462, Alakazam 464+. All 5 facings S, N, W, SW, NW (east mirrored).
const ab = load('abra.png');
function abAnchor(r) {
  const { width: W, data: d } = ab;
  let sx = 0, n = 0;
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
    const i = (y * W + x) * 4;
    if (d[i] === 0 && d[i + 1] === 128 && d[i + 2] === 128) continue;
    sx += x; n++;
  }
  return { ...r, ax: Math.round(sx / n) - r.x, ay: r.h };
}
// Throws if a sprite touches the edge of its region (the region is clipping it).
const abBlobs = (rx, ry, rw, rh) => components(ab, rx, ry, rw, rh).filter((b) => b.w >= 10 && b.h >= 10).map((b) => {
  if (b.x === rx || b.y === ry || b.x + b.w === rx + rw || b.y + b.h === ry + rh) throw new Error(`abra.png: sprite at ${b.x},${b.y} is clipped by region ${[rx, ry, rw, rh]}`);
  return b;
});
const abDirs = (r, n, what, dirs = DIRS) => {
  const list = centreRows(abBlobs(...r));
  if (list.length !== dirs.length) throw new Error(`${what}: expected ${dirs.length} dir rows, got ${list.length}`);
  return Object.fromEntries(list.map((row, i) => {
    if (n && row.length !== n) throw new Error(`${what} row ${i}: expected ${n} frames, got ${row.length}`);
    return [dirs[i], row.map(abAnchor)];
  }));
};
// One frame per facing, read left to right, top to bottom: (S, N), then W, SW, NW stacked.
const abSingles = (r, what, dirs = DIRS) => {
  const list = centreRows(abBlobs(...r)).flat();
  if (list.length !== dirs.length) throw new Error(`${what}: expected ${dirs.length}, got ${list.length}`);
  return Object.fromEntries(dirs.map((d, i) => [d, [abAnchor(list[i])]]));
};
const abSleep = (r) => abBlobs(...r).sort((a, b) => a.x - b.x).map(abAnchor);

const abra = {
  idle: abSingles([58, 16, 52, 104], 'abra idle'),
  walk: abDirs([115, 16, 76, 134], 3, 'abra walk'),
  atk: abDirs([195, 16, 78, 134], 3, 'abra atk'),
  special: abDirs([292, 20, 56, 138], 2, 'abra special'),
  hurt: abSingles([0, 104, 56, 106], 'abra hurt'),
  sleep: abSleep([0, 58, 56, 32]),
};
// Kadabra's walk + attack have 8 rows, but rows 4, 6 and 8 repeat the W, SW and NW facings,
// so only rows 1, 2, 3, 5, 7 are used. Idle + special are packed two to a row: (S, N), then
// two frames each for W, SW and NW.
const KD_ROWS = [0, 1, 2, 4, 6];
const kdRows = (r, n, what) => {
  const list = centreRows(abBlobs(...r));
  if (list.length !== 8) throw new Error(what + ': expected 8 rows, got ' + list.length);
  return Object.fromEntries(KD_ROWS.map((row, i) => {
    if (list[row].length !== n) throw new Error(what + ' row ' + row + ': expected ' + n + ' frames, got ' + list[row].length);
    return [DIRS[i], list[row].map(abAnchor)];
  }));
};
const kdPairs = (r, what) => {
  const rowsList = centreRows(abBlobs(...r));
  if (rowsList.length !== 4 || rowsList.some((row) => row.length !== 2)) throw new Error(what + ': expected 4 rows of 2');
  const [[s, n], ...side] = rowsList.map((row) => row.map(abAnchor));
  return { S: [s, s], N: [n, n], W: side[0], SW: side[1], NW: side[2] };
};
const kadabra = {
  idle: kdPairs([70, 230, 72, 128], 'kadabra idle'),
  walk: kdRows([144, 230, 92, 234], 3, 'kadabra walk'),
  atk: kdRows([244, 230, 68, 234], 2, 'kadabra atk'),
  special: kdPairs([328, 230, 64, 112], 'kadabra special'),
  hurt: abSingles([0, 320, 70, 142], 'kadabra hurt'),
  sleep: abSleep([0, 274, 62, 36]),
};
const alakazam = {
  idle: abSingles([76, 484, 74, 112], 'alakazam idle'),
  walk: abDirs([154, 484, 88, 148], 3, 'alakazam walk'),
  atk: abDirs([248, 484, 64, 148], 2, 'alakazam atk'),
  special: abDirs([334, 486, 56, 144], 2, 'alakazam special'),
  hurt: abSingles([0, 576, 76, 124], 'alakazam hurt'),
  sleep: abSleep([0, 528, 56, 36]),
};

// ---- Rock FX (rock.png, Rock Throw / Rock Slide rows) ----
const ro = load('rock.png');
const rockRow = (r) => components(ro, ...r, 4).filter((b) => b.w >= 5).sort((a, b) => a.x - b.x).map((b) => ({ ...b, ax: b.w >> 1, ay: b.h >> 1 }));
const rock = {
  big: rockRow([0, 476, 100, 15]), // jagged boulders
  round: rockRow([0, 496, 100, 14]),
  shard: rockRow([0, 512, 50, 13]),
};

// ---- Poison FX (poison 2.png) + sun orb (sunny.png) ----
const po = load('poison 2.png');
const fx = (img, r, minW = 0) => components(img, ...r, 4).filter((b) => b.w >= minW).sort((a, b) => a.x - b.x).map(centered);
const centered = (b) => ({ ...b, ax: b.w >> 1, ay: b.h >> 1 });
const poison = {
  skull: fx(po, [615, 695, 130, 25]),
  gas: fx(po, [10, 818, 420, 62]), // puff growing
  gunk: fx(po, [120, 258, 100, 40]), // sludge ball
  bubbles: fx(po, [100, 1180, 240, 25], 12), // rising toxic bubbles
  powder: fx(po, [140, 1090, 430, 50], 19), // powder sparkle clusters
  sludge: fx(po, [495, 420, 40, 20]),
};
const su = load('sunny.png');
const sun = { orb: components(su, 410, 490, 45, 45, 4).map(centered) };

// ---- Fire FX ----
const fi = load('fire.png');
const fire = {
  ember: components(fi, 605, 178, 115, 25).sort((a, b) => a.x - b.x).map(centered),
  wheel: components(fi, 0, 858, 340, 35).filter((b) => b.w > 20).sort((a, b) => a.x - b.x).map(centered),
  burst: components(fi, 340, 835, 390, 58).sort((a, b) => a.x - b.x).map(centered),
};

// ---- Dragon FX (dragon moves.png) ----
const dg = load('dragon moves.png');
// Bounding box of everything inside a hand-picked rect (explosions are clusters of loose bits).
function hull(img, [x, y, w, h]) {
  const { width: W, data: d } = img;
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
    const k = (j * W + i) * 4;
    if (d[k] === 0 && d[k + 1] === 128 && d[k + 2] === 128) continue;
    x0 = Math.min(x0, i); x1 = Math.max(x1, i); y0 = Math.min(y0, j); y1 = Math.max(y1, j);
  }
  return centered({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
}
const dragon = {
  rage: fx(dg, [130, 1484, 520, 40], 10), // orb swelling into a flame burst, then embers
  pulse: fx(dg, [90, 1205, 560, 50], 14).filter((b) => b.h >= 18), // purple orb, spinning ring
  pop: fx(dg, [255, 1414, 110, 30], 12), // pulse bursting into grey swirls
  claw: fx(dg, [40, 1555, 290, 60], 30), // purple crescent slashes
  rings: fx(dg, [90, 1120, 210, 30], 10).slice(0, 5), // Dragon Dance: blue ring widening
  meteor: [hull(dg, [176, 174, 32, 32]), hull(dg, [335, 195, 32, 32])],
  boom: [[85, 345, 62, 62], [230, 342, 74, 66], [376, 326, 97, 93], [494, 323, 100, 95], [600, 323, 108, 95],
    [8, 428, 108, 76], [124, 428, 112, 76], [244, 430, 100, 72], [352, 440, 88, 66], [444, 448, 52, 50]].map((r) => hull(dg, r)),
};

// ---- Tiles: 24px cells on a 25px pitch, origin (9,163) ----
const tile = (c, r) => ({ x: 9 + 25 * c, y: 163 + 25 * r, w: 24, h: 24 });
const nine = (c0, r0) => [0, 1, 2].map((r) => [0, 1, 2].map((c) => tile(c0 + c, r0 + r)));
const tiles = {
  stone: nine(3, 0),
  stoneAlt: nine(6, 0),
  cracked: nine(9, 0),
  ground: nine(12, 0),
  water: nine(21, 0),
  groundDeco: [tile(16, 1), tile(19, 1)],
  face: [tile(3, 20), tile(4, 20)],
  faceArch: [tile(6, 20), tile(7, 20)],
};

const report = (o, p = '') => Object.entries(o).forEach(([k, v]) =>
  Array.isArray(v) ? console.log(`${p}${k}: ${v.length}`) : report(v, p + k + '.'));
report({ charmander, charmeleon, charizard, bulbasaur, ivysaur, venusaur, squirtle, wartortle, blastoise, geodude, graveler, golem, cubone, marowak, bone, pichu, pikachu, raichu, gastly, haunter, gengar, pidgey, pidgeotto, pidgeot, dratini, dragonair, dragonite, dragon, abra, kadabra, alakazam, fire, poison, sun, rock });

const out = `// Generated by tools/slice.js — do not edit by hand.
export const CHARMANDER = ${JSON.stringify(charmander)};
export const CHARMELEON = ${JSON.stringify(charmeleon)};
export const CHARIZARD = ${JSON.stringify(charizard)};
export const BULBASAUR = ${JSON.stringify(bulbasaur)};
export const IVYSAUR = ${JSON.stringify(ivysaur)};
export const VENUSAUR = ${JSON.stringify(venusaur)};
export const SQUIRTLE = ${JSON.stringify(squirtle)};
export const WARTORTLE = ${JSON.stringify(wartortle)};
export const BLASTOISE = ${JSON.stringify(blastoise)};
export const GEODUDE = ${JSON.stringify(geodude)};
export const GRAVELER = ${JSON.stringify(graveler)};
export const GOLEM = ${JSON.stringify(golem)};
export const CUBONE = ${JSON.stringify(cubone)};
export const MAROWAK = ${JSON.stringify(marowak)};
export const BONE = ${JSON.stringify(bone)};
export const PICHU = ${JSON.stringify(pichu)};
export const PIKACHU = ${JSON.stringify(pikachu)};
export const RAICHU = ${JSON.stringify(raichu)};
export const GASTLY = ${JSON.stringify(gastly)};
export const HAUNTER = ${JSON.stringify(haunter)};
export const GENGAR = ${JSON.stringify(gengar)};
export const PIDGEY = ${JSON.stringify(pidgey)};
export const PIDGEOTTO = ${JSON.stringify(pidgeotto)};
export const PIDGEOT = ${JSON.stringify(pidgeot)};
export const DRATINI = ${JSON.stringify(dratini)};
export const DRAGONAIR = ${JSON.stringify(dragonair)};
export const DRAGONITE = ${JSON.stringify(dragonite)};
export const DRAGON = ${JSON.stringify(dragon)};
export const ABRA = ${JSON.stringify(abra)};
export const KADABRA = ${JSON.stringify(kadabra)};
export const ALAKAZAM = ${JSON.stringify(alakazam)};
export const ROCK = ${JSON.stringify(rock)};
export const FIRE = ${JSON.stringify(fire)};
export const POISON = ${JSON.stringify(poison)};
export const SUN = ${JSON.stringify(sun)};
export const TILES = ${JSON.stringify(tiles)};
`;
fs.writeFileSync(path.join(ROOT, 'src', 'frames.js'), out);
console.log('wrote src/frames.js');
