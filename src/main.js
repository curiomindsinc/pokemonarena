import { loadAssets, spritePath } from './assets.js';
import { Arena, TILE } from './map.js';
import { Fighter } from './fighter.js';
import { SPECIES, SLOTS } from './species.js';
import { MOVES } from './moves.js';
import { World } from './world.js';
import { PlayerInput } from './input.js';
import { RivalAI, DIFFICULTY } from './ai.js';

const PIXEL = 2; // backing-store pixels per logical pixel (keeps text crisp)
const VIEW = { w: 22 * TILE, h: 15 * TILE }; // camera window into the bigger arena
const CAM_MARGIN = 60; // player is always at least this far inside the view

const $ = (s) => document.querySelector(s);

async function boot() {
  const assets = await loadAssets();
  const arena = new Arena();
  const world = new World(arena, assets);

  const canvas = $('#game');
  canvas.width = VIEW.w * PIXEL;
  canvas.height = VIEW.h * PIXEL;
  const cam = { x: 0, y: 0 };
  const ctx = canvas.getContext('2d');

  const at = (c, r) => [c * TILE + TILE / 2, r * TILE + TILE / 2 + 4];
  const [px, py] = at(11, 11);
  const [rx, ry] = at(24, 11);
  const player = new Fighter({ name: 'YOU', team: 'red', species: 'charmander', x: px, y: py, world });
  const rival = new Fighter({ name: 'RIVAL', team: 'blue', species: 'charmander', x: rx, y: ry, world });
  player.markerColor = '#ff7b54';
  rival.markerColor = '#5ab8ff';
  rival.face = Math.PI;
  world.fighters = [player, rival];

  const input = new PlayerInput(canvas, VIEW.w, VIEW.h);
  input.cam = cam;
  const ai = new RivalAI(rival, player, world);
  window.__arena = { world, player, rival, ai, cam }; // debug/test hook

  const hud = makeHud();
  let started = false;
  let over = null; // {winner, t}
  let slow = 0;

  // difficulty picker (start + result screens share the choice)
  let difficulty = 'normal';
  try { difficulty = DIFFICULTY[localStorage.getItem('arena.difficulty')] ? localStorage.getItem('arena.difficulty') : 'normal'; } catch {}
  function setDifficulty(name) {
    difficulty = name;
    ai.setDifficulty(name);
    try { localStorage.setItem('arena.difficulty', name); } catch {}
    for (const b of document.querySelectorAll('[data-diff]')) b.setAttribute('aria-pressed', String(b.dataset.diff === name));
    $('#diff-r').textContent = DIFFICULTY[name].label.toUpperCase();
  }
  for (const b of document.querySelectorAll('[data-diff]')) b.addEventListener('click', () => setDifficulty(b.dataset.diff));
  setDifficulty(difficulty);

  // monster pick (remembered); the rival can be Random, rerolled every match
  const load = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  const pick = { p: load('arena.p', 'charmander'), r: load('arena.r', 'charmander') };
  if (!SPECIES[pick.p]) pick.p = 'charmander';
  if (!SPECIES[pick.r] && pick.r !== 'random') pick.r = 'charmander';
  // One shared roster: pick your monster first, then the same grid picks the rival
  // (Random only offered for the rival). The two cards on top jump back to either step.
  let step = 'p';
  const monHtml = (id) => {
    const sp = SPECIES[id];
    return sp
      ? `<span class="mon" data-id="${id}" style="background-image:url('${spritePath(sp.portrait[0])}');background-position:-${sp.portrait[1]}px -${sp.portrait[2]}px"></span>`
      : '<span class="mon random">?</span>';
  };
  buildRoster();
  for (const card of document.querySelectorAll('.pickcard')) card.addEventListener('click', () => { step = card.dataset.side; applyPicks(); });

  // a column per evolution line, a row per stage; Random fills the first gap
  function buildRoster() {
    const box = $('#roster'), lines = [];
    for (const id of Object.keys(SPECIES)) {
      let col = lines.find((l) => l.line === SPECIES[id].line);
      if (!col) lines.push((col = { line: SPECIES[id].line, ids: [] }));
      col.ids.push(id);
    }
    const rows = Math.max(...lines.map((l) => l.ids.length));
    box.style.gridTemplateColumns = `repeat(${lines.length}, auto)`;
    const gap = lines.findIndex((l) => l.ids.length < rows);
    const add = (id, c, r) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.id = id;
      b.style.gridColumn = c + 1;
      b.style.gridRow = r + 1;
      b.innerHTML = monHtml(id) + (SPECIES[id]?.name ?? 'Random');
      b.addEventListener('click', () => {
        pick[step] = id;
        save('arena.' + step, id);
        if (step === 'p') step = 'r'; // on to the rival
        applyPicks();
      });
      box.append(b);
    };
    lines.forEach((l, c) => l.ids.forEach((id, r) => add(id, c, r)));
    if (gap >= 0) add('random', gap, lines[gap].ids.length);
    else add('random', lines.length, 0);
  }

  function applyPicks() {
    const box = $('#roster');
    box.classList.toggle('rival-tint', step === 'r');
    for (const b of box.children) {
      b.setAttribute('aria-pressed', String(b.dataset.id === pick[step]));
      b.classList.toggle('pick-p', b.dataset.id === pick.p);
      b.classList.toggle('pick-r', b.dataset.id === pick.r);
      b.disabled = b.dataset.id === 'random' && step === 'p';
    }
    for (const side of ['p', 'r']) {
      const card = $('.pickcard.' + side);
      card.classList.toggle('active', step === side);
      card.querySelector('.slot-mon').innerHTML = monHtml(pick[side]);
      card.querySelector('.nm').textContent = SPECIES[pick[side]]?.name ?? 'Random';
    }
    $('#pick-step').className = 'step ' + step;
    $('#pick-step').innerHTML = step === 'p' ? 'Choose <b>your</b> monster' : 'Choose the <b>rival</b> — or click YOU to change yours';
    player.setSpecies(pick.p);
    const ids = Object.keys(SPECIES);
    rival.setSpecies(pick.r === 'random' ? ids[Math.floor(Math.random() * ids.length)] : pick.r);
    rival.face = Math.PI;
    showKit();
  }

  // name plates, move slots and the controls list follow the picked monsters
  function showKit() {
    $('#name-p').textContent = player.sp.name.toUpperCase();
    $('#name-r').textContent = 'RIVAL ' + rival.sp.name.toUpperCase();
    for (const slot of SLOTS) $(`[data-move="${slot}"] .n`).textContent = MOVES[player.sp.kit[slot]].name;
    const row = (k, txt) => `<kbd>${k}</kbd><span>${txt}</span>`;
    const mv = (slot) => {
      const m = MOVES[player.sp.kit[slot]];
      return `${m.name} <span class="role">— ${m.desc}</span>`;
    };
    $('#keys').innerHTML = [
      row('WASD', `Move — ${player.sp.name} (${player.sp.role}) faces the cursor`),
      row('LMB', mv('light')), row('RMB', mv('heavy')), row('LMB + RMB', mv('special')),
      row('SHIFT', 'Dash'), row('SPACE', 'Jump (dodges). Move into a ledge + jump to hop tiers'), row('R', 'Restart'),
    ].join('');
    hud.reset(player, rival);
  }
  applyPicks();
  updateCamera(0, true);

  $('#start .btn').addEventListener('click', () => {
    restart();
    started = true;
    $('#start').hidden = true;
  });
  $('#rematch').addEventListener('click', () => restart());
  $('#change').addEventListener('click', () => {
    started = false;
    $('#result').hidden = true;
    $('#start').hidden = false;
    step = 'p';
    applyPicks();
  });

  function restart() {
    if (pick.r === 'random') applyPicks();
    world.clear();
    player.reset();
    rival.reset();
    rival.face = Math.PI;
    ai.reset();
    over = null;
    slow = 0;
    $('#result').hidden = true;
    updateCamera(0, true);
  }

  // Follows the midpoint of the two fighters, but never lets the player leave the view.
  function updateCamera(dt, snap = false) {
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    let tx = (player.x + rival.x) / 2 - VIEW.w / 2;
    let ty = (player.y + rival.y) / 2 - 10 - VIEW.h / 2;
    tx = clamp(tx, player.x - VIEW.w + CAM_MARGIN, player.x - CAM_MARGIN);
    ty = clamp(ty, player.y - VIEW.h + CAM_MARGIN, player.y - CAM_MARGIN);
    tx = clamp(tx, 0, arena.width - VIEW.w);
    ty = clamp(ty, 0, arena.height - VIEW.h);
    const k = snap ? 1 : Math.min(1, dt * 6);
    cam.x += (tx - cam.x) * k;
    cam.y += (ty - cam.y) * k;
  }

  let last = performance.now();
  function frame(now) {
    const realDt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (input.takeRestart() && started) restart();

    // brief slow-motion after a K.O.
    if (slow > 0) slow -= realDt;
    const dt = slow > 0 ? realDt * 0.3 : realDt;

    if (started) {
      player.prevX = player.x;
      player.prevY = player.y;
      const pi = input.read(dt, player);
      if (pi.move && input.queuedAt === input.time && !player.ready(pi.move)) {
        hud.deny(pi.move);
        if (player.lockT > 0 && player.cd[pi.move] > 0) world.mindFizzle(player); // frozen by Mind Lock
      }
      if (player.update(dt, pi)) input.consumed();
      rival.update(dt, ai.update(dt));
      world.update(dt);

      if (!over && (player.ko || rival.ko)) {
        over = { winner: player.ko ? rival : player, t: 0 };
        slow = 0.8;
      }
      if (over) {
        over.t += realDt;
        if (over.t > 1.1 && $('#result').hidden) showResult(over.winner === player, player, rival);
      }
    }

    updateCamera(realDt);
    const cx = Math.round(cam.x), cy = Math.round(cam.y);
    ctx.setTransform(PIXEL, 0, 0, PIXEL, -cx * PIXEL, -cy * PIXEL);
    ctx.imageSmoothingEnabled = false;
    world.draw(ctx);
    if (started && !over) drawReticle(ctx, { x: input.mouse.x + cam.x, y: input.mouse.y + cam.y }, player);
    ctx.setTransform(PIXEL, 0, 0, PIXEL, 0, 0);
    if (started) drawOffscreen(ctx, rival, cx, cy);
    hud.update(player, rival);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function showResult(won, player, rival) {
  $('#result-title').textContent = (won ? 'RIVAL ' + rival.sp.name : player.sp.name).toUpperCase() + ' FAINTED!';
  $('#result-title').className = won ? 'win' : 'lose';
  $('#result').hidden = false;
}

function drawReticle(ctx, m, player) {
  const x = Math.round(m.x), y = Math.round(m.y);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.moveTo(x - 7, y); ctx.lineTo(x - 5, y);
  ctx.moveTo(x + 5, y); ctx.lineTo(x + 7, y);
  ctx.moveTo(x, y - 7); ctx.lineTo(x, y - 5);
  ctx.moveTo(x, y + 5); ctx.lineTo(x, y + 7);
  ctx.stroke();
  // faint aim line from the mouth
  const p = player.mouth();
  ctx.strokeStyle = 'rgba(255,200,120,0.18)';
  ctx.setLineDash([2, 3]);
  ctx.beginPath();
  ctx.moveTo(p.x, p.y - 10);
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.setLineDash([]);
}

// Rival out of view: arrow on the screen edge pointing at it.
function drawOffscreen(ctx, f, cx, cy) {
  const sx = f.x - cx, sy = f.y - 12 - cy;
  const pad = 10;
  if (sx > pad && sx < VIEW.w - pad && sy > pad && sy < VIEW.h - pad) return;
  const x = Math.max(pad, Math.min(VIEW.w - pad, sx)), y = Math.max(pad, Math.min(VIEW.h - pad, sy));
  const a = Math.atan2(sy - y, sx - x);
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.rotate(a);
  ctx.fillStyle = f.markerColor;
  ctx.strokeStyle = '#1a0d2e';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(6, 0); ctx.lineTo(-4, -5); ctx.lineTo(-4, 5); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.restore();
}

function makeHud() {
  const slots = {};
  for (const el of document.querySelectorAll('[data-move]')) slots[el.dataset.move] = el;
  const bars = { p: $('#hp-p'), r: $('#hp-r') };
  const nums = { p: $('#hpn-p'), r: $('#hpn-r') };
  const level = $('#level');
  const shown = { p: 0, r: 0 };
  return {
    reset(player, rival) { shown.p = player.hp; shown.r = rival.hp; },
    deny(move) {
      const el = slots[move];
      if (!el) return;
      el.classList.remove('deny');
      void el.offsetWidth; // restart the CSS animation
      el.classList.add('deny');
    },
    update(player, rival) {
      // Cubone line: light becomes Punch and bone moves lock while the bone is thrown
      for (const slot of SLOTS) {
        const el = slots[slot], n = el.querySelector('.n'), name = player.moveFor(slot).name;
        if (n.textContent !== name) n.textContent = name;
        el.classList.toggle('locked', player.locked(slot));
        el.classList.toggle('frozen', player.lockT > 0 && player.cd[slot] > 0); // Mind Lock: this cooldown is stuck
      }
      for (const [move, el] of Object.entries(slots)) {
        const f = player.cooldownFrac(move);
        el.style.setProperty('--cd', f.toFixed(3));
        el.classList.toggle('ready', f === 0);
      }
      for (const [k, f] of [['p', player], ['r', rival]]) {
        // trailing bar eases down so damage reads as a chunk
        shown[k] += (f.hp - shown[k]) * 0.12;
        bars[k].style.setProperty('--hp', (f.hp / f.maxHp).toFixed(3));
        bars[k].style.setProperty('--trail', (shown[k] / f.maxHp).toFixed(3));
        bars[k].classList.toggle('low', f.hp <= f.maxHp * 0.3);
        nums[k].textContent = Math.ceil(f.hp);
      }
      const same = Math.abs(player.zEff - rival.zEff) < 0.5;
      level.textContent = same ? 'SAME HEIGHT — attacks connect' : 'DIFFERENT HEIGHT — attacks miss';
      level.classList.toggle('same', same);
      $('#tier-p').textContent = 'TIER ' + Math.round(player.z);
      $('#tier-r').textContent = 'TIER ' + Math.round(rival.z);
    },
  };
}

boot().catch((e) => {
  document.body.insertAdjacentHTML('beforeend', `<pre class="err">${e.message}\nRun via a local server: node serve.js</pre>`);
  throw e;
});
