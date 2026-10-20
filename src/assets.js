// Loads the sprite sheets, keys out the teal ripper background, and builds
// derived sheets: white silhouettes (hit glow) and a hue-shifted rival palette.

const KEY = [0, 128, 128];

// Sheets live in sprites/: monsters + portraits in char/, move FX in attacks/.
const CHAR_FILES = new Set(['charmander.png', 'bulbasaur.png', 'squirtle.png', 'geodude.png', 'cubone.png', 'pichu.png', 'gastly.png', 'gastly.packed.png', 'pidgey.png', 'dratini.png', 'abra.png', 'protraits.png']);
export const spritePath = (f) => (f === 'tile.png' ? 'sprites/' : CHAR_FILES.has(f) ? 'sprites/char/' : 'sprites/attacks/') + f;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('failed to load ' + src));
    img.src = spritePath(src);
  });
}

function toCanvas(img) {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  c.getContext('2d').drawImage(img, 0, 0);
  return c;
}

function mapPixels(src, fn) {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(src, 0, 0);
  const id = ctx.getImageData(0, 0, c.width, c.height);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) fn(d, i);
  ctx.putImageData(id, 0, 0);
  return c;
}

const keyed = (img, keys = [KEY]) => mapPixels(toCanvas(img), (d, i) => {
  if (keys.some((k) => d[i] === k[0] && d[i + 1] === k[1] && d[i + 2] === k[2])) d[i + 3] = 0;
});

const silhouette = (src, [r, g, b] = [255, 255, 255]) => mapPixels(src, (d, i) => {
  if (d[i + 3]) { d[i] = r; d[i + 1] = g; d[i + 2] = b; }
});

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb(h, s, l) {
  const f = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255];
}

// Rotates hue of saturated pixels only, so black outlines and white highlights stay put.
const hueShift = (src, deg) => mapPixels(src, (d, i) => {
  if (!d[i + 3]) return;
  const [h, s, l] = rgbToHsl(d[i], d[i + 1], d[i + 2]);
  if (s < 0.2) return;
  const [r, g, b] = hslToRgb((h + deg / 360) % 1, s, l);
  d[i] = r; d[i + 1] = g; d[i + 2] = b;
});

// Rock rival palette: grey stone turns rusty red-brown, Golem's orange hide shifts redder.
// Black outlines and white highlights stay put.
const rust = (src) => mapPixels(src, (d, i) => {
  if (!d[i + 3]) return;
  const [h, s, l] = rgbToHsl(d[i], d[i + 1], d[i + 2]);
  if (l < 0.12 || l > 0.93) return;
  const [r, g, b] = s < 0.2 ? hslToRgb(0.03, 0.42, l * 0.92) : hslToRgb((h + 1 - 25 / 360) % 1, s, l);
  d[i] = r; d[i + 1] = g; d[i + 2] = b;
});

// Dragon rival palette (shiny-style): blue/purple turns pink, orange hide turns green.
const shiny = (src) => mapPixels(src, (d, i) => {
  if (!d[i + 3]) return;
  const [h, s, l] = rgbToHsl(d[i], d[i + 1], d[i + 2]);
  if (s < 0.2) return;
  const deg = h * 360;
  if (!((deg >= 170 && deg <= 290) || deg <= 60 || deg >= 345)) return;
  const [r, g, b] = hslToRgb((h + 70 / 360) % 1, s, l);
  d[i] = r; d[i + 1] = g; d[i + 2] = b;
});

// Tiny pixel-art sprites for grass + water effects (no FX sheets for those yet).
// d = dark, g = mid, l = light; one string per row, '.' = empty.
const PIXEL_ART = {
  leaf: { rows: ['..dddd..', '.dggggdd', 'dglllggd', '.dddddd.'], cols: { d: '#2f7a22', g: '#58c23a', l: '#a8f070' } },
  petal: { rows: ['.dd..', 'dggd.', 'dgggd', '.ddd.'], cols: { d: '#b8264a', g: '#ff7aa0' } },
  seed: { rows: ['.l.', 'dgd', 'ggg', 'dgd', '.d.'], cols: { d: '#5a3a1a', g: '#9c6a32', l: '#7bd94a' } },
  drop: { rows: ['..d..', '.dgd.', 'dglgd', 'dgggd', '.ddd.'], cols: { d: '#1d5fb8', g: '#4cb6ff', l: '#e8f8ff' } },
  bubble: { rows: ['.ddd.', 'dl..d', 'd...d', 'd...d', '.ddd.'], cols: { d: '#7fd4ff', l: '#ffffff' } },
  // Bone Spike Lane: a bone tip bursting out of the ground
  // electric charge sparks + the Static status icon: a little zigzag bolt
  spark: { rows: ['...yw', '..yw.', '.ywww', '..wy.', '.wy..', 'wy...'], cols: { y: '#ffd21a', w: '#fffbe0' } },
  // ghost charge wisps + the Curse status icon: a little purple will-o'-wisp
  wisp: { rows: ['..d..', '.dl..', '.dld.', 'dlgld', 'dgggd', '.ddd.'], cols: { d: '#4a2a7a', l: '#f0e0ff', g: '#b070ff' } },
  // Shadow Hand / Nightmare: a clawed shadow hand
  hand: { rows: ['d.d.d', 'gdgdg', 'ggggg', 'ggggd', '.ggd.', '.dd..'], cols: { d: '#2a1040', g: '#8a50d0' } },
  // flying charge visuals: a little tumbling feather
  feather: { rows: ['...dl', '..dll', '.dll.', 'dll..', 'd....'], cols: { d: '#a08060', l: '#fff4e0' } },
  // dragon charge visuals + the Fury status icon: a little purple-blue dragon scale
  scale: { rows: ['..d..', '.dld.', 'dlggd', 'dgggd', '.dgd.', '..d..'], cols: { d: '#3a2a8a', l: '#e0d8ff', g: '#7a6aff' } },
  // psychic charge visuals + the Mind Lock status icon: a little pink four-point sparkle
  psy: { rows: ['..w..', '..p..', 'wpPpw', '..p..', '..w..'], cols: { w: '#ffe0f8', p: '#ff70d8', P: '#ffffff' } },
  spike: { rows: ['...d...', '..dld..', '..dld..', '.dlgld.', '.dlgld.', 'dllglld', 'dlgggld', 'dlgggld', '.ddddd.'], cols: { d: '#4a3a2c', l: '#ffffff', g: '#d8d0c0' } },
};

function pixelArt({ rows, cols }) {
  const c = document.createElement('canvas');
  c.width = rows[0].length;
  c.height = rows.length;
  const ctx = c.getContext('2d');
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    ctx.fillStyle = cols[ch];
    ctx.fillRect(x, y, 1, 1);
  }));
  return c;
}

// Per element: charge glow colour + tint for us (red team) and the rival (blue team).
const ELEMENT = {
  fire: { red: { glow: [255, 140, 30], tint: '#ff7a1a' }, blue: { glow: [60, 150, 255], tint: '#3a8bff' } },
  grass: { red: { glow: [120, 255, 70], tint: '#5dff3a' }, blue: { glow: [255, 90, 220], tint: '#ff4fd8' } },
  water: { red: { glow: [90, 210, 255], tint: '#3ac8ff' }, blue: { glow: [255, 200, 80], tint: '#ffc23a' } },
  rock: { red: { glow: [215, 180, 120], tint: '#d8b070' }, blue: { glow: [235, 110, 70], tint: '#e0683a' } },
  ground: { red: { glow: [240, 205, 150], tint: '#e8b878' }, blue: { glow: [120, 190, 255], tint: '#6ab4ff' } },
  ghost: { red: { glow: [190, 120, 255], tint: '#b070ff' }, blue: { glow: [110, 255, 150], tint: '#5dff8a' } },
  flying: { red: { glow: [235, 245, 255], tint: '#d8ecff' }, blue: { glow: [255, 190, 230], tint: '#ffb0dc' } },
  dragon: { red: { glow: [150, 120, 255], tint: '#8a70ff' }, blue: { glow: [255, 130, 210], tint: '#ff78c8' } },
  psychic: { red: { glow: [255, 120, 220], tint: '#ff70d8' }, blue: { glow: [90, 220, 255], tint: '#5ad8ff' } },
  electric: { red: { glow: [255, 235, 70], tint: '#ffe23a' }, blue: { glow: [180, 130, 255], tint: '#a878ff' } },
};

const RIVAL_HUE = 205;
const SHEETS = { charmander: 'charmander.png', bulbasaur: 'bulbasaur.png', squirtle: 'squirtle.png', geodude: 'geodude.png', cubone: 'cubone.png', pichu: 'pichu.png', gastly: 'gastly.packed.png', pidgey: 'pidgey.png', dratini: 'dratini.png', abra: 'abra.png' };
// bulbasaur.png: teal cell backgrounds + magenta grid lines
const SHEET_KEYS = { 'bulbasaur.png': [[0, 127, 151], [0, 103, 111], [255, 0, 255]] };

export async function loadAssets() {
  const files = [...new Set([...Object.values(SHEETS), 'fire.png', 'tile.png', 'poison 2.png', 'sunny.png', 'rock.png', 'dragon moves.png'])];
  const img = Object.fromEntries(await Promise.all(files.map(async (f) => [f, await loadImage(f)])));
  const fire = keyed(img['fire.png']);
  const fx = {
    red: { fire, ...Object.fromEntries(Object.entries(PIXEL_ART).map(([k, v]) => [k, pixelArt(v)])) },
  };
  fx.blue = Object.fromEntries(Object.entries(fx.red).map(([k, v]) => [k, hueShift(v, RIVAL_HUE)]));
  // boulders: grey for us, rusty for the rival (a hue shift does nothing to grey)
  fx.red.rock = keyed(img['rock.png']);
  fx.blue.rock = rust(fx.red.rock);
  fx.red.dragon = keyed(img['dragon moves.png']);
  fx.blue.dragon = shiny(fx.red.dragon);
  const shared = { soakIcon: pixelArt(PIXEL_ART.drop), staticIcon: pixelArt(PIXEL_ART.spark), curseIcon: pixelArt(PIXEL_ART.wisp), furyIcon: pixelArt(PIXEL_ART.scale), mindIcon: pixelArt(PIXEL_ART.psy), poison: keyed(img['poison 2.png']), sun: keyed(img['sunny.png'], [[60, 60, 90], [75, 75, 105], [90, 90, 120]]) };
  const bodies = {};
  const cache = new Map();
  return {
    tiles: keyed(img['tile.png']),
    // One look per (sheet, element, team), built on first use.
    skin(sheet, element, team) {
      const id = `${sheet}/${element}/${team}`;
      if (cache.has(id)) return cache.get(id);
      const file = SHEETS[sheet];
      bodies[file] ??= keyed(img[file], SHEET_KEYS[file]);
      const body = team !== 'blue' ? bodies[file] : element === 'rock' ? rust(bodies[file]) : element === 'dragon' ? shiny(bodies[file]) : hueShift(bodies[file], RIVAL_HUE);
      const { glow, tint } = ELEMENT[element][team];
      const skin = { team, body, white: silhouette(body), glow: silhouette(body, glow), para: silhouette(body, [255, 240, 90]), tint, ...fx[team], ...shared };
      cache.set(id, skin);
      return skin;
    },
  };
}
