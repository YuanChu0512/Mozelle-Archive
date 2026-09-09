"use client";

import { useEffect, useRef, type RefObject } from "react";
import { activeSectionIndex } from "./motion-math.mjs";

export function useArchiveScroll(
  heroRef: RefObject<HTMLElement | null>,
  headerRef: RefObject<HTMLElement | null>,
  onSection: (id: string) => void,
  controlsOpen: boolean,
  category: string,
) {
  const controls = useRef(controlsOpen);
  useEffect(() => {
    controls.current = controlsOpen;
    if (controlsOpen) headerRef.current?.classList.remove("is-reading-forward");
  }, [controlsOpen, headerRef]);

  useEffect(() => {
    window.dispatchEvent(new Event("archive:layout"));
  }, [category]);

  useEffect(() => {
    const hero = heroRef.current;
    const header = headerRef.current;
    const root = document.documentElement;
    const sections = Array.from(document.querySelectorAll<HTMLElement>("[data-section]"));
    if (!hero || !header || !sections.length) return;
    const shell = hero.closest<HTMLElement>(".site-shell");
    const nativeProgress = CSS.supports("animation-timeline: scroll()");
    const progress = document.querySelector<HTMLElement>(".page-scroll-progress");
    const journey = document.querySelector<HTMLElement>(".journey-progress-fill");
    let frame = 0;
    let dirty = true;
    let offsets: number[] = [];
    let viewportHeight = 0;
    let heroTop = 0;
    let heroHeight = 1;
    let scrollable = 1;
    let previousY = window.scrollY;
    let lastSection = "";
    let lastHeroProgress = -1;

    const update = () => {
      frame = 0;
      if (document.hidden) return;
      const y = Math.max(0, window.scrollY);
      // Read all geometry together only when layout changed. Scroll frames use
      // cached document coordinates, so style writes cannot force a reflow.
      if (dirty) {
        offsets = sections.map((section) => section.getBoundingClientRect().top + y);
        viewportHeight = window.innerHeight;
        const bounds = hero.getBoundingClientRect();
        heroTop = bounds.top + y;
        heroHeight = Math.max(1, bounds.height);
        scrollable = Math.max(1, root.scrollHeight - viewportHeight);
        dirty = false;
      }
      const readingLine = Math.max(104, Math.min(viewportHeight * .32, 340));
      const index = activeSectionIndex(offsets, y + readingLine, y >= scrollable - 2);
      const section = sections[index]?.dataset.section ?? "top";
      if (section !== lastSection) {
        lastSection = section;
        onSection(section);
      }
      const heroProgress = Math.min(1, Math.max(0, (y - heroTop) / (heroHeight * .72)));
      if (Math.abs(heroProgress - lastHeroProgress) > .0005) {
        hero.style.setProperty("--hero-grid-y", `${heroProgress * 22}px`);
        hero.style.setProperty("--hero-copy-y", `${heroProgress * -7}px`);
        hero.classList.toggle("is-scroll-engaged", heroProgress > .055);
        lastHeroProgress = heroProgress;
      }
      shell?.classList.toggle("is-offscreen", y > heroTop + heroHeight);
      if (!nativeProgress) {
        const fraction = Math.min(1, y / scrollable);
        if (progress) progress.style.transform = `scaleX(${fraction})`;
        if (journey) journey.style.transform = `scaleY(${fraction})`;
      }
      const delta = y - previousY;
      header.classList.toggle("is-scrolled", y > 28);
      if (controls.current || delta < -2 || y < 180) header.classList.remove("is-reading-forward");
      else if (y > 240 && delta > 3) header.classList.add("is-reading-forward");
      previousY = y;
    };
    const request = () => { if (!frame && !document.hidden) frame = requestAnimationFrame(update); };
    const invalidate = () => { dirty = true; request(); };
    const visibility = () => {
      root.dataset.pageHidden = String(document.hidden);
      if (document.hidden && frame) { cancelAnimationFrame(frame); frame = 0; }
      else invalidate();
    };
    const resize = new ResizeObserver(invalidate);
    sections.forEach((section) => resize.observe(section));
    window.addEventListener("scroll", request, { passive: true });
    window.addEventListener("resize", invalidate, { passive: true });
    window.addEventListener("archive:layout", invalidate);
    document.addEventListener("visibilitychange", visibility);
    update();
    return () => {
      resize.disconnect();
      window.removeEventListener("scroll", request);
      window.removeEventListener("resize", invalidate);
      window.removeEventListener("archive:layout", invalidate);
      document.removeEventListener("visibilitychange", visibility);
      if (frame) cancelAnimationFrame(frame);
      delete root.dataset.pageHidden;
    };
  }, [heroRef, headerRef, onSection]);
}
