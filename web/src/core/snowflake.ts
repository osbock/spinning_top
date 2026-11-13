// Parametric snowflake spinning-top discs: a port of snowflake/snowflake_top.py.
//
// Every style builds one half-arm inside a 30-degree wedge, mirrors it, and
// repeats it 6 times, so every disc is perfectly 6-fold symmetric (balanced).
import {
  area, buffer, circle, clipSegmentConvex, difference, EMPTY, fromPolygon, insetConvex, intersection, isEmpty,
  polygon, polygons, type Pt, type Ring, ringArea, ringCovers, rotate, scale, type Shape, union,
} from "./geometry";
import { PyRandom, pyHash, pyRound } from "./pyrandom";

/** Snowflakes, then the plain shapes (a circle, and a hexagon with a corner where a snowflake has an arm). */
export const STYLES = ["classic", "fractal", "random", "plate", "crystal", "circle", "hexagon"] as const;
export type Style = (typeof STYLES)[number];
export const PLAIN_STYLES: readonly Style[] = ["circle", "hexagon"];
export const isPlain = (s: Style) => PLAIN_STYLES.includes(s);

/** The module-level constants of the Python script, as options. All lengths in mm. */
export interface Params {
  hole: number;       // hole cut for the dowel
  minFeature: number; // thinnest arm/branch/wall so small discs don't snap
  corner: number;     // corner rounding radius
}

export const DEFAULT_PARAMS: Params = { hole: 6.2, minFeature: 3.0, corner: 0.6 };

const rad = (deg: number) => deg * (Math.PI / 180);
const T30 = Math.tan(rad(30));

interface Ctx extends Params { seed: number }

// ---------- helpers ----------
/** A segment thickened to width w with flat ends. */
function bar(p0: Pt, p1: Pt, w: number): Shape {
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1], len = Math.hypot(dx, dy);
  if (len === 0) return EMPTY;
  const nx = (-dy / len) * (w / 2), ny = (dx / len) * (w / 2);
  return polygon([[p0[0] + nx, p0[1] + ny], [p1[0] + nx, p1[1] + ny], [p1[0] - nx, p1[1] - ny], [p0[0] - nx, p0[1] - ny]]);
}

function hexRing(cx: number, cy: number, r: number, rot = 0): Ring {
  return [0, 60, 120, 180, 240, 300].map((a): Pt => [cx + r * Math.cos(rad(a + rot)), cy + r * Math.sin(rad(a + rot))]);
}
const hexagon = (cx: number, cy: number, r: number, rot = 0): Shape => polygon(hexRing(cx, cy, r, rot));

/** Upper half of an arm's 30-degree sector, shrunk by margin from its edges. */
function wedgeRing(R: number, margin = 0): Ring {
  const big = 3 * R;
  const tri: Ring = [[0, 0], [big, 0], [big, big * T30]];
  return margin ? insetConvex(tri, margin) : tri;
}
const wedge = (R: number, margin = 0): Shape => polygon(wedgeRing(R, margin));

/** A branch that stops before it would collide with the neighbouring arm. */
function clippedBar(p0: Pt, p1: Pt, w: number, R: number): Shape {
  // The segment is clipped to the shrunk wedge plus a thin strip along the x axis.
  const regions: Ring[] = [wedgeRing(R * 1.2, w / 2 + 0.4), [[-1, -1], [3 * R, -1], [3 * R, 0.01], [-1, 0.01]]];
  const spans = regions.map((r) => clipSegmentConvex(p0, p1, r)).filter((s): s is [number, number] => !!s && s[1] > s[0]);
  spans.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]);
    else merged.push([...s]);
  }
  const at = (t: number): Pt => [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t];
  return union(...merged.map(([a, b]) => bar(at(a), at(b), w)));
}

function hub(R: number, c: Ctx): Shape {
  return hexagon(0, 0, Math.max(0.3 * R, c.hole / 2 + c.minFeature + 1.5));
}

function widths(R: number, c: Ctx, fracMain = 0.09, fracBranch = 0.07): [number, number] {
  return [Math.max(fracMain * R, c.minFeature), Math.max(fracBranch * R, c.minFeature * 0.9)];
}

// ---------- styles: each returns the UPPER half of one arm (y >= 0) ----------
type StyleFn = (R: number, rng: PyRandom, c: Ctx) => Shape;

const classic: StyleFn = (R, _rng, c) => {
  const [w, wb] = widths(R, c);
  const small = 0.09 * R < c.minFeature * 0.85;
  const parts = [bar([0, 0], [0.86 * R, 0], w)];
  const branches = small ? [[0.52 * R, 0.34 * R]] : [[0.5 * R, 0.3 * R], [0.7 * R, 0.18 * R]];
  const a = rad(60);
  for (const [r0, L] of branches) parts.push(clippedBar([r0, 0], [r0 + L * Math.cos(a), L * Math.sin(a)], wb, R));
  const tr = (small ? 0.11 : 0.14) * R;
  parts.push(hexagon(R - tr, 0, tr));
  return union(...parts);
};

/** Recursive dendrite: every branch sprouts smaller branches at 60 degrees. */
const fractal: StyleFn = (R, _rng, c) => {
  const [w] = widths(R, c);
  const parts: Shape[] = [];
  const grow = (x: number, y: number, ang: number, L: number, width: number, depth: number) => {
    const x2 = x + L * Math.cos(ang), y2 = y + L * Math.sin(ang);
    parts.push(clippedBar([x, y], [x2, y2], width, R));
    if (depth === 0 || L * 0.42 < width * 1.6) return;
    for (const t of [0.45, 0.75]) {
      const bx = x + t * L * Math.cos(ang), by = y + t * L * Math.sin(ang);
      const cl = L * (t < 0.6 ? 0.42 : 0.26);
      for (const da of [rad(60), -rad(60)]) {
        if (ang === 0 && da < 0) continue; // main arm: only grow on the upper side (mirrored later)
        grow(bx, by, ang + da, cl, Math.max(width * 0.8, c.minFeature * 0.9), depth - 1);
      }
    }
  };
  grow(0, 0, 0, 0.92 * R, w, 3);
  parts.push(hexagon(0.92 * R, 0, Math.max(0.08 * R, c.minFeature * 0.8), 30));
  return union(...parts);
};

/** Seeded random branches and tip ornaments; same seed = same snowflake. */
const random: StyleFn = (R, rng, c) => {
  const fm = 0.08 + rng.random() * 0.04, fb = 0.06 + rng.random() * 0.03;
  const [w, wb] = widths(R, c, fm, fb);
  const reach = 0.8 + rng.random() * 0.1;
  const parts = [bar([0, 0], [reach * R, 0], w)];
  const n = R < 22 ? rng.randint(1, 2) : rng.randint(2, 4);
  const spots = Array.from({ length: n }, () => rng.uniform(0.38, 0.8)).sort((a, b) => a - b);
  const a = rad(60);
  let last = -1;
  for (const s of spots) {
    if (s - last < (wb * 1.8) / R) continue;
    last = s;
    const L = R * rng.uniform(0.12, 0.38) * (1.1 - s * 0.5);
    const x0 = s * R;
    const tip: Pt = [x0 + L * Math.cos(a), L * Math.sin(a)];
    parts.push(clippedBar([x0, 0], tip, wb, R));
    if (rng.random() < 0.35 && L > 3 * c.minFeature) { // little plate on the branch end
      parts.push(intersection(hexagon(tip[0], tip[1], wb * 0.9), wedge(R * 1.2, 0.4)));
    }
  }
  const kind = rng.choice(["hex", "diamond", "fork"] as const);
  const tr = Math.max(0.11 * R, c.minFeature);
  const tx = reach * R + tr * 0.6;
  if (kind === "hex") parts.push(hexagon(tx, 0, tr));
  else if (kind === "diamond") parts.push(polygon([[tx - tr, 0], [tx, tr * 0.8], [tx + tr, 0], [tx, -tr * 0.8]]));
  else {
    parts.push(bar([reach * R, 0], [R, 0], w));
    parts.push(clippedBar([reach * R - tr * 0.3, 0], [reach * R + tr, tr * 1.3], wb, R));
  }
  return union(...parts);
};

/** Sectored plate: a solid hexagonal plate with ridges and triangular windows,
 *  plus short arms with crystal tips. */
const plate: StyleFn = (R, _rng, c) => {
  const [w, wb] = widths(R, c);
  const pr = 0.66 * R;
  let body = hexagon(0, 0, pr);
  const tri: Ring = [[0, 0], [pr, 0], [pr * 0.5, pr * Math.sin(rad(60))]];
  let win = difference(
    intersection(polygon(insetConvex(tri, c.minFeature * 0.6)), // ridges
      hexagon(0, 0, pr - c.minFeature / Math.cos(rad(30)))), // rim
    buffer(hub(R, c), c.minFeature * 0.5));
  win = buffer(buffer(win, -0.8), 0.8);
  if (!isEmpty(win) && area(win) > 2 * c.minFeature ** 2) body = difference(body, win);
  const half = polygon([[0, 0], [3 * R, 0], [3 * R, 3 * R * T30]]);
  const parts = [intersection(body, half), bar([0, 0], [R * 0.9, 0], w)];
  const tr = Math.max(0.1 * R, c.minFeature);
  parts.push(hexagon(R - tr, 0, tr));
  if (R > 20) parts.push(clippedBar([pr * 0.97, 0], [pr * 0.97 + 0.07 * R, 0.12 * R], wb, R));
  return union(...parts);
};

type Cell = [number, number];

/** Packard's snowflake cellular automaton on a hex grid: an empty cell freezes when a
 *  set number of its neighbours are frozen. The grid is coarse on purpose so every
 *  line is >= minFeature wide and every gap is cuttable. The seed picks the rule. */
const crystal: StyleFn = (R, _rng, c) => {
  const w = c.minFeature;
  const pitch = w * 1.65; // centre-to-centre spacing of cells
  const N = Math.max(3, Math.trunc((R - w) / pitch)); // cells from centre to tip
  const rule = [new Set([1]), new Set([1, 5]), new Set([1, 3])][((c.seed % 3) + 3) % 3]; // same rule on every tier
  const keepP = rule.has(3) ? 0.85 : 0.72;
  const canon = (q: number, r: number): number[] => { // same key for all 12 symmetric copies of a cell
    const x = q, y = -q - r || 0, z = r;
    const perms = [[x, y, z], [x, z, y], [y, x, z], [y, z, x], [z, x, y], [z, y, x]];
    let best: number[] | null = null;
    for (const p of perms) {
      const neg = p.map((v) => -v || 0);
      const m = lexLess(neg, p) ? neg : p;
      if (!best || lexLess(m, best)) best = m;
    }
    return best!;
  };
  const keep = ([q, r]: Cell, step: number): boolean => { // seeded, symmetric pruning
    if (step < 2 || r === 0 || q === -r || q === 0) return true; // never prune the hub or the main spines
    return new PyRandom(pyHash([c.seed, canon(q, r)])).random() < keepP;
  };
  const nb: Cell[] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
  const key = ([q, r]: Cell) => `${q},${r}`;
  const frozen = new Map<string, Cell>([["0,0", [0, 0]]]);
  const links: [Cell, Cell][] = [];
  const dist = (q: number, r: number) => (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
  for (let step = 0; step < N; step++) {
    const cand = new Map<string, { cell: Cell; parents: Cell[] }>();
    for (const [q, r] of frozen.values()) {
      for (const [dq, dr] of nb) {
        const cell: Cell = [q + dq, r + dr], k = key(cell);
        if (!frozen.has(k) && dist(...cell) <= N) {
          if (!cand.has(k)) cand.set(k, { cell, parents: [] });
          cand.get(k)!.parents.push([q, r]);
        }
      }
    }
    const fresh = [...cand.values()].filter(({ cell, parents }) => rule.has(parents.length) && keep(cell, step));
    if (!fresh.length) break;
    for (const { cell, parents } of fresh) for (const p of parents) links.push([p, cell]);
    for (const { cell } of fresh) frozen.set(key(cell), cell);
  }
  const xy = (q: number, r: number): Pt => [pitch * (q + r * 0.5), (pitch * r * Math.sqrt(3)) / 2];
  const inside = ([q, r]: Cell) => 0 <= r && r <= q; // closed half-sector
  const parts = links.filter(([a, b]) => inside(a) && inside(b)).map(([a, b]) => bar(xy(...a), xy(...b), w));
  for (const cell of frozen.values()) if (inside(cell)) parts.push(hexagon(...xy(...cell), w * 0.62, 30));
  parts.push(bar([0, 0], xy(N, 0), w)); // always a solid spine to the tip
  return union(...parts);
};

function lexLess(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
}

const STYLE_FNS: Record<Exclude<Style, "circle" | "hexagon">, StyleFn> = { classic, fractal, random, plate, crystal };

/** A plain disc. The circle has 96 sides, a multiple of 6, so it keeps the 6-fold symmetry. */
function plainDisc(R: number, style: "circle" | "hexagon", c: Ctx): Shape {
  if (style === "circle") return circle(0, 0, R, 24);
  return c.corner ? buffer(polygon(insetConvex(hexRing(0, 0, R), c.corner)), c.corner) : hexagon(0, 0, R);
}

// ---------- assembly ----------
export interface Disc {
  shape: Shape;
  /** The finished piece in mm: outer ring and holes (the dowel hole among them). */
  poly: { outer: Ring; holes: Ring[] };
}

/** One disc of tip-to-tip diameter 2R, centred on the origin (y up). */
export function snowflake(R: number, style: Style = "classic", seed = 1, params: Params = DEFAULT_PARAMS): Disc {
  const c: Ctx = { ...params, seed };
  if (style === "circle" || style === "hexagon") {
    const shape = difference(plainDisc(R, style, c), circle(0, 0, c.hole / 2, 64));
    return { shape, poly: polygons(shape)[0] };
  }
  const rng = new PyRandom(seed * 1000 + pyRound(R * 10));
  let half = STYLE_FNS[style](R, rng, c);
  half = intersection(half, polygon([[-R, 0], [2 * R, 0], [2 * R, 2 * R], [-R, 2 * R]]));
  const arm = union(half, scale(half, 1, -1));
  let shape = union(hub(R, c), ...[0, 1, 2, 3, 4, 5].map((k) => rotate(arm, 60 * k)));
  shape = buffer(buffer(buffer(shape, c.corner), -2 * c.corner), c.corner); // round corners
  // Keep only the piece attached to the hub, and drop holes too small to cut.
  const pieces = polygons(shape);
  if (!pieces.length) throw new Error("empty snowflake");
  let best = pieces[0], bestKey: [boolean, number] = [ringCovers(best.outer, [0, 0]), ringArea(best.outer) - best.holes.reduce((t, h) => t + ringArea(h), 0)];
  for (const p of pieces.slice(1)) {
    const k: [boolean, number] = [ringCovers(p.outer, [0, 0]), ringArea(p.outer) - p.holes.reduce((t, h) => t + ringArea(h), 0)];
    if (k[0] > bestKey[0] || (k[0] === bestKey[0] && k[1] > bestKey[1])) [best, bestKey] = [p, k];
  }
  shape = fromPolygon({ outer: best.outer, holes: best.holes.filter((h) => ringArea(h) > c.minFeature ** 2) });
  // Keep it inside the requested tip-to-tip size.
  const ext = Math.max(...best.outer.map(([x, y]) => Math.hypot(x, y)));
  if (ext > R) shape = scale(shape, R / ext, R / ext);
  shape = difference(shape, circle(0, 0, c.hole / 2, 64));
  const [poly] = polygons(shape);
  return { shape, poly };
}

/** Parse a dowel size: mm ("6.35", "6.35mm") or inches ("0.25in", "1/4in", '3/16"'). */
export function parseDowel(text: string): number {
  let d = text.trim().toLowerCase().replace(/"/g, "in").replace(/\s+/g, "");
  let inches = false;
  if (d.endsWith("in")) { inches = true; d = d.slice(0, -2); }
  else if (d.endsWith("mm")) d = d.slice(0, -2);
  let n: number;
  if (d.includes("/")) {
    const [a, b] = d.split("/");
    n = Number(a) / Number(b);
  } else n = Number(d);
  if (!d || !Number.isFinite(n) || n <= 0) throw new Error(`Can't read dowel size "${text}"`);
  return inches ? n * 25.4 : n;
}
