// Punch-out tabs: short uncut bridges in a disc's outer cut line that hold it in the sheet.
//
// Arms point at 0°, 60°, 120°…, so the valleys between arms are at 30°, 90°, 150°…
// A tab goes where a ray from the centre along a valley first meets the outer outline:
// the point closest to the centre plate, away from the arms (which are fragile and
// hard to punch out). Two tabs sit in opposite valleys (90° and 270°) so the disc is
// held evenly. The gap is the tab width measured along the outline; no kerf correction.
import type { Pt, Ring } from "./geometry";

export const TAB_ANGLES = [90, 270];

/** A cut line: an open polyline, or a closed ring. */
export interface Line { pts: Pt[]; closed: boolean }

/** Arc-length position on the ring where the ray from the origin at `deg` first meets it. */
export function rayHit(ring: Ring, deg: number): { pos: number; point: Pt } | null {
  const a = (deg * Math.PI) / 180, dx = Math.cos(a), dy = Math.sin(a);
  let best: { s: number; pos: number; point: Pt } | null = null;
  let walked = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i], [x1, y1] = ring[(i + 1) % ring.length];
    const ex = x1 - x0, ey = y1 - y0, len = Math.hypot(ex, ey);
    // Solve (x0, y0) + t·e = s·d for t in [0, 1), s > 0.
    const den = ex * dy - ey * dx;
    if (den !== 0 && len > 0) {
      const t = (x0 * dy - y0 * dx) / -den;
      const s = (x0 * ey - y0 * ex) / -den;
      if (t >= 0 && t < 1 && s > 0 && (!best || s < best.s)) {
        best = { s, pos: walked + t * len, point: [x0 + t * ex, y0 + t * ey] };
      }
    }
    walked += len;
  }
  return best && { pos: best.pos, point: best.point };
}

/** Split a closed ring into open pieces, leaving a gap of `width` centred on each tab. */
export function addTabs(ring: Ring, width: number, angles = TAB_ANGLES): Line[] {
  const n = ring.length;
  const cum = [0];
  for (let i = 0; i < n; i++) {
    const [x0, y0] = ring[i], [x1, y1] = ring[(i + 1) % n];
    cum.push(cum[i] + Math.hypot(x1 - x0, y1 - y0));
  }
  const total = cum[n];
  const centres = angles.map((a) => rayHit(ring, a)?.pos).filter((p): p is number => p !== undefined).sort((a, b) => a - b);
  // Drop tabs that would overlap (tiny parts or very wide tabs).
  const tabs = centres.filter((c, i) => i === 0 || c - centres[i - 1] > width);
  if (!tabs.length || width <= 0 || width * tabs.length >= total) return [{ pts: ring, closed: true }];

  const at = (pos: number): Pt => {
    const p = ((pos % total) + total) % total;
    let i = 0;
    while (i < n - 1 && cum[i + 1] <= p) i++;
    const seg = cum[i + 1] - cum[i], t = seg ? (p - cum[i]) / seg : 0;
    const [x0, y0] = ring[i], [x1, y1] = ring[(i + 1) % n];
    return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
  };
  /** The outline from `from` to `to` (to > from, may wrap past the start). */
  const piece = (from: number, to: number): Pt[] => {
    const pts: Pt[] = [at(from)];
    for (let lap = 0; lap <= 1; lap++) {
      for (let i = 0; i < n; i++) {
        const p = cum[i] + lap * total;
        if (p > from && p < to) pts.push(ring[i]);
      }
    }
    pts.push(at(to));
    return pts;
  };
  return tabs.map((c, k) => {
    const next = k + 1 < tabs.length ? tabs[k + 1] : tabs[0] + total;
    return { pts: piece(c + width / 2, next - width / 2), closed: false };
  });
}
