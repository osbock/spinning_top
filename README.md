# spinning_top
Laser cut spinning top designs and generator

## Designs

- [Snowflake tops](snowflake/): a parametric generator for stacked snowflake discs on a
  dowel spindle (one large center disc, two middle, two small). It has five styles
  (classic, fractal, random, plate and a hex-grid crystal automaton) and a
  configurable dowel size and press fit. It also makes a fit-test strip for finding the
  right hole size. Every disc is 6-fold symmetric, so it stays balanced.

## Web app

[`web/`](web/) is a TypeScript version of the snowflake generator that runs in the browser
and publishes to GitHub Pages: pick styles per tier, a seed, size and dowel, see the cut
sheet, an assembled (spinning) view, every style at once and the fit-test strip, then
download the SVGs. Settings live in the URL, so a link reopens the exact top.

```
cd web
npm install
npm run dev      # local server
npm test         # includes parity tests against snowflake_top.py when shapely is installed
npm run build    # static site in web/dist
```

`.github/workflows/pages.yml` tests, builds and deploys it on every push to `main`
(set the repository's Pages source to "GitHub Actions" once).
