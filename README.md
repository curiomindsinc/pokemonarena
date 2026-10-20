# Monster Arena

Top-down monster fighting game in the browser (canvas, no build step).

**Play:** open the GitHub Pages site, or run locally:

```
node serve.js   # http://localhost:8080
```

Pick your monster, then the rival, and fight. WASD to move, mouse to aim, LMB / RMB / both for moves, Shift to dash, Space to jump.

`tools/slice.js` regenerates `src/frames.js` from the sprite sheets (`npm install` first for `pngjs`).
