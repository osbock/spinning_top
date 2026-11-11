// The seeded styles depend on Python's random module and hash(); check the port
// against python3 itself (no packages needed). Skipped without python3.
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { PyRandom, pyHash, pyRound } from "../src/core/pyrandom";
import { parseDowel } from "../src/core/snowflake";

const py = (code: string) => execFileSync(process.env.PYTHON ?? "python3", ["-c", code], { encoding: "utf8" }).trim();
const hasPython = (() => { try { py("1"); return true; } catch { return false; } })();

describe.skipIf(!hasPython)("Python random/hash", () => {
  it("random, randint, uniform, choice", () => {
    for (const seed of [0, 1, 7, 1350, 2**40 + 3, -5]) {
      const r = new PyRandom(seed);
      const ts = [r.random(), r.randint(1, 2), r.randint(2, 4), r.uniform(0.38, 0.8), r.choice([0, 1, 2]), r.random()];
      const ref = JSON.parse(py(`import random,json;r=random.Random(${seed});print(json.dumps([r.random(),r.randint(1,2),r.randint(2,4),r.uniform(0.38,0.8),r.choice([0,1,2]),r.random()]))`));
      expect(ts).toEqual(ref);
    }
  });
  it("hash of nested int tuples", () => {
    const keys = [[1, [0, 0, 0]], [7, [-3, 1, 2]], [42, [-5, -1, 6]], [-1, [-1, -1, -1]], [3, [10, -20, 10]]];
    const ref = py(`print(*[hash(k) for k in ${JSON.stringify(keys).replace(/\[/g, "(").replace(/\]/g, ")")}])`).split(" ");
    expect(keys.map((k) => String(pyHash(k)))).toEqual(ref);
  });
});

describe("helpers", () => {
  it("rounds halves to even like Python", () => {
    expect([0.5, 1.5, 2.5, 259.5, 350].map(pyRound)).toEqual([0, 2, 2, 260, 350]);
  });
  it("reads dowel sizes", () => {
    expect(parseDowel("1/4in")).toBeCloseTo(6.35);
    expect(parseDowel('3/16"')).toBeCloseTo(4.7625);
    expect(parseDowel("0.25 in")).toBeCloseTo(6.35);
    expect(parseDowel("5mm")).toBe(5);
    expect(parseDowel("6.35")).toBe(6.35);
    expect(() => parseDowel("abc")).toThrow();
  });
});
