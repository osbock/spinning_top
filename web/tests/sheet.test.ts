import { describe, expect, it } from "vitest";
import { area, rotate, difference, union } from "../src/core/geometry";
import { buildGallery, buildTop, DEFAULTS, fitTest } from "../src/core/sheet";
import { STYLES } from "../src/core/snowflake";

describe("sheets", () => {
  it("lays out the default top like snowflake_top.py (273.33 x 68.62 mm)", () => {
    const b = buildTop(DEFAULTS);
    expect(b.cut.w).toBeCloseTo(273.33, 1);
    expect(b.cut.h).toBeCloseTo(68.62, 1);
    expect(b.cut.svg.match(/<path /g)).toHaveLength(5);
    expect(b.cut.svg).toContain('stroke="#FF0000" stroke-width="0.05"');
    expect(b.hole).toBeCloseTo(6.2);
  });
  it("makes a fit-test hole per step, loosest first", () => {
    const f = fitTest(DEFAULTS);
    expect(f.svg.match(/<circle /g)).toHaveLength(11);
    expect(f.table).toContain("-0.15  6.50 mm");
  });
  it("every style is 6-fold symmetric and has a dowel hole", () => {
    const { rows } = buildGallery({ ...DEFAULTS, seed: 5 });
    expect(rows.map((r) => r.length)).toEqual(STYLES.map(() => 3));
    for (const d of rows.flat()) {
      const turned = rotate(d.shape, 60);
      const xor = area(difference(union(d.shape, turned), difference(d.shape, difference(d.shape, turned))));
      expect(xor / area(d.shape)).toBeLessThan(0.002);
      expect(d.poly.holes.length).toBeGreaterThanOrEqual(1);
    }
  });
  it("plain circle and hexagon discs fill their outline", () => {
    const b = buildTop({ ...DEFAULTS, styles: ["hexagon", "circle", "classic"] });
    const [hex, circ] = b.discs;
    const R = 35, r = 70 * 0.74 / 2;
    // Rounded-corner hexagon: a bit under the sharp hexagon's area, tip to tip still about 2R.
    const sharpHex = (3 * Math.sqrt(3) / 2) * R * R, hole = Math.PI * 3.1 ** 2;
    expect(area(hex.shape)).toBeLessThan(sharpHex - hole);
    expect(area(hex.shape)).toBeGreaterThan(sharpHex - hole - 1);
    expect(Math.max(...hex.poly.outer.map(([x, y]) => Math.hypot(x, y)))).toBeCloseTo(R, 0);
    expect(area(circ.shape) / (Math.PI * r * r - hole)).toBeCloseTo(1, 2);
    for (const d of [hex, circ]) expect(d.poly.holes).toHaveLength(1);
    expect(b.summary).toContain("(hexagon)");
  });
  it("rejects a fit bigger than the dowel", () => {
    expect(() => buildTop({ ...DEFAULTS, dowel: "3mm", fit: 3 })).toThrow();
  });
});
