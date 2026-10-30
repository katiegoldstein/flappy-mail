// Pixel sprites as character grids: one letter per pixel, '.' is transparent.
// The pigeon, bottle, cloud, bush and sun grids come straight from the approved mockups.

export type Grid = string[];
export type Pal = Record<string, string>;

// Palettes
export const PIGEON: Pal = { o: '#2E2A40', L: '#D9DBE8', B: '#8E93AD', D: '#5C6080', g: '#4FAE8C', e: '#14101F', y: '#F2B33D', R: '#E4574A', W: '#F6E7C1', w: '#C9A86B' };
export const PIGEON_BRIGHT: Pal = { o: '#14101F', L: '#FFFFFF', B: '#D4D7E6', D: '#9A9EB8', g: '#6FD3A8', e: '#14101F', y: '#FFC93D', R: '#E4574A', W: '#F6E7C1', w: '#C9A86B' };
export const BOTTLE_PAL: Pal = { o: '#2E2A40', G: '#6FCF97', W: '#F6E7C1', w: '#C9A86B' };
export const CLOUD_PAL: Pal = { o: '#2E2A40', W: '#FFFFFF' };
export const BUSH_PAL: Pal = { o: '#1B3A12', G: '#7ED348', g: '#3E8E41' };

// The flying pigeon with the letter tied to its feet: the logo and favicon.
// Three flap frames share the same body and letter rows so only the wing moves.
export const PIGEON_FLY_UP: Grid = [
  '........ooo',
  '.......oLLo',
  '......oLLLo',
  '.....oLLLLo...oo',
  '....oLLLLo...oBBo',
  'ooo.oLLLooooogBeoy',
  'oDDoooBBBBBBggBoyy',
  '.oDDBBBBBBBBBggo',
  '..ooBBBBBBBBBoo',
  '....ooBBBBBoo',
  '......oRRoWWw',
  '',
];
export const PIGEON_FLY_MID: Grid = [
  '',
  '',
  '......ooooo',
  '.....oLLLLLo...oo',
  '....oLLLLLo...oBBo',
  'ooo.oLLLooooogBeoy',
  'oDDoooBBBBBBggBoyy',
  '.oDDBBBBBBBBBggo',
  '..ooBBBBBBBBBoo',
  '....ooBBBBBoo',
  '......oRRoWWw',
  '',
];
export const PIGEON_FLY_DOWN: Grid = [
  '',
  '',
  '',
  '..............oo',
  '.............oBBo',
  'ooo.ooooooooogBeoy',
  'oDDoBBBBBBBBggBoyy',
  '.oDDoooooBBBBggo',
  '..ooLLLLLoBBBoo',
  '...oLLLLooBBoo',
  '..oLLooRRoWWw',
  '...oo',
];
export const PIGEON_FLAP = [PIGEON_FLY_UP, PIGEON_FLY_MID, PIGEON_FLY_DOWN, PIGEON_FLY_MID];

// Resting pigeon (close-up map, asleep) and the standing pigeon (letter page).
export const PIGEON_REST: Grid = [
  '..........ooo',
  '.........oBBBo',
  '.........oBoBoy',
  '........oggggo',
  '.ooo..ooBggBo',
  'oDDoooLLLLBBBo',
  '.oDDLLLLLLBBBo',
  '..ooLLLLLBBBo',
  '....ooBBBBoo',
  '......wwWW',
];
export const PIGEON_STAND: Grid = [
  '.....ooo',
  '....oBBBo',
  '....oBeBoy',
  '....oBBBoyy',
  '....ogggo',
  '...oggBBo',
  '..oBBBBBBo',
  '.oLLLBBBBBo',
  'oDLLLLBBBBo',
  'oDDLLLBBBBo',
  '.ooDDBBBBo',
  '...oooooo',
  '....R..R',
  '...RR.RR',
];
// Standing pigeon holding the rolled letter in its beak (departure cutscene, before take-off).
export const PIGEON_STAND_LETTER: Grid = [
  '.....ooo',
  '....oBBBo',
  '....oBeBoyWWw',
  '....oBBBoyy',
  '....ogggo',
  '...oggBBo',
  '..oBBBBBBo',
  '.oLLLBBBBBo',
  'oDLLLLBBBBo',
  'oDDLLLBBBBo',
  '.ooDDBBBBo',
  '...oooooo',
  '....R..R',
  '...RR.RR',
];

// Mini sprites for the world and region zoom levels.
export const MINI_FLY: Grid = ['...ooo', '..oLLo..oo', 'oo.oLooooBey', 'oDoBBBBBBgo', '.ooBBBBBoo', '...ooooo'];
export const MINI_FLY_DOWN: Grid = ['', '........oo', 'oo.ooooooBey', 'oDoBBBBBBgo', '.ooLLLoBoo', '...oLoooo'];
export const MINI_SLEEP: Grid = ['.......ooo', '......oBeoy', 'ooooooggBo', 'oDLLLLBBBo', '.ooooooooo'];

// Bottles
export const BOTTLE_SMALL: Grid = ['.ww.', '.oo.', 'oGGo', 'oWGo', 'oGGo', '.oo.'];
export const BOTTLE: Grid = ['...ww...', '...oo...', '..oGGo..', '..oGGo..', '.oGWWGo.', 'oGGWWGGo', 'oGGWWGGo', 'oGGWWGGo', 'oGGGGGGo', '.oooooo.'];
// Lying on its side, bobbing in the waves (cutscenes).
export const BOTTLE_SIDE: Grid = [
  '...oooooo.....',
  '..oGGGGGGoooo.',
  'woGWWWWWGGGGoo',
  'woGWWWWWGGGGGo',
  '..oGGGGGGoooo.',
  '...oooooo.....',
];

// Scenery
export const CLOUD: Grid = ['......oooo......', '....ooWWWWoo....', '..ooWWWWWWWWoo..', 'ooWWWWWWWWWWWWoo', 'oWWWWWWWWWWWWWWo', '.oooooooooooooo.'];
export const CLOUD_SMALL: Grid = ['....oooo....', '..ooWWWWoo..', 'ooWWWWWWWWoo', 'oWWWWWWWWWWo', '.oooooooooo.'];
export const BUSH: Grid = ['.....oo.....oo....', '...ooGGo..ooGGoo..', '..oGGGGGooGGGGGGo.', '.oGGGgGGGGGGgGGGGo', 'oGGGGGGGGGGGGGGGGGo'];
export const SUN: Grid = [
  '....SSSS....', '..SSSSSSSS..', '.SSSSSSSSSS.', '.SSSSSSSSSS.', 'SSSSSSSSSSSS', 'SSSSSSSSSSSS',
  'SSSSSSSSSSSS', 'SSSSSSSSSSSS', '.SSSSSSSSSS.', '.SSSSSSSSSS.', '..SSSSSSSS..', '....SSSS....',
];

// Where a pigeon sleeps: a ship over open water, a tree over land.
// Where a pigeon sleeps over open water: a little orange lifeboat.
export const LIFEBOAT: Grid = [
  '.o..........o.',
  'oooooooooooooo',
  'oOOOOOOOOOOOOo',
  'oWWOOWWOOWWOOo',
  '.oOOOOOOOOOOo.',
  '..oooooooooo..',
];
export const LIFEBOAT_PAL: Pal = { o: '#2E2A40', O: '#F07A2B', W: '#FFFFFF' };
export const TREE: Grid = [
  '...oooo...',
  '.ooGGGGoo.',
  'oGGGgGGGGo',
  'oGgGGGGgGo',
  'oGGGGgGGGo',
  '.ooGGGGoo.',
  '...oTTo...',
  '....TT....',
  '....TT....',
  '...TTTT...',
];
export const TREE_PAL: Pal = { o: '#1B3A12', G: '#7ED348', g: '#3E8E41', T: '#8B5A2B' };

// Loss vignettes: gentle and silly.
export const SANDWICH: Grid = [
  '..oooooooo..',
  '.oWWWWWWWWo.',
  'oWWWWWWWWWWo',
  'oGGGGGGGGGGo',
  'oRRYYRRYYRRo',
  'oWWWWWWWWWWo',
  '.oooooooooo.',
];
export const SANDWICH_PAL: Pal = { o: '#2E2A40', W: '#F6C77A', G: '#7ED348', R: '#E4574A', Y: '#FFD46B' };
export const STORM_CLOUD: Grid = [
  '.......oooooo.........',
  '.....ooCCCCCCoo.......',
  '...ooCCCCCCCCCCoooo...',
  '..oCCCCCCCCCCCCCCCCo..',
  '.oCCCCCCCCCCCCCCCCCCo.',
  'oCCCCcCCCCCCCcCCCCCCCo',
  'oCCCCCCCCCcCCCCCCCcCCo',
  '.oooooooooooooooooooo.',
  '......Y.......Y.......',
  '.....YY......YY.......',
  '......Y.......Y.......',
  '.....Y.......Y........',
];
export const STORM_PAL: Pal = { o: '#2E2A40', C: '#8E93AD', c: '#5C6080', Y: '#FFD46B' };
export const DODO: Grid = [
  '.....oooo.......',
  '....oPPPPo......',
  '...oPPePPPoo....',
  '...oPPPPPPOOo...',
  '...oPPPPPoOOOo..',
  '....oPPPPooooo..',
  '.....oPPo.......',
  '..oooPPPPooo....',
  '.oCCCCCCCCCCoo..',
  'oCCCCCCCCCCCCCo.',
  'oCCCCcCCCCCCCCCo',
  'oCCCCCcCCCCCCCo.',
  '.oCCCCCCCCCCCo..',
  '..oooooooooo....',
  '....F...F.......',
  '...FF..FF.......',
];
export const DODO_PAL: Pal = { o: '#8B5A2B', P: '#F2C6C2', e: '#2E2A40', O: '#F2B33D', C: '#F6E7C1', c: '#E4B8A8', F: '#F07A2B' };
export const WHALE: Grid = [
  '.............SS.S...........',
  '..............SSS...........',
  '...............S............',
  '........oooooooooooo........',
  '.....oooBBBBBBBBBBBBooo.....',
  '...ooBBBBBBBBBBBBBBBBBBoo..o',
  '..oBBeBBBBBBBBBBBBBBBBBBBooB',
  '.oBBBBBBBBBBBBBBBBBBBBBBBBBo',
  'oWWWWWBBBBBBBBBBBBBBBBBBBBo.',
  'oWWWWWWWWWWWWBBBBBBBBBBBoo..',
  '.ooWWWWWWWWWWWWWWWWWoooo....',
  '...oooooooooooooooo.........',
];
export const WHALE_PAL: Pal = { o: '#14101F', B: '#5A6FC6', W: '#B9E3F7', e: '#14101F', S: '#FFFFFF' };
export const NET: Grid = [
  'o.o.o.o.o.o.',
  '.o.o.o.o.o.o',
  'o.o.o.o.o.o.',
  '.o.o.o.o.o.o',
  'o.o.o.o.o.o.',
  '.o.o.o.o.o.o',
];
export const NET_PAL: Pal = { o: '#F6E7C1' };
export const BOAT: Grid = [
  '.........o..........',
  '.........o..........',
  '.........oWWW.......',
  '.........oWWWW......',
  '.........oWWWWW.....',
  '.........o..........',
  'oooooooooooooooooooo',
  '.oRRRRRRRRRRRRRRRRo.',
  '..oRRRRRRRRRRRRRRo..',
  '...oooooooooooooo...',
];
export const BOAT_PAL: Pal = { o: '#2E2A40', R: '#8E1B1B', W: '#F6E7C1' };
// The ribbon bow tied around the rolled letter (letter page).
export const BOW: Grid = [
  '.oo.......oo.',
  'oRRo.....oRRo',
  'oRrRo...oRrRo',
  'oRrRRoooRRrRo',
  'oRrRRoRoRRrRo',
  'oRrRRoooRRrRo',
  'oRRRo.o.oRRRo',
  '.ooo.oRo.ooo.',
  '....oRRRo....',
  '...oRRoRRo...',
  '..oRRo.oRRo..',
  '..oRo...oRo..',
  '..oo.....oo..',
];
export const BOW_PAL: Pal = { o: '#2E2A40', R: '#E4574A', r: '#A8352B' };
export const LETTER_ROLL: Grid = ['oooooooo', 'wWWWWWWw', 'wWRRWWWw', 'wWWWWWWw', 'oooooooo'];
export const LETTER_ROLL_PAL: Pal = { o: '#2E2A40', W: '#F6E7C1', w: '#C9A86B', R: '#E4574A' };

export function gridSize(rows: Grid) {
  let w = 0;
  for (const r of rows) w = Math.max(w, r.length);
  return { w, h: rows.length };
}

export function drawSprite(ctx: CanvasRenderingContext2D, rows: Grid, pal: Pal, x: number, y: number, s = 1, flip = false) {
  const { w } = gridSize(rows);
  for (let ry = 0; ry < rows.length; ry++) {
    const r = rows[ry];
    for (let rx = 0; rx < r.length; rx++) {
      const c = pal[r[rx]];
      if (!c) continue;
      ctx.fillStyle = c;
      const px = flip ? w - 1 - rx : rx;
      ctx.fillRect(Math.round(x + px * s), Math.round(y + ry * s), s, s);
    }
  }
}

// A crisp DOM element for a sprite: a canvas at 1px per pixel, scaled up with image-rendering: pixelated.
export function spriteEl(rows: Grid, pal: Pal, s: number, label?: string): HTMLCanvasElement {
  const { w, h } = gridSize(rows);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.style.width = w * s + 'px';
  c.style.height = h * s + 'px';
  c.className = 'px';
  if (label) { c.setAttribute('role', 'img'); c.setAttribute('aria-label', label); } else c.setAttribute('aria-hidden', 'true');
  drawSprite(c.getContext('2d')!, rows, pal, 0, 0, 1);
  return c;
}

// Animate a sprite element through frames (all frames drawn into the same canvas size).
export function animatedSpriteEl(frames: Grid[], pal: Pal, s: number, ms = 140): HTMLCanvasElement {
  let w = 0, h = 0;
  frames.forEach(f => { const z = gridSize(f); w = Math.max(w, z.w); h = Math.max(h, z.h); });
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.style.width = w * s + 'px'; c.style.height = h * s + 'px';
  c.className = 'px';
  c.setAttribute('aria-hidden', 'true');
  const ctx = c.getContext('2d')!;
  let i = 0;
  const draw = () => { ctx.clearRect(0, 0, w, h); drawSprite(ctx, frames[i % frames.length], pal, 0, 0, 1); i++; };
  draw();
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) setInterval(draw, ms);
  return c;
}

// The favicon is the flying pigeon with its letter, drawn as SVG rects.
export function spriteSvg(rows: Grid, pal: Pal): string {
  const { w, h } = gridSize(rows);
  const side = Math.max(w, h);
  const ox = Math.floor((side - w) / 2), oy = Math.floor((side - h) / 2);
  let rects = '';
  rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) { const c = pal[r[x]]; if (c) rects += `<rect x="${x + ox}" y="${y + oy}" width="1.02" height="1.02" fill="${c}"/>`; } });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" shape-rendering="crispEdges">${rects}</svg>`;
}
