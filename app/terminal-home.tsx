"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Article } from "./article-data";
import { categoryLabels, localizeArticle } from "./i18n";
import { LanguageReassembly, useLanguageSwitcher } from "./language-switcher";
import { ThemeTransition, useThemeTransition, type Theme } from "./theme-transition";
import ImageLightbox, { type LightboxImage } from "./image-lightbox";
import { previewMediaUrl } from "./media-utils";
import { nearestOccurrence, wrap } from "./terminal-motion.mjs";
import type { TerminalScene, TerminalSceneState } from "./terminal-scene";

const laneLabels = {
  zh: ["全部档案", "电子技术", "硬件与调试", "实验笔记", "次元收藏"],
  en: ["All records", "Electronics", "Hardware", "Lab notes", "Collections"],
};
const hashes = ["#articles", "#electronics", "#hardware", "#lab", "#collection"];
type Selection = { lane: number; row: number };

export default function TerminalHome({ initialArticles, managed }: { initialArticles: Article[]; managed: boolean }) {
  const [articles, setArticles] = useState(initialArticles);
  const [selection, setSelection] = useState<Selection>({ lane: 0, row: 0 });
  const [detail, setDetail] = useState(false);
  const [panel, setPanel] = useState<"index" | "about" | null>(null);
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState<"loading" | "ready" | "fallback">("loading");
  const [theme, setTheme] = useState<Theme>("day");
  const [reduced, setReduced] = useState(false);
  const [preview, setPreview] = useState<{ images: LightboxImage[]; activeIndex: number } | null>(null);
  const { language, switching: languageSwitching, targetLanguage, toggleLanguage } = useLanguageSwitcher();
  const { transitioning, transitionTarget, toggleTheme } = useThemeTransition(theme, setTheme);
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<TerminalScene | null>(null);
  const laneMemory = useRef<Record<number, number>>({});
  const restored = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLElement>(null);
  const previousDetail = useRef(false);
  const copy = laneLabels[language];
  const localized = useMemo(() => articles.map((article) => localizeArticle(article, language)), [articles, language]);
  const groups = useMemo(() => [
    localized,
    localized.filter((article) => article.contentType === "article" && article.category === "电子"),
    localized.filter((article) => article.contentType === "article" && article.category !== "电子"),
    localized.filter((article) => article.contentType === "lab"),
    localized.filter((article) => article.contentType === "collection"),
  ], [localized]);
  const lane = wrap(selection.lane, groups.length);
  const entries = groups[lane];
  const index = wrap(selection.row, entries.length);
  const record = entries[index];
  const href = record ? `/${record.contentType === "collection" ? "collections" : "articles"}/${encodeURIComponent(record.slug || record.id)}` : "";
  const searchIndex = useMemo(() => localized.map((article, index) => ({ article, index, haystack: [article.title, article.summary, article.code, ...article.tags].join(" ").toLocaleLowerCase() })), [localized]);
  const results = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return term ? searchIndex.filter((item) => item.haystack.includes(term)) : searchIndex;
  }, [searchIndex, query]);

  useEffect(() => {
    if (managed) return;
    const controller = new AbortController();
    fetch("/api/catalog", { signal: controller.signal }).then((r) => r.ok ? r.json() : null).then((data) => {
      if (data?.posts) setArticles(data.posts);
    }).catch(() => undefined);
    return () => controller.abort();
  }, [managed]);

  useEffect(() => {
    let active = true;
    let saved: Selection = { lane: Math.max(0, hashes.indexOf(location.hash)), row: 0 };
    let savedTheme: Theme = "day";
    try {
      const data = JSON.parse(sessionStorage.getItem("mozelle-terminal-selection") || "null");
      if (data && Number.isFinite(data.lane) && Number.isFinite(data.row) && Math.abs(data.lane) < 10000 && Math.abs(data.row) < 10000) saved = data;
      const requested = hashes.indexOf(location.hash);
      if (requested >= 0 && wrap(saved.lane, 5) !== requested) saved = { lane: requested, row: 0 };
      savedTheme = localStorage.getItem("mozelle-theme") === "night" ? "night" : "day";
    } catch { /* Browsing works with storage disabled. */ }
    queueMicrotask(() => { if (active) { restored.current = true; setSelection(saved); setTheme(savedTheme); } });
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(media.matches);
    queueMicrotask(sync); media.addEventListener("change", sync);
    return () => { active = false; media.removeEventListener("change", sync); };
  }, []);

  useEffect(() => {
    if (!restored.current) return;
    document.documentElement.dataset.theme = theme;
    try { sessionStorage.setItem("mozelle-terminal-selection", JSON.stringify(selection)); } catch { /* Optional preference. */ }
    history.replaceState(history.state, "", hashes[wrap(selection.lane, 5)]);
  }, [selection, theme]);

  const select = useCallback((nextLane: number, nextRow: number) => {
    setSelection({ lane: nextLane, row: nextRow });
    setDetail(false);
  }, []);
  const open = useCallback(() => setDetail(true), []);
  const state: TerminalSceneState = useMemo(() => ({ ...selection, detail, night: theme === "night", title: record?.title || "ARCHIVE", code: record?.code || "NO RECORD", reduced }), [selection, detail, theme, record?.title, record?.code, reduced]);
  const sceneState = useRef(state);
  useEffect(() => { sceneState.current = state; scene.current?.update(state); }, [state]);
  useEffect(() => {
    let cancelled = false;
    import("./terminal-scene").then(({ mountTerminalScene }) => {
      if (cancelled || !host.current) return;
      scene.current = mountTerminalScene(host.current, sceneState.current, select, open);
      setPhase("ready");
    }).catch(() => { if (!cancelled) setPhase("fallback"); });
    return () => { cancelled = true; scene.current?.dispose(); scene.current = null; };
  }, [select, open]);

  const moveRow = useCallback((direction: number) => {
    if (detail || !entries.length) return;
    setSelection((current) => ({ ...current, row: current.row + direction }));
  }, [detail, entries.length]);
  const moveLane = useCallback((direction: number) => {
    if (detail) return;
    laneMemory.current[lane] = index;
    const nextLane = selection.lane + direction;
    const nextType = wrap(nextLane, groups.length);
    const nextRow = nearestOccurrence(laneMemory.current[nextType] || 0, selection.row, groups[nextType].length);
    setSelection({ lane: nextLane, row: nextRow });
  }, [detail, lane, index, selection, groups]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.key === "Escape") { if (preview) return; if (panel) setPanel(null); else setDetail(false); return; }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setPanel("index"); return; }
      if (target?.matches("input,textarea,select,[contenteditable=true]") || panel || preview) return;
      if (event.key === "/") { event.preventDefault(); setPanel("index"); }
      else if (detail) return;
      else if (event.key === "ArrowDown") { event.preventDefault(); moveRow(1); }
      else if (event.key === "ArrowUp") { event.preventDefault(); moveRow(-1); }
      else if (event.key === "ArrowRight") { event.preventDefault(); moveLane(1); }
      else if (event.key === "ArrowLeft") { event.preventDefault(); moveLane(-1); }
      else if (event.key === "Enter" && record && !target?.closest("button,a")) { event.preventDefault(); setDetail(true); }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [panel, preview, detail, moveLane, moveRow, record]);

  useEffect(() => {
    if (!panel) return;
    const prior = document.activeElement as HTMLElement | null;
    const node = panelRef.current;
    const focusable = () => Array.from(node?.querySelectorAll<HTMLElement>('button,a[href],input,[tabindex="0"]') || []);
    const input = node?.querySelector<HTMLInputElement>("input");
    if (input) input.focus(); else focusable()[0]?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = focusable(); const first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener("keydown", trap);
    return () => { window.removeEventListener("keydown", trap); prior?.focus({ preventScroll: true }); };
  }, [panel]);

  useEffect(() => {
    if (detail && detailRef.current) detailRef.current.scrollTop = 0;
  }, [detail, record?.id]);

  useEffect(() => {
    if (detail && !previousDetail.current) {
      const timer = setTimeout(() => detailRef.current?.focus({ preventScroll: true }), reduced ? 0 : 650);
      previousDetail.current = detail;
      return () => clearTimeout(timer);
    }
    previousDetail.current = detail;
  }, [detail, reduced]);

  const previewImages = () => {
    if (!record) return;
    const images: LightboxImage[] = [];
    if (record.coverUrl) images.push({ src: record.coverUrl, alt: record.title, caption: record.summary });
    for (const item of record.gallery || []) if (!images.some((image) => image.src === item.src)) images.push(item);
    if (images.length) setPreview({ images, activeIndex: 0 });
  };
  const cover = record?.coverUrl || record?.gallery?.[0]?.src;

  return (
    <main className={`site-shell terminal-home theme-${theme}${transitioning ? " is-switching" : ""}`} data-language={language} data-detail={detail} data-phase={phase}>
      <LanguageReassembly active={languageSwitching} target={targetLanguage} />
      <ThemeTransition active={transitioning} target={transitionTarget} />
      <div ref={host} className="terminal-scene" />
      <div className="terminal-atmosphere" aria-hidden="true" />
      <header className="terminal-brand"><a href="#articles" onClick={(event) => { event.preventDefault(); setDetail(false); }} aria-label="Mozelle Archive"><h1>MOZELLE</h1><span>PERSONAL ARCHIVE</span><p>ANALYSIS <b>OS</b></p></a></header>
      <nav className="terminal-tools" aria-label={language === "zh" ? "终端工具" : "Archive tools"}>
        <button type="button" onClick={() => setPanel("index")}><span aria-hidden="true">⌕</span><span data-lang-token>{language === "zh" ? "档案索引" : "ARCHIVE INDEX"}</span><kbd>/</kbd></button>
        <button type="button" onClick={toggleLanguage} aria-label={language === "zh" ? "切换到英文" : "Switch to Chinese"}>{language === "zh" ? "EN" : "中"}</button>
        <button type="button" onClick={toggleTheme} aria-label={language === "zh" ? "切换昼夜主题" : "Switch theme"}>{theme === "day" ? "◐" : "◑"}</button>
        <button type="button" onClick={() => setPanel("about")} data-lang-token>{language === "zh" ? "关于" : "ABOUT"}</button>
      </nav>

      {(phase === "fallback" || phase === "loading") && <div className="terminal-scene-fallback" aria-label={language === "zh" ? "档案列表" : "Records"}>
        {phase === "loading" && <span className="terminal-loading">{language === "zh" ? "正在展开档案阵列" : "Preparing the archive"}</span>}
        {entries.slice(0, 8).map((item, itemIndex) => <button type="button" key={item.id} onClick={() => { select(selection.lane, itemIndex); setDetail(true); }}><small>{item.code}</small><strong>{item.title}</strong><span>↗</span></button>)}
      </div>}

      <section className="terminal-focus" aria-live="polite" aria-atomic="true" inert={detail || !!panel}>
        <p className="terminal-eyebrow"><span>PUBLIC ARCHIVE</span><i>/</i><span data-lang-token>{copy[lane]}</span></p>
        <h2 key={`${lane}-${index}`}><span>FILE NUMBER:</span> <strong>{record?.code || "—"}</strong></h2>
        <div className="terminal-focus-rule"><i /></div>
        <p className="terminal-focus-title" data-lang-token>{record?.title || (language === "zh" ? "此分类暂时没有公开记录" : "No public records in this category")}</p>
        <button type="button" className="terminal-access" onClick={() => setDetail(true)} disabled={!record}><span>ACCESS FILE</span><span data-lang-token>{language === "zh" ? "读取档案" : "Open record"}</span><b>→</b></button>
      </section>

      <section ref={detailRef} className="terminal-detail" aria-label={language === "zh" ? "档案概览" : "Record overview"} tabIndex={-1} inert={!detail || !!panel}>
        <button type="button" className="terminal-back" onClick={() => setDetail(false)}>← <span data-lang-token>{language === "zh" ? "返回档案阵列" : "ARCHIVE OVERVIEW"}</span><kbd>ESC</kbd></button>
        {record && <>
          <div className="terminal-detail-code"><span>{record.code}</span><span>REFERENCE AREA</span></div>
          <h2 data-lang-token>{record.title}</h2>
          <div className="terminal-detail-meta"><div><small>DEPARTMENT / 分类</small><span>{categoryLabels[language][record.category] || record.category}</span></div><div><small>RECORD / 日期</small><span>{record.date}</span></div><div><small>COLLECTION / 编目</small><span>{copy[lane]}</span></div><div><small>STATUS / 状态</small><span data-lang-token>{language === "zh" ? "已归档 · 可读取" : "Archived · Available"}</span></div></div>
          <p className="terminal-detail-tab" data-lang-token>{language === "zh" ? "01  档案概述" : "01  Overview"}</p>
          <p className="terminal-detail-summary" data-lang-token>{record.summary}</p>
          {cover && <button className="terminal-detail-image" type="button" onClick={previewImages} aria-label={language === "zh" ? "预览图片" : "Preview images"}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewMediaUrl(cover)} alt={record.title} decoding="async" loading="lazy" /><span>{language === "zh" ? "查看图集 ↗" : "VIEW GALLERY ↗"}</span>
          </button>}
          <div className="terminal-detail-tags">{record.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>
          <a className="terminal-read" href={href}><span data-lang-token>{language === "zh" ? (record.contentType === "collection" ? "打开收藏记录" : "阅读全文") : "READ FULL RECORD"}</span><b>↗</b></a>
        </>}
      </section>

      <div className="terminal-navigation" inert={detail || !!panel}>
        <div className="terminal-counter"><small>ARCHIVE / SELECT</small><div><strong key={`${lane}-${index}`}>{String(index + (entries.length ? 1 : 0)).padStart(2, "0")}</strong><span>/</span><b>{String(entries.length).padStart(2, "0")}</b></div></div>
        <div className="terminal-record-control"><button type="button" onClick={() => moveRow(-1)} aria-label={language === "zh" ? "上一份档案" : "Previous record"}>↑</button><div className="terminal-ticks" role="group" aria-label={language === "zh" ? "档案选择" : "Record selection"}>{entries.map((item, i) => <button key={item.id} type="button" aria-label={item.title} aria-pressed={i === index} onClick={() => select(selection.lane, nearestOccurrence(i, selection.row, entries.length))}><span /></button>)}</div><button type="button" onClick={() => moveRow(1)} aria-label={language === "zh" ? "下一份档案" : "Next record"}>↓</button></div>
        <div className="terminal-lane-control"><button type="button" onClick={() => moveLane(-1)} aria-label={language === "zh" ? "上一分类" : "Previous category"}>←</button><div><small>COLUMN {String(lane + 1).padStart(2, "0")} / 05</small><strong data-lang-token>{copy[lane]}</strong></div><button type="button" onClick={() => moveLane(1)} aria-label={language === "zh" ? "下一分类" : "Next category"}>→</button></div>
      </div>
      <footer className="terminal-footer"><span><i />{phase === "loading" ? "INITIALIZING" : "PUBLIC ARCHIVE / READY"}</span><span className="terminal-key-hint" data-lang-token>{language === "zh" ? "↑ ↓ 翻阅档案　 /　 ← → 切换分类　 /　 ENTER 读取" : "↑ ↓ RECORD　 /　 ← → CATEGORY　 /　 ENTER ACCESS"}</span><a href="/admin">MOZELLE <b>ARCHIVE</b> <i /></a></footer>

      {panel && <div className="terminal-overlay" onClick={(event) => { if (event.target === event.currentTarget) setPanel(null); }}>
        <div ref={panelRef} className="terminal-panel" role="dialog" aria-modal="true" aria-label={panel === "index" ? (language === "zh" ? "档案索引" : "Archive index") : (language === "zh" ? "关于 Mozelle" : "About Mozelle")}>
          <div className="terminal-panel-heading"><h2>{panel === "index" ? "ARCHIVE INDEX" : "ABOUT / MOZELLE"}</h2><button type="button" onClick={() => setPanel(null)} aria-label={language === "zh" ? "关闭" : "Close"}>×</button></div>
          {panel === "index" ? <>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={language === "zh" ? "搜索标题、编号或关键词" : "Search title, code or keyword"} aria-label={language === "zh" ? "搜索档案" : "Search records"} />
            <div className="terminal-index-list">{results.map(({ article, index: allIndex }) => <button key={article.id} type="button" onClick={() => { select(nearestOccurrence(0, selection.lane, 5), nearestOccurrence(allIndex, selection.row, groups[0].length)); setPanel(null); setDetail(true); }}><small>{article.code}</small><strong>{article.title}</strong><span>↗</span></button>)}{!results.length && <p>{language === "zh" ? "没有找到匹配的记录。" : "No matching records."}</p>}</div>
          </> : <div className="terminal-about"><p>{language === "zh" ? "电子专业学生，记录硬件、超频、游戏、Cosplay 与二次元世界。" : "An electronics student documenting hardware, overclocking, games, cosplay and ACG culture."}</p><p>{language === "zh" ? "把所见、所想与所爱，收进一页页未完的档案。" : "A growing archive of things seen, ideas explored, and interests kept close."}</p><a href="/admin">{language === "zh" ? "管理后台" : "Admin"} ↗</a></div>}
        </div>
      </div>}
      <ImageLightbox images={preview?.images || []} activeIndex={preview?.activeIndex ?? null} onClose={() => setPreview(null)} onChange={(activeIndex) => setPreview((current) => current ? { ...current, activeIndex } : null)} labels={language === "zh" ? undefined : { dialog: "Image preview", openOriginal: "OPEN ORIGINAL ↗", close: "Close image preview", previous: "Previous image", next: "Next image" }} />
    </main>
  );
}
