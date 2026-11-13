// Geometric parity with snowflake_top.py: the same style, size and seed should give
// the same disc. Shapely and Clipper round corners slightly differently, so discs
// are compared by area and by the area where they differ. Skipped when python3
// can't import shapely (set PYTHON to pick an interpreter).
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { area, difference, polygon, type Ring, union } from "../src/core/geometry";
import { DEFAULT_PARAMS, snowflake, type Style, STYLES } from "../src/core/snowflake";

const PY = process.env.PYTHON ?? "python3";
const SCRIPT = resolve(__dirname, "dump_python.py");

function hasShapely(): boolean {
  try {
    execFileSync(PY, ["-c", "import shapely"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

type Case = [number, Style, number, number]; // R, style, seed, hole
const CASES: Case[] = [];
for (const style of STYLES) {
  for (const seed of [1, 2, 3, 7, 42]) {
    for (const R of [35, 25.9, 19.166]) CASES.push([R, style, seed, 6.2]);
    if (style !== "random" && style !== "crystal") break; // seed-independent
  }
}
CASES.push([40, "random", 11, 4.6], [30, "crystal", 5, 7.8], [20, "fractal", 1, 4.6]);

describe.skipIf(!hasShapely())("parity with snowflake_top.py", () => {
  let py: { outer: Ring; holes: Ring[]; area: number }[] = [];
  beforeAll(() => {
    py = JSON.parse(execFileSync(PY, [SCRIPT, JSON.stringify(CASES)], { encoding: "utf8", maxBuffer: 1 << 28 }));
  });
  CASES.forEach(([R, style, seed, hole], i) => {
    it(`${style} R=${R} seed=${seed} hole=${hole}`, () => {
      const ts = snowflake(R, style, seed, { ...DEFAULT_PARAMS, hole });
      const ref = polygon(py[i].outer, py[i].holes);
      const a = area(ts.shape);
      expect(Math.abs(a - py[i].area) / py[i].area).toBeLessThan(0.001);
      const xor = area(difference(union(ts.shape, ref), difference(ts.shape, difference(ts.shape, ref))));
      expect(xor / py[i].area).toBeLessThan(0.002);
      expect(ts.poly.holes.length).toBe(py[i].holes.length);
    });
  });
});
