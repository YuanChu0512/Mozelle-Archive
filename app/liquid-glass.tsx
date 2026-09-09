"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createGlassField } from "./glass-optics.mjs";

type Optics = { url: string; width: number; height: number; padding: number; scale: number };
const mapCache = new Map<string, Optics>();

function getOptics(width: number, height: number, radius: number): Optics | null {
  const key = `${width}:${height}:${radius}`;
  const cached = mapCache.get(key);
  if (cached) return cached;
  const field = createGlassField(width, height, radius);
  const canvas = document.createElement("canvas");
  canvas.width = field.mapWidth; canvas.height = field.mapHeight;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const pixels = context.createImageData(field.mapWidth, field.mapHeight);
  pixels.data.set(field.data); context.putImageData(pixels, 0, 0);
  const result = { url: canvas.toDataURL(), width: field.width, height: field.height, padding: field.padding, scale: field.scale };
  if (mapCache.size >= 12) mapCache.delete(mapCache.keys().next().value!);
  mapCache.set(key, result);
  return result;
}

export function LiquidGlassLens() {
  const lens = useRef<HTMLSpanElement>(null);
  const id = `mozelle-glass-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [optics, setOptics] = useState<Optics | null>(null);

  useEffect(() => {
    const surface = lens.current?.parentElement;
    if (!surface || !surface.matches(".site-header,.article-site-header,.journey-rail")) return;
    // URL backdrop filters are progressively enabled on the Chromium engines
    // verified by this project. Other engines retain the native frost material.
    const chromium = /(?:Chrome|Chromium|Edg|OPR)\//.test(navigator.userAgent);
    const precision = matchMedia("(min-width: 941px) and (hover: hover) and (pointer: fine)");
    const transparency = matchMedia("(prefers-reduced-transparency: reduce), (prefers-contrast: more)");
    let timer = 0;
    let alive = true;
    const update = () => {
      if (!alive) return;
      if (!chromium || !precision.matches || transparency.matches || document.documentElement.dataset.motion === "lite" || !CSS.supports("backdrop-filter", `url("#${id}")`)) {
        setOptics(null); return;
      }
      const width = surface.offsetWidth, height = surface.offsetHeight;
      if (!width || !height || width * height > 180000) { setOptics(null); return; }
      const radius = parseFloat(getComputedStyle(surface).borderTopLeftRadius) || 20;
      setOptics(getOptics(width, height, radius));
    };
    const schedule = () => { clearTimeout(timer); timer = window.setTimeout(update, 100); };
    const resize = new ResizeObserver(schedule);
    resize.observe(surface);
    const motion = new MutationObserver(schedule);
    motion.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
    precision.addEventListener("change", schedule); transparency.addEventListener("change", schedule);
    schedule();
    return () => {
      alive = false; clearTimeout(timer); resize.disconnect(); motion.disconnect();
      precision.removeEventListener("change", schedule); transparency.removeEventListener("change", schedule);
    };
  }, [id]);

  useEffect(() => {
    const surface = lens.current?.parentElement;
    if (!surface || !optics) return;
    surface.style.setProperty("--glass-refraction", `url("#${id}")`);
    surface.setAttribute("data-glass-refraction", "ready");
    return () => { surface.style.removeProperty("--glass-refraction"); surface.removeAttribute("data-glass-refraction"); };
  }, [optics, id]);

  return <span ref={lens} className="liquid-glass-lens" aria-hidden="true">
    {optics && <svg width="0" height="0" className="liquid-glass-filter-defs" focusable="false">
      <defs><filter id={id} x={-optics.padding} y={-optics.padding} width={optics.width} height={optics.height} filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
        <feImage href={optics.url} x={-optics.padding} y={-optics.padding} width={optics.width} height={optics.height} preserveAspectRatio="none" result="refraction-map" />
        <feDisplacementMap in="SourceGraphic" in2="refraction-map" scale={optics.scale} xChannelSelector="R" yChannelSelector="G" />
      </filter></defs>
    </svg>}
    <span className="liquid-glass-glow" />
  </span>;
}

export function useLiquidGlassTracking() {
  useEffect(() => {
    const precision = matchMedia("(hover: hover) and (pointer: fine)");
    let active = new Set<HTMLElement>();
    const bounds = new Map<HTMLElement, DOMRect>();
    let x = 0, y = 0, frame = 0;
    const clear = () => {
      active.forEach((surface) => surface.classList.remove("is-glass-engaged"));
      active.clear(); bounds.clear();
      if (frame) cancelAnimationFrame(frame); frame = 0;
    };
    const collect = (target: Element | null) => {
      const surfaces = new Set<HTMLElement>();
      let node = target?.closest<HTMLElement>("[data-liquid-glass]") || null;
      while (node) { surfaces.add(node); node = node.parentElement?.closest<HTMLElement>("[data-liquid-glass]") || null; }
      return surfaces;
    };
    const render = () => {
      frame = 0;
      if (!precision.matches || document.hidden || document.documentElement.dataset.motion === "lite") return clear();
      // Read all bounds before changing any style. Both nested controls and
      // their glass header follow the same event and the same frame.
      for (const surface of active) if (!bounds.has(surface)) bounds.set(surface, surface.getBoundingClientRect());
      for (const surface of active) {
        const rect = bounds.get(surface)!;
        surface.style.setProperty("--glass-x", `${x - rect.left}px`);
        surface.style.setProperty("--glass-y", `${y - rect.top}px`);
        surface.classList.add("is-glass-engaged");
      }
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType === "touch" || !precision.matches || document.documentElement.dataset.motion === "lite") return clear();
      const next = collect(event.target instanceof Element ? event.target : null);
      for (const surface of active) if (!next.has(surface)) { surface.classList.remove("is-glass-engaged"); bounds.delete(surface); }
      active = next; x = event.clientX; y = event.clientY;
      if (active.size && !frame) frame = requestAnimationFrame(render);
    };
    const out = (event: PointerEvent) => {
      const next = collect(event.relatedTarget instanceof Element ? event.relatedTarget : null);
      for (const surface of active) if (!next.has(surface)) { surface.classList.remove("is-glass-engaged"); bounds.delete(surface); }
      active = next;
    };
    const invalidate = () => bounds.clear();
    const visibility = () => { if (document.hidden) clear(); };
    document.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerout", out, { passive: true });
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("scroll", invalidate, { passive: true });
    window.addEventListener("resize", invalidate, { passive: true });
    window.addEventListener("blur", clear);
    precision.addEventListener("change", clear);
    return () => {
      clear(); document.removeEventListener("pointermove", move); document.removeEventListener("pointerout", out);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("scroll", invalidate); window.removeEventListener("resize", invalidate); window.removeEventListener("blur", clear);
      precision.removeEventListener("change", clear);
    };
  }, []);
}
