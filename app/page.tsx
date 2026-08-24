"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
} from "react";
import { flushSync } from "react-dom";
import {
  fallbackArticles,
  filters,
  type Article,
  type Filter,
} from "./article-data";
import AmbientEffects from "./ambient-effects";
import { categoryLabels, homeCopy, localizeArticle } from "./i18n";
import { LanguageReassembly, useLanguageSwitcher } from "./language-switcher";
import { LiquidGlassFilters, LiquidGlassLens, useLiquidGlassTracking } from "./liquid-glass";
import ImageLightbox, { type LightboxImage } from "./image-lightbox";
import { previewMediaUrl } from "./media-utils";
import {
  ThemeTransition,
  useThemeTransition,
  type Theme,
} from "./theme-transition";

const navItems = [
  { href: "#top" },
  { href: "#articles" },
  { href: "#lab" },
  { href: "#collection" },
  { href: "#about" },
];

type PublicSettings = {
  siteTitle: string;
  tagline: string;
  bio: string;
};

const fallbackSettings: PublicSettings = {
  siteTitle: "Mozelle Archive",
  tagline: "把所见、所想与所爱，收进一页页未完的档案。",
  bio: "电子专业学生，记录硬件、超频、游戏、Cosplay 与二次元世界。",
};

const collectionVisuals = [
  "collection-cos",
  "collection-game",
  "collection-elaina",
  "collection-mon3tr",
];

function articleRouteKey(article: Article) {
  return article.slug ?? article.id;
}

function articlePreviewImages(article: Article): LightboxImage[] {
  const images: LightboxImage[] = [];
  const seen = new Set<string>();
  const append = (image: LightboxImage) => {
    if (!image.src || seen.has(image.src)) return;
    seen.add(image.src);
    images.push(image);
  };

  if (article.coverUrl) {
    append({ src: article.coverUrl, alt: article.title, caption: article.summary });
  }
  article.gallery?.forEach((image) => append(image));
  return images;
}

type SearchEntry = {
  id: string;
  type: "article" | "lab" | "collection";
  eyebrow: string;
  title: string;
  description: string;
  href: string;
  keywords: string;
};

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => {
    finished: Promise<void>;
  };
};

function DimensionScrollScene({
  code,
  variant,
}: {
  code: string;
  variant: "articles" | "lab" | "collection" | "about";
}) {
  return (
    <div
      className={`dimension-scroll-scene dimension-scene-${variant}`}
      aria-hidden="true"
    >
      <span className="dimension-plane dimension-plane-far" />
      <span className="dimension-plane dimension-plane-near" />
      <span className="dimension-axis">
        <i />
        <i />
        <i />
      </span>
      <span className="dimension-scene-code">{code}</span>
    </div>
  );
}

export default function Home() {
  const [theme, setTheme] = useState<Theme>("day");
  const [filter, setFilter] = useState<Filter>("全部");
  const [articles, setArticles] = useState<Article[]>(fallbackArticles);
  const [siteSettings, setSiteSettings] = useState<PublicSettings>(fallbackSettings);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSearchIndex, setSelectedSearchIndex] = useState(0);
  const [preview, setPreview] = useState<{
    images: LightboxImage[];
    activeIndex: number;
  } | null>(null);
  const [articleTransitionSource, setArticleTransitionSource] = useState<string | null>(null);
  const [nightVisualReady, setNightVisualReady] = useState(false);
  const [nightMotionPhase, setNightMotionPhase] = useState(0);
  const { transitioning, transitionTarget, toggleTheme } = useThemeTransition(
    theme,
    setTheme,
    {
      onStart: (nextTheme) => {
        if (nextTheme === "night") setNightVisualReady(true);
        setNightMotionPhase(0);
      },
    },
  );
  const {
    language,
    switching: languageSwitching,
    targetLanguage,
    toggleLanguage,
  } = useLanguageSwitcher();
  const copy = homeCopy[language];
  const [activeSection, setActiveSection] = useState("top");
  const [sectionJump, setSectionJump] = useState<{
    key: number;
    label: string;
  } | null>(null);
  const heroSection = useRef<HTMLElement>(null);
  const heroVisual = useRef<HTMLDivElement>(null);
  const siteHeader = useRef<HTMLElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const rhodesParticleCanvas = useRef<HTMLCanvasElement>(null);
  const wireSphereCanvas = useRef<HTMLCanvasElement>(null);
  const sectionJumpTimer = useRef<number | null>(null);
  const particleMotionReady =
    theme === "night" && !transitioning && nightMotionPhase >= 1;
  const sphereMotionReady =
    theme === "night" && !transitioning && nightMotionPhase >= 2;

  useLiquidGlassTracking();

  const setSearchVisibility = useCallback((open: boolean) => {
    const root = document.documentElement;
    const transitionDocument = document as ViewTransitionDocument;
    const reducedMotion = root.dataset.motion === "lite";
    if (
      reducedMotion ||
      !transitionDocument.startViewTransition ||
      root.classList.contains("is-spotlight-transitioning")
    ) {
      setSearchOpen(open);
      return;
    }

    root.classList.add("is-spotlight-transitioning");
    try {
      const transition = transitionDocument.startViewTransition(() => {
        flushSync(() => setSearchOpen(open));
      });
      transition.finished.finally(() => {
        root.classList.remove("is-spotlight-transitioning");
      });
    } catch {
      root.classList.remove("is-spotlight-transitioning");
      setSearchOpen(open);
    }
  }, []);

  useEffect(() => {
    const handleGlobalShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setMenuOpen(false);
        setSelectedSearchIndex(0);
        setSearchVisibility(!searchOpen);
        return;
      }
      if (event.key === "Escape") {
        setMenuOpen(false);
        if (searchOpen) setSearchVisibility(false);
      }
    };
    window.addEventListener("keydown", handleGlobalShortcut);
    return () => window.removeEventListener("keydown", handleGlobalShortcut);
  }, [searchOpen, setSearchVisibility]);

  useEffect(() => {
    if (!searchOpen) return;
    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => searchInput.current?.focus());
    const trapFocus = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const panel = document.querySelector<HTMLElement>(".spotlight-panel");
      if (!panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trapFocus);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", trapFocus);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true });
    };
  }, [searchOpen]);

  useEffect(() => {
    if (theme !== "night" || transitioning) return;

    const firstPhase = window.setTimeout(() => setNightMotionPhase(1), 90);
    const secondPhase = window.setTimeout(() => setNightMotionPhase(2), 340);
    return () => {
      window.clearTimeout(firstPhase);
      window.clearTimeout(secondPhase);
    };
  }, [theme, transitioning]);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("mozelle-theme");
    if (savedTheme !== "day" && savedTheme !== "night") return;
    document.documentElement.dataset.theme = savedTheme;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setTheme(savedTheme);
      if (savedTheme === "night") setNightVisualReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const revealNodes = Array.from(
      document.querySelectorAll<HTMLElement>("[data-reveal]"),
    );
    const reducedMotion = document.documentElement.dataset.motion === "lite";
    const liteMotion =
      reducedMotion || document.documentElement.dataset.motion === "lite";

    if (liteMotion || !("IntersectionObserver" in window)) {
      revealNodes.forEach((node) => node.classList.add("is-revealed"));
      return;
    }

    revealNodes.forEach((node) => node.classList.add("reveal-pending"));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const node = entry.target as HTMLElement;
          node.classList.add("is-revealed");
          observer.unobserve(node);
          window.setTimeout(() => {
            node.classList.remove("reveal-pending", "is-revealed");
          }, 920);
        });
      },
      { rootMargin: "0px 0px -9% 0px", threshold: 0.08 },
    );
    revealNodes.forEach((node) => observer.observe(node));

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const sections = Array.from(
      document.querySelectorAll<HTMLElement>("[data-section]"),
    );
    if (!sections.length) return;

    let frame = 0;
    const updateActiveSection = () => {
      frame = 0;
      const activationLine = Math.max(
        104,
        Math.min(window.innerHeight * 0.32, 340),
      );
      let nextSection = sections[0]?.dataset.section ?? "top";

      for (const section of sections) {
        if (section.getBoundingClientRect().top > activationLine) break;
        nextSection = section.dataset.section ?? nextSection;
      }

      const root = document.documentElement;
      if (window.scrollY + window.innerHeight >= root.scrollHeight - 2) {
        nextSection = sections.at(-1)?.dataset.section ?? nextSection;
      }

      setActiveSection((current) =>
        current === nextSection ? current : nextSection,
      );
    };
    const requestUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(updateActiveSection);
    };
    const resizeObserver = "ResizeObserver" in window
      ? new ResizeObserver(requestUpdate)
      : null;

    sections.forEach((section) => resizeObserver?.observe(section));
    updateActiveSection();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate, { passive: true });

    return () => {
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
      resizeObserver?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(
    () => () => {
      if (sectionJumpTimer.current) window.clearTimeout(sectionJumpTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (CSS.supports("animation-timeline: scroll()")) return;

    const progress = document.querySelector<HTMLElement>(".page-scroll-progress");
    const journeyProgress = document.querySelector<HTMLElement>(
      ".journey-progress-fill",
    );
    if (!progress && !journeyProgress) return;
    let frame = 0;

    const updateProgress = () => {
      frame = 0;
      const scrollable = Math.max(
        1,
        document.documentElement.scrollHeight - window.innerHeight,
      );
      const value = Math.min(1, Math.max(0, window.scrollY / scrollable));
      if (progress) progress.style.transform = `scaleX(${value})`;
      if (journeyProgress) journeyProgress.style.transform = `scaleY(${value})`;
    };
    const requestUpdate = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(updateProgress);
    };

    updateProgress();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate, { passive: true });
    return () => {
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const hero = heroSection.current;
    if (!hero) return;
    let frame = 0;

    const updateHeroStory = () => {
      frame = 0;
      const bounds = hero.getBoundingClientRect();
      const progress = Math.min(
        1,
        Math.max(0, -bounds.top / Math.max(1, bounds.height * 0.72)),
      );
      hero.style.setProperty("--hero-grid-y", `${progress * 22}px`);
      hero.style.setProperty("--hero-copy-y", `${progress * -7}px`);
      hero.classList.toggle("is-scroll-engaged", progress > 0.055);
    };
    const requestUpdate = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(updateHeroStory);
    };

    updateHeroStory();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate, { passive: true });
    return () => {
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/posts", {
      headers: { accept: "application/json" },
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("文章服务暂不可用");
        return response.json() as Promise<{ posts?: Article[] }>;
      })
      .then((payload) => {
        setArticles(payload.posts ?? []);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        // Sites 设计预览与未配置 API 的环境继续使用内置文章。
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/settings", {
      headers: { accept: "application/json" },
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("站点设置服务暂不可用");
        return response.json() as Promise<{ settings?: Partial<PublicSettings> }>;
      })
      .then((payload) => {
        if (payload.settings) {
          setSiteSettings((current) => ({ ...current, ...payload.settings }));
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const motionQuery = window.matchMedia("(max-width: 940px), (pointer: coarse)");
    const deviceNavigator = navigator as Navigator & {
      deviceMemory?: number;
      connection?: { saveData?: boolean };
    };

    const updateMotionMode = () => {
      const limitedHardware =
        (deviceNavigator.hardwareConcurrency || 8) <= 4 ||
        (deviceNavigator.deviceMemory || 8) <= 4 ||
        Boolean(deviceNavigator.connection?.saveData);
      root.dataset.motion =
        motionQuery.matches || limitedHardware ? "lite" : "full";
    };

    updateMotionMode();
    motionQuery.addEventListener("change", updateMotionMode);
    return () => motionQuery.removeEventListener("change", updateMotionMode);
  }, []);

  useEffect(() => {
    if (document.documentElement.dataset.motion !== "full") return;

    const idleWindow = window as Window & {
      requestIdleCallback?: (
        callback: () => void,
        options?: { timeout: number },
      ) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    let idleHandle = 0;
    let timer = 0;

    const scheduleWarmup = () => {
      timer = window.setTimeout(() => {
        if (idleWindow.requestIdleCallback) {
          idleHandle = idleWindow.requestIdleCallback(
            () => setNightVisualReady(true),
            { timeout: 3000 },
          );
        } else {
          setNightVisualReady(true);
        }
      }, 1600);
    };

    if (document.readyState === "complete") {
      scheduleWarmup();
    } else {
      window.addEventListener("load", scheduleWarmup, { once: true });
    }

    return () => {
      window.removeEventListener("load", scheduleWarmup);
      if (timer) window.clearTimeout(timer);
      if (idleHandle) idleWindow.cancelIdleCallback?.(idleHandle);
    };
  }, []);

  useEffect(() => {
    const visual = heroVisual.current;
    if (
      !visual ||
      document.documentElement.dataset.motion === "lite" ||
      window.matchMedia("(pointer: coarse)").matches
    ) {
      return;
    }

    let parallaxFrame = 0;
    let visualRect = visual.getBoundingClientRect();
    let pointerEngaged = false;
    const pointerTarget = { x: 0, y: 0 };
    const pointerCurrent = { x: 0, y: 0 };
    let bearingTarget = -90;
    let bearingCurrent = -90;
    let activeRuneSector = Number.NaN;
    const runeNodes = Array.from(
      visual.querySelectorAll<SVGElement>(
        ".magic-seal, .magic-rune-icon, .magic-rune-small",
      ),
    );
    const runeAngles = [
      -90, 0, 90, 180,
      -90, 0, 90, 180,
      -45, 45, 135, -135,
    ];

    const shortestAngle = (from: number, to: number) =>
      ((((to - from + 180) % 360) + 360) % 360) - 180;

    const updateRuneWake = (bearing: number) => {
      const nextSector = ((Math.round(bearing / 45) % 8) + 8) % 8;
      if (nextSector === activeRuneSector) return;
      activeRuneSector = nextSector;

      runeNodes.forEach((node, index) => {
        const nodeAngle = runeAngles[index] ?? 0;
        const distance = Math.abs(shortestAngle(bearing, nodeAngle));
        node.classList.toggle("is-rune-awake", distance <= 23);
        node.classList.toggle(
          "is-rune-near",
          distance > 23 && distance <= 68,
        );
      });
    };

    updateRuneWake(bearingTarget);

    const renderParallax = () => {
      parallaxFrame = 0;
      const smoothing = pointerEngaged ? 0.14 : 0.075;
      pointerCurrent.x += (pointerTarget.x - pointerCurrent.x) * smoothing;
      pointerCurrent.y += (pointerTarget.y - pointerCurrent.y) * smoothing;
      bearingCurrent +=
        shortestAngle(bearingCurrent, bearingTarget) *
        (pointerEngaged ? 0.18 : 0.1);

      const x = pointerCurrent.x;
      const y = pointerCurrent.y;
      if (theme === "day") {
        const reach = Math.min(1, Math.hypot(x, y));
        visual.style.setProperty("--sigil-tilt-x", `${y * -2.05}deg`);
        visual.style.setProperty("--sigil-tilt-y", `${x * 2.45}deg`);
        visual.style.setProperty(
          "--sigil-phase-outer",
          `${x * 3.2 + y * 0.8}deg`,
        );
        visual.style.setProperty(
          "--sigil-phase-inner",
          `${x * -1.45 + y * 1.65}deg`,
        );
        visual.style.setProperty(
          "--sigil-core-scale",
          `${1 + reach * 0.008}`,
        );
        visual.style.setProperty(
          "--sigil-bearing",
          `${bearingCurrent + 90}deg`,
        );
      } else {
        visual.style.setProperty("--mesh-shift-x", `${x * 11}px`);
        visual.style.setProperty("--mesh-shift-y", `${y * 8}px`);
        visual.style.setProperty("--mesh-rotate", `${(x - y) * 1.45}deg`);
        visual.style.setProperty("--mesh-tilt-x", `${y * -4.5}deg`);
        visual.style.setProperty("--mesh-tilt-y", `${x * 6}deg`);
      }
      visual.style.setProperty("--character-shift-x", `${x * 6.5}px`);
      visual.style.setProperty("--character-shift-y", `${y * 4.5}px`);
      visual.style.setProperty("--character-shift-x-rev", `${x * -3.5}px`);
      visual.style.setProperty("--character-shift-y-rev", `${y * -2.8}px`);
      visual.style.setProperty("--light-shift-x", `${x * 18}px`);
      visual.style.setProperty("--light-shift-y", `${y * 14}px`);

      const remaining =
        Math.abs(pointerTarget.x - pointerCurrent.x) +
        Math.abs(pointerTarget.y - pointerCurrent.y) +
        Math.abs(shortestAngle(bearingCurrent, bearingTarget)) / 180;
      if (remaining > 0.002) {
        parallaxFrame = window.requestAnimationFrame(renderParallax);
      } else if (!pointerEngaged) {
        pointerCurrent.x = 0;
        pointerCurrent.y = 0;
        visual.classList.remove("is-pointer-engaged");
      }
    };

    const requestParallax = () => {
      if (!parallaxFrame) {
        parallaxFrame = window.requestAnimationFrame(renderParallax);
      }
    };

    const handlePointerMove = (event: globalThis.PointerEvent) => {
      if (event.pointerType === "touch") return;
      const x = event.clientX - visualRect.left;
      const y = event.clientY - visualRect.top;
      const normalizedX = Math.max(
        -1,
        Math.min(1, (x / visualRect.width - 0.5) * 2),
      );
      const normalizedY = Math.max(
        -1,
        Math.min(1, (y / visualRect.height - 0.44) * 2),
      );
      const relativeX = x - visualRect.width * 0.5;
      const relativeY = y - visualRect.height * 0.44;

      visual.style.setProperty("--pointer-x", `${x}px`);
      visual.style.setProperty("--pointer-y", `${y}px`);
      pointerTarget.x = normalizedX;
      pointerTarget.y = normalizedY;
      if (Math.hypot(relativeX, relativeY) > 12) {
        const rawBearing = Math.atan2(relativeY, relativeX) * (180 / Math.PI);
        bearingTarget += shortestAngle(bearingTarget, rawBearing);
        updateRuneWake(rawBearing);
      }
      pointerEngaged = true;
      visual.classList.add("is-pointer-engaged");
      if (theme === "day") visual.classList.add("is-sigil-guided");
      requestParallax();

    };

    const resetPointer = () => {
      pointerEngaged = false;
      pointerTarget.x = 0;
      pointerTarget.y = 0;
      visual.classList.remove("is-sigil-guided");
      requestParallax();
    };

    const updateVisualRect = () => {
      visualRect = visual.getBoundingClientRect();
    };
    const resizeObserver = new ResizeObserver(updateVisualRect);
    resizeObserver.observe(visual);
    window.addEventListener("scroll", updateVisualRect, { passive: true });
    visual.addEventListener("pointermove", handlePointerMove, { passive: true });
    visual.addEventListener("pointerleave", resetPointer);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("scroll", updateVisualRect);
      visual.removeEventListener("pointermove", handlePointerMove);
      visual.removeEventListener("pointerleave", resetPointer);
      if (parallaxFrame) window.cancelAnimationFrame(parallaxFrame);
      visual.classList.remove("is-pointer-engaged");
      visual.classList.remove("is-sigil-guided");
      runeNodes.forEach((node) => {
        node.classList.remove("is-rune-awake", "is-rune-near");
      });
    };
  }, [theme]);

  useEffect(() => {
    const visual = heroSection.current;
    const canvas = rhodesParticleCanvas.current;
    if (!visual || !canvas) return;

    const context = canvas.getContext("2d", {
      alpha: true,
      desynchronized: true,
    });
    if (!context) return;

    if (!particleMotionReady) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    type RhodesParticle = {
      ox: number;
      oy: number;
      x: number;
      y: number;
      vx: number;
      vy: number;
      phase: number;
      size: number;
      bright: boolean;
    };

    const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
    const prefersReducedMotion = document.documentElement.dataset.motion === "lite";
    const lowPower =
      document.documentElement.dataset.motion === "lite" || coarsePointer;
    const particles: RhodesParticle[] = [];
    const pointer = { x: -10_000, y: -10_000, active: false };
    const sourceImage = new window.Image();
    sourceImage.decoding = "async";

    const maxFrameRate = 144;
    const lowPowerFrameRate = 30;
    const baselineFrameDuration = 1000 / 32;
    const refreshSamples: number[] = [];
    let samplesSinceRefreshUpdate = 0;
    let frame = 0;
    let lastAnimationFrame = 0;
    let lastRenderFrame = 0;
    let nextRenderAt = 0;
    let targetFrameRate = lowPower ? lowPowerFrameRate : 60;
    let targetFrameDuration = 1000 / targetFrameRate;
    let width = 0;
    let height = 0;
    let visualRect = visual.getBoundingClientRect();
    let imageReady = false;
    let destroyed = false;
    let assembledOnce = false;
    let assemblyStartedAt = 0;
    let sceneStartedAt = performance.now();
    let lastActivityAt = sceneStartedAt;
    let inView = visualRect.bottom > 0 && visualRect.top < window.innerHeight;

    const drawParticles = (
      now: number,
      update = true,
      elapsed = baselineFrameDuration,
    ) => {
      context.clearRect(0, 0, width, height);
      if (!particles.length) return;

      const frameScale = Math.min(3, Math.max(0.2, elapsed / baselineFrameDuration));
      const pointerRadius = lowPower ? 52 : 76;
      const pointerRadiusSquared = pointerRadius * pointerRadius;
      const assembling = assemblyStartedAt > 0 && now - assemblyStartedAt < 1150;
      const spring = lowPower ? 0.024 : assembling ? 0.042 : 0.029;
      const friction = lowPower ? 0.8 : 0.83;
      const scaledFriction = Math.pow(friction, frameScale);
      const drift = assembling ? (lowPower ? 0.08 : 0.24) : pointer.active ? 0.14 : 0;

      context.globalCompositeOperation = "source-over";
      context.beginPath();
      for (const particle of particles) {
        if (update) {
          if (pointer.active && !coarsePointer && !prefersReducedMotion) {
            const dx = particle.x - pointer.x;
            const dy = particle.y - pointer.y;
            const distanceSquared = dx * dx + dy * dy;
            if (distanceSquared > 0.1 && distanceSquared < pointerRadiusSquared) {
              const distance = Math.sqrt(distanceSquared);
              const falloff = 1 - distance / pointerRadius;
              const force = falloff * falloff * 2.35 * frameScale;
              particle.vx += (dx / distance) * force;
              particle.vy += (dy / distance) * force;
            }
          }

          const targetX =
            particle.ox + Math.sin(now * 0.00072 + particle.phase) * drift;
          const targetY =
            particle.oy + Math.cos(now * 0.00061 + particle.phase) * drift;
          particle.vx =
            (particle.vx + (targetX - particle.x) * spring * frameScale) *
            scaledFriction;
          particle.vy =
            (particle.vy + (targetY - particle.y) * spring * frameScale) *
            scaledFriction;
          particle.x += particle.vx * frameScale;
          particle.y += particle.vy * frameScale;
        }
        context.rect(particle.x, particle.y, particle.size, particle.size);
      }
      context.fillStyle = lowPower
        ? "rgba(148, 255, 178, .88)"
        : "rgba(136, 255, 171, .96)";
      context.fill();

      context.beginPath();
      for (let index = 0; index < particles.length; index += 1) {
        const particle = particles[index];
        if (!particle.bright) continue;
        const glowSize = particle.size * 1.7;
        context.rect(
          particle.x - glowSize * 0.22,
          particle.y - glowSize * 0.22,
          glowSize,
          glowSize,
        );
      }
      context.fillStyle = "rgba(238, 255, 148, 1)";
      context.fill();
    };

    const updateRefreshRate = (now: number) => {
      if (lastAnimationFrame > 0) {
        const sample = now - lastAnimationFrame;
        if (sample >= 3 && sample <= 50) {
          refreshSamples.push(sample);
          if (refreshSamples.length > 36) refreshSamples.shift();
          samplesSinceRefreshUpdate += 1;
        }
      }
      lastAnimationFrame = now;

      if (refreshSamples.length < 18 || samplesSinceRefreshUpdate < 6) return;
      samplesSinceRefreshUpdate = 0;
      const sorted = [...refreshSamples].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const measuredFrameRate = Math.max(
        20,
        Math.min(maxFrameRate, Math.round(1000 / median)),
      );
      targetFrameRate = lowPower
        ? Math.min(measuredFrameRate, lowPowerFrameRate)
        : measuredFrameRate;
      targetFrameDuration = 1000 / targetFrameRate;
      canvas.dataset.refreshRate = String(Math.round(1000 / median));
      canvas.dataset.targetFps = String(targetFrameRate);
    };

    canvas.dataset.targetFps = String(targetFrameRate);

    const animate = (now: number) => {
      if (destroyed) return;
      frame = 0;
      if (pointer.active && now - lastActivityAt > 140) pointer.active = false;
      updateRefreshRate(now);
      if (!nextRenderAt) nextRenderAt = now;
      if (now + 0.25 >= nextRenderAt) {
        const elapsed = lastRenderFrame
          ? Math.min(100, now - lastRenderFrame)
          : targetFrameDuration;
        lastRenderFrame = now;
        drawParticles(now, true, elapsed);
        nextRenderAt += targetFrameDuration;
        if (now - nextRenderAt > targetFrameDuration * 2) {
          nextRenderAt = now + targetFrameDuration;
        }
      }

      const canIdle =
        now - sceneStartedAt > 1500 &&
        now - lastActivityAt > 880 &&
        (!assemblyStartedAt || now - assemblyStartedAt > 1280);
      if (canIdle) {
        canvas.dataset.animationState = "idle";
        return;
      }

      canvas.dataset.animationState = "active";
      frame = window.requestAnimationFrame(animate);
    };

    const buildParticles = () => {
      if (!imageReady || !width || !height) return;

      const sampleSize = lowPower ? 190 : 240;
      const offscreen = document.createElement("canvas");
      offscreen.width = sampleSize;
      offscreen.height = sampleSize;
      const offscreenContext = offscreen.getContext("2d", {
        willReadFrequently: true,
      });
      if (!offscreenContext) return;
      offscreenContext.clearRect(0, 0, sampleSize, sampleSize);
      offscreenContext.drawImage(sourceImage, 0, 0, sampleSize, sampleSize);
      const pixels = offscreenContext.getImageData(
        0,
        0,
        sampleSize,
        sampleSize,
      ).data;

      const maxParticles = lowPower ? 460 : 1200;
      let step = lowPower ? 4 : 2;
      let samples: Array<[number, number, number]> = [];
      const collectSamples = () => {
        const next: Array<[number, number, number]> = [];
        for (let y = 0; y < sampleSize; y += step) {
          for (let x = 0; x < sampleSize; x += step) {
            const alpha = pixels[(y * sampleSize + x) * 4 + 3];
            if (alpha > 72) next.push([x, y, alpha]);
          }
        }
        return next;
      };
      samples = collectSamples();
      while (samples.length > maxParticles && step < 12) {
        step += 1;
        samples = collectSamples();
      }

      const compactLayout = width < 940;
      const logoSize = Math.min(
        width * (compactLayout ? 0.94 : 0.44),
        height * (compactLayout ? 0.5 : 0.72),
      );
      const centerX = width * (compactLayout ? 0.5 : 0.27);
      const centerY = height * (compactLayout ? 0.34 : 0.365);
      const offsetX = centerX - logoSize / 2;
      const offsetY = centerY - logoSize / 2;
      const scale = logoSize / sampleSize;
      const shouldAssemble =
        !assembledOnce && !prefersReducedMotion && !lowPower;
      if (shouldAssemble) assemblyStartedAt = performance.now();
      const scatter = prefersReducedMotion ? 0 : lowPower ? 10 : 24;

      particles.length = 0;
      samples.forEach(([sampleX, sampleY], index) => {
        const ox = offsetX + sampleX * scale;
        const oy = offsetY + sampleY * scale;
        const assemblyAngle =
          (index / Math.max(1, samples.length)) * Math.PI * 2 +
          Math.sin(index * 1.83) * 0.34;
        const assemblyRadius =
          logoSize * (0.48 + ((index * 17) % 31) / 31 * 0.34);
        particles.push({
          ox,
          oy,
          x: shouldAssemble
            ? centerX + Math.cos(assemblyAngle) * assemblyRadius
            : ox + (Math.random() - 0.5) * scatter,
          y: shouldAssemble
            ? centerY + Math.sin(assemblyAngle) * assemblyRadius * 0.72
            : oy + (Math.random() - 0.5) * scatter,
          vx: 0,
          vy: 0,
          phase: Math.random() * Math.PI * 2,
          size: Math.max(
            lowPower ? 1.16 : 1.3,
            Math.min(lowPower ? 2.28 : 2.58, scale * (lowPower ? 0.8 : 0.92)),
          ),
          bright: index % 13 === 0,
        });
      });

      assembledOnce = true;
      sceneStartedAt = performance.now();
      lastActivityAt = sceneStartedAt;
      canvas.dataset.particleCount = String(particles.length);
      drawParticles(performance.now(), false);
    };

    const resizeCanvas = () => {
      visualRect = visual.getBoundingClientRect();
      width = visualRect.width;
      height = visualRect.height;
      const pixelRatio = Math.min(
        window.devicePixelRatio || 1,
        lowPower ? 1 : 1.1,
      );
      canvas.width = Math.max(1, Math.round(width * pixelRatio));
      canvas.height = Math.max(1, Math.round(height * pixelRatio));
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      buildParticles();
    };

    const handlePointerMove = (event: globalThis.PointerEvent) => {
      if (event.pointerType === "touch") return;
      pointer.x = event.clientX - visualRect.left;
      pointer.y = event.clientY - visualRect.top;
      pointer.active = true;
      lastActivityAt = performance.now();
      updateAnimationState();
    };
    const handlePointerLeave = () => {
      pointer.active = false;
      lastActivityAt = performance.now();
    };
    const updateAnimationState = () => {
      if (document.hidden || !inView) {
        if (frame) window.cancelAnimationFrame(frame);
        frame = 0;
      } else if (!frame) {
        lastAnimationFrame = 0;
        lastRenderFrame = 0;
        nextRenderAt = 0;
        canvas.dataset.animationState = "active";
        frame = window.requestAnimationFrame(animate);
      }
    };
    const handleVisibility = () => updateAnimationState();

    sourceImage.onload = () => {
      if (destroyed) return;
      imageReady = true;
      buildParticles();
    };
    sourceImage.src = "/rhodes-island-logo.webp";

    resizeCanvas();
    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(visual);
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      updateAnimationState();
    });
    visibilityObserver.observe(visual);
    if (!coarsePointer && !prefersReducedMotion) {
      visual.addEventListener("pointermove", handlePointerMove, { passive: true });
      visual.addEventListener("pointerleave", handlePointerLeave);
    }
    document.addEventListener("visibilitychange", handleVisibility);
    updateAnimationState();

    return () => {
      destroyed = true;
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      visual.removeEventListener("pointermove", handlePointerMove);
      visual.removeEventListener("pointerleave", handlePointerLeave);
      document.removeEventListener("visibilitychange", handleVisibility);
      if (frame) window.cancelAnimationFrame(frame);
      context.clearRect(0, 0, width, height);
      delete canvas.dataset.refreshRate;
      delete canvas.dataset.targetFps;
      delete canvas.dataset.animationState;
      delete canvas.dataset.particleCount;
      sourceImage.onload = null;
    };
  }, [particleMotionReady]);

  useEffect(() => {
    const visual = heroVisual.current;
    const canvas = wireSphereCanvas.current;
    if (!visual || !canvas) return;

    const context = canvas.getContext("2d", {
      alpha: true,
      desynchronized: true,
    });
    if (!context) return;

    if (!sphereMotionReady) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    type Vector3 = { x: number; y: number; z: number; phase: number };
    type Edge = { a: number; b: number; accent: boolean };
    type ProjectedPoint = {
      x: number;
      y: number;
      z: number;
      depth: number;
      index: number;
    };
    type ProjectedEdge = {
      start: ProjectedPoint;
      end: ProjectedPoint;
      depth: number;
      accent: boolean;
      index: number;
      opacity: number;
    };

    const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
    const prefersReducedMotion = document.documentElement.dataset.motion === "lite";
    const lowPower =
      document.documentElement.dataset.motion === "lite" || coarsePointer;
    const deviceNavigator = navigator as Navigator & { deviceMemory?: number };
    const highMotionPerformance =
      !lowPower &&
      (deviceNavigator.hardwareConcurrency || 4) >= 8 &&
      (deviceNavigator.deviceMemory || 4) >= 8;
    const nodeCount = prefersReducedMotion ? 20 : lowPower ? 26 : 44;
    const chordCount = prefersReducedMotion ? 6 : lowPower ? 12 : 26;
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const clamp = (value: number, minimum = 0, maximum = 1) =>
      Math.max(minimum, Math.min(maximum, value));
    const normalize = (point: Pick<Vector3, "x" | "y" | "z">) => {
      const length = Math.hypot(point.x, point.y, point.z) || 1;
      return {
        x: point.x / length,
        y: point.y / length,
        z: point.z / length,
      };
    };
    const nodes: Vector3[] = Array.from({ length: nodeCount }, (_, index) => {
      const y = 1 - ((index + 0.5) / nodeCount) * 2;
      const radius = Math.sqrt(Math.max(0, 1 - y * y));
      const angle = goldenAngle * index + Math.sin(index * 2.17) * 0.055;
      const irregularity = 1 + Math.sin(index * 4.13) * 0.026;
      const normalized = normalize({
        x: Math.cos(angle) * radius * irregularity,
        y: y * (1 + Math.cos(index * 2.73) * 0.02),
        z: Math.sin(angle) * radius * irregularity,
      });
      return {
        ...normalized,
        phase: index * 1.731 + (index % 5) * 0.47,
      };
    });

    const createRandom = (seed: number) => {
      let value = seed >>> 0;
      return () => {
        value += 0x6d2b79f5;
        let result = value;
        result = Math.imul(result ^ (result >>> 15), result | 1);
        result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
        return ((result ^ (result >>> 14)) >>> 0) / 4_294_967_296;
      };
    };

    const edgeKey = (a: number, b: number) =>
      `${Math.min(a, b)}-${Math.max(a, b)}`;

    const createSurfaceEdges = (): Edge[] => {
      const edges: Edge[] = [];
      const seen = new Set<string>();
      const neighbourCount = lowPower ? 3 : 4;
      nodes.forEach((node, index) => {
        const neighbours = nodes
          .map((candidate, candidateIndex) => ({
            index: candidateIndex,
            distance:
              (node.x - candidate.x) ** 2 +
              (node.y - candidate.y) ** 2 +
              (node.z - candidate.z) ** 2,
          }))
          .filter((candidate) => candidate.index !== index)
          .sort((first, second) => first.distance - second.distance)
          .slice(0, neighbourCount);
        neighbours.forEach((neighbour) => {
          const key = edgeKey(index, neighbour.index);
          if (seen.has(key)) return;
          seen.add(key);
          edges.push({
            a: index,
            b: neighbour.index,
            accent: edges.length % 9 === 0,
          });
        });
      });
      return edges;
    };

    const surfaceEdges = createSurfaceEdges();
    const surfaceEdgeKeys = new Set(
      surfaceEdges.map((edge) => edgeKey(edge.a, edge.b)),
    );

    const createFaces = () => {
      const adjacency = Array.from(
        { length: nodeCount },
        () => new Set<number>(),
      );
      surfaceEdges.forEach((edge) => {
        adjacency[edge.a].add(edge.b);
        adjacency[edge.b].add(edge.a);
      });
      const faces: Array<[number, number, number]> = [];
      const faceLimit = lowPower ? 10 : 24;
      for (let a = 0; a < nodeCount && faces.length < faceLimit; a += 1) {
        const neighbours = [...adjacency[a]].filter((value) => value > a);
        for (let first = 0; first < neighbours.length; first += 1) {
          for (
            let second = first + 1;
            second < neighbours.length;
            second += 1
          ) {
            const b = neighbours[first];
            const c = neighbours[second];
            if (adjacency[b].has(c)) faces.push([a, b, c]);
            if (faces.length >= faceLimit) break;
          }
          if (faces.length >= faceLimit) break;
        }
      }
      return faces;
    };

    const faces = createFaces();

    const createChords = (seed: number): Edge[] => {
      const random = createRandom(seed);
      const edges: Edge[] = [];
      const seen = new Set<string>();
      let attempts = 0;
      while (edges.length < chordCount && attempts < chordCount * 90) {
        attempts += 1;
        const a = Math.floor(random() * nodeCount);
        const b = Math.floor(random() * nodeCount);
        if (a === b) continue;
        const key = edgeKey(a, b);
        if (seen.has(key) || surfaceEdgeKeys.has(key)) continue;
        const first = nodes[a];
        const second = nodes[b];
        const dot = first.x * second.x + first.y * second.y + first.z * second.z;
        if (dot < -0.72 || dot > 0.34) continue;
        seen.add(key);
        edges.push({ a, b, accent: edges.length % 5 === 0 });
      }
      for (let index = 0; edges.length < chordCount; index += 1) {
        edges.push({
          a: index % nodeCount,
          b: (index * 7 + Math.floor(nodeCount * 0.41)) % nodeCount,
          accent: index % 5 === 0,
        });
      }
      return edges;
    };

    let topologySeed = 41;
    let previousChords = createChords(topologySeed);
    topologySeed += 37;
    let nextChords = createChords(topologySeed);
    let topologyStartedAt = performance.now();
    let frame = 0;
    let lastFrame = 0;
    let lastRaf = 0;
    let slowFrames = 0;
    let frameInterval = prefersReducedMotion
      ? Number.POSITIVE_INFINITY
      : lowPower
        ? 1000 / 20
        : highMotionPerformance
          ? 1000 / 36
          : 1000 / 28;
    let width = 0;
    let height = 0;
    let centerX = 0;
    let centerY = 0;
    let sphereRadius = 0;
    let volumeGradient: CanvasGradient | null = null;
    let destroyed = false;
    let focusPulse = 0;
    const initialBounds = visual.getBoundingClientRect();
    let inView =
      initialBounds.bottom > 0 && initialBounds.top < window.innerHeight;

    const rotatePoint = (
      point: Pick<Vector3, "x" | "y" | "z">,
      yaw: number,
      pitch: number,
      roll: number,
    ) => {
      const cosYaw = Math.cos(yaw);
      const sinYaw = Math.sin(yaw);
      const xAfterYaw = point.x * cosYaw + point.z * sinYaw;
      const zAfterYaw = -point.x * sinYaw + point.z * cosYaw;

      const cosPitch = Math.cos(pitch);
      const sinPitch = Math.sin(pitch);
      const yAfterPitch = point.y * cosPitch - zAfterYaw * sinPitch;
      const zAfterPitch = point.y * sinPitch + zAfterYaw * cosPitch;

      const cosRoll = Math.cos(roll);
      const sinRoll = Math.sin(roll);
      return {
        x: xAfterYaw * cosRoll - yAfterPitch * sinRoll,
        y: xAfterYaw * sinRoll + yAfterPitch * cosRoll,
        z: zAfterPitch,
      };
    };

    const projectPoint = (
      point: Pick<Vector3, "x" | "y" | "z">,
      index: number,
    ): ProjectedPoint => {
      const cameraDistance = 3.05;
      const perspective = cameraDistance / (cameraDistance - point.z);
      return {
        x: centerX + point.x * sphereRadius * perspective,
        y: centerY + point.y * sphereRadius * perspective,
        z: point.z,
        depth: clamp((point.z + 1) * 0.5),
        index,
      };
    };

    const convexHull = (points: ProjectedPoint[]) => {
      if (points.length <= 3) return [...points];
      const sorted = [...points].sort((first, second) =>
        first.x === second.x ? first.y - second.y : first.x - second.x,
      );
      const cross = (
        origin: ProjectedPoint,
        first: ProjectedPoint,
        second: ProjectedPoint,
      ) =>
        (first.x - origin.x) * (second.y - origin.y) -
        (first.y - origin.y) * (second.x - origin.x);
      const lower: ProjectedPoint[] = [];
      sorted.forEach((point) => {
        while (
          lower.length >= 2 &&
          cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0
        ) {
          lower.pop();
        }
        lower.push(point);
      });
      const upper: ProjectedPoint[] = [];
      [...sorted].reverse().forEach((point) => {
        while (
          upper.length >= 2 &&
          cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0
        ) {
          upper.pop();
        }
        upper.push(point);
      });
      lower.pop();
      upper.pop();
      return lower.concat(upper);
    };

    const drawEdge = (edge: ProjectedEdge, kind: "surface" | "chord") => {
      const depthCurve = edge.depth * edge.depth;
      const isSurface = kind === "surface";
      const baseAlpha = isSurface
        ? 0.085 + depthCurve * (edge.accent ? 0.8 : 0.6)
        : 0.075 + depthCurve * (edge.accent ? 0.58 : 0.4);
      const focusBoost =
        0.9 + edge.depth * 0.12 + focusPulse * edge.depth * 0.05;
      const alpha = baseAlpha * focusBoost * edge.opacity;
      context.beginPath();
      context.moveTo(edge.start.x, edge.start.y);
      context.lineTo(edge.end.x, edge.end.y);
      context.lineWidth = isSurface
        ? 0.42 + edge.depth * 1.22 + focusPulse * edge.depth * 0.12 + (edge.accent ? 0.42 : 0)
        : 0.36 + edge.depth * 0.72 + focusPulse * edge.depth * 0.08 + (edge.accent ? 0.24 : 0);
      context.strokeStyle = edge.accent
        ? `rgba(205, 255, 82, ${clamp(alpha, 0, 0.94)})`
        : `rgba(84, 239, 132, ${clamp(alpha, 0, 0.78)})`;
      context.stroke();
    };

    const drawSphere = (now: number) => {
      context.clearRect(0, 0, width, height);
      if (!width || !height) return;
      focusPulse = lowPower ? 0 : 0.5 + Math.sin(now * 0.00058) * 0.5;

      const topologyDuration = lowPower ? 4300 : 2900;
      let topologyProgress = (now - topologyStartedAt) / topologyDuration;
      if (topologyProgress >= 1) {
        previousChords = nextChords;
        topologySeed += 37;
        nextChords = createChords(topologySeed);
        topologyStartedAt = now;
        topologyProgress = 0;
      }
      const morph =
        0.5 - Math.cos(Math.max(0, Math.min(1, topologyProgress)) * Math.PI) * 0.5;
      const chordBlendProgress = clamp((morph - 0.2) / 0.6);
      const chordBlend =
        chordBlendProgress * chordBlendProgress * (3 - 2 * chordBlendProgress);

      const yaw = now * 0.00022;
      const pitch = 0.2 + Math.sin(now * 0.00015) * 0.18;
      const roll = -0.1 + Math.cos(now * 0.00011) * 0.14;
      const driftAmount = lowPower ? 0.008 : 0.018;
      const rotatedNodes = nodes.map((node) => {
        const firstDrift = Math.sin(now * 0.00042 + node.phase) * driftAmount;
        const secondDrift =
          Math.cos(now * 0.00031 + node.phase * 1.37) * driftAmount * 0.72;
        const deformed = normalize({
          x: node.x + node.y * firstDrift - node.z * secondDrift,
          y: node.y - node.x * firstDrift * 0.7 + node.z * secondDrift,
          z: node.z + node.x * secondDrift - node.y * firstDrift * 0.35,
        });
        return rotatePoint(deformed, yaw, pitch, roll);
      });
      const projectedNodes = rotatedNodes.map((point, index) =>
        projectPoint(point, index),
      );

      const hull = convexHull(projectedNodes);
      if (hull.length > 2) {
        context.beginPath();
        context.moveTo(hull[0].x, hull[0].y);
        hull.slice(1).forEach((point) => context.lineTo(point.x, point.y));
        context.closePath();
        context.fillStyle = volumeGradient ?? "rgba(30, 121, 63, 0.06)";
        context.fill();
      }

      const projectedFaces = faces
        .map((face) => ({
          points: face.map((index) => projectedNodes[index]),
          depth:
            face.reduce((sum, index) => sum + projectedNodes[index].depth, 0) /
            face.length,
        }))
        .sort((first, second) => first.depth - second.depth);
      projectedFaces.forEach((face) => {
        context.beginPath();
        context.moveTo(face.points[0].x, face.points[0].y);
        context.lineTo(face.points[1].x, face.points[1].y);
        context.lineTo(face.points[2].x, face.points[2].y);
        context.closePath();
        context.fillStyle = `rgba(94, 255, 145, ${0.006 + face.depth ** 3 * 0.045})`;
        context.fill();
      });

      const projectChordSet = (
        chords: Edge[],
        opacity: number,
        indexOffset: number,
      ): ProjectedEdge[] => {
        if (opacity <= 0.002) return [];
        return chords.map((edge, index) => ({
          start: projectedNodes[edge.a],
          end: projectedNodes[edge.b],
          depth:
            (projectedNodes[edge.a].depth + projectedNodes[edge.b].depth) * 0.5,
          accent: edge.accent,
          index: indexOffset + index,
          opacity,
        }));
      };
      const dynamicChords = [
        ...projectChordSet(previousChords, 1 - chordBlend, 0),
        ...projectChordSet(nextChords, chordBlend, previousChords.length),
      ];
      dynamicChords.sort((first, second) => first.depth - second.depth);

      const projectedSurface = surfaceEdges
        .map((edge, index) => ({
          start: projectedNodes[edge.a],
          end: projectedNodes[edge.b],
          depth:
            (projectedNodes[edge.a].depth + projectedNodes[edge.b].depth) * 0.5,
          accent: edge.accent,
          index,
          opacity: 1,
        }))
        .sort((first, second) => first.depth - second.depth);

      context.globalCompositeOperation = "source-over";
      dynamicChords.forEach((edge) => drawEdge(edge, "chord"));
      projectedSurface.forEach((edge) => drawEdge(edge, "surface"));

      if (!prefersReducedMotion) {
        const flowSpeed = lowPower ? 0.00008 : 0.00017;
        const flowLayers = lowPower
          ? [
              { length: 1, alpha: 0.2, width: 1.18 },
              { length: 0.58, alpha: 0.42, width: 1.06 },
              { length: 0.22, alpha: 0.82, width: 0.94 },
            ]
          : [
              { length: 1, alpha: 0.16, width: 1.28 },
              { length: 0.78, alpha: 0.23, width: 1.19 },
              { length: 0.56, alpha: 0.34, width: 1.1 },
              { length: 0.34, alpha: 0.5, width: 1.01 },
              { length: 0.15, alpha: 0.84, width: 0.92 },
            ];
        const drawFlowGroup = (front: boolean, accent: boolean) => {
          const baseWidth = front
            ? accent ? 2.15 : 1.42
            : accent ? 1 : 0.72;
          const baseAlpha = accent
            ? front ? 0.68 : 0.2
            : front ? 0.48 : 0.13;
          const color = accent ? "226, 255, 105" : "140, 255, 178";
          flowLayers.forEach((layer) => {
            context.beginPath();
            projectedSurface.forEach((edge) => {
              if ((edge.depth >= 0.5) !== front || edge.accent !== accent) return;
              const travel = (now * flowSpeed + edge.index * 0.137) % 1;
              const flowLength = (lowPower
                ? 0.2 + edge.depth * 0.12
                : 0.27 + edge.depth * 0.18) * layer.length;
              const reversed = edge.index % 2 === 1;
              const head = reversed ? 1 - travel : travel;
              const tail = clamp(
                head + (reversed ? flowLength : -flowLength),
                0,
                1,
              );
              const startX = edge.start.x + (edge.end.x - edge.start.x) * tail;
              const startY = edge.start.y + (edge.end.y - edge.start.y) * tail;
              const endX = edge.start.x + (edge.end.x - edge.start.x) * head;
              const endY = edge.start.y + (edge.end.y - edge.start.y) * head;
              context.moveTo(startX, startY);
              context.lineTo(endX, endY);
            });
            context.lineCap = "round";
            context.lineWidth = baseWidth * layer.width;
            context.strokeStyle = `rgba(${color}, ${baseAlpha * layer.alpha})`;
            context.stroke();
          });
        };
        context.save();
        context.globalCompositeOperation = lowPower ? "source-over" : "screen";
        drawFlowGroup(false, false);
        drawFlowGroup(false, true);
        drawFlowGroup(true, false);
        drawFlowGroup(true, true);
        context.restore();
      }

      context.beginPath();
      if (hull.length > 1) {
        context.moveTo(hull[0].x, hull[0].y);
        hull.slice(1).forEach((point) => context.lineTo(point.x, point.y));
        context.closePath();
        context.lineWidth = 0.95;
        context.strokeStyle = "rgba(171, 255, 100, 0.34)";
        context.stroke();
      }

      [...projectedNodes]
        .sort((first, second) => first.depth - second.depth)
        .forEach((node) => {
          const radius =
            0.58 + node.depth * 1.85 + focusPulse * node.depth * 0.18;
          context.beginPath();
          context.arc(node.x, node.y, radius, 0, Math.PI * 2);
          context.fillStyle =
            node.index % 9 === 0
              ? `rgba(215, 255, 90, ${0.18 + node.depth * 0.78})`
              : `rgba(119, 255, 156, ${0.1 + node.depth * 0.7})`;
          context.fill();
        });

      if (!lowPower && !prefersReducedMotion) {
        dynamicChords.forEach((edge) => {
          if (edge.index % 5 !== 0) return;
          const travel = (now * 0.0002 + edge.index * 0.173) % 1;
          const x = edge.start.x + (edge.end.x - edge.start.x) * travel;
          const y = edge.start.y + (edge.end.y - edge.start.y) * travel;
          context.beginPath();
          context.arc(x, y, 0.9 + edge.depth * 1.15, 0, Math.PI * 2);
          context.fillStyle = `rgba(224, 255, 117, ${(0.25 + edge.depth * 0.62) * edge.opacity})`;
          context.fill();
        });
      }
    };

    const animate = (now: number) => {
      if (destroyed) return;
      if (lastRaf) {
        const rafDuration = now - lastRaf;
        slowFrames = rafDuration > 25 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
        if (!lowPower && slowFrames > 24) frameInterval = 1000 / 30;
      }
      lastRaf = now;
      if (now - lastFrame >= frameInterval) {
        lastFrame = now;
        drawSphere(now);
      }
      frame = window.requestAnimationFrame(animate);
    };

    const resizeCanvas = () => {
      const bounds = visual.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      const compactLayout = width < 720;
      centerX = width * (compactLayout ? 0.5 : 0.59);
      centerY = height * (compactLayout ? 0.48 : 0.44);
      sphereRadius = Math.min(
        width * (compactLayout ? 0.38 : 0.36),
        height * (compactLayout ? 0.31 : 0.39),
      );
      const pixelRatio = Math.min(
        window.devicePixelRatio || 1,
        1,
      );
      canvas.width = Math.max(1, Math.round(width * pixelRatio));
      canvas.height = Math.max(1, Math.round(height * pixelRatio));
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      volumeGradient = context.createRadialGradient(
        centerX - sphereRadius * 0.18,
        centerY - sphereRadius * 0.2,
        sphereRadius * 0.08,
        centerX,
        centerY,
        sphereRadius * 1.08,
      );
      volumeGradient.addColorStop(0, "rgba(132, 255, 158, 0.095)");
      volumeGradient.addColorStop(0.58, "rgba(50, 173, 91, 0.047)");
      volumeGradient.addColorStop(1, "rgba(9, 58, 30, 0.006)");
      drawSphere(performance.now());
    };

    const updateAnimationState = () => {
      if (document.hidden || !inView || prefersReducedMotion) {
        if (frame) window.cancelAnimationFrame(frame);
        frame = 0;
      } else if (!frame) {
        lastRaf = 0;
        frame = window.requestAnimationFrame(animate);
      }
    };
    const handleVisibility = () => updateAnimationState();

    resizeCanvas();
    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(visual);
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      updateAnimationState();
    });
    visibilityObserver.observe(visual);
    document.addEventListener("visibilitychange", handleVisibility);
    updateAnimationState();

    return () => {
      destroyed = true;
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      document.removeEventListener("visibilitychange", handleVisibility);
      if (frame) window.cancelAnimationFrame(frame);
      context.clearRect(0, 0, width, height);
    };
  }, [sphereMotionReady]);

  const technicalArticles = useMemo(
    () => articles.filter((article) => (article.contentType || "article") === "article"),
    [articles],
  );
  const labArticles = useMemo(
    () => articles.filter((article) => article.contentType === "lab"),
    [articles],
  );
  const collectionArticles = useMemo(
    () => articles.filter((article) => article.contentType === "collection"),
    [articles],
  );

  const visibleArticles = useMemo(() => {
    const filtered = filter === "全部"
      ? technicalArticles
      : technicalArticles.filter((article) => article.category === filter);
    return filtered.map((article) => localizeArticle(article, language));
  }, [filter, technicalArticles, language]);

  const latestSource = articles.find((article) => article.contentType !== "collection");
  const latestArticle = latestSource ? localizeArticle(latestSource, language) : null;

  const searchEntries = useMemo<SearchEntry[]>(() => {
    const articleEntries = articles.map((article) => {
      const localized = localizeArticle(article, language);
      const contentType = localized.contentType || "article";
      const routeKey = articleRouteKey(localized);
      return {
        id: `article-${localized.id}`,
        type: contentType,
        eyebrow:
          contentType === "lab"
            ? copy.searchLab
            : contentType === "collection"
              ? copy.searchCollection
              : copy.searchArticle,
        title: localized.title,
        description: localized.summary,
        href:
          contentType === "collection"
            ? `/collections/${encodeURIComponent(routeKey)}`
            : `/articles/${encodeURIComponent(routeKey)}`,
        keywords: [
          localized.title,
          localized.summary,
          localized.code,
          localized.category,
          ...localized.tags,
        ].join(" "),
      };
    });
    return articleEntries;
  }, [articles, copy, language]);

  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    if (!query) return searchEntries.slice(0, 7);
    return searchEntries
      .filter((entry) => entry.keywords.toLocaleLowerCase().includes(query))
      .slice(0, 8);
  }, [searchEntries, searchQuery]);

  useEffect(() => {
    const header = siteHeader.current;
    if (!header) return;
    let frame = 0;
    let previousY = window.scrollY;

    const updateHeader = () => {
      frame = 0;
      const currentY = Math.max(0, window.scrollY);
      const delta = currentY - previousY;
      const controlsOpen = menuOpen || searchOpen;
      header.classList.toggle("is-scrolled", currentY > 28);
      header.classList.toggle(
        "is-reading-forward",
        !controlsOpen && currentY > 240 && delta > 3,
      );
      if (controlsOpen || delta < -2 || currentY < 180) {
        header.classList.remove("is-reading-forward");
      }
      previousY = currentY;
    };
    const requestUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(updateHeader);
    };

    updateHeader();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    return () => {
      window.removeEventListener("scroll", requestUpdate);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [menuOpen, searchOpen]);

  useEffect(() => {
    if (
      document.documentElement.dataset.motion === "lite" ||
      window.matchMedia("(pointer: coarse)").matches
    ) {
      return;
    }

    const cards = Array.from(
      document.querySelectorAll<HTMLElement>("[data-tilt-card]"),
    );
    const cleanups = cards.map((card) => {
      let frame = 0;
      let targetX = 0;
      let targetY = 0;
      let currentX = 0;
      let currentY = 0;
      let targetGlowX = 50;
      let targetGlowY = 50;
      let currentGlowX = 50;
      let currentGlowY = 50;
      let tracking = false;
      let bounds: DOMRect | null = null;
      let glowResetTimer = 0;

      const render = () => {
        frame = 0;
        const damping = tracking ? 0.18 : 0.12;
        currentX += (targetX - currentX) * damping;
        currentY += (targetY - currentY) * damping;
        currentGlowX += (targetGlowX - currentGlowX) * damping;
        currentGlowY += (targetGlowY - currentGlowY) * damping;
        card.style.setProperty("--card-tilt-x", `${currentY * -2.2}deg`);
        card.style.setProperty("--card-tilt-y", `${currentX * 3}deg`);
        card.style.setProperty("--card-glow-x", `${currentGlowX}%`);
        card.style.setProperty("--card-glow-y", `${currentGlowY}%`);

        const remaining =
          Math.abs(targetX - currentX) +
          Math.abs(targetY - currentY) +
          Math.abs(targetGlowX - currentGlowX) / 50 +
          Math.abs(targetGlowY - currentGlowY) / 50;
        if (remaining > 0.004) {
          frame = window.requestAnimationFrame(render);
        } else if (!tracking) {
          card.classList.remove("is-tilting");
        }
      };
      const handleEnter = (event: globalThis.PointerEvent) => {
        if (glowResetTimer) {
          window.clearTimeout(glowResetTimer);
          glowResetTimer = 0;
        }
        bounds = card.getBoundingClientRect();
        const entryX = Math.min(
          1,
          Math.max(-1, ((event.clientX - bounds.left) / bounds.width - 0.5) * 2),
        );
        const entryY = Math.min(
          1,
          Math.max(-1, ((event.clientY - bounds.top) / bounds.height - 0.5) * 2),
        );
        currentGlowX = targetGlowX = (entryX + 1) * 50;
        currentGlowY = targetGlowY = (entryY + 1) * 50;
        card.style.setProperty("--card-glow-x", `${currentGlowX}%`);
        card.style.setProperty("--card-glow-y", `${currentGlowY}%`);
        card.classList.remove("is-glow-leaving");
      };
      const handleMove = (event: globalThis.PointerEvent) => {
        if (event.pointerType === "touch") return;
        bounds ??= card.getBoundingClientRect();
        targetX = Math.min(
          1,
          Math.max(-1, ((event.clientX - bounds.left) / bounds.width - 0.5) * 2),
        );
        targetY = Math.min(
          1,
          Math.max(-1, ((event.clientY - bounds.top) / bounds.height - 0.5) * 2),
        );
        targetGlowX = (targetX + 1) * 50;
        targetGlowY = (targetY + 1) * 50;
        tracking = true;
        card.classList.add("is-tilting");
        if (!frame) frame = window.requestAnimationFrame(render);
      };
      const handleLeave = () => {
        tracking = false;
        bounds = null;
        targetX = 0;
        targetY = 0;
        targetGlowX = currentGlowX;
        targetGlowY = currentGlowY;
        card.classList.add("is-glow-leaving");
        if (!frame) frame = window.requestAnimationFrame(render);
        glowResetTimer = window.setTimeout(() => {
          glowResetTimer = 0;
          targetGlowX = 50;
          targetGlowY = 50;
          if (!frame) frame = window.requestAnimationFrame(render);
        }, 240);
      };

      card.addEventListener("pointerenter", handleEnter, { passive: true });
      card.addEventListener("pointermove", handleMove, { passive: true });
      card.addEventListener("pointerleave", handleLeave);
      return () => {
        card.removeEventListener("pointerenter", handleEnter);
        card.removeEventListener("pointermove", handleMove);
        card.removeEventListener("pointerleave", handleLeave);
        if (glowResetTimer) window.clearTimeout(glowResetTimer);
        if (frame) window.cancelAnimationFrame(frame);
        card.classList.remove("is-tilting", "is-glow-leaving");
      };
    });

    return () => cleanups.forEach((cleanup) => cleanup());
  }, [filter, articles.length]);

  const handleSectionNavigation = (event: MouseEvent<HTMLAnchorElement>) => {
    const href = event.currentTarget.getAttribute("href");
    if (!href?.startsWith("#")) return;

    const targetId = decodeURIComponent(href.slice(1)) || "top";
    const target = document.getElementById(targetId);
    if (!target) return;

    event.preventDefault();
    setMenuOpen(false);
    const reducedMotion = document.documentElement.dataset.motion === "lite";
    const liteMotion =
      reducedMotion || document.documentElement.dataset.motion === "lite";

    if (!liteMotion) {
      if (sectionJumpTimer.current) {
        window.clearTimeout(sectionJumpTimer.current);
      }
      const label =
        event.currentTarget.dataset.transitionLabel || targetId.toUpperCase();
      setSectionJump({ key: Date.now(), label });
      sectionJumpTimer.current = window.setTimeout(
        () => setSectionJump(null),
        780,
      );
    }

    window.requestAnimationFrame(() => {
      target.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "start",
      });
    });
    window.history.replaceState(null, "", href);
  };

  const handleArticleNavigation = (
    event: MouseEvent<HTMLAnchorElement>,
    articleId: string,
    source: "latest" | "card" | "lab",
  ) => {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    const href = event.currentTarget.href;
    setArticleTransitionSource(`${source}:${articleId}`);
    window.requestAnimationFrame(() => window.location.assign(href));
  };

  const openSearchEntry = (entry: SearchEntry) => {
    setSearchOpen(false);
    if (entry.href.startsWith("#")) {
      const target = document.getElementById(entry.href.slice(1));
      if (!target) return;
      const reducedMotion = document.documentElement.dataset.motion === "lite";
      window.requestAnimationFrame(() => {
        target.scrollIntoView({
          behavior: reducedMotion ? "auto" : "smooth",
          block: "start",
        });
      });
      window.history.replaceState(null, "", entry.href);
      return;
    }
    window.location.assign(entry.href);
  };

  const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (!searchResults.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedSearchIndex((index) => (index + 1) % searchResults.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedSearchIndex(
        (index) => (index - 1 + searchResults.length) % searchResults.length,
      );
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      openSearchEntry(
        searchResults[Math.min(selectedSearchIndex, searchResults.length - 1)],
      );
    }
  };

  const activeJourneyIndex = Math.max(
    0,
    navItems.findIndex((item) => item.href.slice(1) === activeSection),
  );
  const activeJourneyNumber = String(activeJourneyIndex + 1).padStart(2, "0");

  return (
    <main
      id="top"
      className={`site-shell theme-${theme} ${transitioning ? "is-switching" : ""} ${languageSwitching ? "is-language-switching" : ""}`}
      data-language={language}
    >
      <LiquidGlassFilters />
      <AmbientEffects />
      <LanguageReassembly active={languageSwitching} target={targetLanguage} />
      <span className="page-scroll-progress" aria-hidden="true" />
      <nav
        className="journey-rail liquid-glass liquid-glass--clear"
        data-liquid-glass
        aria-label={language === "zh" ? "页面浏览进度" : "Page progress"}
      >
        <LiquidGlassLens />
        <div className="journey-current" aria-live="polite">
          <strong key={activeSection}>{activeJourneyNumber}</strong>
          <span>{activeJourneyIndex + 1} / {navItems.length}</span>
        </div>
        <div className="journey-meter">
          <span className="journey-track" aria-hidden="true">
            <span className="journey-progress-fill" />
          </span>
          <ol>
            {navItems.map((item, index) => {
              const sectionId = item.href.slice(1);
              const isActive = activeSection === sectionId;
              const number = String(index + 1).padStart(2, "0");
              return (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className={isActive ? "is-active" : ""}
                    aria-current={isActive ? "location" : undefined}
                    aria-label={`${number} · ${copy.nav[index]}`}
                    onClick={handleSectionNavigation}
                  >
                    <span className="journey-stop-dot" aria-hidden="true" />
                    <span className="journey-tooltip" aria-hidden="true">
                      {copy.nav[index]}
                    </span>
                  </a>
                </li>
              );
            })}
          </ol>
        </div>
      </nav>

      {sectionJump && (
        <div
          key={sectionJump.key}
          className="section-jump-transition"
          aria-hidden="true"
        >
          <span className="section-jump-veil" />
          <span className="section-jump-line" />
          <span className="section-jump-code">
            {"// "}{sectionJump.label}
          </span>
        </div>
      )}

      <ThemeTransition active={transitioning} target={transitionTarget} />

      {searchOpen && (
        <div
          className="spotlight-overlay"
          role="presentation"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setSearchVisibility(false);
          }}
        >
          <section
            className="spotlight-panel liquid-glass liquid-glass--thick"
            data-liquid-glass
            role="dialog"
            aria-modal="true"
            aria-labelledby="spotlight-title"
            style={{ viewTransitionName: "spotlight-liquid-glass" }}
          >
            <LiquidGlassLens />
            <header className="spotlight-heading">
              <div>
                <span className="spotlight-kicker">MOZELLE / SPOTLIGHT</span>
                <h2 id="spotlight-title" data-lang-token>{copy.searchTitle}</h2>
              </div>
              <button
                className="spotlight-close"
                type="button"
                aria-label={copy.searchClose}
                onClick={() => setSearchVisibility(false)}
              >
                <span aria-hidden="true" />
              </button>
            </header>
            <label className="spotlight-input-shell">
              <span className="search-glyph" aria-hidden="true" />
              <input
                ref={searchInput}
                type="search"
                role="combobox"
                aria-expanded="true"
                aria-controls="spotlight-results"
                aria-activedescendant={
                  searchResults[selectedSearchIndex]
                    ? `spotlight-${searchResults[selectedSearchIndex].id}`
                    : undefined
                }
                value={searchQuery}
                placeholder={copy.searchPlaceholder}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setSelectedSearchIndex(0);
                }}
                onKeyDown={handleSearchKeyDown}
              />
              <kbd>CTRL K · ⌘ K</kbd>
            </label>
            <div
              id="spotlight-results"
              className="spotlight-results"
              role="listbox"
              aria-label={copy.searchTitle}
            >
              {searchResults.length ? searchResults.map((entry, index) => (
                <a
                  id={`spotlight-${entry.id}`}
                  className={index === selectedSearchIndex ? "is-selected" : ""}
                  href={entry.href}
                  key={entry.id}
                  role="option"
                  aria-selected={index === selectedSearchIndex}
                  onPointerEnter={() => setSelectedSearchIndex(index)}
                  onClick={(event) => {
                    if (
                      event.metaKey ||
                      event.ctrlKey ||
                      event.shiftKey ||
                      event.altKey
                    ) {
                      return;
                    }
                    event.preventDefault();
                    openSearchEntry(entry);
                  }}
                >
                  <span className={`spotlight-result-icon result-${entry.type}`} aria-hidden="true">
                    {entry.type === "article" ? "A" : entry.type === "lab" ? "L" : "C"}
                  </span>
                  <span className="spotlight-result-copy">
                    <small>{entry.eyebrow}</small>
                    <strong data-lang-token>{entry.title}</strong>
                    <span data-lang-token>{entry.description}</span>
                  </span>
                  <span className="spotlight-result-arrow" aria-hidden="true">↗</span>
                </a>
              )) : (
                <div className="spotlight-empty" role="status">
                  <span aria-hidden="true">⌁</span>
                  <p data-lang-token>{copy.searchEmpty}</p>
                </div>
              )}
            </div>
            <footer className="spotlight-footer">
              <span data-lang-token>{copy.searchHint}</span>
              <span>↑↓ SELECT · ENTER OPEN · ESC CLOSE</span>
            </footer>
          </section>
        </div>
      )}

      <header
        ref={siteHeader}
        className="site-header liquid-glass liquid-glass--regular"
        data-liquid-glass
      >
        <LiquidGlassLens />
        <a
          className="brand"
          href="#top"
          data-transition-label="TOP"
          onClick={handleSectionNavigation}
        >
          <span className="brand-mark" aria-hidden="true">
            <span />
          </span>
          <span className="brand-copy">
            <strong>{siteSettings.siteTitle}</strong>
            <small>{"// DIMENSION"}</small>
          </span>
        </a>

        <button
          className={`menu-toggle ${menuOpen ? "is-open" : ""}`}
          type="button"
          aria-label={menuOpen ? copy.closeMenu : copy.openMenu}
          aria-expanded={menuOpen}
          aria-controls="main-navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span />
          <span />
        </button>

        <nav id="main-navigation" className={`site-nav ${menuOpen ? "is-open" : ""}`} aria-label={copy.mainNav}>
          {navItems.map((item, index) => (
            <a
              href={item.href}
              key={item.href}
              className={activeSection === item.href.slice(1) ? "is-active" : ""}
              aria-current={activeSection === item.href.slice(1) ? "page" : undefined}
              data-transition-label={item.href.slice(1).toUpperCase()}
              onClick={handleSectionNavigation}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <b className="nav-label" data-lang-token>{copy.nav[index]}</b>
            </a>
          ))}
          <a
            className="control-entry"
            href="/admin"
            aria-label={copy.adminLabel}
          >
            <span>06</span>
            CONTROL
          </a>
        </nav>

        <div className="header-controls">
          <button
            className="spotlight-trigger liquid-glass liquid-glass--clear"
            data-liquid-glass
            type="button"
            aria-label={copy.searchLabel}
            aria-expanded={searchOpen}
            aria-controls="spotlight-results"
            style={{
              viewTransitionName: searchOpen ? "none" : "spotlight-liquid-glass",
            }}
            onClick={() => {
              setMenuOpen(false);
              setSelectedSearchIndex(0);
              setSearchVisibility(true);
            }}
          >
            <LiquidGlassLens />
            <span className="search-glyph" aria-hidden="true" />
            <kbd>⌘K</kbd>
          </button>
          <button
            className="language-toggle liquid-glass liquid-glass--clear"
            data-liquid-glass
            type="button"
            onClick={toggleLanguage}
            disabled={languageSwitching}
            aria-label={copy.languageLabel}
          >
            <LiquidGlassLens />
            <span className={language === "zh" ? "is-active" : ""}>中</span>
            <i aria-hidden="true" />
            <span className={language === "en" ? "is-active" : ""}>EN</span>
          </button>
          <button
            className="theme-toggle"
            type="button"
            onClick={toggleTheme}
            onPointerEnter={() => setNightVisualReady(true)}
            onFocus={() => setNightVisualReady(true)}
            disabled={transitioning || languageSwitching}
            aria-label={theme === "day" ? copy.themeDayLabel : copy.themeNightLabel}
            aria-pressed={theme === "night"}
          >
            <span
              className="toggle-track liquid-glass liquid-glass--clear"
              data-liquid-glass
              aria-hidden="true"
            >
              <LiquidGlassLens />
              <span className="toggle-thumb" />
              <span className="toggle-option toggle-day">
                <span className="toggle-symbol">☼</span>
                <span className="toggle-option-label">DAY</span>
              </span>
              <span className="toggle-option toggle-night">
                <span className="toggle-symbol toggle-m3">M3</span>
                <span className="toggle-option-label">NIGHT</span>
              </span>
            </span>
          </button>
        </div>
      </header>

      <section
        ref={heroSection}
        className="hero"
        aria-labelledby="hero-title"
        data-section="top"
        data-section-state={activeSection === "top" ? "active" : undefined}
      >
        <div className="hero-ambient" aria-hidden="true">
          <span className="ambient-grid" />
          <span className="ambient-wave" />
          <span className="floating-page page-one" />
          <span className="floating-page page-two" />
          <span className="crystal crystal-one" />
          <span className="crystal crystal-two" />
          <span className="crystal crystal-three" />
        </div>

        <canvas
          ref={rhodesParticleCanvas}
          className="rhodes-particle-logo"
          aria-hidden="true"
        />

        <div className="hero-copy">
          <div className="hero-kicker">
            <span className="kicker-dot" />
            <span>{theme === "day" ? "DAYLIGHT / ELAINA" : "NIGHTFALL / MON3TR"}</span>
            <span className="kicker-code">{theme === "day" ? "EI-017" : "M3-010"}</span>
          </div>
          <h1 id="hero-title" data-lang-token>
            {theme === "day" ? (
              <>
                {copy.heroDay[0]}
                <br />
                {copy.heroDay[1]}
              </>
            ) : (
              <>
                {copy.heroNight[0]}
                <br />
                {copy.heroNight[1]}
              </>
            )}
          </h1>
          <p className="hero-description" data-lang-token>
            {language === "zh" ? siteSettings.bio : copy.bio} {copy.heroBioSuffix}
          </p>
          <div className="hero-actions">
            <a
              className="button button-primary"
              href="#articles"
              data-transition-label="ARTICLES"
              onClick={handleSectionNavigation}
            >
              <span className="button-spark" aria-hidden="true">✦</span>
              <span data-lang-token>{copy.enterBlog}</span>
            </a>
            <a
              className="button button-secondary"
              href="#lab"
              data-transition-label="LAB NOTES"
              onClick={handleSectionNavigation}
            >
              <span data-lang-token>{copy.labAction}</span>
              <span aria-hidden="true">↗</span>
            </a>
          </div>
          <ul className="interest-tags" aria-label={copy.interestsLabel}>
            <li><span>◈</span> ELECTRONICS</li>
            <li><span>⌁</span> OVERCLOCKING</li>
            <li><span>✧</span> COSPLAY</li>
            <li><span>◇</span> ACG</li>
          </ul>
        </div>

        <div ref={heroVisual} className="hero-visual" aria-hidden="true">
          <span className="hero-depth-light" />
          <div className="hero-sigil sigil-day">
            <span className="magic-aura" />
            <span className="magic-directional-field" />
            <svg className="anime-magic" viewBox="0 0 100 100" focusable="false">
              <g className="magic-outer-layer">
                <circle className="magic-circle magic-circle-outer" cx="50" cy="50" r="47" />
                <circle className="magic-circle magic-circle-runes" cx="50" cy="50" r="43" />
                <circle className="magic-circle magic-circle-main" cx="50" cy="50" r="38" />
                <path className="magic-arc magic-arc-one" pathLength="1" d="M 14 33 A 40 40 0 0 1 70 15" />
                <path className="magic-arc magic-arc-two" pathLength="1" d="M 86 67 A 40 40 0 0 1 30 85" />
              </g>
              <g className="magic-rune-layer">
                <circle className="magic-seal" cx="50" cy="5" r="3.4" />
                <circle className="magic-seal" cx="95" cy="50" r="3.4" />
                <circle className="magic-seal" cx="50" cy="95" r="3.4" />
                <circle className="magic-seal" cx="5" cy="50" r="3.4" />
                <g className="magic-rune-icon magic-icon-star" transform="translate(50 5)">
                  <path d="M0 -2.2 L0.58 -0.58 L2.2 0 L0.58 0.58 L0 2.2 L-0.58 0.58 L-2.2 0 L-0.58 -0.58 Z" />
                </g>
                <g className="magic-rune-icon magic-icon-moon" transform="translate(95 50)">
                  <path transform="translate(0.68 0)" d="M0.9 -2.05 A2.25 2.25 0 1 0 0.9 2.05 A1.72 1.72 0 0 1 0.9 -2.05 Z" />
                </g>
                <g className="magic-rune-icon magic-icon-sun" transform="translate(50 95)">
                  <circle cx="0" cy="0" r="0.95" />
                  <path d="M0 -2.45 V-1.55 M0 1.55 V2.45 M-2.45 0 H-1.55 M1.55 0 H2.45 M-1.73 -1.73 L-1.1 -1.1 M1.1 1.1 L1.73 1.73 M1.73 -1.73 L1.1 -1.1 M-1.1 1.1 L-1.73 1.73" />
                </g>
                <g className="magic-rune-icon magic-icon-spark" transform="translate(5 50)">
                  <path d="M0 -2.15 C0.22 -0.62 0.62 -0.22 2.15 0 C0.62 0.22 0.22 0.62 0 2.15 C-0.22 0.62 -0.62 0.22 -2.15 0 C-0.62 -0.22 -0.22 -0.62 0 -2.15 Z" />
                </g>
                <text className="magic-rune magic-rune-small" x="76" y="19">ᚨ</text>
                <text className="magic-rune magic-rune-small" x="82" y="82">ᛇ</text>
                <text className="magic-rune magic-rune-small" x="18" y="82">ᚱ</text>
                <text className="magic-rune magic-rune-small" x="24" y="19">ᚹ</text>
              </g>
              <g className="magic-inner-layer">
                <circle className="magic-circle magic-circle-inner" cx="50" cy="50" r="31" />
                <polygon className="magic-hexagram" points="50,18 78,67 22,67" />
                <polygon className="magic-hexagram" points="50,82 22,33 78,33" />
                <circle className="magic-circle magic-circle-core" cx="50" cy="50" r="20" />
                <path className="magic-diamond" d="M50 28 L72 50 L50 72 L28 50 Z" />
                <path className="magic-cross" d="M50 19 V81 M19 50 H81" />
              </g>
              <g className="magic-core-layer">
                <circle className="magic-core-halo" cx="50" cy="50" r="10" />
                <path className="magic-core-star" d="M50 38 L54 46 L63 50 L54 54 L50 63 L46 54 L37 50 L46 46 Z" />
                <circle className="magic-core-dot" cx="50" cy="50" r="2.4" />
              </g>
            </svg>
            <span className="sigil-label day-label-one">ASHEN WITCH / 017</span>
            <span className="sigil-label day-label-two">TRAVEL RECORD / ACTIVE</span>
          </div>

          <div className="hero-sigil sigil-night" aria-hidden="true">
            <span className="sigil-label night-label-one">ORIGINIUM / REACTIVE</span>
            <span className="sigil-label night-label-two">RHODES / TERMINAL 03</span>
          </div>
          <canvas
            ref={wireSphereCanvas}
            className="wire-sphere-canvas"
            aria-hidden="true"
          />
          <div className="hero-character-plane character-plane-day">
            <picture>
              <source
                media="(max-width: 560px)"
                type="image/avif"
                srcSet="/elaina-user-800.avif?v=hq1"
                sizes="158vw"
              />
              <source
                type="image/avif"
                srcSet="/elaina-user-640.avif?v=hq1 640w, /elaina-user-960.avif?v=hq1 960w, /elaina-user-1280.avif?v=hq1 1280w, /elaina-user-1600.avif?v=hq1 1600w"
                sizes="(max-width: 940px) 128vw, (max-width: 1180px) 62vw, 78vw"
              />
              <source
                media="(max-width: 560px)"
                type="image/webp"
                srcSet="/elaina-user-800.webp?v=hq1"
                sizes="158vw"
              />
              <source
                type="image/webp"
                srcSet="/elaina-user-640.webp?v=hq1 640w, /elaina-user-960.webp?v=hq1 960w, /elaina-user-1280.webp?v=hq1 1280w, /elaina-user.webp?v=hq1 1600w"
                sizes="(max-width: 940px) 128vw, (max-width: 1180px) 62vw, 78vw"
              />
              <img
                className="hero-character character-elaina"
                src="/elaina-user.webp"
                alt=""
                width={1600}
                height={1438}
                fetchPriority="high"
                decoding="async"
              />
            </picture>
          </div>
          {nightVisualReady && (
            <div className="hero-character-plane character-plane-night">
              <picture>
                <source
                  type="image/avif"
                  srcSet="/mon3tr-hero-480.avif?v=hq1 480w, /mon3tr-hero-720.avif?v=hq1 720w, /mon3tr-hero-960.avif?v=hq1 960w, /mon3tr-hero-1024.avif?v=hq1 1024w"
                  sizes="(max-width: 560px) 70vw, (max-width: 940px) 49vw, 50vw"
                />
                <source
                  type="image/webp"
                  srcSet="/mon3tr-hero-480.webp?v=hq1 480w, /mon3tr-hero-720.webp?v=hq1 720w, /mon3tr-hero.webp?v=hq1 1024w"
                  sizes="(max-width: 560px) 70vw, (max-width: 940px) 49vw, 50vw"
                />
                <img
                  className="hero-character character-mon3tr"
                  src="/mon3tr-hero.webp"
                  alt=""
                  width={1024}
                  height={1536}
                  loading="lazy"
                  decoding="async"
                />
              </picture>
            </div>
          )}
        </div>

        {latestArticle && (
          <a
            className={`latest-card ${articleTransitionSource === `latest:${articleRouteKey(latestArticle)}` ? "is-navigation-source" : ""}`}
            href={`/articles/${encodeURIComponent(articleRouteKey(latestArticle))}`}
            aria-label={copy.latestLabel(latestArticle.title)}
            onClick={(event) => handleArticleNavigation(event, articleRouteKey(latestArticle), "latest")}
          >
            <span className="latest-meta">
              <span data-lang-token>✥ {copy.latest}</span>
              <span>{latestArticle.date}</span>
            </span>
            <strong data-lang-token>{latestArticle.title}</strong>
            <span className="latest-arrow" aria-hidden="true">→</span>
          </a>
        )}
        <a
          className="scroll-cue"
          href="#articles"
          aria-label={copy.scrollLabel}
          data-transition-label="ARTICLES"
          onClick={handleSectionNavigation}
        >
          <span />
          SCROLL
        </a>
      </section>

      <section
        id="articles"
        className="content-section articles-section"
        data-section="articles"
        data-section-state={activeSection === "articles" ? "active" : undefined}
      >
        <DimensionScrollScene code="D-01 / ARCHIVE" variant="articles" />
        <div className="section-heading" data-reveal="up">
          <div>
            <span className="section-index">01 / ARTICLES</span>
            <h2 data-lang-token>{copy.articlesTitle}</h2>
          </div>
          <p data-lang-token>{copy.articlesIntro}</p>
        </div>

        <div
          className="filter-bar"
          role="group"
          aria-label={copy.filterLabel}
          data-reveal="up"
        >
          {filters.map((item) => (
            <button
              key={item}
              type="button"
              className={filter === item ? "is-active" : ""}
              aria-pressed={filter === item}
              onClick={() => setFilter(item)}
            >
              <span data-lang-token>{categoryLabels[language][item]}</span>
            </button>
          ))}
        </div>

        <div className="article-grid" aria-live="polite" data-reveal="up">
          {visibleArticles.map((article, index) => (
            <article
              className={`article-card ${articleTransitionSource === `card:${articleRouteKey(article)}` ? "is-navigation-source" : ""}`}
              key={article.id}
              data-tilt-card
            >
              <span className="card-specular" aria-hidden="true" />
              <div className="article-card-top">
                <span>{article.code}</span>
                <span>{article.date}</span>
              </div>
              <div
                className={`article-visual visual-${(index % 4) + 1}${article.coverUrl ? " has-cover" : ""}`}
                aria-hidden={article.coverUrl ? undefined : "true"}
              >
                {article.coverUrl ? (
                  <button
                    className="article-card-preview"
                    type="button"
                    aria-label={`${language === "zh" ? "预览图片" : "Preview image"}: ${article.title}`}
                    onClick={() => setPreview({ images: articlePreviewImages(article), activeIndex: 0 })}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={previewMediaUrl(article.coverUrl)} alt={article.title} loading="lazy" decoding="async" />
                    <span aria-hidden="true">VIEW ↗</span>
                  </button>
                ) : (
                  <>
                    <span className="visual-chip" />
                    <span className="visual-wave" />
                    <span className="visual-number">{String(index + 1).padStart(2, "0")}</span>
                  </>
                )}
              </div>
              <div className="article-body">
                <span className="article-category" data-lang-token>{categoryLabels[language][article.category]}</span>
                <h3 data-lang-token>{article.title}</h3>
                <p data-lang-token>{article.summary}</p>
                <div className="article-footer">
                  <div>
                    {article.tags.map((tag) => <span data-lang-token key={tag}>#{tag}</span>)}
                  </div>
                  <a
                    href={`/articles/${encodeURIComponent(articleRouteKey(article))}`}
                    onClick={(event) => handleArticleNavigation(event, articleRouteKey(article), "card")}
                  >
                    <span data-lang-token>{copy.read}</span> <span aria-hidden="true">↗</span>
                  </a>
                </div>
              </div>
            </article>
          ))}
          {!visibleArticles.length && (
            <div className="content-empty-state" role="status">
              <span>ARCHIVE / EMPTY</span>
              <p data-lang-token>{language === "zh" ? "当前分类还没有已发布的技术文章。" : "No published technical articles in this category yet."}</p>
            </div>
          )}
        </div>
      </section>

      <section
        id="lab"
        className="content-section lab-section"
        data-section="lab"
        data-section-state={activeSection === "lab" ? "active" : undefined}
      >
        <DimensionScrollScene code="D-02 / SIGNAL" variant="lab" />
        <div className="section-heading" data-reveal="up">
          <div>
            <span className="section-index">02 / LAB NOTES</span>
            <h2 data-lang-token>{copy.labTitle}</h2>
          </div>
          <p data-lang-token>{copy.labIntro}</p>
        </div>
        <div className="lab-console" data-reveal="up">
          <div className="console-header">
            <span><i /> MOZELLE_LAB</span>
            <span>STATUS / ONLINE</span>
          </div>
          <div className="lab-list">
            {labArticles.map((sourceArticle, index) => {
              const article = localizeArticle(sourceArticle, language);
              const routeKey = articleRouteKey(article);
              return (
              <article
                key={article.id}
                className={articleTransitionSource === `lab:${routeKey}` ? "is-navigation-source" : ""}
              >
                <span className="lab-index">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <h3 data-lang-token>{article.title}</h3>
                  <p data-lang-token>{article.summary}</p>
                </div>
                <strong>{article.code} / {article.readTime}</strong>
                <span className="lab-arrow" aria-hidden="true">↗</span>
                <a
                  className="lab-entry-link"
                  href={`/articles/${encodeURIComponent(routeKey)}`}
                  aria-label={`${copy.read} ${article.title}`}
                  onClick={(event) => handleArticleNavigation(event, routeKey, "lab")}
                />
              </article>
              );
            })}
            {!labArticles.length && (
              <div className="content-empty-state" role="status">
                <span>LAB / STANDBY</span>
                <p data-lang-token>{language === "zh" ? "实验记录正在整理，发布后会出现在这里。" : "Lab records will appear here after publication."}</p>
              </div>
            )}
          </div>
          <div className="console-footer">
            <span>LAST SYNC / {labArticles[0]?.date ?? "--"}</span>
            <span className="console-line" />
            <span data-lang-token>{language === "zh" ? `${labArticles.length} 项实验记录` : `${labArticles.length} LAB RECORDS`}</span>
          </div>
        </div>
      </section>

      <section
        id="collection"
        className="content-section collection-section"
        data-section="collection"
        data-section-state={activeSection === "collection" ? "active" : undefined}
      >
        <DimensionScrollScene code="D-03 / PARALLAX" variant="collection" />
        <div className="section-heading" data-reveal="up">
          <div>
            <span className="section-index">03 / DIMENSION</span>
            <h2 data-lang-token>{copy.collectionTitle}</h2>
          </div>
          <p data-lang-token>{copy.collectionIntro}</p>
        </div>
        <div className="collection-grid" data-reveal="up">
          {collectionArticles.map((sourceArticle, index) => {
            const article = localizeArticle(sourceArticle, language);
            const routeKey = articleRouteKey(article);
            const images = articlePreviewImages(article);
            const visualClass = collectionVisuals[index % collectionVisuals.length];
            return (
              <article
                className={`collection-card ${visualClass}${images.length ? " has-media" : ""}`}
                key={article.id}
                data-tilt-card
              >
                <span className="card-specular" aria-hidden="true" />
                <span className="collection-number">{String(index + 1).padStart(2, "0")}</span>
                {images.length ? (
                  <button
                    className="collection-media-button"
                    type="button"
                    aria-label={`${language === "zh" ? "预览图片" : "Preview images"}: ${article.title}`}
                    onClick={() => setPreview({ images, activeIndex: 0 })}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={previewMediaUrl(images[0].src)} alt={images[0].alt} loading="lazy" decoding="async" />
                    <span className="collection-preview-count">{images.length} / VIEW</span>
                  </button>
                ) : (
                  <div className="collection-art" aria-hidden="true">
                    <span className="collection-orbit" />
                    <span className="collection-sigil" />
                  </div>
                )}
                <div className="collection-copy">
                  <span data-lang-token>{article.code} / {article.tags[0] ?? "ARCHIVE"}</span>
                  <h3 data-lang-token>{article.title}</h3>
                  <p data-lang-token>{article.summary}</p>
                  <a
                    className="collection-entry-link"
                    href={`/collections/${encodeURIComponent(routeKey)}`}
                    aria-label={`${language === "zh" ? "查看收藏记录" : "Open collection"}: ${article.title}`}
                  >
                    <span data-lang-token>{language === "zh" ? "查看记录" : "OPEN RECORD"}</span>
                    <span aria-hidden="true">↗</span>
                  </a>
                </div>
              </article>
            );
          })}
          {!collectionArticles.length && (
            <div className="content-empty-state" role="status">
              <span>COLLECTION / EMPTY</span>
              <p data-lang-token>{language === "zh" ? "次元收藏暂未公开。" : "No collections are public yet."}</p>
            </div>
          )}
        </div>
      </section>

      <section
        id="about"
        className="content-section about-section"
        data-section="about"
        data-section-state={activeSection === "about" ? "active" : undefined}
      >
        <DimensionScrollScene code="D-04 / ORIGIN" variant="about" />
        <div className="about-code" aria-hidden="true" data-reveal="left">
          <span>ABOUT / MOZELLE</span>
          <strong>EE</strong>
          <span>STUDENT · MAKER · PLAYER</span>
        </div>
        <div className="about-copy" data-reveal="right">
          <span className="section-index">04 / ABOUT</span>
          <h2 data-lang-token>{copy.aboutTitle}</h2>
          <p data-lang-token>{language === "zh" ? siteSettings.bio : copy.bio}</p>
          <p data-lang-token>{copy.aboutBody}</p>
          <a
            href="#articles"
            className="text-link"
            data-transition-label="ARTICLES"
            onClick={handleSectionNavigation}
          >
            <span data-lang-token>{copy.continueReading}</span> <span aria-hidden="true">↗</span>
          </a>
        </div>
      </section>

      <footer className="site-footer" data-reveal="up">
        <a
          className="brand footer-brand"
          href="#top"
          data-transition-label="TOP"
          onClick={handleSectionNavigation}
        >
          <span className="brand-mark" aria-hidden="true"><span /></span>
          <span className="brand-copy"><strong>{siteSettings.siteTitle}</strong><small>{"// DIMENSION"}</small></span>
        </a>
        <p data-lang-token>{language === "zh" ? siteSettings.tagline : copy.tagline}</p>
        <div>
          <span>© 2026 MOZELLE</span>
          <a href="/admin"><span data-lang-token>{copy.admin}</span> / CONTROL ↗</a>
          <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
            <span data-lang-token>{copy.backToTop}</span> ↑
          </button>
        </div>
      </footer>

      {preview && (
        <ImageLightbox
          images={preview.images}
          activeIndex={preview.activeIndex}
          onChange={(activeIndex) => setPreview((current) => current ? { ...current, activeIndex } : current)}
          onClose={() => setPreview(null)}
          labels={language === "zh"
            ? { dialog: "图片预览", openOriginal: "打开原图 ↗", close: "关闭图片预览", previous: "上一张图片", next: "下一张图片" }
            : { dialog: "Image preview", openOriginal: "OPEN ORIGINAL ↗", close: "Close image preview", previous: "Previous image", next: "Next image" }}
        />
      )}

    </main>
  );
}
