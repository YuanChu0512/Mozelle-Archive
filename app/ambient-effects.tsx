"use client";

import { useEffect, useRef } from "react";

const interactiveTargetSelector = [
  "a",
  "button",
  "[role='button']",
  "input",
  "textarea",
  "select",
  "summary",
].join(",");

export default function AmbientEffects() {
  const cursorRef = useRef<HTMLSpanElement>(null);
  const trailRef = useRef<HTMLSpanElement>(null);
  const burstRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const cursor = cursorRef.current;
    const trail = trailRef.current;
    const burst = burstRef.current;
    if (!cursor || !trail || !burst) return;

    const pointerQuery = window.matchMedia("(min-width: 941px) and (pointer: fine)");
    const target = { x: -100, y: -100 };
    let frame = 0;
    let burstTimer = 0;
    let pressTimer = 0;
    let lastTrailAt = 0;
    let lastTrailX = -100;
    let lastTrailY = -100;
    let trailIndex = 0;

    const canAnimate = () =>
      pointerQuery.matches &&
      document.documentElement.dataset.motion !== "lite";

    const paintCursor = () => {
      frame = 0;
      cursor.style.transform = `translate3d(${target.x}px, ${target.y}px, 0)`;
    };

    const requestCursorPaint = () => {
      if (!frame) frame = window.requestAnimationFrame(paintCursor);
    };

    const disableCursor = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      cursor.dataset.visible = "false";
      cursor.dataset.interactive = "false";
      cursor.dataset.pressed = "false";
      trail.replaceChildren();
      delete document.documentElement.dataset.customCursor;
    };

    const syncCursorCapability = () => {
      if (!canAnimate()) return disableCursor();
      document.documentElement.dataset.customCursor = "true";
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!canAnimate()) return;
      if (document.documentElement.dataset.customCursor !== "true") {
        syncCursorCapability();
      }
      target.x = event.clientX;
      target.y = event.clientY;
      const hovered = event.target instanceof Element ? event.target : null;
      cursor.dataset.visible = "true";
      cursor.dataset.interactive = String(
        Boolean(hovered?.closest(interactiveTargetSelector)),
      );
      requestCursorPaint();

      const now = performance.now();
      const distance = Math.hypot(event.clientX - lastTrailX, event.clientY - lastTrailY);
      if (now - lastTrailAt >= 34 && distance >= 7) {
        const palette =
          document.documentElement.dataset.theme === "night" ? "night" : "day";
        const mote = document.createElement("i");
        const direction = trailIndex % 2 === 0 ? 1 : -1;
        mote.className = "cursor-trail-mote";
        mote.dataset.palette = palette;
        mote.style.setProperty("--trail-x", `${event.clientX}px`);
        mote.style.setProperty("--trail-y", `${event.clientY}px`);
        mote.style.setProperty("--trail-dx", `${direction * (3 + (trailIndex % 3))}px`);
        mote.style.setProperty(
          "--trail-dy",
          `${palette === "day" ? -(7 + (trailIndex % 4)) : 2 + (trailIndex % 3)}px`,
        );
        mote.addEventListener("animationend", () => mote.remove(), { once: true });
        trail.append(mote);
        while (trail.childElementCount > 12) trail.firstElementChild?.remove();
        lastTrailAt = now;
        lastTrailX = event.clientX;
        lastTrailY = event.clientY;
        trailIndex += 1;
      }
    };

    const handlePointerOut = (event: PointerEvent) => {
      if (!event.relatedTarget) cursor.dataset.visible = "false";
    };

    const triggerBurst = (event: PointerEvent) => {
      if (!canAnimate()) return;
      cursor.dataset.pressed = "true";
      window.clearTimeout(pressTimer);
      pressTimer = window.setTimeout(() => {
        cursor.dataset.pressed = "false";
      }, 160);

      burst.style.setProperty("--burst-x", `${event.clientX}px`);
      burst.style.setProperty("--burst-y", `${event.clientY}px`);
      burst.dataset.palette =
        document.documentElement.dataset.theme === "night" ? "night" : "day";
      burst.dataset.active = "false";
      void burst.offsetWidth;
      burst.dataset.active = "true";

      window.clearTimeout(burstTimer);
      burstTimer = window.setTimeout(() => {
        burst.dataset.active = "false";
      }, 780);
    };

    const handlePreferenceChange = () => {
      if (!canAnimate()) {
        disableCursor();
        burst.dataset.active = "false";
      } else {
        syncCursorCapability();
      }
    };

    syncCursorCapability();
    const motionModeObserver = new MutationObserver(handlePreferenceChange);
    motionModeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-motion"],
    });
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerout", handlePointerOut, { passive: true });
    window.addEventListener("pointerdown", triggerBurst, { passive: true });
    window.addEventListener("blur", disableCursor);
    pointerQuery.addEventListener("change", handlePreferenceChange);

    return () => {
      disableCursor();
      motionModeObserver.disconnect();
      window.clearTimeout(burstTimer);
      window.clearTimeout(pressTimer);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerout", handlePointerOut);
      window.removeEventListener("pointerdown", triggerBurst);
      window.removeEventListener("blur", disableCursor);
      pointerQuery.removeEventListener("change", handlePreferenceChange);
    };
  }, []);

  return (
    <>
      <div className="global-ambient-effects" aria-hidden="true">
        <span
          ref={cursorRef}
          className="theme-cursor-anchor"
          data-visible="false"
          data-interactive="false"
          data-pressed="false"
        >
          <i className="cursor-day-star" />
          <i className="cursor-night-reticle">
            <span className="reticle-corner reticle-nw" />
            <span className="reticle-corner reticle-ne" />
            <span className="reticle-corner reticle-se" />
            <span className="reticle-corner reticle-sw" />
            <span className="reticle-core" />
          </i>
        </span>
        <span ref={trailRef} className="cursor-trail-layer" />
      </div>

      <div className="dimension-event-layer" aria-hidden="true">
        <span
          ref={burstRef}
          className="dimension-event-burst"
          data-active="false"
          data-palette="day"
        >
          <i className="event-burst-glow" />
          <i className="event-burst-wave" />
          <i className="event-burst-slice slice-one" />
          <i className="event-burst-slice slice-two" />
          <i className="event-burst-shard event-shard-one" />
          <i className="event-burst-shard event-shard-two" />
          <i className="event-burst-shard event-shard-three" />
          <i className="event-burst-shard event-shard-four" />
          <i className="event-burst-shard event-shard-five" />
          <i className="event-burst-shard event-shard-six" />
        </span>
      </div>
    </>
  );
}
