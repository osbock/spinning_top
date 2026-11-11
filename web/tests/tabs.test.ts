// Punch-out tabs: two gaps of the requested width in each disc's outer cut line,
// in opposite valleys between arms, next to the centre plate rather than on an arm.
import { describe, expect, it } from "vitest";
import { buildTop, DEFAULTS, diametersFor } from "../src/core/sheet";
import { snowflake, STYLES } from "../src/core/snowflake";
import { addTabs, rayHit, TAB_ANGLES } from "../src/core/tabs";

const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

describe("punch-out tabs", () => {
  for (const style of STYLES) {
    for (const seed of [1, 2, 3, 7]) {
      it(`${style} seed ${seed}`, () => {
        diametersFor(DEFAULTS).forEach((d) => {
          const R = d / 2;
          const disc = snowflake(R, style, seed, { hole: 6.2, minFeature: 3, corner: 0.6 });
          const pieces = addTabs(disc.poly.outer, 0.5);
          expect(pieces).toHaveLength(2);
          expect(pieces.every((p) => !p.closed)).toBe(true);
          // Each gap spans 0.5 mm of outline (its chord can only be shorter).
          for (let k = 0; k < 2; k++) {
            const gap = dist(pieces[k].pts.at(-1)!, pieces[(k + 1) % 2].pts[0]);
            expect(gap).toBeGreaterThan(0.45);
            expect(gap).toBeLessThanOrEqual(0.5 + 1e-9);
          }
          // Tabs sit in the valley between arms, inside the arms' reach, opposite each other.
          const hits = TAB_ANGLES.map((a) => rayHit(disc.poly.outer, a)!);
          for (const h of hits) {
            const r = Math.hypot(...h.point);
            process.env.TAB_REPORT && process.stderr.write(`${style} ${seed} R=${R.toFixed(1)} r/R=${(r / R).toFixed(2)}\n`);
            expect(Math.abs(h.point[0])).toBeLessThan(1e-6); // straight up / down: a valley, not an arm
            expect(r).toBeLessThan(0.75 * R);
          }
        });
      });
    }
  }

  it("only the cut sheet gets tabs, and only when asked", () => {
    const plain = buildTop(DEFAULTS), tabbed = buildTop({ ...DEFAULTS, tabs: true });
    const opens = (svg: string) => [...svg.matchAll(/ d="([^"]*)"/g)]
      .flatMap((m) => m[1].split("M").slice(1)).filter((p) => !p.trimEnd().endsWith("Z")).length;
    expect(opens(plain.cut.svg)).toBe(0);
    expect(opens(tabbed.cut.svg)).toBe(10); // 5 discs × 2 pieces
    expect(tabbed.preview.svg).toBe(plain.preview.svg);
    expect(tabbed.summary).toContain("Tabs");
  });

  it("keeps the outline closed when tabs can't fit", () => {
    const ring: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    expect(addTabs(ring, 10)).toEqual([{ pts: ring, closed: true }]);
  });
});
