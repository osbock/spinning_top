// Sheet layout and SVG output, matching write_svg and fit_test in snowflake_top.py.
import { bounds, buffer, difference, polygon, polygons, type Ring } from "./geometry";
import { DEFAULT_PARAMS, type Disc, parseDowel, snowflake, type Style, STYLES } from "./snowflake";

export interface Settings {
  styles: [Style, Style, Style]; // center, middle, outer
  seed: number;
  size: number;   // center disc tip-to-tip, mm
  scale: number;  // size ratio between tiers
  dowel: string;  // mm or inches ("1/4in")
  fit: number;    // mm to cut the hole under the dowel size
  minFeature: number;
  corner: number;
  gap: number;    // spacing between parts on the sheet
  fitMin: number; fitMax: number; fitStep: number;
}

export const DEFAULTS: Settings = {
  styles: ["classic", "classic", "classic"],
  seed: 1, size: 70, scale: 0.74, dowel: "1/4in", fit: 0.15,
  minFeature: 3, corner: 0.6, gap: 4,
  fitMin: -0.15, fitMax: 0.35, fitStep: 0.05,
};

export const TIERS = ["Center", "Middle", "Outer"] as const;
export const COUNTS = [1, 2, 2];

export interface SvgSheet { svg: string; w: number; h: number }

const f3 = (n: number) => (Math.abs(n) < 5e-4 ? 0 : n).toFixed(3);

function ringD(r: Ring, dx: number, dy: number): string {
  return "M" + r.map(([x, y]) => `${f3(x + dx)},${f3(-y + dy)}`).join(" L") + " Z";
}

export function discD(d: Disc, dx: number, dy: number): string {
  return [d.poly.outer, ...d.poly.holes].map((r) => ringD(r, dx, dy)).join(" ");
}

const CUT = 'fill="none" stroke="#FF0000" stroke-width="0.05"';
const WOOD = 'fill="#c9a87a" stroke="#6b4f2a" stroke-width="0.3"';

/** Lay out rows of discs left to right; preview = filled wood instead of red hairlines. */
export function writeSvg(rows: Disc[][], gap: number, preview = false): SvgSheet {
  const out: string[] = [];
  let y = gap, W = 0;
  for (const row of rows) {
    const bs = row.map((d) => bounds(d.shape));
    const h = Math.max(...bs.map((b) => b[3] - b[1]));
    let x = gap;
    row.forEach((d, i) => {
      const [minx, , maxx] = bs[i];
      out.push(`  <path d="${discD(d, x - minx, y + h / 2)}"/>`);
      x += maxx - minx + gap;
    });
    W = Math.max(W, x);
    y += h + gap;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W.toFixed(2)}mm" height="${y.toFixed(2)}mm" ` +
    `viewBox="0 0 ${W.toFixed(2)} ${y.toFixed(2)}">\n <g ${preview ? WOOD : CUT} fill-rule="evenodd">\n` +
    out.join("\n") + "\n </g>\n</svg>\n";
  return { svg, w: W, h: y };
}

export interface Build {
  dowelMm: number;
  hole: number;
  diameters: number[];
  discs: Disc[]; // center, middle, outer (one of each)
  cut: SvgSheet;
  preview: SvgSheet;
  summary: string;
}

export function holeFor(s: Settings): { dowelMm: number; hole: number } {
  const dowelMm = parseDowel(s.dowel);
  const hole = dowelMm - s.fit;
  if (!(hole > 0)) throw new Error("The fit is larger than the dowel: no hole left");
  return { dowelMm, hole };
}

const paramsFor = (s: Settings, hole: number) => ({ ...DEFAULT_PARAMS, hole, minFeature: s.minFeature, corner: s.corner });

export function diametersFor(s: Settings): number[] {
  return [s.size, s.size * s.scale, s.size * s.scale ** 2];
}

/** The 5-disc top: 1 center, 2 middle, 2 outer. */
export function buildTop(s: Settings): Build {
  const { dowelMm, hole } = holeFor(s);
  const diameters = diametersFor(s);
  const discs = diameters.map((d, i) => snowflake(d / 2, s.styles[i], s.seed, paramsFor(s, hole)));
  const parts = [discs[0], discs[1], discs[1], discs[2], discs[2]];
  const cut = writeSvg([parts], s.gap);
  const preview = writeSvg([parts], s.gap, true);
  const lines = [`Dowel ${dowelMm.toFixed(2)} mm → hole cut at ${hole.toFixed(2)} mm`];
  TIERS.forEach((t, i) => lines.push(`${`${t} ×${COUNTS[i]}`.padEnd(10)} ${diameters[i].toFixed(1)} mm  (${s.styles[i]})`));
  lines.push(`Sheet ${cut.w.toFixed(0)} × ${cut.h.toFixed(0)} mm`);
  return { dowelMm, hole, diameters, discs, cut, preview, summary: lines.join("\n") };
}

/** Every style at every size, one row per style (preview colours). */
export function buildGallery(s: Settings): { sheet: SvgSheet; rows: Disc[][] } {
  const { hole } = holeFor(s);
  const rows = STYLES.map((st) => diametersFor(s).map((d) => snowflake(d / 2, st, s.seed, paramsFor(s, hole))));
  return { sheet: writeSvg(rows, s.gap, true), rows };
}

export function fitValues(s: Settings): number[] {
  const { fitMin: lo, fitMax: hi, fitStep: st } = s;
  if (!(st > 0) || hi < lo) throw new Error("Fit range needs min ≤ max and a step above 0");
  const n = Math.round((hi - lo) / st) + 1;
  if (n > 40) throw new Error("Fit range would make more than 40 holes");
  return Array.from({ length: n }, (_, i) => Math.round((lo + i * st) * 1000) / 1000).sort((a, b) => a - b);
}

/** A strip with a hole per fit value. Labels are engraved (blue); holes and outline are cut
 *  (red). A notch at the left end marks the loosest hole. */
export function fitTest(s: Settings): SvgSheet & { table: string } {
  const d = parseDowel(s.dowel);
  const fits = fitValues(s);
  const pitch = Math.max(d + 6, 13);
  const holeY = 5 + d / 2, labelY = d + 11;
  const W = pitch * fits.length + 4, H = d + 16;
  let out = buffer(buffer(polygon([[0, 0], [W, 0], [W, H], [0, H]]), -1.5), 1.5);
  out = difference(out, polygon([[0, H / 2 - 2], [3, H / 2], [0, H / 2 + 2]])); // end notch
  const cuts: string[] = [], labels: string[] = [];
  const sign = (f: number) => (f < 0 ? "-" : "+") + Math.abs(f).toFixed(2);
  fits.forEach((f, i) => {
    const cx = 2 + pitch * (i + 0.5), hole = d - f;
    if (hole <= 0) throw new Error("A fit value is larger than the dowel");
    cuts.push(`  <circle cx="${f3(cx)}" cy="${f3(holeY)}" r="${f3(hole / 2)}"/>`);
    labels.push(`  <text x="${f3(cx)}" y="${f3(labelY)}">${sign(f)}</text>`);
    labels.push(`  <text x="${f3(cx)}" y="${f3(labelY + 3.6)}">${hole.toFixed(2)}</text>`);
  });
  const ring = polygons(out)[0].outer.map(([x, y]) => `${f3(x)},${f3(y)}`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W.toFixed(2)}mm" height="${H.toFixed(2)}mm" ` +
    `viewBox="0 0 ${W.toFixed(2)} ${H.toFixed(2)}">\n` +
    ` <g fill="none" stroke="#FF0000" stroke-width="0.05">\n  <path d="M${ring.join(" L")} Z"/>\n` +
    cuts.join("\n") + "\n </g>\n" +
    ' <g fill="#0000FF" font-family="Arial, Helvetica, sans-serif" font-size="2.8" text-anchor="middle">\n' +
    labels.join("\n") + "\n </g>\n</svg>\n";
  const table = [`Dowel ${d.toFixed(2)} mm: ${W.toFixed(0)} × ${H.toFixed(0)} mm strip, loosest hole at the notched end`,
    "  fit    hole", ...fits.map((f) => `  ${sign(f)}  ${(d - f).toFixed(2)} mm`)].join("\n");
  return { svg, w: W, h: H, table };
}
