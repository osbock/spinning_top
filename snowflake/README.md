# Snowflake spinning tops

Laser-cut snowflake discs stacked on a dowel: one large center disc, two middle
discs and two small outer discs. Every style is built from one mirrored half-arm
repeated six times, so every disc is perfectly balanced.

Requires: `pip install -r requirements.txt`

## Usage

```
python3 snowflake_top.py                                   # classic style, 1/4" dowel
python3 snowflake_top.py --style fractal                   # one style for all tiers
python3 snowflake_top.py --style plate,fractal,crystal     # center, middle, outer
python3 snowflake_top.py --style random --seed 7           # seed varies random/crystal
python3 snowflake_top.py --gallery --seed 3                # preview every style
python3 snowflake_top.py --dowel 3/16in --fit 0.1          # dowel size (mm or in), press fit
python3 snowflake_top.py --fit-test --dowel 1/4in          # strip of test holes
```

Styles: `classic`, `fractal`, `random`, `plate`, `crystal` (Packard hex-grid automaton),
plus plain `circle` and `hexagon` discs, which mix with the snowflakes
(e.g. `--style hexagon,classic,circle`).

Other options: `--size` (center disc tip-to-tip, mm, default 70), `--scale`
(size ratio between tiers, default 0.74), `--fit-range min,max,step`, `--out`.

## Output

- `snowflake_top_cut.svg`: red hairline cut paths in mm, 1 center + 2 middle + 2 outer.
- `*_preview.svg` / `.png`: filled previews.
- `gallery.svg` / `.png`: every style at every size.
- `fit_test.svg`: cut holes (red) and engraved labels (blue). The notched end is the loosest
  hole. Use the label of the hole that grips best as `--fit`.

The minimum arm and gap width is 3 mm (`MIN_FEATURE` in the script).

## Web version

The same generator runs in the browser: see [`../web`](../web). A seed gives the same
snowflake in both, since the web app reproduces Python's `random` and `hash()`.
