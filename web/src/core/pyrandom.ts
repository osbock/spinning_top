// Python's random.Random (Mersenne Twister) and hash() for ints and tuples,
// so a given seed draws the same snowflake here as in snowflake_top.py.

const N = 624, M = 397;

export class PyRandom {
  private mt = new Uint32Array(N);
  private i = N + 1;

  /** random.Random(seed) for an integer seed (any size; the sign is ignored, like Python). */
  constructor(seed: number | bigint) {
    let n = BigInt(seed);
    if (n < 0n) n = -n;
    const key: number[] = [];
    do {
      key.push(Number(n & 0xffffffffn));
      n >>= 32n;
    } while (n > 0n);
    this.initByArray(key);
  }

  private initGenrand(s: number): void {
    const mt = this.mt;
    mt[0] = s >>> 0;
    for (let i = 1; i < N; i++) {
      const prev = mt[i - 1] ^ (mt[i - 1] >>> 30);
      mt[i] = (Math.imul(1812433253, prev) + i) >>> 0;
    }
    this.i = N;
  }

  private initByArray(key: number[]): void {
    const mt = this.mt;
    this.initGenrand(19650218);
    let i = 1, j = 0;
    for (let k = Math.max(N, key.length); k; k--) {
      const prev = mt[i - 1] ^ (mt[i - 1] >>> 30);
      mt[i] = ((mt[i] ^ Math.imul(prev, 1664525)) + key[j] + j) >>> 0;
      i++; j++;
      if (i >= N) { mt[0] = mt[N - 1]; i = 1; }
      if (j >= key.length) j = 0;
    }
    for (let k = N - 1; k; k--) {
      const prev = mt[i - 1] ^ (mt[i - 1] >>> 30);
      mt[i] = ((mt[i] ^ Math.imul(prev, 1566083941)) - i) >>> 0;
      i++;
      if (i >= N) { mt[0] = mt[N - 1]; i = 1; }
    }
    mt[0] = 0x80000000;
  }

  private uint32(): number {
    const mt = this.mt;
    if (this.i >= N) {
      for (let k = 0; k < N; k++) {
        const y = (mt[k] & 0x80000000) | (mt[(k + 1) % N] & 0x7fffffff);
        mt[k] = mt[(k + M) % N] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0);
      }
      this.i = 0;
    }
    let y = mt[this.i++];
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  }

  /** random.random(): a float in [0, 1) with 53 random bits. */
  random(): number {
    const a = this.uint32() >>> 5, b = this.uint32() >>> 6;
    return (a * 67108864 + b) / 9007199254740992;
  }

  /** random.getrandbits(k) for 0 < k <= 32. */
  private bits(k: number): number {
    return this.uint32() >>> (32 - k);
  }

  private below(n: number): number {
    const k = Math.floor(Math.log2(n)) + 1; // n.bit_length()
    let r = this.bits(k);
    while (r >= n) r = this.bits(k);
    return r;
  }

  /** random.randint(a, b), inclusive. */
  randint(a: number, b: number): number {
    return a + this.below(b - a + 1);
  }

  uniform(a: number, b: number): number {
    return a + (b - a) * this.random();
  }

  choice<T>(seq: readonly T[]): T {
    return seq[this.below(seq.length)];
  }
}

// ---- hash() for ints and (nested) tuples of ints, 64-bit CPython >= 3.8 ----

type HashKey = number | bigint | readonly HashKey[];

const U64 = (x: bigint) => BigInt.asUintN(64, x);
const P1 = 11400714785074694791n, P2 = 14029467366897019727n, P5 = 2870177450012600261n;
const MODULUS = (1n << 61n) - 1n;

function hashU(v: HashKey): bigint {
  if (typeof v === "number" || typeof v === "bigint") {
    const n = BigInt(v);
    let h = (n < 0n ? -n : n) % MODULUS;
    if (n < 0n) h = -h;
    if (h === -1n) h = -2n;
    return U64(h);
  }
  let acc = P5;
  for (const item of v) {
    acc = U64(acc + hashU(item) * P2);
    acc = U64((acc << 31n) | (acc >> 33n));
    acc = U64(acc * P1);
  }
  acc = U64(acc + (BigInt(v.length) ^ (P5 ^ 3527539n)));
  if (acc === U64(-1n)) return 1546275796n;
  return acc;
}

/** Python's hash(v) as a signed 64-bit integer. */
export function pyHash(v: HashKey): bigint {
  return BigInt.asIntN(64, hashU(v));
}

/** Python's round(x): halves go to the even neighbour. */
export function pyRound(x: number): number {
  const f = Math.floor(x), diff = x - f;
  if (diff > 0.5) return f + 1;
  if (diff < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}
