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
import type { Article } from "./article-data";
import ArchiveBrowser, { type ArchiveCategory } from "./archive-browser";
import { useArchiveScroll } from "./use-archive-scroll";
import { dampingFactor } from "./motion-math.mjs";
import AmbientEffects from "./ambient-effects";
import { homeCopy, localizeArticle } from "./i18n";
import { LanguageReassembly, useLanguageSwitcher } from "./language-switcher";
import { LiquidGlassLens, useLiquidGlassTracking } from "./liquid-glass";
import ImageLightbox, { type LightboxImage } from "./image-lightbox";
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

export default function Home({ initialArticles, managed }: { initialArticles: Article[]; managed: boolean }) {
  const [theme, setTheme] = useState<Theme>("day");
  const [archiveCategory, setArchiveCategory] = useState<ArchiveCategory>("article");
  const archiveRestored = useRef(false);
  useEffect(() => {
    let active = true;
    const fromHash = { "#articles": "article", "#lab": "lab", "#collection": "collection" }[window.location.hash];
    let saved = fromHash;
    try { saved ||= sessionStorage.getItem("mozelle-archive-category") || "article"; } catch { saved ||= "article"; }
    queueMicrotask(() => {
      if (!active) return;
      archiveRestored.current = true;
      if (saved === "article" || saved === "lab" || saved === "collection") setArchiveCategory(saved);
    });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!archiveRestored.current) return;
    try { sessionStorage.setItem("mozelle-archive-category", archiveCategory); } catch { /* Storage is optional. */ }
  }, [archiveCategory]);
  const [articles, setArticles] = useState<Article[]>(initialArticles);
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
  useArchiveScroll(heroSection, siteHeader, setActiveSection, menuOpen || searchOpen, archiveCategory);

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


  useEffect(
    () => () => {
      if (sectionJumpTimer.current) window.clearTimeout(sectionJumpTimer.current);
    },
    [],
  );



  useEffect(() => {
    if (managed) return;
    const controller = new AbortController();

    fetch("/api/catalog", {
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
  }, [managed]);

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
    let previousParallaxTime = 0;
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

    const renderParallax = (now: number) => {
      parallaxFrame = 0;
      const elapsed = previousParallaxTime ? now - previousParallaxTime : 1000 / 60;
      previousParallaxTime = now;
      const smoothing = dampingFactor(pointerEngaged ? 9 : 4.7, elapsed);
      pointerCurrent.x += (pointerTarget.x - pointerCurrent.x) * smoothing;
      pointerCurrent.y += (pointerTarget.y - pointerCurrent.y) * smoothing;
      bearingCurrent +=
        shortestAngle(bearingCurrent, bearingTarget) *
        dampingFactor(pointerEngaged ? 12 : 6.3, elapsed);

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
      if (!parallaxFrame) previousParallaxTime = 0;
    };

    const requestParallax = () => {
      if (!parallaxFrame) {
        parallaxFrame = window.requestAnimationFrame(renderParallax);
      }
    };

    const handlePointerMove = (event: globalThis.PointerEvent) => {
      if (event.pointerType === "touch") return;
      if (boundsDirty) {
        visualRect = visual.getBoundingClientRect();
        boundsDirty = false;
      }
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

    let boundsDirty = false;
    const updateVisualRect = () => { boundsDirty = true; };
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
    if (!visual || !canvas || !particleMotionReady) return;
    let cancelled = false;
    let dispose: (() => void) | undefined;
    import("./rhodes-particles").then(({ mountRhodesParticles }) => {
      if (!cancelled) dispose = mountRhodesParticles(visual, canvas);
    }).catch(() => undefined);
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [particleMotionReady]);

  useEffect(() => {
    const visual = heroVisual.current;
    const canvas = wireSphereCanvas.current;
    if (!visual || !canvas || !sphereMotionReady) return;
    let cancelled = false;
    let dispose: (() => void) | undefined;
    import("./wire-sphere").then(({ mountWireSphere }) => {
      if (!cancelled) dispose = mountWireSphere(visual, canvas);
    }).catch(() => undefined);
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [sphereMotionReady]);

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
        ].join(" ").toLocaleLowerCase(),
      };
    });
    return articleEntries;
  }, [articles, copy, language]);

  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    if (!query) return searchEntries.slice(0, 7);
    const matches: SearchEntry[] = [];
    for (const entry of searchEntries) {
      if (entry.keywords.includes(query)) matches.push(entry);
      if (matches.length === 8) break;
    }
    return matches;
  }, [searchEntries, searchQuery]);



  const handleSectionNavigation = (event: MouseEvent<HTMLAnchorElement>) => {
    const href = event.currentTarget.getAttribute("href");
    if (!href?.startsWith("#")) return;

    const targetId = decodeURIComponent(href.slice(1)) || "top";
    if (targetId === "articles") setArchiveCategory("article");
    if (targetId === "lab") setArchiveCategory("lab");
    if (targetId === "collection") setArchiveCategory("collection");
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

      <ArchiveBrowser
        articles={articles}
        language={language}
        category={archiveCategory}
        onCategory={setArchiveCategory}
        onPreview={(article) => setPreview({ images: articlePreviewImages(article), activeIndex: 0 })}
      />

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
