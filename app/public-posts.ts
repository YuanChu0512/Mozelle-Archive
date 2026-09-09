import type { Article } from "./article-data";

export function toCatalogArticle(article: Article): Article {
  return {
    id: article.id, slug: article.slug, contentType: article.contentType,
    category: article.category, code: article.code, date: article.date,
    readTime: article.readTime, title: article.title, summary: article.summary,
    tags: article.tags, content: [], coverUrl: article.coverUrl, gallery: article.gallery,
    translations: article.translations?.en ? { en: {
      title: article.translations.en.title, summary: article.translations.en.summary,
      tags: article.translations.en.tags,
    } } : {},
  };
}

export async function loadManagedPublicPosts(): Promise<Article[] | null> {
  const apiOrigin = process.env.API_INTERNAL_ORIGIN?.replace(/\/$/, "");
  if (!apiOrigin) return null;

  try {
    const response = await fetch(`${apiOrigin}/api/catalog`, {
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const payload = await response.json() as { posts?: Article[] };
    return Array.isArray(payload.posts) ? payload.posts : [];
  } catch {
    return null;
  }
}
