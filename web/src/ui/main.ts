// Snowflake top web app: settings form, live preview and downloads.
import { strToU8, zipSync } from "fflate";
import { buildGallery, buildTop, type Build, DEFAULTS, discD, fitTest, holeFor, type Settings, TIERS } from "../core/sheet";
import { type Style, STYLES } from "../core/snowflake";
import { Preview } from "./preview";
import "./style.css";

type NumKey = Exclude<keyof Settings, "styles" | "dowel">;
interface NumSpec { key: NumKey; label: string; step: number; min: number; max: number; int?: boolean }

const STYLE_HELP: Record<Style, string> = {
  classic: "Classic: a straight arm with two pairs of branches and a hexagon tip",
  fractal: "Fractal: branches that sprout smaller branches",
  random: "Random: seeded branches and tip ornaments",
  plate: "Plate: a sectored hexagonal plate with windows",
  crystal: "Crystal: a hex-grid growth automaton; the seed picks the rule",
};
const DOWELS = ["1/8in", "3/16in", "1/4in", "5/16in", "3/8in", "3mm", "4mm", "5mm", "6mm", "8mm", "10mm"];
const NUMBERS: Record<string, NumSpec[]> = {
  Size: [
    { key: "size", label: "Center disc, tip to tip (mm)", step: 1, min: 15, max: 400 },
    { key: "scale", label: "Size ratio between tiers", step: 0.01, min: 0.3, max: 1 },
  ],
  Advanced: [
    { key: "minFeature", label: "Thinnest arm or gap (mm)", step: 0.5, min: 0.5, max: 10 },
    { key: "corner", label: "Corner rounding (mm)", step: 0.1, min: 0, max: 3 },
    { key: "gap", label: "Part spacing (mm)", step: 0.5, min: 0, max: 50 },
  ],
  "Fit test strip": [
    { key: "fitMin", label: "Tightest-to-loosest from (mm)", step: 0.05, min: -3, max: 3 },
    { key: "fitMax", label: "to (mm)", step: 0.05, min: -3, max: 3 },
    { key: "fitStep", label: "Step (mm)", step: 0.01, min: 0.01, max: 2 },
  ],
};
const ALL_NUMBERS: NumSpec[] = [
  { key: "seed", label: "Seed", step: 1, min: -1e9, max: 1e9, int: true },
  { key: "fit", label: "Press fit (mm under dowel)", step: 0.05, min: -3, max: 3 },
  ...Object.values(NUMBERS).flat(),
];

const SETTINGS_KEY = "snowflake-top-settings";
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// ---------------------------------------------------------------- state

let settings: Settings = initialSettings();
let view: "top" | "assembled" | "gallery" | "fit" = "top";
let top: Build | null = null;
let gallery: { key: string; svg: string; w: number; h: number } | null = null;
let timer = 0;

const preview = new Preview($("preview"));
const styleInputs: HTMLSelectElement[] = [];
const allStyles = document.createElement("select");
const numInputs = new Map<NumKey, HTMLInputElement>();
const dowelInput = document.createElement("input");
const holeHint = document.createElement("p");

function sanitize(data: Record<string, unknown>): Settings {
  const s: Settings = { ...DEFAULTS, styles: [...DEFAULTS.styles] };
  if (Array.isArray(data.styles) && data.styles.length === 3 && data.styles.every((v) => STYLES.includes(v as Style))) {
    s.styles = data.styles as Settings["styles"];
  }
  if (typeof data.dowel === "string" && data.dowel.trim()) s.dowel = data.dowel;
  for (const { key } of ALL_NUMBERS) {
    const v = data[key];
    if (typeof v === "number" && Number.isFinite(v)) s[key] = v;
  }
  return s;
}

function fromHash(): Record<string, unknown> | null {
  const h = new URLSearchParams(location.hash.slice(1));
  if (![...h.keys()].length) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of h) {
    if (k === "styles") out.styles = v.split(",");
    else if (k === "dowel") out.dowel = v;
    else out[k] = Number(v);
  }
  return out;
}

function toHash(s: Settings): string {
  const h = new URLSearchParams();
  if (s.styles.join() !== DEFAULTS.styles.join()) h.set("styles", s.styles.join(","));
  if (s.dowel !== DEFAULTS.dowel) h.set("dowel", s.dowel);
  for (const { key } of ALL_NUMBERS) if (s[key] !== DEFAULTS[key]) h.set(key, String(s[key]));
  return h.toString().replace(/%2C/g, ",");
}

function initialSettings(): Settings {
  const hash = fromHash();
  if (hash) return sanitize(hash);
  try {
    return sanitize(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}"));
  } catch {
    return sanitize({});
  }
}

function save(): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch { /* storage may be unavailable */ }
  const hash = toHash(settings);
  history.replaceState(null, "", hash ? `#${hash}` : location.pathname + location.search);
}

function log(text: string, error = false): void {
  const el = $("log");
  el.textContent = text;
  el.classList.toggle("error", error);
}

// ---------------------------------------------------------------- form

function fieldRow(label: string, control: HTMLElement, title = ""): HTMLElement {
  const row = document.createElement("div");
  row.className = "field";
  const l = document.createElement("label");
  l.textContent = label;
  if (title) row.title = title;
  const input = control.matches("input, select") ? control : control.querySelector("input, select");
  if (input) {
    input.id ||= `f-${label.replace(/\W+/g, "-").toLowerCase()}`;
    l.htmlFor = input.id;
  }
  row.append(l, control);
  return row;
}

function numberInput(spec: NumSpec): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "number";
  input.step = String(spec.step);
  input.min = String(spec.min);
  input.max = String(spec.max);
  input.id = `f-${spec.key}`;
  input.addEventListener("input", () => {
    const v = input.valueAsNumber;
    const ok = Number.isFinite(v) && v >= spec.min && v <= spec.max && (!spec.int || Number.isInteger(v));
    input.classList.toggle("bad", !ok);
    if (!ok) {
      log(`${spec.label}: enter ${spec.int ? "a whole number" : "a number"} from ${spec.min} to ${spec.max}`, true);
      return;
    }
    settings[spec.key] = v;
    changed();
  });
  numInputs.set(spec.key, input);
  return input;
}

function fieldset(title: string, ...rows: HTMLElement[]): HTMLFieldSetElement {
  const fs = document.createElement("fieldset");
  const legend = document.createElement("legend");
  legend.textContent = title;
  fs.append(legend, ...rows);
  return fs;
}

function buildForm(): void {
  const form = $("form");
  const styleSelect = (extra?: string) => {
    const sel = document.createElement("select");
    if (extra) sel.append(new Option(extra, ""));
    for (const st of STYLES) sel.append(new Option(st[0].toUpperCase() + st.slice(1), st));
    return sel;
  };

  // Design: one style for all, or per tier, plus the seed.
  allStyles.append(new Option("Mixed", "mixed"));
  for (const st of STYLES) allStyles.append(new Option(st[0].toUpperCase() + st.slice(1), st));
  allStyles.id = "f-all-styles";
  allStyles.addEventListener("change", () => {
    if (allStyles.value === "mixed") return;
    settings.styles = [allStyles.value, allStyles.value, allStyles.value] as Settings["styles"];
    changed();
  });
  const tierRows = TIERS.map((t, i) => {
    const sel = styleSelect();
    sel.id = `f-style-${i}`;
    sel.addEventListener("change", () => {
      settings.styles[i] = sel.value as Style;
      changed();
    });
    styleInputs.push(sel);
    return fieldRow(`${t} disc${i ? "s" : ""}`, sel);
  });
  const seed = numberInput(ALL_NUMBERS[0]);
  const dice = document.createElement("button");
  dice.type = "button";
  dice.textContent = "🎲";
  dice.title = "Random seed";
  dice.setAttribute("aria-label", "Random seed");
  dice.addEventListener("click", () => {
    settings.seed = 1 + Math.floor(Math.random() * 9999);
    changed();
  });
  const seedBox = document.createElement("div");
  seedBox.className = "seed-field";
  seedBox.append(seed, dice);
  const styleHint = document.createElement("p");
  styleHint.className = "hint";
  styleHint.id = "style-hint";
  form.append(fieldset("Design", fieldRow("Style (all discs)", allStyles), ...tierRows,
    fieldRow("Seed", seedBox, "Changes the random and crystal styles"), styleHint));

  form.append(fieldset("Size", ...NUMBERS.Size.map((s) => fieldRow(s.label, numberInput(s)))));

  // Dowel: free text (mm or inches) with common sizes offered.
  const list = document.createElement("datalist");
  list.id = "dowels";
  for (const d of DOWELS) list.append(new Option(d));
  dowelInput.type = "text";
  dowelInput.id = "f-dowel";
  dowelInput.setAttribute("list", "dowels");
  dowelInput.placeholder = "1/4in or 6.35";
  dowelInput.addEventListener("input", () => {
    settings.dowel = dowelInput.value;
    changed();
  });
  holeHint.className = "hint";
  form.append(fieldset("Dowel", fieldRow("Dowel diameter", dowelInput, 'mm (6.35) or inches (1/4in, 0.25", 3/16in)'), list,
    fieldRow("Press fit (mm)", numberInput(ALL_NUMBERS[1]), "How much smaller than the dowel to cut the hole; negative is looser"),
    holeHint));

  form.append(fieldset("Fit test strip", ...NUMBERS["Fit test strip"].map((s) => fieldRow(s.label, numberInput(s))),
    Object.assign(document.createElement("p"), {
      className: "hint",
      textContent: "Cut the strip, find the hole that grips the dowel best, and use its label as the press fit.",
    })));
  form.append(fieldset("Advanced", ...NUMBERS.Advanced.map((s) => fieldRow(s.label, numberInput(s)))));
}

/** Push settings into the form controls (after reset, dice or a style change). */
function syncForm(): void {
  styleInputs.forEach((sel, i) => (sel.value = settings.styles[i]));
  const same = settings.styles.every((s) => s === settings.styles[0]);
  allStyles.value = same ? settings.styles[0] : "mixed";
  for (const [key, input] of numInputs) {
    if (document.activeElement !== input || input.valueAsNumber !== settings[key]) input.value = String(settings[key]);
    input.classList.remove("bad");
  }
  if (document.activeElement !== dowelInput) dowelInput.value = settings.dowel;
  $("style-hint").textContent = [...new Set(settings.styles)].map((s) => STYLE_HELP[s]).join(". ") + ".";
}

// ---------------------------------------------------------------- build

function changed(): void {
  syncForm();
  save();
  clearTimeout(timer);
  timer = window.setTimeout(rebuild, 120);
}

function rebuild(): void {
  try {
    const { hole } = holeFor(settings);
    holeHint.textContent = `Hole cut at ${hole.toFixed(2)} mm.`;
    dowelInput.classList.remove("bad");
  } catch (e) {
    holeHint.textContent = "";
    dowelInput.classList.add("bad");
    top = null;
    $("summary").textContent = "";
    preview.clear();
    log((e as Error).message, true);
    return;
  }
  try {
    const t0 = performance.now();
    top = buildTop(settings);
    $("summary").textContent = top.summary;
    show();
    log(`Generated in ${Math.round(performance.now() - t0)} ms.`);
  } catch (e) {
    top = null;
    log(`Couldn't make this top: ${(e as Error).message}`, true);
  }
}

function galleryFor(): { svg: string; w: number; h: number } {
  const key = JSON.stringify(settings, (k, v) => (k === "styles" || k.startsWith("fit") ? undefined : v));
  if (gallery?.key !== key) {
    const { sheet } = buildGallery(settings);
    gallery = { key, ...sheet };
  }
  return gallery;
}

function assembledMarkup(b: Build): string {
  // Top view of the stack: the center disc at the bottom, the outer discs on top.
  const shades = ["#b48e5c", "#c9a87a", "#dcc196"];
  const discs = b.discs.map((d, i) =>
    `<path class="disc" d="${discD(d, 0, 0)}" fill="${shades[i]}" stroke="#6b4f2a" stroke-width="0.75" fill-rule="evenodd"/>`);
  const dowel = `<circle r="${(b.dowelMm / 2).toFixed(3)}" fill="#8a6a40" stroke="#4d381d" stroke-width="0.75"/>`;
  const spin = (document.getElementById("spin") as HTMLInputElement).checked;
  return `<g${spin ? ' class="spinning"' : ""}>${discs.join("")}${dowel}` +
    `<circle r="${(b.dowelMm * 0.12).toFixed(3)}" fill="#4d381d"/></g>`;
}

function show(): void {
  $("wood-row").hidden = view !== "top";
  $("spin-row").hidden = view !== "assembled";
  try {
    if (view === "fit") {
      const f = fitTest(settings);
      preview.showDocument(f.svg, f.w, f.h, "cut");
      $("summary").textContent = f.table;
      return;
    }
    if (!top) return;
    $("summary").textContent = top.summary;
    if (view === "top") {
      const wood = ($("wood") as HTMLInputElement).checked;
      const sheet = wood ? top.preview : top.cut;
      preview.showDocument(sheet.svg, sheet.w, sheet.h, wood ? "wood" : "cut");
    } else if (view === "assembled") {
      const r = top.diameters[0] / 2;
      preview.show(assembledMarkup(top), [-r, -r, 2 * r, 2 * r], "wood");
    } else {
      const g = galleryFor();
      preview.showDocument(g.svg, g.w, g.h, "wood");
      $("summary").textContent = `Rows, top to bottom: ${STYLES.join(", ")} (seed ${settings.seed}).`;
    }
  } catch (e) {
    preview.clear();
    log((e as Error).message, true);
  }
}

// ---------------------------------------------------------------- downloads

function download(name: string, data: string | Uint8Array, type: string): void {
  const blob = new Blob([typeof data === "string" ? data : data.slice()], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const stem = () => `snowflake_top_${settings.styles.join("-")}_seed${settings.seed}`;

function wire(): void {
  for (const tab of document.querySelectorAll<HTMLButtonElement>(".tabs button")) {
    tab.addEventListener("click", () => {
      view = tab.dataset.view as typeof view;
      for (const t of document.querySelectorAll(".tabs button")) t.setAttribute("aria-selected", String(t === tab));
      show();
    });
  }
  $("wood").addEventListener("change", show);
  $("spin").addEventListener("change", show);
  $("dl-cut").addEventListener("click", () => {
    if (top) download(`${stem()}_cut.svg`, top.cut.svg, "image/svg+xml");
  });
  $("dl-fit").addEventListener("click", () => {
    try {
      download("fit_test.svg", fitTest(settings).svg, "image/svg+xml");
    } catch (e) {
      log((e as Error).message, true);
    }
  });
  $("dl-zip").addEventListener("click", () => {
    if (!top) return;
    try {
      const fit = fitTest(settings), g = galleryFor();
      const notes = [top.summary, "", fit.table, "", `Settings: ${location.href}`, JSON.stringify(settings, null, 2), ""].join("\n");
      const files: Record<string, Uint8Array> = {
        [`${stem()}_cut.svg`]: strToU8(top.cut.svg),
        [`${stem()}_cut_preview.svg`]: strToU8(top.preview.svg),
        "fit_test.svg": strToU8(fit.svg),
        "gallery.svg": strToU8(g.svg),
        "notes.txt": strToU8(notes),
      };
      download(`${stem()}.zip`, zipSync(files, { level: 9 }), "application/zip");
    } catch (e) {
      log((e as Error).message, true);
    }
  });
  $("share").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      log("Link copied: it opens this exact top.");
    } catch {
      log(`Copy this link: ${location.href}`);
    }
  });
  $("reset").addEventListener("click", () => {
    settings = sanitize({});
    changed();
  });
  window.addEventListener("hashchange", () => {
    const h = fromHash();
    if (h) {
      settings = sanitize(h);
      changed();
    }
  });
}

buildForm();
wire();
syncForm();
rebuild();

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => { /* offline support is optional */ });
}
