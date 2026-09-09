"use client";

/* eslint-disable @next/next/no-html-link-for-pages */

import { useEffect, useMemo, useState } from "react";
import { fallbackArticles, type Article } from "../../article-data";
import AmbientEffects from "../../ambient-effects";
import ImageLightbox, { type LightboxImage } from "../../image-lightbox";
import { articleCopy, localizeArticle } from "../../i18n";
import { LanguageReassembly, useLanguageSwitcher } from "../../language-switcher";
import { LiquidGlassLens, useLiquidGlassTracking } from "../../liquid-glass";
import { previewMediaUrl } from "../../media-utils";
import { ThemeTransition, useThemeTransition, type Theme } from "../../theme-transition";

type CompatibleArticle = Omit<Article, "contentType" | "gallery"> & {
  contentType?: Article["contentType"];
  gallery?: Article["gallery"];
};

type PreviewState = {
  images: LightboxImage[];
  activeIndex: number;
};

function matchesCollection(article: Pick<CompatibleArticle, "id" | "slug">, id: string) {
  return article.id === id || article.slug === id;
}

function normalizeArticle(article: CompatibleArticle): Article {
  return {
    ...article,
    contentType: article.contentType ?? "article",
    gallery: Array.isArray(article.gallery) ? article.gallery : undefined,
  };
}

export default function CollectionReader({ collectionId }: { collectionId: string }) {
  const fallback = fallbackArticles.find((item) => matchesCollection(item, collectionId) && item.contentType === "collection") ?? null;
  const [collection, setCollection] = useState<Article | null>(fallback);
  const [status, setStatus] = useState<"loading" | "ready" | "missing">("loading");
  const [theme, setTheme] = useState<Theme>("day");
  const { transitioning, transitionTarget, toggleTheme } = useThemeTransition(theme, setTheme);
  const { language, switching: languageSwitching, targetLanguage, toggleLanguage } = useLanguageSwitcher();
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const copy = articleCopy[language];
  useLiquidGlassTracking();

  const displayedCollection = useMemo(
    () => collection ? localizeArticle(collection, language) : null,
    [collection, language],
  );
  const gallery = useMemo<LightboxImage[]>(
    () => (displayedCollection?.gallery ?? []).map((item) => ({
      src: item.src,
      alt: item.alt,
      caption: item.caption,
    })),
    [displayedCollection?.gallery],
  );

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
    fetch(`/api/posts/${encodeURIComponent(collectionId)}`, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    })
      .then((response) => {
        if (response.status === 404 && response.headers.get("content-type")?.includes("application/json")) return { post: null };
        if (!response.ok) throw new Error("收藏服务暂不可用");
        return response.json() as Promise<{ post?: CompatibleArticle | null }>;
      })
      .then((payload) => {
        const matched = payload.post?.contentType === "collection" ? payload.post : null;
        if (!matched) {
          setCollection(null);
          setStatus("missing");
          return;
        }
        setCollection(normalizeArticle(matched));
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStatus(fallback ? "ready" : "missing");
      });
    return () => controller.abort();
  }, [collectionId, fallback]);

  return (
    <main
      className={`site-shell article-page-shell collection-page-shell theme-${theme} ${transitioning ? "is-switching" : ""} ${languageSwitching ? "is-language-switching" : ""}`}
      data-language={language}
    >
      <AmbientEffects />
      <LanguageReassembly active={languageSwitching} target={targetLanguage} />
      <ThemeTransition active={transitioning} target={transitionTarget} />
      <span className="article-reading-progress" aria-hidden="true" />
      <header className="article-site-header liquid-glass liquid-glass--regular" data-liquid-glass>
        <LiquidGlassLens />
        <a className="brand" href="/" aria-label={copy.homeLabel}>
          <span className="brand-mark" aria-hidden="true"><span /></span>
          <span className="brand-copy">
            <strong>Mozelle Archive</strong>
            <small>{"// COLLECTION"}</small>
          </span>
        </a>
        <span className="article-header-code">{displayedCollection?.code ?? "COLLECTION / LOADING"}</span>
        <div className="article-header-actions">
          <a href="/#collection" aria-label={copy.back}>
            <span className="article-back-full" data-lang-token>{language === "zh" ? "返回次元收藏" : "Back to collections"}</span>
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
          <span>COLLECTION / SYNCING</span>
          <h1 data-lang-token>{language === "zh" ? "正在整理影像记录" : "Loading the visual record"}</h1>
          <div className="article-state-line" />
        </section>
      )}

      {status === "missing" && (
        <section className="article-state">
          <span>COLLECTION / 404</span>
          <h1 data-lang-token>{language === "zh" ? "这份收藏暂时找不到" : "This collection could not be found"}</h1>
          <p data-lang-token>{language === "zh" ? "它可能尚未公开，或已经更换了地址。" : "It may not be public yet, or its address may have changed."}</p>
          <a href="/#collection"><span data-lang-token>{language === "zh" ? "返回次元收藏" : "Back to collections"}</span> →</a>
        </section>
      )}

      {status === "ready" && displayedCollection && (
        <article className="collection-reader">
          <header className="collection-reader-hero">
            <div className="article-reader-meta">
              <span>{displayedCollection.code}</span>
              <span data-lang-token>{language === "zh" ? "影像记录" : "VISUAL DIARY"}</span>
              <span>{displayedCollection.date}</span>
            </div>
            <h1 data-lang-token>{displayedCollection.title}</h1>
            <p data-lang-token>{displayedCollection.summary}</p>
            <div className="article-reader-signal" aria-hidden="true"><span /><span /><span /></div>
          </header>

          {gallery.length ? (
            <section className="collection-reader-gallery" aria-label={language === "zh" ? "照片图集" : "Photo gallery"}>
              {gallery.map((image, index) => (
                <figure key={image.src} className={index === 0 ? "is-featured" : undefined}>
                  <button
                    className="image-preview-button"
                    type="button"
                    onClick={() => setPreview({ images: gallery, activeIndex: index })}
                    aria-label={`${language === "zh" ? "预览原图" : "Preview original"}: ${image.alt}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={previewMediaUrl(image.src)} alt={image.alt} loading={index === 0 ? "eager" : "lazy"} decoding="async" />
                    <span className="collection-reader-image-index">{String(index + 1).padStart(2, "0")}</span>
                  </button>
                  {image.caption ? <figcaption data-lang-token>{image.caption}</figcaption> : null}
                </figure>
              ))}
            </section>
          ) : null}

          <section className="collection-reader-story" aria-labelledby="collection-story-title">
            <div className="article-section-label">
              <span>MEMORY / TEXT</span>
              <h2 id="collection-story-title" data-lang-token>{language === "zh" ? "关于这次相遇" : "About This Meeting"}</h2>
            </div>
            {displayedCollection.contentHtml ? (
              <div className="article-rich-content" dangerouslySetInnerHTML={{ __html: displayedCollection.contentHtml }} />
            ) : (
              <div className="collection-reader-prose">
                {displayedCollection.content.map((block, index) => (
                  <p data-lang-token key={`${index}-${block}`}>{block}</p>
                ))}
              </div>
            )}
          </section>

          <footer className="article-reader-footer collection-reader-footer">
            <div>{displayedCollection.tags.map((tag) => <span data-lang-token key={tag}>#{tag}</span>)}</div>
            <a href="/#collection"><span data-lang-token>{language === "zh" ? "继续查看次元收藏" : "Explore more collections"}</span> <span aria-hidden="true">↗</span></a>
          </footer>
        </article>
      )}

      <ImageLightbox
        images={preview?.images ?? []}
        activeIndex={preview?.activeIndex ?? null}
        onClose={() => setPreview(null)}
        onChange={(activeIndex) => setPreview((current) => current ? { ...current, activeIndex } : current)}
        labels={language === "zh"
          ? { dialog: "图片预览", openOriginal: "打开原图 ↗", close: "关闭图片预览", previous: "上一张图片", next: "下一张图片" }
          : { dialog: "Image preview", openOriginal: "OPEN ORIGINAL ↗", close: "Close image preview", previous: "Previous image", next: "Next image" }}
      />
    </main>
  );
}
