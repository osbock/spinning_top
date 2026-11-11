#!/usr/bin/env python3
"""Parametric snowflake spinning-top discs for laser cutting.

Every style builds one half-arm inside a 30-degree wedge, mirrors it, and
repeats it 6 times, so every disc is perfectly 6-fold symmetric (balanced).

Examples
  python3 snowflake_top.py                          # classic style, all tiers
  python3 snowflake_top.py --style fractal
  python3 snowflake_top.py --style random --seed 7
  python3 snowflake_top.py --style plate,fractal,crystal   # center, middle, outer
  python3 snowflake_top.py --gallery                # preview of every style
  python3 snowflake_top.py --dowel 3/16in           # or --dowel 5 (mm); --fit sets press-fit
  python3 snowflake_top.py --fit-test --dowel 1/4in # strip of test holes to find your --fit
Styles: classic, fractal, random, plate, crystal
"""
import argparse, math, random
import numpy as np
from shapely.geometry import Polygon, Point, LineString, MultiPolygon
from shapely.ops import unary_union
from shapely import affinity

# ---- defaults (mm) ----
BIG_DIAMETER = 70.0   # tip-to-tip of the central disc
SCALE = 0.74          # each tier is this fraction of the one next to it
HOLE = 6.2            # 1/4" (6.35) dowel, cut slightly under for a press fit
MIN_FEATURE = 3.0     # thinnest arm/branch/wall so small discs don't snap
CORNER = 0.6          # corner rounding radius
GAP = 4.0             # spacing between parts on the sheet

T30 = math.tan(math.radians(30))
SEED = 1

# ---------- helpers ----------
def bar(p0, p1, w):
    return LineString([p0, p1]).buffer(w / 2, cap_style=2, join_style=2)

def hexagon(cx, cy, r, rot=0):
    return Polygon([(cx + r * math.cos(math.radians(a + rot)),
                     cy + r * math.sin(math.radians(a + rot))) for a in range(0, 360, 60)])

def wedge(R, margin=0.0):
    """Upper half of an arm's 30-degree sector, shrunk by margin from the 30-degree edge."""
    big = 3 * R
    p = Polygon([(0, 0), (big, 0), (big, big * T30)])
    return p.buffer(-margin, join_style=2) if margin else p

def clipped_bar(p0, p1, w, R):
    """A branch that stops before it would collide with the neighbouring arm."""
    line = LineString([p0, p1]).intersection(wedge(R * 1.2, w / 2 + 0.4).union(
        Polygon([(-1, -1), (3 * R, -1), (3 * R, 0.01), (-1, 0.01)])))
    if line.is_empty:
        return Polygon()
    return line.buffer(w / 2, cap_style=2, join_style=2)

def hub(R):
    return hexagon(0, 0, max(0.30 * R, HOLE / 2 + MIN_FEATURE + 1.5))

def widths(R, frac_main=0.09, frac_branch=0.07):
    return max(frac_main * R, MIN_FEATURE), max(frac_branch * R, MIN_FEATURE * 0.9)

# ---------- styles: each returns the UPPER half of one arm (y >= 0) ----------
def style_classic(R, rng):
    w, wb = widths(R)
    small = 0.09 * R < MIN_FEATURE * 0.85
    parts = [bar((0, 0), (0.86 * R, 0), w)]
    branches = ((0.52 * R, 0.34 * R),) if small else ((0.50 * R, 0.30 * R), (0.70 * R, 0.18 * R))
    a = math.radians(60)
    for r0, L in branches:
        parts.append(clipped_bar((r0, 0), (r0 + L * math.cos(a), L * math.sin(a)), wb, R))
    tr = (0.11 if small else 0.14) * R
    parts.append(hexagon(R - tr, 0, tr))
    return unary_union(parts)

def style_fractal(R, rng):
    """Recursive dendrite: every branch sprouts smaller branches at 60 degrees."""
    w, _ = widths(R)
    parts = []
    def grow(x, y, ang, L, width, depth):
        x2, y2 = x + L * math.cos(ang), y + L * math.sin(ang)
        parts.append(clipped_bar((x, y), (x2, y2), width, R))
        if depth == 0 or L * 0.42 < width * 1.6:
            return
        for t in (0.45, 0.75):
            bx, by = x + t * L * math.cos(ang), y + t * L * math.sin(ang)
            cl = L * (0.42 if t < 0.6 else 0.26)
            for da in (math.radians(60), -math.radians(60)):
                if ang == 0 and da < 0:
                    continue  # main arm: only grow on the upper side (mirrored later)
                grow(bx, by, ang + da, cl, max(width * 0.8, MIN_FEATURE * 0.9), depth - 1)
    grow(0, 0, 0.0, 0.92 * R, w, 3)
    parts.append(hexagon(0.92 * R, 0, max(0.08 * R, MIN_FEATURE * 0.8), 30))
    return unary_union(parts)

def style_random(R, rng):
    """Seeded random branches and tip ornaments; same seed = same snowflake."""
    w, wb = widths(R, 0.08 + rng.random() * 0.04, 0.06 + rng.random() * 0.03)
    reach = 0.80 + rng.random() * 0.1
    parts = [bar((0, 0), (reach * R, 0), w)]
    n = rng.randint(1, 2) if R < 22 else rng.randint(2, 4)
    spots = sorted(rng.uniform(0.38, 0.8) for _ in range(n))
    a = math.radians(60)
    last = -1
    for s in spots:
        if s - last < (wb * 1.8) / R:
            continue
        last = s
        L = R * rng.uniform(0.12, 0.38) * (1.1 - s * 0.5)
        x0 = s * R
        tip = (x0 + L * math.cos(a), L * math.sin(a))
        parts.append(clipped_bar((x0, 0), tip, wb, R))
        if rng.random() < 0.35 and L > 3 * MIN_FEATURE:   # little plate on the branch end
            parts.append(hexagon(*tip, wb * 0.9).intersection(wedge(R * 1.2, 0.4)))
    kind = rng.choice(["hex", "diamond", "fork"])
    tr = max(0.11 * R, MIN_FEATURE)
    tx = reach * R + tr * 0.6
    if kind == "hex":
        parts.append(hexagon(tx, 0, tr))
    elif kind == "diamond":
        parts.append(Polygon([(tx - tr, 0), (tx, tr * 0.8), (tx + tr, 0), (tx, -tr * 0.8)]))
    else:
        parts.append(bar((reach * R, 0), (R, 0), w))
        parts.append(clipped_bar((reach * R - tr * 0.3, 0), (reach * R + tr, tr * 1.3), wb, R))
    return unary_union(parts)

def style_plate(R, rng):
    """Sectored plate: a solid hexagonal plate with ridges and triangular windows,
    plus short arms with crystal tips."""
    w, wb = widths(R)
    pr = 0.66 * R
    plate = hexagon(0, 0, pr)
    tri = Polygon([(0, 0), (pr, 0), (pr * 0.5, pr * math.sin(math.radians(60)))])
    win = (tri.buffer(-MIN_FEATURE * 0.6, join_style=2)                       # ridges
              .intersection(hexagon(0, 0, pr - MIN_FEATURE / math.cos(math.radians(30))))  # rim
              .difference(hub(R).buffer(MIN_FEATURE * 0.5)))
    win = win.buffer(-0.8).buffer(0.8)
    if not win.is_empty and win.area > 2 * MIN_FEATURE ** 2:
        plate = plate.difference(win)
    half = Polygon([(0, 0), (3 * R, 0), (3 * R, 3 * R * T30)])
    parts = [plate.intersection(half), bar((0, 0), (R * 0.9, 0), w)]
    tr = max(0.10 * R, MIN_FEATURE)
    parts.append(hexagon(R - tr, 0, tr))
    if R > 20:
        parts.append(clipped_bar((pr * 0.97, 0), (pr * 0.97 + 0.07 * R, 0.12 * R), wb, R))
    return unary_union(parts)

def style_crystal(R, rng):
    """Packard's snowflake cellular automaton on a hex grid: an empty cell freezes when a
    set number of its neighbours are frozen. The grid is coarse on purpose so every
    line is >= MIN_FEATURE wide and every gap is cuttable. The seed picks the rule."""
    w = MIN_FEATURE
    pitch = w * 1.65                         # centre-to-centre spacing of cells
    N = max(3, int((R - w) / pitch))         # cells from centre to tip
    rule = ({1}, {1, 5}, {1, 3})[SEED % 3]       # same rule on every tier of a set
    keep_p = 0.85 if 3 in rule else 0.72
    def canon(q, r):            # same key for all 12 symmetric copies of a cell
        x, y, z = q, -q - r, r
        perms = [(x, y, z), (x, z, y), (y, x, z), (y, z, x), (z, x, y), (z, y, x)]
        return min(min(p, tuple(-v for v in p)) for p in perms)
    def keep(c, step):          # seeded, symmetric pruning gives each seed its own shape
        if step < 2 or c[1] == 0 or c[0] == -c[1] or c[0] == 0:
            return True         # never prune the hub or the main spines
        return random.Random(hash((SEED, canon(*c)))).random() < keep_p
    nb = [(1, 0), (-1, 0), (0, 1), (0, -1), (1, -1), (-1, 1)]
    frozen, links = {(0, 0)}, []
    dist = lambda q, r: (abs(q) + abs(r) + abs(q + r)) // 2
    for step in range(N):
        cand = {}
        for (q, r) in frozen:
            for dq, dr in nb:
                c = (q + dq, r + dr)
                if c not in frozen and dist(*c) <= N:
                    cand.setdefault(c, []).append((q, r))
        new = {c: p for c, p in cand.items() if len(p) in rule and keep(c, step)}
        if not new:
            break
        for c, parents in new.items():
            for p in parents:
                links.append((p, c))
        frozen |= set(new)
    xy = lambda q, r: (pitch * (q + r * 0.5), pitch * r * math.sqrt(3) / 2)
    def inside(q, r):            # closed half-sector: 0 <= r <= q
        return 0 <= r <= q
    parts = [bar(xy(*a), xy(*b), w) for a, b in links if inside(*a) and inside(*b)]
    parts += [hexagon(*xy(q, r), w * 0.62, 30) for q, r in frozen if inside(q, r)]
    parts.append(bar((0, 0), xy(N, 0), w))  # always a solid spine to the tip
    return unary_union(parts)

STYLES = {"classic": style_classic, "fractal": style_fractal, "random": style_random,
          "plate": style_plate, "crystal": style_crystal}

# ---------- assembly ----------
def largest(g):
    """Keep only the piece attached to the hub."""
    if isinstance(g, MultiPolygon):
        return max(g.geoms, key=lambda p: (p.covers(Point(0, 0)), p.area))
    return g

def snowflake(R, style="classic", seed=1):
    global SEED
    SEED = seed
    rng = random.Random(seed * 1000 + round(R * 10))
    half = STYLES[style](R, rng).buffer(0)
    half = half.intersection(Polygon([(-R, 0), (2 * R, 0), (2 * R, 2 * R), (-R, 2 * R)]))
    arm = unary_union([half, affinity.scale(half, 1, -1, origin=(0, 0))])
    shape = unary_union([hub(R)] + [affinity.rotate(arm, 60 * k, origin=(0, 0)) for k in range(6)])
    shape = shape.buffer(CORNER).buffer(-2 * CORNER).buffer(CORNER)   # round corners
    shape = largest(shape)                                             # drop any loose bits
    shape = Polygon(shape.exterior, [i for i in shape.interiors          # drop specks too
                     if Polygon(i).area > MIN_FEATURE ** 2])               # small to cut
    # keep it inside the requested tip-to-tip size
    ext = max(math.hypot(x, y) for x, y in shape.exterior.coords)
    if ext > R:
        shape = affinity.scale(shape, R / ext, R / ext, origin=(0, 0))
    return shape.difference(Point(0, 0).buffer(HOLE / 2, 64))

def path_d(geom, dx, dy):
    def ring(c):
        return "M" + " L".join(f"{x + dx:.3f},{-y + dy:.3f}" for x, y in c.coords) + " Z"
    return " ".join([ring(geom.exterior)] + [ring(i) for i in geom.interiors])

def write_svg(rows, fname, preview=False):
    """rows: list of rows; each row is a list of geometries laid out left to right."""
    out, y, W = [], GAP, 0
    for row in rows:
        h = max(g.bounds[3] - g.bounds[1] for g in row)
        x = GAP
        for g in row:
            minx, miny, maxx, maxy = g.bounds
            out.append(f'  <path d="{path_d(g, x - minx, y + h / 2)}"/>')
            x += (maxx - minx) + GAP
        W, y = max(W, x), y + h + GAP
    style = ('fill="#c9a87a" stroke="#6b4f2a" stroke-width="0.3"' if preview
             else 'fill="none" stroke="#FF0000" stroke-width="0.05"')
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W:.2f}mm" height="{y:.2f}mm" '
           f'viewBox="0 0 {W:.2f} {y:.2f}">\n <g {style} fill-rule="evenodd">\n'
           + "\n".join(out) + "\n </g>\n</svg>")
    open(fname, "w").write(svg)
    return W, y

def fit_test(d_mm, fits, fname="fit_test.svg"):
    """One strip with a hole per fit value. Labels are engraved (blue); holes and outline
    are cut (red). A notch at the left end marks the loosest hole."""
    fits = sorted(fits)
    pitch = max(d_mm + 6, 13.0)
    hole_y, label_y = 5 + d_mm / 2, d_mm + 11
    W, H = pitch * len(fits) + 4, d_mm + 16
    out = Polygon([(0, 0), (W, 0), (W, H), (0, H)]).buffer(-1.5).buffer(1.5)
    out = out.difference(Polygon([(0, H / 2 - 2), (3, H / 2), (0, H / 2 + 2)]))   # end notch
    cuts, labels = [], []
    for i, f in enumerate(fits):
        cx = 2 + pitch * (i + 0.5)
        hole = d_mm - f
        cuts.append(f'  <circle cx="{cx:.3f}" cy="{hole_y:.3f}" r="{hole / 2:.3f}"/>')
        labels.append(f'  <text x="{cx:.3f}" y="{label_y:.3f}">{f:+.2f}</text>')
        labels.append(f'  <text x="{cx:.3f}" y="{label_y + 3.6:.3f}">{hole:.2f}</text>')
    ring = "M" + " L".join(f"{x:.3f},{y:.3f}" for x, y in out.exterior.coords) + " Z"
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W:.2f}mm" height="{H:.2f}mm" '
           f'viewBox="0 0 {W:.2f} {H:.2f}">\n'
           f' <g fill="none" stroke="#FF0000" stroke-width="0.05">\n  <path d="{ring}"/>\n'
           + "\n".join(cuts) + "\n </g>\n"
           ' <g fill="#0000FF" font-family="Arial, Helvetica, sans-serif" font-size="2.8" '
           'text-anchor="middle">\n' + "\n".join(labels) + "\n </g>\n</svg>")
    open(fname, "w").write(svg)
    print(f"Dowel {d_mm:.2f} mm. Wrote {fname}: {W:.0f} x {H:.0f} mm strip, loosest hole at the notched end")
    print("  fit    hole")
    for f in fits:
        print(f"  {f:+.2f}  {d_mm - f:.2f} mm")

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--style", default="classic",
                    help="one style, or three comma-separated for center,middle,outer")
    ap.add_argument("--seed", type=int, default=1, help="variation for random/crystal/etc.")
    ap.add_argument("--size", type=float, default=BIG_DIAMETER, help="center disc tip-to-tip mm")
    ap.add_argument("--scale", type=float, default=SCALE)
    ap.add_argument("--gallery", action="store_true", help="preview every style at every size")
    ap.add_argument("--dowel", default="6.35",
                    help='dowel diameter: mm (6.35) or inches with "in" (0.25in, 1/4in, 3/16in)')
    ap.add_argument("--fit", type=float, default=0.15,
                    help="mm to cut the hole under the dowel size (0 = exact, negative = looser)")
    ap.add_argument("--fit-test", action="store_true",
                    help="cut a strip of test holes at a range of --fit values (fit_test.svg)")
    ap.add_argument("--fit-range", default="-0.15,0.35,0.05",
                    help="min,max,step of fit values for --fit-test (mm)")
    ap.add_argument("--out", default="snowflake_top_cut.svg")
    a = ap.parse_args()

    global HOLE
    d = a.dowel.strip().lower().replace('"', "in")
    if d.endswith("in"):
        num = d[:-2].strip()
        if "/" in num:
            n, den = num.split("/")
            num = float(n) / float(den)
        d_mm = float(num) * 25.4
    else:
        d_mm = float(d.replace("mm", ""))
    HOLE = d_mm - a.fit
    if a.fit_test:
        lo, hi, st = (float(v) for v in a.fit_range.split(","))
        fits = [round(lo + i * st, 3) for i in range(int(round((hi - lo) / st)) + 1)]
        fit_test(d_mm, fits)
        return
    print(f"Dowel {d_mm:.2f} mm -> hole cut at {HOLE:.2f} mm")

    diam = [a.size, a.size * a.scale, a.size * a.scale ** 2]
    if a.gallery:
        rows = [[snowflake(d / 2, st, a.seed) for d in diam] for st in STYLES]
        write_svg(rows, "gallery.svg", preview=True)
        print("wrote gallery.svg  (rows top to bottom: " + ", ".join(STYLES) + ")")
        return
    styles = a.style.split(",")
    styles = styles * 3 if len(styles) == 1 else styles
    assert len(styles) == 3 and all(s in STYLES for s in styles), f"styles: {list(STYLES)}"
    c, m, o = (snowflake(d / 2, st, a.seed) for d, st in zip(diam, styles))
    parts = [c, m, m, o, o]
    W, H = write_svg([parts], a.out)
    write_svg([parts], a.out.replace(".svg", "_preview.svg"), preview=True)
    for name, d, st in zip(("Center x1", "Middle x2", "Outer x2"), diam, styles):
        print(f"{name}: {d:.1f} mm  ({st})")
    print(f"Sheet {W:.0f} x {H:.0f} mm -> {a.out}")

if __name__ == "__main__":
    main()
