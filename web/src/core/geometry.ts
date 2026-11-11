// A small polygon toolkit on top of Clipper, standing in for the shapely calls
// in snowflake_top.py. Shapes are Clipper paths in integer units (mm × SCALE),
// always normalized by a union so outer rings and holes are oriented correctly.
import ClipperLib from "clipper-lib";

export type Pt = [number, number];
export type Ring = Pt[];
/** A region: any number of rings, filled with the nonzero rule. */
export type Shape = ClipperLib.Paths;
/** One connected piece in mm: an outer ring and its holes. */
export interface Polygon { outer: Ring; holes: Ring[] }

const SCALE = 1e4; // 0.1 µm resolution; 70 mm discs stay well inside Clipper's fast integer range
const ARC_TOLERANCE = 0.002 * SCALE; // close to shapely's 8 segments per quarter circle at these radii
const MITRE_LIMIT = 5; // shapely's default mitre_limit

const { Clipper, ClipperOffset, ClipType, PolyType, PolyFillType, JoinType, EndType, PolyTree } = ClipperLib;

const toInt = (r: Ring): ClipperLib.Path => r.map(([x, y]) => ({ X: Math.round(x * SCALE), Y: Math.round(y * SCALE) }));
const toMm = (p: ClipperLib.Path): Ring => p.map((q) => [q.X / SCALE, q.Y / SCALE]);

function run(type: ClipperLib.ClipType, subject: Shape, clip: Shape = []): Shape {
  const c = new Clipper();
  c.AddPaths(subject, PolyType.ptSubject, true);
  if (clip.length) c.AddPaths(clip, PolyType.ptClip, true);
  const out: Shape = [];
  c.Execute(type, out, PolyFillType.pftNonZero, PolyFillType.pftNonZero);
  return out;
}

/** A shape from rings in mm (holes may be given as extra rings of either orientation via even-odd). */
export function polygon(outer: Ring, holes: Ring[] = []): Shape {
  const ring = (r: Ring) => {
    const p = toInt(r);
    if (!Clipper.Orientation(p)) p.reverse();
    return p;
  };
  const body = run(ClipType.ctUnion, [ring(outer)]);
  return holes.length ? run(ClipType.ctDifference, body, holes.map(ring)) : body;
}

export const EMPTY: Shape = [];
export const isEmpty = (s: Shape) => s.length === 0;
export const union = (...shapes: Shape[]): Shape => run(ClipType.ctUnion, shapes.flat());
export const intersection = (a: Shape, b: Shape): Shape => (a.length && b.length ? run(ClipType.ctIntersection, a, b) : []);
export const difference = (a: Shape, b: Shape): Shape => (b.length ? run(ClipType.ctDifference, a, b) : a);

/** shapely's buffer for polygons: join "round" (default) or "mitre". */
export function buffer(s: Shape, d: number, join: "round" | "mitre" = "round"): Shape {
  if (!s.length) return s;
  if (d === 0) return union(s);
  const o = new ClipperOffset(MITRE_LIMIT, ARC_TOLERANCE);
  o.AddPaths(s, join === "round" ? JoinType.jtRound : JoinType.jtMiter, EndType.etClosedPolygon);
  const out: Shape = [];
  o.Execute(out, d * SCALE);
  return union(out);
}

/** Apply a point map (in mm), keeping each ring's role (outer or hole); mirrors are re-oriented. */
export function transform(s: Shape, f: (x: number, y: number) => Pt): Shape {
  const outers: ClipperLib.Path[] = [], holes: ClipperLib.Path[] = [];
  for (const p of s) {
    const q = toInt(toMm(p).map(([x, y]) => f(x, y)));
    if (!Clipper.Orientation(q)) q.reverse();
    (Clipper.Orientation(p) ? outers : holes).push(q);
  }
  return difference(run(ClipType.ctUnion, outers), holes.length ? run(ClipType.ctUnion, holes) : []);
}

export const rotate = (s: Shape, deg: number): Shape => {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
  return transform(s, (x, y) => [x * c - y * sn, x * sn + y * c]);
};
export const scale = (s: Shape, kx: number, ky: number): Shape => transform(s, (x, y) => [x * kx, y * ky]);
export const translate = (s: Shape, dx: number, dy: number): Shape => transform(s, (x, y) => [x + dx, y + dy]);

/** Total filled area in mm². */
export const area = (s: Shape): number => s.reduce((t, p) => t + Clipper.Area(p), 0) / (SCALE * SCALE);

/** Connected pieces, each with its holes (holes inside holes become new pieces). */
export function polygons(s: Shape): Polygon[] {
  const c = new Clipper();
  c.AddPaths(s, PolyType.ptSubject, true);
  const tree = new PolyTree();
  c.Execute(ClipType.ctUnion, tree, PolyFillType.pftNonZero, PolyFillType.pftNonZero);
  const out: Polygon[] = [];
  const walk = (node: ClipperLib.PolyNode) => {
    for (const child of node.Childs()) {
      if (child.IsHole()) continue;
      out.push({ outer: toMm(child.Contour()), holes: child.Childs().map((h) => toMm(h.Contour())) });
      for (const h of child.Childs()) walk(h);
    }
  };
  walk(tree);
  return out;
}

export const fromPolygon = (p: Polygon): Shape => polygon(p.outer, p.holes);

export function ringArea(r: Ring): number {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]);
  return Math.abs(a / 2);
}

/** Point in ring, counting the boundary as inside (like shapely's covers). */
export function ringCovers(r: Ring, [x, y]: Pt): boolean {
  return Clipper.PointInPolygon({ X: Math.round(x * SCALE), Y: Math.round(y * SCALE) }, toInt(r)) !== 0;
}

export function bounds(s: Shape): [number, number, number, number] {
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const p of s) for (const { X, Y } of p) {
    minx = Math.min(minx, X); miny = Math.min(miny, Y); maxx = Math.max(maxx, X); maxy = Math.max(maxy, Y);
  }
  return [minx / SCALE, miny / SCALE, maxx / SCALE, maxy / SCALE];
}

/** A circle as a 4·quadSegs-gon (shapely's Point.buffer(r, quadSegs)). */
export function circle(cx: number, cy: number, r: number, quadSegs = 16): Shape {
  const n = 4 * quadSegs;
  return polygon(Array.from({ length: n }, (_, i): Pt => {
    const a = (2 * Math.PI * i) / n;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  }));
}

/** Shrink a convex polygon by d with sharp corners (shapely's buffer(-d, join_style=mitre)). */
export function insetConvex(r: Ring, d: number): Ring {
  const ccw = ringSigned(r) > 0 ? r : [...r].reverse();
  const n = ccw.length;
  const lines = ccw.map(([x0, y0], i) => {
    const [x1, y1] = ccw[(i + 1) % n];
    const len = Math.hypot(x1 - x0, y1 - y0);
    const nx = -(y1 - y0) / len, ny = (x1 - x0) / len; // inward normal of a CCW ring
    return { p: [x0 + nx * d, y0 + ny * d] as Pt, v: [x1 - x0, y1 - y0] as Pt };
  });
  return lines.map((b, i) => intersectLines(lines[(i + n - 1) % n], b));
}

function ringSigned(r: Ring): number {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]);
  return a / 2;
}

function intersectLines(a: { p: Pt; v: Pt }, b: { p: Pt; v: Pt }): Pt {
  const den = a.v[0] * b.v[1] - a.v[1] * b.v[0];
  const t = ((b.p[0] - a.p[0]) * b.v[1] - (b.p[1] - a.p[1]) * b.v[0]) / den;
  return [a.p[0] + a.v[0] * t, a.p[1] + a.v[1] * t];
}

/** The parameter range [t0, t1] of segment p0→p1 inside a convex ring, or null. */
export function clipSegmentConvex(p0: Pt, p1: Pt, r: Ring): [number, number] | null {
  const ccw = ringSigned(r) > 0 ? r : [...r].reverse();
  let t0 = 0, t1 = 1;
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1];
  for (let i = 0; i < ccw.length; i++) {
    const [ax, ay] = ccw[i], [bx, by] = ccw[(i + 1) % ccw.length];
    const nx = -(by - ay), ny = bx - ax; // inward normal
    const num = nx * (p0[0] - ax) + ny * (p0[1] - ay); // >= 0 when p0 is inside this edge
    const den = nx * dx + ny * dy;
    if (den === 0) {
      if (num < 0) return null;
      continue;
    }
    const t = -num / den;
    if (den > 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  return [t0, t1];
}
