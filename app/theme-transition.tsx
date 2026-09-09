"use client";

import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MouseEvent,
  type SetStateAction,
} from "react";

export type Theme = "day" | "night";

type ThemeTransitionOptions = {
  onStart?: (nextTheme: Theme) => void;
};

function setWaveOrigin(button: HTMLButtonElement) {
  const rect = button.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const horizontalDistance = Math.max(x, window.innerWidth - x);
  const verticalDistance = Math.max(y, window.innerHeight - y);
  const radius = Math.ceil(Math.hypot(horizontalDistance, verticalDistance) + 48);
  const root = document.documentElement;
  root.style.setProperty("--switch-x", `${x}px`);
  root.style.setProperty("--switch-y", `${y}px`);
  root.style.setProperty("--switch-radius", `${radius}px`);
  const ringScale = Math.max(1, radius / 48);
  root.style.setProperty("--switch-ring-scale", String(ringScale));
  root.style.setProperty("--switch-ring-scale-over", String(ringScale * 1.035));
}

export function useThemeTransition(
  theme: Theme,
  setTheme: Dispatch<SetStateAction<Theme>>,
  options: ThemeTransitionOptions = {},
) {
  const [transitioning, setTransitioning] = useState(false);
  const [transitionTarget, setTransitionTarget] = useState<Theme>(
    theme === "day" ? "night" : "day",
  );
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const scheduledTimers = timers.current;
    return () => {
      scheduledTimers.forEach((timer) => window.clearTimeout(timer));
      delete document.documentElement.dataset.switching;
    };
  }, []);

  const toggleTheme = (event: MouseEvent<HTMLButtonElement>) => {
    if (transitioning) return;
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current.length = 0;

    const nextTheme: Theme = theme === "day" ? "night" : "day";
    const root = document.documentElement;
    const reducedMotion = root.dataset.motion === "lite";
    const liteMotion =
      reducedMotion
      || root.dataset.motion === "lite"
      || window.matchMedia("(max-width: 940px), (pointer: coarse)").matches;

    setWaveOrigin(event.currentTarget);
    root.dataset.switching = nextTheme;
    options.onStart?.(nextTheme);
    setTransitionTarget(nextTheme);
    setTransitioning(true);

    const switchDelay = reducedMotion ? 0 : liteMotion ? 320 : 530;
    const totalDuration = reducedMotion ? 160 : liteMotion ? 560 : 920;
    timers.current.push(window.setTimeout(() => {
      root.dataset.theme = nextTheme;
      window.localStorage.setItem("mozelle-theme", nextTheme);
      setTheme(nextTheme);
    }, switchDelay));
    timers.current.push(window.setTimeout(() => {
      setTransitioning(false);
      timers.current.length = 0;
      delete root.dataset.switching;
    }, totalDuration));
  };

  return { transitioning, transitionTarget, toggleTheme };
}

export function ThemeTransition({
  active,
  target,
}: {
  active: boolean;
  target: Theme;
}) {
  return (
    <div
      className={`theme-transition ${active ? "is-active" : ""} to-${target}`}
      aria-hidden="true"
    >
      <span className="transition-flash" />
      <span className="transition-sweep" />
      <span className="transition-ring ring-one" />
      <span className="transition-ring ring-two" />
    </div>
  );
}
