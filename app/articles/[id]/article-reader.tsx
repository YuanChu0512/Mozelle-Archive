"use client";

/* eslint-disable @next/next/no-html-link-for-pages */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  fallbackArticles,
  type Article,
} from "../../article-data";
import AmbientEffects from "../../ambient-effects";
import ImageLightbox, { type LightboxImage } from "../../image-lightbox";
import { previewMediaUrl } from "../../media-utils";
import { articleCopy, categoryLabels, localizeArticle } from "../../i18n";
import { LanguageReassembly, useLanguageSwitcher } from "../../language-switcher";
import { LiquidGlassFilters, LiquidGlassLens, useLiquidGlassTracking } from "../../liquid-glass";
import {
  ThemeTransition,
  useThemeTransition,
  type Theme,
} from "../../theme-transition";

type CompatibleArticle = Omit<Article, "contentType" | "gallery"> & {
  contentType?: Article["contentType"];
  gallery?: Article["gallery"];
};

type PreviewState = {
  images: LightboxImage[];
  activeIndex: number;
};

function matchesArticleRoute(article: Pick<CompatibleArticle, "id" | "slug">, articleId: string) {
  return article.id === articleId || article.slug === articleId;
}

function normalizeArticle(article: CompatibleArticle): Article {
  return {
    ...article,
    contentType: article.contentType ?? "article",
    gallery: Array.isArray(article.gallery) ? article.gallery : undefined,
  };
}

export default function ArticleReader({ articleId }: { articleId: string }) {
  const fallbackArticle = fallbackArticles.find((item) => matchesArticleRoute(item, articleId)) ?? null;
  const [article, setArticle] = useState<Article | null>(fallbackArticle);
  const [status, setStatus] = useState<"loading" | "ready" | "missing">("loading");
  const [theme, setTheme] = useState<Theme>("day");
  const { transitioning, transitionTarget, toggleTheme } = useThemeTransition(
    theme,
    setTheme,
  );
  const {
    language,
    switching: languageSwitching,
    targetLanguage,
    toggleLanguage,
  } = useLanguageSwitcher();
  const richContentRef = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const copy = articleCopy[language];
  useLiquidGlassTracking();
  const displayedArticle = useMemo(
    () => article ? localizeArticle(article, language) : null,
    [article, language],
  );
  const returnHref = displayedArticle?.contentType === "lab"
    ? "/#lab"
    : displayedArticle?.contentType === "collection"
      ? "/#collection"
      : "/#articles";
  const returnLabel = displayedArticle?.contentType === "lab"
    ? language === "zh" ? "返回实验与超频笔记" : "Explore More Lab Notes"
    : displayedArticle?.contentType === "collection"
      ? language === "zh" ? "返回次元收藏" : "Explore More Collections"
      : copy.other;
  const archiveType = displayedArticle?.contentType === "lab"
    ? "LAB"
    : displayedArticle?.contentType === "collection"
      ? "COLLECTION"
      : "ARTICLE";

  const openPreview = (images: LightboxImage[], activeIndex = 0) => {
    if (!images[activeIndex]) return;
    setPreview({ images, activeIndex });
  };

  const openRichContentImage = (target: EventTarget | null) => {
    const root = richContentRef.current;
    if (!root || !(target instanceof Element)) return false;
    const selected = target.closest("img");
    if (!(selected instanceof HTMLImageElement) || !root.contains(selected)) return false;

    const nodes = Array.from(root.querySelectorAll("img")).filter(
      (image): image is HTMLImageElement => Boolean(image.currentSrc || image.src),
    );
    const activeIndex = nodes.indexOf(selected);
    if (activeIndex < 0) return false;

    const images = nodes.map((image) => {
      const caption = image.closest("figure")?.querySelector("figcaption")?.textContent?.trim();
      return {
        src: image.currentSrc || image.src,
        alt: image.alt || displayedArticle?.title || "Article image",
        caption: caption || undefined,
      } satisfies LightboxImage;
    });
    openPreview(images, activeIndex);
    return true;
  };

  const handleRichContentClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!openRichContentImage(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
  };

  const handleRichContentKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (!openRichContentImage(event.target)) return;
    event.preventDefault();
  };

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("mozelle-theme");
    if (savedTheme !== "day" && savedTheme !== "night") return;
    document.documentElement.dataset.theme = savedTheme;
    let active = true;
    queueMicrotask(() => {
      if (active) setTheme(savedTheme);
    });
    return () => {
      active = false;
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
        return response.json() as Promise<{ posts?: CompatibleArticle[] }>;
      })
      .then((payload) => {
        const matched = payload.posts?.find((item) => matchesArticleRoute(item, articleId)) ?? null;
        if (matched) {
          setArticle(normalizeArticle(matched));
          setStatus("ready");
          return;
        }
        setArticle(null);
        setStatus("missing");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStatus(fallbackArticle ? "ready" : "missing");
      });
    return () => controller.abort();
  }, [articleId, fallbackArticle]);

  useEffect(() => {
    if (status !== "ready" || displayedArticle?.contentType !== "collection") return;
    window.location.replace("/#collection");
  }, [displayedArticle?.contentType, status]);

  useEffect(() => {
    const root = richContentRef.current;
    if (!root) return;
    root.querySelectorAll("img").forEach((image) => {
      image.setAttribute("role", "button");
      image.setAttribute("tabindex", "0");
    });
  }, [displayedArticle?.contentHtml, language]);

  return (
    <main
      className={`site-shell article-page-shell theme-${theme} ${transitioning ? "is-switching" : ""} ${languageSwitching ? "is-language-switching" : ""}`}
      data-language={language}
    >
      <LiquidGlassFilters />
      <AmbientEffects />
      <LanguageReassembly active={languageSwitching} target={targetLanguage} />
      <ThemeTransition active={transitioning} target={transitionTarget} />
      <span className="article-reading-progress" aria-hidden="true" />
      <header
        className="article-site-header liquid-glass liquid-glass--regular"
        data-liquid-glass
      >
        <LiquidGlassLens />
        <a className="brand" href="/" aria-label={copy.homeLabel}>
          <span className="brand-mark" aria-hidden="true"><span /></span>
          <span className="brand-copy">
            <strong>Mozelle Archive</strong>
            <small>{`// ${archiveType}`}</small>
          </span>
        </a>
        <span className="article-header-code">
          {displayedArticle?.code ?? "ARTICLE / LOADING"}
        </span>
        <div className="article-header-actions">
          <a href={returnHref} aria-label={copy.back}>
            <span className="article-back-full" data-lang-token>{copy.back}</span>
            <span className="article-back-short" data-lang-token>{copy.backShort}</span>
          </a>
          <button
            className="article-language-toggle"
            type="button"
            onClick={toggleLanguage}
            disabled={languageSwitching}
            aria-label={copy.languageLabel}
          >
            {language === "zh" ? "EN" : "中"}
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            disabled={transitioning || languageSwitching}
            aria-label={copy.themeLabel}
          >
            {theme === "day" ? "DAY" : "NIGHT"}
          </button>
        </div>
      </header>

      {status === "loading" && (
        <section className="article-state" aria-live="polite">
          <span>ARTICLE / SYNCING</span>
          <h1 data-lang-token>{copy.loading}</h1>
          <div className="article-state-line" />
        </section>
      )}

      {status === "missing" && (
        <section className="article-state">
          <span>ARTICLE / 404</span>
          <h1 data-lang-token>{copy.missing}</h1>
          <p data-lang-token>{copy.missingBody}</p>
          <a href="/#articles"><span data-lang-token>{copy.back}</span> →</a>
        </section>
      )}

      {status === "ready" && displayedArticle?.contentType === "collection" && (
        <section className="article-state" aria-live="polite">
          <span>COLLECTION / REDIRECT</span>
          <h1 data-lang-token>{language === "zh" ? "正在返回次元收藏" : "Opening the collection"}</h1>
          <div className="article-state-line" />
        </section>
      )}

      {status === "ready" && displayedArticle && displayedArticle.contentType !== "collection" && (
        <article className="article-reader">
          <header className="article-reader-hero">
            <div className="article-reader-meta">
              <span>{displayedArticle.code}</span>
              <span data-lang-token>{categoryLabels[language][displayedArticle.category]}</span>
              <span>{displayedArticle.date}</span>
              <span>{displayedArticle.readTime}</span>
            </div>
            <h1 data-lang-token>{displayedArticle.title}</h1>
            <p data-lang-token>{displayedArticle.summary}</p>
            <div className="article-reader-signal" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          </header>

          {displayedArticle.coverUrl ? (
            <figure className="article-reader-cover">
              <button
                className="image-preview-button"
                type="button"
                onClick={() => openPreview([
                  {
                    src: displayedArticle.coverUrl as string,
                    alt: displayedArticle.title,
                  },
                ])}
                aria-label={`${displayedArticle.title} — ${copy.evidence}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewMediaUrl(displayedArticle.coverUrl)} alt={displayedArticle.title} decoding="async" />
              </button>
            </figure>
          ) : (
            <div className="article-reader-visual" aria-hidden="true">
              <span className="article-reader-orbit" />
              <span className="article-reader-core">{displayedArticle.code.split("/")[0].trim()}</span>
              <span className="article-reader-coordinate">MOZELLE / ARCHIVE / {displayedArticle.date}</span>
            </div>
          )}

          {displayedArticle.contentHtml ? (
            <div
              ref={richContentRef}
              className="article-reader-content article-rich-content"
              onClick={handleRichContentClick}
              onKeyDown={handleRichContentKeyDown}
              dangerouslySetInnerHTML={{ __html: displayedArticle.contentHtml }}
            />
          ) : (
            <div className="article-reader-content">
              {displayedArticle.content.map((block, index) =>
                block.startsWith("## ") ? (
                  <h2 data-lang-token key={`${index}-${block}`}>
                    {block.slice(3)}
                  </h2>
                ) : block.startsWith("> ") ? (
                  <blockquote data-lang-token key={`${index}-${block}`}>
                    {block.slice(2)}
                  </blockquote>
                ) : (
                  <p data-lang-token key={`${index}-${block}`}>{block}</p>
                ),
              )}
            </div>
          )}

          {displayedArticle.gallery?.length ? (
            <section className="article-evidence" aria-labelledby="article-evidence-title">
              <div className="article-section-label">
                <span>ARCHIVE / VISUAL</span>
                <h2 id="article-evidence-title" data-lang-token>{copy.evidence}</h2>
              </div>
              <div className="article-evidence-grid">
                {displayedArticle.gallery.map((item, index, gallery) => (
                  <figure key={item.src}>
                    <button
                      className="image-preview-button"
                      type="button"
                      onClick={() => openPreview(
                        gallery.map((image) => ({
                          src: image.src,
                          alt: image.alt,
                          caption: image.caption,
                        })),
                        index,
                      )}
                      aria-label={`${item.alt} — ${copy.evidence}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={previewMediaUrl(item.src)} alt={item.alt} loading="lazy" decoding="async" />
                    </button>
                    <figcaption data-lang-token>{item.caption}</figcaption>
                  </figure>
                ))}
              </div>
            </section>
          ) : null}

          {displayedArticle.sources?.length ? (
            <section className="article-sources" aria-labelledby="article-sources-title">
              <div className="article-section-label">
                <span>REFERENCE / PUBLIC</span>
                <h2 id="article-sources-title" data-lang-token>{copy.sources}</h2>
              </div>
              <ol>
                {displayedArticle.sources.map((source) => (
                  <li key={source.href}>
                    <a href={source.href} target="_blank" rel="noreferrer">
                      <span data-lang-token>{source.label}</span>
                      <span aria-hidden="true">↗</span>
                    </a>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          <footer className="article-reader-footer">
            <div>
              {displayedArticle.tags.map((tag) => <span data-lang-token key={tag}>#{tag}</span>)}
            </div>
            <a href={returnHref}><span data-lang-token>{returnLabel}</span> <span aria-hidden="true">↗</span></a>
          </footer>
        </article>
      )}
      <ImageLightbox
        images={preview?.images ?? []}
        activeIndex={preview?.activeIndex ?? null}
        onClose={() => setPreview(null)}
        onChange={(activeIndex) => setPreview((current) => current
          ? { ...current, activeIndex }
          : current)}
        labels={language === "zh"
          ? { dialog: "图片预览", openOriginal: "打开原图 ↗", close: "关闭图片预览", previous: "上一张图片", next: "下一张图片" }
          : { dialog: "Image preview", openOriginal: "OPEN ORIGINAL ↗", close: "Close image preview", previous: "Previous image", next: "Next image" }}
      />
    </main>
  );
}
