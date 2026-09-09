"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { Article } from "./article-data";
import { categoryLabels, localizeArticle, type Language } from "./i18n";
import { previewMediaUrl } from "./media-utils";

export type ArchiveCategory = "article" | "lab" | "collection";
const categories: ArchiveCategory[] = ["article", "lab", "collection"];
const categorySection = { article: "articles", lab: "lab", collection: "collection" };
const labels = {
  zh: { article: "技术文章", lab: "实验与超频", collection: "次元收藏" },
  en: { article: "Articles", lab: "Lab notes", collection: "Collections" },
};

export default function ArchiveBrowser({ articles, language, category, onCategory, onPreview }: {
  articles: Article[];
  language: Language;
  category: ArchiveCategory;
  onCategory: (category: ArchiveCategory) => void;
  onPreview: (entry: Article) => void;
}) {
  const [selected, setSelected] = useState<Partial<Record<ArchiveCategory, string>>>({});
  const [topic, setTopic] = useState("");
  const list = useRef<HTMLDivElement>(null);
  const detail = useRef<HTMLDivElement>(null);
  const motion = useRef<Animation | null>(null);
  const restored = useRef(false);
  const catalog = useMemo(() => {
    const result: Record<ArchiveCategory, Article[]> = { article: [], lab: [], collection: [] };
    for (const source of articles) result[source.contentType || "article"].push(localizeArticle(source, language));
    return result;
  }, [articles, language]);
  const topics = useMemo(() => Array.from(new Set(catalog.article.map((record) => record.category))), [catalog]);
  const entries = useMemo(() => category === "article" && topic
    ? catalog.article.filter((record) => record.category === topic)
    : catalog[category], [catalog, category, topic]);
  const selectedIndex = Math.max(0, entries.findIndex((entry) => entry.id === selected[category]));
  const entry = entries[selectedIndex];
  const href = entry ? `/${category === "collection" ? "collections" : "articles"}/${encodeURIComponent(entry.slug || entry.id)}` : "";
  const cover = entry?.coverUrl || entry?.gallery?.[0]?.src;
  const text = labels[language];

  useEffect(() => {
    let active = true;
    let saved: Partial<Record<ArchiveCategory, string>> = {};
    try {
      const data = JSON.parse(sessionStorage.getItem("mozelle-archive-selection") || "{}");
      for (const type of categories) if (typeof data?.[type] === "string") saved[type] = data[type];
    } catch { saved = {}; }
    queueMicrotask(() => {
      if (!active) return;
      restored.current = true;
      setSelected(saved);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!restored.current) return;
    try { sessionStorage.setItem("mozelle-archive-selection", JSON.stringify(selected)); } catch { /* Storage is optional. */ }
  }, [selected]);

  useEffect(() => {
    const node = detail.current;
    if (!node || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const interrupted = motion.current?.playState === "running";
    const current = interrupted ? getComputedStyle(node) : null;
    const from = { opacity: current ? Number(current.opacity) : .72, transform: current?.transform || "translate3d(10px,0,0)" };
    motion.current?.cancel();
    motion.current = node.animate(
      [from, { opacity: 1, transform: "translate3d(0,0,0)" }],
      { duration: 260, easing: "cubic-bezier(.2,.75,.25,1)" },
    );
  }, [entry?.id, category]);
  useEffect(() => () => motion.current?.cancel(), []);

  const choose = (index: number, focus = false) => {
    const target = entries[index];
    if (!target) return;
    setSelected((current) => ({ ...current, [category]: target.id }));
    if (focus) requestAnimationFrame(() => {
      const button = list.current?.querySelectorAll<HTMLElement>("[role=option]")[index];
      button?.focus({ preventScroll: true });
      button?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    });
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (!entries.length) return;
    let index = selectedIndex;
    if (event.key === "ArrowDown") index = (index + 1) % entries.length;
    else if (event.key === "ArrowUp") index = (index - 1 + entries.length) % entries.length;
    else if (event.key === "Home") index = 0;
    else if (event.key === "End") index = entries.length - 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      onCategory(categories[(categories.indexOf(category) + (event.key === "ArrowRight" ? 1 : 2)) % 3]);
      requestAnimationFrame(() => list.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus({ preventScroll: true }));
      return;
    } else if (event.key === "Enter" && href) {
      event.preventDefault(); window.location.assign(href); return;
    } else return;
    event.preventDefault();
    choose(index, true);
  };

  return (
    <section id="articles" className="archive-workspace" data-section={categorySection[category]} aria-label={language === "zh" ? "档案浏览" : "Browse the archive"}>
      <span id="lab" className="archive-anchor" />
      <span id="collection" className="archive-anchor" />
      <header className="archive-workspace-heading">
        <div><span>MOZELLE / ARCHIVE INDEX</span><h2 data-lang-token>{language === "zh" ? "档案索引" : "Archive index"}</h2></div>
        <p data-lang-token>{language === "zh" ? "选择一份记录，慢慢读。" : "Choose a record. Take your time."}</p>
      </header>
      <div className="archive-browser-grid">
        <nav className="archive-categories" aria-label={language === "zh" ? "档案类别" : "Archive categories"}>
          {categories.map((type, index) => (
            <button key={type} type="button" aria-pressed={category === type} onClick={() => onCategory(type)}>
              <small>0{index + 1}</small><span data-lang-token>{text[type]}</span><b>{String(catalog[type].length).padStart(2, "0")}</b>
            </button>
          ))}
          <div className="archive-key-guide" aria-hidden="true"><span>↑ ↓</span>{language === "zh" ? "切换档案" : "Select record"}<span>← →</span>{language === "zh" ? "切换分类" : "Change category"}<span>ENTER ↗</span>{language === "zh" ? "进入阅读" : "Open record"}</div>
        </nav>
        <div className="archive-list-panel">
          <div className="archive-list-heading">
            {category === "article" ? <select aria-label={language === "zh" ? "筛选文章主题" : "Filter article topic"} value={topic} onChange={(event) => setTopic(event.target.value)}>
              <option value="">{language === "zh" ? "全部主题" : "All topics"}</option>
              {topics.map((value) => <option key={value} value={value}>{categoryLabels[language][value] || value}</option>)}
            </select> : <span data-lang-token>{text[category]}</span>}
            <span>{String(entries.length).padStart(2, "0")} FILES</span>
          </div>
          <div ref={list} className="archive-record-list" role="listbox" aria-label={text[category]} onKeyDown={onKeyDown}>
            {entries.map((record, index) => (
              <button key={record.id} role="option" type="button" aria-selected={index === selectedIndex} tabIndex={index === selectedIndex ? 0 : -1} onClick={() => choose(index)}>
                <span className="archive-list-number">{String(index + 1).padStart(2, "0")}</span>
                <span className="archive-list-copy"><small>{record.code} <time>{record.date}</time></small><strong data-lang-token>{record.title}</strong><span data-lang-token>{record.summary}</span></span>
                <span className="archive-select-mark" aria-hidden="true">↗</span>
              </button>
            ))}
          </div>
          {!entry && <p className="archive-empty">{language === "zh" ? "这一类还没有公开的记录。" : "No public records in this category yet."}</p>}
        </div>
        <div className="archive-preview-shell">
          {entry && <div ref={detail} className="archive-preview" aria-live="polite" aria-atomic="true">
            <div className="archive-preview-heading"><span>{entry.code}</span><span>{String(selectedIndex + 1).padStart(2, "0")} / {String(entries.length).padStart(2, "0")}</span></div>
            <button type="button" className={`archive-preview-media${cover ? " has-image" : ""}`} disabled={!cover} onClick={() => onPreview(entry)} aria-label={language === "zh" ? "预览档案图片" : "Preview record images"}>
              {cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewMediaUrl(cover)} alt="" decoding="async" />
              ) : <div className="archive-preview-plate"><span>{text[category]}</span><strong>{entry.code.split("/")[0].trim()}</strong><span>RESEARCH / FIELD NOTES</span></div>}
            </button>
            <div className="archive-preview-copy"><p className="archive-preview-category">{categoryLabels[language][entry.category] || entry.category}{entry.readTime && <span> / {entry.readTime}</span>}</p><h3 data-lang-token>{entry.title}</h3><p data-lang-token>{entry.summary}</p><div className="archive-preview-tags">{entry.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div></div>
            <a className="archive-open-record" href={href}><span>{language === "zh" ? (category === "collection" ? "查看这份收藏" : "阅读全文") : (category === "collection" ? "View collection" : "Read full record")}</span><span>ACCESS FILE ↗</span></a>
          </div>}
        </div>
      </div>
    </section>
  );
}
