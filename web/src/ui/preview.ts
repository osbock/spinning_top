// Live preview of an SVG drawing with wheel zoom, drag pan and double-click to fit.
export type Box = [number, number, number, number]; // x, y, width, height

export class Preview {
  private view: Box | null = null;
  private box: Box = [0, 0, 0, 0];
  private svg: SVGSVGElement | null = null;

  constructor(private host: HTMLElement) {
    host.addEventListener("wheel", (e) => this.zoom(e), { passive: false });
    host.addEventListener("dblclick", () => this.fit());
    let drag: { x: number; y: number; view: Box } | null = null;
    host.addEventListener("pointerdown", (e) => {
      if (!this.view) return;
      drag = { x: e.clientX, y: e.clientY, view: [...this.view] };
      host.setPointerCapture(e.pointerId);
      host.classList.add("dragging");
    });
    host.addEventListener("pointermove", (e) => {
      if (!drag || !this.svg) return;
      const k = Math.max(drag.view[2] / this.svg.clientWidth, drag.view[3] / this.svg.clientHeight);
      this.setView([drag.view[0] - (e.clientX - drag.x) * k, drag.view[1] - (e.clientY - drag.y) * k, drag.view[2], drag.view[3]]);
    });
    const end = () => {
      drag = null;
      host.classList.remove("dragging");
    };
    host.addEventListener("pointerup", end);
    host.addEventListener("pointercancel", end);
  }

  /** Show `inner` SVG markup whose content fills `box` (user units, mm). Keeps the zoom
   *  when the drawing keeps its size, e.g. while tweaking a seed. */
  show(inner: string, box: Box, mode: string): void {
    const same = this.box.every((v, i) => Math.abs(v - box[i]) < 1e-6);
    this.box = box;
    this.host.className = `preview ${mode}`;
    this.host.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">${inner}</svg>`;
    this.svg = this.host.querySelector("svg");
    if (same && this.view) this.setView(this.view);
    else this.fit();
  }

  /** Show a complete SVG document (as written to file). */
  showDocument(svg: string, w: number, h: number, mode: string): void {
    const inner = svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
    this.show(inner, [0, 0, w, h], mode);
  }

  clear(): void {
    this.host.innerHTML = "";
    this.svg = null;
    this.view = null;
  }

  fit(): void {
    const [x, y, w, h] = this.box;
    const pad = Math.max(w, h) * 0.03;
    this.setView([x - pad, y - pad, w + 2 * pad, h + 2 * pad]);
  }

  private setView(v: Box): void {
    this.view = v;
    this.svg?.setAttribute("viewBox", v.map((n) => n.toFixed(3)).join(" "));
  }

  private zoom(e: WheelEvent): void {
    if (!this.view || !this.svg) return;
    e.preventDefault();
    const rect = this.svg.getBoundingClientRect();
    const [vx, vy, vw, vh] = this.view;
    const k0 = Math.max(vw / rect.width, vh / rect.height);
    const ox = vx - (rect.width * k0 - vw) / 2, oy = vy - (rect.height * k0 - vh) / 2;
    const px = ox + (e.clientX - rect.left) * k0, py = oy + (e.clientY - rect.top) * k0;
    const f = Math.exp(Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 100) * 0.002);
    const size = Math.max(this.box[2], this.box[3]);
    const nw = Math.min(Math.max(vw * f, size * 0.02), size * 4);
    const k = nw / vw;
    this.setView([px - (px - vx) * k, py - (py - vy) * k, vw * k, vh * k]);
  }
}
