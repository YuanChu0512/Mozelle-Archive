"use client";

import { useEffect } from "react";

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
