"use client";

import { useEffect } from "react";

export default function MotionPreferences() {
  useEffect(() => {
    const root = document.documentElement;
    const query = window.matchMedia("(max-width: 940px), (pointer: coarse), (prefers-reduced-motion: reduce)");
    const device = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
    const update = () => {
      const limited = (device.hardwareConcurrency || 8) <= 4 || (device.deviceMemory || 8) <= 4 || device.connection?.saveData;
      root.dataset.motion = query.matches || limited ? "lite" : "full";
    };
    const visibility = () => { root.dataset.pageHidden = String(document.hidden); };
    update(); visibility();
    query.addEventListener("change", update);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      query.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  return null;
}
