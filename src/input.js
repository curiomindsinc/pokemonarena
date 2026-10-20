// Keyboard + mouse. Left/right clicks are held briefly so pressing both
// together reads as one chord (the special) instead of two separate attacks.

const CHORD_WINDOW = 0.07; // seconds

export class PlayerInput {
  constructor(canvas, logicalW, logicalH) {
    this.canvas = canvas;
    this.w = logicalW;
    this.h = logicalH;
    this.keys = new Set();
    this.mouse = { x: 0, y: 0 }; // view (screen) coords
    this.cam = { x: 0, y: 0 }; // set by the game: view offset into the world
    this.held = [false, false, false];
    this.pending = null; // {button, t}
    this.queued = null; // slot: 'light' (LMB) | 'heavy' (RMB) | 'special' (both)
    this.queuedAt = 0;
    this.dashPressed = false;
    this.jumpPressed = false;
    this.restartPressed = false;
    this.time = 0;

    addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(k);
      if (k === 'shift') this.dashPressed = true;
      if (k === ' ') this.jumpPressed = true;
      if (k === 'r') this.restartPressed = true;
    });
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => { this.keys.clear(); this.held = [false, false, false]; });

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => this.trackMouse(e));
    canvas.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.trackMouse(e);
      if (e.button !== 0 && e.button !== 2) return;
      this.held[e.button] = true;
      if (this.pending && this.pending.button !== e.button && this.time - this.pending.t <= CHORD_WINDOW) {
        this.pending = null;
        this.queue('special');
      } else {
        this.pending = { button: e.button, t: this.time };
      }
    });
    addEventListener('mouseup', (e) => { if (e.button < 3) this.held[e.button] = false; });
  }

  trackMouse(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * this.w;
    this.mouse.y = ((e.clientY - rect.top) / rect.height) * this.h;
  }

  queue(move) {
    this.queued = move;
    this.queuedAt = this.time;
  }

  // Called once per frame; returns an intent object shared with the AI controller.
  read(dt, me) {
    this.time += dt;
    if (this.pending && this.time - this.pending.t > CHORD_WINDOW) {
      this.queue(this.pending.button === 0 ? 'light' : 'heavy');
      this.pending = null;
    }
    // Holding a single button auto-repeats that move whenever it comes off cooldown.
    if (!this.queued && !this.pending && this.held[0] !== this.held[2]) {
      const move = this.held[0] ? 'light' : 'heavy';
      if (me.ready(move)) this.queue(move);
    }
    // Buffered moves expire so a press during a long animation doesn't fire much later.
    if (this.queued && this.time - this.queuedAt > 0.2) this.queued = null;

    const k = this.keys;
    let mx = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
    let my = (k.has('s') || k.has('arrowdown') ? 1 : 0) - (k.has('w') || k.has('arrowup') ? 1 : 0);
    if (mx && my) { mx *= Math.SQRT1_2; my *= Math.SQRT1_2; }

    const intent = {
      mx, my,
      aim: Math.atan2(this.mouse.y + this.cam.y - (me.y - 10), this.mouse.x + this.cam.x - me.x),
      tx: this.mouse.x + this.cam.x, ty: this.mouse.y + this.cam.y,
      move: this.queued,
      dash: this.dashPressed,
      jump: this.jumpPressed,
    };
    this.dashPressed = false;
    this.jumpPressed = false;
    return intent;
  }

  // The fighter reports back whether it accepted the queued move.
  consumed() { this.queued = null; }

  takeRestart() {
    const r = this.restartPressed;
    this.restartPressed = false;
    return r;
  }
}
