"use client";

import { useEffect, useState } from "react";

const MAP_WIDTH = 160;
const MAP_HEIGHT = 96;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function smoothStep(edge0: number, edge1: number, value: number) {
  const normalized = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return normalized * normalized * (3 - 2 * normalized);
}

function roundedRectSdf(
  x: number,
  y: number,
  halfWidth: number,
  halfHeight: number,
  radius: number,
) {
  const qx = Math.abs(x) - halfWidth + radius;
  const qy = Math.abs(y) - halfHeight + radius;
  return Math.min(Math.max(qx, qy), 0)
    + Math.hypot(Math.max(qx, 0), Math.max(qy, 0))
    - radius;
}

function createDisplacementMap() {
  const canvas = document.createElement("canvas");
  canvas.width = MAP_WIDTH;
  canvas.height = MAP_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) return "";

  const pixels = context.createImageData(MAP_WIDTH, MAP_HEIGHT);
  for (let y = 0; y < MAP_HEIGHT; y += 1) {
    for (let x = 0; x < MAP_WIDTH; x += 1) {
      const px = ((x + 0.5) / MAP_WIDTH) * 2 - 1;
      const py = ((y + 0.5) / MAP_HEIGHT) * 2 - 1;
      const distance = roundedRectSdf(px, py, 0.95, 0.9, 0.22);
      const edgeDistance = Math.max(0, -distance);
      const edgeStrength = 1 - smoothStep(0.015, 0.32, edgeDistance);
      const cornerFalloff = 0.72 + 0.28 * (1 - Math.min(1, Math.hypot(px, py) / 1.35));
      const offsetX = -px * edgeStrength * cornerFalloff;
      const offsetY = -py * edgeStrength * cornerFalloff;
      const index = (y * MAP_WIDTH + x) * 4;

      pixels.data[index] = Math.round(clamp(128 + offsetX * 112, 0, 255));
      pixels.data[index + 1] = Math.round(clamp(128 + offsetY * 112, 0, 255));
      pixels.data[index + 2] = 0;
      pixels.data[index + 3] = 255;
    }
  }

  context.putImageData(pixels, 0, 0);
  return canvas.toDataURL("image/png");
}

/**
 * Shared, low-resolution displacement maps inspired by Shu Ding's MIT-licensed
 * liquid-glass experiment. The map is generated once and never recomputed on
 * pointer movement, which keeps the refractive layer inexpensive.
 * https://github.com/shuding/liquid-glass
 */
export function LiquidGlassFilters() {
  const [mapUrl, setMapUrl] = useState("");

  useEffect(() => {
    const precisionPointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reducedTransparency = window.matchMedia("(prefers-reduced-transparency: reduce)");
    const supportsSvgBackdrop = CSS.supports(
      "backdrop-filter",
      'url("#mozelle-liquid-refraction-regular")',
    ) || CSS.supports(
      "-webkit-backdrop-filter",
      'url("#mozelle-liquid-refraction-regular")',
    );

    if (!precisionPointer.matches || reducedTransparency.matches || !supportsSvgBackdrop) return;

    const timer = window.setTimeout(() => setMapUrl(createDisplacementMap()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!mapUrl) return;
    document.documentElement.dataset.liquidRefraction = "ready";
    return () => {
      delete document.documentElement.dataset.liquidRefraction;
    };
  }, [mapUrl]);

  return (
    <svg
      className="liquid-glass-filter-defs"
      width="0"
      height="0"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {[6, 10, 14].map((scale, index) => {
          const suffix = ["clear", "regular", "thick"][index];
          return (
            <filter
              id={`mozelle-liquid-refraction-${suffix}`}
              key={suffix}
              x="-10%"
              y="-18%"
              width="120%"
              height="136%"
              filterUnits="objectBoundingBox"
              primitiveUnits="userSpaceOnUse"
              colorInterpolationFilters="sRGB"
            >
              {mapUrl ? (
                <feImage
                  href={mapUrl}
                  x="0"
                  y="0"
                  width="100%"
                  height="100%"
                  preserveAspectRatio="none"
                  result="glass-map"
                />
              ) : (
                <feFlood floodColor="rgb(128 128 0)" result="glass-map" />
              )}
              <feDisplacementMap
                in="SourceGraphic"
                in2="glass-map"
                scale={scale}
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
          );
        })}
      </defs>
    </svg>
  );
}

export function LiquidGlassLens() {
  return (
    <span className="liquid-glass-lens" aria-hidden="true">
      <span className="liquid-glass-glow" />
    </span>
  );
}

export function useLiquidGlassTracking() {
  useEffect(() => {
    const precisionPointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    if (!precisionPointer.matches) return;

    let activeSurface: HTMLElement | null = null;
    let activeBounds: DOMRect | null = null;
    let pointerX = 0;
    let pointerY = 0;
    let frame = 0;

    const render = () => {
      frame = 0;
      if (!activeSurface || document.documentElement.dataset.motion === "lite") return;
      activeBounds ??= activeSurface.getBoundingClientRect();
      activeSurface.style.setProperty(
        "--glass-x",
        `${pointerX - activeBounds.left}px`,
      );
      activeSurface.style.setProperty(
        "--glass-y",
        `${pointerY - activeBounds.top}px`,
      );
    };

    const requestRender = () => {
      if (!frame) frame = window.requestAnimationFrame(render);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const nextSurface = (event.target as Element | null)?.closest<HTMLElement>(
        "[data-liquid-glass]",
      ) ?? null;
      if (nextSurface !== activeSurface) {
        activeSurface?.classList.remove("is-glass-engaged");
        activeSurface = nextSurface;
        activeBounds = nextSurface?.getBoundingClientRect() ?? null;
        activeSurface?.classList.add("is-glass-engaged");
      }
      if (!activeSurface) return;
      pointerX = event.clientX;
      pointerY = event.clientY;
      requestRender();
    };

    const handlePointerOut = (event: PointerEvent) => {
      if (!activeSurface) return;
      const nextTarget = event.relatedTarget as Node | null;
      if (nextTarget && activeSurface.contains(nextTarget)) return;
      activeSurface.classList.remove("is-glass-engaged");
      activeSurface = null;
      activeBounds = null;
    };

    const invalidateBounds = () => {
      activeBounds = null;
    };

    document.addEventListener("pointermove", handlePointerMove, { passive: true });
    document.addEventListener("pointerout", handlePointerOut, { passive: true });
    window.addEventListener("scroll", invalidateBounds, { passive: true });
    window.addEventListener("resize", invalidateBounds, { passive: true });

    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerout", handlePointerOut);
      window.removeEventListener("scroll", invalidateBounds);
      window.removeEventListener("resize", invalidateBounds);
      activeSurface?.classList.remove("is-glass-engaged");
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);
}
